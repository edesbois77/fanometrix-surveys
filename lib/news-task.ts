// News Coverage tasks — how a News acquisition task is identified.
//
// A News task is an evidence-acquisition task with the SAME lifecycle as a
// Conversation Search: strategy → task → collection → normalisation →
// classification → evidence review → Analysis. It therefore reuses the same
// record (social_searches) and the same pipeline, and gains the append-only
// base, the observation ledger, the approval watermark and the delta-review loop
// without any of them being rebuilt.
//
// What distinguishes it is the MEDIUM: what is being collected and how it may be
// read. That is stored as a marker inside search_strategy (jsonb), exactly as
// design_origin already is, so identifying a News task needs no schema change
// and no migration. The alternative — a first-class column — would be tidier and
// is the right move if News later needs to be queried at scale; it is not worth a
// migration to a hand-migrated production database for a marker read a handful of
// times per project.
//
// Client- and server-safe: pure types + helpers, no I/O.
import type { SearchStrategy } from "@/lib/search-strategy";
import type { ResearchDesign, EvidenceRequirement } from "@/lib/research-design";
import type { EvidenceRole } from "@/lib/evidence-role";

export type EvidenceMedium = "conversation" | "news";

/** The stored strategy plus the fields Fanometrix adds around it. */
export type MarkedStrategy = SearchStrategy & {
  medium?: EvidenceMedium;
  design_origin?: { origin_key?: string; requirement?: string; role?: string; aspect?: string | null; requirement_index?: number };
};

/** The connector/platform a News task collects with. */
export const NEWS_PLATFORM = "News";

/** Absence of a marker means conversation: every task created before News
 *  existed is a Conversation Search, and must keep reading as one. */
export function evidenceMedium(strategy: unknown): EvidenceMedium {
  const m = (strategy as MarkedStrategy | null)?.medium;
  return m === "news" ? "news" : "conversation";
}

export const isNewsTask = (strategy: unknown): boolean => evidenceMedium(strategy) === "news";

// ── What News tasks a design calls for ───────────────────────────────────────
// Pure and client-safe, so the Evidence Strategy screen can show exactly what
// approval will create — and, just as importantly, what it will NOT create and
// why — before anything is generated. The server generator consumes the same
// function, so the screen can never promise work the generator would skip.

export type PlannedNewsTask = {
  requirement_index: number;
  requirement: EvidenceRequirement;
  role: EvidenceRole;
  /** The grounded anchor: the client for direct, a declared comparator for
   *  comparative, null for strategic. */
  anchor: string | null;
  name: string;
  intent: string;
  /** Why the design recommended News for this requirement, in its own words. */
  why_news: string;
};

export type SkippedNewsTask = { name: string; reason: string };

/** A stable identity, namespaced so a News task and a Conversation Search born
 *  of the same requirement can never reconcile onto each other. */
export const newsOriginKey = (p: PlannedNewsTask): string =>
  `news:${p.requirement_index}:${p.anchor?.trim().toLowerCase() || "topic"}`;

/**
 * The News tasks this design calls for.
 *
 * `subject` is the project's brand name. Without it, direct News coverage has
 * nothing grounded to anchor on and is SKIPPED with that reason — never guessed
 * at by reading a name out of the requirement's prose.
 */
export function planNewsTasks(design: ResearchDesign | null | undefined, subject: string | null): {
  planned: PlannedNewsTask[];
  skipped: SkippedNewsTask[];
} {
  const planned: PlannedNewsTask[] = [];
  const skipped: SkippedNewsTask[] = [];

  (design?.requirements ?? []).forEach((req, requirement_index) => {
    const label = req.aspect ? `News Coverage, ${req.aspect}` : `News Coverage, requirement ${requirement_index + 1}`;

    const news = (req.evidence_strategy?.recommended_methods ?? []).find(m => m.method === "news");
    if (!news) { skipped.push({ name: label, reason: "News Coverage is not a recommended method for this requirement." }); return; }
    if (news.fit === "not_suitable") { skipped.push({ name: label, reason: "News Coverage was judged not suitable for this requirement." }); return; }
    if (req.expected_availability === "none") { skipped.push({ name: label, reason: "The design expects no evidence to exist for this requirement." }); return; }

    const why = news.rationale ?? "";

    if (req.role === "direct") {
      if (!subject?.trim()) {
        skipped.push({ name: label, reason: "The project has no brand recorded, so direct coverage has nothing to anchor on." }); return;
      }
      planned.push({
        requirement_index, requirement: req, role: "direct", anchor: subject.trim(),
        name: `${subject.trim()} — News Coverage`, intent: req.requirement, why_news: why,
      });
      return;
    }

    if (req.role === "comparative") {
      const comparators = (req.evidence_strategy?.comparators ?? []).filter(c => c.name?.trim());
      if (!comparators.length) {
        skipped.push({ name: label, reason: "No comparator was declared for this requirement, so there is nothing to benchmark against." }); return;
      }
      for (const c of comparators) {
        planned.push({
          requirement_index, requirement: req, role: "comparative", anchor: c.name.trim(),
          name: `${c.name.trim()} — News Coverage`,
          intent: `${req.requirement} Benchmark against ${c.name.trim()}: ${c.why}`,
          why_news: why,
        });
      }
      return;
    }

    planned.push({
      requirement_index, requirement: req, role: "strategic", anchor: null,
      name: `${req.aspect ?? "Market"} — News Coverage`, intent: req.requirement, why_news: why,
    });
  });

  return { planned, skipped };
}

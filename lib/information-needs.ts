// Information Needs — the platform-level, source-agnostic unit of research
// (docs/conversation-advisor.md, docs/research-methodology.md). An Information
// Need is an answerable sub-question about the world; a Research Theme groups
// needs under a Research Aspect (the durable organising unit shared with
// Analysis). NOTHING here is Conversation-Intelligence-specific: Survey
// Research, the Research Library and future intelligence products all consume
// this same shape.
//
// Ownership today is the Conversation Advisor (stored on social_searches), but
// this module deliberately carries NO knowledge of that storage. Read needs
// through resolveInformationNeeds (lib/research-sources/information-needs.ts),
// never by reaching into a search row — so when needs move to a project-level,
// versioned, approved Research Design, only the resolver changes.
//
// Client- and server-safe: pure types + pure helpers, no I/O.

// ── Method fit (a per-method assessment of a shared need) ─────────────────────
// NOTE: method_fit is one method's VERDICT on a need, not an intrinsic property
// of the need. The durable core of a need is { aspect, need } (+ a stable id in
// future); method_fit/rationale are an assessment that becomes per-method when
// multiple specialists weigh the same shared need.
export type MethodFit = "primary" | "supporting" | "conditional" | "not_suitable";

export const METHOD_FIT_LABEL: Record<MethodFit, string> = {
  primary:      "Primary method",
  supporting:   "Supporting",
  conditional:  "Conditional",
  not_suitable: "Not suitable",
};

// Badge tone for a method-fit verdict — values are workspace StatusBadge `Tone`s.
export const METHOD_FIT_TONE: Record<MethodFit, "success" | "neutral" | "warning" | "info"> = {
  primary: "success", supporting: "info", conditional: "warning", not_suitable: "neutral",
};

// ── Structure ─────────────────────────────────────────────────────────────────
export type InformationNeed = {
  /** Stable identity. An Information Need is a core domain object: it sits
   *  between a Research Requirement and the Findings that answer it, and a
   *  Finding anchors to it (docs/intelligence-model.md §4 Layer 1). Anchoring on
   *  text would mean a finding losing its question the moment the question was
   *  reworded, which is the failure researcher notes already had when they were
   *  keyed to finding text.
   *
   *  SEEDED from the need's text on first sight, then PERSISTED and never
   *  recomputed. The seed means code and stored data agree about legacy needs
   *  without a backfill; persistence means a later re-wording keeps the id. */
  id: string;
  need: string;          // an answerable sub-question about the world
  method_fit: MethodFit;
  rationale: string;     // why this method can (or can't) answer it
};

// A Research Theme is a Research Aspect surfaced at the front of a briefing.
export type ResearchTheme = {
  aspect: string;        // short Title Case — the durable organising unit
  description: string;
  needs: InformationNeed[];
};

export type InformationNeeds = { themes: ResearchTheme[] };

// The flat shape consumers judge/collect against (e.g. the conversation
// relevance classifier). The single neutral consumer contract.
//
// `method_fit` used to be dropped here, and both task generators then hardcoded
// "primary" when rebuilding needs, so a design that had carefully reasoned about
// what each method could do handed every source the same undifferentiated list
// (docs/evidence-contribution.md §1). It is carried now: it is a real verdict
// about whether this method can answer this need, and admissibility is entitled
// to know it.
export type FlatNeed = {
  id: string;
  aspect: string;
  need: string;
  method_fit: MethodFit;
  /** The requirement this question serves, as the theme records it. A Finding is
   *  anchored to exactly one requirement, so the anchor has to travel with the
   *  question rather than be looked up from a position in an array. */
  requirement: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// Every need across all themes (e.g. for counts).
export function allNeeds(needs: InformationNeeds): InformationNeed[] {
  return needs.themes.flatMap(t => t.needs);
}

// Flatten to the neutral {aspect, need} pairs, dropping empties. Accepts a
// loosely-typed object so it tolerates jsonb read straight from storage.
export function flattenNeeds(
  needs: { themes?: { aspect?: string; description?: string; needs?: { id?: string; need?: string; method_fit?: string }[] }[] } | null | undefined,
): FlatNeed[] {
  const out: FlatNeed[] = [];
  for (const t of needs?.themes ?? []) {
    const aspect = (t.aspect ?? "").trim();
    const requirement = (t.description ?? "").trim() || aspect;
    for (const n of t.needs ?? []) {
      const need = (n.need ?? "").trim();
      if (!aspect || !need) continue;
      out.push({
        // A need read from storage before ids existed is seeded from its text,
        // so a legacy row and freshly written code agree on its identity without
        // a backfill having to run first.
        id: n.id?.trim() || needIdFor(aspect, need),
        aspect,
        need,
        method_fit: asMethodFit(n.method_fit),
        requirement,
      });
    }
  }
  return out;
}

// ── Identity ─────────────────────────────────────────────────────────────────

const METHOD_FITS: MethodFit[] = ["primary", "supporting", "conditional", "not_suitable"];

/** Unknown or missing fit reads as `conditional` rather than `primary`. Where we
 *  do not know whether a method can answer a need, assuming it can is the
 *  assumption that produced the failure this field exists to prevent. */
export function asMethodFit(v: unknown): MethodFit {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (METHOD_FITS as string[]).includes(s) ? (s as MethodFit) : "conditional";
}

/** A deterministic seed id for a need, seen for the first time.
 *
 *  Pure and dependency-free so it runs identically on client and server. Once
 *  written, an id is never recomputed: `withNeedIds` preserves whatever is
 *  already there, so a need's identity survives its text being rewritten. */
export function needIdFor(aspect: string, need: string): string {
  const key = `${aspect.trim().toLowerCase()}|${need.trim().toLowerCase()}`;
  // FNV-1a, two rounds with different offsets, for a wider space than a single
  // 32-bit pass gives. Ids are compared, never ordered or decoded.
  const fnv = (seed: number): number => {
    let h = seed;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  };
  const a = fnv(0x811c9dc5).toString(36).padStart(7, "0");
  const b = fnv(0x9e3779b9).toString(36).padStart(7, "0");
  return `need_${a}${b}`;
}

/** Ensure every need carries an id, without ever changing one that exists.
 *  Idempotent: applying it twice is the same as applying it once, which is what
 *  makes it safe on every read. */
export function withNeedIds(needs: InformationNeeds): InformationNeeds {
  return {
    themes: needs.themes.map(theme => ({
      ...theme,
      needs: theme.needs.map(n => (n.id?.trim() ? n : { ...n, id: needIdFor(theme.aspect, n.need) })),
    })),
  };
}

// ── Survey Studio — Segment resolution (impure: reads governed responses) ────
// Builds per-COUNTRY question distributions from the SAME governed rows the historical
// Study Results use (responses, is_demo=false) — so segment bases reconcile with the
// question base by construction. Country is a study-level dimension (pooled across the
// study's surveys). Only comparable ("combined") questions are segmented; only historical
// surveys carry response-level country today (studio_native → no segments, graceful).
//
// Publisher is deliberately NOT segmented: in the real data it is heavily skewed to one
// partner, and publisher is a collection channel, not an audience characteristic — treating
// it as an audience cut would invite unsafe/causal reads. (Documented; can be revisited.)

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { StudyResultGroup } from "@/lib/studio/study-results";
import type { OptionResult } from "@/lib/studio/survey-results";
import type { SegmentQuestion, SegmentGroupDist } from "@/lib/studio/study-segments";

// Human-readable, audience-safe country labels ("respondents in <label>").
function countryLabel(raw: string): string {
  const c = raw.trim();
  if (/^united kingdom$/i.test(c) || /^uk$/i.test(c)) return "the UK";
  if (/^united states$/i.test(c) || /^usa?$/i.test(c)) return "the US";
  return c;
}

type Row = Record<string, unknown>;

/**
 * Resolve per-country SegmentQuestion[] for a study. Bounded (reads the study's response
 * rows once per survey), deterministic aggregation, base-reconciling. Returns [] on any
 * error or when no comparable question has ≥1 usable country breakdown.
 */
export async function resolveStudySegments(
  surveys: { surveyId: string }[],
  resultGroups: StudyResultGroup[],
): Promise<SegmentQuestion[]> {
  try {
    // Only comparable questions are segmentable (non-comparable → blocked).
    const groups = resultGroups.filter((g) => g.comparability === "combined" && g.combined);
    if (!groups.length) return [];

    // The widest question index we must read (q1..qN) across all sources.
    const maxIndex = Math.max(0, ...groups.flatMap((g) => g.sources.map((s) => s.questionIndex)));
    const cols = Array.from({ length: maxIndex + 1 }, (_, i) => `q${i + 1}`);

    // Read each survey's governed rows once (bounded; historical q-columns + country).
    const rowsBySurvey = new Map<string, Row[]>();
    for (const s of surveys) {
      const { data } = await supabaseAdmin
        .from("responses").select(`${cols.join(",")},country`)
        .eq("survey_id", s.surveyId).eq("is_demo", false);
      rowsBySurvey.set(s.surveyId, (data ?? []) as unknown as Row[]);
    }
    if (![...rowsBySurvey.values()].some((r) => r.length)) return [];

    const out: SegmentQuestion[] = [];
    for (const g of groups) {
      const optionIds = g.combined!.options.map((o) => String(o.optionId));
      const labelOf = new Map(g.combined!.options.map((o) => [String(o.optionId), o.label]));
      // country → optionId → count (pooled across surveys)
      const byCountry = new Map<string, Map<string, number>>();
      for (const src of g.sources) {
        const rows = rowsBySurvey.get(src.surveyId) ?? [];
        const col = `q${src.questionIndex + 1}`;
        for (const r of rows) {
          const rawCountry = r["country"];
          if (typeof rawCountry !== "string" || !rawCountry.trim()) continue; // no country → excluded, never fabricated
          const ans = r[col];
          if (ans == null || ans === "") continue;
          const oid = String(ans);
          if (!labelOf.has(oid)) continue; // answer outside the governed option set → skip
          const label = countryLabel(rawCountry);
          if (!byCountry.has(label)) byCountry.set(label, new Map());
          const m = byCountry.get(label)!;
          m.set(oid, (m.get(oid) ?? 0) + 1);
        }
      }
      if (byCountry.size === 0) continue;

      const segGroups: SegmentGroupDist[] = [...byCountry.entries()].map(([label, counts]) => {
        const base = [...counts.values()].reduce((a, b) => a + b, 0);
        const options: OptionResult[] = optionIds.map((oid) => {
          const count = counts.get(oid) ?? 0;
          return { optionId: oid, label: labelOf.get(oid) ?? oid, count, percentage: base > 0 ? count / base : null };
        });
        return { key: label, label, base, options };
      }).sort((a, b) => a.label.localeCompare(b.label));

      out.push({
        canonicalQuestionKey: g.canonicalQuestionKey,
        question: g.label,
        dimension: "country",
        overall: g.combined!.options.map((o) => ({ optionId: String(o.optionId), label: o.label, count: o.count, percentage: o.percentage })),
        overallBase: g.combined!.base,
        groups: segGroups,
      });
    }
    return out;
  } catch {
    return []; // segmentation is additive — never fail the analysis over it
  }
}

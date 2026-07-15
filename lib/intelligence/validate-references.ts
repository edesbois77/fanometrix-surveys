// Every analyst that asks the model to tag a recommendation with the
// finding/driver/concern indices that justify it (analyseSurvey.ts,
// analyseConversation.ts, analyseExecutiveReport.ts) faces the same risk:
// the model can return an index that doesn't exist (hallucinated, off by
// one, or referencing a list it miscounted). An invalid reference is worse
// than no reference — it looks like evidence but points at nothing — so
// it must never reach storage or the screen. Pure, server- and
// client-safe (no framework or Supabase dependency), applied once per
// analyst right after completeJSON() returns, before the result is
// returned to the caller for persistence.
export function clampReferences(indices: number[] | undefined | null, length: number): number[] {
  if (!indices) return [];
  return [...new Set(indices)]
    .filter(i => Number.isInteger(i) && i >= 0 && i < length)
    .sort((a, b) => a - b);
}

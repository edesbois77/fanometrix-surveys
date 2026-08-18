// ── Studio campaign lifecycle: undo-go-live + Stop/Reopen rules ──────────────
// The small, shared rules governing (a) undoing an accidental go-live and (b) the
// Ended/Reopen controls. Pure and framework-free so the CLIENT (which decides
// whether to SHOW "Return to Draft" on a just-Live campaign) and the SERVER (which
// ATOMICALLY enforces it) agree on exactly ONE definition — the button can never
// promise something the server then refuses for a different reason.
//
// Model (settled with the user):
//   • A campaign that goes Live may be returned to Draft for a short GRACE window
//     (an "undo" for an accidental go-live). status_updated_at is the go-live
//     instant (Deploy sets it when it flips a campaign Live).
//   • After the window it is locked — it runs until its end date / target, OR it
//     is ended explicitly with "Stop collecting" (→ closed / "Ended").
//   • Ending is REVERSIBLE: an Ended campaign can be Reopened to Draft (and
//     re-deployed). This guarantees a run can ALWAYS be ended even with no end
//     date and no target.

/** How long after go-live a campaign may still be undone back to Draft. 2 minutes. */
export const GO_LIVE_UNDO_GRACE_MS = 2 * 60 * 1000;

/**
 * True when a stored-Live campaign is still inside the go-live undo window.
 * `goLiveAtISO` is campaigns.status_updated_at (the instant Deploy set it Live).
 * `nowMs` is the caller's clock (client tick or server Date.now) — passed in so
 * this stays pure/testable and render-safe.
 */
export function isWithinGoLiveUndoGrace(
  status: string,
  goLiveAtISO: string | null | undefined,
  nowMs: number,
): boolean {
  if (status !== "live" || !goLiveAtISO) return false;
  const t = Date.parse(goLiveAtISO);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < GO_LIVE_UNDO_GRACE_MS;
}

/** The ISO cutoff for the SERVER's atomic guard: a Live campaign whose
 *  status_updated_at is STRICTLY GREATER than this went Live within the window.
 *  Used as `.gt("status_updated_at", goLiveUndoCutoffISO(now))`. */
export function goLiveUndoCutoffISO(now: Date): string {
  return new Date(now.getTime() - GO_LIVE_UNDO_GRACE_MS).toISOString();
}

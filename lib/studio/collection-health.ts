// ── Survey Studio — operational collection health (pure) ─────────────────────
// The factual, question-count-agnostic operational model behind Home (cross-
// research) and Manage → Survey (single-survey health). Pure and unit-tested; it
// consumes already-resolved counts (never a DB, never raw events, never question
// structure). Full-survey completion is SURVEY_COMPLETED / a completed `responses`
// row — NEVER a q1/q2/q3 assumption.
//
// Governed target semantics (settled): a Campaign target is a progress GOAL
// regardless of target_mode; `stop` additionally makes it an enforced ceiling
// (auto-close via lib/campaign-status). So a target contributes to planned
// progress by its PRESENCE, not its mode.

import type { CampaignStatus } from "@/lib/campaign-status";

// ── Planned progress (target rules A–E) ──────────────────────────────────────
export type CampaignProgressRow = {
  target_responses: number | null;
  response_count: number;
};

export type PlannedProgress = {
  /** True when at least one campaign carries a target. */
  hasTarget: boolean;
  /** Σ target_responses over TARGETED campaigns (the only valid denominator). */
  targetTotal: number;
  /** Σ responses over TARGETED campaigns (the numerator for planned progress). */
  completedTowardTarget: number;
  /** Σ responses over UNTARGETED campaigns — shown separately, never given a denominator. */
  untargetedResponses: number;
  /** Σ responses over all campaigns. */
  totalResponses: number;
  /** completedTowardTarget ÷ targetTotal, or null when nothing is targeted (no bar).
   *  May exceed 1 (continue-mode overachievement is shown, never clamped). */
  progressRatio: number | null;
  /** True when the targeted subset has met its aggregate goal. */
  targetReached: boolean;
};

const int = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function plannedProgress(campaigns: CampaignProgressRow[]): PlannedProgress {
  let targetTotal = 0, completedTowardTarget = 0, untargetedResponses = 0, totalResponses = 0, hasTarget = false;
  for (const c of campaigns) {
    const resp = int(c.response_count);
    totalResponses += resp;
    if (c.target_responses != null && c.target_responses > 0) {
      hasTarget = true;
      targetTotal += c.target_responses;
      completedTowardTarget += resp;
    } else {
      untargetedResponses += resp;
    }
  }
  const progressRatio = hasTarget && targetTotal > 0 ? completedTowardTarget / targetTotal : null;
  const targetReached = hasTarget && targetTotal > 0 && completedTowardTarget >= targetTotal;
  return { hasTarget, targetTotal, completedTowardTarget, untargetedResponses, totalResponses, progressRatio, targetReached };
}

// ── Survey lifecycle (factual only — NO inferred "slowing/attention") ────────
export type SurveyLifecycle = "draft" | "scheduled" | "live" | "collecting" | "target_reached" | "closed";

export const LIFECYCLE_LABEL: Record<SurveyLifecycle, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  collecting: "Collecting",
  target_reached: "Target reached",
  closed: "Closed",
};

/**
 * The survey's factual lifecycle, derived only from its campaigns' EFFECTIVE
 * statuses (computeStatusWithReason), total responses, and whether the targeted
 * subset met its goal. Live takes precedence over target_reached so a continue-mode
 * survey that has passed its goal is still "collecting" (its campaigns remain live);
 * a stop-mode survey that hits its ceiling auto-closes, so its campaigns are no
 * longer live → "target_reached".
 */
export function surveyLifecycleState(input: {
  effectiveStatuses: CampaignStatus[];
  totalResponses: number;
  targetReached: boolean;
}): SurveyLifecycle {
  const s = input.effectiveStatuses;
  if (s.some((x) => x === "live")) return input.totalResponses > 0 ? "collecting" : "live";
  if (s.some((x) => x === "scheduled")) return "scheduled";
  if (input.targetReached) return "target_reached";
  if (s.length === 0 || s.every((x) => x === "draft")) return "draft";
  return "closed"; // has campaigns, none live/scheduled (closed/paused/archived)
}

// ── Funnel (canonical event types only) ──────────────────────────────────────
export type FunnelCounts = { loads: number; viewable: number; started: number; completed: number };

/** Map governed dashboard_event_counts rows to the funnel by CANONICAL event type.
 *  Never derives completion from q1/q2/q3. Unknown types are ignored. */
export function mapFunnelCounts(rows: { event_type: string; event_count: number }[]): FunnelCounts {
  const by = new Map(rows.map((r) => [r.event_type, int(r.event_count)]));
  return {
    loads: by.get("SURVEY_RENDER") ?? 0,
    viewable: by.get("SURVEY_VISIBLE") ?? 0,
    started: by.get("SURVEY_START") ?? 0,
    completed: by.get("SURVEY_COMPLETED") ?? 0,
  };
}

export type FunnelStage = { key: keyof FunnelCounts; label: string; count: number; ofLoads: number | null };

/** Ordered funnel stages with each stage's share of Loads (0..1, null when 0 loads). */
export function funnelStages(f: FunnelCounts): FunnelStage[] {
  const base = f.loads;
  const share = (n: number) => (base > 0 ? n / base : null);
  return [
    { key: "loads", label: "Loads", count: f.loads, ofLoads: base > 0 ? 1 : null },
    { key: "viewable", label: "Viewable", count: f.viewable, ofLoads: share(f.viewable) },
    { key: "started", label: "Started", count: f.started, ofLoads: share(f.started) },
    { key: "completed", label: "Completed", count: f.completed, ofLoads: share(f.completed) },
  ];
}

// ── Factual recency (pure; caller supplies `nowMs`, never Date.now in render) ─
export function relativeResponseLabel(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  return `${w} week${w === 1 ? "" : "s"} ago`;
}

// ── Access (OPERATIONAL OWNERSHIP — never data entitlement) ──────────────────
// Home and Manage are OPERATIONAL surfaces gated by survey OWNERSHIP
// (surveys.organisation_id), admin bypass. Data ENTITLEMENT (the `data` authority)
// governs Discover only and must NOT broaden Home/Manage: a commissioning client
// may be data-entitled yet must not Manage/Home the survey, and a distribution
// publisher (publisher_org_id) owns nothing here.
export function canManageSurvey(
  principal: { role: string; organisationId: string | null },
  survey: { organisation_id: string | null },
): boolean {
  if (principal.role === "admin") return true; // operator/governed path (unchanged)
  return !!principal.organisationId && survey.organisation_id === principal.organisationId;
}

/** A real (non-simulated) survey — demo/simulated research is excluded from operational surfaces. */
export function isRealSurvey(survey: { is_simulated?: boolean | null }): boolean {
  return survey.is_simulated !== true;
}

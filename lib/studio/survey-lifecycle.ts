// ── Survey Studio — survey management lifecycle (pure) ───────────────────────
// The management-surface view of a survey's state. It layers the persisted
// survey status (draft/ready/archived/deleted — the only 4 values the DB allows)
// over the campaign-derived OPERATIONAL lifecycle (surveyLifecycleState), and
// derives the research-definition LOCK and the available lifecycle ACTIONS.
//
// It re-uses the existing model — it does NOT invent new persisted statuses and
// does NOT introduce a second entitlement system. Ownership/role authority stays
// in canManageSurvey / requireUser; the deletion decision stays in
// lib/studio/survey-deletion.ts. This module is DB-free and unit-tested.

import type { SurveyLifecycle } from "./collection-health";

// The effective lifecycle shown on the management surface. Persisted terminal
// states (archived / deleted) sit above the derived operational lifecycle; the
// operational states come straight from surveyLifecycleState.
export type EffectiveLifecycle =
  | "draft" | "ready" | "scheduled" | "live" | "collecting" | "target_reached" | "closed" | "archived" | "deleted";

export const EFFECTIVE_LABEL: Record<EffectiveLifecycle, string> = {
  draft: "Draft", ready: "Ready", scheduled: "Scheduled", live: "Live",
  collecting: "Collecting", target_reached: "Target reached", closed: "Closed",
  archived: "Archived", deleted: "Deleted",
};

// Presentational tone per state (plain union so this module never imports the UI).
export type LifecycleTone = "neutral" | "info" | "success" | "accent" | "warning";
export const EFFECTIVE_TONE: Record<EffectiveLifecycle, LifecycleTone> = {
  draft: "neutral", ready: "info", scheduled: "info", live: "success",
  collecting: "success", target_reached: "accent", closed: "neutral",
  archived: "warning", deleted: "neutral",
};

export type SurveyStateInput = {
  /** surveys.status — draft | ready | archived | deleted */
  persistedStatus: string;
  /** campaign-derived operational lifecycle (surveyLifecycleState) */
  operationalLifecycle: SurveyLifecycle;
  /** any campaign in a genuinely live effective status */
  hasLiveCampaign: boolean;
  /** any collected evidence — events, responses, or answers */
  hasEvidence: boolean;
};

/**
 * The effective lifecycle. Persisted terminal states win (a survey the user
 * archived reads "Archived" whatever its campaigns say). Otherwise the campaign-
 * derived operational lifecycle is used when it signals activity; when the
 * operational state is the neutral "draft" (no campaigns / all draft), the
 * persisted draft/ready distinction is surfaced instead.
 */
export function effectiveLifecycle(input: SurveyStateInput): EffectiveLifecycle {
  if (input.persistedStatus === "deleted") return "deleted";
  if (input.persistedStatus === "archived") return "archived";
  const op = input.operationalLifecycle;
  if (op === "live" || op === "collecting" || op === "scheduled" || op === "target_reached" || op === "closed") return op;
  // op === "draft": no campaigns or all-draft campaigns — distinguish ready vs draft.
  return input.persistedStatus === "ready" ? "ready" : "draft";
}

// ── Research-definition lock ──────────────────────────────────────────────────
// The research definition (questions, options, type, order, wording in EVERY
// language, and the language set itself) is frozen once the survey is either
// collecting live OR already holds evidence. This protects the SEMANTIC integrity
// of the research even where the stored answers would remain technically valid.

export type ResearchLockInput = { hasEvidence: boolean; hasLiveCampaign: boolean };

export function researchDefinitionLocked(input: ResearchLockInput): boolean {
  return input.hasEvidence || input.hasLiveCampaign;
}

/** Human explanation of WHY the research definition is locked (null when open). */
export function researchLockReason(input: ResearchLockInput): string | null {
  if (input.hasLiveCampaign && input.hasEvidence)
    return "This survey is currently collecting responses. Its questions and answer options are locked to protect the research being gathered.";
  if (input.hasLiveCampaign)
    return "This survey is currently collecting responses. Its questions and answer options are locked while collection is running.";
  if (input.hasEvidence)
    return "This survey has collected responses. Its research definition is locked to protect the integrity of the existing results. You can still edit non-research metadata.";
  return null;
}

function normText(t: unknown): unknown {
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (typeof t === "object") {
    const rec = t as Record<string, unknown>;
    // Sort language keys so key ORDER never changes the signature; capture every
    // language's wording so a translation edit after collection is caught too.
    return Object.keys(rec).sort().map((k) => [k, typeof rec[k] === "string" ? rec[k] : String(rec[k] ?? "")]);
  }
  return String(t);
}

/**
 * Canonical signature of a survey's RESEARCH DEFINITION — everything that changes
 * what was (or is being) asked of respondents: per question in order its id, type,
 * and text in every language; per option in order its id and text in every
 * language; and the enabled-language set. Deliberately a SUPERSET of the old
 * structuralSignature (which captured only ids/order and excluded all text), so a
 * wording-only or option-label-only edit now changes the signature. Two surveys
 * with the same signature are research-equivalent; a differing signature is a
 * research-definition change and is rejected once the survey is locked.
 */
export function researchDefinitionSignature(questions: unknown, enabledLanguages?: unknown): string {
  const langs = Array.isArray(enabledLanguages) ? [...enabledLanguages].map(String).sort() : [];
  const qs = Array.isArray(questions)
    ? questions.map((q) => {
        const qq = (q ?? {}) as Record<string, unknown>;
        const opts = Array.isArray(qq.options)
          ? qq.options.map((o) => {
              if (o == null) return { id: null, text: "" };
              if (typeof o === "string") return { id: null, text: o };
              const oo = o as Record<string, unknown>;
              return { id: oo.id ?? null, text: normText(oo.text) };
            })
          : [];
        return { id: qq.id ?? null, type: qq.type ?? null, text: normText(qq.text), options: opts };
      })
    : [];
  return JSON.stringify({ langs, qs });
}

/**
 * True when the incoming research-definition edit is DISALLOWED: the survey is
 * locked AND the incoming definition differs from the stored one. Text-only,
 * option-label-only, type, order, add/remove all trip this once locked.
 */
export function researchDefinitionEditBlocked(args: {
  locked: boolean;
  storedQuestions: unknown;
  storedLanguages?: unknown;
  incomingQuestions: unknown;
  incomingLanguages?: unknown;
}): boolean {
  if (!args.locked) return false;
  return (
    researchDefinitionSignature(args.storedQuestions, args.storedLanguages) !==
    researchDefinitionSignature(args.incomingQuestions, args.incomingLanguages)
  );
}

export const RESEARCH_LOCK_ERROR =
  "This survey has already begun collecting research. Questions and answer options can no longer be changed. Duplicate the survey to create a new questionnaire.";

// ── Manage → Surveys LIST quick actions (pure) ───────────────────────────────
// The list shows ONE contextual primary action + a ••• overflow, derived from the
// light signals the list endpoint already returns (never four equal buttons). It is
// a projection of the lifecycle — the SERVER remains authoritative (delete guard,
// analysis base gate, research lock). `hasData` (completed responses > 0) is the
// list's show-gate for Analyse and the safety proxy for Delete; the exact analysis
// base gate and deletion decision are enforced server-side on the action.
export type SurveyListSignals = {
  status: string;            // persisted survey status
  liveCampaignCount: number;
  responseCount: number;     // completed responses — collected-research signal (state/delete), NOT analysis eligibility
  analysisEligible: boolean; // AUTHORITATIVE analysis eligibility (same rule as detail; NOT a response-count proxy)
  hasAnalysis: boolean;      // a completed analysis run exists
};
export type ListAction = "open" | "edit" | "analyse" | "regenerate" | "view-findings" | "archive" | "restore" | "delete";
export type SurveyListActions = {
  effective: EffectiveLifecycle;
  primary: ListAction | null;
  /** true when `primary === "analyse"` but the survey is not yet eligible — the
   *  action is shown DISABLED (with the endpoint's reason) to teach that Analysis
   *  unlocks as evidence accumulates. */
  primaryDisabled: boolean;
  overflow: ListAction[];
};

function listEffective(s: SurveyListSignals): EffectiveLifecycle {
  if (s.status === "deleted") return "deleted";
  if (s.status === "archived") return "archived";
  if (s.liveCampaignCount > 0) return s.responseCount > 0 ? "collecting" : "live";
  if (s.responseCount > 0) return "closed";
  return s.status === "ready" ? "ready" : "draft";
}

export function surveyListActions(s: SurveyListSignals): SurveyListActions {
  const effective = listEffective(s);
  const hasData = s.responseCount > 0;                 // has begun collecting completed research
  const live = s.liveCampaignCount > 0;
  const deletable = !hasData && !live && s.status !== "archived" && s.status !== "deleted";
  const secondary = (extra: ListAction[]): ListAction[] => [...extra, "open"];

  if (effective === "archived") return { effective, primary: "restore", primaryDisabled: false, overflow: ["open"] };

  // A completed analysis exists → the useful action is to CONSUME it; Regenerate is secondary.
  if (s.hasAnalysis) {
    return { effective, primary: "view-findings", primaryDisabled: false, overflow: secondary(live ? ["regenerate", "edit"] : ["regenerate", "archive"]) };
  }
  // Eligible (authoritative), no analysis yet → Analyse is the useful action.
  if (s.analysisEligible) {
    return { effective, primary: "analyse", primaryDisabled: false, overflow: secondary(live ? ["edit"] : ["archive"]) };
  }
  // Has begun collecting but not yet eligible → show Analyse DISABLED (teach that it
  // unlocks as evidence accumulates). No destructive action while live/data-bearing.
  if (hasData) {
    return { effective, primary: "analyse", primaryDisabled: true, overflow: secondary(live ? ["edit"] : ["archive"]) };
  }
  // Untouched / empty draft (no data) → do NOT show Analyse; Edit is useful; Delete only when safe.
  return { effective, primary: "edit", primaryDisabled: false, overflow: deletable ? ["delete", "open"] : ["open"] };
}

// ── Restore target (smart, derived — no schema) ──────────────────────────────
// Restoring an ARCHIVED survey lands it where it should sit operationally: a
// survey that holds research (evidence) returns to `ready`; a genuinely unfinished
// no-data survey returns to `draft`. Derived, so no status_before_archive column.
export function restoreTargetStatus(input: { hasEvidence: boolean }): "ready" | "draft" {
  return input.hasEvidence ? "ready" : "draft";
}

// Restore authority: a normal owner may restore an ARCHIVED survey; restoring a
// SOFT-DELETED survey is admin recovery only (kept out of the normal workflow).
export function restoreAllowed(input: { wasDeleted: boolean; isAdmin: boolean }): boolean {
  return input.wasDeleted ? input.isAdmin : true;
}

// ── Action matrix ─────────────────────────────────────────────────────────────
export type SurveyActionInput = {
  effective: EffectiveLifecycle;
  hasLiveCampaign: boolean;
  hasEvidence: boolean;
  /** the caller may manage this survey (owner of owning org, or admin) */
  canManage: boolean;
  /** the caller is a Fanometrix operator/admin */
  isAdmin: boolean;
  /** the persisted deletion decision (from decideSurveyDeletion) */
  deletable: boolean;
};

export type SurveyActions = {
  canEditMetadata: boolean;
  canEditResearchDefinition: boolean;
  researchLocked: boolean;
  lockReason: string | null;
  canArchive: boolean;
  archiveBlockedReason: string | null;
  canRestore: boolean;
  canDelete: boolean;
  deleteBlockedReason: string | null;
};

export const ARCHIVE_LIVE_BLOCK =
  "This survey is currently collecting responses. Stop collection before archiving it.";
export const DELETE_LIVE_BLOCK =
  "This survey is currently collecting responses. Stop collection before it can be removed.";
export const DELETE_DATA_BLOCK =
  "This survey contains collected research and cannot be deleted. Archive it instead.";

export function surveyActions(input: SurveyActionInput): SurveyActions {
  const isArchived = input.effective === "archived";
  const isDeleted = input.effective === "deleted";
  const locked = researchDefinitionLocked(input);
  const active = input.canManage && !isDeleted;

  // Archive: only for a live-free, non-archived, non-deleted survey the user manages.
  const archiveBlockedReason = input.hasLiveCampaign ? ARCHIVE_LIVE_BLOCK : null;
  const canArchive = active && !isArchived && !input.hasLiveCampaign;

  // Restore (archive-restore) is the owner path; deleted-restore is admin recovery,
  // deliberately NOT offered in the normal management workflow.
  const canRestore = input.canManage && isArchived;

  // Delete follows the corrected safety decision; surface the precise reason.
  const deleteBlockedReason = input.hasLiveCampaign ? DELETE_LIVE_BLOCK : input.hasEvidence ? DELETE_DATA_BLOCK : null;
  const canDelete = active && !isArchived && input.deletable;

  return {
    canEditMetadata: active,
    canEditResearchDefinition: active && !locked,
    researchLocked: locked,
    lockReason: researchLockReason(input),
    canArchive,
    archiveBlockedReason: active && !isArchived ? archiveBlockedReason : null,
    canRestore,
    canDelete,
    deleteBlockedReason: active && !isArchived && !input.deletable ? deleteBlockedReason : null,
  };
}

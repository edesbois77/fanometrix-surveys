export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "paused"
  | "closed"
  | "archived";

export type CampaignAction =
  | "publish"   // Draft → Scheduled (requires future start date)
  | "go_live"   // Draft / Scheduled → Live immediately
  | "pause"     // Live / Scheduled → Paused
  | "resume"    // Paused → Live
  | "close"     // Live / Paused → Closed (permanently stops responses)
  | "archive"   // Closed → Archived
  | "restore";  // Archived → Closed

export type CampaignForStatus = {
  status: string;
  manual_status_override: string | null;
  start_date: string | null;
  end_date: string | null;
  target_responses: number | null;
  archive_after_days: number | null;
  status_updated_at?: string | null;
};

// ─── Rich status result ────────────────────────────────────────────────────────

export type StatusDetail = {
  effective:        CampaignStatus;
  reason:           string | null;   // human-readable explanation of effective status
  isAutoTransition: boolean;         // true when effective !== stored (auto-overridden)
};

export type AcceptingStatus = {
  accepting: boolean;
  reason:    string;   // single-line reason shown in diagnostics
};

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute effective status AND the reason for it.
 * Use this everywhere status needs a human-readable explanation.
 */
export function computeStatusWithReason(
  campaign: CampaignForStatus,
  responseCount: number,
  now: Date = new Date()
): StatusDetail {
  const stored = campaign.status as CampaignStatus;

  if (stored === "draft") {
    return { effective: "draft", reason: null, isAutoTransition: false };
  }
  if (stored === "archived") {
    return { effective: "archived", reason: null, isAutoTransition: false };
  }
  if (stored === "paused" || campaign.manual_status_override === "paused") {
    return { effective: "paused", reason: null, isAutoTransition: false };
  }

  // Closed: only auto-transition is auto-archive
  if (stored === "closed") {
    if (campaign.status_updated_at && campaign.archive_after_days) {
      const closedAt  = new Date(campaign.status_updated_at);
      const archiveMs = campaign.archive_after_days * 24 * 60 * 60 * 1000;
      if (now.getTime() - closedAt.getTime() >= archiveMs) {
        return {
          effective: "archived",
          reason: `Automatically archived after ${campaign.archive_after_days} days closed`,
          isAutoTransition: true,
        };
      }
    }
    return { effective: "closed", reason: null, isAutoTransition: false };
  }

  // Stored is "scheduled" or "live" — check auto-transitions
  const start = campaign.start_date ? new Date(campaign.start_date) : null;
  const end   = campaign.end_date   ? new Date(campaign.end_date)   : null;

  if (start && now < start) {
    return {
      effective: "scheduled",
      reason: `Starts on ${campaign.start_date}`,
      isAutoTransition: stored === "live",
    };
  }

  if (campaign.target_responses !== null && responseCount >= campaign.target_responses) {
    return {
      effective: "closed",
      reason: `Target responses reached (${responseCount.toLocaleString()} / ${campaign.target_responses.toLocaleString()})`,
      isAutoTransition: true,
    };
  }

  if (end && now > end) {
    return {
      effective: "closed",
      reason: `End date reached (${campaign.end_date})`,
      isAutoTransition: true,
    };
  }

  return { effective: "live", reason: null, isAutoTransition: false };
}

/** Backward-compatible scalar wrapper used by existing callers */
export function computeEffectiveStatus(
  campaign: CampaignForStatus,
  responseCount: number,
  now: Date = new Date()
): CampaignStatus {
  return computeStatusWithReason(campaign, responseCount, now).effective;
}

/**
 * Whether a campaign will accept new responses right now, and why not if not.
 */
export function getAcceptingStatus(
  campaign: CampaignForStatus | null,
  responseCount: number,
  now: Date = new Date()
): AcceptingStatus {
  if (!campaign) {
    return { accepting: false, reason: "Campaign Not Found" };
  }

  const { effective, reason } = computeStatusWithReason(campaign, responseCount, now);

  if (effective === "live") {
    return { accepting: true, reason: "Campaign is Live" };
  }

  // Return a specific diagnostic reason
  const baseReasons: Record<CampaignStatus, string> = {
    draft:     "Campaign is Draft",
    scheduled: "Campaign is Scheduled",
    paused:    "Campaign is Paused",
    closed:    "Campaign is Closed",
    archived:  "Campaign is Archived",
    live:      "Campaign is Live",
  };

  // If there's an auto-transition reason, use it for more specificity
  if (reason) {
    if (reason.startsWith("Target responses")) return { accepting: false, reason: "Target Responses Reached" };
    if (reason.startsWith("End date"))         return { accepting: false, reason: "End Date Reached" };
    if (reason.startsWith("Automatically arc")) return { accepting: false, reason: "Campaign is Archived" };
    if (reason.startsWith("Starts on"))        return { accepting: false, reason: "Campaign is Scheduled" };
  }

  return { accepting: false, reason: baseReasons[effective] ?? "Campaign Not Live" };
}

// ─── Action system ────────────────────────────────────────────────────────────

/** Which manual actions are available for a given effective status */
export function availableActions(status: CampaignStatus): CampaignAction[] {
  switch (status) {
    case "draft":     return ["publish", "go_live"];
    case "scheduled": return ["go_live", "pause"];
    case "live":      return ["pause", "close"];
    case "paused":    return ["resume", "close"];
    case "closed":    return ["archive"];
    case "archived":  return ["restore"];
  }
}

/** What the DB status and manual_override should be set to for each action */
export const ACTION_TRANSITIONS: Record<
  CampaignAction,
  { status: CampaignStatus; manual_status_override: string | null }
> = {
  publish:  { status: "scheduled", manual_status_override: null     },
  go_live:  { status: "live",      manual_status_override: null     },
  pause:    { status: "paused",    manual_status_override: "paused" },
  resume:   { status: "live",      manual_status_override: null     },
  close:    { status: "closed",    manual_status_override: null     },
  archive:  { status: "archived",  manual_status_override: null     },
  restore:  { status: "closed",    manual_status_override: null     },
};

/** Badge config for each status */
export const STATUS_META: Record<
  CampaignStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  draft:     { label: "Draft",     dot: "🟡", bg: "bg-amber-50",  text: "text-amber-700"  },
  scheduled: { label: "Scheduled", dot: "🔵", bg: "bg-blue-50",   text: "text-blue-700"   },
  live:      { label: "Live",      dot: "🟢", bg: "bg-green-50",  text: "text-green-700"  },
  paused:    { label: "Paused",    dot: "🟠", bg: "bg-orange-50", text: "text-orange-700" },
  closed:    { label: "Closed",    dot: "⚫", bg: "bg-gray-100",  text: "text-gray-600"   },
  archived:  { label: "Archived",  dot: "⚪", bg: "bg-gray-50",   text: "text-gray-400"   },
};

export const ACTION_LABELS: Record<CampaignAction, string> = {
  publish:  "Publish",
  go_live:  "Go Live Now",
  pause:    "Pause",
  resume:   "Resume",
  close:    "Close",
  archive:  "Archive",
  restore:  "Restore",
};

export const ACTION_NOTIFICATIONS: Record<
  CampaignAction,
  { type: string; message: (name: string) => string } | null
> = {
  publish:  null,
  go_live:  { type: "went_live", message: n => `"${n}" is now Live and collecting responses.`  },
  pause:    { type: "paused",    message: n => `"${n}" has been paused.`                        },
  resume:   { type: "resumed",   message: n => `"${n}" has resumed collecting responses.`       },
  close:    { type: "closed",    message: n => `"${n}" has been closed.`                        },
  archive:  { type: "archived",  message: n => `"${n}" has been archived.`                      },
  restore:  { type: "restored",  message: n => `"${n}" has been restored to Closed.`            },
};

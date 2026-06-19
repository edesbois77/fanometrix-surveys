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

/**
 * Compute the effective status of a campaign from its stored fields
 * and current response count. Called server-side on every fetch.
 *
 * Automatic transitions:
 *   Scheduled → Live   when start_date is reached
 *   Live → Closed      when end_date is reached OR target_responses met
 *   Closed → Archived  when archive_after_days elapses since status_updated_at
 *
 * Manual-only transitions (never auto-computed):
 *   Draft, Paused, Closed (after being set manually or by auto-close), Archived
 */
export function computeEffectiveStatus(
  campaign: CampaignForStatus,
  responseCount: number,
  now: Date = new Date()
): CampaignStatus {
  const stored = campaign.status as CampaignStatus;

  // Draft and Archived are always terminal — never auto-computed
  if (stored === "draft")    return "draft";
  if (stored === "archived") return "archived";

  // Paused: manual override always wins over date logic
  if (campaign.manual_status_override === "paused" || stored === "paused") {
    return "paused";
  }

  // Closed: check for auto-archive, otherwise stay closed
  if (stored === "closed") {
    if (campaign.status_updated_at && campaign.archive_after_days) {
      const closedAt  = new Date(campaign.status_updated_at);
      const archiveMs = campaign.archive_after_days * 24 * 60 * 60 * 1000;
      if (now.getTime() - closedAt.getTime() >= archiveMs) return "archived";
    }
    return "closed";
  }

  // From here: stored is "scheduled" or "live"
  const start = campaign.start_date ? new Date(campaign.start_date) : null;
  const end   = campaign.end_date   ? new Date(campaign.end_date)   : null;

  // Before start date → Scheduled
  if (start && now < start) return "scheduled";

  // Target responses reached → Closed
  if (campaign.target_responses !== null && responseCount >= campaign.target_responses) {
    return "closed";
  }

  // After end date → Closed
  if (end && now > end) return "closed";

  return "live";
}

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

/** Human-readable label for each action button */
export const ACTION_LABELS: Record<CampaignAction, string> = {
  publish:  "Publish",
  go_live:  "Go Live Now",
  pause:    "Pause",
  resume:   "Resume",
  close:    "Close",
  archive:  "Archive",
  restore:  "Restore",
};

/** Notification message for each action */
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

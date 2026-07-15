import Link from "next/link";
import { availableActions, ACTION_LABELS, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import { studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";
import { StatusBadge } from "./StatusBadge";
import { CampaignProgress } from "./CampaignProgress";
import type { Campaign } from "./types";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// A short, friendly identifier for the card — campaign_id (the long slug)
// stays the real key used in embed URLs and the edit drawer, unchanged.
function formatCampaignNumber(n: number): string {
  return `Campaign #${String(n).padStart(6, "0")}`;
}

const ACTION_STYLE: Record<string, string> = {
  publish: "border-blue-200 text-blue-700 hover:bg-blue-50",
  go_live: "border-green-200 text-green-700 hover:bg-green-50",
  pause:   "border-orange-200 text-orange-700 hover:bg-orange-50",
  resume:  "border-green-200 text-green-700 hover:bg-green-50",
  close:   "border-gray-200 text-gray-600 hover:bg-gray-50",
  archive: "border-gray-200 text-gray-500 hover:bg-gray-50",
  restore: "border-blue-200 text-blue-700 hover:bg-blue-50",
  reopen:  "border-blue-200 text-blue-700 hover:bg-blue-50",
};

// The single card both the standalone Campaigns page and the Research
// Project Workspace's embedded Campaigns manager render — one definition,
// so "bring back the operational actions" and "restore bulk management"
// never drift into two different cards over time.
export function CampaignCard({
  campaign: c, orgName, isLockedByAdmin, selected, onToggleSelect,
  actioning, onAction, onEdit, onPreview, onDuplicate, onDelete, onRestore,
}: {
  campaign: Campaign;
  orgName: (id: string | null) => string;
  isLockedByAdmin: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  actioning: string | null;
  onAction: (action: CampaignAction) => void;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const isDeleted = !!c.deleted_at;
  const actions = isDeleted || isLockedByAdmin ? [] : availableActions(c.effective_status ?? c.status as CampaignStatus);
  const isLiveOrPaused = c.effective_status === "live" || c.effective_status === "paused"
    || c.status === "live" || c.status === "paused";
  const canDelete = !isDeleted && !isLiveOrPaused && !isLockedByAdmin;
  const deleteTitle = isLockedByAdmin
    ? "Set up by the Fanometrix team, can't be deleted."
    : isLiveOrPaused
    ? "Live and paused campaigns cannot be deleted. Pause or close it first."
    : "Move to deleted items";

  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm transition-colors flex gap-3 ${
      isDeleted ? "border-gray-100 opacity-75" : "border-gray-100 hover:border-gray-200"
    }`}>
      {isLockedByAdmin ? (
        <div className="w-4 h-4 mt-1 flex-shrink-0" title="Set up by the Fanometrix team, can't be selected for bulk actions." />
      ) : (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 mt-1 accent-[#0B1929] flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        {isDeleted ? (
          /* ── Deleted card ── */
          <>
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <p className="font-semibold text-gray-400 line-through">{c.campaign_name}</p>
                <p className="text-xs text-gray-300 mt-0.5">{formatCampaignNumber(c.campaign_number)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                  {c.deleted_by && <span>Deleted by: <span className="font-medium text-gray-500">{c.deleted_by}</span></span>}
                  {c.deleted_at && <span>· {formatDate(c.deleted_at)}</span>}
                </div>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-500 flex-shrink-0">Deleted</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={onRestore}
                className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors">
                Restore
              </button>
              <button onClick={onDuplicate}
                className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                Duplicate
              </button>
            </div>
          </>
        ) : (
          /* ── Active / Closed / Archived card ── */
          <>
            <div className="flex items-start gap-4">
              <Link href={`/campaigns/${c.id}`} className="flex-1 min-w-0 block group">
                <div className="flex items-start justify-between gap-3 mb-0.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 group-hover:text-[#0B1929] truncate">
                      {c.campaign_name}
                    </p>
                    {c.campaign_description ? (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{c.campaign_description}</p>
                    ) : (
                      <p className="text-xs text-gray-300 italic mt-0.5">No description provided</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatCampaignNumber(c.campaign_number)}</p>
                  </div>
                  <StatusBadge status={c.effective_status ?? c.status as CampaignStatus} />
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {isLockedByAdmin && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full" title="Set up by the Fanometrix team, read-only.">
                      Set up by Fanometrix
                    </span>
                  )}
                  {/* Structured metadata, surfaced here so the Campaign Name
                      itself never has to encode it, see NameBuilder /
                      lib/naming.ts, which now only *suggests* a name from
                      these same fields rather than forcing them into it. */}
                  {studyTypeLabel(c.study_type) && (
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{studyTypeLabel(c.study_type)}</span>
                  )}
                  {orgName(c.brand_org_id) && (
                    <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">{orgName(c.brand_org_id)}</span>
                  )}
                  {orgName(c.agency_org_id) && (
                    <span className="text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{orgName(c.agency_org_id)}</span>
                  )}
                  {(c.market || c.country_code) && (
                    <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{c.market || countryByCode(c.country_code ?? "")?.name || c.country_code}</span>
                  )}
                  {c.surveys?.name && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                      Survey: {c.surveys.name}
                    </span>
                  )}
                  {orgName(c.publisher_org_id) && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{orgName(c.publisher_org_id)}</span>
                  )}
                </div>

                {(c.start_date || c.end_date) && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : "ongoing"}
                  </p>
                )}

                <CampaignProgress c={c} />
              </Link>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <div className="flex gap-1.5 flex-wrap">
                {actions.map(action => (
                  <button key={action}
                    onClick={() => onAction(action)}
                    disabled={actioning === c.id + action}
                    className={`text-xs border px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${ACTION_STYLE[action] ?? "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {actioning === c.id + action ? "…" : ACTION_LABELS[action]}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
                {isLockedByAdmin ? (
                  <button disabled title="Set up by the Fanometrix team, can't be edited."
                    className="text-xs border border-gray-100 text-gray-300 px-3 py-1.5 rounded-lg cursor-not-allowed">
                    Edit
                  </button>
                ) : c.effective_status !== "archived" ? (
                  <button onClick={onEdit}
                    className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                    Edit
                  </button>
                ) : (
                  <button disabled title="Restore this campaign to edit it"
                    className="text-xs border border-gray-100 text-gray-300 px-3 py-1.5 rounded-lg cursor-not-allowed">
                    Edit
                  </button>
                )}

                <button
                  onClick={onPreview}
                  title="Preview the survey creative"
                  className="text-xs border px-3 py-1.5 rounded-lg transition-colors font-medium"
                  style={{ borderColor: "#D7B87A", color: "#0B1929", background: "#D7B87A" }}
                >
                  Preview
                </button>

                <Link href={`/campaign-deployment?campaign=${c.id}`}
                  title="Get the tags to implement this campaign"
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                  Get Tags
                </Link>

                <button onClick={onDuplicate}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                  Duplicate
                </button>

                <button
                  onClick={canDelete ? onDelete : undefined}
                  disabled={!canDelete}
                  title={deleteTitle}
                  className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                    canDelete
                      ? "border-red-100 text-red-400 hover:bg-red-50"
                      : "border-gray-100 text-gray-300 cursor-not-allowed"
                  }`}>
                  Delete
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

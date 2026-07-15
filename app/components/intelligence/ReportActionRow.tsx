"use client";

// The Edit/Approve/Publish/Regenerate/Cancel/Save row every review page
// (Executive Report, Survey Intelligence, Conversation Intelligence) had
// hand-rolled independently, byte-identical between Survey and
// Conversation and a near-identical variant for Executive (no Publish,
// adds Export). One component now, parameterised by which actions
// genuinely apply to that output type — not every output type gets every
// action (Key Findings has none of these at all; Executive has no
// Publish). Deliberately preserves the exact classNames/behaviour each
// page already had; this is a consolidation pass, not a restyle — see
// lib/intelligence/theme.ts for the shared colour tokens used here.
import type { ReactNode } from "react";
import { NAVY, GOLD } from "@/lib/intelligence/theme";
import type { ReviewStatus } from "@/app/components/intelligence/ReviewFields";

export function ReportActionRow({
  editing, hasRow, status, busy, saving, approving, publishing, generating,
  showApprove = true, showPublish = false, showRegenerate = true,
  onEdit, onApprove, onPublish, onRegenerate, onCancel, onSave,
  extraActions,
}: {
  editing: boolean;
  hasRow: boolean;
  status: ReviewStatus | undefined;
  busy: boolean;
  saving: boolean;
  approving: boolean;
  publishing?: boolean;
  generating: boolean;
  /** Approve is hidden once published — same "nothing left to approve"
   * rule every page already applied individually. */
  showApprove?: boolean;
  /** Executive Report never rendered a Publish button (though its adapter
   * has always supported one) — off by default, Survey/Conversation turn
   * it on. */
  showPublish?: boolean;
  /** Regenerate is hidden while the source is blocked (not enough
   * responses/mentions yet) — the caller decides that, not this row. */
  showRegenerate?: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onPublish?: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Executive Report's Export PDF/PPTX buttons — rendered first, before
   * Edit, only in the non-editing state. No other output type has these
   * yet. */
  extraActions?: ReactNode;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={onCancel} disabled={saving}
          className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          style={{ background: NAVY, color: GOLD }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
      {extraActions}
      {hasRow && (
        <button onClick={onEdit} disabled={busy}
          className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          Edit
        </button>
      )}
      {hasRow && showApprove && status !== "published" && (
        <button onClick={onApprove} disabled={busy || status === "approved"}
          className="text-xs font-semibold border-2 border-green-600 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40">
          {approving ? "Approving…" : status === "approved" ? "Approved ✓" : "Approve"}
        </button>
      )}
      {hasRow && showPublish && (
        <button onClick={onPublish} disabled={busy || status !== "approved"}
          title={status !== "approved" && status !== "published" ? "Approve this summary first" : undefined}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: NAVY, color: GOLD }}>
          {publishing ? "Publishing…" : status === "published" ? "Published ✓" : "Publish"}
        </button>
      )}
      {hasRow && showRegenerate && (
        <button onClick={onRegenerate} disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: NAVY, color: GOLD }}>
          {generating ? "Generating…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}

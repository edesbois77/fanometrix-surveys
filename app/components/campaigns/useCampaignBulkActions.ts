import { useState } from "react";
import { availableActions, ACTION_LABELS, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import type { Campaign } from "./types";

// Shared bulk-action orchestration for both the standalone Campaigns page
// and the Research Project Workspace's embedded Campaigns manager. When
// scoped to a project (`researchProjectId` set), each batch also logs one
// aggregated Activity entry — "24 campaign(s) published." — rather than one
// entry per campaign, since bulk actions loop over per-campaign endpoints
// client-side and there's no single server-side write to hang the log off.
export function useCampaignBulkActions({
  selectedIds, clearSelection, load, showToast, researchProjectId,
}: {
  selectedIds: Set<string>;
  clearSelection: () => void;
  load: () => void | Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
  researchProjectId?: string | null;
}) {
  const [bulkWorking, setBulkWorking] = useState(false);

  async function logProjectActivity(message: string) {
    if (!researchProjectId) return;
    try {
      await fetch(`/api/research-projects/${researchProjectId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    } catch {
      // Best-effort — a failed activity log must never surface as a bulk-action failure.
    }
  }

  async function handleBulkDelete(displayed: Campaign[]) {
    const targets = displayed.filter(c => selectedIds.has(c.id));
    if (!targets.length) return;
    const blocked = targets.filter(c => c.effective_status === "live" || c.effective_status === "paused" || c.status === "live" || c.status === "paused");
    const eligible = targets.filter(c => !blocked.includes(c));
    if (!eligible.length) {
      showToast("None of the selected campaigns can be deleted, live and paused campaigns must be paused or closed first.", false);
      return;
    }
    const msg = blocked.length > 0
      ? `Move ${eligible.length} campaign(s) to deleted items? ${blocked.length} live/paused campaign(s) in your selection will be skipped.`
      : `Move ${eligible.length} campaign(s) to deleted items? They can be restored later.`;
    if (!confirm(msg)) return;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of eligible) {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    const parts = [`${succeeded} deleted`];
    if (blocked.length > 0) parts.push(`${blocked.length} skipped (live/paused)`);
    if (failed > 0) parts.push(`${failed} failed`);
    showToast(parts.join(", "), failed === 0);
    if (succeeded > 0) await logProjectActivity(`${succeeded} campaign(s) deleted.`);
    clearSelection();
    load();
  }

  async function handleBulkAction(action: CampaignAction, displayed: Campaign[]) {
    const targets = displayed.filter(c => selectedIds.has(c.id) && availableActions(c.effective_status ?? c.status as CampaignStatus).includes(action));
    if (!targets.length) {
      showToast(`No selected campaigns can be ${ACTION_LABELS[action].toLowerCase()}d right now.`, false);
      return;
    }
    const skipped = selectedIds.size - targets.length;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of targets) {
      const res = await fetch(`/api/campaigns/${c.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    const parts = [`${succeeded} ${ACTION_LABELS[action].toLowerCase()}d`];
    if (skipped > 0) parts.push(`${skipped} skipped (not eligible)`);
    if (failed > 0) parts.push(`${failed} failed`);
    showToast(parts.join(", "), failed === 0);
    if (succeeded > 0) await logProjectActivity(`${succeeded} campaign(s) ${ACTION_LABELS[action].toLowerCase()}d.`);
    clearSelection();
    load();
  }

  async function handleBulkRestore(deletedCampaigns: Campaign[], loadDeleted?: () => void | Promise<void>) {
    const targets = deletedCampaigns.filter(c => selectedIds.has(c.id));
    if (!targets.length) return;
    if (!confirm(`Restore ${targets.length} campaign(s) to Draft?`)) return;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of targets) {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "undelete" }),
      });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    showToast(failed > 0 ? `${succeeded} restored, ${failed} failed` : `${succeeded} campaign(s) restored to Draft.`, failed === 0);
    if (succeeded > 0) await logProjectActivity(`${succeeded} campaign(s) restored.`);
    clearSelection();
    load();
    loadDeleted?.();
  }

  return { bulkWorking, handleBulkDelete, handleBulkAction, handleBulkRestore };
}

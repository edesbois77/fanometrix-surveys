"use client";

// ── Manage → one Studio Campaign Group ───────────────────────────────────────
// Three questions, in the order an operator asks them:
//   1. What is serving right now, and is anything wrong with it?
//   2. Is anything scheduled to change?
//   3. What was configured before, and why?
//
// Member rows carry the reason they are not eligible, resolved server-side, so
// "this group is live but serving nothing" is never a mystery.

import { useCallback, useEffect, useState } from "react";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";

type MemberDetail = {
  campaign_id: string; campaign_slug: string; weight: number;
  membership_state: "active" | "paused";
  market: string | null; country_code: string | null; publisher: string | null;
  response_count: number; target_responses: number | null;
  eligible: boolean; reason: string | null;
};

type Detail = {
  group: {
    id: string; slug: string; name: string; status: string;
    fail_mode: "open" | "closed"; start_date: string | null; end_date: string | null;
  };
  current_revision: {
    id: string; effective_at: string; created_at: string; rotation: string;
    change_kind: string; reason: string | null; members: MemberDetail[];
  } | null;
  next_revision: {
    id: string; effective_at: string; change_kind: string; reason: string | null;
    rotation: string; members: Array<{ campaign_id: string; campaign_slug: string; weight: number; membership_state: string }>;
  } | null;
  history: Array<{
    id: string; effective_at: string; created_at: string; cancelled_at: string | null;
    rotation: string; change_kind: string; reason: string | null;
    member_count: number; state: "cancelled" | "pending" | "effective" | "superseded";
  }>;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const CHANGE_LABEL: Record<string, string> = {
  created: "First configuration",
  members_added: "Campaigns added",
  members_removed: "Campaigns removed",
  member_paused: "Campaign paused",
  member_resumed: "Campaign resumed",
  weights_changed: "Weights changed",
  rotation_changed: "Rotation changed",
  limit_changed: "Capacity limit changed",
  priority_changed: "Priority changed",
};

const STATE_TONE: Record<Detail["history"][number]["state"], "success" | "neutral" | "warning"> = {
  effective: "success", pending: "warning", superseded: "neutral", cancelled: "neutral",
};
const STATE_LABEL: Record<Detail["history"][number]["state"], string> = {
  effective: "Serving now", pending: "Scheduled", superseded: "Replaced", cancelled: "Cancelled",
};

export function ManageCampaignGroupDetail({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/studio/campaign-groups/${groupId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Could not load this group.")))
      .then((j: Detail) => { setDetail(j); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [groupId]);
  useEffect(load, [load]);

  const cancelScheduled = async (revisionId: string) => {
    setBusy(true);
    const res = await fetch(`/api/studio/campaign-groups/${groupId}/revisions/${revisionId}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Could not cancel that configuration."); return; }
    setError(null); load();
  };

  const setStatus = async (status: "live" | "paused") => {
    setBusy(true);
    const res = await fetch(`/api/studio/campaign-groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Could not change the group status."); return; }
    setError(null); load();
  };

  if (!detail) {
    return <div className="space-y-3"><Skeleton className="h-[40px]" /><Skeleton className="h-[140px]" /></div>;
  }

  const g = detail.group;
  const cur = detail.current_revision;

  return (
    <div>
      <button type="button" onClick={onBack} className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
        ← All campaign groups
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{g.name}</h1>
            <StatusBadge label={g.status === "live" ? "Live" : "Paused"} tone={g.status === "live" ? "success" : "neutral"} dot />
          </div>
          <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>{g.slug}</p>
        </div>
        <Button variant="secondary" size="sm" disabled={busy}
                onClick={() => setStatus(g.status === "live" ? "paused" : "live")}>
          {g.status === "live" ? "Pause group" : "Set live"}
        </Button>
      </div>

      {error && (
        <Card className="mt-4">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
        </Card>
      )}

      {/* ── 1. What is serving now ─────────────────────────────────────────── */}
      <h2 className="text-sm font-bold mt-6 mb-2" style={{ color: "var(--text-primary)" }}>Serving now</h2>
      {!cur ? (
        <Card>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            This group has no configuration yet, so it is serving nothing.
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Add campaigns to publish its first configuration.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {cur.rotation} rotation · effective since {fmt(cur.effective_at)}
            {cur.reason ? ` · ${cur.reason}` : ""}
          </p>

          <div className="mt-3 space-y-2">
            {cur.members.map(m => (
              <div key={m.campaign_id} className="flex items-start justify-between gap-3 py-2"
                   style={{ borderTop: "1px solid var(--border-subtle, var(--border-default))" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium font-mono truncate" style={{ color: "var(--text-primary)" }}>
                      {m.campaign_slug}
                    </span>
                    {m.membership_state === "paused" && <StatusBadge label="Paused" tone="neutral" />}
                    {!m.eligible && m.membership_state !== "paused" && <StatusBadge label="Not serving" tone="warning" />}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {[m.market, m.publisher, `weight ${m.weight}`,
                      m.target_responses != null
                        ? `${m.response_count.toLocaleString()} of ${m.target_responses.toLocaleString()} responses`
                        : `${m.response_count.toLocaleString()} responses`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {/* The server's own reason, so the UI never invents vocabulary
                      for a state it does not own. */}
                  {m.reason && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{m.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {cur.members.every(m => !m.eligible) && (
            <p className="text-[13px] mt-3" style={{ color: "var(--text-primary)" }}>
              No campaign in this configuration can currently serve.{" "}
              {g.fail_mode === "closed"
                ? "This group is set to refuse rather than serve, so the placement will stay empty."
                : "The publisher’s own fallback will fill the placement."}
            </p>
          )}
        </Card>
      )}

      {/* ── 2. What is scheduled ───────────────────────────────────────────── */}
      {detail.next_revision && (
        <>
          <h2 className="text-sm font-bold mt-6 mb-2" style={{ color: "var(--text-primary)" }}>Scheduled change</h2>
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {CHANGE_LABEL[detail.next_revision.change_kind] ?? detail.next_revision.change_kind}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  Takes effect {fmt(detail.next_revision.effective_at)} · {detail.next_revision.rotation} rotation ·
                  {" "}{detail.next_revision.members.length} campaign{detail.next_revision.members.length === 1 ? "" : "s"}
                </p>
                {detail.next_revision.reason && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{detail.next_revision.reason}</p>
                )}
              </div>
              <Button variant="secondary" size="sm" disabled={busy}
                      onClick={() => cancelScheduled(detail.next_revision!.id)}>
                Cancel
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* ── 3. What was configured before ──────────────────────────────────── */}
      <h2 className="text-sm font-bold mt-6 mb-2" style={{ color: "var(--text-primary)" }}>Configuration history</h2>
      <Card>
        <div className="space-y-0">
          {detail.history.map(h => (
            <div key={h.id} className="flex items-start justify-between gap-3 py-2.5"
                 style={{ borderTop: "1px solid var(--border-subtle, var(--border-default))" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {CHANGE_LABEL[h.change_kind] ?? h.change_kind}
                  </span>
                  <StatusBadge label={STATE_LABEL[h.state]} tone={STATE_TONE[h.state]} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {h.state === "cancelled"
                    // A cancelled configuration never served, so it is described
                    // by what it WOULD have done, never as though it applied.
                    ? `Was due ${fmt(h.effective_at)}, cancelled ${fmt(h.cancelled_at!)}`
                    : `Effective ${fmt(h.effective_at)}`}
                  {" · "}{h.member_count} campaign{h.member_count === 1 ? "" : "s"}
                  {" · "}{h.rotation} rotation
                </p>
                {h.reason && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{h.reason}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

"use client";

// -- Create -> [Survey] -> Deploy -> Campaign group tags ----------------------
//
// Deploy answers "how do I implement this with the publisher?". A group is a
// second kind of thing to implement: ONE tag that rotates between several
// campaigns, alongside the individual campaign tags above.
//
// A group is presented as ready for production ONLY when it is live, has a
// configuration in force, and something in that configuration can actually
// serve. Anything less shows the tag with an explicit warning naming the
// condition that fails — a publisher trafficking a tag that returns nothing has
// no way to tell a paused group from a broken integration.
//
// Readiness comes from the server's go_live verdict and the members' own
// eligibility. Nothing here re-derives it.

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Eyebrow, StatusBadge } from "@/app/components/workspace-ui";

const BASE = process.env.NEXT_PUBLIC_SURVEYS_URL ?? "https://fanometrix-surveys.vercel.app";

type Member = {
  campaign_id: string; campaign_slug: string; weight: number;
  membership_state: string; eligible?: boolean; readiness_reasons?: string[];
};

type Detail = {
  group: { id: string; slug: string; name: string; status: string; fail_mode: string };
  go_live: { allowed: boolean; mode: string; scheduled_at?: string; scheduled_campaign?: string };
  next_state_change_at: string | null;
  current_revision: { id: string; effective_at: string; rotation: string; members: Member[] } | null;
  next_revision: { id: string; effective_at: string; rotation: string } | null;
};

type Summary = { id: string; slug: string; name: string; status: string };

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};
const share = (w: number, total: number) => total > 0 ? Math.round((w / total) * 1000) / 10 : 0;

export function DeployGroupTags({ surveyId }: { surveyId: string }) {
  const [groups, setGroups] = useState<Summary[] | null>(null);

  useEffect(() => {
    fetch(`/api/studio/campaign-groups?survey_id=${encodeURIComponent(surveyId)}`)
      .then(r => r.ok ? r.json() : { groups: [] })
      .then(j => setGroups(j.groups ?? []))
      .catch(() => setGroups([]));
  }, [surveyId]);

  if (!groups || groups.length === 0) return null;

  return (
    <div className="mt-8">
      <Eyebrow className="mb-1.5">Campaign group tags</Eyebrow>
      <p className="text-[13px] mb-3 max-w-[62ch]" style={{ color: "var(--text-secondary)" }}>
        One tag per group. The group decides which of its campaigns each impression receives,
        so the publisher implements this instead of the individual tags above — not as well as.
      </p>
      <div className="space-y-3">
        {groups.map(g => <GroupTagCard key={g.id} groupId={g.id} />)}
      </div>
    </div>
  );
}

function GroupTagCard({ groupId }: { groupId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [copied, setCopied] = useState<"iframe" | "script" | null>(null);

  const load = useCallback(() => {
    fetch(`/api/studio/campaign-groups/${groupId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setD)
      .catch(() => setD(null));
  }, [groupId]);
  useEffect(load, [load]);

  // The server says when its verdict expires; refetch then rather than polling.
  useEffect(() => {
    if (!d?.next_state_change_at) return;
    const ms = new Date(d.next_state_change_at).getTime() - Date.now();
    if (ms <= 0) { load(); return; }
    const t = setTimeout(load, ms + 500);
    return () => clearTimeout(t);
  }, [d?.next_state_change_at, load]);

  if (!d) return null;
  const g = d.group;
  const cur = d.current_revision;

  const activeMembers = (cur?.members ?? []).filter(m => m.membership_state !== "paused");
  const totalWeight = activeMembers.reduce((s, m) => s + m.weight, 0);
  const anyServing = activeMembers.some(m => m.eligible !== false);

  // Production-ready is a conjunction, and every failing part is named.
  const warnings: string[] = [];
  if (!cur) warnings.push("This group has no configuration in force, so the tag will not serve.");
  if (g.status !== "live") warnings.push("This group is paused. The tag will not serve until it is set live.");
  if (cur && !anyServing) {
    warnings.push(d.go_live.mode === "scheduled" && d.go_live.scheduled_at
      ? `No campaign can serve yet. ${d.go_live.scheduled_campaign} becomes eligible at ${fmt(d.go_live.scheduled_at)}.`
      : "No campaign in this configuration can currently serve.");
  }
  const ready = warnings.length === 0;

  // ?campaign_group= — the public contract. "studio" is an internal distinction
  // and does not belong in a publisher-facing parameter.
  const src = `${BASE}/embed?campaign_group=${encodeURIComponent(g.slug)}`;
  const iframeCode = [
    `<iframe`,
    `  src="${src}"`,
    `  width="300" height="250"`,
    `  frameborder="0" scrolling="no"`,
    `  style="border:0;overflow:hidden;display:block;"`,
    `  title="Fanometrix Fan Survey"`,
    `></iframe>`,
  ].join("\n");
  const scriptCode = [
    `<script`,
    `  src="${BASE}/embed.js"`,
    `  data-campaign-group="${g.slug}"`,
    `  async`,
    `></script>`,
  ].join("\n");

  const copy = (text: string, which: "iframe" | "script") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{g.name}</span>
            <StatusBadge label={g.status === "live" ? "Live" : "Paused"} tone={g.status === "live" ? "success" : "neutral"} dot />
            {ready
              ? <StatusBadge label="Ready" tone="success" />
              : <StatusBadge label="Not ready" tone="warning" />}
          </div>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-tertiary)" }}>{g.slug}</p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-2 rounded-md px-3 py-2" style={{ background: "rgba(138,75,47,0.08)" }}>
          {warnings.map(w => (
            <p key={w} className="text-[11px]" style={{ color: "#8A4B2F" }}>{w}</p>
          ))}
        </div>
      )}

      {/* Configuration in force, or the one scheduled */}
      <p className="text-[11px] mt-2.5" style={{ color: "var(--text-tertiary)" }}>
        {cur
          ? <>{cur.rotation} rotation · in force since {fmt(cur.effective_at)}</>
          : d.next_revision
            ? <>No configuration in force. One is scheduled for {fmt(d.next_revision.effective_at)}.</>
            : <>No configuration yet.</>}
      </p>

      {activeMembers.length > 0 && (
        <div className="mt-1.5">
          {activeMembers.map(m => (
            <div key={m.campaign_id} className="flex items-center justify-between gap-3 py-1"
                 style={{ borderTop: "1px solid var(--border-default)" }}>
              <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-primary)" }}>{m.campaign_slug}</span>
              <span className="text-[11px] shrink-0" style={{ color: m.eligible === false ? "#8A4B2F" : "var(--text-secondary)" }}>
                {cur?.rotation === "weighted" ? `${m.weight} · ${share(m.weight, totalWeight)}%` : "equal"}
                {m.eligible === false ? " · not serving" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* The tag itself */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Iframe tag</span>
          <Button variant="secondary" size="sm" onClick={() => copy(iframeCode, "iframe")}>
            {copied === "iframe" ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="text-[11px] rounded-md p-2.5 overflow-x-auto"
             style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
{iframeCode}
        </pre>

        <div className="flex items-center justify-between mb-1 mt-2.5">
          <span className="text-[10px] uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Script tag</span>
          <Button variant="secondary" size="sm" onClick={() => copy(scriptCode, "script")}>
            {copied === "script" ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="text-[11px] rounded-md p-2.5 overflow-x-auto"
             style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
{scriptCode}
        </pre>

        <div className="mt-2">
          <a href={`${src}&preview=1`} target="_blank" rel="noreferrer"
             className="text-[11px] underline" style={{ color: "var(--text-tertiary)" }}>
            Open the group in a new tab
          </a>
        </div>
      </div>
    </Card>
  );
}

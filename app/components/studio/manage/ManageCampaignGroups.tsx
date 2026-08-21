"use client";

// ── Manage → Campaigns → Campaign Groups (Studio) ────────────────────────────
// The operator view of a Studio Campaign Group: what is serving now, what is
// scheduled next, and the full history of what was configured when.
//
// The organising idea the UI has to carry is that a group and its CONFIGURATION
// are different things. The group is a durable address a publisher embeds; the
// configuration is a dated, frozen statement of which campaigns that address
// rotated between. So membership is never edited in place here — every change
// publishes a new configuration, and the old one stays readable because
// evidence collected under it still points at it.

import { useEffect, useState } from "react";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";

type RevisionSummary = {
  id: string; effective_at: string; rotation?: string;
  member_count?: number; active_member_count?: number; change_kind?: string;
};

type GroupCard = {
  id: string; slug: string; name: string; status: string;
  fail_mode: "open" | "closed";
  revision_count: number;
  current_revision: RevisionSummary | null;
  next_revision: RevisionSummary | null;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export function ManageCampaignGroups({ onOpen }: { onOpen: (id: string) => void }) {
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/studio/campaign-groups")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Could not load campaign groups.")))
      .then(j => { setGroups((j.groups ?? []) as GroupCard[]); setError(null); })
      .catch((e: Error) => { setGroups([]); setError(e.message); });
  };
  useEffect(load, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          A Campaign Group gives a publisher one embed that rotates between several campaigns.
          Each change publishes a dated configuration, so results can always be read back
          against the setup that produced them.
        </p>
        <Button onClick={() => setCreating(true)} variant="primary" size="sm">
          <StudioIcon.create size={14} /> Create group
        </Button>
      </div>

      {error && (
        <Card>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
        </Card>
      )}

      {groups == null ? (
        <div className="space-y-3"><Skeleton className="h-[84px]" /><Skeleton className="h-[84px]" /></div>
      ) : groups.length === 0 && !error ? (
        <Card>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>No campaign groups yet</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Create a group when one publisher placement should rotate between several campaigns,
            for example the same survey running in two markets behind a single tag.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => onOpen(g.id)}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
              <Card interactive>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{g.name}</h3>
                      <StatusBadge label={g.status === "live" ? "Live" : "Paused"} tone={g.status === "live" ? "success" : "neutral"} dot />
                      {g.fail_mode === "closed" && (
                        <StatusBadge label="Fails closed" tone="neutral" />
                      )}
                    </div>
                    <p className="text-xs mt-1 font-mono truncate" style={{ color: "var(--text-tertiary)" }}>{g.slug}</p>

                    <p className="text-[13px] mt-2 leading-snug" style={{ color: "var(--text-secondary)" }}>
                      {g.current_revision ? (
                        <>
                          Serving {g.current_revision.active_member_count ?? 0} of {g.current_revision.member_count ?? 0} campaigns
                          {" · "}{g.current_revision.rotation} rotation
                          {" · since "}{fmtDateTime(g.current_revision.effective_at)}
                        </>
                      ) : (
                        // Said plainly: a live group with no configuration serves
                        // nothing, and an operator needs to know that immediately.
                        <span style={{ color: "var(--text-primary)" }}>
                          No configuration yet, so this group is not serving.
                        </span>
                      )}
                    </p>

                    {g.next_revision && (
                      <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                        Next configuration scheduled for {fmtDateTime(g.next_revision.effective_at)}
                      </p>
                    )}
                  </div>
                  <span className="pt-1" style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.arrowRight size={16} /></span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [failClosed, setFailClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setError(null);
    const res = await fetch("/api/studio/campaign-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, fail_mode: failClosed ? "closed" : "open" }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(j.error ?? "Could not create the group."); return; }
    onCreated(j.group.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-[var(--radius-panel)] p-5"
           style={{ background: "var(--surface-panel)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Create campaign group</h2>

        <label className="block mt-4 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
               className="mt-1 w-full rounded-md px-3 py-2 text-sm"
               style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />

        <label className="block mt-3 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Group ID</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="wwc-fotmob-rotation"
               className="mt-1 w-full rounded-md px-3 py-2 text-sm font-mono"
               style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          This is what goes in the publisher&rsquo;s embed, so it cannot be changed afterwards.
          Lowercase letters, numbers, hyphens and underscores.
        </p>

        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={failClosed} onChange={e => setFailClosed(e.target.checked)} className="mt-0.5" />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>Refuse to serve when nothing is eligible.</span>
            {" "}By default the group returns nothing and the publisher&rsquo;s own fallback fills the slot.
            Choose this if an unattributable impression would be worse than an empty one.
          </span>
        </label>

        {error && <p className="text-xs mt-3" style={{ color: "var(--accent-danger, #d94a4a)" }}>{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={saving || !name.trim() || !slug.trim()}>
            {saving ? "Creating…" : "Create group"}
          </Button>
        </div>
      </div>
    </div>
  );
}

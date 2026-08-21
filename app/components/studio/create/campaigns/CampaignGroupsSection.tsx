"use client";

// -- Create -> [Survey] -> Campaigns -> Campaign Groups -----------------------
//
// Appended AFTER the campaign list, never above it: a group is built FROM the
// campaigns configured above, so the order on screen is the order of the work.
//
// Visiting this stage creates nothing. "Create campaign group" opens a flow; a
// group exists only once someone completes it.
//
// TWO CONCEPTS, kept visibly apart throughout:
//   groupable      may this campaign be put in a configuration? A DRAFT CAN.
//   can_serve_now  will it receive delivery? A draft cannot — and the UI says
//                  so on the row, without ever blocking selection.
// Both verdicts come from the server. Nothing here re-derives eligibility.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Eyebrow, StatusBadge } from "@/app/components/workspace-ui";
import { StudioIcon } from "../../studio-icons";

// ── Types mirroring the API, which is the authority ──────────────────────────

export type Candidate = {
  campaign_id: string; slug: string; name: string;
  publisher: string | null; market: string | null; country_code: string | null;
  language: string | null; status: string;
  target_responses: number | null; response_count: number;
  can_add_to_group: boolean; cannot_add_reason: string | null;
  can_serve_now: boolean; serve_readiness_reasons: string[];
  already_member: boolean;
};

type GoLive = {
  allowed: boolean;
  mode: "serving" | "scheduled" | "blocked";
  scheduled_at?: string; scheduled_campaign?: string;
  blockers?: Array<{ campaign: string; reasons: string[]; note?: string }>;
};

type RevisionMemberView = {
  campaign_id: string; campaign_slug: string; weight: number;
  membership_state: string; market?: string | null; publisher?: string | null;
  eligible?: boolean; reason?: string | null; readiness_reasons?: string[];
};

type GroupDetail = {
  group: { id: string; slug: string; name: string; status: string; fail_mode: string };
  go_live: GoLive;
  can_delete: boolean;
  pending_count: number;
  next_state_change_at: string | null;
  current_revision: { id: string; effective_at: string; rotation: string; reason: string | null;
                      members: RevisionMemberView[] } | null;
  next_revision: { id: string; effective_at: string; change_kind: string; reason: string | null;
                   rotation: string; members: RevisionMemberView[] } | null;
  history: Array<{ id: string; effective_at: string; cancelled_at: string | null; rotation: string;
                   change_kind: string; reason: string | null; member_count: number; state: string }>;
};

type GroupSummary = {
  id: string; slug: string; name: string; status: string; fail_mode: string;
  current_revision: { effective_at: string; member_count: number; active_member_count: number; rotation: string } | null;
  next_revision: { effective_at: string; change_kind: string } | null;
};

// ── Formatting ───────────────────────────────────────────────────────────────

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

/** A countdown in words. Deliberately coarse above an hour — a precise seconds
 *  readout implies a precision the boundary does not need. */
function untilLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h < 24 ? `${h}h ${m}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

const share = (w: number, total: number) => total > 0 ? Math.round((w / total) * 1000) / 10 : 0;

const CHANGE_LABEL: Record<string, string> = {
  created: "First configuration", members_added: "Campaigns added",
  members_removed: "Campaigns removed", member_paused: "Campaign paused",
  member_resumed: "Campaign resumed", weights_changed: "Weights changed",
  rotation_changed: "Rotation changed", limit_changed: "Capacity limit changed",
  priority_changed: "Priority changed",
};

// ── The section ──────────────────────────────────────────────────────────────

export function CampaignGroupsSection({ surveyId }: { surveyId: string }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [groupableCount, setGroupableCount] = useState(0);
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    const r = await fetch(`/api/studio/surveys/${surveyId}/group-candidates`);
    if (!r.ok) { setCandidates([]); setCanCreate(false); return; }
    const j = await r.json();
    setCandidates(j.candidates ?? []);
    setCanCreate(!!j.can_create_group);
    setGroupableCount(j.groupable_count ?? 0);
  }, [surveyId]);

  const loadGroups = useCallback(async () => {
    const r = await fetch(`/api/studio/campaign-groups?survey_id=${encodeURIComponent(surveyId)}`);
    if (!r.ok) { setGroups([]); return; }
    const j = await r.json();
    setGroups(j.groups ?? []);
  }, [surveyId]);

  useEffect(() => { loadCandidates(); loadGroups(); }, [loadCandidates, loadGroups]);

  if (openGroupId) {
    return (
      <GroupDetailPanel
        groupId={openGroupId}
        surveyId={surveyId}
        onBack={() => { setOpenGroupId(null); loadGroups(); loadCandidates(); }}
      />
    );
  }

  return (
    <div className="mt-8">
      <Eyebrow className="mb-1.5">Campaign groups</Eyebrow>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-[13px] leading-snug max-w-[62ch]" style={{ color: "var(--text-secondary)" }}>
          A campaign group gives a publisher one embed that rotates between several of this
          survey&rsquo;s campaigns, with a dated record of what was configured when.
        </p>
        <Button
          onClick={() => setCreating(true)}
          variant="primary"
          size="sm"
          disabled={!canCreate}
          title={canCreate ? undefined : "Add at least two campaigns above to create a group"}
        >
          <StudioIcon.create size={14} /> Create campaign group
        </Button>
      </div>

      {!canCreate && candidates !== null && (
        <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          {groupableCount === 0
            ? "Add campaigns above before creating a group."
            : `Add at least two campaigns above to create a group — this survey has ${groupableCount}.`}
        </p>
      )}

      {error && <Card className="mb-3"><p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p></Card>}

      {groups && groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => setOpenGroupId(g.id)}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
              <Card interactive padding="md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{g.name}</span>
                      <StatusBadge label={g.status === "live" ? "Live" : "Paused"} tone={g.status === "live" ? "success" : "neutral"} dot />
                    </div>
                    <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-tertiary)" }}>{g.slug}</p>
                    <p className="text-[13px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                      {g.current_revision
                        ? <>Serving {g.current_revision.active_member_count} of {g.current_revision.member_count} campaigns · {g.current_revision.rotation} rotation</>
                        : g.next_revision
                          ? <>No configuration in force yet. One is scheduled for {fmt(g.next_revision.effective_at)}.</>
                          : <span style={{ color: "var(--text-primary)" }}>No campaigns yet.</span>}
                    </p>
                  </div>
                  <span className="pt-1" style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.arrowRight size={16} /></span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {creating && candidates && (
        <ConfigureFlow
          surveyId={surveyId}
          candidates={candidates}
          existing={null}
          onClose={() => setCreating(false)}
          onDone={(id) => { setCreating(false); loadGroups(); setOpenGroupId(id); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ── Create / edit flow: identity -> campaigns & rotation -> review ───────────

function ConfigureFlow({
  surveyId, candidates, existing, onClose, onDone, onError,
}: {
  surveyId: string;
  candidates: Candidate[];
  /** Present when editing a group that already exists. */
  existing: { id: string; slug: string; name: string; members: RevisionMemberView[]; rotation: string } | null;
  onClose: () => void;
  onDone: (groupId: string) => void;
  onError: (m: string) => void;
}) {
  const editing = !!existing;
  const [pane, setPane] = useState<1 | 2 | 3>(editing ? 2 : 1);
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [failClosed, setFailClosed] = useState(false);
  const [rotation, setRotation] = useState<"equal" | "weighted">(
    (existing?.rotation as "equal" | "weighted") ?? "equal");
  const [picked, setPicked] = useState<Map<string, { weight: number; paused: boolean }>>(() => {
    const m = new Map<string, { weight: number; paused: boolean }>();
    for (const x of existing?.members ?? []) {
      m.set(x.campaign_id, { weight: x.weight, paused: x.membership_state === "paused" });
    }
    return m;
  });
  const [immediate, setImmediate] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The SERVER decides whether an acknowledgement is required; this holds its
  // answer for the proposed change. Never derived here — a client opinion about
  // governance would eventually drift from the rule that actually enforces it.
  const [preview, setPreview] = useState<{
    change_kind: string; reason_required: boolean; comparability_required: boolean;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const groupable = candidates.filter(c => c.can_add_to_group);
  const selected = groupable.filter(c => picked.has(c.campaign_id));
  const totalWeight = selected.reduce((s, c) => s + (picked.get(c.campaign_id)!.paused ? 0 : picked.get(c.campaign_id)!.weight), 0);

  // What changed, for the review pane. The server derives the authoritative
  // change_kind; this is only what to SHOW.
  const previousIds = new Set((existing?.members ?? []).map(m => m.campaign_id));
  const addedNow = selected.filter(c => !previousIds.has(c.campaign_id));
  const removedNow = (existing?.members ?? []).filter(m => !picked.has(m.campaign_id));
  const reasonRequired = editing && (addedNow.length > 0 || removedNow.length > 0);

  const toggle = (id: string) => setPicked(prev => {
    const n = new Map(prev);
    if (n.has(id)) n.delete(id); else n.set(id, { weight: 1, paused: false });
    return n;
  });
  const setWeight = (id: string, w: number) => setPicked(prev => {
    const n = new Map(prev);
    const cur = n.get(id); if (cur) n.set(id, { ...cur, weight: Math.max(1, Math.floor(w) || 1) });
    return n;
  });
  const setPaused = (id: string, p: boolean) => setPicked(prev => {
    const n = new Map(prev);
    const cur = n.get(id); if (cur) n.set(id, { ...cur, paused: p });
    return n;
  });

  const effectiveAtIso = immediate ? new Date().toISOString() : new Date(when).toISOString();

  // On reaching the review pane, ask the server what this change IS and what it
  // requires. Re-asked whenever the proposed membership or rotation changes, so
  // the checkbox cannot linger from an earlier shape of the edit.
  const membersKey = selected.map(c =>
    `${c.campaign_id}:${picked.get(c.campaign_id)!.weight}:${picked.get(c.campaign_id)!.paused}`
  ).sort().join("|") + `#${rotation}`;

  useEffect(() => {
    if (pane !== 3 || !existing?.id) {
      // A NEW group has no history, so nothing can be incomparable with it. The
      // server says the same; asking would need a group that does not exist yet.
      setPreview({ change_kind: "created", reason_required: false, comparability_required: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/studio/campaign-groups/${existing.id}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview: true,
          effective_at: effectiveAtIso,
          rotation,
          members: selected.map(c => ({
            campaign_id: c.campaign_id,
            weight: rotation === "weighted" ? picked.get(c.campaign_id)!.weight : 1,
            membership_state: picked.get(c.campaign_id)!.paused ? "paused" : "active",
          })),
        }),
      });
      if (cancelled) return;
      if (!r.ok) { setPreview(null); return; }
      const j = await r.json();
      setPreview({
        change_kind: j.change_kind,
        reason_required: !!j.reason_required,
        comparability_required: !!j.comparability_required,
      });
      // A change of shape invalidates a tick made against the previous shape.
      setAcknowledged(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, existing?.id, membersKey]);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      let groupId = existing?.id ?? null;

      if (!groupId) {
        const cr = await fetch("/api/studio/campaign-groups", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), slug: slug.trim(), fail_mode: failClosed ? "closed" : "open" }),
        });
        const cj = await cr.json();
        if (!cr.ok) { setErr(cj.error ?? "Could not create the group."); setSaving(false); return; }
        groupId = cj.group.id as string;
      }

      // ALWAYS the complete member set. Sending only what changed would silently
      // drop every member not mentioned — a revision REPLACES membership, it does
      // not merge into it.
      const members = selected.map(c => ({
        campaign_id: c.campaign_id,
        weight: rotation === "weighted" ? picked.get(c.campaign_id)!.weight : 1,
        membership_state: picked.get(c.campaign_id)!.paused ? "paused" : "active",
      }));

      const rr = await fetch(`/api/studio/campaign-groups/${groupId}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effective_at: effectiveAtIso,
          rotation,
          members,
          reason: reason.trim() || null,
          // EXACTLY what the operator ticked. Never a default, never coerced —
          // if the server requires it and this is false, the publish is refused,
          // which is the correct outcome.
          comparability_acknowledged: acknowledged,
        }),
      });
      const rj = await rr.json();
      if (!rr.ok) { setErr(rj.error ?? "Could not publish the configuration."); setSaving(false); return; }

      onDone(groupId!);
    } catch {
      setErr("Something went wrong. Nothing was published.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-3xl rounded-[var(--radius-panel)] p-5"
           style={{ background: "var(--surface-panel)", border: "1px solid var(--border-default)" }}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {editing ? "Change configuration" : "Create campaign group"}
          </h2>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Step {pane} of 3</span>
        </div>

        {pane === 1 && (
          <PaneIdentity
            name={name} setName={setName} slug={slug} setSlug={setSlug}
            failClosed={failClosed} setFailClosed={setFailClosed}
          />
        )}

        {pane === 2 && (
          <PaneCampaigns
            candidates={candidates} picked={picked} rotation={rotation} setRotation={setRotation}
            toggle={toggle} setWeight={setWeight} setPaused={setPaused} totalWeight={totalWeight}
          />
        )}

        {pane === 3 && (
          <PaneReview
            selected={selected} picked={picked} rotation={rotation} totalWeight={totalWeight}
            immediate={immediate} setImmediate={setImmediate} when={when} setWhen={setWhen}
            reason={reason} setReason={setReason} reasonRequired={!!preview?.reason_required}
            preview={preview} acknowledged={acknowledged} setAcknowledged={setAcknowledged}
            added={addedNow.map(c => c.slug)} removed={removedNow.map(m => m.campaign_slug)}
            editing={editing}
          />
        )}

        {err && <p className="text-xs mt-3" style={{ color: "#B3261E" }}>{err}</p>}

        <div className="flex justify-between items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-default)" }}>
          <Button variant="secondary" size="sm" onClick={pane === (editing ? 2 : 1) ? onClose : () => setPane((p) => (p - 1) as 1 | 2 | 3)}>
            {pane === (editing ? 2 : 1) ? "Cancel" : "Back"}
          </Button>
          {pane < 3 ? (
            <Button
              variant="primary" size="sm"
              onClick={() => setPane((p) => (p + 1) as 1 | 2 | 3)}
              disabled={
                (pane === 1 && (!name.trim() || !slug.trim())) ||
                (pane === 2 && selected.length === 0)
              }
            >
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={submit}
                    disabled={
                      saving || selected.length === 0
                      || (!!preview?.reason_required && !reason.trim())
                      || (!!preview?.comparability_required && !acknowledged)
                    }>
              {saving ? "Publishing…" : "Publish configuration"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PaneIdentity({ name, setName, slug, setSlug, failClosed, setFailClosed }: {
  name: string; setName: (v: string) => void;
  slug: string; setSlug: (v: string) => void;
  failClosed: boolean; setFailClosed: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Name</label>
      <input value={name} onChange={e => setName(e.target.value)} autoFocus
             className="mt-1 w-full rounded-md px-3 py-2 text-sm"
             style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />

      <label className="block mt-4 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Group ID</label>
      <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"))}
             placeholder="wwc_fotmob_rotation"
             className="mt-1 w-full rounded-md px-3 py-2 text-sm font-mono"
             style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
      <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
        This goes in the publisher&rsquo;s embed and <strong>cannot be changed later</strong>.
        Lowercase letters, numbers, hyphens and underscores.
      </p>

      <label className="flex items-start gap-2 mt-4 cursor-pointer">
        <input type="checkbox" checked={failClosed} onChange={e => setFailClosed(e.target.checked)} className="mt-0.5" />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>Refuse to serve when nothing is eligible.</span>{" "}
          By default the group returns nothing and the publisher&rsquo;s own fallback fills the slot.
          Choose this if an unattributable impression would be worse than an empty one.
        </span>
      </label>
    </div>
  );
}

function PaneCampaigns({ candidates, picked, rotation, setRotation, toggle, setWeight, setPaused, totalWeight }: {
  candidates: Candidate[];
  picked: Map<string, { weight: number; paused: boolean }>;
  rotation: "equal" | "weighted";
  setRotation: (r: "equal" | "weighted") => void;
  toggle: (id: string) => void;
  setWeight: (id: string, w: number) => void;
  setPaused: (id: string, p: boolean) => void;
  totalWeight: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Rotation</span>
        {(["equal", "weighted"] as const).map(r => (
          <button key={r} type="button" onClick={() => setRotation(r)}
            className="px-2.5 py-1 text-xs rounded-md capitalize"
            style={rotation === r
              ? { background: "var(--accent-gold)", color: "#1a1a1a", fontWeight: 600 }
              : { border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            {r}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
        {candidates.map(c => {
          const on = picked.has(c.campaign_id);
          const p = picked.get(c.campaign_id);
          const blocked = !c.can_add_to_group;
          return (
            <div key={c.campaign_id}
                 className="rounded-md px-3 py-2"
                 style={{ border: "1px solid var(--border-default)", opacity: blocked ? 0.55 : 1 }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={on} disabled={blocked}
                       onChange={() => toggle(c.campaign_id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                    <StatusBadge label={c.status === "live" ? "Live" : c.status === "draft" ? "Draft" : c.status}
                                 tone={c.status === "live" ? "success" : "neutral"} />
                    {c.already_member && <StatusBadge label="In this group" tone="neutral" />}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {[c.publisher, c.market, c.language?.toUpperCase(),
                      c.target_responses != null ? `${c.response_count}/${c.target_responses} responses` : null,
                     ].filter(Boolean).join(" · ")}
                  </p>

                  {/* Structural refusal — cannot be grouped at all. */}
                  {blocked && c.cannot_add_reason && (
                    <p className="text-[11px] mt-1" style={{ color: "#8A4B2F" }}>{c.cannot_add_reason}</p>
                  )}

                  {/* Operational: groupable, but will not receive delivery yet.
                      Shown for EVERY reason, not just the first. */}
                  {!blocked && !c.can_serve_now && (
                    <p className="text-[11px] mt-1" style={{ color: "#8A4B2F" }}>
                      Will not receive delivery yet — {c.serve_readiness_reasons.join("; ").toLowerCase()}.
                    </p>
                  )}
                </div>

                {on && rotation === "weighted" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input type="number" min={1} value={p!.weight}
                           onChange={e => setWeight(c.campaign_id, Number(e.target.value))}
                           className="w-16 rounded-md px-2 py-1 text-xs text-right"
                           style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                    <span className="text-[11px] w-12 text-right" style={{ color: "var(--text-tertiary)" }}>
                      {p!.paused ? "paused" : `${share(p!.weight, totalWeight)}%`}
                    </span>
                  </div>
                )}
                {on && (
                  <button type="button" onClick={() => setPaused(c.campaign_id, !p!.paused)}
                          className="text-[11px] shrink-0 underline" style={{ color: "var(--text-tertiary)" }}>
                    {p!.paused ? "Resume" : "Pause"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rotation === "weighted" && (
        <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
          Weights must be 1 or more. To take a campaign out of rotation, pause it rather than
          weighting it to zero.
        </p>
      )}
    </div>
  );
}

function PaneReview({
  selected, picked, rotation, totalWeight, immediate, setImmediate, when, setWhen,
  reason, setReason, reasonRequired, preview, acknowledged, setAcknowledged,
  added, removed, editing,
}: {
  selected: Candidate[];
  picked: Map<string, { weight: number; paused: boolean }>;
  rotation: string; totalWeight: number;
  immediate: boolean; setImmediate: (v: boolean) => void;
  when: string; setWhen: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  reasonRequired: boolean;
  preview: { change_kind: string; reason_required: boolean; comparability_required: boolean } | null;
  acknowledged: boolean; setAcknowledged: (v: boolean) => void;
  added: string[]; removed: string[]; editing: boolean;
}) {
  const utc = immediate ? null : new Date(when).toISOString();
  return (
    <div>
      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        <strong>Publishing creates a new configuration. It never edits the current one.</strong>
      </p>

      <div className="rounded-md overflow-hidden mb-4" style={{ border: "1px solid var(--border-default)" }}>
        {selected.map(c => {
          const p = picked.get(c.campaign_id)!;
          return (
            <div key={c.campaign_id} className="flex items-center justify-between gap-3 px-3 py-2"
                 style={{ borderBottom: "1px solid var(--border-default)" }}>
              <div className="min-w-0">
                <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                {!c.can_serve_now && (
                  <span className="text-[11px] ml-2" style={{ color: "#8A4B2F" }}>not serving yet</span>
                )}
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                {p.paused ? "Paused" : rotation === "weighted" ? `${p.weight} · ${share(p.weight, totalWeight)}%` : "Equal"}
              </span>
            </div>
          );
        })}
      </div>

      {editing && (added.length > 0 || removed.length > 0) && (
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          {added.length > 0 && <>Adding {added.join(", ")}. </>}
          {removed.length > 0 && <>Removing {removed.join(", ")}. </>}
        </p>
      )}

      <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Effective</label>
      <div className="flex items-center gap-3 mt-1 mb-1">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-primary)" }}>
          <input type="radio" checked={!immediate} onChange={() => setImmediate(false)} /> Schedule for
        </label>
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} disabled={immediate}
               className="rounded-md px-2 py-1 text-xs"
               style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-primary)" }}>
          <input type="radio" checked={immediate} onChange={() => setImmediate(true)} /> Immediately
        </label>
      </div>
      {utc && <p className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>{utc} UTC</p>}

      {/* The permanence disclosure. This is the moment deletability is decided. */}
      <div className="rounded-md px-3 py-2 mb-3 text-[11px]"
           style={{ background: "rgba(138,75,47,0.08)", color: "#8A4B2F" }}>
        {immediate
          ? <>This configuration takes effect <strong>immediately</strong> and becomes part of the group&rsquo;s permanent history. <strong>The group cannot be deleted afterwards</strong>, even if it is paused and never serves.</>
          : <>Scheduled configurations can be cancelled until they take effect, and the group remains deletable until then. <strong>Once it takes effect the group can never be deleted.</strong></>}
      </div>

      {/* Shown ONLY when the server says this change requires it. A weight-only
          change does not, and must not be made to look as though it does. */}
      {preview?.comparability_required && (
        <label className="flex items-start gap-2 mb-3 cursor-pointer rounded-md px-3 py-2"
               style={{ background: "rgba(138,75,47,0.08)" }}>
          <input type="checkbox" checked={acknowledged} className="mt-0.5"
                 onChange={e => setAcknowledged(e.target.checked)} />
          <span className="text-[11px]" style={{ color: "#8A4B2F" }}>
            I understand that changing the campaigns in this group may change the audience
            being exposed. Results before and after this configuration should be treated as
            separate delivery periods.
          </span>
        </label>
      )}

      <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Reason {reasonRequired && <span style={{ color: "#B3261E" }}>— required when campaigns are added or removed</span>}
      </label>
      <input value={reason} onChange={e => setReason(e.target.value)}
             className="mt-1 w-full rounded-md px-3 py-2 text-sm"
             style={{ background: "var(--surface-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
    </div>
  );
}

// ── Group detail ─────────────────────────────────────────────────────────────

function GroupDetailPanel({ groupId, surveyId, onBack }: { groupId: string; surveyId: string; onBack: () => void }) {
  const [d, setD] = useState<GroupDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [gr, cr] = await Promise.all([
      fetch(`/api/studio/campaign-groups/${groupId}`),
      fetch(`/api/studio/surveys/${surveyId}/group-candidates?group_id=${groupId}`),
    ]);
    if (gr.ok) setD(await gr.json());
    if (cr.ok) setCandidates((await cr.json()).candidates ?? []);
  }, [groupId, surveyId]);

  useEffect(() => { load(); }, [load]);

  // A one-second tick drives the countdown only. It never re-evaluates anything.
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // N3: the SERVER says when its verdict expires. One timer to that instant,
  // then refetch — the client never infers eligibility, and so never infers
  // when eligibility lapses either.
  useEffect(() => {
    if (!d?.next_state_change_at) return;
    const ms = new Date(d.next_state_change_at).getTime() - Date.now();
    if (ms <= 0) { load(); return; }
    const t = setTimeout(load, ms + 500);
    return () => clearTimeout(t);
  }, [d?.next_state_change_at, load]);

  const act = async (fn: () => Promise<Response>, after?: () => void) => {
    setBusy(true); setErr(null);
    const r = await fn();
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "That did not work."); return; }
    after ? after() : load();
  };

  if (!d) return <div className="mt-8 text-xs" style={{ color: "var(--text-tertiary)" }}>Loading…</div>;

  const g = d.group;
  const goLive = d.go_live;

  return (
    <div className="mt-8">
      <button type="button" onClick={onBack} className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
        ← All campaign groups
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[16px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{g.name}</h3>
            <StatusBadge label={g.status === "live" ? "Live" : "Paused"} tone={g.status === "live" ? "success" : "neutral"} dot />
          </div>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-tertiary)" }}>{g.slug}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
            {d.current_revision ? "Change configuration" : "Add campaigns"}
          </Button>
          {g.status === "live" ? (
            <Button variant="secondary" size="sm" disabled={busy}
                    onClick={() => act(() => fetch(`/api/studio/campaign-groups/${groupId}`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "paused" }) }))}>
              Pause group
            </Button>
          ) : (
            <Button
              variant="primary" size="sm"
              disabled={busy || !goLive.allowed}
              title={goLive.allowed ? undefined : "This group cannot serve yet — see below"}
              onClick={() => {
                if (goLive.mode === "scheduled" && goLive.scheduled_at) {
                  const ok = window.confirm(
                    `This group will be live, but it will serve nothing until ${goLive.scheduled_campaign} becomes eligible at ${fmt(goLive.scheduled_at)}.\n\nContinue?`);
                  if (!ok) return;
                }
                act(() => fetch(`/api/studio/campaign-groups/${groupId}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "live" }) }));
              }}>
              Set live
            </Button>
          )}
        </div>
      </div>

      {err && <Card className="mt-3"><p className="text-sm" style={{ color: "var(--text-primary)" }}>{err}</p></Card>}

      {/* Why Set Live is unavailable — the server's reasons, per campaign. */}
      {g.status !== "live" && !goLive.allowed && (goLive.blockers?.length ?? 0) > 0 && (
        <Card className="mt-3">
          <p className="text-[13px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
            This group cannot be set live yet
          </p>
          <ul className="space-y-1">
            {goLive.blockers!.map(b => (
              <li key={b.campaign} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                <span className="font-mono">{b.campaign}</span> — {b.reasons.join("; ")}
                {b.note && <span className="block mt-0.5" style={{ color: "#8A4B2F" }}>{b.note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Serving now */}
      <h4 className="text-xs font-bold mt-5 mb-1.5 uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Serving now</h4>
      {!d.current_revision ? (
        <Card>
          <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
            {d.next_revision
              ? <>No configuration is in force yet. One is scheduled for {fmt(d.next_revision.effective_at)}.</>
              : <>This group has no campaigns yet.</>}
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>
            {d.current_revision.rotation} rotation · in force since {fmt(d.current_revision.effective_at)}
          </p>
          <MemberTable members={d.current_revision.members} />
        </Card>
      )}

      {/* Scheduled change, with the deletability countdown */}
      {d.next_revision && (
        <>
          <h4 className="text-xs font-bold mt-5 mb-1.5 uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Scheduled change</h4>
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {CHANGE_LABEL[d.next_revision.change_kind] ?? d.next_revision.change_kind}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  Takes effect {fmt(d.next_revision.effective_at)} · in <strong>{untilLabel(d.next_revision.effective_at, tick)}</strong>
                </p>
                {d.next_revision.reason && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{d.next_revision.reason}</p>
                )}
                {/* Deletability is a FACT the server already decided (can_delete).
                    Driving this sentence from it means the copy can never promise a
                    Delete the page is not offering: once the group holds effective
                    history it is undeletable whatever happens to this revision. */}
                <p className="text-[11px] mt-1.5" style={{ color: "#8A4B2F" }}>
                  {d.can_delete
                    ? <>This can be cancelled until then, and the group can be deleted until then.
                        Once it takes effect the group has published configuration history and can never be deleted.</>
                    : <>This can be cancelled until then. The group already has published configuration
                        history, so it cannot be deleted either way.</>}
                </p>
              </div>
              <Button variant="secondary" size="sm" disabled={busy}
                      onClick={() => act(() => fetch(`/api/studio/campaign-groups/${groupId}/revisions/${d.next_revision!.id}`, { method: "DELETE" }))}>
                Cancel
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* History */}
      {d.history.length > 0 && (
        <>
          <h4 className="text-xs font-bold mt-5 mb-1.5 uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Configuration history</h4>
          <Card>
            {d.history.map(h => (
              <div key={h.id} className="py-2" style={{ borderTop: "1px solid var(--border-default)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {CHANGE_LABEL[h.change_kind] ?? h.change_kind}
                  </span>
                  <StatusBadge
                    label={h.state === "effective" ? "In force" : h.state === "pending" ? "Scheduled"
                         : h.state === "cancelled" ? "Cancelled" : "Replaced"}
                    tone={h.state === "effective" ? "success" : h.state === "pending" ? "warning" : "neutral"} />
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {h.state === "cancelled"
                    ? <>Was due {fmt(h.effective_at)}, cancelled {fmt(h.cancelled_at!)}</>
                    : <>Effective {fmt(h.effective_at)}</>}
                  {" · "}{h.member_count} campaign{h.member_count === 1 ? "" : "s"} · {h.rotation} rotation
                </p>
                {h.reason && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{h.reason}</p>}
              </div>
            ))}
          </Card>
        </>
      )}

      {/* Delete — only while it has never governed delivery */}
      <div className="mt-5">
        {d.can_delete ? (
          <Button variant="secondary" size="sm" disabled={busy}
            onClick={() => {
              const extra = d.pending_count > 0
                ? `\n\nThe scheduled configuration and its frozen member snapshot will also be removed.`
                : "";
              if (!window.confirm(`Delete "${g.name}"?${extra}\n\nThis cannot be undone.`)) return;
              act(() => fetch(`/api/studio/campaign-groups/${groupId}`, { method: "DELETE" }), onBack);
            }}>
            <StudioIcon.trash size={14} /> Delete group
          </Button>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            This group has published configuration history and can no longer be deleted.
          </p>
        )}
      </div>

      {editing && candidates && (
        <ConfigureFlow
          surveyId={surveyId}
          candidates={candidates}
          existing={{
            id: groupId, slug: g.slug, name: g.name,
            members: d.current_revision?.members ?? [],
            rotation: d.current_revision?.rotation ?? "equal",
          }}
          onClose={() => setEditing(false)}
          onDone={() => { setEditing(false); load(); }}
          onError={setErr}
        />
      )}
    </div>
  );
}

function MemberTable({ members }: { members: RevisionMemberView[] }) {
  const total = members.filter(m => m.membership_state !== "paused").reduce((s, m) => s + m.weight, 0);
  return (
    <div>
      {members.map(m => (
        <div key={m.campaign_id} className="flex items-start justify-between gap-3 py-1.5"
             style={{ borderTop: "1px solid var(--border-default)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-mono truncate" style={{ color: "var(--text-primary)" }}>{m.campaign_slug}</span>
              {m.membership_state === "paused" && <StatusBadge label="Paused" tone="neutral" />}
              {m.membership_state !== "paused" && m.eligible === false && <StatusBadge label="Not serving" tone="warning" />}
            </div>
            {(m.readiness_reasons?.length ?? 0) > 0 && (
              <p className="text-[11px] mt-0.5" style={{ color: "#8A4B2F" }}>{m.readiness_reasons!.join("; ")}</p>
            )}
          </div>
          <span className="text-[11px] shrink-0" style={{ color: "var(--text-secondary)" }}>
            {m.membership_state === "paused" ? "paused" : `${m.weight} · ${share(m.weight, total)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

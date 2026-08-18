"use client";

// ── Create → Campaigns: two-part deployment configuration ─────────────────────
// PART 1 — Plan distribution: which Publishers run in which markets. Each Publisher
//   owns a Markets selector (a searchable modal), so this scales well past 30
//   markets — no giant grid.
// PART 2 — Configure campaigns: the generated Campaigns as an INDIVIDUALLY editable
//   list (Target, Keep/Stop, Start, End inline on every row). Multi-select + Bulk
//   Edit is an accelerator on top; editing a single Campaign is always available.
//
// Every Campaign stays DRAFT — no Status selector, no Pause/Live/Closed (those live
// in Deploy/Manage; Deploy is the sole activation gate). Delivery Language is
// governed (derived from the market) and shown read-only. Target totals entered in
// Bulk Edit are ALLOCATED across the selection (exact sum), never duplicated.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Eyebrow } from "@/app/components/workspace-ui";
import { useCampaignSelection } from "@/app/components/campaigns/useCampaignSelection";
import { stageHref } from "../create-stages";
import { countryByCode } from "@/lib/countries";
import { LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import { resolveDeployTargetStatus } from "@/lib/campaign-time";
import { previewHref, DeployConfirmModal, StatusPill, GoLiveUndo, type DeployItem } from "../deploy/DeployShared";
import {
  allocateTarget, governedLanguagesForMarket, validateCampaignConfig, campaignsReadyForDeploy,
  type CampaignConfig,
} from "@/lib/studio/campaign-generation";

interface StudioCampaign extends CampaignConfig {
  id: string;
  campaign_id: string;
  publisher_org_id: string;
  publisher_name: string;
  market: string;
  country_code: string;
  survey_language: string;
  status: string;
  updated_at: string;
  status_updated_at?: string | null;
}
interface Context {
  surveyName: string;
  markets: string[];
  creativeDesign: string | null;
  currentOrg: { id: string; name: string } | null;
  canCommission: boolean;
  publishers: { id: string; name: string }[];
}
type Selection = { publisherOrgId: string; countryCode: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${MONTHS[Number(m) - 1] ?? "?"} ${y}`; };
const langName = (c: string) => LANGUAGE_DISPLAY_NAMES[c] ?? c;
const marketLangs = (code: string) => governedLanguagesForMarket(code);
const marketName = (code: string) => countryByCode(code)?.name ?? code;

const INPUT = "px-2.5 py-1.5 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]";
const IST = { background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" } as const;

export function CampaignsStage({ surveyId, onReadyChange }: { surveyId: string; onReadyChange?: (ready: boolean) => void }) {
  const [campaigns, setCampaigns] = useState<StudioCampaign[]>([]);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set()); // commissioned: publishers added but maybe market-less
  const [marketsFor, setMarketsFor] = useState<string | null>(null); // publisher id whose Markets modal is open
  const [editOpen, setEditOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(true); // Distribution plan collapsible; open while configuring
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [deployIds, setDeployIds] = useState<string[]>([]);
  const [deployItems, setDeployItems] = useState<DeployItem[]>([]);
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = useCampaignSelection();
  const base = `/api/studio/surveys/${surveyId}/campaigns`;
  const didInit = useRef(false);

  const post = useCallback(async (selections: Selection[]) => {
    setBusy(true);
    try {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selections }) });
      if (res.ok) { setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]); clearSelection(); }
    } finally { setBusy(false); }
  }, [base, clearSelection]);

  const mutate = useCallback(async (method: "PATCH" | "DELETE", body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]); }
    } finally { setBusy(false); }
  }, [base]);

  // Deliberate Deploy from a card. The confirm shows the SERVER-decided outcome
  // (Live now vs Scheduled) as a preview; the /deploy endpoint re-decides
  // authoritatively. Only ready Draft campaigns are eligible.
  const openDeployConfirm = useCallback((ids: string[]) => {
    const now = new Date();
    const ready = campaigns.filter((c) => ids.includes(c.id) && c.status === "draft" && validateCampaignConfig(c).length === 0);
    if (!ready.length) return;
    setDeployIds(ready.map((c) => c.id));
    setDeployItems(ready.map((c) => ({ label: `${c.publisher_name} · ${c.market} (${langName(c.survey_language)})`, outcome: resolveDeployTargetStatus(c.start_date, c.country_code, now), startDate: c.start_date })));
  }, [campaigns]);
  const doDeploy = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: deployIds }) });
      if (res.ok) { setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]); clearSelection(); }
    } finally { setBusy(false); setDeployIds([]); setDeployItems([]); }
  }, [base, deployIds, clearSelection]);

  // Return a campaign to Draft — server-authoritative + race-safe. Covers a
  // Scheduled (not-yet-started) campaign AND the "undo an accidental go-live" of a
  // just-Live campaign (within the grace window). `live` here means the caller is
  // showing the undo affordance; the server still enforces the window.
  const returnToDraft = useCallback(async (id: string, live = false) => {
    const msg = live
      ? "Undo go-live and return this campaign to Draft? It will stop collecting. You can deploy it again when ready."
      : "Return this campaign to Draft? It will stop being scheduled and won't deploy until you deploy it again.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/return-to-draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); }
  }, [base]);

  // Stop collecting: end a running campaign (→ Ended). The always-available way to
  // end a run, even with no end date / target. Reversible via Reopen.
  const stopCollecting = useCallback(async (id: string) => {
    if (!window.confirm("Stop collecting for this campaign? It will end and stop serving. You can reopen it to Draft later if you need to run it again.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); }
  }, [base]);

  // Reopen an Ended campaign back to Draft so it can be edited and re-deployed.
  const reopen = useCallback(async (id: string) => {
    if (!window.confirm("Reopen this campaign to Draft? You'll need to deploy it again to start collecting.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); }
  }, [base]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // Start is now required. Normalise any legacy null-start campaigns to today so
    // they match the required-start model (one batched PATCH, not per-row).
    const ensureStarts = async (list: StudioCampaign[]): Promise<StudioCampaign[]> => {
      const missing = list.filter((c) => !c.start_date);
      if (!missing.length) return list;
      const r = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: missing.map((c) => ({ id: c.id, patch: { start_date: today } })) }) });
      return r.ok ? (((await r.json()).campaigns ?? []) as StudioCampaign[]) : list;
    };
    (async () => {
      try {
        const res = await fetch(base);
        if (!res.ok) { setPhase("error"); return; }
        const data = await res.json();
        setCtx(data.context as Context);
        let list = (data.campaigns ?? []) as StudioCampaign[];
        // Self-service, first visit → auto-generate the default plan (Current Org ×
        // every market). Commissioned waits for the user to plan distribution.
        if (!(data.context as Context).canCommission && list.length === 0) {
          const gen = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selections: [] }) });
          if (gen.ok) list = ((await gen.json()).campaigns ?? []) as StudioCampaign[];
        }
        setCampaigns(await ensureStarts(list));
        setPhase("ready");
      } catch { setPhase("error"); }
    })();
  }, [base, today]);

  // ── Distribution plan (Publisher → markets) ───────────────────────────────────
  const planMap = useCallback((): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const c of campaigns) { if (!m.has(c.publisher_org_id)) m.set(c.publisher_org_id, new Set()); m.get(c.publisher_org_id)!.add(c.country_code); }
    if (ctx?.canCommission) for (const pid of added) if (!m.has(pid)) m.set(pid, new Set());
    return m;
  }, [campaigns, added, ctx]);

  const toSelections = (m: Map<string, Set<string>>): Selection[] => {
    const out: Selection[] = [];
    for (const [pid, set] of m) for (const cc of set) out.push({ publisherOrgId: pid, countryCode: cc });
    return out;
  };
  const setPublisherMarkets = useCallback((pid: string, markets: string[]) => { const m = planMap(); m.set(pid, new Set(markets)); post(toSelections(m)); }, [planMap, post]);
  const removePublisher = useCallback((pid: string) => { const m = planMap(); m.delete(pid); setAdded((p) => { const n = new Set(p); n.delete(pid); return n; }); post(toSelections(m)); }, [planMap, post]);
  const addPublisher = useCallback((pid: string) => { setAdded((p) => new Set(p).add(pid)); setMarketsFor(pid); }, []);

  // ── Config edits ──────────────────────────────────────────────────────────────
  const editLocal = useCallback((id: string, p: Partial<CampaignConfig>) => setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c))), []);
  const commit = useCallback((id: string, p: Partial<CampaignConfig>) => mutate("PATCH", { id, patch: p }), [mutate]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const ready = useMemo(() => campaignsReadyForDeploy(campaigns), [campaigns]);
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const distinctPubs = useMemo(() => new Set(campaigns.map((c) => c.publisher_org_id)), [campaigns]);
  const distinctMarkets = useMemo(() => new Set(campaigns.map((c) => c.country_code)), [campaigns]);
  const totalTarget = useMemo(() => campaigns.reduce((s, c) => s + (c.target_responses ?? 0), 0), [campaigns]);
  const anyTarget = campaigns.some((c) => c.target_responses != null);
  const statusCounts = useMemo(() => {
    const s = { draft: 0, scheduled: 0, live: 0 };
    for (const c of campaigns) { if (c.status === "draft") s.draft++; else if (c.status === "scheduled") s.scheduled++; else if (c.status === "live") s.live++; }
    return s;
  }, [campaigns]);
  const groups = useMemo(() => {
    const m = new Map<string, StudioCampaign[]>();
    for (const c of campaigns) { if (!m.has(c.publisher_org_id)) m.set(c.publisher_org_id, []); m.get(c.publisher_org_id)!.push(c); }
    return [...m.entries()].map(([pid, list]) => ({ pid, name: list[0]?.publisher_name ?? "Publisher", list }));
  }, [campaigns]);
  const allIds = campaigns.map((c) => c.id);
  const selectedCampaigns = useMemo(() => campaigns.filter((c) => selectedIds.has(c.id)), [campaigns, selectedIds]);
  const selectedReadyIds = useMemo(() => selectedCampaigns.filter((c) => c.status === "draft" && validateCampaignConfig(c).length === 0).map((c) => c.id), [selectedCampaigns]);

  if (phase === "loading") return <Card className="mt-6 p-6"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading deployments…</p></Card>;
  if (phase === "error" || !ctx) return <Card className="mt-6 p-6"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Could not load campaigns. Reload to try again.</p></Card>;

  const pMap = planMap();
  const displayedPubIds = ctx.canCommission
    ? [...new Set([...campaigns.map((c) => c.publisher_org_id), ...added])]
    : (ctx.currentOrg ? [ctx.currentOrg.id] : []);
  const nameOf = (pid: string) => (ctx.currentOrg?.id === pid ? ctx.currentOrg.name : ctx.publishers.find((p) => p.id === pid)?.name ?? campaigns.find((c) => c.publisher_org_id === pid)?.publisher_name ?? "Publisher");
  const availableToAdd = ctx.publishers.filter((p) => !displayedPubIds.includes(p.id));
  const marketsModalSelected = marketsFor ? [...(pMap.get(marketsFor) ?? [])] : [];
  // Publishers in the plan with no markets yet — surfaced in the collapsed summary
  // so a collapsed plan never hides an unresolved state.
  const planEmptyCount = displayedPubIds.filter((pid) => !(pMap.get(pid)?.size)).length;

  return (
    <div className="mt-6 space-y-5">
      <div>
        <Eyebrow>Deployments</Eyebrow>
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
          Plan who distributes where, then configure how much each campaign collects and when. Campaigns stay Draft until you Deploy.
        </p>
      </div>

      {/* Summary */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span><strong style={{ color: "var(--text-primary)" }}>{campaigns.length}</strong> campaign{campaigns.length === 1 ? "" : "s"}</span>
          <span><strong style={{ color: "var(--text-primary)" }}>{distinctPubs.size}</strong> publisher{distinctPubs.size === 1 ? "" : "s"}</span>
          <span><strong style={{ color: "var(--text-primary)" }}>{distinctMarkets.size}</strong> market{distinctMarkets.size === 1 ? "" : "s"}</span>
          {statusCounts.draft > 0 && <span><strong style={{ color: "var(--text-primary)" }}>{statusCounts.draft}</strong> Draft</span>}
          {statusCounts.scheduled > 0 && <span><strong style={{ color: "var(--text-primary)" }}>{statusCounts.scheduled}</strong> Scheduled</span>}
          {statusCounts.live > 0 && <span><strong style={{ color: "var(--text-primary)" }}>{statusCounts.live}</strong> Live</span>}
          <span>Total target <strong style={{ color: "var(--text-primary)" }}>{anyTarget ? totalTarget.toLocaleString() : "not set"}</strong></span>
          {ctx.creativeDesign && <span className="opacity-70">Creative: {ctx.creativeDesign}</span>}
        </div>
      </Card>

      {/* PART 1 — Plan distribution (collapsible) */}
      <div>
        <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setPlanOpen((o) => !o)} aria-expanded={planOpen}>
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-[15px] font-bold tracking-[-0.01em] shrink-0" style={{ color: "var(--text-primary)" }}>1 · Plan distribution</span>
            {!planOpen && (
              <span className="text-[12px] truncate" style={{ color: "var(--text-tertiary)" }}>
                · {displayedPubIds.length} publisher{displayedPubIds.length === 1 ? "" : "s"} · {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · {distinctMarkets.size} market{distinctMarkets.size === 1 ? "" : "s"}
                {planEmptyCount > 0 && <span style={{ color: "#8A4B2F" }}> · {planEmptyCount} need{planEmptyCount === 1 ? "s" : ""} markets</span>}
              </span>
            )}
          </span>
          <span className="text-[12px] font-semibold shrink-0 inline-flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>
            {planOpen ? "Collapse" : "Expand"}<span aria-hidden>{planOpen ? "▲" : "▼"}</span>
          </span>
        </button>
        {planOpen && (ctx.markets.length === 0 ? (
          <Card className="mt-2 p-4"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Add at least one market in About to plan deployments.</p></Card>
        ) : (
          <Card className="mt-2 p-0 overflow-hidden">
            {/* Compact one-row-per-publisher list; scrolls when there are many. */}
            <div style={{ maxHeight: displayedPubIds.length > 8 ? 360 : undefined, overflowY: displayedPubIds.length > 8 ? "auto" : undefined }}>
              {displayedPubIds.map((pid, i) => {
                const mk = [...(pMap.get(pid) ?? [])];
                return (
                  <div key={pid} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{nameOf(pid)}</div>
                      <div className="text-[12px] truncate" style={{ color: mk.length ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                        {mk.length ? mk.map(marketName).slice(0, 5).join(", ") + (mk.length > 5 ? ` +${mk.length - 5}` : "") : "No markets yet"}
                      </div>
                    </div>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>{mk.length} market{mk.length === 1 ? "" : "s"}</span>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => setMarketsFor(pid)}>Edit Markets</Button>
                    {ctx.canCommission && (
                      <button className="text-[12px] underline opacity-60 hover:opacity-100" style={{ color: "var(--text-tertiary)" }} disabled={busy} onClick={() => removePublisher(pid)} aria-label={`Remove ${nameOf(pid)}`}>Remove</button>
                    )}
                  </div>
                );
              })}
            </div>
            {ctx.canCommission && availableToAdd.length > 0 && (
              <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <select className={INPUT} style={IST} value="" disabled={busy} onChange={(e) => { if (e.target.value) addPublisher(e.target.value); }}>
                  <option value="">+ Add publisher…</option>
                  {availableToAdd.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* PART 2 — Configure campaigns */}
      <div>
        <div className="text-[15px] font-bold tracking-[-0.01em] mb-1" style={{ color: "var(--text-primary)" }}>2 · Configure campaigns</div>
        {campaigns.length === 0 ? (
          <Card className="p-4"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No campaigns yet. Choose markets for a Publisher above to generate them.</p></Card>
        ) : (
          <>
            {/* Selection toolbar (sticky) */}
            {selectedIds.size > 0 && (
              <div role="toolbar" aria-label="Bulk actions" className="sticky top-2 z-10 rounded-[var(--radius-control)] px-4 py-2.5 mb-2 flex flex-wrap items-center gap-2 shadow-lg" style={{ background: "#0B1929", color: "#fff" }}>
                <span className="text-sm font-medium mr-1" aria-live="polite">{selectedIds.size} selected</span>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditOpen(true)}>Bulk edit</Button>
                {selectedReadyIds.length > 0 && (
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => openDeployConfirm(selectedReadyIds)}>Deploy ({selectedReadyIds.length})</Button>
                )}
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={() => { if (confirm(`Delete ${selectedIds.size} campaign${selectedIds.size === 1 ? "" : "s"}?`)) mutate("DELETE", { ids: [...selectedIds] }).then(clearSelection); }}>Delete</Button>
                <button className="ml-auto text-[13px] underline opacity-80 hover:opacity-100" onClick={clearSelection}>Clear</button>
              </div>
            )}

            <div className="flex items-center gap-2 px-1 mb-1.5">
              <input type="checkbox" className="w-4 h-4 accent-[#0B1929] cursor-pointer" aria-label="Select all campaigns"
                checked={allIds.length > 0 && allIds.every((id) => selectedIds.has(id))} onChange={() => toggleSelectAll(allIds)} />
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Select all {campaigns.length}</span>
            </div>

            <div>
              {groups.map((g, gi) => (
                // A divider + generous gap separates each Publisher group so they
                // read as distinct sections (the first group stays flush).
                <div key={g.pid} className={`space-y-1.5 ${gi > 0 ? "mt-6 pt-6 border-t" : ""}`} style={gi > 0 ? { borderColor: "var(--border-default)" } : undefined}>
                  {ctx.canCommission && (
                    <div className="flex items-center gap-2 px-1 pb-0.5">
                      <input type="checkbox" className="w-4 h-4 accent-[#0B1929] cursor-pointer" aria-label={`Select all campaigns for ${g.name}`}
                        checked={g.list.every((c) => selectedIds.has(c.id))} onChange={() => toggleSelectAll(g.list.map((c) => c.id))} />
                      <span className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{g.name}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{g.list.length} campaign{g.list.length === 1 ? "" : "s"}</span>
                    </div>
                  )}
                  {g.list.map((c) => (
                    <ConfigRow key={c.id} c={c} surveyId={surveyId} name={`${ctx.surveyName} · ${c.publisher_name} · ${c.market}`} today={today} busy={busy} selected={selectedIds.has(c.id)}
                      onToggle={() => toggleSelect(c.id)} onEditLocal={(p) => editLocal(c.id, p)} onCommit={(p) => commit(c.id, p)} onDeploy={openDeployConfirm} onReturnToDraft={returnToDraft} onStop={stopCollecting} onReopen={reopen} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {marketsFor && (
        <MarketsModal title={nameOf(marketsFor)} markets={ctx.markets} selected={marketsModalSelected}
          onClose={() => setMarketsFor(null)}
          onDone={(sel) => { const pid = marketsFor; setMarketsFor(null); setPublisherMarkets(pid, sel); }} />
      )}
      {editOpen && (
        <BulkEditModal count={selectedCampaigns.length} today={today}
          onClose={() => setEditOpen(false)}
          onApply={(build) => { mutate("PATCH", { updates: build(selectedCampaigns) }).then(clearSelection); setEditOpen(false); }} />
      )}
      {deployItems.length > 0 && (
        <DeployConfirmModal items={deployItems} busy={busy} onConfirm={doDeploy} onClose={() => { setDeployItems([]); setDeployIds([]); }} />
      )}
    </div>
  );
}

// One compact inline labelled field: subdued uppercase label, stronger value,
// kept on one line so the metadata scans as a single dense row that wraps.
function InlineMeta({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="uppercase text-[10px] tracking-[0.04em] mr-1" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="font-medium" style={{ color: warn ? "#8A4B2F" : "var(--text-primary)" }}>{value}</span>
    </span>
  );
}

// ── Campaign card: dense identity + status, one metadata line, a coherent action
//    bar. Status-aware actions — Draft: Preview/Get Tags/Deploy/Edit;
//    Scheduled: Preview/Get Tags/Return to Draft; Live: Preview/Get Tags. Edit opens
//    the inline editor accordion (Draft only). Deploy/Return-to-Draft are the
//    deliberate, server-authoritative transitions. ─────────────────────────────────
function ConfigRow({ c, surveyId, name, today, busy, selected, onToggle, onEditLocal, onCommit, onDeploy, onReturnToDraft, onStop, onReopen }: {
  c: StudioCampaign; surveyId: string; name: string; today: string; busy: boolean; selected: boolean;
  onToggle: () => void; onEditLocal: (p: Partial<CampaignConfig>) => void; onCommit: (p: Partial<CampaignConfig>) => void;
  onDeploy: (ids: string[]) => void; onReturnToDraft: (id: string, live?: boolean) => void;
  onStop: (id: string) => void; onReopen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const problems = validateCampaignConfig(c);
  const isDraft = c.status === "draft";
  const isScheduled = c.status === "scheduled";
  const isLive = c.status === "live";
  const isEnded = c.status === "closed";
  const deployReady = isDraft && problems.length === 0;
  const preview = () => window.open(previewHref(c.campaign_id, c.survey_language, c.country_code), "_blank", "noopener");
  const tagsHref = `${stageHref(surveyId, "deploy")}&campaign=${encodeURIComponent(c.campaign_id)}`;

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[#0B1929] cursor-pointer" checked={selected} onChange={onToggle} aria-label={`Select ${name}`} />
        <div className="min-w-0 flex-1">
          {/* Identity + status */}
          <div className="flex items-start justify-between gap-3">
            <div className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>{name}</div>
            <div className="shrink-0"><StatusPill status={c.status} /></div>
          </div>

          {/* One dense metadata line (Status lives in the pill above). */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <InlineMeta label="Language" value={langName(c.survey_language)} />
            <InlineMeta label="Target" value={c.target_responses != null ? `${c.target_responses.toLocaleString()}` : "No target"} />
            <InlineMeta label="Collecting" value={c.target_mode === "stop" ? "Stop" : "Keep"} />
            <InlineMeta label="Start" value={c.start_date ? fmtDate(c.start_date) : "Not set"} warn={!c.start_date} />
            <InlineMeta label="End" value={c.end_date ? fmtDate(c.end_date) : "No end date"} />
          </div>
          {isDraft && problems.length > 0 && <div className="mt-1 text-[11px]" style={{ color: "#8A4B2F" }}>{problems.join(" ")}</div>}

          {/* Action bar */}
          <div className="mt-4 flex items-center gap-1.5 flex-wrap justify-start">
            <Button variant="secondary" size="sm" onClick={preview}>Preview</Button>
            <Button variant="secondary" size="sm" href={tagsHref}>Get Tags</Button>
            {isDraft && <Button variant="primary" size="sm" disabled={!deployReady || busy} onClick={() => onDeploy([c.id])} title={deployReady ? undefined : (problems[0] ?? "")}>Deploy</Button>}
            {isDraft && <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Collapse campaign editor" : "Edit campaign"}>{open ? "Done" : "Edit"}</Button>}
            {isScheduled && <Button variant="brand" size="sm" disabled={busy} onClick={() => onReturnToDraft(c.id)}>Return to Draft</Button>}
            {isLive && <GoLiveUndo statusUpdatedAt={c.status_updated_at} busy={busy} onUndo={() => onReturnToDraft(c.id, true)} />}
            {isLive && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onStop(c.id)}>Stop collecting</Button>}
            {isEnded && <Button variant="brand" size="sm" disabled={busy} onClick={() => onReopen(c.id)}>Reopen to Draft</Button>}
          </div>

          {open && isDraft && (
            <div className="mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>Target
                <input className={INPUT} style={{ ...IST, width: 92 }} inputMode="numeric" placeholder="none" value={c.target_responses ?? ""} disabled={busy}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); onEditLocal({ target_responses: v ? Number(v) : null }); }}
                  onBlur={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); onCommit({ target_responses: v ? Number(v) : null }); }} />
              </label>
              <select className={INPUT} style={IST} value={c.target_mode ?? "continue"} disabled={busy} onChange={(e) => onCommit({ target_mode: e.target.value })} aria-label="Collection behaviour">
                <option value="continue">Keep collecting</option>
                <option value="stop">Stop collecting</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>Start
                <input type="date" className={INPUT} style={IST} value={c.start_date ?? ""} disabled={busy} onChange={(e) => onCommit({ start_date: e.target.value || null })} aria-label="Start date" />
              </label>
              <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>End
                <select className={INPUT} style={IST} value={c.end_date ? "date" : "manual"} disabled={busy} onChange={(e) => onCommit({ end_date: e.target.value === "date" ? (c.start_date ?? today) : null })}>
                  <option value="manual">No end date</option>
                  <option value="date">On date</option>
                </select>
                {c.end_date && <input type="date" className={INPUT} style={IST} min={c.start_date ?? today} value={c.end_date} disabled={busy} onChange={(e) => onCommit({ end_date: e.target.value || null })} />}
              </label>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Markets selector modal (searchable; scales past 30 markets) ────────────────
function MarketsModal({ title, markets, selected, onClose, onDone }: {
  title: string; markets: string[]; selected: string[]; onClose: () => void; onDone: (selected: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState("");
  const filtered = markets.filter((code) => marketName(code).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (code: string) => setSel((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.45)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Markets for ${title}`} className="w-full max-w-md rounded-[var(--radius-card)] p-5 flex flex-col" style={{ background: "var(--surface)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Markets · {title}</div>
        <div className="flex items-center gap-2 mt-2 mb-1">
          <input className={INPUT} style={{ ...IST, flex: 1 }} placeholder="Search markets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search markets" />
          <button className="text-[12px] underline opacity-70 hover:opacity-100" style={{ color: "var(--text-tertiary)" }} onClick={() => setSel(new Set(markets))}>All</button>
          <button className="text-[12px] underline opacity-70 hover:opacity-100" style={{ color: "var(--text-tertiary)" }} onClick={() => setSel(new Set())}>None</button>
        </div>
        <div className="overflow-y-auto -mx-1 px-1 py-1 flex-1">
          {filtered.length === 0 ? <p className="text-sm py-3" style={{ color: "var(--text-tertiary)" }}>No markets match.</p> : filtered.map((code) => (
            <label key={code} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#0B1929]" checked={sel.has(code)} onChange={() => toggle(code)} />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{marketName(code)}</span>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{marketLangs(code).map(langName).join(", ")}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{sel.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => onDone([...sel])}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// One selective property row for the Bulk Edit modal (module-level = stable).
function PropRow({ on, setOn, label, children }: { on: boolean; setOn: (b: boolean) => void; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <label className="flex items-center gap-2 min-w-[150px] cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-[#0B1929]" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
      </label>
      <div className={on ? "" : "opacity-40 pointer-events-none"}>{children}</div>
    </div>
  );
}

// ── Bulk Edit modal — accelerator; only ticked properties change. Target total is
//    ALLOCATED across the selection (exact sum). Individual row editing stays live. ─
function BulkEditModal({ count, today, onClose, onApply }: {
  count: number; today: string; onClose: () => void;
  onApply: (build: (selected: StudioCampaign[]) => { id: string; patch: Record<string, unknown> }[]) => void;
}) {
  const [tOn, setTOn] = useState(false); const [tVal, setTVal] = useState("");
  const [mOn, setMOn] = useState(false); const [mVal, setMVal] = useState<"continue" | "stop">("continue");
  const [sOn, setSOn] = useState(false); const [sVal, setSVal] = useState("");
  const [eOn, setEOn] = useState(false); const [eVal, setEVal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const totalNum = tVal ? Number(tVal) : null;
  const preview = tOn && totalNum ? allocateTarget(totalNum, count) : null;

  const apply = () => {
    if (!tOn && !mOn && !sOn && !eOn) { setError("Tick at least one property to change."); return; }
    if (tOn && tVal && (!Number.isInteger(Number(tVal)) || Number(tVal) <= 0)) { setError("Response target must be a positive whole number."); return; }
    if (sOn && !sVal) { setError("Pick a start date to apply."); return; }
    onApply((selected) => {
      const alloc = tOn ? (tVal ? allocateTarget(Number(tVal), selected.length) : selected.map(() => null)) : [];
      return selected.map((c, i) => ({
        id: c.id,
        patch: {
          ...(tOn ? { target_responses: alloc[i] } : {}),
          ...(mOn ? { target_mode: mVal } : {}),
          ...(sOn ? { start_date: sVal || null } : {}),
          ...(eOn ? { end_date: eVal || null } : {}),
        },
      }));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.45)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bulk edit campaigns" className="w-full max-w-md rounded-[var(--radius-card)] p-5" style={{ background: "var(--surface)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>Bulk edit {count} campaign{count === 1 ? "" : "s"}</div>
        <p className="text-[12px] mb-3" style={{ color: "var(--text-tertiary)" }}>Only ticked properties change. Others stay as each campaign has them. You can still edit any campaign individually afterwards.</p>

        <PropRow on={tOn} setOn={setTOn} label="Response target">
          <input className={INPUT} style={{ ...IST, width: 110 }} inputMode="numeric" placeholder="total (or blank)" value={tVal} onChange={(e) => setTVal(e.target.value.replace(/[^0-9]/g, ""))} />
        </PropRow>
        {preview && <div className="ml-[150px] -mt-1 mb-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>{totalNum!.toLocaleString()} allocated across {count} → {preview.slice(0, 6).join(" / ")}{preview.length > 6 ? " …" : ""}</div>}
        <PropRow on={mOn} setOn={setMOn} label="Collection behaviour">
          <select className={INPUT} style={IST} value={mVal} onChange={(e) => setMVal(e.target.value as "continue" | "stop")}>
            <option value="continue">Keep collecting</option>
            <option value="stop">Stop collecting</option>
          </select>
        </PropRow>
        <PropRow on={sOn} setOn={setSOn} label="Start">
          <input type="date" className={INPUT} style={IST} value={sVal} onChange={(e) => setSVal(e.target.value)} />
        </PropRow>
        <PropRow on={eOn} setOn={setEOn} label="End">
          <input type="date" className={INPUT} style={IST} min={sVal || today} value={eVal} onChange={(e) => setEVal(e.target.value)} />
          <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>blank = no end date</span>
        </PropRow>

        {error && <div className="mt-2 text-[12px]" style={{ color: "#8A4B2F" }}>{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={apply}>Apply</Button>
        </div>
      </div>
    </div>
  );
}

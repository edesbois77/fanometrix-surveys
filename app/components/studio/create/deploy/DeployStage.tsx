"use client";

// ── Create → Deploy: the technical implementation workspace ────────────────────
// NOT a second campaign-management screen (planning/targets/bulk edit/delete/
// operational controls all live in Campaigns). Deploy answers: "how do I implement
// THIS campaign with the Publisher?" — a compact campaign selector + the selected
// campaign's deployment workspace (the reused DeploymentBuilder: placement,
// ad-server, preview, iframe/script tags, integration instructions).
//
// Deploy / Return-to-Draft are the deliberate, server-authoritative transitions.
// Preview/Get Tags never mutate state. ?stage=deploy&campaign=<slug> deep-links a
// campaign; with no campaign a deterministic default is selected and pinned to the
// URL so refresh/back behave sensibly.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Eyebrow } from "@/app/components/workspace-ui";
import { stageHref } from "../create-stages";
import { LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import { validateCampaignConfig, type CampaignConfig } from "@/lib/studio/campaign-generation";
import { resolveDeployTargetStatus } from "@/lib/campaign-time";
import { DeploymentBuilder } from "@/app/campaign-deployment/page";
import { StatusPill, DeployConfirmModal, GoLiveUndo, type DeployItem } from "./DeployShared";
import { DeployGroupTags } from "./DeployGroupTags";

interface StudioCampaign extends CampaignConfig {
  id: string; campaign_id: string; publisher_org_id: string; publisher_name: string;
  market: string; country_code: string; survey_language: string; status: string;
  status_updated_at?: string | null;
}
const langName = (c: string) => LANGUAGE_DISPLAY_NAMES[c] ?? c;
const statusLabel = (s: string) => STATUS_META[(s as CampaignStatus)]?.label ?? s;
const isReady = (c: StudioCampaign) => c.status === "draft" && validateCampaignConfig(c).length === 0;

export function DeployStage({
  surveyId,
  campaignGroupsEnabled = false,
}: {
  surveyId: string;
  campaignGroupsEnabled?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const focusSlug = params.get("campaign");
  const [campaigns, setCampaigns] = useState<StudioCampaign[]>([]);
  const [surveyName, setSurveyName] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [confirmItems, setConfirmItems] = useState<DeployItem[]>([]);
  const base = `/api/studio/surveys/${surveyId}/campaigns`;
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        const res = await fetch(base);
        if (!res.ok) { setPhase("error"); return; }
        const data = await res.json();
        setCampaigns((data.campaigns ?? []) as StudioCampaign[]);
        setSurveyName((data.context?.surveyName as string) ?? "");
        setPhase("ready");
      } catch { setPhase("error"); }
    })();
  }, [base]);

  const fullName = useCallback((c: StudioCampaign) => `${surveyName} · ${c.publisher_name} · ${c.market}`, [surveyName]);
  const focus = useMemo(() => campaigns.find((c) => c.campaign_id === focusSlug) ?? null, [campaigns, focusSlug]);
  const select = (slug: string) => router.push(`${stageHref(surveyId, "deploy")}&campaign=${encodeURIComponent(slug)}`);

  // Deterministic default: pin the first campaign to the URL when none is supplied.
  useEffect(() => {
    if (phase === "ready" && !focusSlug && campaigns.length > 0) {
      router.replace(`${stageHref(surveyId, "deploy")}&campaign=${encodeURIComponent(campaigns[0].campaign_id)}`);
    }
  }, [phase, focusSlug, campaigns, router, surveyId]);

  const openConfirm = useCallback((c: StudioCampaign) => {
    if (!isReady(c)) return;
    setConfirmIds([c.id]);
    setConfirmItems([{ label: fullName(c), outcome: resolveDeployTargetStatus(c.start_date, c.country_code, new Date()), startDate: c.start_date }]);
  }, [fullName]);
  const doDeploy = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: confirmIds }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); setConfirmIds([]); setConfirmItems([]); }
  }, [base, confirmIds]);
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
  const stopCollecting = useCallback(async (id: string) => {
    if (!window.confirm("Stop collecting for this campaign? It will end and stop serving. You can reopen it to Draft later if you need to run it again.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); }
  }, [base]);
  const reopen = useCallback(async (id: string) => {
    if (!window.confirm("Reopen this campaign to Draft? You'll need to deploy it again to start collecting.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) setCampaigns(((await res.json()).campaigns ?? []) as StudioCampaign[]);
    } finally { setBusy(false); }
  }, [base]);

  if (phase === "loading") return <Card className="mt-6 p-6"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p></Card>;
  if (phase === "error") return <Card className="mt-6 p-6"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Could not load deployments. Reload to try again.</p></Card>;
  if (campaigns.length === 0) {
    return <Card className="mt-6 p-6"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No campaigns yet. Go to <Link href={stageHref(surveyId, "campaigns")} className="underline">Campaigns</Link> to plan distribution.</p></Card>;
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <Eyebrow>Deploy</Eyebrow>
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
          Configure implementation, preview the placement and retrieve the Publisher tags for each campaign.
        </p>
      </div>

      {/* Selector + selected-campaign identity + deliberate action in ONE card, so
          the selector and the identity read as one region (not two duplicated
          identity cards). DeploymentBuilder supplies the rest below. */}
      <Card className="p-4">
        <label className="block text-[11px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--text-tertiary)" }}>Campaign</label>
        <select className="w-full max-w-xl px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
          style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
          value={focus?.campaign_id ?? ""} onChange={(e) => select(e.target.value)}>
          {campaigns.map((c) => <option key={c.id} value={c.campaign_id}>{fullName(c)} — {statusLabel(c.status)}</option>)}
        </select>

        {focus && (
          <div className="mt-3 pt-3 flex items-start justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="min-w-0">
              <div className="text-lg font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{fullName(focus)}</div>
              <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <span>{langName(focus.survey_language)}</span>
                <StatusPill status={focus.status} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {focus.status === "draft" && (
                <>
                  <Button variant="primary" size="sm" disabled={!isReady(focus) || busy} onClick={() => openConfirm(focus)}>Deploy</Button>
                  {!isReady(focus) && <span className="text-[11px] text-right max-w-[220px]" style={{ color: "#8A4B2F" }}>{validateCampaignConfig(focus)[0] ?? "Not ready to deploy."}</span>}
                </>
              )}
              {focus.status === "scheduled" && <Button variant="brand" size="sm" disabled={busy} onClick={() => returnToDraft(focus.id)}>Return to Draft</Button>}
              {focus.status === "live" && <GoLiveUndo statusUpdatedAt={focus.status_updated_at} busy={busy} onUndo={() => returnToDraft(focus.id, true)} />}
              {focus.status === "live" && <Button variant="secondary" size="sm" disabled={busy} onClick={() => stopCollecting(focus.id)}>Stop collecting</Button>}
              {focus.status === "closed" && <Button variant="brand" size="sm" disabled={busy} onClick={() => reopen(focus.id)}>Reopen to Draft</Button>}
            </div>
          </div>
        )}
      </Card>

      {/* Reused tag/trafficking builder — hideSummary drops its internal campaign
          card so the workspace is not double-headed. Read-only; never activates. */}
      {focus && <DeploymentBuilder key={focus.id} campaignId={focus.id} embedded hideSummary />}

      {/* Group tags, after the individual campaign workspace. A group is a
          different thing to implement: one tag that rotates between several of
          the campaigns above. */}
      {campaignGroupsEnabled && <DeployGroupTags surveyId={surveyId} />}

      {confirmItems.length > 0 && <DeployConfirmModal items={confirmItems} busy={busy} onConfirm={doDeploy} onClose={() => { setConfirmItems([]); setConfirmIds([]); }} />}
    </div>
  );
}

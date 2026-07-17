"use client";

// The Campaign Dashboard — a campaign's operational home inside the Research
// Project, at /research-projects/[id]/execution/survey/[sid]/campaign/[cid].
// The campaign is the operational entity, so this (not the list) is its default
// destination, reached by clicking its card.
//
// Built as a SECTIONED workspace from the start so it can grow into
// Overview · Deployment · Responses · Performance · Settings without any routing
// change — sections are `?section=` params (linkable). Today: Overview (the
// campaign analytics) and Deployment (the embed/tag builder), both the SAME
// shared components the global pages use (CampaignDashboard / DeploymentBuilder),
// rendered chromeless here.
import { useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { CampaignDashboard } from "@/app/campaigns/[id]/page";
import { DeploymentBuilder } from "@/app/campaign-deployment/page";
import { CampaignOverview } from "@/app/components/research-projects/CampaignOverview";
import { ACTION_LABELS, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import { countryByCode } from "@/lib/countries";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, Button, type Tone,
} from "@/app/components/workspace-ui";

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: "warning", scheduled: "info", live: "success", paused: "warning", closed: "neutral", archived: "neutral",
};

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "performance", label: "Performance" },
  { key: "deployment", label: "Deployment" },
  // Responses · Settings slot in here later — no routing change.
] as const;

// The single principal lifecycle action for the header (terminal states have
// none — you're already on the dashboard).
function principalAction(status: CampaignStatus, futureStart: boolean): { action: CampaignAction; label: string } | null {
  switch (status) {
    case "live": return { action: "pause", label: "Pause" };
    case "paused": return { action: "resume", label: "Resume" };
    case "scheduled": return { action: "go_live", label: "Go Live" };
    case "draft": return futureStart ? { action: "publish", label: "Publish" } : { action: "go_live", label: "Go Live" };
    default: return null;
  }
}

export function CampaignWorkspace({ surveyEvidenceId, campaignId }: { surveyEvidenceId: string; campaignId: string }) {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";
  const { projectId, project, campaigns, orgs, loading, error, load } = useResearchProject();

  const [actioning, setActioning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>
  );

  const basePath = `/research-projects/${projectId}/execution/survey/${surveyEvidenceId}`;
  const campaignPath = `${basePath}/campaign/${campaignId}`;
  const c = campaigns.find(x => x.id === campaignId) ?? null;
  if (!c) return (
    <PageContainer>
      <ErrorState title="Campaign not found" description="This campaign may have been deleted." backHref={basePath} backLabel="Back to Campaigns" />
    </PageContainer>
  );

  const section = searchParams.get("section") || "overview";
  const orgName = (id: string | null) => (id ? orgs.find(o => o.id === id)?.name ?? "" : "");
  const st = c.effective_status;
  const futureStart = c.start_date ? new Date(`${c.start_date}T00:00:00`) > new Date() : false;
  const primary = canManage ? principalAction(st, futureStart) : null;

  const country = c.market || (c.country_code ? countryByCode(c.country_code)?.name ?? c.country_code : null);
  const target = c.effective_target_responses ?? c.target_responses;
  const metaParts = [
    orgName(c.publisher_org_id),
    country,
    target ? `${c.response_count.toLocaleString()} / ${target.toLocaleString()} responses` : `${c.response_count.toLocaleString()} responses`,
  ].filter(Boolean) as string[];

  async function handleAction(action: CampaignAction) {
    setActioning(true);
    const res = await fetch(`/api/campaigns/${campaignId}/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    setActioning(false);
    if (!res.ok) { showToast(json.error ?? "Action failed.", false); return; }
    showToast(`Campaign ${ACTION_LABELS[action].toLowerCase()}d.`);
    load();
  }

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          back={section === "overview"
            ? { href: basePath, label: "Back to Campaigns" }
            : { href: campaignPath, label: "Back to Campaign Dashboard" }}
          title={c.campaign_name}
          description={`Campaign #${String(c.campaign_number).padStart(6, "0")}`}
          status={{ label: st.charAt(0).toUpperCase() + st.slice(1), tone: STATUS_TONE[st] ?? "neutral", dot: true }}
          meta={<span className="fx-tabular-nums">{metaParts.join(" · ")}</span>}
          secondaryActions={canManage ? <Button variant="secondary" href={`${campaignPath}/edit`}>Edit</Button> : undefined}
          primaryAction={primary ? <Button variant="primary" disabled={actioning} onClick={() => handleAction(primary.action)}>{actioning ? "…" : primary.label}</Button> : undefined}
        />

        {/* Section tabs — the campaign's operational areas. */}
        <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {SECTIONS.map(s => {
            const active = section === s.key;
            return (
              <Link
                key={s.key}
                href={s.key === "overview" ? campaignPath : `${campaignPath}?section=${s.key}`}
                aria-current={active ? "page" : undefined}
                className="text-sm font-medium px-3 py-2 border-b-2 transition-colors"
                style={active
                  ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
                  : { color: "var(--text-tertiary)", borderColor: "transparent" }}
              >
                {s.label}
              </Link>
            );
          })}
        </div>

        <div>
          {section === "deployment" ? (
            <DeploymentBuilder campaignId={campaignId} embedded />
          ) : section === "performance" ? (
            <CampaignDashboard campaignId={campaignId} embedded />
          ) : (
            <CampaignOverview campaign={c} orgName={orgName} />
          )}
        </div>
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}

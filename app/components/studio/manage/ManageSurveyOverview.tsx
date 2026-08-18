"use client";

// ── Manage → Survey → Overview + Campaigns (operational, read-only) ──────────
// The detailed operational health of one Survey. Overview = funnel
// (Loads→Viewable→Started→Completed) + planned progress + factual recency;
// Campaigns = the per-campaign operational table. All data from ONE owner-scoped
// endpoint (/api/studio/surveys/[id]/overview) — one funnel RPC, batched campaign
// stats, no per-campaign event calls. Metric labels render through MetricInfo
// (canonical registry). This is operational monitoring, not a BI dashboard.

import { useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { StudioContainer } from "../StudioContainer";
import { useStudioBreadcrumbLabel } from "../breadcrumb/StudioBreadcrumbContext";
import { StudioIcon } from "../studio-icons";
import { Eyebrow, Card, StatusBadge, Skeleton, Button } from "@/app/components/workspace-ui";
import { MetricInfo } from "@/app/components/metrics/MetricInfo";
import { LIFECYCLE_LABEL, relativeResponseLabel, type SurveyLifecycle } from "@/lib/studio/collection-health";
import { ManageSurveyResults } from "./ManageSurveyResults";
import { ManageSurveyFindings } from "./ManageSurveyFindings";
import type { CampaignStatus } from "@/lib/campaign-status";

type FunnelStage = { key: string; label: string; count: number; ofLoads: number | null };
type CampaignRow = {
  campaignId: string; name: string; publisher: string; market: string; language: string;
  status: CampaignStatus; responses: number; target: number | null; targetMode: string;
  progress: number | null; lastResponseAt: string | null;
};
type Overview = {
  survey: { id: string; name: string; status: string; lifecycle: SurveyLifecycle; study: { id: string; name: string } | null };
  aggregate: {
    completedResponses: number; historical: boolean; hasTarget: boolean; targetTotal: number; completedTowardTarget: number;
    untargetedResponses: number; progressRatio: number | null; targetReached: boolean;
    lastResponseAt: string | null; liveCampaigns: number; totalCampaigns: number;
  };
  funnel: { loads: number; viewable: number; started: number; completed: number; stages: FunnelStage[] };
  campaigns: CampaignRow[];
};

const LIFECYCLE_TONE: Record<SurveyLifecycle, "neutral" | "info" | "success" | "accent"> = {
  draft: "neutral", scheduled: "info", live: "success", collecting: "success", target_reached: "accent", closed: "neutral",
};
const CAMPAIGN_TONE: Record<CampaignStatus, "neutral" | "info" | "success" | "warning"> = {
  draft: "neutral", scheduled: "info", live: "success", paused: "warning", closed: "neutral", archived: "neutral",
};
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const num = (n: number) => n.toLocaleString();

export function ManageSurveyOverview({ surveyId }: { surveyId: string }) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin"; // Findings curation is Fanometrix-only
  const [data, setData] = useState<Overview | null | "error">(null);
  const [tab, setTab] = useState<"overview" | "results" | "findings" | "campaigns">("overview");
  const [nowMs, setNowMs] = useState<number | null>(null);
  useStudioBreadcrumbLabel(surveyId, data && data !== "error" ? data.survey.name : null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/surveys/${surveyId}/overview`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (!cancelled) setData(j as Overview); })
      .catch(() => { if (!cancelled) setData("error"); });
    return () => { cancelled = true; };
  }, [surveyId]);
  // Factual recency uses a client clock, set once after mount (never in render).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clock seed
  useEffect(() => { setNowMs(Date.now()); }, []);

  if (data == null) {
    return <StudioContainer><Skeleton className="h-7 w-64 mb-4" /><Skeleton className="h-40 w-full max-w-3xl" /></StudioContainer>;
  }
  if (data === "error") {
    return (
      <StudioContainer>
        <div className="max-w-md py-6">
          <Eyebrow className="mb-1.5">Survey Studio · Manage</Eyebrow>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Survey not found</h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>This survey could not be opened, or it belongs to another organisation.</p>
          <Button href="/survey-studio/manage" variant="secondary" size="sm" className="mt-4">← Back to Manage</Button>
        </div>
      </StudioContainer>
    );
  }

  const { survey, aggregate: agg, funnel } = data;
  const lastLabel = relativeResponseLabel(agg.lastResponseAt, nowMs ?? 0);

  return (
    <StudioContainer>
      <Button
        href={survey.study ? `/survey-studio/manage/studies/${survey.study.id}` : "/survey-studio/manage?view=surveys"}
        variant="ghost" size="sm" className="mb-3"
      >← {survey.study ? survey.study.name : "All surveys"}</Button>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>{survey.study ? "Survey Studio · Study survey" : "Survey Studio · Manage"}</Eyebrow>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em] leading-tight truncate" style={{ color: "var(--text-primary)" }}>{survey.name || "Untitled survey"}</h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            {agg.liveCampaigns} live · {agg.totalCampaigns} campaign{agg.totalCampaigns === 1 ? "" : "s"}
            {lastLabel ? ` · last response ${lastLabel}` : " · no responses yet"}
          </p>
        </div>
        <StatusBadge label={LIFECYCLE_LABEL[survey.lifecycle]} tone={LIFECYCLE_TONE[survey.lifecycle]} dot size="md" />
      </header>

      {/* Sub-nav: Overview | Results | Findings (Fanometrix) | Campaigns */}
      <div className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--border-default)" }}>
        {(isAdmin ? (["overview", "results", "findings", "campaigns"] as const) : (["overview", "results", "campaigns"] as const)).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 capitalize transition-colors"
            style={tab === t ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" } : { color: "var(--text-tertiary)", borderColor: "transparent" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-6 space-y-5 max-w-3xl">
          {/* Completed responses + planned progress */}
          <Card>
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Completed responses</span>
              <MetricInfo metricId="completed_responses" />
            </div>
            <p className="text-[28px] font-bold tracking-[-0.02em] mt-1" style={{ color: "var(--text-primary)" }}>{num(agg.completedResponses)}</p>
            {agg.hasTarget ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-tertiary)" }}>{num(agg.completedTowardTarget)} of {num(agg.targetTotal)} planned</span>
                  <span className="font-semibold" style={{ color: agg.targetReached ? "var(--accent-ink)" : "var(--text-secondary)" }}>{pct(agg.progressRatio)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((agg.progressRatio ?? 0) * 100))}%`, background: "var(--accent-gold)" }} />
                </div>
                {agg.untargetedResponses > 0 && (
                  <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>+{num(agg.untargetedResponses)} from open campaigns (no target)</p>
                )}
              </div>
            ) : (
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>No target set.</p>
            )}
          </Card>

          {/* Collection funnel — unavailable for historical surveys (pre-Studio instrumentation) */}
          <Card>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Collection funnel</h2>
            </div>
            {agg.historical ? (
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Historical survey — delivery tracking (loads, viewable, starts) wasn&apos;t available for this collection. Completed responses and answer distributions are shown in Results.
              </p>
            ) : (
            <>
            <div className="space-y-2.5">
              {funnel.stages.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      {s.label}
                      {s.key === "loads" && <MetricInfo metricId="impressions_loads" />}
                      {s.key === "viewable" && <MetricInfo metricId="impressions_viewable" />}
                      {s.key === "completed" && <MetricInfo metricId="completed_responses" />}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {num(s.count)}{s.ofLoads != null && s.key !== "loads" ? <span className="text-xs ml-1" style={{ color: "var(--text-tertiary)" }}>({pct(s.ofLoads)} of loads)</span> : null}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((s.ofLoads ?? 0) * 100)}%`, background: s.key === "completed" ? "var(--accent-gold)" : "var(--accent-wash)" }} />
                  </div>
                </div>
              ))}
            </div>
            {funnel.loads === 0 && (
              <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>No delivery yet — the funnel populates once this survey&apos;s campaigns start loading.</p>
            )}
            </>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={() => setTab("results")} variant="secondary" size="sm">View results <StudioIcon.arrowRight size={14} /></Button>
            <Button onClick={() => setTab("campaigns")} variant="ghost" size="sm">{agg.totalCampaigns} campaign{agg.totalCampaigns === 1 ? "" : "s"}</Button>
          </div>
        </div>
      ) : tab === "results" ? (
        <ManageSurveyResults surveyId={survey.id} />
      ) : tab === "findings" && isAdmin ? (
        <ManageSurveyFindings surveyId={survey.id} />
      ) : (
        <div className="mt-6">
          {data.campaigns.length === 0 ? (
            <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No campaigns for this survey yet.</p></Card>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-panel)] border" style={{ borderColor: "var(--border-default)" }}>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-sunken)" }}>
                    {["Publisher", "Market", "Lang", "Status", "Responses", "Target", "Progress", "Last response"].map((h) => (
                      <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.campaignId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{c.publisher}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{c.market}</td>
                      <td className="px-3 py-2 uppercase" style={{ color: "var(--text-tertiary)" }}>{c.language}</td>
                      <td className="px-3 py-2"><StatusBadge label={c.status} tone={CAMPAIGN_TONE[c.status]} dot /></td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{num(c.responses)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                        {c.target == null ? "—" : num(c.target)}{c.target != null ? <span className="text-[11px] ml-1">{c.targetMode === "stop" ? "· ceiling" : "· goal"}</span> : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{pct(c.progress)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{relativeResponseLabel(c.lastResponseAt, nowMs ?? 0) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </StudioContainer>
  );
}

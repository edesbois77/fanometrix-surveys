"use client";

// Dashboard › Overview — the project's live RESEARCH INTELLIGENCE COMMAND CENTRE.
// Not an admin console: every element answers one of three questions —
//   1. What are we collecting right now?
//   2. What are we learning right now?
//   3. Where should I look next?
// It leads with live intelligence, frames numbers as a story, and signals that
// Fanometrix is continuously collecting, synthesising and discovering across
// surveys, conversation and industry research. Every metric and AI output is
// REUSED from the existing systems (PerformanceHighlights + InsightsEngine for
// surveys; project-scoped /api/social/stats + /api/social/reports for
// conversation; the document pipeline + stored analysis for documents) — no new
// calculations, no invented statistics.
import { useEffect, useMemo, useState } from "react";
import { type EvidenceItem, type ResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { isProcessing } from "@/app/components/research-projects/document-status";
import { Card, SectionHeading, ProgressBar, StatusBadge, SentimentBar, Sparkline, Icon, Button, type Tone } from "@/app/components/workspace-ui";
import { PerformanceHighlights } from "@/app/dashboard/components/PerformanceHighlights";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import type { Campaign } from "@/app/components/campaigns/types";
import type { SurveyResponse } from "@/lib/types";

function pctOf(current: number, target: number | null): number | null {
  return target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
}

// A live "collecting now" pulse dot — green + animated when something is
// actively flowing in, quiet grey when idle.
function Pulse({ live }: { live: boolean }) {
  return (
    <span className="relative inline-flex w-2 h-2 flex-shrink-0" aria-hidden>
      {live && <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: "#4ADE80" }} />}
      <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: live ? "#4ADE80" : "rgba(255,255,255,0.35)" }} />
    </span>
  );
}

// A big live counter inside the command-centre hero.
function LiveStat({ value, label, live }: { value: string | number; label: string; live?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {live && <Pulse live />}
        <span className="text-2xl font-bold fx-tabular-nums text-white">{value}</span>
      </div>
      <p className="text-[11px] uppercase tracking-[0.08em] mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</p>
    </div>
  );
}

type ConvStats = {
  total: number; positive_pct: number; neutral_pct: number; negative_pct: number;
  topTopics: { topic: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topMarkets: { market: string; count: number }[];
};
type ConvReports = {
  sentimentTrend: { date: string; total: number }[];
  recentSummaries: { topic: string | null; sentiment: string | null; ai_summary: string | null }[];
};

export function DashboardOverviewTab({ projectId, project, campaigns, responses }: {
  projectId: string;
  project: ResearchProject;
  campaigns: Campaign[];
  responses: SurveyResponse[] | null;
}) {
  const base = `/research-projects/${projectId}/dashboard`;
  const today = new Date().toISOString().slice(0, 10);

  const surveyEvidence = project.evidence.filter((e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey);
  const conversationEvidence = project.evidence.filter((e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } => e.evidence_type === "social_search" && !!e.conversationSearch);
  const documentEvidence = project.evidence.filter((e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document);

  // ── Survey (live campaign + response data) ─────────────────────────────────
  const surveyTargetFor = (e: typeof surveyEvidence[number]) => {
    // Prefer the sum of every linked campaign's target (reactive to campaigns),
    // falling back to the survey's own target only when no campaigns reference it.
    const sum = campaigns.filter(c => (c.effective_survey_id ?? c.survey_id) === e.evidence_id).reduce((s, c) => s + (c.effective_target_responses ?? c.target_responses ?? 0), 0);
    return sum > 0 ? sum : (e.survey.target_responses ?? null);
  };
  const totalResponses = surveyEvidence.reduce((s, e) => s + e.survey.response_count, 0);
  const overallTarget = surveyEvidence.reduce((s, e) => s + (surveyTargetFor(e) ?? 0), 0) || null;
  const overallPct = pctOf(totalResponses, overallTarget);
  const liveCampaigns = campaigns.filter(c => c.effective_status === "live").length;

  const trend = useMemo(() => {
    if (!responses) return null;
    const days = 14;
    const buckets = new Array<number>(days).fill(0);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    for (const r of responses) {
      const day = new Date(r.created_at); day.setHours(0, 0, 0, 0);
      const diff = Math.floor((t0.getTime() - day.getTime()) / 86_400_000);
      if (diff >= 0 && diff < days) buckets[days - 1 - diff]++;
    }
    return buckets;
  }, [responses]);
  const responsesToday = responses?.filter(r => r.created_at.slice(0, 10) === today).length ?? 0;

  // ── Conversation (project-scoped, reused aggregation) ──────────────────────
  const [convStats, setConvStats] = useState<ConvStats | null>(null);
  const [convReports, setConvReports] = useState<ConvReports | null>(null);
  useEffect(() => {
    if (conversationEvidence.length === 0) return;
    let cancelled = false;
    const qs = `?research_project_id=${projectId}`;
    Promise.all([
      fetch(`/api/social/stats${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/social/reports${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, rep]) => { if (!cancelled) { setConvStats(s); setConvReports(rep); } });
    return () => { cancelled = true; };
  }, [projectId, conversationEvidence.length]);

  const totalMentions = convStats?.total ?? conversationEvidence.reduce((s, e) => s + e.conversationSearch.mention_count, 0);
  const mentionsToday = convReports?.sentimentTrend.find(d => d.date === today)?.total ?? 0;
  const activeSearches = conversationEvidence.filter(e => e.conversationSearch.latest_run_status === "running").length;

  // ── Document (pipeline + latest stored insight) ────────────────────────────
  const docsProcessing = documentEvidence.filter(e => isProcessing(e.document.library_status)).length;
  const docsAnalysed = documentEvidence.filter(e => e.document.summary_status != null).length;
  const latestAnalysed = documentEvidence
    .filter(e => e.document.generated_at)
    .sort((a, b) => (b.document.generated_at ?? "").localeCompare(a.document.generated_at ?? ""))[0];
  const latestDocId = latestAnalysed?.evidence_id;
  const [docInsight, setDocInsight] = useState<string | null>(null);
  useEffect(() => {
    if (!latestDocId) return;
    let cancelled = false;
    fetch(`/api/library-documents/${latestDocId}/analysis`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setDocInsight(j?.data?.content?.executive_summary ?? j?.data?.content?.summary ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [latestDocId]);

  // ── Live synthesis ─────────────────────────────────────────────────────────
  const collectingNow = liveCampaigns + activeSearches + docsProcessing;
  const collectedToday = responsesToday + mentionsToday;
  const totalSources = surveyEvidence.length + conversationEvidence.length + documentEvidence.length;

  const headline = collectingNow > 0
    ? `Collecting and synthesising across ${collectingNow} live source${collectingNow === 1 ? "" : "s"} right now.`
    : totalSources > 0
      ? `Monitoring ${totalSources} research source${totalSources === 1 ? "" : "s"} across surveys, conversation and industry research.`
      : "Ready to start collecting research intelligence.";

  // ── "What are we learning" — blended live discovery feed (reused AI output) ─
  type Discovery = { tone: string; label: string; text: string };
  const discoveries: Discovery[] = [];
  for (const s of convReports?.recentSummaries ?? []) {
    if (s.ai_summary) discoveries.push({ tone: "#5C6B47", label: `Conversation${s.topic ? ` · ${s.topic}` : ""}`, text: s.ai_summary });
  }
  if (docInsight && latestAnalysed) discoveries.push({ tone: "#7A5C86", label: `Industry · ${latestAnalysed.document.name}`, text: docInsight });

  // ── "Where to look next" — attention (reused logic) ────────────────────────
  const execBase = `/research-projects/${projectId}/execution`;
  type Action = { tone: Tone; text: string; href: string; cta: string };
  const actions: Action[] = [];
  documentEvidence.filter(e => e.document.library_status === "failed").forEach(e => actions.push({ tone: "danger", text: `“${e.document.name}” failed processing`, href: `/research-library/${e.evidence_id}`, cta: "Review" }));
  conversationEvidence.filter(e => e.conversationSearch.latest_run_status === "failed").forEach(e => actions.push({ tone: "danger", text: `Collection failed for “${e.conversationSearch.name}”`, href: `${execBase}/conversation/${e.evidence_id}`, cta: "Review" }));
  surveyEvidence.forEach(e => {
    const sc = campaigns.filter(c => c.effective_survey_id === e.evidence_id);
    if (sc.length === 0) actions.push({ tone: "warning", text: `“${e.survey.name}” has no campaigns yet`, href: `${execBase}/survey/${e.evidence_id}`, cta: "Create" });
    else if (!sc.some(c => c.effective_status === "live" || c.effective_status === "paused")) actions.push({ tone: "warning", text: `“${e.survey.name}” isn't collecting — no live campaigns`, href: `${execBase}/survey/${e.evidence_id}`, cta: "Deploy" });
  });

  if (totalSources === 0) return (
    <Card padding="lg">
      <div className="text-center py-6">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No research sources yet — nothing to collect or learn from.</p>
        <Button href={`/research-projects/${projectId}/research`} variant="secondary" size="sm" className="mt-3">Add sources in Research →</Button>
      </div>
    </Card>
  );

  const trendTotal = trend ? trend.reduce((s, n) => s + n, 0) : 0;

  return (
    <>
      {/* ── COMMAND CENTRE HERO ──────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-panel)] overflow-hidden" style={{ background: "var(--brand-navy)" }}>
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Pulse live={collectingNow > 0} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#D7B87A" }}>
              {collectingNow > 0 ? "Live · Research Intelligence Command Centre" : "Research Intelligence Command Centre"}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white leading-snug max-w-3xl">{headline}</h2>
          {collectedToday > 0 && (
            <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
              {collectedToday.toLocaleString()} new data point{collectedToday === 1 ? "" : "s"} collected today across your sources.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-5 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <LiveStat value={collectingNow} label="Collecting now" live={collectingNow > 0} />
            <LiveStat value={responsesToday.toLocaleString()} label="Responses today" live={responsesToday > 0} />
            <LiveStat value={mentionsToday.toLocaleString()} label="Mentions today" live={mentionsToday > 0} />
            <LiveStat value={docsAnalysed} label="Documents analysed" />
          </div>
        </div>
      </div>

      {/* ── 1. WHAT ARE WE COLLECTING RIGHT NOW? ─────────────────────────────── */}
      <div>
        <SectionHeading title="What we're collecting right now" description="Live evidence flowing in from every source." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {surveyEvidence.length > 0 && (
            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#3B5A8A" }}><Pulse live={liveCampaigns > 0} /> Surveys</span>
                <StatusBadge label={liveCampaigns > 0 ? "Collecting" : "Idle"} tone={liveCampaigns > 0 ? "success" : "neutral"} dot />
              </div>
              <p className="text-2xl font-bold mt-2 fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{totalResponses.toLocaleString()}</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>responses{overallTarget ? ` · ${overallPct}% of target` : ""} · {liveCampaigns} live campaign{liveCampaigns === 1 ? "" : "s"}</p>
              {overallTarget != null && <div className="mt-2"><ProgressBar value={overallPct ?? 0} tone={liveCampaigns > 0 ? "success" : "accent"} showValue={false} /></div>}
              {trend && trendTotal > 0 && <div className="mt-3"><Sparkline data={trend} width={240} height={36} color="var(--accent-gold)" /></div>}
            </Card>
          )}
          {conversationEvidence.length > 0 && (
            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#5C6B47" }}><Pulse live={activeSearches > 0} /> Conversation</span>
                <StatusBadge label={activeSearches > 0 ? "Collecting" : totalMentions > 0 ? "Collected" : "Idle"} tone={activeSearches > 0 ? "success" : "neutral"} dot />
              </div>
              <p className="text-2xl font-bold mt-2 fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{totalMentions.toLocaleString()}</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>mentions · {conversationEvidence.length} search{conversationEvidence.length === 1 ? "" : "es"}{mentionsToday > 0 ? ` · ${mentionsToday} today` : ""}</p>
              {convStats && convStats.total > 0 && <div className="mt-3"><SentimentBar positive={convStats.positive_pct} neutral={convStats.neutral_pct} negative={convStats.negative_pct} /></div>}
            </Card>
          )}
          {documentEvidence.length > 0 && (
            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7A5C86" }}><Pulse live={docsProcessing > 0} /> Industry research</span>
                <StatusBadge label={docsProcessing > 0 ? "Processing" : docsAnalysed > 0 ? "Analysed" : "Idle"} tone={docsProcessing > 0 ? "info" : docsAnalysed > 0 ? "success" : "neutral"} dot />
              </div>
              <p className="text-2xl font-bold mt-2 fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{docsAnalysed}/{documentEvidence.length}</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>analysed{docsProcessing > 0 ? ` · ${docsProcessing} processing` : ""}</p>
            </Card>
          )}
        </div>
      </div>

      {/* ── 2. WHAT ARE WE LEARNING RIGHT NOW? ───────────────────────────────── */}
      <div>
        <SectionHeading title="What we're learning right now" description="The freshest intelligence Fanometrix is synthesising across your sources." />

        {/* Headline signals — sentiment + top topics (conversation) */}
        {convStats && convStats.total > 0 && (
          <Card padding="md" className="mt-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Conversation is running {convStats.positive_pct}% positive across {convStats.total.toLocaleString()} mentions.</p>
              <Button href={`${base}/conversation`} variant="ghost" size="sm">Explore →</Button>
            </div>
            {convStats.topTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {convStats.topTopics.slice(0, 6).map((t, i) => (
                  <span key={i} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{t.topic} · {t.count}</span>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Live discovery feed — reused AI outputs (conversation summaries + doc insight) */}
        {discoveries.length > 0 && (
          <Card padding="md" className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: "var(--text-tertiary)" }}>Latest discoveries</p>
            <ul className="space-y-3">
              {discoveries.slice(0, 5).map((d, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d.tone }} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: d.tone }}>{d.label}</p>
                    <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>{d.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Survey learning — reused PerformanceHighlights + InsightsEngine */}
        {responses && responses.length > 0 && (
          <div className="mt-3 space-y-3">
            <PerformanceHighlights responses={responses} />
            <InsightsEngine responses={responses} onFilter={() => {}} />
          </div>
        )}
      </div>

      {/* ── 3. WHERE SHOULD I LOOK NEXT? ─────────────────────────────────────── */}
      <div>
        <SectionHeading title="Where to look next" description="What needs your attention, and where to dive deeper." />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <Card padding="md" tone={actions.length > 0 ? "warning" : undefined}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Needs attention</p>
            {actions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                <Icon.check size={16} strokeWidth={2.5} /> All clear — collection is healthy.
              </div>
            ) : (
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="flex items-start gap-2 min-w-0 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.tone === "danger" ? "#B4694C" : "#C79A3E" }} aria-hidden />
                      <span className="truncate">{a.text}</span>
                    </span>
                    <Button href={a.href} variant="ghost" size="sm">{a.cta} →</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="md">
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Dive deeper</p>
            <div className="space-y-1.5">
              {surveyEvidence.length > 0 && <Button href={`${base}/survey`} variant="ghost" size="sm" className="!justify-start w-full">Survey Intelligence →</Button>}
              {conversationEvidence.length > 0 && <Button href={`${base}/conversation`} variant="ghost" size="sm" className="!justify-start w-full">Conversation Intelligence →</Button>}
              {documentEvidence.length > 0 && <Button href={`${base}/document`} variant="ghost" size="sm" className="!justify-start w-full">Document Intelligence →</Button>}
              <Button href={`/research-projects/${projectId}/analysis`} variant="ghost" size="sm" className="!justify-start w-full">Interpret it all in Analysis →</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

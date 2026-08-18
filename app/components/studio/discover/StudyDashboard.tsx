"use client";

// ── Discover → Dashboards → Study — the research-exercise command centre ─────
// Answers, in order: (1) how much research did we collect, (2) how well did
// collection perform, (3) what did people actually say — across the study's
// authorised member surveys. Governed filters narrow the campaign set (so every
// section stays consistent). Position-based Q1–Q5 are YIELD metrics, never merged
// research questions. Cross-survey answer comparison only where canonical identity
// + answer scale are proven.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WorkspaceHeader, SectionHeading, Card, ChartContainer, FilterSelect, Button,
  Eyebrow, EmptyState, ErrorState, PageLoadingState, HeaderMetaItem,
} from "@/app/components/workspace-ui";
import { StudioBarChart } from "@/app/components/studio/charts/StudioBarChart";
import { StudioCollectionChart } from "@/app/components/studio/charts/StudioCollectionChart";
import { SummarySection, ViewabilitySection, EngagementSection, MarketPerformanceSection, ResearchFindingsSection, ConfidenceSampleSection, CollectionInsightsSection } from "./dashboard-sections";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";
import { useStudyDashboard } from "./useStudyDashboard";
import { useStudioBreadcrumbLabel } from "@/app/components/studio/breadcrumb/StudioBreadcrumbContext";
import type { StudyData } from "@/lib/studio/dashboard-study";

const SURVEYS_HREF = `${DISCOVER_BASE}/surveys`;
const STUDIES_HREF = `${DISCOVER_BASE}/studies`;
const nf = (n: number) => n.toLocaleString();
const pctOf = (r: number | null): string => (r == null ? "—" : `${Math.round(r * 100)}%`);
const dec = (r: number | null): string => (r == null ? "—" : r.toFixed(1));
const FILTER_KEYS = ["survey", "publisher", "market", "campaign"] as const;

function SurveysInStudy({ data }: { data: StudyData }) {
  const shown = data.surveys.slice(0, 6);
  return (
    <div>
      <SectionHeading title="Surveys in this study" description="What makes up the study totals. Full comparison in the Surveys tab."
        action={data.surveys.length > 6 ? <Link href="#" onClick={(ev) => ev.preventDefault()} className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>{`View all ${data.surveys.length} surveys →`}</Link> : undefined} className="mb-3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((s) => (
          <Link key={s.surveyId} href={`${SURVEYS_HREF}/${encodeURIComponent(s.surveyId)}`} className="block focus:outline-none">
            <Card interactive className="h-full">
              <h4 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{s.name}</h4>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>{[s.publishers.length ? `${s.publishers.length} publisher${s.publishers.length === 1 ? "" : "s"}` : null, s.markets.length ? `${s.markets.length} market${s.markets.length === 1 ? "" : "s"}` : null, `${s.questionCount} question${s.questionCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
              <div className="mt-3 flex items-end justify-between">
                <div><p className="fx-tabular-nums text-lg font-bold" style={{ color: "var(--text-primary)" }}>{nf(s.answersCollected)}</p><p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>answers · {nf(s.completions)} completions</p></div>
                <span className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>View survey →</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Overview({ data, onMarketSelect, activeMarket }: { data: StudyData; onMarketSelect?: (label: string) => void; activeMarket?: string }) {
  const t = data.topline, e = data.engagement;
  return (
    <div className="space-y-8">
      <SummarySection
        answersCollected={t.answersCollected} answersCaption="Valid question answers across the study — partial participation still counts as research evidence."
        impressions={e.loads} starts={e.starts} interactionRate={e.startRate}
        completions={e.fullCompletions} completionRate={e.completionRate}
        avgCompletionSeconds={e.timing.avgCompletionSeconds} avgCompletionSample={e.timing.completionSample} />

      <StudioCollectionChart series={data.collectionSeries ?? []} granularity={data.collectionGranularity ?? "day"} answersHourly={data.answersHourly ?? false} hasAnswers={data.hasAnswers ?? t.answersCollected > 0} />

      <ViewabilitySection loads={e.loads} viewable={e.viewable} viewability={e.viewability} ttfiSeconds={e.timing.avgTtfiSeconds} ttfiSample={e.timing.ttfiSample} />

      <EngagementSection stages={e.progression} description="Started → Q1 … → Completed. Each Qk is the answers given at question position k (a collection metric) — positions may represent different questions across surveys, not merged question identities." />

      <MarketPerformanceSection markets={data.markets.map((m) => ({ label: m.label, answers: m.answers, starts: m.starts }))} totalAnswers={t.answersCollected} onMarketSelect={onMarketSelect} activeMarket={activeMarket} description="Share of study answers by market. The ranked list gives exact comparison." />

      <ResearchFindingsSection findings={data.researchFindings ?? []} />

      <ConfidenceSampleSection confidence={data.confidence} sampleQuality={data.sampleQuality} />

      <CollectionInsightsSection insights={data.insights} />

      <SurveysInStudy data={data} />
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th className={`text-[11px] font-semibold uppercase tracking-[0.05em] px-3 py-2 ${right ? "text-right" : "text-left"}`} style={{ color: "var(--text-tertiary)" }}>{children}</th>; }
function Td({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) { return <td className={`px-3 py-2.5 text-sm ${right ? "text-right fx-tabular-nums" : ""} ${bold ? "font-semibold" : ""}`} style={{ color: bold ? "var(--text-primary)" : "var(--text-secondary)" }}>{children}</td>; }

function SurveysTab({ data }: { data: StudyData }) {
  const bars = [...data.surveys].sort((a, b) => (b.avgAnswersPerStart ?? 0) - (a.avgAnswersPerStart ?? 0)).map((s) => ({ label: s.name, value: Number((s.avgAnswersPerStart ?? 0).toFixed(2)), pct: null }));
  return (
    <div className="space-y-4">
      {data.mixedMode && <Card tone="info" padding="sm"><p className="text-sm" style={{ color: "var(--text-secondary)" }}>This study mixes Studio-native and historical surveys — historical surveys recorded completed answers only, so their answer bases aren&rsquo;t directly comparable to partial-aware surveys.</p></Card>}
      {data.surveys.length >= 2 && (
        <ChartContainer title="Average answers per start, by survey" description="Fairer than raw answer totals when surveys have different question counts." height={Math.max(96, data.surveys.length * 40 + 16)}>
          <StudioBarChart data={bars} ariaLabel="Average answers per start by survey" />
        </ChartContainer>
      )}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[760px]">
            <thead><tr className="border-b" style={{ borderColor: "var(--border-subtle)" }}><Th>Survey</Th><Th right>Questions</Th><Th right>Starts</Th><Th right>Answers</Th><Th right>Avg/start</Th><Th right>Completions</Th><Th right>Compl. rate</Th><Th>Measurement</Th></tr></thead>
            <tbody>
              {data.surveys.map((s) => (
                <tr key={s.surveyId} className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td bold><Link href={`${SURVEYS_HREF}/${encodeURIComponent(s.surveyId)}`} className="hover:underline" style={{ color: "var(--accent-ink)" }}>{s.name}</Link><span className="block text-[11px] font-normal" style={{ color: "var(--text-tertiary)" }}>{s.publishers.slice(0, 3).join(", ") || "—"}</span></Td>
                  <Td right>{s.questionCount}</Td><Td right>{nf(s.starts)}</Td><Td right>{nf(s.answersCollected)}</Td><Td right>{dec(s.avgAnswersPerStart)}</Td><Td right>{nf(s.completions)}</Td><Td right>{pctOf(s.completionRate)}</Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{s.mode === "historical" ? "historical" : "studio-native"}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Surveys have different question counts — compare on average answers per start, not raw answer totals alone.</p>
    </div>
  );
}

function ComparisonTab({ rows, firstCol, emptyLabel }: { rows: StudyData["publishers"]; firstCol: string; emptyLabel: string }) {
  if (rows.length < 2) return <EmptyState compact title={emptyLabel} description="This study's authorised data spans a single value on this dimension." />;
  const sorted = [...rows].sort((a, b) => b.answers - a.answers);
  const bars = sorted.map((r) => ({ label: r.label, value: r.answers, pct: null }));
  return (
    <div className="space-y-4">
      <ChartContainer title={`Answers by ${firstCol.toLowerCase()}`} height={Math.max(96, sorted.length * 40 + 16)}>
        <StudioBarChart data={bars} ariaLabel={`Answers by ${firstCol}`} />
      </ChartContainer>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[480px]">
            <thead><tr className="border-b" style={{ borderColor: "var(--border-subtle)" }}><Th>{firstCol}</Th><Th right>Starts</Th><Th right>Answers</Th><Th right>Completions</Th><Th right>Compl. rate</Th></tr></thead>
            <tbody>{sorted.map((r) => (<tr key={r.label} className="border-b" style={{ borderColor: "var(--border-subtle)" }}><Td bold>{r.label}</Td><Td right>{nf(r.starts)}</Td><Td right>{nf(r.answers)}</Td><Td right>{nf(r.completions)}</Td><Td right>{pctOf(r.completionRate)}</Td></tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ResultsTab({ data }: { data: StudyData }) {
  const groups = data.results ?? [];
  const comparable = data.comparableGroups ?? [];
  if (groups.length === 0) return <EmptyState title="No results yet" description="Answers will appear here as surveys collect responses." />;
  return (
    <div className="space-y-6">
      {comparable.length > 0 && (
        <div>
          <SectionHeading title="Comparable across surveys" description="Questions proven to share a canonical identity and answer scale — safe to compare." className="mb-3" />
          <div className="space-y-4">
            {comparable.map((g) => (
              <Card key={g.canonicalKey}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{g.text}</p>
                <div className="grid gap-4 lg:grid-cols-2 mt-3">
                  {g.surveys.map((sv) => (
                    <div key={sv.surveyId}>
                      <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{sv.surveyName} · n={nf(sv.base)}</p>
                      <StudioBarChart data={sv.options.map((o) => ({ label: o.label, value: o.count, pct: o.percentage }))} ariaLabel={`${sv.surveyName} distribution`} />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {groups.map((grp) => (
        <div key={grp.surveyId}>
          <SectionHeading title={grp.surveyName} description={grp.mode === "historical_completed_only" ? "Historical survey — completed responses only." : undefined}
            action={<Link href={`${SURVEYS_HREF}/${encodeURIComponent(grp.surveyId)}?view=results`} className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>Open survey results →</Link>} className="mb-3" />
          <div className="space-y-4">
            {grp.questions.filter((q) => q.base > 0).map((q, i) => (
              <ChartContainer key={q.questionId ?? i} title={<span><span style={{ color: "var(--text-tertiary)" }}>Q{q.questionIndex + 1}.</span> {q.text}</span>}
                description={`n=${nf(q.base)}${q.marginOfError != null ? ` · ±${q.marginOfError.toFixed(1)}%` : ""}`} height={Math.max(96, q.options.length * 36 + 12)}>
                <StudioBarChart data={q.options.map((o) => ({ label: o.label, value: o.count, pct: o.percentage }))} ariaLabel={`Q${q.questionIndex + 1} distribution`} />
              </ChartContainer>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = "overview" | "surveys" | "publishers" | "markets" | "results";

export function StudyDashboard({ studyId, previewData }: { studyId: string; previewData?: StudyData }) {
  const router = useRouter();
  const isPreview = previewData != null;
  const [tab, setTab] = useState<Tab>("overview");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const live = useStudyDashboard(studyId, filters, !isPreview);
  const { loading, error, data } = isPreview ? { loading: false, error: false, data: { ...previewData!, authorised: true as const } } : live;
  // Feed the breadcrumb the real Study name for the dynamic /study/[studyId] leaf.
  useStudioBreadcrumbLabel(studyId, data && data.authorised ? data.studyName : null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setFilter = (key: string, value: string) => {
    if (isPreview) return;
    setFilters((prev) => {
      const next = { ...prev }; if (value) next[key] = value; else delete next[key];
      const qs = new URLSearchParams(next).toString();
      router.replace(`${STUDIES_HREF}/${encodeURIComponent(studyId)}${qs ? `?${qs}` : ""}`, { scroll: false });
      return next;
    });
  };

  const deleteStudy = async () => {
    if (isPreview) return;
    setDeleting(true);
    const res = await fetch(`/api/survey-studio/discover/dashboards/studies/${encodeURIComponent(studyId)}`, { method: "DELETE" });
    if (res.ok) router.push(STUDIES_HREF);
    else setDeleting(false);
  };

  // Manage actions for a user study the caller's organisation owns.
  const manageActions = confirmDelete ? (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Delete this study?</span>
      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
      <Button size="sm" variant="secondary" className="text-[#B4694C] border-[#B4694C]" onClick={deleteStudy} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" href={`${STUDIES_HREF}/${encodeURIComponent(studyId)}/edit`}>Edit study</Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>Delete</Button>
    </div>
  );

  const ownerOrg = data && data.authorised !== false ? data.ownerOrganisationName : null;
  const header = (title: string, description?: string, actions?: React.ReactNode) => (
    <WorkspaceHeader eyebrow="Study" title={title} description={description} secondaryActions={actions}
      meta={ownerOrg ? <HeaderMetaItem label="Owned by">{ownerOrg}</HeaderMetaItem> : undefined} />
  );
  if (loading) return <>{header("Loading…")}<div className="mt-8"><PageLoadingState lines={2} /></div></>;
  if (error || !data) return <>{header("Study")}<div className="mt-8"><ErrorState title="We couldn't load this study" backHref={STUDIES_HREF} backLabel="Back to studies" /></div></>;
  if (data.authorised === false) return <>{header("Study unavailable")}<div className="mt-8"><EmptyState title="This study isn't available" description="Your organisation isn't entitled to any of its surveys' data." /></div></>;

  const study = data;
  const controls = (study.filterManifest?.dimensions ?? []).filter((d) => FILTER_KEYS.includes(d.key as never));
  const hasFilters = Object.keys(filters).length > 0;
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Dashboard" }, { key: "surveys", label: "Surveys" },
    ...(study.publishers.length >= 2 ? [{ key: "publishers" as Tab, label: "Publishers" }] : []),
    ...(study.markets.length >= 2 ? [{ key: "markets" as Tab, label: "Markets" }] : []),
    { key: "results", label: "Results" },
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "overview";

  const isUserStudy = study.kind === "user";
  const canManage = isUserStudy && study.canManage === true && !isPreview;

  // Management-only shell: the caller may manage this study but has no data authority
  // to its surveys — expose management, never analytics.
  if (study.manageOnly) {
    return (
      <>
        {header(study.studyName ?? "Study", "Manage this study's surveys. Your organisation doesn't have data access to view its analytics.", canManage ? manageActions : undefined)}
        <div className="mt-6 max-w-2xl">
          <Card tone="info">
            <Eyebrow>Management only</Eyebrow>
            <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
              You can rename this study, change which surveys it contains, or delete it. Its combined analytics aren&rsquo;t shown here because you don&rsquo;t have data access to the underlying surveys.
            </p>
            {canManage && (
              <div className="mt-3">
                <Button size="sm" variant="secondary" href={`${STUDIES_HREF}/${encodeURIComponent(studyId)}/edit`}>Edit study</Button>
              </div>
            )}
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {header(study.studyName ?? "Study", `Compare performance and research yield across ${study.topline.surveyCount} authorised survey${study.topline.surveyCount === 1 ? "" : "s"}.`, canManage ? manageActions : undefined)}

      {isUserStudy && study.belowMinimum && (
        <div className="mt-4">
          <Card tone="warning" padding="sm">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              This study currently contains only one survey you can access. {canManage ? "Add another survey to enable the combined study view." : "It needs at least two accessible surveys for a combined view."}
              {canManage && <> <Link href={`${STUDIES_HREF}/${encodeURIComponent(studyId)}/edit`} className="font-semibold" style={{ color: "var(--accent-ink)" }}>Edit study →</Link></>}
            </p>
          </Card>
        </div>
      )}

      {controls.length > 0 && (
        <div className="mt-4" role="search">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Filters</p>
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap text-xs">
            {controls.map((c) => (
              <div key={c.key} className="flex-1 min-w-[7.5rem]">
                <FilterSelect dense fullWidth label={c.label} value={filters[c.key] ?? ""} onChange={(v) => setFilter(c.key, v)}
                  options={[{ value: "", label: "All" }, ...c.values.map((v) => ({ value: v.id, label: v.label }))]} />
              </div>
            ))}
            {hasFilters && (
              <button onClick={() => { setFilters({}); if (!isPreview) router.replace(`${STUDIES_HREF}/${encodeURIComponent(studyId)}`, { scroll: false }); }}
                className="font-semibold px-1.5 py-1 rounded-md transition-colors hover:bg-[var(--surface-sunken)] flex-shrink-0" style={{ color: "var(--accent-ink)" }}>Clear</button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-1 border-b overflow-x-auto" role="tablist" aria-label="Study views" style={{ borderColor: "var(--border-subtle)" }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => setTab(t.key)}
            className="text-sm font-medium px-3 py-2 border-b-2 whitespace-nowrap transition-colors"
            style={activeTab === t.key ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" } : { color: "var(--text-tertiary)", borderColor: "transparent" }}>{t.label}</button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "overview" ? <Overview data={study}
            onMarketSelect={controls.some((c) => c.key === "market") ? (label) => setFilter("market", filters.market === label ? "" : label) : undefined}
            activeMarket={filters.market} />
          : activeTab === "surveys" ? <SurveysTab data={study} />
          : activeTab === "publishers" ? <ComparisonTab rows={study.publishers} firstCol="Publisher" emptyLabel="No publisher comparison" />
          : activeTab === "markets" ? <ComparisonTab rows={study.markets} firstCol="Market" emptyLabel="No market comparison" />
          : <ResultsTab data={study} />}
      </div>
    </>
  );
}

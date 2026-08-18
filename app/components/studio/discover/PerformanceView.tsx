"use client";

// ── Survey Performance — the single-survey level of the Study Dashboard ───────
// Same analytical framework as the Study Dashboard (reusing the shared dashboard
// sections + chart primitives), PLUS this survey's actual question results in full.
// Order: Summary → Collection over time → Viewability → Engagement → What
// respondents said (ALL questions) → Market performance → Research findings →
// Research confidence + Sample quality → Collection insights. Pure presentation over
// the governed PerformanceData + DiscoverResults; no parallel metric implementation.

import { Card, SectionHeading, ChartContainer } from "@/app/components/workspace-ui";
import { StudioCollectionChart } from "@/app/components/studio/charts/StudioCollectionChart";
import { StudioBarChart } from "@/app/components/studio/charts/StudioBarChart";
import {
  SummarySection, ViewabilitySection, EngagementSection, MarketPerformanceSection,
  ConfidenceSampleSection, CollectionInsightsSection,
} from "./dashboard-sections";
import { marginOfError } from "@/lib/studio/dashboard-results";
import { surveyProgressionStages } from "@/lib/studio/dashboard-performance";
import type { PerformanceData } from "@/lib/studio/dashboard-performance";
import type { DiscoverResults } from "@/lib/studio/dashboard-results";

const nf = (n: number) => n.toLocaleString();

// ── What respondents said — EVERY question (Q1–Q5), navy/gold bars ────────────
function QuestionResults({ results }: { results?: DiscoverResults }) {
  const questions = (results?.questions ?? []).filter((q) => q.base > 0);
  if (questions.length === 0) return null;
  const odd = questions.length % 2 === 1;
  return (
    <div>
      <SectionHeading title="What respondents said" description="Every question in this survey, with its answer distribution and base." className="mb-3" />
      <div className="grid gap-4 lg:grid-cols-2">
        {questions.map((q, i) => (
          <div key={q.questionId ?? i} className={odd && i === questions.length - 1 ? "lg:col-span-2" : undefined}>
            <ChartContainer
              title={<span><span style={{ color: "var(--text-tertiary)" }}>Q{q.questionIndex + 1}.</span> {q.text}</span>}
              description={`n=${nf(q.base)}${q.marginOfError != null ? ` · ±${q.marginOfError.toFixed(1)}%` : ""}`}
              /* Match the bar chart's own height (options×40+16) + ~8px slack so, with
                 the container's bottom padding, there's ~20–24px beneath the chart. */
              height={Math.max(96, q.options.length * 40 + 16) + 8}
            >
              <StudioBarChart data={q.options.map((o) => ({ label: o.label, value: o.count, pct: o.percentage }))} ariaLabel={`Q${q.questionIndex + 1} distribution`} />
            </ChartContainer>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceSections({ data, onInsightFilter, results }: {
  data: PerformanceData;
  onInsightFilter?: (dimension: string, value: string) => void;
  results?: DiscoverResults;
  /** kept for API compatibility; Performance now shows all questions inline. */
  onViewResults?: () => void;
}) {
  const { yield: y, exposure, engagement, completion, timing } = data;
  const historical = y.mode === "historical";
  const nothing = y.answersCollected === 0 && exposure.loads === 0 && exposure.viewable === 0;

  // Engagement progression — Started → Q1…Qn (answered per position) → Completed.
  // Positions genuinely correspond to THIS survey's questions.
  const stages = surveyProgressionStages(engagement.starts, y.perQuestion, completion.fullCompletions);

  // Research findings moved to the dedicated Findings tab (interpretation lives
  // there now, separate from performance/delivery). Performance answers only
  // "how did this research perform?".

  // Research confidence — survey-level orientation at the completed-response base.
  const confidence = {
    level: 95, base: completion.fullCompletions, marginOfError: marginOfError(completion.fullCompletions),
    note: "Survey-wide indicator at the completed-response base; each question's own confidence (with its own n) is shown with its result above.",
  } as const;
  const sampleQuality = {
    assessed: false as const, label: "Not yet assessed",
    reason: "Response-quality signals (duplicate sessions, implausibly fast completion, automation markers) are not yet governed metrics.",
  };

  const onMarketSelect = onInsightFilter ? (label: string) => onInsightFilter("market", label) : undefined;

  return (
    <div className="space-y-8">
      {nothing && (
        <Card tone="info" padding="sm">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>This survey is set up but hasn&rsquo;t collected evidence yet. Metrics will populate as collection begins.</p>
        </Card>
      )}

      <SummarySection
        answersCollected={y.answersCollected}
        answersCaption={historical ? "Recorded question answers across the survey." : "Valid question answers across the survey — partial participation still contributes evidence."}
        impressions={exposure.loads} starts={engagement.starts} interactionRate={engagement.q1AnswerRate}
        completions={completion.fullCompletions} completionRate={completion.completionRate}
        avgCompletionSeconds={timing.avgCompletionSeconds} avgCompletionSample={timing.completionSample} />

      <StudioCollectionChart series={data.collectionSeries ?? []} granularity={data.collectionGranularity ?? "day"} answersHourly={data.answersHourly ?? false} hasAnswers={data.hasAnswers ?? y.answersCollected > 0} />

      <ViewabilitySection loads={exposure.loads} viewable={exposure.viewable} viewability={exposure.viewability} ttfiSeconds={timing.avgTtfiSeconds} ttfiSample={timing.ttfiSample} />

      <EngagementSection stages={stages} description="Started → Q1 … → Completed. Each Qk is the answers given at question position k — for a single survey these are this survey's own questions." />

      <QuestionResults results={results} />

      <MarketPerformanceSection markets={data.markets ?? []} totalAnswers={y.answersCollected} onMarketSelect={onMarketSelect} activeMarket={data.appliedFilters.market ?? undefined} description="Share of this survey's answers by market. The ranked list gives exact comparison." />

      <ConfidenceSampleSection confidence={confidence} sampleQuality={sampleQuality} />

      <CollectionInsightsSection insights={data.insights ?? []} onFilter={onInsightFilter} />

      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        Based on {nf(data.scope.campaignCount)} authorised campaign{data.scope.campaignCount === 1 ? "" : "s"}
        {data.scope.publisherCount > 1 ? ` across ${nf(data.scope.publisherCount)} publishers` : ""}.
        {data.degraded ? " Some figures were temporarily unavailable." : ""}
      </p>
    </div>
  );
}

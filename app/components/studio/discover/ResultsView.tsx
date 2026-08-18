"use client";

// ── Results view — actual question/answer distributions ──────────────────────
// "What did respondents actually tell us?" Each question is a useful analytical
// object: wording, a prominent ranked-bar chart, and an honest supporting line
// (n=answered · shown · question completion · ±MoE). Partial answers are included;
// full completion is not required. Historical (completed-only) surveys are marked.

import { ChartContainer, EmptyState, StatusBadge, Card } from "@/app/components/workspace-ui";
import { StudioBarChart, type BarDatum } from "@/app/components/studio/charts/StudioBarChart";
import type { DiscoverResults, QuestionResultView } from "@/lib/studio/dashboard-results";

const nf = (n: number) => n.toLocaleString();

function supportingLine(q: QuestionResultView, historical: boolean): string {
  const parts = [`n=${nf(q.base)}`, `${nf(q.answered)} answered`];
  if (q.shown != null) parts.push(`${nf(q.shown)} shown`);
  if (q.completionRate != null) parts.push(`${Math.round(q.completionRate * 100)}% question completion`);
  if (q.marginOfError != null) parts.push(`±${q.marginOfError.toFixed(1)}% at 95%`);
  if (historical) parts.push("completed responses only");
  return parts.join(" · ");
}

function QuestionResultCard({ q, index, historical }: { q: QuestionResultView; index: number; historical: boolean }) {
  const bars: BarDatum[] = q.options.map((o) => ({ label: o.label, value: o.count, pct: o.percentage }));
  const anyAnswers = q.base > 0;
  return (
    <ChartContainer
      title={<span><span style={{ color: "var(--text-tertiary)" }}>Q{index + 1}.</span> {q.text}</span>}
      description={supportingLine(q, historical)}
      empty={!anyAnswers ? "No answers recorded for this question yet." : false}
      height={Math.max(96, q.options.length * 40 + 16)}
    >
      <StudioBarChart data={bars} ariaLabel={`Q${index + 1} ${q.text}: distribution across ${q.options.length} options`} />
    </ChartContainer>
  );
}

export function ResultsView({ results }: { results: DiscoverResults }) {
  const historical = results.mode === "historical_completed_only";
  if (results.questions.length === 0) {
    return <div className="mt-4"><EmptyState title="No questions to show" description="This survey has no questions, or no answers have been collected yet." /></div>;
  }
  return (
    <div className="space-y-4">
      {historical && (
        <Card tone="info" padding="sm">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold">Historical survey.</span> Only completed responses were recorded, so each
            question&rsquo;s base equals its completed answers — per-question partial drop-off wasn&rsquo;t captured for this survey.
          </p>
        </Card>
      )}
      {results.questions.map((q, i) => (
        <QuestionResultCard key={q.questionId ?? i} q={q} index={i} historical={historical} />
      ))}
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        Distributions use each question&rsquo;s answered base (n=), including valid partial answers.
        {historical ? "" : " Studio-native measurement."}
        <StatusBadge label={historical ? "historical_completed_only" : "studio_native"} tone="neutral" />
      </p>
    </div>
  );
}

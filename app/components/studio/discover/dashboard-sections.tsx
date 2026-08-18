"use client";

// ── Shared Discover dashboard sections ───────────────────────────────────────
// The analytical building blocks the Study Dashboard established, extracted so the
// individual Survey Dashboard renders the SAME framework (one product, two levels).
// Each takes primitive props (never a StudyData/PerformanceData shape) so both
// callers compose them from their own governed data. Charts/donut/findings come
// from the existing shared primitives — no parallel implementation.


import { Card, SectionHeading, Eyebrow } from "@/app/components/workspace-ui";
import { StudioProgressionChart, type ProgressionStage } from "@/app/components/studio/charts/StudioProgressionChart";
import { StudioMarketDonut } from "@/app/components/studio/charts/StudioMarketDonut";
import { FX_PALETTE } from "@/lib/studio/chart-palette";
import type { StudyFinding, StudyConfidence, StudySampleQuality } from "@/lib/studio/dashboard-study";
import type { Insight } from "@/lib/studio/dashboard-insights";

const nf = (n: number) => n.toLocaleString();
const pctOf = (r: number | null): string => (r == null ? "—" : `${Math.round(r * 100)}%`);
const pct1 = (r: number | null): string => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);
const pct2 = (r: number | null): string => (r == null ? "—" : `${(r * 100).toFixed(2)}%`);
export const dur = (s: number | null, sample: number): string => (s == null || sample <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

const INSIGHT_CATEGORY: Record<string, string> = { geo: "Geographic", device: "Device", publisher: "Publisher", market: "Market", survey: "Survey", behavioural: "Behavioural", campaign: "Campaign" };

function SummaryTile({ label, value, caption }: { label: string; value: React.ReactNode; caption?: string }) {
  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-tile)", background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="fx-tabular-nums text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{value}</p>
      {caption && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{caption}</p>}
    </div>
  );
}

// ── Summary — navy Answers Collected hero + six supporting KPIs (3×2) ─────────
export function SummarySection({ answersCollected, answersCaption, impressions, starts, interactionRate, completions, completionRate, avgCompletionSeconds, avgCompletionSample }: {
  answersCollected: number; answersCaption: string;
  impressions: number; starts: number; interactionRate: number | null;
  completions: number; completionRate: number | null;
  avgCompletionSeconds: number | null; avgCompletionSample: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2 rounded-[var(--radius-panel)] p-6 flex flex-col justify-center" style={{ background: FX_PALETTE.navy }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: FX_PALETTE.gold }}>Answers collected</p>
        <p className="fx-tabular-nums text-5xl font-bold mt-1.5 tracking-[-0.02em]" style={{ color: "#FFFFFF" }}>{nf(answersCollected)}</p>
        <p className="text-xs mt-2.5 leading-relaxed" style={{ color: "#B8BEC9" }}>{answersCaption}</p>
      </div>
      <div className="lg:col-span-3 grid gap-3 grid-cols-2 sm:grid-cols-3">
        <SummaryTile label="Total impressions" value={nf(impressions)} />
        <SummaryTile label="Total starts" value={nf(starts)} />
        <SummaryTile label="Interaction rate" value={pct2(interactionRate)} caption="starts ÷ impressions" />
        <SummaryTile label="Total completions" value={nf(completions)} />
        <SummaryTile label="Completion rate" value={pctOf(completionRate)} caption="of starts" />
        <SummaryTile label="Avg. completion" value={dur(avgCompletionSeconds, avgCompletionSample)} caption="start → complete" />
      </div>
    </div>
  );
}

// ── Viewability — proportional loads→viewable + viewability% + avg time to start ─
export function ViewabilitySection({ loads, viewable, viewability, ttfiSeconds, ttfiSample }: {
  loads: number; viewable: number; viewability: number | null; ttfiSeconds: number | null; ttfiSample: number;
}) {
  return (
    <div>
      <SectionHeading title="Viewability" description="How much exposure became viewable, and how quickly fans engaged." className="mb-3" />
      <Card>
        <div className="grid gap-6 lg:grid-cols-3 items-center">
          <div className="lg:col-span-2 space-y-3">
            {[{ label: "Impression loads", v: loads, w: 1, c: FX_PALETTE.navyMid }, { label: "Viewable", v: viewable, w: loads > 0 ? viewable / loads : 0, c: FX_PALETTE.gold }].map((r) => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: "var(--text-tertiary)" }}>{r.label}</span><span className="font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{nf(r.v)}</span></div>
                <div className="h-3 rounded-md overflow-hidden" style={{ background: "var(--surface-sunken)" }}><div className="h-full rounded-md" style={{ width: `${Math.max(2, r.w * 100)}%`, background: r.c }} /></div>
              </div>
            ))}
          </div>
          <div className="flex lg:flex-col gap-8 lg:gap-4 lg:border-l lg:pl-6" style={{ borderColor: "var(--border-subtle)" }}>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Viewability</p><p className="fx-tabular-nums text-2xl font-bold" style={{ color: FX_PALETTE.goldDark }}>{pct1(viewability)}</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Avg time to start</p><p className="fx-tabular-nums text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{dur(ttfiSeconds, ttfiSample)}</p></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Engagement — Started → Q1…Qn → Completed (StudioProgressionChart) ──────────
export function EngagementSection({ stages, description }: { stages: ProgressionStage[]; description: string }) {
  return (
    <div>
      <SectionHeading title="Engagement" description={description} className="mb-3" />
      <Card><StudioProgressionChart stages={stages} /></Card>
    </div>
  );
}

// ── Market performance — donut + ranked list (≥2 markets) ─────────────────────
export function MarketPerformanceSection({ markets, totalAnswers, onMarketSelect, activeMarket, description }: {
  markets: { label: string; answers: number; starts: number }[]; totalAnswers: number;
  onMarketSelect?: (label: string) => void; activeMarket?: string; description?: string;
}) {
  const sorted = [...markets].sort((a, b) => b.answers - a.answers);
  if (sorted.length < 2) return null; // one market → no misleading multi-segment donut
  return (
    <div>
      <SectionHeading title="Market performance" description={description ?? "Share of answers by market. The ranked list gives exact comparison."} className="mb-3" />
      <Card><StudioMarketDonut markets={sorted} totalAnswers={totalAnswers} activeLabel={activeMarket} onSelect={onMarketSelect} /></Card>
    </div>
  );
}

// ── Research findings (answer-derived; primary + supporting) ──────────────────
function DeltaBadge({ pp, tone }: { pp: number; tone: StudyFinding["tone"] }) {
  const color = tone === "positive" ? FX_PALETTE.positive : tone === "negative" ? FX_PALETTE.negative : "var(--text-secondary)";
  const bg = tone === "positive" ? "rgba(63,125,70,0.10)" : tone === "negative" ? "rgba(180,105,76,0.10)" : "var(--surface-sunken)";
  return <span className="text-[11px] font-bold fx-tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ color, background: bg }}>{pp > 0 ? "+" : ""}{pp}pp</span>;
}
function FindingBody({ f, big }: { f: StudyFinding; big?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{f.eyebrow}</Eyebrow>
        {f.delta && <DeltaBadge pp={f.delta.pp} tone={f.tone} />}
      </div>
      <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>{f.question}</p>
      <p className={`mt-1.5 leading-snug ${big ? "text-lg font-semibold" : "text-sm font-medium"}`} style={{ color: "var(--text-primary)" }}>{f.text}</p>
      <p className="text-[10px] mt-2 fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>n={nf(f.base)} completed answers · {f.evidence.surveys.join(", ")}</p>
    </>
  );
}
export function ResearchFindingsSection({ findings, unavailableNote }: { findings: StudyFinding[]; unavailableNote?: string }) {
  if (findings.length === 0) {
    if (!unavailableNote) return null;
    return (
      <div>
        <SectionHeading title="Research findings" description="What respondents told us." className="mb-3" />
        <Card><p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{unavailableNote}</p></Card>
      </div>
    );
  }
  const [primary, ...rest] = findings;
  return (
    <div>
      <SectionHeading title="Research findings" description="What respondents told us — from completed survey answers (answer values), separate from the collection metrics above." className="mb-3" />
      <div className="space-y-3">
        <div className="rounded-[var(--radius-panel)] border p-5" style={{ borderColor: FX_PALETTE.gold, background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <FindingBody f={primary} big />
        </div>
        {rest.length > 0 && (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((f) => <Card key={f.id}><FindingBody f={f} /></Card>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Research confidence + Sample quality ─────────────────────────────────────
export function ConfidenceSampleSection({ confidence, sampleQuality }: { confidence: StudyConfidence; sampleQuality: StudySampleQuality }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <SectionHeading title="Research confidence" />
        <div className="mt-2 flex items-baseline gap-3">
          <span className="fx-tabular-nums text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{confidence.marginOfError == null ? "—" : `±${confidence.marginOfError.toFixed(1)}%`}</span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>orientation · {confidence.level}% · n={nf(confidence.base)} completions</span>
        </div>
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{confidence.note}</p>
      </Card>
      <Card>
        <SectionHeading title="Sample quality" />
        <p className="text-sm font-semibold mt-2" style={{ color: "var(--text-secondary)" }}>{sampleQuality.label}</p>
        <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{sampleQuality.reason}</p>
      </Card>
    </div>
  );
}

// ── Collection insights (how the research was delivered) ─────────────────────
export function CollectionInsightsSection({ insights, onFilter }: { insights: Insight[]; onFilter?: (dimension: string, value: string) => void }) {
  if (insights.length === 0) return null;
  return (
    <div>
      <SectionHeading title="Collection insights" description="Deterministic observations about how the research was delivered — device, publisher, market." className="mb-3" />
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((ins, i) => (
          <Card key={ins.id} className={i === 0 && insights.length > 1 ? "sm:col-span-2 lg:col-span-1" : ""} tone={i === 0 ? "info" : undefined}>
            <Eyebrow>{INSIGHT_CATEGORY[ins.id] ?? "Insight"}</Eyebrow>
            <p className={`mt-1.5 ${i === 0 ? "text-base font-semibold" : "text-sm"}`} style={{ color: "var(--text-primary)" }}>{ins.text}</p>
            {ins.filter && onFilter && (
              <button onClick={() => onFilter(ins.filter!.dimension, ins.filter!.value)} className="self-start mt-3 text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors hover:bg-[var(--surface-sunken)]" style={{ color: "var(--accent-ink)", border: "1px solid var(--border-default)" }}>Filter to this →</button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

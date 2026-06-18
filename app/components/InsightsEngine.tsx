"use client";

import { useMemo } from "react";
import type { SurveyResponse } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type Confidence = "High" | "Medium" | "Low";

type Insight = {
  icon: string;
  title: string;
  description: string;
  confidence: Confidence;
  positive?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tally(data: SurveyResponse[], field: keyof SurveyResponse) {
  const m: Record<string, number> = {};
  for (const r of data) {
    const v = r[field] as string;
    if (v) m[v] = (m[v] ?? 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function confidence(n: number, pct: number, hiPct: number, medPct: number): Confidence {
  if (n >= 100 && pct >= hiPct)  return "High";
  if (n >= 30  && pct >= medPct) return "Medium";
  return "Low";
}

function daypart(h: number) {
  if (h >= 5  && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Night";
}

// ─── Insight generators ───────────────────────────────────────────────────────

function geographic(data: SurveyResponse[]): Insight | null {
  if (data.length < 10) return null;
  const rows = tally(data, "country");
  if (!rows.length) return null;
  const [top, topN] = rows[0];
  const pct = Math.round(topN / data.length * 100);
  if (pct < 20 || topN < 5) return null;

  const runnerUp = rows[1];
  const lead = runnerUp ? pct - Math.round(runnerUp[1] / data.length * 100) : null;

  return {
    icon: "🌍",
    title: "Geographic",
    description: lead !== null && lead > 5
      ? `${top} generated ${pct}% of responses, leading ${runnerUp[0]} by ${lead} percentage points.`
      : `${top} generated ${pct}% of all responses.`,
    confidence: confidence(data.length, pct, 40, 25),
  };
}

function device(data: SurveyResponse[]): Insight | null {
  if (data.length < 15) return null;
  const rows = tally(data, "device");
  if (!rows.length) return null;
  const [top, topN] = rows[0];
  const pct = Math.round(topN / data.length * 100);
  if (pct < 50) return null;

  const label = top.charAt(0).toUpperCase() + top.slice(1);
  const second = rows[1];
  return {
    icon: "📱",
    title: "Device",
    description: second
      ? `${label} represented ${pct}% of responses, with ${second[0]} at ${Math.round(second[1] / data.length * 100)}%.`
      : `${label} represented ${pct}% of responses.`,
    confidence: confidence(data.length, pct, 65, 55),
  };
}

function publisher(data: SurveyResponse[]): Insight | null {
  const pubs: Record<string, { t: number; c: number }> = {};
  for (const r of data) {
    if (!r.publisher) continue;
    if (!pubs[r.publisher]) pubs[r.publisher] = { t: 0, c: 0 };
    pubs[r.publisher].t++;
    if (r.q1 && r.q2 && r.q3) pubs[r.publisher].c++;
  }
  const valid = Object.entries(pubs).filter(([, v]) => v.t >= 10);
  if (valid.length < 2) return null;

  const sorted = valid.map(([p, v]) => ({ p, rate: v.c / v.t, t: v.t }))
    .sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const pct  = Math.round(best.rate * 100);
  const conf: Confidence = best.t >= 100 ? "High" : best.t >= 30 ? "Medium" : "Low";

  return {
    icon: "🏆",
    title: "Publisher",
    description: `${best.p} delivered the highest completion rate at ${pct}% across ${best.t.toLocaleString()} responses.`,
    confidence: conf,
    positive: true,
  };
}

function growth(data: SurveyResponse[]): Insight | null {
  const now  = Date.now();
  const wk7  = now - 7  * 86_400_000;
  const wk14 = now - 14 * 86_400_000;

  const recent = data.filter(r => new Date(r.created_at).getTime() >= wk7).length;
  const prev   = data.filter(r => {
    const t = new Date(r.created_at).getTime();
    return t >= wk14 && t < wk7;
  }).length;

  if (recent < 3 || prev < 1) return null;
  const pct = Math.round((recent - prev) / prev * 100);
  if (Math.abs(pct) < 5) return null;

  const up   = pct > 0;
  const conf: Confidence = (recent >= 100 && prev >= 100) ? "High"
             : (recent >= 30  && prev >= 30)  ? "Medium" : "Low";

  return {
    icon: "📈",
    title: "Growth",
    description: `Responses ${up ? "increased" : "decreased"} ${Math.abs(pct)}% ${up ? "↑" : "↓"} vs the previous 7 days (${recent.toLocaleString()} vs ${prev.toLocaleString()}).`,
    confidence: conf,
    positive: up,
  };
}

function behavioural(data: SurveyResponse[]): Insight | null {
  if (data.length < 15) return null;

  const dp: Record<string, number> = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  for (const r of data) {
    const h = new Date(r.created_at).getUTCHours();
    dp[daypart(h)]++;
  }

  const sorted = Object.entries(dp).sort((a, b) => b[1] - a[1]);
  const [top, topN] = sorted[0];
  const pct = Math.round(topN / data.length * 100);
  if (pct < 28) return null;

  const ranges: Record<string, string> = {
    Morning: "05:00–11:59", Afternoon: "12:00–16:59",
    Evening: "17:00–21:59", Night: "22:00–04:59",
  };

  return {
    icon: "⚡",
    title: "Behavioural",
    description: `${top} hours (${ranges[top]}) generated the highest response volume at ${pct}% of total responses.`,
    confidence: confidence(data.length, pct, 40, 30),
  };
}

// ─── Generate all insights ────────────────────────────────────────────────────

function generate(data: SurveyResponse[]): Insight[] {
  return [
    geographic(data),
    device(data),
    publisher(data),
    growth(data),
    behavioural(data),
  ].filter(Boolean) as Insight[];
}

// ─── Insight card ─────────────────────────────────────────────────────────────

const CONF_STYLES: Record<Confidence, string> = {
  High:   "bg-green-50 text-green-700 border-green-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low:    "bg-gray-100 text-gray-500 border-gray-200",
};

const BORDER: Record<Confidence, string> = {
  High:   "border-l-green-400",
  Medium: "border-l-amber-400",
  Low:    "border-l-gray-300",
};

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`bg-white border border-gray-100 border-l-4 ${BORDER[insight.confidence]} rounded-xl p-4 shadow-sm flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{insight.icon}</span>
          <p className="text-xs font-semibold text-gray-700">{insight.title}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${CONF_STYLES[insight.confidence]}`}>
          {insight.confidence}
        </span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{insight.description}</p>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function InsightsEngine({ responses }: { responses: SurveyResponse[] }) {
  const insights = useMemo(() => generate(responses), [responses]);
  if (!insights.length) return null;

  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Insights
        <span className="ml-2 text-gray-300 font-normal normal-case tracking-normal">
          — updates as filters change
        </span>
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {insights.map(i => <InsightCard key={i.title} insight={i} />)}
      </div>
    </div>
  );
}

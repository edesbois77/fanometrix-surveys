"use client";

import { useMemo } from "react";
import type { SurveyResponse } from "@/lib/types";

type Confidence = "High" | "Medium" | "Low";
type Insight = { icon: string; title: string; description: string; confidence: Confidence; positive?: boolean };

function tally(data: SurveyResponse[], field: keyof SurveyResponse) {
  const m: Record<string, number> = {};
  for (const r of data) { const v = r[field] as string; if (v) m[v] = (m[v] ?? 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function conf(n: number, pct: number, hp: number, mp: number): Confidence {
  return n >= 100 && pct >= hp ? "High" : n >= 30 && pct >= mp ? "Medium" : "Low";
}

function dp(h: number) {
  return h >= 5 && h < 12 ? "Morning" : h >= 12 && h < 17 ? "Afternoon" : h >= 17 && h < 22 ? "Evening" : "Night";
}

function geographic(d: SurveyResponse[]): Insight | null {
  if (d.length < 10) return null;
  const rows = tally(d, "country"); if (!rows.length) return null;
  const [top, n] = rows[0]; const pct = Math.round(n / d.length * 100); if (pct < 20 || n < 5) return null;
  const r = rows[1]; const lead = r ? pct - Math.round(r[1] / d.length * 100) : null;
  return { icon: "🌍", title: "Geographic",
    description: lead && lead > 5
      ? `${top} generated ${pct}% of responses, leading ${r![0]} by ${lead} pp.`
      : `${top} generated ${pct}% of all responses.`,
    confidence: conf(d.length, pct, 40, 25) };
}

function deviceInsight(d: SurveyResponse[]): Insight | null {
  if (d.length < 15) return null;
  const rows = tally(d, "device"); if (!rows.length) return null;
  const [top, n] = rows[0]; const pct = Math.round(n / d.length * 100); if (pct < 50) return null;
  const lbl = top.charAt(0).toUpperCase() + top.slice(1); const s = rows[1];
  return { icon: "📱", title: "Device",
    description: s ? `${lbl} represented ${pct}% of responses, with ${s[0]} at ${Math.round(s[1]/d.length*100)}%.`
                   : `${lbl} represented ${pct}% of responses.`,
    confidence: conf(d.length, pct, 65, 55) };
}

function publisherInsight(d: SurveyResponse[]): Insight | null {
  const pubs: Record<string, { t: number; c: number }> = {};
  for (const r of d) { if (!r.publisher) continue; if (!pubs[r.publisher]) pubs[r.publisher] = { t:0, c:0 }; pubs[r.publisher].t++; if(r.q1&&r.q2&&r.q3) pubs[r.publisher].c++; }
  const valid = Object.entries(pubs).filter(([,v]) => v.t >= 10); if (valid.length < 2) return null;
  const sorted = valid.map(([p,v]) => ({ p, rate: v.c/v.t, t: v.t })).sort((a,b) => b.rate-a.rate);
  const best = sorted[0]; const pct = Math.round(best.rate * 100);
  return { icon: "🏆", title: "Publisher", positive: true,
    description: `${best.p} delivered the highest completion rate at ${pct}% across ${best.t.toLocaleString()} responses.`,
    confidence: best.t >= 100 ? "High" : best.t >= 30 ? "Medium" : "Low" };
}

function growthInsight(d: SurveyResponse[]): Insight | null {
  const now = Date.now(), wk7 = now - 7*86400000, wk14 = now - 14*86400000;
  const recent = d.filter(r => new Date(r.created_at).getTime() >= wk7).length;
  const prev   = d.filter(r => { const t = new Date(r.created_at).getTime(); return t >= wk14 && t < wk7; }).length;
  if (recent < 3 || prev < 1) return null;
  const pct = Math.round((recent - prev) / prev * 100); if (Math.abs(pct) < 5) return null;
  const up = pct > 0;
  return { icon: "📈", title: "Growth", positive: up,
    description: `Responses ${up ? "increased" : "decreased"} ${Math.abs(pct)}% ${up ? "↑" : "↓"} vs the previous 7 days (${recent.toLocaleString()} vs ${prev.toLocaleString()}).`,
    confidence: (recent>=100&&prev>=100) ? "High" : (recent>=30&&prev>=30) ? "Medium" : "Low" };
}

function behaviouralInsight(d: SurveyResponse[]): Insight | null {
  if (d.length < 15) return null;
  const dps: Record<string,number> = { Morning:0, Afternoon:0, Evening:0, Night:0 };
  for (const r of d) dps[dp(new Date(r.created_at).getUTCHours())]++;
  const sorted = Object.entries(dps).sort((a,b) => b[1]-a[1]); const [top, n] = sorted[0];
  const pct = Math.round(n / d.length * 100); if (pct < 28) return null;
  const rng: Record<string,string> = { Morning:"05:00–11:59", Afternoon:"12:00–16:59", Evening:"17:00–21:59", Night:"22:00–04:59" };
  return { icon: "⚡", title: "Behavioural",
    description: `${top} hours (${rng[top]}) generated the highest response volume at ${pct}% of total responses.`,
    confidence: (d.length>=100&&pct>=40) ? "High" : (d.length>=30&&pct>=30) ? "Medium" : "Low" };
}

function generate(d: SurveyResponse[]): Insight[] {
  return [geographic(d), deviceInsight(d), publisherInsight(d), growthInsight(d), behaviouralInsight(d)].filter(Boolean) as Insight[];
}

// ─── Confidence colours (light theme) ────────────────────────────────────────

const CONF_BADGE: Record<Confidence, { bg: string; text: string }> = {
  High:   { bg: "rgba(16,185,129,0.08)",  text: "#059669" },
  Medium: { bg: "rgba(215,184,122,0.12)", text: "#92400E" },
  Low:    { bg: "rgba(11,25,41,0.06)",    text: "#5F6670" },
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const badge = CONF_BADGE[insight.confidence];
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid rgba(11,25,41,0.08)",
      borderLeft: "3px solid #D7B87A",
      borderRadius: 14,
      padding: "16px 16px 14px",
      boxShadow: "0 2px 12px rgba(11,25,41,0.05)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>{insight.icon}</span>
          <p style={{ color: "#D7B87A", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            {insight.title}
          </p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          color: badge.text, background: badge.bg, padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>
          {insight.confidence}
        </span>
      </div>
      <p style={{ color: "#5F6670", fontSize: 12, lineHeight: 1.55, margin: 0 }}>{insight.description}</p>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function InsightsEngine({ responses }: { responses: SurveyResponse[] }) {
  const insights = useMemo(() => generate(responses), [responses]);
  if (!insights.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: "#D7B87A", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", marginBottom: 12 }}>
        Insights
        <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "#5F6670", fontSize: 11, marginLeft: 8 }}>
          — updates as filters change
        </span>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {insights.map(i => <InsightCard key={i.title} insight={i} />)}
      </div>
    </div>
  );
}

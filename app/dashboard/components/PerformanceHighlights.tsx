"use client";

import { useMemo } from "react";
import type { SurveyResponse } from "@/lib/types";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Bucket = { total: number; completed: number };

function bucket(
  responses: SurveyResponse[],
  field: keyof SurveyResponse,
  minTotal = 3,
): { name: string; total: number; completed: number; rate: number }[] {
  const m: Record<string, Bucket> = {};
  for (const r of responses) {
    const v = r[field] as string;
    if (!v) continue;
    if (!m[v]) m[v] = { total: 0, completed: 0 };
    m[v].total++;
    if (r.q1 && r.q2 && r.q3) m[v].completed++;
  }
  return Object.entries(m)
    .filter(([, b]) => b.total >= minTotal)
    .map(([name, b]) => ({ name, ...b, rate: b.completed / b.total }))
    .sort((a, b) => b.rate - a.rate);
}

function weekCount(responses: SurveyResponse[], msSince: number): number {
  const cutoff = Date.now() - msSince;
  return responses.filter(r => new Date(r.created_at).getTime() >= cutoff).length;
}

// ── Highlight card ────────────────────────────────────────────────────────────

function HighlightCard({
  title, name, stat, sub, empty,
}: {
  title: string;
  name?: string;
  stat?: string;
  sub?: string;
  empty?: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex-1 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>
        {title}
      </p>
      {name ? (
        <>
          <p className="text-sm font-bold truncate mb-1" style={{ color: NAVY }} title={name}>
            {name}
          </p>
          {stat && (
            <p className="text-xl font-bold" style={{ color: GOLD }}>{stat}</p>
          )}
          {sub && (
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-400 italic">{empty ?? "Not enough data"}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PerformanceHighlights({ responses }: { responses: SurveyResponse[] }) {
  const highlights = useMemo(() => {
    const publishers  = bucket(responses, "publisher",   5);
    const placements  = bucket(responses, "placement",   5);
    const creatives   = bucket(responses, "creative_id", 3);
    const campaigns   = bucket(responses, "campaign_id", 3);

    const topPublisher = publishers[0] ?? null;
    const topPlacement = placements[0] ?? null;
    const topCreative  = creatives[0]  ?? null;

    // Fastest growing campaign: highest ratio of last-7d responses vs prior 7d
    const fastestCampaign = (() => {
      const now = Date.now();
      const W   = 7 * 86_400_000;
      const grouped: Record<string, SurveyResponse[]> = {};
      for (const r of responses) {
        const id = r.campaign_id ?? "";
        if (!id) continue;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(r);
      }
      let best: { name: string; growth: number } | null = null;
      for (const [id, rows] of Object.entries(grouped)) {
        if (rows.length < 5) continue;
        const recent = rows.filter(r => new Date(r.created_at).getTime() >= now - W).length;
        const prior  = rows.filter(r => {
          const t = new Date(r.created_at).getTime();
          return t >= now - 2 * W && t < now - W;
        }).length;
        if (prior < 1 || recent < 1) continue;
        const growth = Math.round(((recent - prior) / prior) * 100);
        if (!best || growth > best.growth) best = { name: id, growth };
      }
      // Match campaign slug to friendly name via campaigns array if possible
      const name = campaigns.find(c => c.name === best?.name)?.name ?? best?.name;
      return best ? { ...best, name: name ?? best.name } : null;
    })();

    return { topPublisher, topPlacement, topCreative, fastestCampaign };
  }, [responses]);

  if (responses.length < 5) return null;

  const { topPublisher, topPlacement, topCreative, fastestCampaign } = highlights;

  return (
    <div className="mb-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Performance Highlights
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HighlightCard
          title="Top Publisher"
          name={topPublisher?.name}
          stat={topPublisher ? `${Math.round(topPublisher.rate * 100)}%` : undefined}
          sub={topPublisher ? `${topPublisher.completed.toLocaleString()} completed responses` : undefined}
          empty="No publisher data"
        />
        <HighlightCard
          title="Top Placement"
          name={topPlacement?.name}
          stat={topPlacement ? `${Math.round(topPlacement.rate * 100)}%` : undefined}
          sub={topPlacement ? `${topPlacement.completed.toLocaleString()} completed responses` : undefined}
          empty="No placement data"
        />
        <HighlightCard
          title="Top Creative"
          name={topCreative?.name}
          stat={topCreative ? `${Math.round(topCreative.rate * 100)}%` : undefined}
          sub={topCreative ? `${topCreative.completed.toLocaleString()} completed responses` : undefined}
          empty="No creative ID data yet"
        />
        <HighlightCard
          title="Fastest Growing Campaign"
          name={fastestCampaign?.name}
          stat={fastestCampaign ? `+${fastestCampaign.growth}%` : undefined}
          sub={fastestCampaign ? "response growth vs prior 7 days" : undefined}
          empty="Insufficient trend data"
        />
      </div>
    </div>
  );
}

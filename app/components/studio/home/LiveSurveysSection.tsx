"use client";

// ── Home — Live surveys strip (self-contained, additive) ─────────────────────
// A lightweight cross-research operational section: the org's live Studio surveys
// with responses, planned progress and recency, each routing into Manage → Survey.
// Fetches its own bounded, owner-scoped endpoint and renders NOTHING when there is
// nothing live — so it never disturbs the intelligence-led Home for orgs with no
// live Studio research.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Eyebrow } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";
import { SwipeRow, SwipeItem } from "./SwipeRow";
import { relativeResponseLabel } from "@/lib/studio/collection-health";

type LiveSurvey = {
  id: string; name: string; responses: number; liveCampaigns: number;
  hasTarget: boolean; progressRatio: number | null; targetTotal: number; completedTowardTarget: number;
  lastResponseAt: string | null; href: string;
};

const num = (n: number) => n.toLocaleString();
const pct = (r: number | null) => (r == null ? null : `${Math.round(r * 100)}%`);

export function LiveSurveysSection() {
  const [surveys, setSurveys] = useState<LiveSurvey[] | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/survey-studio/live-surveys")
      .then((r) => (r.ok ? r.json() : { surveys: [] }))
      .then((j) => { if (!cancelled) setSurveys((j.surveys ?? []) as LiveSurvey[]); })
      .catch(() => { if (!cancelled) setSurveys([]); });
    return () => { cancelled = true; };
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clock seed
  useEffect(() => { setNowMs(Date.now()); }, []);

  if (!surveys || surveys.length === 0) return null; // nothing live → render nothing

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <Eyebrow>Operational</Eyebrow>
          <h2 className="text-lg font-bold tracking-[-0.01em] mt-0.5" style={{ color: "var(--text-primary)" }}>Live surveys</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Your surveys collecting fan responses right now.</p>
        </div>
        <Link href="/survey-studio/manage?view=surveys" className="text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>
          Manage surveys <StudioIcon.arrowRight size={14} />
        </Link>
      </div>
      <SwipeRow>
        {surveys.map((s) => {
          const last = relativeResponseLabel(s.lastResponseAt, nowMs ?? 0);
          const p = pct(s.progressRatio);
          return (
            <SwipeItem key={s.id}>
              <Link href={s.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)] h-full">
                <Card interactive className="h-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#5C8560" }} aria-hidden /> {s.liveCampaigns} live
                    </span>
                    <StudioIcon.arrowRight size={14} />
                  </div>
                  <h3 className="text-[15px] font-bold tracking-[-0.01em] mt-2 line-clamp-2" style={{ color: "var(--text-primary)" }}>{s.name}</h3>
                  <p className="text-[22px] font-bold tracking-[-0.02em] mt-2" style={{ color: "var(--text-primary)" }}>{num(s.responses)}</p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>responses{last ? ` · ${last}` : ""}</p>
                  {s.hasTarget && p && (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>
                        <span>{num(s.completedTowardTarget)} of {num(s.targetTotal)}</span><span className="font-semibold">{p}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((s.progressRatio ?? 0) * 100))}%`, background: "var(--accent-gold)" }} />
                      </div>
                    </div>
                  )}
                </Card>
              </Link>
            </SwipeItem>
          );
        })}
      </SwipeRow>
    </section>
  );
}

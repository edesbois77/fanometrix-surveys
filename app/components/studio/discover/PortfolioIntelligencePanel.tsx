"use client";

// ── Discover → "Across your surveys" (Stage 8) ───────────────────────────────
// A compact, access-scoped multi-survey intelligence panel: the Core measured
// findings across the surveys the caller can access. Self-fetches and self-HIDES
// when the caller isn't exposed to Core intelligence (non-admin + flag off) or there
// is nothing measured yet — so ordinary users see no change. It never invents
// cross-survey comparability; it links each finding back to its own survey.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, StatusBadge } from "@/app/components/workspace-ui";
import { surveyDashboardHref } from "@/lib/studio/discover-nav";
import type { PortfolioResponse } from "@/app/api/survey-studio/discover/portfolio/route";
import type { PortfolioIntelligence } from "@/lib/studio/survey-portfolio";

const nf = (n: number) => n.toLocaleString();

export function PortfolioIntelligencePanel() {
  const [pf, setPf] = useState<PortfolioIntelligence | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/survey-studio/discover/portfolio");
        if (!res.ok) return;
        const body = (await res.json()) as PortfolioResponse;
        if (alive && body.authorised) setPf(body.portfolio);
      } catch { /* silent — panel simply doesn't appear */ }
    })();
    return () => { alive = false; };
  }, []);

  // Self-hide: not exposed, or nothing worth showing.
  if (!pf || !pf.visible) return null;
  if (pf.measuredFindings.length === 0 && pf.didYouKnow.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center gap-2.5 flex-wrap">
        <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Across your surveys</h2>
        <StatusBadge label="New" tone="info" dot />
      </div>

      {pf.didYouKnow.length > 0 && (
        <p className="text-sm mb-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{pf.didYouKnow[0]}</p>
      )}

      <p className="text-[11px] fx-tabular-nums mb-3" style={{ color: "var(--text-tertiary)" }}>
        {nf(pf.surveysAccessible)} survey{pf.surveysAccessible === 1 ? "" : "s"} · {nf(pf.totalResponses)} response{pf.totalResponses === 1 ? "" : "s"} across them · {nf(pf.surveysWithMeasuredFindings)} with measured findings
      </p>

      {pf.measuredFindings.length > 0 ? (
        <div className="space-y-2.5">
          {pf.measuredFindings.map((f) => (
            <Link key={f.surveyId} href={surveyDashboardHref(f.surveyId)} className="block">
              <Card padding="md" interactive>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <StatusBadge label="Measured" tone="accent" />
                  {f.statistic && <span className="text-sm font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{f.statistic}</span>}
                  <span className="text-[11px] ml-auto" style={{ color: "var(--text-tertiary)" }}>{f.surveyName}</span>
                </div>
                <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{f.title}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card padding="md"><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No measured findings across your surveys yet — they&rsquo;ll appear here as surveys are analysed.</p></Card>
      )}

      {pf.truncated && (
        <p className="text-[11px] mt-2.5" style={{ color: "var(--text-tertiary)" }}>Showing findings from your most recent surveys.</p>
      )}
    </section>
  );
}

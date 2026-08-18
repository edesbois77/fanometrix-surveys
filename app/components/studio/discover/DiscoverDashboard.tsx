"use client";

// ── Discover → Overview — the editorial front page of Survey Studio ──────────
// "The latest from your research." NOT an inventory (that's Surveys / Studies /
// Manage). It leads with what the research is SAYING — a "Did you know?" hero drawn
// from governed intelligence — then Live Now, a few orientation numbers, a richer
// Latest Findings & Analysis strip, a restrained Latest activity feed, and compact
// Explore columns. All data comes from the governed endpoint; the client derives
// nothing and never invokes a model. Sections omit themselves when empty.

import { useState } from "react";
import Link from "next/link";
import {
  WorkspaceHeader, Card, MetricTile, EmptyState, ErrorState, PageLoadingState,
} from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";
import { useDiscoverDashboard } from "./useDiscoverDashboard";
import { useDiscoverContent, type DiscoverContentItem } from "./useDiscoverContent";
import type { DiscoverDashboardData } from "@/app/api/survey-studio/discover/dashboard/route";
import { ACTIVITY_WINDOWS, type FeaturedFinding, type ResearchFeedItem, type LiveSurvey, type ExploreItem, type ActivityPoint } from "@/lib/studio/discover-dashboard";

const nf = (n: number) => n.toLocaleString();
const SURVEYS_HREF = `${DISCOVER_BASE}/surveys`;
const STUDIES_HREF = `${DISCOVER_BASE}/studies`;

function SectionHeading({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{title}</h2>
      {href && cta && <Link href={href} className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>{cta}</Link>}
    </div>
  );
}

// ── 1 · DID YOU KNOW? — the editorial hero, from governed intelligence ───────
function heroSupport(f: FeaturedFinding): string {
  if (f.support) return f.support;
  return f.source === "analysis"
    ? `One of the strongest findings from the latest analysis of ${f.surveyName}.`
    : `One of the strongest findings from ${f.surveyName}.`;
}
function Hero({ f }: { f: FeaturedFinding }) {
  return (
    <Link href={f.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)]">
      <div className="border p-6 md:p-8 transition-shadow hover:shadow-[var(--shadow-md)]" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--accent-gold)", background: "#FBF7EE", boxShadow: "var(--shadow-sm)" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: "var(--accent-ink)" }}>Did you know?</p>
        <p className="text-xl md:text-2xl font-bold leading-snug tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{f.headline}</p>
        <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{heroSupport(f)}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
            {f.surveyName}{f.source === "analysis" && f.generatedLabel ? ` · analysed ${f.generatedLabel}` : ""}
          </p>
          <span className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>Explore finding →</span>
        </div>
      </div>
    </Link>
  );
}

// ── 2 · LIVE NOW ─────────────────────────────────────────────────────────────
// A subtle pulsing green dot signals genuinely-collecting research. ONLY the dot's
// ring animates (not the pill/card), and the animation is motion-safe — under
// prefers-reduced-motion it renders as a plain static dot (no trading-terminal feel).
function LivePill() {
  const green = "var(--success, #3F5D42)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: green }}>
      <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: green }} />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: green }} />
      </span>
      Live
    </span>
  );
}
function LiveCard({ s }: { s: LiveSurvey }) {
  return (
    <Link href={s.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)]">
      <Card interactive padding="md" className="h-full">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{s.name}</h3>
          <LivePill />
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {nf(s.responses)} response{s.responses === 1 ? "" : "s"} · {s.campaignCount} campaign{s.campaignCount === 1 ? "" : "s"}{s.lastResponseLabel ? ` · latest ${s.lastResponseLabel}` : ""}
        </p>
        <span className="mt-2 inline-block text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>View live survey →</span>
      </Card>
    </Link>
  );
}

// ── 4 · LATEST FINDINGS & ANALYSIS ───────────────────────────────────────────
function StatLine({ label, pct, strong }: { label: string; pct: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate" style={{ color: strong ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className="fx-tabular-nums flex-shrink-0" style={{ color: strong ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: strong ? 700 : 500 }}>{pct}%</span>
    </div>
  );
}

// Restrained mini horizontal-bar treatment for a DISTRIBUTION finding. Values are
// server-owned (real labels + percentages, full 0–100 scale — never truncated), n
// preserved. Supporting evidence, not the headline.
function DistributionBars({ items, base }: { items: { label: string; pct: number }[]; base?: number }) {
  return (
    <div className="mt-3 space-y-1.5" aria-label="Answer distribution">
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`}>
          <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
            <span className="truncate" style={{ color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: i === 0 ? 600 : 400 }}>{it.label}</span>
            <span className="fx-tabular-nums flex-shrink-0" style={{ color: i === 0 ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: i === 0 ? 700 : 500 }}>{it.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, it.pct))}%`, background: i === 0 ? "var(--accent-gold)" : "var(--border-strong, #C9CDD3)" }} />
          </div>
        </div>
      ))}
      {typeof base === "number" && <p className="text-[10px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>n = {base.toLocaleString()}</p>}
    </div>
  );
}
function FindingCard({ f }: { f: FeaturedFinding }) {
  const isAnalysis = f.kind === "analysis";
  // A raw RESULT card leads with the question and its distribution; a FINDING leads
  // with the claim; an ANALYSIS with the verdict + synthesis.
  const label = f.kind === "analysis" ? "Analysis" : f.kind === "result" ? "Result" : "Finding";
  return (
    <Link href={f.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)] h-full">
      <Card interactive padding="md" className="h-full">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: isAnalysis ? "var(--accent-ink)" : "var(--text-tertiary)" }}>
          {label}
        </p>
        <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{f.headline}</p>
        {f.distribution && f.distribution.length >= 2 ? (
          <DistributionBars items={f.distribution} base={f.base} />
        ) : f.metrics ? (
          <div className="mt-3 space-y-1.5">
            <StatLine label={f.metrics.option} pct={f.metrics.pct} strong />
            {f.metrics.runnerUp && <StatLine label={f.metrics.runnerUp.option} pct={f.metrics.runnerUp.pct} />}
          </div>
        ) : f.support ? (
          <p className="text-xs mt-2 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{f.support}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>{f.surveyName}</span>
          <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>{isAnalysis ? "Explore →" : "See results →"}</span>
        </div>
      </Card>
    </Link>
  );
}

// ── 6 · LATEST ACTIVITY (clean compact rows; secondary to intelligence) ──────
const ACTIVITY_TONE: Record<ResearchFeedItem["kind"], string> = {
  analysis: "var(--accent-ink)",
  collecting: "var(--success, #3F5D42)",
  responses: "var(--text-secondary)",
  "new-survey": "var(--text-tertiary)",
  "study-updated": "var(--text-tertiary)",
};
function ActivityRow({ item, last }: { item: ResearchFeedItem; last: boolean }) {
  return (
    <Link href={item.href} className={`flex items-center gap-3 py-3 group ${last ? "" : "border-b"}`} style={{ borderColor: "var(--border-subtle)" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: ACTIVITY_TONE[item.kind] }}>{item.reason}</span>
          {item.timeLabel && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>· {item.timeLabel}</span>}
        </div>
        <p className="text-sm font-medium truncate mt-0.5 group-hover:underline" style={{ color: "var(--text-primary)" }}>{item.title}</p>
        {item.detail && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{item.detail}</p>}
      </div>
      <span className="text-xs flex-shrink-0" style={{ color: "var(--accent-ink)" }} aria-hidden>→</span>
    </Link>
  );
}

// ── 7 · EXPLORE (compact discovery columns) ──────────────────────────────────
function ExploreColumn({ title, items, href, cta }: { title: string; items: ExploreItem[]; href: string; cta: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
        <Link href={href} className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>{cta}</Link>
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <Link key={it.id} href={it.href} className="flex items-center justify-between gap-3 py-1.5 group">
            <span className="text-sm truncate group-hover:underline" style={{ color: "var(--text-primary)" }}>{it.name}</span>
            {it.meta && <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{it.meta}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── 5 · RESEARCH ACTIVITY — "answers collected over time" ────────────────────
// One restrained page-level chart. Real answers-per-day (governed, reconciles with
// Total Answers), 0-baselined so magnitude is honest, minimal chrome. 7/30/90 toggle
// (default 30) slices the pre-built continuous 90-day series client-side.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(d: string): string { const [, m, day] = d.split("-"); return `${Number(day)} ${MONTHS[Number(m) - 1]}`; }

function ResearchActivityChart({ points }: { points: ActivityPoint[] }) {
  const [win, setWin] = useState<number>(30);
  const windowed = points.slice(-win);
  const total = windowed.reduce((a, p) => a + p.answers, 0);
  const max = Math.max(1, ...windowed.map((p) => p.answers));
  const W = 640, H = 76, pad = 4;
  const n = windowed.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = windowed.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.answers).toFixed(1)}`).join(" ");
  const area = n >= 2 ? `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z` : "";
  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{total.toLocaleString()} answer{total === 1 ? "" : "s"} in the last {win} days</p>
        <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }} role="group" aria-label="Time window">
          {ACTIVITY_WINDOWS.map((w) => {
            const active = w === win;
            return (
              <button key={w} onClick={() => setWin(w)} aria-pressed={active}
                className="text-xs font-semibold px-2.5 py-1 transition-colors"
                style={active ? { background: "var(--accent-gold)", color: "var(--accent-ink)" } : { background: "transparent", color: "var(--text-tertiary)" }}>
                {w}d
              </button>
            );
          })}
        </div>
      </div>
      {n >= 2 ? (
        <>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Answers collected over the last ${win} days`}>
            <path d={area} fill="var(--accent-gold)" fillOpacity="0.12" />
            <path d={line} fill="none" stroke="var(--accent-gold)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{fmtDay(windowed[0].date)}</span>
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{fmtDay(windowed[n - 1].date)}</span>
          </div>
        </>
      ) : (
        <p className="text-xs py-4 text-center" style={{ color: "var(--text-tertiary)" }}>Not enough activity to chart yet.</p>
      )}
    </Card>
  );
}

// ── FROM FANOMETRIX — governed editorial/market-wide content ─────────────────
// Reuses the existing governed /api/insights (public → everyone; restricted → org;
// admin_only → operators). Makes Discover useful even with no proprietary research.
const CONTENT_TYPE_LABEL: Record<string, string> = {
  report: "Report", market_analysis: "Market analysis", survey_results: "Survey results",
  social_intelligence: "Social intelligence", cheat_sheet: "Cheat sheet", dashboard: "Dashboard", download: "Download",
};
function fmtPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10).split("-");
  if (d.length !== 3) return null;
  return `${Number(d[2])} ${MONTHS[Number(d[1]) - 1]} ${d[0]}`;
}
function ContentCard({ c }: { c: DiscoverContentItem }) {
  return (
    <Link href={`/insights/${c.slug}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)] h-full">
      <Card interactive padding="none" className="h-full overflow-hidden">
        {c.featured_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.featured_image_url} alt="" className="w-full h-28 object-cover" style={{ background: "var(--surface-sunken)" }} />
        )}
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--accent-ink)" }}>{CONTENT_TYPE_LABEL[c.content_type] ?? "Research"}</p>
          <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{c.title}</h3>
          {c.summary && <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{c.summary}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{fmtPublished(c.published_at) ?? "Fanometrix"}</span>
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>Read →</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
function FromFanometrix({ enabled, max = 3 }: { enabled: boolean; max?: number }) {
  const { items } = useDiscoverContent(enabled);
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionHeading title="From Fanometrix" href="/insights" cta="View all →" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, max).map((c) => <ContentCard key={c.id} c={c} />)}
      </div>
    </section>
  );
}

export function DiscoverDashboard({ previewData }: { previewData?: DiscoverDashboardData } = {}) {
  const live = useDiscoverDashboard(previewData == null);
  const { loading, error, data } = previewData != null ? { loading: false, error: false, data: previewData } : live;

  const header = (
    <WorkspaceHeader eyebrow="Discover" title="Overview" description="The latest from your research." />
  );
  if (loading) return <>{header}<div className="mt-8"><PageLoadingState lines={2} /></div></>;
  if (error || !data) return <>{header}<div className="mt-8"><ErrorState title="We couldn't load your overview" description="Something went wrong on our side. Please try again in a moment." backHref={null} /></div></>;

  const { accountShape, hero, liveNow, glance, insights, reports, researchActivity, activity, explore, totals } = data;
  const isPreview = previewData != null;

  // No proprietary research yet: lead with Fanometrix editorial content (so the page
  // is useful from day one), then a gentle prompt to start — never a bare empty box.
  if (totals.surveys === 0 && totals.studies === 0) {
    return (
      <>
        {header}
        <FromFanometrix enabled={!isPreview} max={6} />
        <div className="mt-8">
          <EmptyState icon={<StudioIcon.discover size={22} />} title="Start your research"
            description="You haven't run any research yet. When you do, its latest findings and activity will appear here alongside research from Fanometrix."
            action={<Link href={SURVEYS_HREF} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Browse surveys →</Link>} />
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      {/* 1 — DID YOU KNOW? hero. Omitted when there is no governed intelligence
          yet; Live Now / activity then lead. */}
      {hero && <section className="mt-6"><Hero f={hero} /></section>}

      {/* 2 — LIVE NOW. Conditional: hidden entirely when nothing is collecting. */}
      {liveNow.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Live now" />
          <div className={`grid gap-3 ${liveNow.length === 1 ? "" : "sm:grid-cols-2"}`}>
            {liveNow.map((s) => <LiveCard key={s.id} s={s} />)}
          </div>
        </section>
      )}

      {/* 3 — RESEARCH AT A GLANCE. Orientation numbers, never the hero. */}
      <section className="mt-8">
        <SectionHeading title="Research at a glance" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <MetricTile label="Total surveys" value={nf(glance.surveys)} caption="Research available to you" />
          <MetricTile label="Total answers" value={nf(glance.answers)} caption="Questions answered" />
          <MetricTile label="Live surveys" value={nf(glance.live)} caption="Collecting now" />
          <MetricTile label="Surveys analysed" value={nf(glance.analyses)} caption="Analysis available" />
        </div>
      </section>

      {/* 4 — LATEST INSIGHTS. A mixed governed feed (analysis + strong findings + raw
          result distributions), excludes the hero → no duplication. */}
      {insights.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Latest insights" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((f) => <FindingCard key={f.id} f={f} />)}
          </div>
        </section>
      )}

      {/* 5 — FROM FANOMETRIX. Governed editorial/market-wide content — useful for
          every role, especially light-research accounts. Hidden when the caller can
          see none. */}
      <FromFanometrix enabled={!isPreview} />

      {/* 6 — RESEARCH ACTIVITY. Answers over time. Conditional: only ESTABLISHED
          accounts (enough research for a multi-day trend to be meaningful) AND real
          timestamped activity — a one-survey account gets a chart-free page. */}
      {accountShape === "established" && researchActivity && researchActivity.points.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Research activity" />
          <ResearchActivityChart points={researchActivity.points} />
        </section>
      )}

      {/* 6 — LATEST REPORTS. Omitted in V1: there is no governed per-caller report
          listing (reports === null). The section slots in here when one exists. */}
      {reports && reports.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Latest reports" href={`${DISCOVER_BASE}/reports`} cta="View all reports →" />
          <div className="space-y-2">
            {reports.map((r) => (
              <Link key={r.id} href={r.href} className="block focus:outline-none rounded-[var(--radius-panel)]">
                <Card interactive padding="md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.title}</h3>
                      {r.dateLabel && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{r.dateLabel}</p>}
                    </div>
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>Open report →</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 6 — LATEST ACTIVITY. Capped, secondary to intelligence. */}
      {activity.length > 0 && (
        <section className="mt-8">
          <SectionHeading title="Latest activity" />
          <Card padding="md">
            {activity.map((item, i) => <ActivityRow key={item.id} item={item} last={i === activity.length - 1} />)}
          </Card>
        </section>
      )}

      {/* 7 — EXPLORE YOUR RESEARCH. Compact discovery, not the full index. */}
      {(explore.surveys.length > 0 || explore.studies.length > 0) && (
        <section className="mt-8 mb-2">
          <SectionHeading title="Explore your research" />
          <Card padding="md">
            <div className={`grid gap-6 ${explore.studies.length > 0 ? "sm:grid-cols-2" : ""}`}>
              {explore.surveys.length > 0 && <ExploreColumn title="Recent surveys" items={explore.surveys} href={SURVEYS_HREF} cta="View all surveys →" />}
              {explore.studies.length > 0 && <ExploreColumn title="Studies" items={explore.studies} href={STUDIES_HREF} cta="View all studies →" />}
            </div>
          </Card>
        </section>
      )}
    </>
  );
}

"use client";

// ── Survey Studio Home — the adaptive, intelligence-led overview ─────────────
// Home is NOT a fixed operational dashboard. There is no permanent KPI strip and
// no reserved empty space: every section is conditional and appears only when it
// has genuine data, in a fixed priority so the most important thing for THIS
// organisation, right now, leads.
//
//   Needs Attention → Live Research → Performance → Latest Intelligence
//     → Your Research → Recent Reports → Activity
//
// The natural states fall out of that ordering + conditional rendering:
//   • New organisation      — no operational work: lead with the CTA + entitled
//                             intelligence (EmptyHome).
//   • Established, nothing live — intelligence, research and reports lead.
//   • Live research         — Live Research + its Performance rise to the top.
//   • Action required       — Needs Attention rises above everything.
//
// ORGANISATIONS INHERITANCE: the Current Organisation is the platform-owned
// session context (the global switcher). Home never forks org state or access —
// it consumes governed, org-scoped endpoints and re-resolves when the Current
// Organisation changes. The header CTA is a permission-aware UX projection only;
// real Product/capability access stays governed server-side.
//
// Review harness: /survey-studio?preview=new|established|live|attention renders
// representative SAMPLE data for each state (add &as=create|request to force the
// CTA). See ./fixtures.

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import type { UserRole } from "@/lib/auth";
import { StudioContainer } from "../StudioContainer";
import { StudioIcon } from "../studio-icons";
import { SwipeRow, SwipeItem } from "./SwipeRow";
import { useStudioHome } from "./useStudioHome";
import type { CtaMode, ProjectCard, FindingCard } from "./types";
import {
  LiveResearchCard, FindingResultCard, ResearchCard, ReportsPanel,
  PerformancePanel, RecentActivity, NeedsAttention, Band, NAVY, GOLD,
} from "./cards";
import { Card, Button, Eyebrow, Skeleton } from "@/app/components/workspace-ui";
import { LiveSurveysSection } from "./LiveSurveysSection";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const CTA: Record<CtaMode, { label: string; href: string; icon: "create" | "request" }> = {
  create: { label: "Create survey", href: "/survey-studio/create", icon: "create" },
  request: { label: "Request research", href: "/survey-studio/request", icon: "request" },
};

/** Read a query param on the client without a Suspense boundary — the preview
 *  harness is a review-only affordance, so window.location is the simplest
 *  reliable source. */
function useQuery(): URLSearchParams {
  const [q, setQ] = useState<URLSearchParams>(() => new URLSearchParams());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the query once on mount
    setQ(params);
  }, []);
  return q;
}

// ── Preview banner — never let SAMPLE data be mistaken for production ─────────
function PreviewBanner({ state }: { state: string }) {
  const states = ["new", "established", "live", "attention"];
  return (
    <div className="mb-6 rounded-[var(--radius-panel)] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: "#FBF7EE", border: "1px solid #ECDCB8" }}>
      <span className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: "#8A6A2F" }}>Preview — sample data</span>
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Showing the <strong style={{ color: "var(--text-primary)" }}>{state}</strong> Home state. Not live data.
      </span>
      <div className="flex items-center gap-1.5 ml-auto">
        {states.map((s) => (
          <Link
            key={s}
            href={`/survey-studio?preview=${s}`}
            className="text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
            style={s === state
              ? { background: NAVY, color: "#fff" }
              : { background: "rgba(0,0,0,0.04)", color: "var(--text-secondary)" }}
          >
            {s}
          </Link>
        ))}
        <Link href="/survey-studio" className="text-xs font-semibold px-2.5 py-1 rounded-md" style={{ color: "var(--accent-ink)" }}>Exit</Link>
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-72 mb-2" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
      </div>
    </div>
  );
}

// ── Empty / new-organisation Home (lead with the CTA, never a wall of zeros) ──
function EmptyHome({ ctaMode, name, intelligence }: { ctaMode: CtaMode; name: string; intelligence: FindingCard[] }) {
  const lead = CTA[ctaMode];
  const secondary = ctaMode === "create"
    ? { label: "Request research instead", href: "/survey-studio/request" }
    : { label: "Create a survey instead", href: "/survey-studio/create" };
  // A compact three-step story — Create → Deploy → Learn — that the user reads at
  // a glance, so accessible intelligence is only a short scroll away. Not a
  // wizard; just the shape of the journey. Permission-aware wording.
  const steps = ctaMode === "create"
    ? [
        { t: "Create", d: "Build your survey and creative" },
        { t: "Deploy", d: "Go live across your publishers" },
        { t: "Learn", d: "Responses become evidence here" },
      ]
    : [
        { t: "Request", d: "Tell us what you need to learn" },
        { t: "We run it", d: "Fanometrix designs and collects" },
        { t: "Learn", d: "Findings and reports land here" },
      ];
  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-panel)] p-6 sm:p-8 relative overflow-hidden" style={{ background: NAVY }}>
        <Eyebrow className="!text-[color:rgba(255,255,255,0.55)]">Survey Studio</Eyebrow>
        <h1 className="mt-2 text-2xl sm:text-[28px] font-bold tracking-[-0.02em] text-white">
          Welcome{name ? `, ${name}` : ""}. Let&apos;s start your first study.
        </h1>
        <p className="mt-2 text-sm max-w-xl leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
          There&apos;s no research here yet. Survey Studio turns fan attention into evidence — begin the way that fits your team.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={lead.href} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-[var(--radius-control)]" style={{ background: GOLD, color: NAVY }}>
            {lead.label} <StudioIcon.arrowRight size={15} />
          </Link>
          <Link href={secondary.href} className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>
            {secondary.label}
          </Link>
        </div>
      </div>

      {/* Compact Create → Deploy → Learn strip — one row, not three tall cards. */}
      <Card padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">
          {steps.map((s, i) => (
            <Fragment key={s.t}>
              <div className="flex items-start gap-3 sm:flex-1 min-w-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0" style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }}>{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{s.t}</div>
                  <div className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{s.d}</div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <span className="hidden sm:block px-3 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} aria-hidden>
                  <StudioIcon.arrowRight size={16} />
                </span>
              )}
            </Fragment>
          ))}
        </div>
      </Card>

      {/* Any shared/entitled intelligence the new organisation can already access. */}
      {intelligence.length > 0 && (
        <section className="pt-2">
          <Band eyebrow="Latest intelligence" title="Available to your organisation" description="Published findings you're entitled to explore while your first study runs." link={{ label: "Discover", href: "/survey-studio/discover" }} />
          <SwipeRow>
            {intelligence.map((f) => <SwipeItem key={f.id}><FindingResultCard f={f} /></SwipeItem>)}
          </SwipeRow>
        </section>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function StudioHome() {
  const { user, loading: sessionLoading } = useSession();
  const role = user?.role as UserRole | undefined;
  const query = useQuery();
  const preview = query.get("preview");
  const as = query.get("as");
  const data = useStudioHome(role, { preview, as });
  const firstName = user?.firstName?.trim() || "";

  const inPreview = data.preview != null;

  if (!inPreview && (sessionLoading || data.loading)) {
    return <StudioContainer><HomeSkeleton /></StudioContainer>;
  }

  const banner = inPreview ? <PreviewBanner state={data.preview as string} /> : null;

  if (!data.hasActivity) {
    return (
      <StudioContainer>
        {banner}
        <EmptyHome ctaMode={data.ctaMode} name={firstName} intelligence={data.intelligence} />
      </StudioContainer>
    );
  }

  const action = CTA[data.ctaMode];
  const hasLive = data.liveResearch.length > 0;

  return (
    <StudioContainer>
      {banner}
      <div className="space-y-8 lg:space-y-10">

        {/* Headline context + permission-aware CTA */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Eyebrow className="mb-1.5">Survey Studio</Eyebrow>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>
              {greeting()}{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
              Here&apos;s what&apos;s happening across your fan research.
            </p>
          </div>
          <Button href={action.href} variant="primary" size="md">
            <StudioIcon.create size={15} /> {action.label}
          </Button>
        </header>

        {/* 1 — Needs Attention (only when actionable; leads everything) */}
        {data.attention.length > 0 && (
          <NeedsAttention items={data.attention} />
        )}

        {/* 1b — Live Studio surveys (operational, owner-scoped). Self-contained and
            self-hiding: renders nothing when the org has no live Studio survey, so
            the intelligence-led Home is unchanged for orgs without live research.
            Skipped in the sample-data preview harness. */}
        {!inPreview && <LiveSurveysSection />}

        {/* 2 — Live Research */}
        {hasLive && (
          <section>
            <Band eyebrow="Operational" title="Live research" description="Active studies collecting fan evidence right now." link={{ label: "View live research", href: "/survey-studio/manage" }} />
            <SwipeRow>
              {data.liveResearch.map((p: ProjectCard) => <SwipeItem key={p.id}><LiveResearchCard p={p} /></SwipeItem>)}
            </SwipeRow>
          </section>
        )}

        {/* 3 — Performance (only when meaningful live performance; related to live research) */}
        {data.performance.length > 0 && (
          <section>
            <PerformancePanel data={data.performance} />
          </section>
        )}

        {/* 4 — Latest Intelligence (published findings) */}
        {data.intelligence.length > 0 && (
          <section>
            <Band eyebrow="Latest intelligence" title="Published findings" description="Evidence-backed results from your research, ready to explore." link={{ label: "Discover", href: "/survey-studio/discover" }} />
            <SwipeRow>
              {data.intelligence.map((f) => <SwipeItem key={f.id}><FindingResultCard f={f} /></SwipeItem>)}
            </SwipeRow>
          </section>
        )}

        {/* 5 — Your Research (route into Discover → Research) */}
        {data.research.length > 0 && (
          <section>
            <Band eyebrow="Your research" title="Studies you can access" description="Recent research across your organisation." link={{ label: "View all research", href: "/survey-studio/discover" }} />
            <SwipeRow>
              {data.research.map((p) => <SwipeItem key={p.id}><ResearchCard p={p} /></SwipeItem>)}
            </SwipeRow>
          </section>
        )}

        {/* 6 + 7 — Recent Reports + Activity (compact, low priority; each only when present) */}
        {(data.reports.length > 0 || data.activity.length > 0) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.reports.length > 0 && <ReportsPanel items={data.reports} />}
            {data.activity.length > 0 && <RecentActivity items={data.activity} />}
          </section>
        )}

      </div>
    </StudioContainer>
  );
}

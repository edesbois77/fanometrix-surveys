"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Insight, InsightBlock } from "@/lib/types";

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("revealed"); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

// ─── Stat counter hook ────────────────────────────────────────────────────────

function useCountUp(target: string, duration = 1400) {
  const [display, setDisplay] = useState("0");
  const triggered = useRef(false);

  const run = useCallback(() => {
    if (triggered.current) return;
    triggered.current = true;
    const numMatch = target.match(/[\d,.]+/);
    if (!numMatch) { setDisplay(target); return; }
    const num = parseFloat(numMatch[0].replace(/,/g, ""));
    const suffix = target.slice(target.indexOf(numMatch[0]) + numMatch[0].length);
    const prefix = target.slice(0, target.indexOf(numMatch[0]));
    const isDecimal = target.includes(".");
    const start = Date.now();
    function tick() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = num * eased;
      const formatted = isDecimal
        ? current.toFixed(1)
        : Math.round(current).toLocaleString();
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { run(); obs.unobserve(el); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [run]);

  return { display, ref };
}

// ─── Block components ─────────────────────────────────────────────────────────

function HeroBlock({ b }: { b: Extract<InsightBlock, { type: "hero" }> }) {
  return (
    <section className="relative min-h-[70vh] flex flex-col justify-end bg-[#0B1929] overflow-hidden px-6 md:px-16 lg:px-24 pb-16 pt-28">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle at 60% 40%, #D7B87A 0%, transparent 60%), radial-gradient(circle at 20% 80%, #D7B87A 0%, transparent 50%)" }} />

      <div className="relative z-10 max-w-4xl">
        {b.label && (
          <p className="text-[#D7B87A] text-xs font-bold tracking-[0.25em] uppercase mb-8">
            {b.label}
          </p>
        )}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[0.95] tracking-tight mb-6"
          style={{ fontFeatureSettings: '"ss01"' }}>
          {b.headline}
        </h1>
        {b.subheadline && (
          <p className="text-lg md:text-xl text-white/60 max-w-2xl leading-relaxed font-light">
            {b.subheadline}
          </p>
        )}
        <div className="w-16 h-0.5 bg-[#D7B87A] mt-8" />
      </div>
    </section>
  );
}

function ExecSummaryBlock({ b }: { b: Extract<InsightBlock, { type: "exec_summary" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-[#0B1929] text-white px-6 md:px-16 lg:px-24 py-16">
      <div className="max-w-4xl">
        <p className="text-[#D7B87A] text-xs font-bold tracking-[0.2em] uppercase mb-6">Executive Summary</p>
        {b.headline && <h2 className="text-2xl md:text-3xl font-bold mb-6 leading-tight">{b.headline}</h2>}
        <p className="text-white/70 text-base md:text-lg leading-relaxed mb-8 max-w-2xl">{b.narrative}</p>
        {b.points && b.points.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {b.points.map((pt, i) => (
              <div key={i} className="flex gap-3 items-start border border-white/10 rounded-xl px-4 py-3">
                <span className="text-[#D7B87A] font-bold text-sm mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-white/80 text-sm leading-relaxed">{pt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChapterBreakBlock({ b }: { b: Extract<InsightBlock, { type: "chapter_break" }> }) {
  const ref = useReveal(0.2);
  const ruleRef = useReveal(0.2);
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 pt-20 pb-8">
      <div className="max-w-4xl">
        <p className="text-[#D7B87A] text-xs font-bold tracking-[0.3em] uppercase mb-4">{b.number}</p>
        <div ref={ruleRef} className="gold-rule w-full mb-6" />
        <h2 className="text-3xl md:text-5xl font-bold text-[#0B1929] leading-tight tracking-tight">{b.label}</h2>
        {b.description && <p className="text-gray-500 text-base mt-4 max-w-2xl leading-relaxed">{b.description}</p>}
      </div>
    </div>
  );
}

function StatBlock({ b }: { b: Extract<InsightBlock, { type: "stat" }> }) {
  const { display, ref } = useCountUp(b.value);
  return (
    <div ref={ref} className="stat-entrance px-6 md:px-16 lg:px-24 py-16 bg-white">
      <div className="max-w-4xl">
        <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-12">
          <div>
            <span className="text-7xl md:text-9xl font-bold text-[#0B1929] leading-none tracking-tighter tabular-nums">
              {display}
            </span>
          </div>
          <div className="md:pb-3 max-w-sm">
            <p className="text-lg font-semibold text-gray-900 leading-snug mb-2">{b.label}</p>
            {b.context && <p className="text-sm text-gray-500 leading-relaxed">{b.context}</p>}
            {b.source && <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">{b.source}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRowBlock({ b }: { b: Extract<InsightBlock, { type: "stat_row" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal-stagger px-6 md:px-16 lg:px-24 py-12 bg-[#0B1929]">
      <div className="max-w-4xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden">
        {b.stats.map((s, i) => (
          <StatRowItem key={i} stat={s} />
        ))}
      </div>
    </div>
  );
}

function StatRowItem({ stat }: { stat: { value: string; label: string; context?: string } }) {
  const { display, ref } = useCountUp(stat.value);
  return (
    <div ref={ref} className="stat-entrance bg-[#0B1929] px-6 py-8">
      <p className="text-4xl md:text-5xl font-bold text-white tabular-nums mb-2">{display}</p>
      <p className="text-[#D7B87A] text-sm font-semibold leading-snug">{stat.label}</p>
      {stat.context && <p className="text-white/50 text-xs mt-1 leading-relaxed">{stat.context}</p>}
    </div>
  );
}

function InsightSectionBlock({ b }: { b: Extract<InsightBlock, { type: "insight_section" }> }) {
  const ref = useReveal(0.1);
  const { display, ref: statRef } = useCountUp(b.stat ?? "");
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-16 bg-white">
      <div className="max-w-4xl">
        {b.chapter && (
          <p className="text-[#D7B87A] text-xs font-bold tracking-[0.2em] uppercase mb-4">{b.chapter}</p>
        )}
        <h2 className="text-3xl md:text-5xl font-bold text-[#0B1929] leading-tight tracking-tight mb-8">
          {b.headline}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-7">
            <p className="text-base text-gray-600 leading-relaxed">{b.narrative}</p>
          </div>
          {b.stat && (
            <div ref={statRef} className="stat-entrance md:col-span-5 bg-[#0B1929] rounded-2xl px-7 py-7 flex flex-col justify-center">
              <span className="text-5xl md:text-6xl font-bold text-white tabular-nums leading-none">{display}</span>
              {b.stat_label && <p className="text-[#D7B87A] text-sm font-semibold mt-3 leading-snug">{b.stat_label}</p>}
            </div>
          )}
        </div>

        {(b.implication || b.recommendation) && (
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
            {b.implication && (
              <div className="border-l-4 border-[#D7B87A] pl-5 py-1">
                <p className="text-xs font-bold text-[#D7B87A] uppercase tracking-widest mb-1.5">Strategic Implication</p>
                <p className="text-sm text-gray-700 leading-relaxed">{b.implication}</p>
              </div>
            )}
            {b.recommendation && (
              <div className="border-l-4 border-[#0B1929] pl-5 py-1">
                <p className="text-xs font-bold text-[#0B1929] uppercase tracking-widest mb-1.5">Recommendation</p>
                <p className="text-sm text-gray-700 leading-relaxed">{b.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PullQuoteBlock({ b }: { b: Extract<InsightBlock, { type: "pull_quote" }> }) {
  const ref = useReveal(0.2);
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-20 bg-[#0B1929]">
      <div className="max-w-3xl mx-auto text-center">
        <div className="text-[#D7B87A] text-6xl leading-none font-serif mb-6 opacity-60">&ldquo;</div>
        <blockquote className="text-2xl md:text-4xl font-bold text-white leading-tight tracking-tight">
          {b.quote}
        </blockquote>
        <div className="text-[#D7B87A] text-6xl leading-none font-serif mt-4 opacity-60">&rdquo;</div>
        {b.attribution && (
          <p className="text-white/50 text-sm mt-6 tracking-widest uppercase">{b.attribution}</p>
        )}
      </div>
    </div>
  );
}

function FindingsListBlock({ b }: { b: Extract<InsightBlock, { type: "findings_list" }> }) {
  const ref = useReveal();
  const icons = { numbered: null, check: "✓", arrow: "→" };
  const icon = icons[b.style ?? "arrow"];
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-12 bg-white">
      <div className="max-w-4xl">
        {b.headline && (
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">{b.headline}</p>
        )}
        <div className="space-y-4">
          {b.items.map((item, i) => (
            <div key={i} className="flex gap-4 items-start py-3 border-b border-gray-100 last:border-0">
              <span className="flex-shrink-0 text-[#D7B87A] font-bold text-sm w-6">
                {icon ?? String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-sm md:text-base text-gray-700 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketProfileBlock({ b }: { b: Extract<InsightBlock, { type: "market_profile" }> }) {
  const ref = useReveal(0.1);
  const { display: statDisplay, ref: statRef } = useCountUp(b.stat ?? "");
  return (
    <div ref={ref} className="report-reveal border-t-4 border-[#D7B87A]">
      {/* Market header — dark navy */}
      <div className="bg-[#0B1929] px-6 md:px-16 lg:px-24 py-12">
        <div className="max-w-4xl">
          <p className="text-[#D7B87A] text-xs font-bold tracking-[0.3em] uppercase mb-3">Market</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight">{b.market}</h2>
            {b.stat && (
              <div ref={statRef} className="stat-entrance text-right">
                <p className="text-5xl md:text-6xl font-bold text-[#D7B87A] tabular-nums leading-none">{statDisplay}</p>
                {b.stat_label && <p className="text-white/60 text-xs uppercase tracking-widest mt-1">{b.stat_label}</p>}
              </div>
            )}
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-white/80 mt-6 leading-snug max-w-2xl">{b.headline}</h3>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-6 md:px-16 lg:px-24 py-12">
        <div className="max-w-4xl">
          <p className="text-base text-gray-600 leading-relaxed mb-8 max-w-2xl">{b.narrative}</p>

          {b.findings && b.findings.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Key Findings</p>
              <div className="space-y-3">
                {b.findings.map((f, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-[#D7B87A] font-bold text-xs mt-1">→</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{f}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {b.opportunity && (
            <div className="bg-[#0B1929]/5 border border-[#0B1929]/10 rounded-xl px-5 py-4 mb-5">
              <p className="text-xs font-bold text-[#0B1929] uppercase tracking-widest mb-1.5">Brand Opportunity</p>
              <p className="text-sm text-gray-700 leading-relaxed">{b.opportunity}</p>
            </div>
          )}

          {b.recommendation && (
            <div className="border-l-4 border-[#D7B87A] pl-5">
              <p className="text-xs font-bold text-[#D7B87A] uppercase tracking-widest mb-1.5">Recommendation</p>
              <p className="text-sm text-gray-700 leading-relaxed">{b.recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationBlock({ b }: { b: Extract<InsightBlock, { type: "recommendation" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-8 bg-white">
      <div className="max-w-4xl flex gap-6 md:gap-10 items-start">
        {b.number !== undefined && (
          <span className="text-5xl md:text-7xl font-bold text-[#0B1929]/10 flex-shrink-0 leading-none tabular-nums select-none">
            {String(b.number).padStart(2, "0")}
          </span>
        )}
        <div className="border-l-2 border-[#D7B87A] pl-6 py-1">
          <p className="text-xs font-bold text-[#D7B87A] uppercase tracking-[0.2em] mb-2">Recommendation</p>
          <h3 className="text-xl md:text-2xl font-bold text-[#0B1929] mb-3 leading-snug">{b.headline}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{b.body}</p>
        </div>
      </div>
    </div>
  );
}

function ComparisonTableBlock({ b }: { b: Extract<InsightBlock, { type: "comparison_table" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-12 bg-white overflow-x-auto">
      <div className="max-w-4xl">
        {b.headline && (
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">{b.headline}</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0B1929]">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-white/60 uppercase tracking-wide w-32" />
              {b.headers.map((h, i) => (
                <th key={i} className="text-left px-5 py-3.5 text-xs font-semibold text-[#D7B87A] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100">{row.label}</td>
                {row.values.map((v, j) => (
                  <td key={j} className="px-5 py-3 text-sm text-gray-700 border-b border-gray-100">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MethodologyBlock({ b }: { b: Extract<InsightBlock, { type: "methodology" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-14 bg-gray-50 border-t border-gray-200">
      <div className="max-w-4xl">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
          {b.headline ?? "Methodology"}
        </p>
        <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">{b.body}</p>
      </div>
    </div>
  );
}

function DownloadCtaBlock({ b }: { b: Extract<InsightBlock, { type: "download_cta" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-[#0B1929] px-6 md:px-16 lg:px-24 py-16">
      <div className="max-w-4xl">
        <p className="text-[#D7B87A] text-xs font-bold tracking-[0.2em] uppercase mb-4">Download</p>
        {b.headline && (
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4 leading-tight">{b.headline}</h2>
        )}
        {b.description && (
          <p className="text-white/60 text-base mb-8 max-w-xl leading-relaxed">{b.description}</p>
        )}
        <div className="flex flex-wrap gap-4">
          {b.primary_url && (
            <a href={b.primary_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-bold rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "#D7B87A", color: "#0B1929" }}>
              ⬇ {b.primary_label ?? "Download Report"}
            </a>
          )}
          {b.secondary_url && (
            <a href={b.secondary_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-bold rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors">
              ⬇ {b.secondary_label ?? "Download Cheat Sheet"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Legacy block renderers
function LegacyBlock({ b }: { b: InsightBlock }) {
  const ref = useReveal();
  switch (b.type) {
    case "heading":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 pt-12 pb-4 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-bold text-[#0B1929]">{b.content}</h2>
      </div>;
    case "subheading":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 pt-8 pb-2 max-w-4xl">
        <h3 className="text-lg md:text-xl font-semibold text-gray-800">{b.content}</h3>
      </div>;
    case "paragraph":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-4 bg-white">
        <p className="text-base text-gray-600 leading-relaxed max-w-3xl whitespace-pre-wrap">{b.content}</p>
      </div>;
    case "quote":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-10">
        <blockquote className="border-l-4 border-[#D7B87A] pl-6 py-2 max-w-2xl">
          <p className="text-lg text-gray-700 italic leading-relaxed">{b.content}</p>
        </blockquote>
      </div>;
    case "divider":
      return <div className="px-6 md:px-16 lg:px-24 py-8">
        <div className="gold-rule revealed w-full" />
      </div>;
    case "image":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-8">
        <div className="rounded-2xl overflow-hidden shadow-md max-w-4xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.url} alt={b.alt ?? ""} className="w-full" />
          {b.alt && <p className="text-xs text-gray-400 px-4 py-2 bg-gray-50">{b.alt}</p>}
        </div>
      </div>;
    default:
      return null;
  }
}

function BlockRenderer({ block }: { block: InsightBlock }) {
  switch (block.type) {
    case "hero":            return <HeroBlock b={block} />;
    case "exec_summary":    return <ExecSummaryBlock b={block} />;
    case "chapter_break":   return <ChapterBreakBlock b={block} />;
    case "stat":            return <StatBlock b={block} />;
    case "stat_row":        return <StatRowBlock b={block} />;
    case "insight_section": return <InsightSectionBlock b={block} />;
    case "pull_quote":      return <PullQuoteBlock b={block} />;
    case "findings_list":   return <FindingsListBlock b={block} />;
    case "market_profile":  return <MarketProfileBlock b={block} />;
    case "recommendation":  return <RecommendationBlock b={block} />;
    case "comparison_table":return <ComparisonTableBlock b={block} />;
    case "methodology":     return <MethodologyBlock b={block} />;
    case "download_cta":    return <DownloadCtaBlock b={block} />;
    default:                return <LegacyBlock b={block} />;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  report:              "Report",
  market_analysis:     "Market Analysis",
  survey_results:      "Survey Results",
  social_intelligence: "Social Intelligence",
  cheat_sheet:         "Cheat Sheet",
  dashboard:           "Dashboard",
  download:            "Download",
};

export default function InsightDetailPage() {
  const params    = useParams<{ slug: string }>();
  const router    = useRouter();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!params?.slug) return;
    fetch(`/api/insights/${params.slug}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setInsight(d.data ?? null); })
      .finally(() => setLoading(false));
  }, [params?.slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1929] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#D7B87A] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (notFound || !insight) {
    return (
      <div className="min-h-screen bg-[#0B1929] flex flex-col items-center justify-center gap-6 text-center px-6">
        <p className="text-[#D7B87A] text-xs font-bold uppercase tracking-[0.3em]">Not Found</p>
        <h1 className="text-3xl font-bold text-white">This report isn&apos;t available</h1>
        <p className="text-white/50 text-sm max-w-sm">It may have been removed or you may not have access to it.</p>
        <button onClick={() => router.push("/insights")}
          className="mt-2 px-6 py-3 text-sm font-bold rounded-lg text-[#0B1929]"
          style={{ background: "#D7B87A" }}>
          Back to Insights
        </button>
      </div>
    );
  }

  const blocks: InsightBlock[] = insight.content_blocks ?? [];
  const hasHero = blocks.length > 0 && blocks[0].type === "hero";

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-geist)" }}>

      {/* ── Sticky top bar ── */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#0B1929]/95 backdrop-blur-md shadow-lg" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between gap-4">
          <Link href="/insights"
            className={`flex items-center gap-2 text-sm font-semibold transition-colors ${
              scrolled ? "text-white/80 hover:text-white" : "text-white/70 hover:text-white"
            }`}>
            ← Insights
          </Link>

          <p className={`text-xs font-bold uppercase tracking-widest truncate max-w-xs transition-opacity duration-300 ${
            scrolled ? "opacity-100 text-[#D7B87A]" : "opacity-0"
          }`}>
            {insight.title}
          </p>

          <div className="flex items-center gap-3">
            {insight.download_url && (
              <a href={insight.download_url} target="_blank" rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                ⬇ Download
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Inline hero (when no hero block) ── */}
      {!hasHero && (
        <div className="bg-[#0B1929] pt-28 pb-16 px-6 md:px-16 lg:px-24">
          <div className="max-w-4xl">
            <p className="text-[#D7B87A] text-xs font-bold tracking-[0.25em] uppercase mb-6">
              {TYPE_LABELS[insight.content_type] ?? insight.content_type}
            </p>
            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
              {insight.title}
            </h1>
            {insight.subtitle && (
              <p className="text-lg text-white/60 max-w-2xl leading-relaxed">{insight.subtitle}</p>
            )}
            {insight.summary && (
              <p className="text-sm text-white/50 mt-4 max-w-xl leading-relaxed">{insight.summary}</p>
            )}
            {insight.published_at && (
              <p className="text-white/30 text-xs mt-6 uppercase tracking-widest">
                {new Date(insight.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <div className="w-12 h-0.5 bg-[#D7B87A] mt-6" />
          </div>
        </div>
      )}

      {/* ── Blocks ── */}
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}

      {/* ── Footer ── */}
      <div className="bg-[#0B1929] px-6 md:px-16 lg:px-24 py-12 mt-auto">
        <div className="max-w-4xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-[#D7B87A] text-xs font-bold uppercase tracking-widest mb-1">Fanometrix</p>
            <p className="text-white/30 text-xs">Fan Insight Platform</p>
          </div>
          <div className="flex items-center gap-4">
            {insight.tags.map(t => (
              <span key={t} className="text-[10px] text-white/30 uppercase tracking-widest">{t}</span>
            ))}
          </div>
          <Link href="/insights" className="text-white/50 text-xs hover:text-white transition-colors">
            ← All Insights
          </Link>
        </div>
      </div>
    </div>
  );
}

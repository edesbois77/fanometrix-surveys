"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Insight, InsightBlock } from "@/lib/types";

// ─── Shared constants ─────────────────────────────────────────────────────────

const NAVY  = "#0B1929";
const GOLD  = "#D7B87A";
const MAX_W = "max-w-5xl";

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("revealed"); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

function useCountUp(target: string, duration = 1400) {
  const [display, setDisplay] = useState("0");
  const triggered = useRef(false);
  const run = useCallback(() => {
    if (triggered.current) return;
    triggered.current = true;
    const m = target.match(/[\d,.]+/);
    if (!m) { setDisplay(target); return; }
    const num  = parseFloat(m[0].replace(/,/g, ""));
    const suf  = target.slice(target.indexOf(m[0]) + m[0].length);
    const pre  = target.slice(0, target.indexOf(m[0]));
    const isDec = target.includes(".");
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = num * e;
      setDisplay(`${pre}${isDec ? v.toFixed(1) : Math.round(v).toLocaleString()}${suf}`);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { run(); obs.unobserve(el); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [run]);
  return { display, ref };
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children, dark = false, className = "" }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`report-reveal ${dark ? "bg-[#0B1929]" : "bg-white"} ${className}`}>
      {children}
    </div>
  );
}

// ─── BLOCK: Hero ──────────────────────────────────────────────────────────────

function HeroBlock({ b }: { b: Extract<InsightBlock, { type: "hero" }> }) {
  return (
    <section className="relative min-h-[75vh] flex flex-col justify-end overflow-hidden px-6 md:px-16 lg:px-24 pb-20 pt-32"
      style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #122536 100%)` }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{ backgroundImage: `radial-gradient(ellipse at 70% 30%, ${GOLD} 0%, transparent 55%), radial-gradient(ellipse at 20% 90%, ${GOLD} 0%, transparent 45%)` }} />
      <div className={`relative z-10 ${MAX_W} mx-auto w-full`}>
        {b.label && (
          <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.35em] uppercase mb-10 flex items-center gap-3">
            <span className="w-8 h-px bg-[#D7B87A] inline-block" />{b.label}
          </p>
        )}
        <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold text-white leading-[0.92] tracking-[-0.02em] mb-8">
          {b.headline}
        </h1>
        {b.subheadline && (
          <p className="text-lg md:text-xl text-white/55 max-w-xl leading-relaxed font-light tracking-wide">
            {b.subheadline}
          </p>
        )}
        <div className="w-14 h-[3px] mt-10" style={{ background: GOLD }} />
      </div>
    </section>
  );
}

// ─── BLOCK: Executive Summary ─────────────────────────────────────────────────

function ExecSummaryBlock({ b }: { b: Extract<InsightBlock, { type: "exec_summary" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <div className={`${MAX_W} mx-auto`}>
        <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.3em] uppercase mb-6 flex items-center gap-3">
          <span className="w-6 h-px bg-[#D7B87A]" />Executive Summary
        </p>
        {b.headline && (
          <h2 className="text-2xl md:text-3xl font-bold text-[#0B1929] mb-5 leading-snug max-w-2xl">{b.headline}</h2>
        )}
        <p className="text-gray-500 text-base md:text-lg leading-relaxed mb-10 max-w-2xl font-light">{b.narrative}</p>
        {b.points && b.points.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {b.points.map((pt, i) => (
              <div key={i} className="flex gap-4 items-start border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-300 transition-colors">
                <span className="text-[#D7B87A] font-bold text-xs mt-0.5 flex-shrink-0 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-gray-600 text-sm leading-relaxed">{pt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BLOCK: Chapter Break ─────────────────────────────────────────────────────

function ChapterBreakBlock({ b }: { b: Extract<InsightBlock, { type: "chapter_break" }> }) {
  const ref = useReveal(0.15);
  const ruleRef = useReveal(0.15);
  return (
    <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 pt-24 pb-10">
      <div className={`${MAX_W} mx-auto`}>
        <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.35em] uppercase mb-5">{b.number}</p>
        <div ref={ruleRef} className="gold-rule w-full mb-7" />
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-[#0B1929] leading-tight tracking-tight">{b.label}</h2>
        {b.description && (
          <p className="text-gray-400 text-sm md:text-base mt-5 max-w-2xl leading-relaxed">{b.description}</p>
        )}
      </div>
    </div>
  );
}

// ─── BLOCK: Survey Chart (P1 — visual anchor) ─────────────────────────────────

function SurveyChartBlock({ b }: { b: Extract<InsightBlock, { type: "survey_chart" }> }) {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setAnimated(true); obs.unobserve(el); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const maxVal = Math.max(...b.items.map(i => i.value));

  return (
    <div ref={ref} className="bg-[#0B1929] px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <div className={`${MAX_W} mx-auto`}>

        {/* Source label */}
        <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.3em] uppercase mb-6 flex items-center gap-3">
          <span className="w-6 h-px bg-[#D7B87A]" />{b.source ?? "Fanometrix Fan Survey"}
        </p>

        {/* Question */}
        <p className="text-white/70 text-base md:text-lg leading-snug mb-10 max-w-2xl font-light italic">
          &ldquo;{b.question}&rdquo;
        </p>

        {/* Chart rows */}
        <div className="space-y-6">
          {b.items.map((item, i) => (
            <ChartRow
              key={i}
              item={item}
              maxVal={maxVal}
              animated={animated}
              delay={i * 120}
              index={i}
            />
          ))}
        </div>

        {/* Bottom note */}
        <p className="text-white/25 text-xs mt-10 tracking-wide">
          n = Fanometrix fan panel · Multi-market survey 2025
        </p>
      </div>
    </div>
  );
}

function ChartRow({
  item, maxVal, animated, delay, index,
}: {
  item: { label: string; value: number; highlight?: boolean };
  maxVal: number;
  animated: boolean;
  delay: number;
  index: number;
}) {
  const { display, ref: numRef } = useCountUp(`${item.value}%`, 1200);
  const isHero = item.highlight;

  return (
    <div className={`${isHero ? "pt-2 pb-3" : ""}`}>
      {/* Label + value row */}
      <div className="flex items-baseline justify-between mb-2.5 gap-4">
        <span className={`text-sm leading-snug ${isHero ? "text-white font-semibold" : "text-white/60 font-normal"}`}>
          {item.label}
        </span>
        <div ref={numRef} className={`flex-shrink-0 tabular-nums font-bold leading-none
          ${isHero ? "text-4xl md:text-5xl text-[#D7B87A]" : "text-xl text-white/50"}`}
          style={{ transitionDelay: `${delay}ms` }}>
          {animated ? display : `${item.value}%`}
        </div>
      </div>

      {/* Bar track */}
      <div className="relative h-2 rounded-full overflow-hidden"
        style={{ background: isHero ? "rgba(215,184,122,0.15)" : "rgba(255,255,255,0.07)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: animated ? `${(item.value / maxVal) * 100}%` : "0%",
            background: isHero ? GOLD : "rgba(255,255,255,0.3)",
            transition: `width 1.1s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          }}
        />
      </div>

      {/* Hero bar has a subtle glow line below */}
      {isHero && index < 4 && (
        <div className="mt-5 h-px bg-white/10" />
      )}
    </div>
  );
}

// ─── BLOCK: Insight Cards ─────────────────────────────────────────────────────

function InsightCardsBlock({ b }: { b: Extract<InsightBlock, { type: "insight_cards" }> }) {
  const ref = useReveal(0.1);
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 pt-2 pb-12">
      <div className={`${MAX_W} mx-auto`}>
        {b.headline && (
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-6">{b.headline}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {b.cards.map((card, i) => (
            <div key={i} className="border-l-[3px] pl-5 py-1 pr-4" style={{ borderColor: GOLD }}>
              <p className="text-sm font-bold mb-1 leading-snug" style={{ color: NAVY }}>{card.title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Stat ──────────────────────────────────────────────────────────────

function StatBlock({ b }: { b: Extract<InsightBlock, { type: "stat" }> }) {
  const { display, ref } = useCountUp(b.value);
  return (
    <div ref={ref} className="bg-white px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <div className={`${MAX_W} mx-auto`}>
        <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-14">
          <span className="text-7xl md:text-[8rem] lg:text-[10rem] font-bold text-[#0B1929] leading-none tracking-tighter tabular-nums">
            {display}
          </span>
          <div className="md:pb-4 max-w-xs">
            <div className="w-8 h-[3px] mb-4" style={{ background: GOLD }} />
            <p className="text-lg font-semibold text-gray-900 leading-snug mb-2">{b.label}</p>
            {b.context && <p className="text-sm text-gray-500 leading-relaxed">{b.context}</p>}
            {b.source && <p className="text-xs text-gray-400 mt-3 uppercase tracking-widest">{b.source}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Stat Row ──────────────────────────────────────────────────────────

function StatRowBlock({ b }: { b: Extract<InsightBlock, { type: "stat_row" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal-stagger bg-[#0B1929] px-6 md:px-16 lg:px-24 py-12">
      <div className={`${MAX_W} mx-auto grid grid-cols-1 sm:grid-cols-3 divide-x divide-white/10`}>
        {b.stats.map((s, i) => <StatRowCell key={i} stat={s} />)}
      </div>
    </div>
  );
}
function StatRowCell({ stat }: { stat: { value: string; label: string; context?: string } }) {
  const { display, ref } = useCountUp(stat.value);
  return (
    <div ref={ref} className="px-6 py-8 first:pl-0 last:pr-0">
      <p className="text-4xl md:text-5xl font-bold text-white tabular-nums mb-2">{display}</p>
      <p className="text-[#D7B87A] text-sm font-semibold leading-snug">{stat.label}</p>
      {stat.context && <p className="text-white/40 text-xs mt-1 leading-relaxed">{stat.context}</p>}
    </div>
  );
}

// ─── BLOCK: Insight Section ───────────────────────────────────────────────────

function InsightSectionBlock({ b }: { b: Extract<InsightBlock, { type: "insight_section" }> }) {
  const ref = useReveal(0.08);
  const { display: statDisplay, ref: statRef } = useCountUp(b.stat ?? "");
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 pt-12 md:pt-16 pb-8">
      <div className={`${MAX_W} mx-auto`}>
        {b.chapter && (
          <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.3em] uppercase mb-5 flex items-center gap-3">
            <span className="w-6 h-px bg-[#D7B87A]" />{b.chapter}
          </p>
        )}
        <h2 className="text-3xl md:text-5xl font-bold text-[#0B1929] leading-tight tracking-tight mb-10 max-w-3xl">
          {b.headline}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-10">
          <div className="md:col-span-7">
            <p className="text-base text-gray-500 leading-[1.8] whitespace-pre-wrap">{b.narrative}</p>
          </div>
          {b.stat && (
            <div ref={statRef} className="stat-entrance md:col-span-5 rounded-2xl px-8 py-8 flex flex-col justify-center"
              style={{ background: NAVY }}>
              <span className="text-5xl md:text-6xl font-bold text-white tabular-nums leading-none">{statDisplay}</span>
              {b.stat_label && (
                <p className="text-[#D7B87A] text-sm font-medium mt-4 leading-snug">{b.stat_label}</p>
              )}
            </div>
          )}
        </div>

        {(b.implication || b.recommendation) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-8 border-t border-gray-100">
            {b.implication && (
              <div className="border-l-[3px] border-[#D7B87A] pl-5 py-1">
                <p className="text-[9px] font-bold text-[#D7B87A] uppercase tracking-[0.25em] mb-2">Strategic Implication</p>
                <p className="text-sm text-gray-600 leading-relaxed">{b.implication}</p>
              </div>
            )}
            {b.recommendation && (
              <div className="border-l-[3px] border-[#0B1929] pl-5 py-1">
                <p className="text-[9px] font-bold text-[#0B1929] uppercase tracking-[0.25em] mb-2">Recommendation</p>
                <p className="text-sm text-gray-600 leading-relaxed">{b.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BLOCK: Pull Quote ────────────────────────────────────────────────────────

function PullQuoteBlock({ b }: { b: Extract<InsightBlock, { type: "pull_quote" }> }) {
  const ref = useReveal(0.2);
  return (
    <div ref={ref} className="report-reveal bg-[#0B1929] px-6 md:px-16 lg:px-24 py-20 md:py-24">
      <div className={`${MAX_W} mx-auto text-center`}>
        <div className="text-[#D7B87A] text-7xl leading-none font-serif opacity-40 mb-6">&ldquo;</div>
        <blockquote className="text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight max-w-3xl mx-auto">
          {b.quote}
        </blockquote>
        <div className="text-[#D7B87A] text-7xl leading-none font-serif opacity-40 mt-4 mb-6">&rdquo;</div>
        {b.attribution && (
          <p className="text-white/35 text-xs tracking-[0.2em] uppercase">{b.attribution}</p>
        )}
      </div>
    </div>
  );
}

// ─── BLOCK: Comparison Table (P3 — hover states, flags, better hierarchy) ─────

function ComparisonTableBlock({ b }: { b: Extract<InsightBlock, { type: "comparison_table" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-12 md:py-16 overflow-x-auto">
      <div className={`${MAX_W} mx-auto`}>
        {b.headline && (
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-8">{b.headline}</p>
        )}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left pb-4 pr-6 w-44">
                <span className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.25em]">Market</span>
              </th>
              {b.headers.map((h, i) => (
                <th key={i} className="text-left pb-4 px-4 text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: GOLD }}>
                  {h}
                </th>
              ))}
            </tr>
            <tr><td colSpan={b.headers.length + 1}><div className="h-px bg-gray-200 mb-1" /></td></tr>
          </thead>
          <tbody>
            {b.rows.map((row, i) => (
              <tr key={i}
                className="group transition-colors duration-150 hover:bg-[#0B1929]/[0.03] cursor-default">
                <td className="py-4 pr-6 border-b border-gray-100 group-last:border-0">
                  <span className="text-sm font-semibold text-[#0B1929] whitespace-nowrap">{row.label}</span>
                </td>
                {row.values.map((v, j) => (
                  <td key={j} className="py-4 px-4 border-b border-gray-100 group-last:border-0">
                    <span className="text-sm text-gray-600 leading-snug">{v}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── BLOCK: Market Profile (P2 — intelligence signal cards) ───────────────────

function MarketProfileBlock({ b }: { b: Extract<InsightBlock, { type: "market_profile" }> }) {
  const ref = useReveal(0.08);
  const { display: statDisplay, ref: statRef } = useCountUp(b.stat ?? "");
  const signals = b.signals ?? [];

  return (
    <div ref={ref} className="report-reveal border-t-[3px]" style={{ borderColor: GOLD }}>
      {/* Dark header */}
      <div className="bg-[#0B1929] px-6 md:px-16 lg:px-24 pt-12 pb-10">
        <div className={`${MAX_W} mx-auto`}>
          <p className="text-[#D7B87A] text-[10px] font-bold tracking-[0.35em] uppercase mb-4 flex items-center gap-3">
            <span className="w-6 h-px bg-[#D7B87A]" />Market
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-6">
            <h2 className="text-4xl md:text-6xl font-bold text-white leading-none tracking-tight">{b.market}</h2>
            {b.stat && (
              <div ref={statRef} className="stat-entrance text-right flex-shrink-0">
                <p className="text-4xl md:text-6xl font-bold tabular-nums leading-none" style={{ color: GOLD }}>
                  {statDisplay}
                </p>
                {b.stat_label && (
                  <p className="text-white/45 text-xs uppercase tracking-widest mt-1 text-right">{b.stat_label}</p>
                )}
              </div>
            )}
          </div>
          <h3 className="text-base md:text-xl font-bold text-white/75 max-w-2xl leading-snug mb-6">{b.headline}</h3>

          {/* Intelligence signal cards */}
          {signals.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {signals.map((s, i) => (
                <div key={i}
                  className="flex items-center gap-2.5 border border-white/10 rounded-lg px-3.5 py-2 bg-white/[0.04]">
                  <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{s.label}</span>
                  {s.value && (
                    <>
                      <span className="w-px h-3 bg-white/15" />
                      <span className="text-[10px] font-bold tracking-wide" style={{ color: GOLD }}>{s.value}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* White body */}
      <div className="bg-white px-6 md:px-16 lg:px-24 py-12">
        <div className={`${MAX_W} mx-auto`}>
          <p className="text-base text-gray-500 leading-[1.8] mb-10 max-w-2xl whitespace-pre-wrap">{b.narrative}</p>

          {b.findings && b.findings.length > 0 && (
            <div className="mb-10">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-5">Key Findings</p>
              <div className="space-y-3">
                {b.findings.map((f, i) => (
                  <div key={i} className="flex gap-3 items-start py-3 border-b border-gray-100 last:border-0">
                    <span className="font-bold text-xs mt-0.5 flex-shrink-0" style={{ color: GOLD }}>→</span>
                    <p className="text-sm text-gray-600 leading-relaxed">{f}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {b.opportunity && (
            <div className="rounded-xl px-5 py-4 mb-5 border border-[#0B1929]/10"
              style={{ background: "rgba(11,25,41,0.04)" }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: NAVY }}>Brand Opportunity</p>
              <p className="text-sm text-gray-700 leading-relaxed">{b.opportunity}</p>
            </div>
          )}

          {b.recommendation && (
            <div className="border-l-[3px] pl-5" style={{ borderColor: GOLD }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: GOLD }}>Recommendation</p>
              <p className="text-sm text-gray-700 leading-relaxed">{b.recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Pyramid (P4 — visual framework) ───────────────────────────────────

function PyramidBlock({ b }: { b: Extract<InsightBlock, { type: "pyramid" }> }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Levels: index 0 = Level 5 (top/apex), index 4 = Level 1 (base)
  const widths  = ["32%", "48%", "64%", "80%", "100%"];
  const colors  = [
    { bg: GOLD,      text: NAVY,      accent: NAVY      },
    { bg: "#1e4a7e", text: "#ffffff", accent: GOLD      },
    { bg: "#163d6a", text: "#ffffff", accent: GOLD      },
    { bg: "#0f2f55", text: "#ffffff", accent: `${GOLD}cc` },
    { bg: NAVY,      text: "#ffffff", accent: `${GOLD}99` },
  ];

  return (
    <div ref={ref} className="bg-white px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <div className={`${MAX_W} mx-auto`}>

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3 flex items-center justify-center gap-3"
            style={{ color: GOLD }}>
            <span className="w-8 h-px inline-block" style={{ background: GOLD }} />
            Proprietary Framework
            <span className="w-8 h-px inline-block" style={{ background: GOLD }} />
          </p>
          <h2 className="text-2xl md:text-4xl font-bold mb-3" style={{ color: NAVY }}>{b.title}</h2>
          {b.subtitle && (
            <p className="text-sm text-gray-400 max-w-lg mx-auto">{b.subtitle}</p>
          )}
        </div>

        {/* Pyramid levels */}
        <div className="space-y-0.5 mb-14">
          {b.levels.map((level, i) => (
            <div key={i}
              className="mx-auto transition-all duration-700 ease-out"
              style={{
                width: widths[i],
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(16px)",
                transitionDelay: `${i * 100}ms`,
              }}>
              <div className="px-5 md:px-7 py-4 flex items-center justify-between"
                style={{ backgroundColor: colors[i].bg }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.25em] opacity-70"
                  style={{ color: colors[i].accent }}>
                  {level.sublabel ?? `Level ${level.number}`}
                </span>
                <span className="text-sm font-bold" style={{ color: colors[i].text }}>
                  {level.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Level descriptions — reversed so L1 is first */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0">
          {[...b.levels].reverse().map((level, i) => (
            <div key={i}
              className="flex gap-5 items-start py-5 border-b border-gray-100"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(10px)",
                transition: `opacity 0.5s ease, transform 0.5s ease ${(i + 5) * 80}ms`,
              }}>
              <span className="text-3xl font-bold flex-shrink-0 tabular-nums select-none mt-1 leading-none"
                style={{ color: `${NAVY}12` }}>
                {level.number}
              </span>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold" style={{ color: NAVY }}>{level.label}</p>
                  <div className="w-4 h-0.5 rounded-full" style={{ background: GOLD }} />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{level.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Findings List ─────────────────────────────────────────────────────

function FindingsListBlock({ b }: { b: Extract<InsightBlock, { type: "findings_list" }> }) {
  const ref = useReveal();
  const icon = b.style === "check" ? "✓" : b.style === "numbered" ? null : "→";
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-12">
      <div className={`${MAX_W} mx-auto`}>
        {b.headline && (
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-7">{b.headline}</p>
        )}
        <div className="space-y-4">
          {b.items.map((item, i) => (
            <div key={i} className="flex gap-4 items-start py-3.5 border-b border-gray-100 last:border-0">
              <span className="font-bold text-xs mt-0.5 flex-shrink-0 w-6 text-center" style={{ color: GOLD }}>
                {icon ?? String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Recommendation ────────────────────────────────────────────────────

function RecommendationBlock({ b }: { b: Extract<InsightBlock, { type: "recommendation" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-8">
      <div className={`${MAX_W} mx-auto flex gap-6 md:gap-10 items-start`}>
        {b.number !== undefined && (
          <span className="text-6xl md:text-8xl font-bold leading-none tabular-nums select-none flex-shrink-0"
            style={{ color: `${NAVY}0d` }}>
            {String(b.number).padStart(2, "0")}
          </span>
        )}
        <div className="border-l-[3px] pl-6 py-1 flex-1" style={{ borderColor: GOLD }}>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-2.5" style={{ color: GOLD }}>
            Recommendation
          </p>
          <h3 className="text-xl md:text-2xl font-bold mb-3 leading-snug" style={{ color: NAVY }}>{b.headline}</h3>
          <p className="text-sm text-gray-500 leading-[1.8]">{b.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK: Comparison Table (already handled above) ─────────────────────────

// ─── BLOCK: Methodology ───────────────────────────────────────────────────────

function MethodologyBlock({ b }: { b: Extract<InsightBlock, { type: "methodology" }> }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="report-reveal bg-gray-50 border-t border-gray-200 px-6 md:px-16 lg:px-24 py-14">
      <div className={`${MAX_W} mx-auto`}>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-4">
          {b.headline ?? "Methodology"}
        </p>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">{b.body}</p>
      </div>
    </div>
  );
}

// ─── BLOCK: Download CTA (P5 — premium asset library) ────────────────────────

const ASSETS = [
  { icon: "◈", title: "Full Report", desc: "Complete intelligence report with all market findings and recommendations", primary: true },
  { icon: "◫", title: "Executive Summary", desc: "Two-page briefing of key findings for senior stakeholders", primary: false },
  { icon: "☰", title: "Market Cheat Sheet", desc: "One-page market guide for UK, Germany, Sweden, India and China", primary: false },
  { icon: "▦", title: "Presentation Deck", desc: "Slide deck formatted for internal team and client presentations", primary: false },
];

function DownloadCtaBlock({ b }: { b: Extract<InsightBlock, { type: "download_cta" }> }) {
  const ref = useReveal();
  const downloads: Record<string, string | undefined> = {
    "Full Report":       b.primary_url   || undefined,
    "Executive Summary": b.secondary_url || undefined,
  };

  return (
    <div ref={ref} className="report-reveal bg-[#0B1929] px-6 md:px-16 lg:px-24 py-16 md:py-20">
      <div className={`${MAX_W} mx-auto`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 flex items-center gap-3" style={{ color: GOLD }}>
          <span className="w-6 h-px inline-block" style={{ background: GOLD }} />Intelligence Assets
        </p>
        {b.headline && (
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">{b.headline}</h2>
        )}
        {b.description && (
          <p className="text-white/50 text-sm mb-10 max-w-lg leading-relaxed">{b.description}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {ASSETS.map((asset, i) => {
            const url = downloads[asset.title];
            const Tag = url ? "a" : "div";
            return (
              <Tag key={i}
                {...(url ? { href: url, target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`group border rounded-xl p-5 flex flex-col gap-3 transition-all duration-200
                  ${asset.primary
                    ? "border-[#D7B87A]/40 hover:border-[#D7B87A] bg-[#D7B87A]/[0.06] hover:bg-[#D7B87A]/10"
                    : "border-white/10 hover:border-white/25 bg-white/[0.03] hover:bg-white/[0.06]"
                  }
                  ${url ? "cursor-pointer" : "cursor-default opacity-75"}
                `}>
                <span className="text-2xl" style={{ color: asset.primary ? GOLD : "rgba(255,255,255,0.4)" }}>
                  {asset.icon}
                </span>
                <div className="flex-1">
                  <p className={`text-sm font-bold mb-1 ${asset.primary ? "text-[#D7B87A]" : "text-white/70"}`}>
                    {asset.title}
                  </p>
                  <p className="text-xs text-white/35 leading-relaxed">{asset.desc}</p>
                </div>
                <div className={`text-xs font-semibold flex items-center gap-1 mt-1
                  ${url ? (asset.primary ? "text-[#D7B87A]" : "text-white/50 group-hover:text-white/80") : "text-white/20"}`}>
                  {url ? "↓ Download" : "Coming soon"}
                </div>
              </Tag>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Legacy block renderers ───────────────────────────────────────────────────

function LegacyBlock({ b }: { b: InsightBlock }) {
  const ref = useReveal();
  switch (b.type) {
    case "heading":
      return <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 pt-14 pb-4">
        <div className={`${MAX_W} mx-auto`}>
          <h2 className="text-2xl md:text-4xl font-bold" style={{ color: NAVY }}>{b.content}</h2>
        </div>
      </div>;
    case "subheading":
      return <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 pt-8 pb-2">
        <div className={`${MAX_W} mx-auto`}>
          <h3 className="text-lg md:text-2xl font-semibold text-gray-800">{b.content}</h3>
        </div>
      </div>;
    case "paragraph":
      return <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-6">
        <div className={`${MAX_W} mx-auto`}>
          <p className="text-base text-gray-500 leading-[1.8] max-w-2xl whitespace-pre-wrap">{b.content}</p>
        </div>
      </div>;
    case "quote":
      return <div ref={ref} className="report-reveal bg-white px-6 md:px-16 lg:px-24 py-10">
        <div className={`${MAX_W} mx-auto`}>
          <blockquote className="border-l-[3px] pl-6 py-1 max-w-2xl" style={{ borderColor: GOLD }}>
            <p className="text-lg text-gray-700 italic leading-relaxed">{b.content}</p>
          </blockquote>
        </div>
      </div>;
    case "divider":
      return <div className="px-6 md:px-16 lg:px-24 py-8">
        <div className={`${MAX_W} mx-auto`}><div className="gold-rule revealed w-full" /></div>
      </div>;
    case "image":
      return <div ref={ref} className="report-reveal px-6 md:px-16 lg:px-24 py-8">
        <div className={`${MAX_W} mx-auto`}>
          <div className="rounded-2xl overflow-hidden shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.url} alt={b.alt ?? ""} className="w-full" />
            {b.alt && <p className="text-xs text-gray-400 px-4 py-2 bg-gray-50">{b.alt}</p>}
          </div>
        </div>
      </div>;
    default: return null;
  }
}

// ─── Master block router ──────────────────────────────────────────────────────

function BlockRenderer({ block }: { block: InsightBlock }) {
  switch (block.type) {
    case "hero":             return <HeroBlock b={block} />;
    case "exec_summary":     return <ExecSummaryBlock b={block} />;
    case "chapter_break":    return <ChapterBreakBlock b={block} />;
    case "survey_chart":     return <SurveyChartBlock b={block} />;
    case "insight_cards":    return <InsightCardsBlock b={block} />;
    case "stat":             return <StatBlock b={block} />;
    case "stat_row":         return <StatRowBlock b={block} />;
    case "insight_section":  return <InsightSectionBlock b={block} />;
    case "pull_quote":       return <PullQuoteBlock b={block} />;
    case "findings_list":    return <FindingsListBlock b={block} />;
    case "pyramid":          return <PyramidBlock b={block} />;
    case "market_profile":   return <MarketProfileBlock b={block} />;
    case "recommendation":   return <RecommendationBlock b={block} />;
    case "comparison_table": return <ComparisonTableBlock b={block} />;
    case "methodology":      return <MethodologyBlock b={block} />;
    case "download_cta":     return <DownloadCtaBlock b={block} />;
    default:                 return <LegacyBlock b={block} />;
  }
}

// ─── Section divider (subtle transition between sections) ─────────────────────

function SectionDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />;
}

function needsDivider(curr: InsightBlock, next: InsightBlock): boolean {
  const dark = (b: InsightBlock) =>
    ["hero","exec_summary","pull_quote","survey_chart","stat_row","download_cta"].includes(b.type) ||
    (b.type === "market_profile");
  return !dark(curr) && !dark(next);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  report:"Report", market_analysis:"Market Analysis", survey_results:"Survey Results",
  social_intelligence:"Social Intelligence", cheat_sheet:"Cheat Sheet",
  dashboard:"Dashboard", download:"Download",
};

export default function InsightDetailPage() {
  const params     = useParams<{ slug: string }>();
  const router     = useRouter();
  const [insight,  setInsight]  = useState<Insight | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: GOLD, borderTopColor: "transparent" }} />
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: `${GOLD}60` }}>Loading</p>
        </div>
      </div>
    );
  }

  if (notFound || !insight) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-6" style={{ background: NAVY }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Not Found</p>
        <h1 className="text-3xl font-bold text-white">This report isn&apos;t available</h1>
        <p className="text-sm max-w-sm" style={{ color: "rgba(255,255,255,0.4)" }}>It may have been removed or you may not have access.</p>
        <button onClick={() => router.push("/insights")}
          className="mt-2 px-6 py-3 text-sm font-bold rounded-lg transition-opacity hover:opacity-90"
          style={{ background: GOLD, color: NAVY }}>
          Back to Insights
        </button>
      </div>
    );
  }

  const blocks: InsightBlock[] = insight.content_blocks ?? [];
  const hasHero = blocks.length > 0 && blocks[0].type === "hero";

  return (
    <div className="min-h-screen bg-white">

      {/* ── Sticky top bar ── */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "shadow-lg" : ""
      }`} style={{ background: scrolled ? `${NAVY}f0` : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none" }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between gap-4">
          <Link href="/insights"
            className="flex items-center gap-2 text-sm font-semibold transition-colors"
            style={{ color: scrolled ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.6)" }}>
            ← Insights
          </Link>

          <p className="text-[10px] font-bold uppercase tracking-[0.2em] truncate max-w-xs transition-opacity duration-500"
            style={{ color: GOLD, opacity: scrolled ? 1 : 0 }}>
            {insight.title}
          </p>

          {insight.download_url && (
            <a href={insight.download_url} target="_blank" rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
              style={{ background: GOLD, color: NAVY }}>
              ⬇ Download
            </a>
          )}
          {!insight.download_url && <div />}
        </div>
      </div>

      {/* ── Auto-hero when no hero block ── */}
      {!hasHero && (
        <div className="pt-28 pb-16 px-6 md:px-16 lg:px-24" style={{ background: NAVY }}>
          <div className={`${MAX_W} mx-auto`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] mb-7 flex items-center gap-3" style={{ color: GOLD }}>
              <span className="w-8 h-px inline-block" style={{ background: GOLD }} />
              {TYPE_LABELS[insight.content_type] ?? insight.content_type}
            </p>
            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight mb-4">{insight.title}</h1>
            {insight.subtitle && <p className="text-lg text-white/55 max-w-xl leading-relaxed">{insight.subtitle}</p>}
            {insight.published_at && (
              <p className="text-xs uppercase tracking-widest mt-6" style={{ color: "rgba(255,255,255,0.25)" }}>
                {new Date(insight.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <div className="w-12 h-[3px] mt-8" style={{ background: GOLD }} />
          </div>
        </div>
      )}

      {/* ── Blocks ── */}
      {blocks.map((block, i) => (
        <div key={i}>
          <BlockRenderer block={block} />
          {i < blocks.length - 1 && needsDivider(block, blocks[i + 1]) && <SectionDivider />}
        </div>
      ))}

      {/* ── Footer ── */}
      <div className="px-6 md:px-16 lg:px-24 py-12" style={{ background: NAVY }}>
        <div className={`${MAX_W} mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Fanometrix</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Fan Insight Platform</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {insight.tags.map(t => (
              <span key={t} className="text-[9px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.2)" }}>{t}</span>
            ))}
          </div>
          <Link href="/insights" className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
            ← All Insights
          </Link>
        </div>
      </div>
    </div>
  );
}

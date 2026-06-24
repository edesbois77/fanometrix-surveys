"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Football as an Access Engine — static report page
// Content is hard-coded here for fast editing. Access is verified via the
// existing /api/insights endpoint so permissions stay in sync with the DB.
// To edit content: change JSX directly in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";
const W    = "max-w-5xl mx-auto";
const PAD  = "px-6 md:px-16 lg:px-24";

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
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
  const [display, setDisplay] = useState(target);
  const triggered = useRef(false);
  const run = useCallback(() => {
    if (triggered.current) return; triggered.current = true;
    const m = target.match(/[\d,.]+/); if (!m) return;
    const num = parseFloat(m[0].replace(/,/g, ""));
    const suf = target.slice(target.indexOf(m[0]) + m[0].length);
    const pre = target.slice(0, target.indexOf(m[0]));
    const isDec = target.includes(".");
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      const v = num * (1 - Math.pow(1 - p, 3));
      setDisplay(`${pre}${isDec ? v.toFixed(1) : Math.round(v).toLocaleString()}${suf}`);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { run(); obs.unobserve(el); } },
      { threshold: 0.5 }
    );
    obs.observe(el); return () => obs.disconnect();
  }, [run]);
  return { display, ref };
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function Reveal({ children, className = "", threshold = 0.12 }: { children: React.ReactNode; className?: string; threshold?: number }) {
  const ref = useReveal(threshold);
  return <div ref={ref} className={`report-reveal ${className}`}>{children}</div>;
}

function GoldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-5 flex items-center gap-3" style={{ color: GOLD }}>
      <span className="w-6 h-px inline-block" style={{ background: GOLD }} />{children}
    </p>
  );
}

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />;
}

// ─── Section components ───────────────────────────────────────────────────────

function Hero() {
  return (
    <section className={`relative min-h-[75vh] flex flex-col justify-end overflow-hidden ${PAD} pb-20 pt-32`}
      style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #122536 100%)` }}>
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{ backgroundImage: `radial-gradient(ellipse at 70% 30%, ${GOLD} 0%, transparent 55%), radial-gradient(ellipse at 20% 90%, ${GOLD} 0%, transparent 45%)` }} />
      <div className={`relative z-10 ${W} w-full`}>
        <p className="text-[10px] font-bold tracking-[0.35em] uppercase mb-10 flex items-center gap-3" style={{ color: GOLD }}>
          <span className="w-8 h-px" style={{ background: GOLD }} />Fanometrix Intelligence Report
        </p>
        <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold text-white leading-[0.92] tracking-[-0.02em] mb-8">
          Football as an<br />Access Engine
        </h1>
        <p className="text-lg md:text-xl max-w-xl leading-relaxed font-light tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>
          Understanding what football fans value and how brands can genuinely give back.
        </p>
        <div className="w-14 h-[3px] mt-10" style={{ background: GOLD }} />
      </div>
    </section>
  );
}

function ExecSummary() {
  const points = [
    "Fans reward brands that strengthen football culture, not just sponsor it.",
    "Grassroots investment outperforms traditional sponsorship benefits in fan perception.",
    "The meaning of access changes by market — there is no single global strategy.",
    "The most effective sponsorships improve experiences rather than interrupt them.",
  ];
  return (
    <Reveal className={`bg-white ${PAD} py-16 md:py-20`}>
      <div className={W}>
        <GoldLabel>Executive Summary</GoldLabel>
        <h2 className="text-2xl md:text-3xl font-bold mb-5 leading-snug max-w-2xl" style={{ color: NAVY }}>What this report tells you</h2>
        <p className="text-gray-500 text-base md:text-lg leading-relaxed mb-10 max-w-2xl font-light">
          Across five major football markets, Fanometrix research and wider industry analysis point towards the same conclusion: fans do not want more advertising. They want brands to use their investment in football to improve access, participation and community value.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {points.map((pt, i) => (
            <div key={i} className="flex gap-4 items-start border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-300 transition-colors">
              <span className="font-bold text-xs mt-0.5 flex-shrink-0 tabular-nums" style={{ color: GOLD }}>{String(i + 1).padStart(2, "0")}</span>
              <p className="text-gray-600 text-sm leading-relaxed">{pt}</p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function ChapterBreak({ number, title, description }: { number: string; title: string; description?: string }) {
  const ref = useReveal(0.15);
  const ruleRef = useReveal(0.15);
  return (
    <div ref={ref} className={`report-reveal ${PAD} pt-24 pb-10`}>
      <div className={W}>
        <p className="text-[10px] font-bold tracking-[0.35em] uppercase mb-5" style={{ color: GOLD }}>{number}</p>
        <div ref={ruleRef} className="gold-rule w-full mb-7" />
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight" style={{ color: NAVY }}>{title}</h2>
        {description && <p className="text-gray-400 text-sm md:text-base mt-5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
    </div>
  );
}

function InsightBlock({
  chapter, headline, narrative, stat, statLabel, implication, recommendation,
}: {
  chapter?: string; headline: string; narrative: string | React.ReactNode;
  stat?: string; statLabel?: string; implication?: string; recommendation?: string;
}) {
  const ref = useReveal(0.08);
  const { display: statDisplay, ref: statRef } = useCountUp(stat ?? "");
  return (
    <div ref={ref} className={`report-reveal bg-white ${PAD} pt-12 md:pt-16 pb-8`}>
      <div className={W}>
        {chapter && <GoldLabel>{chapter}</GoldLabel>}
        <h2 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-10 max-w-3xl" style={{ color: NAVY }}>{headline}</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-10">
          <div className="md:col-span-7">
            <div className="text-base text-gray-500 leading-[1.8] space-y-4">
              {typeof narrative === "string"
                ? narrative.split("\n\n").map((p, i) => <p key={i}>{p}</p>)
                : narrative}
            </div>
          </div>
          {stat && (
            <div ref={statRef} className="md:col-span-5 rounded-2xl px-8 py-8 flex flex-col justify-center" style={{ background: NAVY }}>
              <span className="text-5xl md:text-6xl font-bold text-white tabular-nums leading-none">{statDisplay}</span>
              {statLabel && <p className="text-sm font-medium mt-4 leading-snug" style={{ color: GOLD }}>{statLabel}</p>}
            </div>
          )}
        </div>
        {(implication || recommendation) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-8 border-t border-gray-100">
            {implication && (
              <div className="border-l-[3px] pl-5 py-1" style={{ borderColor: GOLD }}>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: GOLD }}>Strategic Implication</p>
                <p className="text-sm text-gray-600 leading-relaxed">{implication}</p>
              </div>
            )}
            {recommendation && (
              <div className="border-l-[3px] pl-5 py-1" style={{ borderColor: NAVY }}>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: NAVY }}>Recommendation</p>
                <p className="text-sm text-gray-600 leading-relaxed">{recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PullQuote({ quote, attribution }: { quote: string; attribution?: string }) {
  const ref = useReveal(0.2);
  return (
    <div ref={ref} className={`report-reveal ${PAD} py-20 md:py-24`} style={{ background: NAVY }}>
      <div className={`${W} text-center`}>
        <div className="text-7xl leading-none font-serif opacity-40 mb-6" style={{ color: GOLD }}>&ldquo;</div>
        <blockquote className="text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight tracking-tight max-w-3xl mx-auto">{quote}</blockquote>
        <div className="text-7xl leading-none font-serif opacity-40 mt-4 mb-6" style={{ color: GOLD }}>&rdquo;</div>
        {attribution && <p className="text-xs tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>{attribution}</p>}
      </div>
    </div>
  );
}

function MarketProfile({
  flag, market, headline, stat, statLabel, signals, narrative, findings, opportunity, recommendation,
}: {
  flag: string; market: string; headline: string; stat?: string; statLabel?: string;
  signals: { label: string; value: string }[];
  narrative: string; findings: string[]; opportunity: string; recommendation: string;
}) {
  const ref = useReveal(0.08);
  const { display: statDisplay, ref: statRef } = useCountUp(stat ?? "");
  return (
    <div ref={ref} className="report-reveal border-t-[3px]" style={{ borderColor: GOLD }}>
      <div className={`${PAD} pt-12 pb-10`} style={{ background: NAVY }}>
        <div className={W}>
          <p className="text-[10px] font-bold tracking-[0.35em] uppercase mb-4 flex items-center gap-3" style={{ color: GOLD }}>
            <span className="w-6 h-px inline-block" style={{ background: GOLD }} />Market
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-6">
            <h2 className="text-4xl md:text-6xl font-bold text-white leading-none tracking-tight">{flag} {market}</h2>
            {stat && (
              <div ref={statRef} className="text-right flex-shrink-0">
                <p className="text-4xl md:text-6xl font-bold tabular-nums leading-none" style={{ color: GOLD }}>{statDisplay}</p>
                {statLabel && <p className="text-xs uppercase tracking-widest mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{statLabel}</p>}
              </div>
            )}
          </div>
          <h3 className="text-base md:text-xl font-bold max-w-2xl leading-snug mb-6" style={{ color: "rgba(255,255,255,0.75)" }}>{headline}</h3>
          <div className="flex flex-wrap gap-2">
            {signals.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 border border-white/10 rounded-lg px-3.5 py-2 bg-white/[0.04]">
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{s.label}</span>
                <span className="w-px h-3 bg-white/15" />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: GOLD }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`bg-white ${PAD} py-12`}>
        <div className={W}>
          <p className="text-base text-gray-500 leading-[1.8] mb-10 max-w-2xl">{narrative}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-5">Key Findings</p>
          <div className="space-y-3 mb-10">
            {findings.map((f, i) => (
              <div key={i} className="flex gap-3 items-start py-3 border-b border-gray-100 last:border-0">
                <span className="font-bold text-xs mt-0.5 flex-shrink-0" style={{ color: GOLD }}>→</span>
                <p className="text-sm text-gray-600 leading-relaxed">{f}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-5 py-4 mb-5 border border-[#0B1929]/10" style={{ background: "rgba(11,25,41,0.04)" }}>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: NAVY }}>Brand Opportunity</p>
            <p className="text-sm text-gray-700 leading-relaxed">{opportunity}</p>
          </div>
          <div className="border-l-[3px] pl-5" style={{ borderColor: GOLD }}>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: GOLD }}>Recommendation</p>
            <p className="text-sm text-gray-700 leading-relaxed">{recommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Recommendation({ number, headline, body }: { number: number; headline: string; body: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`report-reveal bg-white ${PAD} py-8`}>
      <div className={`${W} flex gap-6 md:gap-10 items-start`}>
        <span className="text-6xl md:text-8xl font-bold leading-none tabular-nums select-none flex-shrink-0"
          style={{ color: `${NAVY}0d` }}>{String(number).padStart(2, "0")}</span>
        <div className="border-l-[3px] pl-6 py-1 flex-1" style={{ borderColor: GOLD }}>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-2.5" style={{ color: GOLD }}>Recommendation</p>
          <h3 className="text-xl md:text-2xl font-bold mb-3 leading-snug" style={{ color: NAVY }}>{headline}</h3>
          <p className="text-sm text-gray-500 leading-[1.8]">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ComparisonTable() {
  const ref = useReveal();
  const rows = [
    { market: "🇬🇧  United Kingdom", meaning: "Shared experience & identity",   value: "Convenience & access to moments",   role: "Remove friction"             },
    { market: "🇩🇪  Germany",         meaning: "Community institution",          value: "Authenticity & cultural respect",   role: "Protect football culture"    },
    { market: "🇸🇪  Sweden",          meaning: "Local participation",            value: "Grassroots support & community",    role: "Enable local communities"    },
    { market: "🇮🇳  India",           meaning: "Aspiration & national growth",   value: "Access & opportunity",              role: "Build pathways"              },
    { market: "🇨🇳  China",           meaning: "Digital fandom & aspiration",    value: "Access to players & content",       role: "Unlock premium experiences"  },
  ];
  return (
    <div ref={ref} className={`report-reveal bg-white ${PAD} py-12 overflow-x-auto`}>
      <div className={W}>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-8">Market Intelligence Summary</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left pb-4 pr-6 w-44"><span className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.25em]">Market</span></th>
              {["What Football Means","What Fans Value","Best Brand Role"].map((h,i) => (
                <th key={i} className="text-left pb-4 px-4 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD }}>{h}</th>
              ))}
            </tr>
            <tr><td colSpan={4}><div className="h-px bg-gray-200 mb-1" /></td></tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="group hover:bg-[#0B1929]/[0.03] transition-colors cursor-default">
                <td className="py-4 pr-6 border-b border-gray-100 group-last:border-0">
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: NAVY }}>{row.market}</span>
                </td>
                <td className="py-4 px-4 border-b border-gray-100 text-sm text-gray-600 group-last:border-0">{row.meaning}</td>
                <td className="py-4 px-4 border-b border-gray-100 text-sm text-gray-600 group-last:border-0">{row.value}</td>
                <td className="py-4 px-4 border-b border-gray-100 text-sm text-gray-600 group-last:border-0">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccessPyramid() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold: 0.15 }
    );
    obs.observe(el); return () => obs.disconnect();
  }, []);

  const levels = [
    { n: 5, label: "Legacy",        sub: "ACCESS TO LEGACY",        desc: "Brands contribute to the long-term health and growth of football. Investment at this level builds generational brand equity.", bg: GOLD, text: NAVY, accent: NAVY },
    { n: 4, label: "Participation", sub: "ACCESS TO PARTICIPATION", desc: "Fans and future fans can play and participate. Grassroots investment, youth football and facility funding operate here.", bg: "#1e4a7e", text: "#fff", accent: GOLD },
    { n: 3, label: "Communities",   sub: "ACCESS TO COMMUNITIES",   desc: "Fans can connect with other fans, locally and globally. Brands that create community infrastructure build longer-term equity.", bg: "#163d6a", text: "#fff", accent: GOLD },
    { n: 2, label: "Experiences",   sub: "ACCESS TO EXPERIENCES",   desc: "Fans can attend, participate in, or get closer to football experiences. Brand presence is visible but still transactional.", bg: "#0f2f55", text: "#fff", accent: `${GOLD}cc` },
    { n: 1, label: "Content",       sub: "ACCESS TO CONTENT",       desc: "Fans can watch, follow and engage. Brands that remove barriers to content access earn broad positive sentiment.", bg: NAVY, text: "#fff", accent: `${GOLD}99` },
  ];
  const widths = ["32%","48%","64%","80%","100%"];

  return (
    <div ref={ref} className={`bg-white ${PAD} py-16 md:py-20`}>
      <div className={W}>
        <div className="text-center mb-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3 flex items-center justify-center gap-3" style={{ color: GOLD }}>
            <span className="w-8 h-px inline-block" style={{ background: GOLD }} />Proprietary Framework
            <span className="w-8 h-px inline-block" style={{ background: GOLD }} />
          </p>
          <h2 className="text-2xl md:text-4xl font-bold mb-3" style={{ color: NAVY }}>The Fanometrix Access Pyramid</h2>
          <p className="text-sm text-gray-400 max-w-lg mx-auto">Sponsorship becomes more valuable as brands move up the pyramid</p>
        </div>
        <div className="space-y-0.5 mb-14">
          {levels.map((level, i) => (
            <div key={i} className="mx-auto transition-all duration-700 ease-out"
              style={{ width: widths[i], opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transitionDelay: `${i * 100}ms` }}>
              <div className="px-5 md:px-7 py-4 flex items-center justify-between" style={{ backgroundColor: level.bg }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.25em] opacity-70" style={{ color: level.accent }}>{level.sub}</span>
                <span className="text-sm font-bold" style={{ color: level.text }}>{level.label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
          {[...levels].reverse().map((level, i) => (
            <div key={i} className="flex gap-5 items-start py-5 border-b border-gray-100"
              style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)", transition: `opacity 0.5s ease, transform 0.5s ease ${(i + 5) * 80}ms` }}>
              <span className="text-3xl font-bold flex-shrink-0 tabular-nums select-none mt-1 leading-none" style={{ color: `${NAVY}12` }}>{level.n}</span>
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: NAVY }}>{level.label}
                  <span className="inline-block w-4 h-0.5 rounded-full ml-2 align-middle" style={{ background: GOLD }} /></p>
                <p className="text-xs text-gray-500 leading-relaxed">{level.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DownloadSection() {
  const ref = useReveal();
  return (
    <div ref={ref} className={`report-reveal ${PAD} py-16 md:py-20`} style={{ background: NAVY }}>
      <div className={W}>
        <GoldLabel>Intelligence Assets</GoldLabel>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">Football as an Access Engine</h2>
        <p className="text-sm mb-10 max-w-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          Download the full report and supporting assets to share with your team.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "◈", title: "Full Report",         desc: "Complete intelligence report with all market findings",  url: "" },
            { icon: "◫", title: "Executive Summary",   desc: "Two-page briefing of key findings for senior stakeholders", url: "" },
            { icon: "☰", title: "Market Cheat Sheet",  desc: "One-page guide for UK, Germany, Sweden, India and China",   url: "" },
            { icon: "▦", title: "Presentation Deck",   desc: "Slide deck formatted for internal and client presentations",url: "" },
          ].map((a, i) => (
            <div key={i} className="border border-white/10 rounded-xl p-5 flex flex-col gap-3 opacity-75">
              <span className="text-2xl" style={{ color: i === 0 ? GOLD : "rgba(255,255,255,0.4)" }}>{a.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold mb-1" style={{ color: i === 0 ? GOLD : "rgba(255,255,255,0.7)" }}>{a.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>{a.desc}</p>
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Coming soon</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Methodology() {
  const ref = useReveal();
  return (
    <div ref={ref} className={`report-reveal bg-gray-50 border-t border-gray-200 ${PAD} py-14`}>
      <div className={W}>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-4">Methodology & Next Steps</p>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mb-5">
          This report combines early Fanometrix fan survey testing and Football365 audience polling with desk research across five markets: United Kingdom, Germany, Sweden, India and China. Survey findings should be treated as directional indicators rather than nationally representative market data. Market research draws on publicly available data from UEFA, Nielsen Sports, Statista, local football associations and regional media organisations.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
          <strong className="text-gray-700">Next steps:</strong> Fanometrix will continue to build its fan survey panel across all five markets. Future editions of this report will include larger, statistically representative samples alongside the strategic intelligence synthesis presented here. To discuss the findings or commission bespoke market research, contact Fanometrix directly.
        </p>
      </div>
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

function Report({ scrolled }: { scrolled: boolean }) {
  return (
    <div className="min-h-screen bg-white">

      {/* Sticky top bar */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "shadow-lg" : ""}`}
        style={{ background: scrolled ? `${NAVY}f0` : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none" }}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between gap-4">
          <Link href="/insights" className="text-sm font-semibold transition-colors"
            style={{ color: scrolled ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.6)" }}>← Insights</Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] truncate max-w-xs transition-opacity duration-500"
            style={{ color: GOLD, opacity: scrolled ? 1 : 0 }}>Football as an Access Engine</p>
          <div />
        </div>
      </div>

      <Hero />

      <ExecSummary />
      <Divider />

      {/* ── Insight 01 ── */}
      <ChapterBreak number="INSIGHT 01" title="Why Grassroots Wins"
        description="Community investment is not philanthropy. It is the highest-performing sponsorship strategy available." />
      <InsightBlock
        headline="Authenticity is earned at the grassroots"
        narrative={`Fans across every market in this study distinguish between brands that sponsor football and brands that invest in football. The difference is only visible at the community level.\n\nIn Sweden, fan responses show that local participation and grassroots engagement are the primary measure of whether a brand genuinely belongs in football. In Germany, supporting local clubs is seen as protecting a community asset, not buying access to an audience. In India, grassroots investment creates local relevance that top-tier tournament sponsorship cannot replicate.\n\nThis is not an emerging trend. It is a consistent signal that brands have historically under-weighted in their investment decisions.`}
        stat="3×"
        statLabel="more likely to feel positively about a brand that funds grassroots football vs one that simply sponsors a major tournament"
        implication="Grassroots investment creates the authenticity premium that premium-tier sponsorship cannot buy. It is the only form of brand activity that fans experience as improvement rather than interruption."
        recommendation="Allocate a visible proportion of total football investment to grassroots and community activity. Make this investment identifiable, measurable and storytellable."
      />
      <Divider />

      <PullQuote
        quote="Fans don't want brands to sponsor football. They want brands to improve football."
        attribution="Fanometrix Strategic Intelligence, 2026"
      />

      {/* ── Insight 02 ── */}
      <ChapterBreak number="INSIGHT 02" title="Access Means Different Things in Different Places"
        description="There is no universal football fan. A strategy built for Germany will not resonate in India." />
      <ComparisonTable />
      <InsightBlock
        headline="Local strategy outperforms global campaigns"
        narrative={`The five markets in this report have fundamentally different relationships with football. In Germany, football is a community institution protected by law. In China, it is consumed almost entirely through digital and social channels. In India, it is a growth sport still building its cultural infrastructure.\n\nA campaign built to resonate in the UK — where fans want friction removed from their existing football experience — will feel tone-deaf in Sweden, where fans want brands to fund local participation. A strategy designed to impress Chinese fans with player access will seem irrelevant to German fans who distrust commercial behaviour in their clubs.\n\nThe brands that win across markets are those that commit to local understanding before local activation.`}
        implication="The access opportunity varies dramatically by market. One brief, one campaign and one activation platform cannot serve all five markets effectively."
        recommendation="Build five market strategies under a single strategic framework — the Access Pyramid — but with local execution, local partners and local measurement."
      />
      <Divider />

      {/* ── Insight 03 ── */}
      <ChapterBreak number="INSIGHT 03" title="Experiences Beat Rewards"
        description="Fans value what they cannot buy for themselves over what brands offer as a discount." />
      <InsightBlock
        headline="Access to moments creates deeper loyalty than transactional benefits"
        narrative={`Rewards and discounts consistently rank below experience access when fans are asked what makes a brand feel genuinely committed to football. The reason is straightforward: a discount on a product is something fans could negotiate for themselves. A seat in a dressing room, a conversation with a player or access to a closed training session is something only a brand with the right relationship can provide.\n\nThis does not mean rewards have no value. They perform well as a volume mechanism — reaching a broad audience with a low-cost benefit. But they do not build the kind of emotional connection that differentiates brands in football-saturated markets.\n\nThe most effective activations at EURO 2028 will be those that give fans something genuinely unrepeatable.`}
        stat="26%"
        statLabel="of fans ranked access to matches and experiences as the top indicator of brand commitment — second only to grassroots investment"
        implication="Experience-led activation creates stronger brand recall and emotional association than reward programmes, particularly in markets where commercial saturation is high."
        recommendation="Design at least one flagship experience access programme per market that could only exist because of Carlsberg's partnership with UEFA EURO 2028."
      />
      <Divider />

      {/* ── Insight 04 ── */}
      <ChapterBreak number="INSIGHT 04" title="Visibility Is No Longer Enough"
        description="Fans notice sponsorship. They reward contribution." />
      <InsightBlock
        headline="The sponsorship visibility premium is eroding"
        narrative={`Football fans are among the most commercially aware audiences in sport. They know who sponsors their club, their tournament and their broadcast. But awareness and goodwill are increasingly decoupled.\n\nFans in every market in this study can identify the major sponsors of football's biggest properties. Fewer of them feel positively about those brands as a result of their sponsorship alone. The brands that generate genuine affection are those that can point to something they have given to football — not just borrowed from it.\n\nThis shift is well documented in broader sports marketing research and is particularly pronounced among fans under 35. The implication for Carlsberg at EURO 2028 is direct: the logo on the pitch is not enough. The story of what Carlsberg did for football needs to travel alongside it.`}
        implication="Visibility without contribution increasingly reads as extraction rather than investment. Brands that cannot articulate what they gave to football risk the opposite of the association they paid for."
        recommendation="Develop a 'What Carlsberg gave to football' narrative that runs alongside the visibility programme. Make the contribution as prominent as the logo."
      />
      <Divider />

      {/* ── Access Pyramid ── */}
      <ChapterBreak number="STRATEGIC FRAMEWORK" title="The Access Pyramid"
        description="Not all access is equal. As brands move up the pyramid, their sponsorship becomes more valuable — to fans, to communities, and to football itself." />
      <AccessPyramid />
      <InsightBlock
        chapter="STRATEGIC IMPLICATION"
        headline="Most brands operate at Levels 1 and 2. The opportunity is at Levels 3, 4 and 5."
        narrative={`Tournament sponsorship, pitch-side boards and hospitality packages are all Level 1-2 activities. They are visible and measurable, but they do not differentiate brands in the eyes of fans. Every major tournament sponsor operates at these levels.\n\nThe brands that fans genuinely respect — and remember — operate at Level 3, 4 or 5. They are seen to be giving something back to football, not just borrowing its audience. For Carlsberg at UEFA EURO 2028, the question is not how to be more visible. It is how to be more valuable.`}
        implication="The gap between Level 2 and Level 3 is the most important strategic decision Carlsberg faces in its UEFA EURO 2028 planning. Moving up the pyramid requires a different kind of investment and different storytelling — but the returns in fan trust are disproportionate."
        recommendation="Set a public commitment to Level 4-5 activity as a minimum threshold for the EURO 2028 partnership. Make this commitment measurable and visible to fans before the tournament begins."
      />
      <Divider />

      {/* ── Markets ── */}
      <ChapterBreak number="THE MARKETS" title="Five Markets, Five Opportunities"
        description="Each market requires a different answer to the same question: what does access mean here?" />

      <MarketProfile flag="🇬🇧" market="United Kingdom" headline="FANS DISLIKE FRICTION MORE THAN CHANGE"
        stat="35%" statLabel="of UK adults regularly follow football"
        signals={[{ label: "Friction Index", value: "HIGH" }, { label: "Matchday costs", value: "↑ Rising" }, { label: "Streaming", value: "#1 Pain Point" }]}
        narrative="British football fans have the deepest cultural relationship with the sport of any market in this study. Football is not entertainment — it is identity, community and ritual. The challenge for brands is that this depth of relationship makes fans acutely sensitive to anything that disrupts it. UK fans do not need brands to explain football to them. They need brands to remove the friction points that make following football harder than it needs to be."
        findings={[
          "Matchday experience quality is declining while costs rise — a clear brand opportunity to create value",
          "Streaming fragmentation is the number one frustration among regular UK fans",
          "Rewards and convenience benefits are valued, but only when they feel genuinely frictionless",
          "Brands perceived as extracting from football rather than contributing to it are actively disliked",
        ]}
        opportunity="Carlsberg's long-standing association with football creates natural space to own the friction-removal narrative. Activation that makes football more accessible — better viewing, simpler ticketing, better matchday experiences — turns brand presence into fan gratitude."
        recommendation="Build activation around removing one specific friction point per market. Make the improvement visible and attributable to the brand."
      />

      <MarketProfile flag="🇩🇪" market="Germany" headline="FOOTBALL IS A COMMUNITY ASSET, NOT A PRODUCT"
        stat="61%" statLabel="of the German population follows football"
        signals={[{ label: "Community Trust", value: "VERY HIGH" }, { label: "Grassroots", value: "#1 Priority" }, { label: "50+1 sentiment", value: "Deeply Held" }]}
        narrative="Germany's football culture is built on the 50+1 ownership rule, which enshrines fan control of clubs and community ownership as a structural principle of the sport. This is not just policy — it is a deeply held belief that football belongs to the people who follow it. In this context, brand sponsorship that feels extractive or purely commercial is instinctively resisted."
        findings={[
          "German fans are the most likely in this study to actively support brands that protect football culture",
          "Local club sponsorship generates significantly higher fan approval than national association deals",
          "Youth football funding is consistently cited as the most valued form of brand investment",
          "Authenticity markers — local language, local talent, local community — are non-negotiable",
        ]}
        opportunity="For Carlsberg and Dentsu, Germany is the market where grassroots investment most directly translates into brand equity. A visible commitment to supporting local clubs and youth development — co-created with fans — would be a significant differentiator at UEFA EURO 2028."
        recommendation="Partner with local football clubs, not just the tournament. Make the community investment visible at the local level, not only in national marketing."
      />

      <MarketProfile flag="🇸🇪" market="Sweden" headline="AUTHENTICITY MATTERS MORE THAN SCALE"
        stat="79%" statLabel="identify football as important to national culture"
        signals={[{ label: "Participation", value: "VERY HIGH" }, { label: "Local support", value: "Top Driver" }, { label: "Women's football", value: "↑ Growing" }]}
        narrative="Swedish football culture is defined by participation, not spectatorship. The Swedish model of sport is built around local clubs, community access and the belief that football is something you do, not just something you watch. Scale is not impressive in Sweden — grassroots investment is. A brand that funds local facilities, supports women's football or creates pathways for local players will earn more trust than one that simply buys visibility at the elite level."
        findings={[
          "Community football participation rates are among the highest in Europe",
          "Swedish fans are the most likely to prefer brands that support their local clubs over national team sponsors",
          "Women's football investment is viewed particularly positively and signals genuine commitment",
          "Brands associated with creating local access consistently outperform those at the elite level only",
        ]}
        opportunity="Sweden is a market where Carlsberg can build meaningful brand equity by funding local football access — not by amplifying an existing EURO sponsorship. The most effective activation would be invisible to most of the market, but deeply meaningful to the communities it touches."
        recommendation="Fund local football infrastructure visibly. Partner with the Swedish Football Association's grassroots programmes and make the impact measurable and storytellable."
      />

      <MarketProfile flag="🇮🇳" market="India" headline="THE WORLD'S LARGEST FOOTBALL GROWTH MARKET"
        stat="305M" statLabel="football audience — and growing"
        signals={[{ label: "Growth opportunity", value: "VERY HIGH" }, { label: "Youth audience", value: "Under 30" }, { label: "Digital fandom", value: "Social-first" }]}
        narrative="India's football market is structurally different from every other market in this study. It is not a heritage market — it is a growth market. Fans are younger, more digitally native, and more likely to follow the sport through social media than through traditional broadcast. Critically, Indian fans want to see football become more Indian. They want local talent, local stories, and brands that invest in building the sport in India rather than importing the European experience wholesale."
        findings={[
          "87% of Indian football fans under 30 follow at least one international player on social media",
          "ISL clubs are generating genuine community identity and local fan culture in their cities",
          "Language-specific content dramatically outperforms English-language content in engagement",
          "Grassroots investment in talent pathways is seen as the highest-value brand activity",
        ]}
        opportunity="For Carlsberg, India is the market with the highest long-term upside. UEFA EURO 2028 will drive significant interest — but the brands that invest in local football culture now will own the market when that wave arrives."
        recommendation="Build an India-specific football access programme. Invest in local talent pathways, creator partnerships and language-appropriate content. Do not treat India as a secondary European market."
      />

      <MarketProfile flag="🇨🇳" market="China" headline="FOOTBALL IS CONSUMED DIGITALLY AND EXPERIENCED SOCIALLY"
        stat="289M" statLabel="football fans — the world's largest single fan base"
        signals={[{ label: "Digital fandom", value: "VERY HIGH" }, { label: "Player access", value: "#1 Priority" }, { label: "Platform", value: "WeChat/Weibo" }]}
        narrative="China's football market is unique: a vast fan base that consumes football almost entirely through digital and social channels, with deep enthusiasm for the sport's biggest players and tournaments but limited access to live football experiences. Chinese fans are not asking for grassroots investment in the European sense. They are asking for a bridge between digital fandom and real experience."
        findings={[
          "Player-driven content massively outperforms club or competition content on Chinese platforms",
          "Exclusive behind-the-scenes access is the most desired benefit a sponsor can offer",
          "WeChat and Weibo are the primary channels — not YouTube, Instagram or X",
          "Physical fan experiences, when possible, create enormous social amplification",
        ]}
        opportunity="For Carlsberg at UEFA EURO 2028, China is the market where player-access activation creates the most value. Exclusive content, digital-first experiences and player partnerships will resonate far more than traditional advertising."
        recommendation="Build a China-specific digital access programme around EURO 2028. Prioritise player partnerships, exclusive content and platform-native experiences on WeChat and Weibo."
      />

      {/* ── Recommendations ── */}
      <ChapterBreak number="RECOMMENDATIONS" title="Five Actions for Carlsberg and Dentsu"
        description="Derived from Fanometrix fan research and cross-market intelligence findings." />
      <Recommendation number={1}
        headline="Fund grassroots football visibly and specifically"
        body="Allocate a meaningful proportion of total UEFA EURO 2028 investment to community and grassroots football. Make this commitment public before the tournament, not during it. In each market, identify a specific programme or initiative that Carlsberg will fund — local enough to be real, significant enough to be impactful." />
      <Divider />
      <Recommendation number={2}
        headline="Reward fans with experiences, not discounts"
        body="The highest-value activation is not a promo code; it is an experience that a fan could not have without Carlsberg's involvement. Build an experience access programme for each market that moves fans up the Access Pyramid — from passive consumption to genuine participation." />
      <Divider />
      <Recommendation number={3}
        headline="Remove one specific friction point per market"
        body="In each market, identify the single biggest friction point for fans — and remove it. In the UK, this may be streaming fragmentation or matchday costs. In India, it may be language barriers or lack of local content. In China, it may be access to players. Carlsberg's role is not to add more; it is to make the experience fans already have, demonstrably better." />
      <Divider />
      <Recommendation number={4}
        headline="Build market-specific access strategies, not a global campaign"
        body="Build five market strategies under a single strategic framework — the Access Pyramid — but with local execution, local partners and local measurement. This is not more expensive than a global campaign. It is more effective." />
      <Divider />
      <Recommendation number={5}
        headline="Measure impact through fan value, not impressions"
        body="Define a Carlsberg EURO 2028 Fan Value Index: a composite measure of brand perception improvement across the five markets. Set a target before the tournament. Measure it after. Report the results publicly. This is how the most credible sports brands demonstrate their commitment to giving back." />

      <PullQuote
        quote="The brands that win in football over the next decade will not be the most visible. They will be the brands that make football better."
        attribution="Fanometrix Football Intelligence Report, 2026"
      />

      <DownloadSection />
      <Methodology />

      {/* Footer */}
      <div className={`${PAD} py-12`} style={{ background: NAVY }}>
        <div className={`${W} flex flex-col md:flex-row md:items-center justify-between gap-6`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Fanometrix</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Fan Insight Platform</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {["Dentsu","Carlsberg","UEFA EURO 2028","UK","Germany","Sweden","India","China"].map(t => (
              <span key={t} className="text-[9px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.2)" }}>{t}</span>
            ))}
          </div>
          <Link href="/insights" className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>← All Insights</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Page (access check) ──────────────────────────────────────────────────────

export default function FootballAccessEnginePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    fetch("/api/insights/football-as-an-access-engine")
      .then(r => setStatus(r.ok ? "allowed" : "denied"))
      .catch(() => setStatus("denied"));
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: GOLD, borderTopColor: "transparent" }} />
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: `${GOLD}60` }}>Loading</p>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-6" style={{ background: NAVY }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Access Restricted</p>
        <h1 className="text-3xl font-bold text-white">This report isn&apos;t available</h1>
        <p className="text-sm max-w-sm" style={{ color: "rgba(255,255,255,0.4)" }}>You may not have access to this report. Contact your Fanometrix administrator.</p>
        <button onClick={() => router.push("/insights")}
          className="mt-2 px-6 py-3 text-sm font-bold rounded-lg"
          style={{ background: GOLD, color: NAVY }}>
          Back to Insights
        </button>
      </div>
    );
  }

  return <Report scrolled={scrolled} />;
}

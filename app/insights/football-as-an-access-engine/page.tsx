"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Football as an Access Engine - static report page
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
          Understanding what football fans value and how Carlsberg can turn UEFA EURO 2028 into a platform for access, participation and community impact.
        </p>
        <div className="w-14 h-[3px] mt-10" style={{ background: GOLD }} />
      </div>
    </section>
  );
}

function ExecSummary() {
  const points = [
    { title: "Community investment creates credibility.", body: "Fans respond more positively to brands that strengthen football culture than those that simply buy exposure." },
    { title: "Access is market-specific.", body: "What fans value in the UK is different from Germany, Sweden, India or China. A single global activation risks flattening the opportunity." },
    { title: "Experiences create deeper memory than rewards.", body: "Transactional benefits have a role, but access to moments fans cannot buy for themselves creates stronger emotional value." },
    { title: "Visibility needs a contribution story.", body: "Logo presence matters, but the brands fans remember are those that can point to what they gave back to football." },
  ];
  return (
    <Reveal className={`bg-white ${PAD} py-16 md:py-20`}>
      <div className={W}>
        <GoldLabel>Executive Summary</GoldLabel>
        <h2 className="text-2xl md:text-3xl font-bold mb-5 leading-snug max-w-2xl" style={{ color: NAVY }}>What this report tells you</h2>
        <div className="text-gray-500 text-base md:text-lg leading-relaxed mb-10 font-light space-y-4">
          <p>This report draws on Fanometrix fan survey data - collected across LiveScore and Football365 publisher audiences, representing approximately 1,800 football fans predominantly from the UK with additional Germany and Sweden representation - alongside desk research across five markets.</p>
          <p>The consistent signal across both data sources and the wider desk research is this: fans value experiences over exposure, participation over interruption and utility over visibility. Sponsorship is most effective when it creates tangible fan value - through access, community investment, better football experiences and content that unlocks something real.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {points.map((pt, i) => (
            <div key={i} className="flex gap-4 items-start border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-300 transition-colors">
              <span className="font-bold text-xs mt-0.5 flex-shrink-0 tabular-nums" style={{ color: GOLD }}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-gray-800 text-sm font-semibold leading-snug mb-1">{pt.title}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{pt.body}</p>
              </div>
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
          <div className={stat ? "md:col-span-7" : "md:col-span-12"}>
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
    { market: "🇬🇧  United Kingdom", meaning: "Identity, ritual & shared experience", value: "Remove friction from the football experience",      role: "Make following football easier and cheaper"    },
    { market: "🇩🇪  Germany",         meaning: "Community institution & culture",    value: "Protect and support football culture",              role: "Fund local clubs and community football"       },
    { market: "🇸🇪  Sweden",          meaning: "Participation & local identity",     value: "Enable local participation and grassroots access",  role: "Fund local football infrastructure"            },
    { market: "🇮🇳  India",           meaning: "Growth sport & national aspiration", value: "Bring global football closer and grow local game",   role: "Build local pathways and creator access"       },
    { market: "🇨🇳  China",           meaning: "Digital fandom & social experience", value: "Access to players, content and exclusive moments",   role: "Unlock digital-first premium experiences"      },
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
        <GoldLabel>Future Intelligence Assets</GoldLabel>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">Football as an Access Engine</h2>
        <p className="text-sm mb-6 max-w-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          Future versions of this Fanometrix programme can include downloadable market summaries, executive briefings and presentation-ready insight packs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "◈", title: "Full Report",         desc: "Complete intelligence report with all market findings and recommendations"  },
            { icon: "◫", title: "Executive Summary",   desc: "Two-page briefing of key findings for senior stakeholders" },
            { icon: "☰", title: "Market Cheat Sheet",  desc: "One-page market guide for UK, Germany, Sweden, India and China"  },
            { icon: "▦", title: "Presentation Deck",   desc: "Slide deck formatted for internal team and client presentations" },
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
          This report was developed as a fast-turnaround strategic intelligence exercise to support early planning around Carlsberg, UEFA and EURO 2028. Fan survey data was collected across Fanometrix publisher network audiences - LiveScore and Football365. Respondents are predominantly UK-based football fans, with additional representation from Germany and Sweden. Football365 sub-samples are small enough that they should be read as confirming the LiveScore pattern rather than driving independent conclusions.

          Desk research covers the United Kingdom, Germany, Sweden, India and China, drawing on publicly available data from UEFA, Nielsen Sports, Statista, local football associations and regional media organisations. All survey findings should be treated as directional indicators rather than nationally representative market data.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
          A future Fanometrix programme would be structured over a longer period and could combine planned partner inventory, larger sample sizes, market-specific survey deployment, social listening, publisher behavioural signals and ongoing fan tracking. This would allow Carlsberg and Dentsu to move from directional intelligence to a continuous football fan learning engine - combining media delivery, fan research and campaign measurement across the full EURO 2028 planning cycle.
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
        description="Grassroots investment turns sponsorship from visibility into contribution." />
      <InsightBlock
        headline="Authenticity is earned at the grassroots"
        narrative={
          <>
            <p>Early Fanometrix testing and supporting market analysis suggest that fans are quick to distinguish between brands that appear around football and brands that actively contribute to it.</p>
            <p>Grassroots and community investment performs strongly because it feels additive. It supports the places where football starts, strengthens the local game and creates a benefit that sits beyond matchday advertising.</p>
            <div className="border-l-[3px] pl-5 py-1 my-2" style={{ borderColor: GOLD }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: GOLD }}>Survey Signal - Directional</p>
              <p className="text-sm leading-relaxed" style={{ color: "#4B5563" }}>Across approximately 1,800 football fans surveyed through LiveScore and Football365 publisher audiences, grassroots and community investment ranked first as the indicator of genuine brand commitment - ahead of match access, rewards, fan events and branded content. The Football365 sub-samples directionally confirm the pattern seen in the larger LiveScore data.</p>
            </div>
            <p>This matters for Carlsberg because UEFA EURO 2028 will create large-scale visibility. Visibility creates reach; it does not create the contribution story fans are looking for. A clear, funded grassroots commitment - delivered through partners, content and community programmes - turns that visibility into something fans can understand, respect and share.</p>
          </>
        }
        implication="Grassroots investment gives Carlsberg a credible way to demonstrate contribution before, during and after the tournament - not just during broadcast windows."
        recommendation="Create a visible grassroots commitment linked to EURO 2028, with clear funding, local delivery partners and measurable community impact in each market."
      />

      {/* ── Insight 02 ── */}
      <ChapterBreak number="INSIGHT 02" title="One Sponsorship, Five Different Access Needs"
        description="EURO 2028 may be a single sponsorship platform, but fans interpret value through local football culture." />
      <ComparisonTable />
      <InsightBlock
        headline="One global idea needs five local expressions of value"
        narrative={`The five markets in this report have fundamentally different relationships with football - and therefore different expectations of what a brand like Carlsberg should deliver.\n\nIn the UK, access means removing friction from the football experience fans already have. In Germany, it means protecting and supporting football culture. In Sweden, it means enabling participation and local football. In India, it means bringing global football closer while helping local football grow. In China, it means digital-first access to players, content and premium football moments.\n\nThe implication is not that Carlsberg needs five unrelated campaigns. It needs one global organising idea with local expressions of value - each designed around what access actually means in that market.`}
        implication="A single activation executed identically across all five markets will underperform in most of them. The strategic opportunity is in the local translation, not the global blueprint."
        recommendation="Build five market strategies under a single strategic framework - the Access Pyramid below - but with local execution, local partners and local measurement."
      />
      <Divider />

      {/* ── Insight 03 ── */}
      <ChapterBreak number="INSIGHT 03" title="Experiences Beat Rewards"
        description="Fans value what they cannot buy for themselves over what brands offer as a discount." />
      <InsightBlock
        headline="Carlsberg has UEFA rights. Use them to create moments fans cannot reach alone."
        narrative={
          <>
            <p>Rewards are useful, but they are usually transactional. Experiences create memory. A discount can be offered by almost any brand; access to a player, a training session, a matchday moment or behind-the-scenes content can only be created by a brand with real football rights and relationships.</p>
            <div className="border-l-[3px] pl-5 py-1 my-2" style={{ borderColor: GOLD }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: GOLD }}>Survey Signal - Directional</p>
              <p className="text-sm leading-relaxed" style={{ color: "#4B5563" }}>Across the Fanometrix fan panel, access to matches and experiences ranked second overall as a form of brand value - ahead of rewards, fan events and content. This does not mean content is ineffective. It means content is most valued when it unlocks access, community or participation rather than functioning as advertising alone.</p>
            </div>
            <p>Brands like EE (improving matchday connectivity), adidas (fan-facing community campaigns), DHL (deliverying dreams) and ISL clubs (creator and social-led local engagement) demonstrate that content and media remain powerful - when they deliver something fans actually want. The question for Carlsberg is not whether to use content and media, but what the content and media should unlock.</p>
          </>
        }
        implication="Carlsberg should use UEFA access to create moments fans could not otherwise reach - and use content, media and creator partnerships to distribute and amplify those moments at scale."
        recommendation="Build a market-specific experience programme around access to matches, players, football culture and behind-the-scenes moments. Use content and creator partnerships as the distribution layer."
      />
      <Divider />

      {/* ── Insight 04 ── */}
      <ChapterBreak number="INSIGHT 04" title="Awareness Is Not Affection"
        description="Fans can see a sponsor without feeling positively about it." />
      <InsightBlock
        headline="The sponsorship challenge is not being noticed. It is being relevant."
        narrative={`Sponsorship visibility at scale remains valuable. Tournament assets, broadcast presence, publisher placements, social content and media create awareness across large audiences - and that awareness is the foundation everything else builds on. The question is what sits on top of that foundation.\n\nFans are more likely to feel positively about brands that improve their experience, support the game or create access they could not otherwise reach. The issue is not whether advertising and media work - they do. The issue is whether the brand has a contribution story that gives that media a reason to resonate.\n\nFor Carlsberg, the goal for EURO 2028 is not to choose between visibility and contribution. It is to ensure both are working together - so that the media creates awareness and the contribution gives fans a reason to remember the brand positively.`}
        implication="Visibility creates recognition. Contribution creates relevance. The Football Collective media network can deliver both - if the brand story is built to earn genuine fan value."
        recommendation="Build a 'what Carlsberg gave to football' narrative that runs alongside the visibility programme. Use publisher partnerships, creator content and fan experiences as the channels that make the contribution tangible."
      />
      <Divider />

      {/* ── Access Pyramid ── */}
      <ChapterBreak number="STRATEGIC FRAMEWORK" title="The Access Pyramid"
        description="Not all access is equal. As brands move up the pyramid, their sponsorship becomes more valuable - to fans, to communities and to football itself." />
      <AccessPyramid />
      <InsightBlock
        chapter="STRATEGIC IMPLICATION"
        headline="Most tournament sponsorship starts at Level 1 or 2. The strategic opportunity is higher."
        narrative={`Most tournament sponsorship naturally starts at Level 1 and Level 2: content, visibility, hospitality, rewards and experiences. These are valuable, but they are also expected. Every major EURO 2028 sponsor will operate at these levels.\n\nThe strategic opportunity for Carlsberg is to move deliberately into Levels 3, 4 and 5, where the brand can support communities, enable participation and create a legacy beyond the tournament window. This is where the brand can build something fans remember long after the final whistle.`}
        implication="The Access Pyramid is a planning filter, not just a framework. Every market activation should identify which level of access it creates and how fans will experience the value."
        recommendation="Use the Access Pyramid as a brief filter: for each market activation, identify the level it operates at and whether there is an opportunity to deliver at a higher level."
      />
      <Divider />

      {/* ── Markets ── */}
      <ChapterBreak number="THE MARKETS" title="Five Markets, Five Opportunities"
        description="Each market requires a different answer to the same question: what does access mean here?" />

      <MarketProfile flag="🇬🇧" market="United Kingdom" headline="ACCESS MEANS REMOVING FRICTION FROM FOOTBALL"
        stat="35%" statLabel="of UK adults regularly follow football"
        signals={[{ label: "Friction Index", value: "HIGH" }, { label: "Matchday costs", value: "↑ Rising" }, { label: "Streaming", value: "#1 Pain Point" }]}
        narrative="In the UK, football fandom is a deep cultural habit, not a casual interest. The relationship fans have with the sport is already strong - the opportunity for Carlsberg is not to add to it, but to make it easier. UK fans are increasingly frustrated by cost, fragmentation and the growing sense that football is being commercialised in ways that don't benefit them. Brands that improve the practical experience of being a football fan - simpler access, better value, less friction - earn genuine goodwill."
        findings={[
          "Matchday costs and accessibility remain a persistent concern across football audiences",
          "Streaming fragmentation means fans regularly pay multiple subscriptions to follow the sport they love",
          "Transactional benefits are valued, but only when they reduce effort rather than create it",
          "Industry analysis suggests UK fans are among the most discerning audiences when it comes to evaluating brand motives in football",
        ]}
        opportunity="Carlsberg's long-standing association with football creates space to own the friction-removal narrative. Activation that makes the football experience more accessible - better viewing, simpler ticketing, lower-cost matchday moments - turns brand presence into something fans notice and appreciate."
        recommendation="Identify one specific friction point in the UK football experience and make removing it a visible, branded commitment. Make the improvement clearly attributable to Carlsberg."
      />

      <MarketProfile flag="🇩🇪" market="Germany" headline="ACCESS MEANS PROTECTING AND SUPPORTING FOOTBALL CULTURE"
        stat="61%" statLabel="of the German population follows football"
        signals={[{ label: "Community Trust", value: "VERY HIGH" }, { label: "Grassroots", value: "Top Priority" }, { label: "50+1 principle", value: "Deeply Held" }]}
        narrative="Germany's football culture is built around community ownership, local clubs and the principle that the sport belongs to the fans who follow it. The 50+1 rule is not just a regulation - it represents a set of values that shape how fans in Germany evaluate brands that enter their sport. Commercial activity that feels extractive or purely self-serving tends to attract resistance. Brands that visibly support local clubs, youth development and fan culture earn a different kind of reception."
        findings={[
          "Local club partnerships appear to generate stronger fan approval than national tournament association in this market",
          "Youth football and grassroots programmes are directionally the most valued form of brand investment",
          "Authenticity signals - local language, local partnerships, local talent - matter more than scale",
          "Market analysis suggests German fans are among the most attentive to brand intent within football",
        ]}
        opportunity="Germany is the market where grassroots investment most directly appears to translate into brand equity. A visible commitment to supporting local clubs or youth development - made before and during the tournament - would give Carlsberg a differentiated position in a market where most sponsors look the same."
        recommendation="Partner with local football clubs or community programmes, not just the tournament. Make the community investment visible at the local level, not only in national marketing."
      />

      <MarketProfile flag="🇸🇪" market="Sweden" headline="ACCESS MEANS ENABLING LOCAL FOOTBALL PARTICIPATION"
        stat="79%" statLabel="identify football as important to national culture"
        signals={[{ label: "Participation culture", value: "VERY HIGH" }, { label: "Local support", value: "Top Driver" }, { label: "Women's football", value: "↑ Growing" }]}
        narrative="Sweden's football culture is built around participation. The sport is understood as something people do, not just watch and local clubs are central to community life in a way that top-tier sponsorship rarely reaches. In this context, brand scale matters less than local relevance. A brand that funds local facilities, supports women's football or creates pathways for local players tends to earn more trust than one that simply buys elite visibility."
        findings={[
          "Football participation rates in Sweden are among the highest in Europe, driven by a strong local club network",
          "Support for local clubs directionally outperforms national team sponsorship as a driver of brand approval",
          "Investment in women's football is viewed positively and perceived as a signal of genuine commitment to the sport",
          "The strongest brand opportunity appears to be enabling access at the local level, not amplifying visibility at the elite level",
        ]}
        opportunity="Sweden is a market where the opportunity appears to be in community depth, not broadcast reach. Carlsberg can build meaningful brand equity by funding local football access - with a smaller investment creating a stronger signal than a larger national campaign."
        recommendation="Fund local football infrastructure visibly. Partner with Swedish Football Association grassroots programmes and make the community impact measurable and storytellable."
      />

      <MarketProfile flag="🇮🇳" market="India" headline="ACCESS MEANS LOCAL RELEVANCE AT SCALE"
        stat="305M" statLabel="football audience - and growing"
        signals={[{ label: "Growth trajectory", value: "VERY HIGH" }, { label: "Youth audience", value: "Under 30" }, { label: "Platform", value: "Social-first" }]}
        narrative="India is structurally different from every other market in this report. It is a growth market for football - with a large, young, digitally native audience that is building its relationship with the sport in real time. What makes this market particularly important for Carlsberg is that the brands that invest early in local football culture are likely to define the category as the audience matures. EURO 2028 will drive interest, but it needs to land with local relevance to convert attention into affinity."
        findings={[
          "India's football audience is predominantly under 30, highly engaged on social platforms and growing rapidly",
          "ISL clubs are creating genuine local fan communities in major cities - a signal that local identity matters",
          "Language-specific content significantly outperforms English-language content in reach and engagement",
          "The strongest opportunity appears to be investment in local talent pathways and creator-led storytelling, not tournament broadcast visibility alone",
        ]}
        opportunity="India represents the highest long-term upside of any market in this study. The brands that invest in local football access and relevance ahead of EURO 2028 are likely to benefit most when the tournament drives a wave of football attention across the country."
        recommendation="Build an India-specific access programme that combines local-language content, creator partnerships, player access and investment in local football pathways. Do not treat India as a secondary European market."
      />

      <MarketProfile flag="🇨🇳" market="China" headline="ACCESS MEANS A BRIDGE BETWEEN DIGITAL FANDOM AND REAL EXPERIENCE"
        stat="289M" statLabel="football fans - the world's largest single fan base"
        signals={[{ label: "Digital fandom", value: "VERY HIGH" }, { label: "Player access", value: "Top Demand" }, { label: "Platform", value: "WeChat/Weibo" }]}
        narrative="China's football market is defined by scale and digital intensity. The audience is vast, deeply engaged with football's biggest players and moments, but largely experiencing the sport through screens and social platforms rather than live attendance. What this audience appears to value most is the feeling of access - closeness to players, exclusive content and moments that bridge the gap between following a sport digitally and experiencing it directly. This is where a brand with UEFA rights has a meaningful and distinctive advantage."
        findings={[
          "Player-led content appears to significantly outperform club or competition-led content on Chinese platforms",
          "Behind-the-scenes and exclusive access content is the category most associated with high brand value in this market",
          "WeChat and Weibo are the primary channels for football content consumption - platform-native formats significantly outperform repurposed Western content",
          "Physical fan moments, when made available, create strong social amplification in this market",
        ]}
        opportunity="China is the market where Carlsberg's UEFA EURO 2028 rights create the clearest premium. Player-access activation, platform-native content and exclusive behind-the-scenes moments can unlock a level of fan engagement that straightforward tournament advertising cannot reach."
        recommendation="Build a China-specific digital access programme around players, premium content and platform-native experiences on WeChat and Weibo. Treat this as a distinct brief, not an adaptation of the European campaign."
      />

      {/* ── Recommendations ── */}
      <ChapterBreak number="RECOMMENDATIONS" title="Five Actions for Carlsberg and Dentsu"
        description="Derived from Fanometrix fan research and cross-market intelligence findings." />
      <Recommendation number={1}
        headline="Create a visible grassroots commitment"
        body="Allocate a defined portion of EURO 2028 investment to grassroots football and community programmes, with delivery partners, market-level activation and measurable impact. Make this commitment public before the tournament, not during it." />
      <Divider />
      <Recommendation number={2}
        headline="Build access programmes, not prize mechanics"
        body="Use UEFA rights and football relationships to create experiences fans cannot buy for themselves: match access, player moments, behind-the-scenes content and local football experiences. These create memory. Discounts create transactions." />
      <Divider />
      <Recommendation number={3}
        headline="Localise the value exchange by market"
        body="Develop one global organising idea, but adapt the value delivered in each market. What works in Germany will not automatically work in India or China. The Access Pyramid provides the framework; local insight should inform the execution." />
      <Divider />
      <Recommendation number={4}
        headline="Use media, content and creators to make the contribution visible"
        body="Sponsorship, publisher partnerships, creator programmes and social content are not in competition with the contribution story - they are how the contribution story travels. Publisher audiences, football creators and fan communities are the channels through which Carlsberg's investment in access and grassroots football reaches the people it is designed to benefit." />
      <Divider />
      <Recommendation number={5}
        headline="Measure fan value alongside media delivery"
        body="Track whether the partnership improves fan perception, brand trust, access, participation and community impact - not just reach, impressions and awareness. The Football Collective can provide both the media delivery and the fan research infrastructure to measure what is actually changing. Define targets before the tournament begins." />

      <PullQuote
        quote="The brands that win in football will not only be the most visible. They will be the brands fans believe made football better."
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

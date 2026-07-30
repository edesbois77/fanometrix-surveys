"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";
import { APP_URL } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// FIFA Women's World Cup 2027 — Publisher Research Initiative landing page.
//
// A campaign page that lives inside /for-publishers and reuses that section's
// design language (navy/gold tokens, sticky navy header, footer, .pp-faq
// accordion styling, .scroll-fade-up entrance animations, .pp-ring/.pp-breathe
// decorative motion — all already defined in app/globals.css and all disabled
// under prefers-reduced-motion). What's new here is campaign-specific: a global
// (world-map) visual language, an interactive five-question survey preview, the
// benefit/step/FAQ content, and an embedded registration form that posts to the
// existing /api/access-requests endpoint.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Design tokens (shared with the rest of the marketing site) ──────────────
const NAVY     = "#0B1929";
const GOLD     = "#D7B87A";
const GOLD_INK = "#8A6D2F";
const INK      = "#181B20";
const GREY     = "#404752";
const MUTED    = "#68707C";
const FAINT    = "#9CA3AF";
const OFFWHITE = "#FAF9F6";
const BG_SOFT  = "#F5F6F8";
const WASH     = "#FBF3E1";
const BORDER   = "#E5E7EB";
const BORDER_2 = "#EEF0F3"; // faint hairline for section seams

const REGISTER_HREF = "#register";
// Single source of truth for the registration deadline — update here only.
const REGISTRATION_DEADLINE = "10 August 2026";

// ─── Iconography — one coherent thin-line family (matches PublisherTemplate) ──
const ICONS: Record<string, React.ReactNode> = {
  insight:    <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM9.6 9a2.5 2.5 0 014.9.6c0 1.7-2.5 2-2.5 3.9M12 17h.01" />,
  zeroparty:  <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" />,
  partner:    <path d="M12 3a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0M18 6a2 2 0 100 4 2 2 0 000-4z" />,
  early:      <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2" />,
  pr:         <path d="M4 9v6h4l6 4V5L8 9H4zm13 0a4 4 0 010 6" />,
  industry:   <path d="M5 20V10m5 10V5m5 15v-7m5 7V8" />,
  join:       <path d="M12 5v14M5 12h14" />,
  package:    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v9m0 0l8-4.5M12 12L4 7.5" />,
  monitor:    <path d="M4 13a8 8 0 0116 0M12 13l4-3M9 20h6" />,
  results:    <path d="M7 3h7l4 4v14H7V3zm7 0v4h4M9.5 12h5M9.5 15.5h5" />,
  globe:      <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3.5 12h17M12 3c2.5 2.6 3.5 6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-6-3.5-9s1-6.4 3.5-9z" />,
  shield:     <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" />,
};

function Icon({ name, color = GOLD_INK, size = 24 }: { name: string; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

function Check({ color = GOLD, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// Editorial section kicker — a short gold hairline paired with a tightly tracked
// label. This signature repeats above every section heading and is the single
// strongest "flagship campaign" cue on the page.
function Eyebrow({ children, onDark, center }: { children: React.ReactNode; onDark?: boolean; center?: boolean }) {
  const gold = onDark ? GOLD : GOLD_INK;
  const line = onDark ? "rgba(215,184,122,0.7)" : "rgba(138,109,47,0.5)";
  return (
    <div className={`scroll-fade-up mb-6 flex items-center gap-3.5 ${center ? "justify-center" : ""}`}>
      <span aria-hidden className="h-px w-8 shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${line})` }} />
      <span className="font-semibold uppercase" style={{ fontSize: 12, letterSpacing: "0.26em", color: gold }}>{children}</span>
      {center && <span aria-hidden className="h-px w-8 shrink-0" style={{ background: `linear-gradient(270deg, transparent, ${line})` }} />}
    </div>
  );
}

// Primary/secondary CTA — an anchor that scrolls to the registration form.
// Native smooth scrolling comes from `html { scroll-behavior: smooth }` in
// globals.css (already reduced-motion aware). Pill shape + a soft gold halo give
// the primary action flagship prominence; the arrow nudges on hover.
function JoinCta({ variant = "primary", onDark, withArrow, children = "Join the Initiative" }: { variant?: "primary" | "secondary"; onDark?: boolean; withArrow?: boolean; children?: React.ReactNode }) {
  const primary = variant === "primary";
  const base = "group inline-flex items-center justify-center gap-2.5 text-[15px] font-bold px-8 py-4 rounded-full border-2 transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  const accent = primary
    ? "shadow-[0_12px_34px_-10px_rgba(215,184,122,0.6)] hover:shadow-[0_18px_44px_-10px_rgba(215,184,122,0.78)]"
    : "hover:opacity-90";
  const style = primary
    ? { background: GOLD, color: NAVY, borderColor: GOLD, letterSpacing: "0.01em" }
    : onDark
      ? { background: "rgba(255,255,255,0.04)", color: "#fff", borderColor: "rgba(255,255,255,0.35)", letterSpacing: "0.01em" }
      : { background: "#fff", color: NAVY, borderColor: BORDER, letterSpacing: "0.01em" };
  return (
    <a href={REGISTER_HREF} className={`${base} ${accent}`} style={{ ...style, ["--tw-ring-color" as string]: GOLD }}>
      {children}
      {withArrow && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </a>
  );
}

// ─── World-map motif — an abstract graticule globe with reach nodes ───────────
// Elegant, data-free and self-contained (no external asset). Reads clearly as
// "global" without stock photography. The dashed ring and breathing centre use
// the shared .pp-ring / .pp-breathe classes, so both stop under reduced-motion.
function WorldGlobe({ className = "" }: { className?: string }) {
  const C = 200, R = 150;
  // Longitude arcs (vary the horizontal squash to suggest a rotating sphere).
  const meridians = [0.28, 0.6, 0.86, 1];
  // Latitude lines as horizontal chords.
  const parallels = [-0.72, -0.4, 0, 0.4, 0.72];
  // Scattered reach nodes across the sphere.
  const nodes = [
    { x: 150, y: 110, big: true }, { x: 268, y: 138 }, { x: 300, y: 214 },
    { x: 232, y: 286 }, { x: 128, y: 268 }, { x: 96, y: 190 }, { x: 210, y: 176, big: true },
  ];
  return (
    <svg viewBox="0 0 400 400" className={`w-full h-auto ${className}`} role="img" aria-label="A stylised globe representing football publishers and fans across the world.">
      {/* outer reach ring */}
      <circle cx={C} cy={C} r={R + 24} fill="none" stroke="rgba(215,184,122,0.14)" strokeWidth="1" />
      <circle cx={C} cy={C} r={R + 24} fill="none" stroke={GOLD} strokeOpacity="0.3" strokeWidth="1" className="pp-ring" />
      {/* sphere */}
      <circle cx={C} cy={C} r={R} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {/* parallels */}
      {parallels.map((p, i) => {
        const y = C + R * p;
        const w = R * Math.sqrt(Math.max(0, 1 - p * p));
        return <line key={`p${i}`} x1={C - w} y1={y} x2={C + w} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />;
      })}
      {/* meridians */}
      {meridians.map((m, i) => (
        <ellipse key={`m${i}`} cx={C} cy={C} rx={R * m} ry={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      ))}
      {/* connection lines between nodes and a soft centre */}
      {nodes.map((n, i) => (
        <line key={`l${i}`} x1={C} y1={C} x2={n.x} y2={n.y} stroke={n.big ? GOLD : "rgba(215,184,122,0.28)"} strokeOpacity={n.big ? 0.5 : 1} strokeWidth={n.big ? 1.4 : 0.8} />
      ))}
      {/* reach nodes */}
      {nodes.map((n, i) => (
        <g key={`n${i}`}>
          {n.big && <circle cx={n.x} cy={n.y} r="12" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.4" className="pp-breathe" />}
          <circle cx={n.x} cy={n.y} r={n.big ? 6 : 3.5} fill={n.big ? GOLD : "rgba(215,184,122,0.55)"} />
        </g>
      ))}
    </svg>
  );
}

// A faint flat dot-grid used behind dark sections — a geographic texture that
// stays subtle and performant (pure CSS gradients, no image).
function GeoTexture({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{
      opacity,
      backgroundImage:
        "radial-gradient(circle, rgba(215,184,122,0.18) 1px, transparent 1.4px), radial-gradient(ellipse 70% 55% at 50% 0%, rgba(215,184,122,0.12) 0%, transparent 60%)",
      backgroundSize: "26px 26px, auto",
    }} />
  );
}

// ─── Premium survey mock chrome (matches PublisherTemplate visuals) ───────────
const MOCK_SHADOW = "0 28px 56px -18px rgba(11,25,41,0.30), 0 10px 24px -12px rgba(11,25,41,0.20)";

function BrowserChrome({ label }: { label: string }) {
  return (
    <div className="relative flex items-center px-4 py-3" style={{ background: "linear-gradient(180deg, #16253A, #101F32)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span className="flex gap-1.5" aria-hidden>
        {["#E5675A", "#E5B95A", "#5AB96B"].map(c => <span key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.75 }} />)}
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      </span>
    </div>
  );
}

// ─── The five-question survey flow (shared by desktop + mobile previews) ──────
// Two audience-profile questions followed by three research questions. The
// research questions are clearly-marked SAMPLES; the final questions are not yet
// confirmed.
type Q = { label: string; sample?: boolean; question: string; options: string[] };
const SURVEY: Q[] = [
  { label: "Profile", question: "Which best describes you?", options: ["Woman", "Man", "Non-binary / another gender identity", "Prefer not to say"] },
  { label: "Profile", question: "How old are you?", options: ["Under 18", "18–34", "35–54", "55+", "Prefer not to say"] },
  { label: "Research question 1", sample: true, question: "How likely are you to follow the FIFA Women's World Cup 2027?", options: ["Very likely", "Fairly likely", "Not sure yet", "Unlikely"] },
  { label: "Research question 2", sample: true, question: "How do you usually follow women's football?", options: ["Live matches", "Highlights & clips", "News & social", "I'm just getting into it"] },
  { label: "Research question 3", sample: true, question: "Which best describes your interest in women's football?", options: ["Dedicated follower", "Casual viewer", "Curious newcomer", "Prefer not to say"] },
];

// Interactive mobile survey — click through the real experience, invitation to
// thank-you. Illustrative only; no data is recorded. Manual advance keeps it
// comfortable under prefers-reduced-motion.
function MobileSurveyPreview() {
  const [screen, setScreen] = useState<"invite" | number | "done">("invite");
  const [picked, setPicked] = useState<number | null>(null);

  function choose(i: number, optIndex: number) {
    if (picked !== null) return;
    setPicked(optIndex);
    setTimeout(() => {
      setPicked(null);
      setScreen(i === SURVEY.length - 1 ? "done" : i + 1);
    }, 360);
  }
  function reset() { setPicked(null); setScreen("invite"); }

  const isQ = typeof screen === "number";
  const qi = isQ ? (screen as number) : 0;
  const q = SURVEY[qi];

  return (
    <div className="w-full max-w-[320px] mx-auto">
      {/* phone frame */}
      <div className="rounded-[34px] p-2.5" style={{ background: "linear-gradient(160deg, #1c2b40, #0d1a2b)", boxShadow: MOCK_SHADOW }}>
        <div className="rounded-[26px] overflow-hidden" style={{ background: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* creative header */}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY }}>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.72)" }}>Fan research</span>
            </span>
            <span aria-hidden className="text-[15px] leading-none" style={{ color: "rgba(255,255,255,0.4)" }}>×</span>
          </div>

          <div className="p-5 min-h-[300px] flex flex-col">
            {screen === "invite" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="relative mb-5" style={{ width: 70, height: 70 }}>
                  <svg width="70" height="70" viewBox="0 0 74 74" aria-hidden>
                    <circle cx="37" cy="37" r="33" fill="none" stroke={BORDER} strokeWidth="4" />
                    <circle cx="37" cy="37" r="33" fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeDasharray="207" strokeDashoffset="60" transform="rotate(-90 37 37)" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-bold" style={{ fontSize: 17, color: NAVY }}>30s</span>
                </div>
                <p className="font-bold mb-1.5" style={{ fontSize: 17, color: INK }}>A quick question for football fans</p>
                <p className="mb-6" style={{ fontSize: 13, color: GREY }}>Anonymous · five short questions</p>
                <button onClick={() => setScreen(0)} className="w-full rounded-xl py-3 font-bold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ background: GOLD, color: NAVY, fontSize: 15, ["--tw-ring-color" as string]: GOLD }}>
                  Start survey
                </button>
              </div>
            )}

            {isQ && (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD_INK }}>Question {qi + 1} of {SURVEY.length}</span>
                    {q.sample && <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded" style={{ background: WASH, color: GOLD_INK }}>Sample</span>}
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((qi + 1) / SURVEY.length) * 100}%`, background: GOLD }} />
                  </div>
                </div>
                <p className="font-bold mb-4" style={{ fontSize: 15.5, color: INK, lineHeight: 1.35 }}>{q.question}</p>
                <div className="space-y-2 mt-auto">
                  {q.options.map((opt, oi) => {
                    const sel = picked === oi;
                    return (
                      <button key={opt} onClick={() => choose(qi, oi)} className="w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors duration-150" style={{ border: `1.5px solid ${sel ? GOLD : BORDER}`, background: sel ? WASH : "#fff" }}>
                        <span className="h-4 w-4 rounded-full shrink-0" style={{ border: `1.5px solid ${sel ? GOLD_INK : "#C7CCD4"}`, background: sel ? GOLD : "transparent" }} />
                        <span style={{ fontSize: 13.5, color: INK }}>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {screen === "done" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full mb-4" style={{ background: WASH }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <p className="font-bold mb-1.5" style={{ fontSize: 17, color: INK }}>Thank you</p>
                <p className="mb-6" style={{ fontSize: 13, color: GREY, maxWidth: 220 }}>Your response helps build a global picture of football fans.</p>
                <button onClick={reset} className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD_INK }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12a8 8 0 018-8 8 8 0 016.9 4M20 4v4h-4" /></svg>
                  Replay preview
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px]" style={{ color: FAINT }}>Interactive preview · click through the survey</p>
    </div>
  );
}

// Desktop preview — the full five-question flow presented as an at-a-glance
// index, with the two profile questions showing their answer options.
function DesktopSurveyPreview() {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "#fff", boxShadow: MOCK_SHADOW }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] z-10" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <BrowserChrome label="Fan survey · 300 × 250" />
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD_INK }}>Five quick questions</p>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded" style={{ background: WASH, color: GOLD_INK }}>~30 seconds</span>
        </div>
        <ol className="space-y-3.5">
          {SURVEY.map((q, i) => (
            <li key={i} className="flex gap-4 rounded-xl px-4 py-4" style={{ border: `1px solid ${BORDER}`, background: i < 2 ? "#fff" : BG_SOFT }}>
              <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold fx-tabular-nums" style={{ background: NAVY, color: GOLD }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>{q.label}</span>
                  {q.sample && <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded" style={{ background: WASH, color: GOLD_INK }}>Sample</span>}
                </div>
                <p className="font-semibold mb-2.5" style={{ fontSize: 15, color: INK, lineHeight: 1.35 }}>{q.question}</p>
                {i < 2 ? (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <span key={opt} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ border: `1px solid ${BORDER}`, color: GREY, background: "#fff" }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ border: `1.5px solid #C7CCD4` }} />
                        {opt}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px]" style={{ color: MUTED }}>Multiple-choice · final wording to be confirmed</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── FAQ (native <details>, reuses the .pp-faq styles from globals.css) ───────
const FAQS: { q: string; a: React.ReactNode }[] = [
  { q: "How much work is involved?", a: <>Very little. We&apos;ll provide everything you need, including the survey questions, creative assets, market-specific hosted iframes and an implementation guide. Simply schedule the campaign through your ad server as you would a standard 300 × 250 display campaign.</> },
  { q: "How many questions will my audience answer?", a: <>The survey consists of five quick questions: two audience profile questions followed by three research questions. It has been designed to minimise disruption while collecting meaningful audience insight.</> },
  { q: "Is there a cost to participate?", a: <>No. Participation is free.</> },
  { q: "What do we receive in return?", a: <>You&apos;ll receive your own survey results, valuable zero-party data, early access to the completed report and recognition as an Official Research Partner.</> },
  { q: "Who owns the data?", a: (
    <div className="space-y-4">
      <p>Publishers retain full access to the survey responses collected through their own inventory and may use those anonymised results for their own editorial, commercial and audience insight purposes.</p>
      <p>Fanometrix is granted a perpetual right to use anonymised survey responses for research, reporting, benchmarking and commercial purposes, including future research initiatives and aggregated industry reports.</p>
    </div>
  ) },
  { q: "How is the research used?", a: (
    <div className="space-y-4">
      <p>Responses will be anonymised and combined with data collected from participating publishers to produce the final industry report ahead of the FIFA Women&apos;s World Cup 2027.</p>
      <p>Anonymised responses may also be used by Fanometrix in future research, reporting, benchmarking and commercial analysis.</p>
    </div>
  ) },
  { q: "When will the survey run?", a: <>Participating publishers will receive a timetable outlining implementation, fieldwork and publication dates once the initiative begins.</> },
  { q: "What support is available?", a: <>The Fanometrix team will provide implementation guidance, technical support and live reporting throughout the campaign.</> },
  { q: "Which markets can participate?", a: <>The initiative is open to football publishers worldwide. Surveys can be delivered across multiple markets using market-specific hosted iframes.</> },
];

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="pp-faq border-b" style={{ borderColor: BORDER }}>
      <summary className="flex items-start justify-between gap-6 cursor-pointer py-6 sm:py-7">
        <span className="font-semibold pr-2" style={{ fontSize: "clamp(17px,1.7vw,20px)", color: INK, lineHeight: 1.4, letterSpacing: "-0.01em" }}>{q}</span>
        <span className="pp-faq-icon mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M7 1v12M1 7h12" /></svg>
        </span>
      </summary>
      <div className="pp-faq-panel pb-8 sm:pr-14 leading-[1.7]" style={{ maxWidth: 780, fontSize: 16, color: GREY }}>{children}</div>
    </details>
  );
}

// ─── Sticky "Join the Initiative" button ──────────────────────────────────────
// Appears once the hero has scrolled out of view; hidden while the registration
// form itself is on screen so it never overlaps its own target.
function StickyJoin() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("wwc-hero");
    const form = document.getElementById("register");
    if (!("IntersectionObserver" in window) || !hero) return;
    let heroVisible = true, formVisible = false;
    const update = () => setShow(!heroVisible && !formVisible);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.target === hero) heroVisible = e.isIntersecting;
        if (e.target === form) formVisible = e.isIntersecting;
      });
      update();
    }, { threshold: 0 });
    obs.observe(hero);
    if (form) obs.observe(form);
    return () => obs.disconnect();
  }, []);

  return (
    <a
      href={REGISTER_HREF}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-bold shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: GOLD, color: NAVY,
        boxShadow: "0 12px 30px -8px rgba(11,25,41,0.45)",
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(16px)",
        pointerEvents: show ? "auto" : "none",
        ["--tw-ring-color" as string]: GOLD,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      Join the Initiative
    </a>
  );
}

// ─── Registration form ────────────────────────────────────────────────────────
// Posts to the existing public /api/access-requests endpoint (same inbox +
// Supabase storage as every other website enquiry). Campaign-specific fields
// are folded into the mapped payload so no schema/migration change is required.
const FIELD_CLASS = "w-full px-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:border-[#D7B87A]";
const fieldStyle = { borderColor: BORDER, color: INK, background: "#fff" } as const;

function Label({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: GREY }}>
      {children}{optional && <span className="ml-1 normal-case tracking-normal font-normal" style={{ color: FAINT }}>(optional)</span>}
    </label>
  );
}

function RegistrationForm() {
  const [form, setForm] = useState({
    publisher: "", website: "", contactName: "", jobTitle: "",
    email: "", markets: "", audience: "", comments: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation (the endpoint validates again server-side).
    if (!form.publisher.trim() || !form.website.trim() || !form.contactName.trim() || !form.jobTitle.trim() || !form.email.trim() || !form.markets.trim()) {
      setError("Please complete all required fields.");
      setStatus("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    setStatus("submitting");

    // Map the campaign registration onto the shared access-request schema. The
    // notification email surfaces name / email / organisation / role / message,
    // so every campaign-specific detail is composed into `message` to guarantee
    // it reaches the enquiries inbox.
    const message = [
      "FIFA Women's World Cup 2027 — Publisher Research Initiative registration",
      "",
      `Website: ${form.website.trim()}`,
      `Job title: ${form.jobTitle.trim()}`,
      `Markets covered: ${form.markets.trim()}`,
      form.audience.trim() ? `Estimated monthly audience: ${form.audience.trim()}` : "",
      form.comments.trim() ? `Additional comments: ${form.comments.trim()}` : "",
    ].filter(Boolean).join("\n");

    const markets = form.markets.split(/[,;/]+/).map(m => m.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.contactName.trim(),
          email: form.email.trim(),
          organisation: form.publisher.trim(),
          role: "Media Partner / Publisher",
          message,
          primary_markets: markets,
          audience_size: form.audience.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus("success");
      else { setError(json.error ?? "Something went wrong. Please try again."); setStatus("error"); }
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl p-10 sm:p-12 text-center" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: WASH }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <h3 className="font-bold mb-3" style={{ fontSize: 24, color: INK, letterSpacing: "-0.01em" }}>Thank you for registering your interest.</h3>
        <p className="mx-auto leading-[1.7]" style={{ fontSize: 16, color: GREY, maxWidth: 460 }}>
          We&apos;ve received your details and will be in touch shortly with more information about the initiative and next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl p-7 sm:p-9 space-y-5" style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 22px 48px -24px rgba(11,25,41,0.28)" }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="wwc-publisher">Publisher</Label>
          <input id="wwc-publisher" type="text" required autoComplete="organization" value={form.publisher} onChange={e => set("publisher", e.target.value)} placeholder="Your publication or company" className={FIELD_CLASS} style={fieldStyle} />
        </div>
        <div>
          <Label htmlFor="wwc-website">Website</Label>
          <input id="wwc-website" type="text" inputMode="url" required autoComplete="url" value={form.website} onChange={e => set("website", e.target.value)} placeholder="example.com" className={FIELD_CLASS} style={fieldStyle} />
        </div>
        <div>
          <Label htmlFor="wwc-contact">Contact Name</Label>
          <input id="wwc-contact" type="text" required autoComplete="name" value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Jane Smith" className={FIELD_CLASS} style={fieldStyle} />
        </div>
        <div>
          <Label htmlFor="wwc-title">Job Title</Label>
          <input id="wwc-title" type="text" required autoComplete="organization-title" value={form.jobTitle} onChange={e => set("jobTitle", e.target.value)} placeholder="Head of Audience" className={FIELD_CLASS} style={fieldStyle} />
        </div>
        <div>
          <Label htmlFor="wwc-email">Email</Label>
          <input id="wwc-email" type="email" required autoComplete="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@example.com" className={FIELD_CLASS} style={fieldStyle} />
        </div>
        <div>
          <Label htmlFor="wwc-markets">Markets Covered</Label>
          <input id="wwc-markets" type="text" required value={form.markets} onChange={e => set("markets", e.target.value)} placeholder="e.g. UK, US, Brazil" className={FIELD_CLASS} style={fieldStyle} />
        </div>
      </div>

      <div>
        <Label htmlFor="wwc-audience" optional>Estimated Monthly Audience</Label>
        <input id="wwc-audience" type="text" value={form.audience} onChange={e => set("audience", e.target.value)} placeholder="e.g. 2M monthly users" className={FIELD_CLASS} style={fieldStyle} />
      </div>

      <div>
        <Label htmlFor="wwc-comments" optional>Additional Comments</Label>
        <textarea id="wwc-comments" rows={3} value={form.comments} onChange={e => set("comments", e.target.value)} placeholder="Anything you&apos;d like us to know about your audience or markets…" className={`${FIELD_CLASS} resize-none`} style={fieldStyle} />
      </div>

      {error && (
        <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ color: "#B42318", background: "#FEF3F2", border: "1px solid #FEE4E2" }}>{error}</p>
      )}

      <button type="submit" disabled={status === "submitting"} className="w-full py-4 rounded-xl text-[15px] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-12px_rgba(11,25,41,0.55)] disabled:opacity-60 disabled:translate-y-0 disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ background: NAVY, color: GOLD, ["--tw-ring-color" as string]: GOLD }}>
        {status === "submitting" ? "Sending…" : "Join the Initiative"}
      </button>

      {/* Consent / privacy notice */}
      <p className="text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
        By registering, you agree that survey responses will be anonymised, and that your registration details will be used to manage your participation. Anonymised survey responses may be aggregated with responses from other publishers, and Fanometrix may use anonymised responses for current and future research, reporting, benchmarking and commercial analysis. See our{" "}
        <Link href="/privacy" className="font-semibold underline" style={{ color: GOLD_INK }}>Privacy Policy</Link>.
      </p>
    </form>
  );
}

// ─── Content data ─────────────────────────────────────────────────────────────
const BENEFITS = [
  { icon: "insight",  title: "Exclusive Audience Insights", body: "Gain unique insight into your audience's attitudes, interests and behaviours through the responses collected from your own readers." },
  { icon: "zeroparty", title: "Zero-Party Data", body: "Collect valuable zero-party data directly from your audience and use the anonymised results to inform your own editorial, commercial and audience strategies." },
  { icon: "partner",  title: "Official Research Partner", body: "Be recognised as an Official Research Partner in the initiative and final report." },
  { icon: "early",    title: "Early Access", body: "Receive the completed report before public release." },
  { icon: "pr",       title: "PR & Promotion", body: "Participating publishers may be featured across report launches, press activity and promotional content relating to the initiative." },
  { icon: "industry", title: "Contribute to Industry Understanding", body: "Play an active role in creating one of the first global studies of football fans ahead of the FIFA Women's World Cup 2027, helping shape how brands and the wider industry understand the audience." },
];

const STEPS = [
  {
    n: "1", icon: "join", title: "Join the Initiative",
    body: <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>Complete the short registration form.</p>,
  },
  {
    n: "2", icon: "package", title: "Receive Your Survey Package",
    body: (
      <div className="space-y-3">
        <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>You&apos;ll receive:</p>
        <ul className="space-y-1.5">
          {["survey questions", "creative assets", "hosted iframes for each market", "an implementation guide"].map(x => (
            <li key={x} className="flex items-center gap-2.5" style={{ fontSize: 14.5, color: GREY }}><Check color={GOLD_INK} size={15} /> {x}</li>
          ))}
        </ul>
        <p className="leading-[1.6] rounded-lg px-3.5 py-3 mt-1" style={{ fontSize: 14, color: GOLD_INK, background: WASH }}>
          Simply schedule the creative through your ad server as you would a standard 300 × 250 campaign. No bespoke development or major engineering work is required.
        </p>
      </div>
    ),
  },
  {
    n: "3", icon: "monitor", title: "Launch & Monitor",
    body: (
      <div className="space-y-3">
        <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>Run the survey and access a live reporting dashboard. Monitor in real time:</p>
        <ul className="space-y-1.5">
          {["impressions", "responses", "completion rate"].map(x => (
            <li key={x} className="flex items-center gap-2.5" style={{ fontSize: 14.5, color: GREY }}><Check color={GOLD_INK} size={15} /> {x}</li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    n: "4", icon: "results", title: "Receive Your Results",
    body: <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>Access your own survey results, download the completed global report before public release, and use the findings to support your editorial, commercial and audience strategies. You&apos;ll also be recognised as an Official Research Partner.</p>,
  },
];

const CAPABILITIES = ["Audience Research", "Zero-Party Data", "Sports Audience Insight", "Publisher Partnerships", "Privacy-Conscious Research"];

// ─────────────────────────────────────────────────────────────────────────────
export function WwcCampaign() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: OFFWHITE, color: INK }}>
      {/* ── Header (solid navy, matches the /for-publishers section) ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-10" style={{ background: NAVY }}>
        <div className="max-w-[1240px] mx-auto flex items-center justify-between py-4 sm:py-5">
          <Link href="/for-publishers" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Fanometrix_Logo.png" alt="Fanometrix" className="h-4 sm:h-[21px] w-auto shrink-0" style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            <span className="hidden sm:flex items-center gap-2.5 shrink-0 pl-2.5 ml-1 border-l border-white/15">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap" style={{ color: GOLD }}>Women&apos;s World Cup 2027</span>
            </span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href={REGISTER_HREF} className="hidden sm:inline-flex text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-8px_rgba(215,184,122,0.7)]" style={{ background: GOLD, color: NAVY }}>
              Join the Initiative
            </a>
            <Link href={`${APP_URL}/login`} className="shrink-0 whitespace-nowrap text-sm font-semibold text-white/90 transition-opacity duration-150 hover:opacity-70">Sign In</Link>
          </div>
        </div>
      </header>

      <StickyJoin />

      <main className="flex-1">
        {/* ═══════════════ 1 — Hero ═══════════════ */}
        <section id="wwc-hero" className="relative overflow-hidden px-5 sm:px-10 pt-[clamp(64px,8vw,112px)] pb-[clamp(76px,9vw,132px)]" style={{ background: NAVY }}>
          <GeoTexture opacity={0.55} />
          <div className="relative max-w-[1240px] mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-10 items-center">
            <div>
              <p className="hero-fade-up mb-7 inline-flex items-center gap-3.5 font-semibold uppercase" style={{ fontSize: 12.5, letterSpacing: "0.26em", color: GOLD }}>
                <span aria-hidden className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.7))" }} />
                A Global Research Initiative
              </p>
              <h1 className="hero-fade-up font-bold tracking-tight mb-8 text-white text-balance" style={{ fontSize: "clamp(36px, 5.8vw, 66px)", lineHeight: 1.04, letterSpacing: "-0.032em", animationDelay: "0.08s" }}>
                Help Build the World&apos;s Largest Women&apos;s World Cup Fan Report
              </h1>
              <p className="hero-fade-up leading-[1.7] mb-10" style={{ animationDelay: "0.2s", fontSize: "clamp(17px, 1.7vw, 20px)", color: "rgba(255,255,255,0.82)", maxWidth: 600 }}>
                Join football publishers worldwide in creating the industry&apos;s most comprehensive fan insight report ahead of the FIFA Women&apos;s World Cup 2027.
              </p>
              <div className="hero-fade-up flex flex-wrap items-center gap-x-5 gap-y-4" style={{ animationDelay: "0.32s" }}>
                <JoinCta variant="primary" withArrow />
                <a href="#how-it-works" className="group inline-flex items-center gap-2 text-[15px] font-semibold text-white/85 transition-colors hover:text-white">
                  See how it works
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
              </div>
              <p className="hero-fade-up mt-9 inline-flex items-center gap-2.5 rounded-full px-4 py-2" style={{ animationDelay: "0.4s", background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.28)" }}>
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="pp-breathe absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: GOLD }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: GOLD }} />
                </span>
                <span className="text-[13.5px] font-semibold" style={{ color: GOLD }}>Publisher registrations close {REGISTRATION_DEADLINE}.</span>
              </p>
            </div>

            {/* Research-led visual: survey preview lifted on a soft gold halo,
                layered over the world globe for depth. */}
            <div className="hero-fade-up relative" style={{ animationDelay: "0.24s" }}>
              <div aria-hidden className="pointer-events-none absolute inset-0 -m-10" style={{ background: "radial-gradient(ellipse 58% 52% at 62% 46%, rgba(215,184,122,0.22), transparent 70%)" }} />
              <WorldGlobe className="absolute inset-0 opacity-70" />
              <div className="relative flex justify-center lg:justify-end">
                <MobileSurveyPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ 2 — Invitation ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(80px,10vw,132px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[940px] mx-auto text-center">
            <Eyebrow center>The Invitation</Eyebrow>
            <p className="scroll-fade-up font-medium tracking-tight text-balance" style={{ fontSize: "clamp(23px,3vw,34px)", lineHeight: 1.42, color: INK, letterSpacing: "-0.015em", transitionDelay: "0.05s" }}>
              Join leading football publishers from around the world in creating the most comprehensive fan insight report ahead of the FIFA Women&apos;s World Cup 2027. By contributing a simple three-question fan poll, you&apos;ll gain exclusive audience insight, compare your audience with the aggregated global dataset, and be recognised as an <span className="font-semibold" style={{ color: GOLD_INK }}>Official Research Partner</span> in an initiative designed to help brands better understand football audiences.
            </p>
            <span aria-hidden className="scroll-fade-up mx-auto mt-10 block h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, transitionDelay: "0.1s" }} />
          </div>
        </section>

        {/* ═══════════════ 3 — See What You'll Run ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: BG_SOFT, borderTop: `1px solid ${BORDER_2}` }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(48px,6vw,72px)] max-w-[720px]">
              <Eyebrow>The Survey</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.08, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                See What You&apos;ll Run
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Five quick questions, two audience profile questions followed by three research questions, designed to be lightweight, fast and easy for your readers to complete.
              </p>
            </div>
            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-12 items-start">
              <div className="scroll-fade-up" style={{ transitionDelay: "0.06s" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: GOLD_INK }}>Desktop preview</p>
                <DesktopSurveyPreview />
              </div>
              <div className="scroll-fade-up" style={{ transitionDelay: "0.12s" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: GOLD_INK }}>Mobile preview</p>
                <MobileSurveyPreview />
              </div>
            </div>
            <p className="scroll-fade-up mt-8 text-[13px]" style={{ color: MUTED }}>Illustrative preview. Research questions shown are samples; the final research questions are not yet confirmed.</p>
          </div>
        </section>

        {/* ═══════════════ 4 — Why This Matters ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: NAVY }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.28), transparent)" }} />
          <GeoTexture opacity={0.4} />
          <div className="relative max-w-[1080px] mx-auto">
            <div className="text-center mb-[clamp(48px,6vw,76px)]">
              <Eyebrow onDark center>Why This Matters</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-white mx-auto text-balance" style={{ fontSize: "clamp(29px,4.2vw,48px)", lineHeight: 1.1, letterSpacing: "-0.025em", maxWidth: 820, transitionDelay: "0.05s" }}>
                A landmark audience, and a gap worth closing
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-14 gap-y-0 sm:border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              {[
                "The FIFA Women's World Cup 2027 represents a major global audience and a significant commercial opportunity for publishers, brands and rights holders alike.",
                "Independent global fan insight into this audience remains limited. This initiative is intended to help close that gap through collaborative research.",
                "The findings are designed to benefit publishers, brands, agencies and the wider football industry, not any single participant.",
                "Together, the research will help the industry better understand audience attitudes, interests and behaviours ahead of the tournament.",
              ].map((t, i) => (
                <div key={i} className="scroll-fade-up flex gap-5 py-8 border-b" style={{ borderColor: "rgba(255,255,255,0.1)", transitionDelay: `${0.06 * i}s` }}>
                  <span className="mt-0.5 shrink-0 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.22)" }}><Icon name={["globe", "insight", "industry", "partner"][i]} color={GOLD} size={20} /></span>
                  <p className="leading-[1.65]" style={{ fontSize: 17, color: "rgba(255,255,255,0.82)" }}>{t}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ 5 — What You'll Receive ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(48px,6vw,72px)] max-w-[720px]">
              <Eyebrow>The Benefits</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.08, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                What You&apos;ll Receive
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {BENEFITS.map((b, i) => (
                <div key={b.title} className="scroll-fade-up group relative overflow-hidden rounded-2xl border bg-white p-8 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_-16px_rgba(16,24,40,0.16)]" style={{ borderColor: BORDER, transitionDelay: `${0.05 * i}s` }}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_INK})` }} />
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl mb-5 transition-colors duration-300" style={{ background: WASH }}><Icon name={b.icon} /></span>
                  <h3 className="font-bold mb-2.5" style={{ fontSize: 18, color: INK, letterSpacing: "-0.01em" }}>{b.title}</h3>
                  <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ 6 — How It Works ═══════════════ */}
        <section id="how-it-works" className="scroll-mt-20 px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: BG_SOFT, borderTop: `1px solid ${BORDER_2}` }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(48px,6vw,72px)] max-w-[720px]">
              <Eyebrow>The Process</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.08, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                How It Works
              </h2>
              <p className="scroll-fade-up leading-[1.7] mt-5" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Four straightforward steps, from registration to results. No bespoke development or major engineering work is required.
              </p>
            </div>
            <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-stretch">
              {STEPS.map((s, i) => (
                <li key={s.n} className="scroll-fade-up group relative flex flex-col rounded-2xl bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_-16px_rgba(16,24,40,0.16)]" style={{ border: `1px solid ${BORDER}`, transitionDelay: `${0.06 * i}s` }}>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold fx-tabular-nums" style={{ background: i === STEPS.length - 1 ? GOLD : NAVY, color: i === STEPS.length - 1 ? NAVY : GOLD }}>{s.n}</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: WASH }}><Icon name={s.icon} size={18} /></span>
                  </div>
                  <h3 className="font-bold mb-3" style={{ fontSize: 18, color: INK, letterSpacing: "-0.01em" }}>{s.title}</h3>
                  {s.body}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ═══════════════ 7 — FAQ ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[920px] mx-auto">
            <div className="text-center mb-[clamp(40px,5vw,64px)]">
              <Eyebrow center>Questions</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mx-auto text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.08, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                Frequently Asked Questions
              </h2>
            </div>
            <div className="scroll-fade-up border-t" style={{ borderColor: BORDER, transitionDelay: "0.05s" }}>
              {FAQS.map(f => <FaqItem key={f.q} q={f.q}>{f.a}</FaqItem>)}
            </div>
          </div>
        </section>

        {/* ═══════════════ 8 — About Fanometrix ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: BG_SOFT, borderTop: `1px solid ${BORDER_2}` }}>
          <div className="max-w-[1080px] mx-auto">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-center">
              <div className="scroll-fade-up relative mx-auto w-full max-w-[360px]">
                {/* globe on a soft navy pedestal, lifted with a gold halo */}
                <div className="relative rounded-3xl p-9 overflow-hidden" style={{ background: NAVY, boxShadow: "0 32px 60px -24px rgba(11,25,41,0.4)" }}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.4), transparent)" }} />
                  <GeoTexture opacity={0.5} />
                  <div className="relative"><WorldGlobe /></div>
                </div>
              </div>
              <div>
                <Eyebrow>About Fanometrix</Eyebrow>
                <div className="scroll-fade-up space-y-5 mb-8" style={{ transitionDelay: "0.05s" }}>
                  <p className="leading-[1.7]" style={{ fontSize: 18, color: GREY }}>
                    Fanometrix helps publishers, brands and rights holders better understand sports audiences through audience research, zero-party data and fan insight.
                  </p>
                  <p className="leading-[1.7]" style={{ fontSize: 18, color: GREY }}>
                    By combining lightweight audience engagement with robust research methodologies, Fanometrix delivers actionable insight that supports editorial, commercial and strategic decision-making.
                  </p>
                  <p className="leading-[1.7]" style={{ fontSize: 18, color: GREY }}>
                    This initiative is part of our commitment to helping the sports industry better understand fans through collaborative, privacy-conscious research.
                  </p>
                </div>
                <div className="scroll-fade-up flex flex-wrap gap-2.5" style={{ transitionDelay: "0.1s" }}>
                  {CAPABILITIES.map(c => (
                    <span key={c} className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: GREY }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />{c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ 9 — Join the Initiative ═══════════════ */}
        <section id="register" className="scroll-mt-20 relative overflow-hidden px-5 sm:px-10 py-[clamp(88px,11vw,150px)]" style={{ background: NAVY }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.28), transparent)" }} />
          <GeoTexture opacity={0.5} />
          <div className="relative max-w-[1080px] mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-12 lg:gap-16 items-start">
            <div className="lg:sticky lg:top-28">
              <Eyebrow onDark>Register Your Interest</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-white mb-6 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.06, letterSpacing: "-0.025em", transitionDelay: "0.05s" }}>
                Join the Initiative
              </h2>
              <p className="scroll-fade-up leading-[1.7] mb-6" style={{ fontSize: 18, color: "rgba(255,255,255,0.84)", transitionDelay: "0.1s" }}>
                Join football publishers from around the world in helping build the industry&apos;s most comprehensive fan insight report ahead of the FIFA Women&apos;s World Cup 2027.
              </p>
              <div className="scroll-fade-up flex items-start gap-3 rounded-xl px-5 py-4" style={{ background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.28)", transitionDelay: "0.14s" }}>
                <span className="mt-0.5 shrink-0"><Icon name="early" color={GOLD} size={20} /></span>
                <p className="leading-[1.6]" style={{ fontSize: 14.5, color: "rgba(255,255,255,0.85)" }}>
                  Please register your interest by <strong style={{ color: GOLD }}>{REGISTRATION_DEADLINE}</strong> so we can finalise participating publishers and prepare your survey package.
                </p>
              </div>
            </div>
            <div className="scroll-fade-up" style={{ transitionDelay: "0.08s" }}>
              <RegistrationForm />
            </div>
          </div>
        </section>

        <ScrollFadeObserver />
      </main>

      {/* ── Footer (matches the /for-publishers section) ── */}
      <footer className="px-5 sm:px-10 py-12" style={{ background: NAVY }}>
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-md">
            <Link href="/for-publishers" className="inline-flex items-center gap-2 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Fanometrix_Logo.png" alt="Fanometrix" className="h-[18px] w-auto" style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            </Link>
            <p className="leading-[1.6]" style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
              A global publisher research initiative capturing the voice of fans ahead of the FIFA Women&apos;s World Cup 2027.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-3">
            <nav className="flex flex-wrap gap-5">
              <a href={REGISTER_HREF} className="text-[13px] font-semibold transition-opacity hover:opacity-70" style={{ color: GOLD }}>Join the Initiative</a>
              <Link href="/for-publishers" className="text-[13px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.7)" }}>For Publishers</Link>
              <Link href="/privacy" className="text-[13px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.7)" }}>Privacy Policy</Link>
            </nav>
            <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>© {new Date().getFullYear()} Fanometrix</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

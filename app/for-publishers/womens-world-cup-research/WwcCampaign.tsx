"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";
import { CookieSettingsLink } from "@/app/components/CookieSettingsLink";
import { APP_URL } from "@/lib/env";
import { StackDemo } from "./StackDemo";

// ─────────────────────────────────────────────────────────────────────────────
// FIFA Women's World Cup 2027 — Publisher Research Initiative landing page.
//
// Editorial redesign built to the locked content specification (WWC Survey
// Invite). The page favours strong typography, generous whitespace and varied
// section treatments over repeated cards. It lives inside /for-publishers and
// reuses that section's tokens and shared animation utilities (.scroll-fade-up,
// .pp-faq, GeoTexture), all disabled under prefers-reduced-motion. The
// registration form still posts to the existing /api/access-requests endpoint.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Design tokens (shared with the rest of the marketing site) ──────────────
const NAVY     = "#0B1929";
const NAVY_2   = "#122338";
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
const BORDER_2 = "#EEF0F3";

const REGISTER_HREF = "#register";
// Single source of truth for the registration deadline — update here only.
const REGISTRATION_DEADLINE = "14 August 2026";

// Photographic hero creative. Empty string falls back to the styled atmospheric
// placeholder; the gradient, fade-in and responsive crop are wired either way,
// so swapping the asset is a one-line change.
const HERO_IMAGE_SRC = "/fanometrixhero.jpg";

// ─── Thin-line icon family (benefit cards only) ──────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  insight:   <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM9.6 9a2.5 2.5 0 014.9.6c0 1.7-2.5 2-2.5 3.9M12 17h.01" />,
  zeroparty: <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" />,
  partner:   <path d="M12 3a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0M18 6a2 2 0 100 4 2 2 0 000-4z" />,
  early:     <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2" />,
  pr:        <path d="M4 9v6h4l6 4V5L8 9H4zm13 0a4 4 0 010 6" />,
  industry:  <path d="M5 20V10m5 10V5m5 15v-7m5 7V8" />,
};

function Icon({ name, color = GOLD_INK, size = 24 }: { name: string; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// Editorial section kicker — a short gold hairline paired with a tracked label.
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

// Primary CTA — pill anchor that scrolls to the registration form. Native smooth
// scrolling comes from `html { scroll-behavior: smooth }` (reduced-motion aware).
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

// A faint dot-grid + glow used behind navy sections (pure CSS, no image).
function GeoTexture({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{
      opacity,
      backgroundImage:
        "radial-gradient(circle, rgba(215,184,122,0.16) 1px, transparent 1.4px), radial-gradient(ellipse 70% 55% at 50% 0%, rgba(215,184,122,0.12) 0%, transparent 60%)",
      backgroundSize: "26px 26px, auto",
    }} />
  );
}

// ─── Header — transparent over the hero, solid + sticky on scroll ─────────────
function Header() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 px-4 sm:px-10 transition-[background-color,border-color,box-shadow] duration-200 ease-out"
      style={{
        background: solid ? NAVY : "transparent",
        borderBottom: `1px solid ${solid ? "rgba(255,255,255,0.1)" : "transparent"}`,
        boxShadow: solid ? "0 10px 30px -20px rgba(0,0,0,0.8)" : "none",
      }}
    >
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
  );
}

// ─── Hero photographic background (placeholder until final creative supplied) ──
// Full-bleed. A styled atmospheric layer stands in for the photograph; a
// left-to-right darkening gradient keeps the copy highly legible while the
// right becomes progressively more visible. Fades in gently on load.
function HeroBackground() {
  return (
    <div aria-hidden className="wwc-hero-fade pointer-events-none absolute inset-0 overflow-hidden">
      {/* image layer — real photograph when HERO_IMAGE_SRC is set, else a
          crafted atmospheric placeholder (no stock photography). */}
      {HERO_IMAGE_SRC ? (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${HERO_IMAGE_SRC})`, backgroundSize: "cover", backgroundPosition: "center right" }} />
      ) : (
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(60% 80% at 88% 32%, rgba(215,184,122,0.34), transparent 60%),
            radial-gradient(46% 60% at 74% 78%, rgba(120,150,200,0.22), transparent 62%),
            radial-gradient(30% 40% at 96% 60%, rgba(215,184,122,0.20), transparent 60%),
            linear-gradient(120deg, ${NAVY} 20%, #10233b 55%, #16304f 100%)`,
        }} />
      )}
      {/* atmospheric bokeh on the right, kept understated */}
      <div className="absolute inset-0" style={{
        backgroundImage:
          "radial-gradient(circle, rgba(215,184,122,0.5) 0 2px, transparent 3px), radial-gradient(circle, rgba(255,255,255,0.28) 0 1.5px, transparent 2.5px)",
        backgroundSize: "160px 160px, 90px 90px",
        backgroundPosition: "70% 40%, 82% 70%",
        maskImage: "linear-gradient(90deg, transparent 45%, black 100%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 45%, black 100%)",
        opacity: 0.5,
      }} />
      {/* legibility gradient: dark on the left, opening up toward the right */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(90deg, rgba(11,25,41,0.95) 0%, rgba(11,25,41,0.82) 34%, rgba(11,25,41,0.5) 68%, rgba(11,25,41,0.22) 100%)`,
      }} />
      {/* top scrim so a transparent nav stays legible (esp. mobile) */}
      <div className="absolute inset-x-0 top-0 h-36" style={{ background: "linear-gradient(180deg, rgba(11,25,41,0.85), transparent)" }} />
      {/* base bottom fade into the page */}
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: `linear-gradient(0deg, ${NAVY}, transparent)` }} />
    </div>
  );
}

// The locked seven-frame sequence, visualised as a simple horizontal flow.
const SEQUENCE = ["Intro", "Gender", "Age", "Q1", "Q2", "Q3", "Thank You"];
function SevenFrameFlow() {
  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
      {SEQUENCE.map((label, i) => (
        <span key={label} className="inline-flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 shrink-0" style={{ border: `1px solid ${BORDER}`, background: "#fff" }}>
            <span className="font-bold fx-tabular-nums" style={{ fontSize: 10.5, color: GOLD_INK }}>{String(i + 1).padStart(2, "0")}</span>
            <span className="font-semibold whitespace-nowrap" style={{ fontSize: 12, color: INK }}>{label}</span>
          </span>
          {i < SEQUENCE.length - 1 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── FAQ (native <details>, dark navy chapter) ────────────────────────────────
const FAQS: { q: string; a: React.ReactNode }[] = [
  { q: "How much work is involved?", a: <>Very little. We&apos;ll provide everything you need, including the survey, creative assets, market-specific hosted iframes and an implementation guide. Simply schedule the campaign through your ad server as you would a standard 300 × 250 display campaign.</> },
  { q: "How many questions will my audience answer?", a: <>The survey is a short sequence: a brief eligibility check, two audience profile questions (gender and age) and three research questions, followed by a thank-you. It has been designed to minimise disruption while collecting meaningful audience insight.</> },
  { q: "Is there a cost to participate?", a: <>No. Participation is free.</> },
  { q: "What do we receive in return?", a: <>You&apos;ll receive your own audience data, valuable zero-party data, early access to the completed report and recognition as an Official Research Partner.</> },
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
  { q: "Which markets can participate?", a: <>The initiative is open to football publishers worldwide. Surveys can be delivered across multiple markets, with one hosted iframe per agreed language, fully localised for each market.</> },
];

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="pp-faq is-dark border-b" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
      <summary className="flex items-start justify-between gap-6 cursor-pointer py-6 sm:py-7">
        <span className="font-semibold pr-2 text-white" style={{ fontSize: "clamp(17px,1.7vw,20px)", lineHeight: 1.4, letterSpacing: "-0.01em" }}>{q}</span>
        <span className="pp-faq-icon mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M7 1v12M1 7h12" /></svg>
        </span>
      </summary>
      <div className="pp-faq-panel pb-8 sm:pr-14 leading-[1.75]" style={{ maxWidth: 780, fontSize: 16, color: "rgba(255,255,255,0.76)" }}>{children}</div>
    </details>
  );
}

// ─── Sticky "Join the Initiative" button ──────────────────────────────────────
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
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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

// ─── Registration form — Publisher, Name, Email only ──────────────────────────
// Preserves the existing submission: POST /api/access-requests (same inbox +
// Supabase storage as every other website enquiry).
const FIELD_CLASS = "w-full px-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:border-[#D7B87A]";
const fieldStyle = { borderColor: BORDER, color: INK, background: "#fff" } as const;

function RegistrationForm() {
  const [form, setForm] = useState({ publisher: "", name: "", email: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.publisher.trim() || !form.name.trim() || !form.email.trim()) {
      setError("Please complete all fields.");
      setStatus("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          organisation: form.publisher.trim(),
          role: "Media Partner / Publisher",
          message: "FIFA Women's World Cup 2027 — Publisher Research Initiative registration",
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
      <div className="rounded-2xl p-9 sm:p-10 text-center" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: WASH }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <h3 className="font-bold mb-3" style={{ fontSize: 22, color: INK, letterSpacing: "-0.01em" }}>Thank you for registering your interest.</h3>
        <p className="mx-auto leading-[1.7]" style={{ fontSize: 15.5, color: GREY, maxWidth: 420 }}>
          We&apos;ve received your details and will be in touch shortly with more information about the initiative and next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl p-7 sm:p-8 space-y-4" style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 22px 48px -24px rgba(11,25,41,0.28)" }}>
      <div>
        <label htmlFor="wwc-publisher" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: GREY }}>Publisher</label>
        <input id="wwc-publisher" type="text" required autoComplete="organization" value={form.publisher} onChange={e => set("publisher", e.target.value)} placeholder="Your publication or company" className={FIELD_CLASS} style={fieldStyle} />
      </div>
      <div>
        <label htmlFor="wwc-name" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: GREY }}>Name</label>
        <input id="wwc-name" type="text" required autoComplete="name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your name" className={FIELD_CLASS} style={fieldStyle} />
      </div>
      <div>
        <label htmlFor="wwc-email" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: GREY }}>Email</label>
        <input id="wwc-email" type="email" required autoComplete="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="Your work email" className={FIELD_CLASS} style={fieldStyle} />
      </div>

      {error && (
        <p role="alert" className="text-sm rounded-lg px-4 py-2.5" style={{ color: "#B42318", background: "#FEF3F2", border: "1px solid #FEE4E2" }}>{error}</p>
      )}

      <button type="submit" disabled={status === "submitting"} className="w-full py-4 rounded-xl text-[15px] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-12px_rgba(11,25,41,0.55)] disabled:opacity-60 disabled:translate-y-0 disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ background: NAVY, color: GOLD, ["--tw-ring-color" as string]: GOLD }}>
        {status === "submitting" ? "Sending…" : "Join the Initiative"}
      </button>

      <p className="text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
        By registering, you agree to our{" "}
        <Link href="/privacy" className="font-semibold underline" style={{ color: GOLD_INK }}>Privacy Policy</Link>{" "}
        and to being contacted about this research initiative.
      </p>
    </form>
  );
}

// ─── Content data ─────────────────────────────────────────────────────────────
const STEPS = [
  { n: "01", title: "Join the Initiative", body: <>Complete the short registration form <a href="#register" className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-70" style={{ color: GOLD_INK }}>at the bottom of this page</a>.</> },
  { n: "02", title: "Receive Your Survey Package", body: "We'll provide your survey, creative assets and everything you need to get live." },
  { n: "03", title: "Launch & Monitor", body: "Run the campaign and monitor responses through your live dashboard." },
  { n: "04", title: "Receive Your Results", body: "Get your audience data, early access to the report and Official Research Partner recognition." },
];

const BENEFITS = [
  { icon: "insight",  title: "Exclusive Audience Insights", body: "Gain unique insight into your audience's attitudes, interests and behaviours through responses collected directly from your own readers." },
  { icon: "zeroparty", title: "Zero-Party Data", body: "Collect valuable zero-party data directly from your audience to support your editorial, commercial and audience strategies." },
  { icon: "partner",  title: "Official Research Partner", body: "Be recognised as an Official Research Partner across the initiative, final report and associated campaign materials." },
  { icon: "early",    title: "Early Access", body: "Receive early access to the completed global report and its findings before they are released publicly." },
  { icon: "pr",       title: "PR & Promotion", body: "Benefit from opportunities for recognition across report launches, press activity and promotional content surrounding the initiative." },
  { icon: "industry", title: "Contribute to Industry Understanding", body: "Help build a global study that gives brands and the wider industry a better understanding of football audiences." },
];

const COMMITMENT_STATS = [
  { big: "~1M", unit: "Impressions", sub: "Target delivery" },
  { big: "2–4", unit: "Weeks", sub: "Campaign period" },
  { big: "Multiple", unit: "Markets", sub: "Where audience reach allows" },
  { big: "3–5", unit: "Exposures", sub: "Recommended frequency cap" },
];

const CAPABILITIES = ["Audience Research", "Zero-Party Data", "Sports Audience Insight", "Publisher Partnerships", "Privacy-Conscious Research"];

const SURVEY_MECHANICS = [
  { title: "One standard 300 × 250 creative", body: "The survey runs within a standard 300 × 250 advertising placement and can be served through your existing ad server using a hosted iframe." },
  { title: "Localised for each market", body: "We provide one hosted iframe for each agreed language, with the survey and creative fully localised for that market." },
];

// ─────────────────────────────────────────────────────────────────────────────
export function WwcCampaign() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: OFFWHITE, color: INK }}>
      <Header />
      <StickyJoin />

      <main className="flex-1">
        {/* ═══════════════ 1 — Hero ═══════════════ */}
        <section id="wwc-hero" className="relative isolate overflow-hidden flex items-center px-5 sm:px-10 pt-32 pb-[clamp(72px,10vw,120px)]" style={{ background: NAVY, minHeight: "min(88vh, 860px)" }}>
          <HeroBackground />
          <div className="relative max-w-[1240px] mx-auto w-full">
            <div className="max-w-[640px]">
              <p className="hero-fade-up mb-7 inline-flex items-center gap-3.5 font-semibold uppercase" style={{ fontSize: 12.5, letterSpacing: "0.26em", color: GOLD }}>
                <span aria-hidden className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.7))" }} />
                A Global Publisher Research Initiative
              </p>
              <h1 className="hero-fade-up font-bold tracking-tight mb-8 text-white text-balance" style={{ fontSize: "clamp(38px, 6vw, 68px)", lineHeight: 1.03, letterSpacing: "-0.033em", animationDelay: "0.08s" }}>
                Help Build the World&apos;s Largest Women&apos;s World Cup Fan Report
              </h1>
              <p className="hero-fade-up leading-[1.7] mb-10" style={{ animationDelay: "0.2s", fontSize: "clamp(17px, 1.7vw, 20px)", color: "rgba(255,255,255,0.82)", maxWidth: 560 }}>
                We&apos;re bringing together leading football publishers from around the world to capture what fans really think ahead of the FIFA Women&apos;s World Cup 2027.
              </p>
              <div className="hero-fade-up flex flex-wrap items-center gap-x-5 gap-y-4" style={{ animationDelay: "0.32s" }}>
                <JoinCta variant="primary" withArrow />
              </div>
              <p className="hero-fade-up mt-9 inline-flex items-center gap-2.5 rounded-full px-4 py-2" style={{ animationDelay: "0.4s", background: "rgba(215,184,122,0.12)", border: "1px solid rgba(215,184,122,0.3)" }}>
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="pp-breathe absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: GOLD }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: GOLD }} />
                </span>
                <span className="text-[13.5px] font-semibold" style={{ color: GOLD }}>Publisher registrations close {REGISTRATION_DEADLINE} (end of day).</span>
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ 2 — The Invitation ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(80px,10vw,132px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[940px] mx-auto text-center">
            <Eyebrow center>The Invitation</Eyebrow>
            <p className="scroll-fade-up font-semibold tracking-tight text-balance" style={{ fontSize: "clamp(25px,3.4vw,40px)", lineHeight: 1.24, color: INK, letterSpacing: "-0.02em", transitionDelay: "0.05s" }}>
              Join leading football publishers from around the world in creating the most comprehensive fan insight report ahead of the FIFA Women&apos;s World Cup 2027.
            </p>
            <p className="scroll-fade-up mx-auto mt-7 leading-[1.7]" style={{ fontSize: "clamp(17px,1.7vw,19px)", color: GREY, maxWidth: 720, transitionDelay: "0.1s" }}>
              By contributing a simple fan poll, you&apos;ll gain exclusive audience insight, compare your audience with the aggregated global dataset, and be recognised as an <span className="font-semibold" style={{ color: GOLD_INK }}>Official Research Partner</span> in an initiative designed to help brands better understand football audiences.
            </p>
          </div>
        </section>

        {/* ═══════════════ 3 — How It Works ═══════════════ */}
        <section id="how-it-works" className="scroll-mt-24 px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: BG_SOFT, borderTop: `1px solid ${BORDER_2}` }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(44px,5.5vw,68px)] max-w-[720px]">
              <Eyebrow>The Process</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                How It Works
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Four simple steps. We provide everything you need.
              </p>
            </div>

            {/* four equal, minimal steps — the number is the primary visual device */}
            <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
              <span aria-hidden className="hidden lg:block absolute left-[12.5%] right-[12.5%]" style={{ top: "50%", transform: "translateY(-50%)", height: 2, background: "linear-gradient(90deg, rgba(215,184,122,0.28), rgba(215,184,122,0.8))" }} />
              {STEPS.map((s, i) => (
                <li key={s.n} className="scroll-fade-up relative flex flex-col rounded-2xl bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_-16px_rgba(16,24,40,0.14)]" style={{ border: `1px solid ${BORDER}`, transitionDelay: `${0.06 * i}s` }}>
                  <span className="font-bold tracking-tight fx-tabular-nums mb-5" style={{ fontSize: 40, lineHeight: 1, color: i === STEPS.length - 1 ? GOLD_INK : NAVY, letterSpacing: "-0.03em" }}>{s.n}</span>
                  <h3 className="font-bold mb-2.5" style={{ fontSize: 18, color: INK, letterSpacing: "-0.01em" }}>{s.title}</h3>
                  <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>{s.body}</p>
                </li>
              ))}
            </ol>

            {/* full-width gold reassurance panel */}
            <div className="scroll-fade-up mt-6 flex items-start gap-4 rounded-2xl px-6 sm:px-8 py-6" style={{ background: WASH, border: "1px solid rgba(215,184,122,0.4)" }}>
              <span className="mt-0.5 shrink-0 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(215,184,122,0.35)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <p className="leading-[1.6]" style={{ fontSize: 16, color: "#6B5320" }}>
                <strong className="font-bold" style={{ color: GOLD_INK }}>Simple to implement.</strong> Your survey is supplied as a hosted iframe and scheduled through your ad server just like a standard 300 × 250 campaign. No bespoke development required. <a href="#the-survey" className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-70" style={{ color: GOLD_INK }}>See creative example below</a>.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ 4 — What You'll Receive ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(44px,5.5vw,68px)] max-w-[720px]">
              <Eyebrow>The Benefits</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                What You&apos;ll Receive
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Taking part gives your business real value in return, from exclusive audience insight and zero-party data to early access and recognition as an Official Research Partner.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {BENEFITS.map((b, i) => (
                <div key={b.title} className="scroll-fade-up group relative overflow-hidden rounded-2xl border bg-white p-8 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_-16px_rgba(16,24,40,0.16)]" style={{ borderColor: BORDER, transitionDelay: `${0.05 * i}s` }}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_INK})` }} />
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl mb-5" style={{ background: WASH }}><Icon name={b.icon} /></span>
                  {/* fixed-height title block so every body starts at the same line */}
                  <h3 className="font-bold mb-2.5 flex items-start" style={{ fontSize: 18, color: INK, letterSpacing: "-0.01em", minHeight: "2.7em", lineHeight: 1.3 }}>{b.title}</h3>
                  <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ 5 — Your Commitment (stats-led, dark) ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: NAVY }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.28), transparent)" }} />
          <GeoTexture opacity={0.4} />
          <div className="relative max-w-[1160px] mx-auto">
            <div className="max-w-[760px] mb-[clamp(40px,5vw,60px)]">
              <Eyebrow onDark>Participation</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-white mb-5 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", transitionDelay: "0.05s" }}>
                Your Commitment
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: "rgba(255,255,255,0.82)", transitionDelay: "0.1s" }}>
                To help us generate meaningful research, we&apos;re asking participating publishers to support the survey with sufficient reach across their audience.
              </p>
            </div>

            {/* stats strip — hairline-divided, not cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-10 border-t" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              {COMMITMENT_STATS.map((s, i) => (
                <div
                  key={s.unit}
                  className={`scroll-fade-up pt-8 ${i % 2 === 1 ? "border-l pl-6" : ""} lg:border-l lg:first:border-l-0 lg:pl-8`}
                  style={{ borderColor: "rgba(255,255,255,0.12)", transitionDelay: `${0.06 * i}s` }}
                >
                  <p className="font-semibold mb-2.5" style={{ fontSize: "clamp(15px,1.6vw,18px)", color: "#fff" }}>{s.unit}</p>
                  <span className="block font-bold tracking-tight" style={{ fontSize: "clamp(36px,4.6vw,56px)", lineHeight: 1, color: GOLD, letterSpacing: "-0.02em" }}>{s.big}</span>
                  <p className="font-semibold uppercase tracking-[0.08em] mt-3" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{s.sub}</p>
                </div>
              ))}
            </div>

            <p className="scroll-fade-up mt-12 leading-[1.7]" style={{ fontSize: 17, color: "rgba(255,255,255,0.82)", maxWidth: 860 }}>
              <strong className="font-bold" style={{ color: GOLD }}>Run of network is absolutely fine.</strong> We&apos;ll work with you to agree the most appropriate markets, languages, campaign dates and delivery plan before anything goes live.
            </p>
          </div>
        </section>

        {/* ═══════════════ 6 — See What You'll Run ═══════════════ */}
        <section id="the-survey" className="scroll-mt-24 px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: BG_SOFT }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-[clamp(44px,5.5vw,68px)] max-w-[720px]">
              <Eyebrow>The Survey</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
                See What You&apos;ll Run
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                A single, lightweight creative, and exactly what your audience experiences from first tap to thank-you.
              </p>
            </div>

            {/* left: self-contained demo of the real Stack creative · right: the mechanics */}
            <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-12 lg:gap-16 items-center">
              <div className="scroll-fade-up flex flex-col items-center lg:items-start" style={{ transitionDelay: "0.05s" }}>
                <div style={{ boxShadow: "0 26px 54px -20px rgba(11,25,41,0.4)" }}>
                  <StackDemo />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[12px]" style={{ color: MUTED }}>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: WASH, color: GOLD_INK }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD_INK }} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em]">Demonstration</span>
                  </span>
                  <span>300 × 250 · click through it · no data recorded</span>
                </div>
              </div>
              <div className="scroll-fade-up" style={{ transitionDelay: "0.1s" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-6" style={{ color: GOLD_INK }}>How the survey works</p>
                <div className="space-y-7">
                  {SURVEY_MECHANICS.map(m => (
                    <div key={m.title}>
                      <h3 className="font-bold mb-1.5" style={{ fontSize: 17.5, color: INK, letterSpacing: "-0.01em" }}>{m.title}</h3>
                      <p className="leading-[1.6]" style={{ fontSize: 16, color: GREY, maxWidth: 540 }}>{m.body}</p>
                    </div>
                  ))}
                  <div>
                    <h3 className="font-bold mb-3" style={{ fontSize: 17.5, color: INK, letterSpacing: "-0.01em" }}>Seven simple frames</h3>
                    <p className="leading-[1.6] mb-4" style={{ fontSize: 16, color: GREY, maxWidth: 540 }}>The experience takes the reader through a short sequence:</p>
                    <SevenFrameFlow />
                  </div>
                </div>
              </div>
            </div>

            {/* full-width real-time reporting strip */}
            <div className="scroll-fade-up mt-12 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 rounded-2xl bg-white px-7 sm:px-9 py-7" style={{ border: `1px solid ${BORDER}` }}>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 self-start" style={{ background: WASH }}>
                <span className="pp-breathe h-2 w-2 rounded-full" style={{ background: GOLD_INK }} />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD_INK }}>Live</span>
              </span>
              <div>
                <h3 className="font-bold mb-1" style={{ fontSize: 18, color: INK, letterSpacing: "-0.01em" }}>Results, as they happen</h3>
                <p className="leading-[1.6]" style={{ fontSize: 15.5, color: GREY }}>
                  Responses are captured in real time and made available through a simple reporting dashboard, giving you a clear view of response volumes, completion and audience insights as the research runs.
                </p>
              </div>
            </div>

            {/* privacy reassurance */}
            <div className="scroll-fade-up mt-5 flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" /></svg></span>
              <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY, maxWidth: 900 }}>
                <strong className="font-bold" style={{ color: INK }}>Privacy-conscious by design.</strong> The survey does not ask respondents for names, email addresses or contact details. Audience profile and research responses are provided voluntarily and used in anonymised and aggregated research.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ 7 — Why This Matters (light editorial, no cards) ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(96px,12vw,168px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[900px] mx-auto">
            <Eyebrow>The Opportunity</Eyebrow>
            <h2 className="scroll-fade-up font-bold tracking-tight mb-10 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", color: INK, transitionDelay: "0.05s" }}>
              Why This Matters
            </h2>
            <p className="scroll-fade-up font-semibold tracking-tight text-balance" style={{ fontSize: "clamp(23px,3vw,34px)", lineHeight: 1.32, color: INK, letterSpacing: "-0.02em", transitionDelay: "0.08s" }}>
              The FIFA Women&apos;s World Cup 2027 will bring a huge global audience, but we still know surprisingly little about the fans behind it.
            </p>
            <div className="mt-12 grid sm:grid-cols-2 gap-x-16 gap-y-10">
              <div className="scroll-fade-up" style={{ transitionDelay: "0.06s" }}>
                <h3 className="font-bold mb-2.5" style={{ fontSize: 15, color: GOLD_INK, textTransform: "uppercase", letterSpacing: "0.08em" }}>The Opportunity</h3>
                <p className="leading-[1.75]" style={{ fontSize: 18, color: GREY }}>For publishers, brands and rights holders, the tournament represents a major global commercial opportunity.</p>
              </div>
              <div className="scroll-fade-up" style={{ transitionDelay: "0.12s" }}>
                <h3 className="font-bold mb-2.5" style={{ fontSize: 15, color: GOLD_INK, textTransform: "uppercase", letterSpacing: "0.08em" }}>The Gap</h3>
                <p className="leading-[1.75]" style={{ fontSize: 18, color: GREY }}>Yet independent, international insight into what these fans think, want and value remains limited. Together, we can help change that.</p>
              </div>
            </div>
            <p className="scroll-fade-up mt-14 font-semibold tracking-tight" style={{ fontSize: "clamp(20px,2.4vw,27px)", lineHeight: 1.35, color: INK, letterSpacing: "-0.01em", transitionDelay: "0.05s" }}>
              Together, we&apos;re building the insight the industry needs <span style={{ color: GOLD_INK }}>ahead of 2027</span>.
            </p>
          </div>
        </section>

        {/* ═══════════════ 8 — FAQ (dark chapter) ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: NAVY }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.28), transparent)" }} />
          <div className="relative max-w-[920px] mx-auto">
            <div className="text-center mb-[clamp(40px,5vw,60px)]">
              <Eyebrow onDark center>Questions</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-white mx-auto text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.07, letterSpacing: "-0.025em", transitionDelay: "0.05s" }}>
                Frequently Asked Questions
              </h2>
            </div>
            <div className="scroll-fade-up border-t" style={{ borderColor: "rgba(255,255,255,0.12)", transitionDelay: "0.05s" }}>
              {FAQS.map(f => <FaqItem key={f.q} q={f.q}>{f.a}</FaqItem>)}
            </div>
          </div>
        </section>

        {/* ═══════════════ 9 — About Fanometrix (compact editorial, no image) ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(80px,10vw,132px)]" style={{ background: BG_SOFT }}>
          <div className="max-w-[1080px] mx-auto">
            <Eyebrow>About Fanometrix</Eyebrow>
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-start">
              <p className="scroll-fade-up font-semibold tracking-tight text-balance" style={{ fontSize: "clamp(22px,2.7vw,31px)", lineHeight: 1.32, color: INK, letterSpacing: "-0.02em", transitionDelay: "0.05s" }}>
                Fanometrix helps publishers, brands and rights holders better understand sports audiences through audience research, zero-party data and fan insight.
              </p>
              <div className="scroll-fade-up space-y-5 lg:pt-1.5" style={{ transitionDelay: "0.1s" }}>
                <p className="leading-[1.75]" style={{ fontSize: 17, color: GREY }}>
                  By combining lightweight audience engagement with robust research methodologies, Fanometrix delivers actionable insight that supports editorial, commercial and strategic decision-making.
                </p>
                <p className="leading-[1.75]" style={{ fontSize: 17, color: GREY }}>
                  This initiative is part of our commitment to helping the sports industry better understand fans through collaborative, privacy-conscious research.
                </p>
              </div>
            </div>
            <div className="scroll-fade-up flex flex-wrap gap-2.5 mt-12 pt-10 border-t" style={{ borderColor: BORDER, transitionDelay: "0.05s" }}>
              {CAPABILITIES.map(c => (
                <span key={c} className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: GREY }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />{c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ 10 — Join the Initiative ═══════════════ */}
        <section id="register" className="scroll-mt-24 relative overflow-hidden px-5 sm:px-10 py-[clamp(84px,10vw,140px)]" style={{ background: NAVY }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(215,184,122,0.28), transparent)" }} />
          <GeoTexture opacity={0.45} />
          <div className="relative max-w-[1080px] mx-auto grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-16 items-start">
            <div>
              <Eyebrow onDark>Register Your Interest</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight text-white mb-6 text-balance" style={{ fontSize: "clamp(31px,4.4vw,52px)", lineHeight: 1.05, letterSpacing: "-0.025em", transitionDelay: "0.05s" }}>
                Join the Initiative
              </h2>
              <p className="scroll-fade-up leading-[1.7] mb-6" style={{ fontSize: 18, color: "rgba(255,255,255,0.84)", transitionDelay: "0.1s" }}>
                Join football publishers from around the world in helping build the industry&apos;s most comprehensive fan insight report ahead of the FIFA Women&apos;s World Cup 2027.
              </p>
              <div className="scroll-fade-up flex items-start gap-3 rounded-xl px-5 py-4" style={{ background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.28)", transitionDelay: "0.14s" }}>
                <span className="mt-0.5 shrink-0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2" /></svg></span>
                <p className="leading-[1.6]" style={{ fontSize: 14.5, color: "rgba(255,255,255,0.85)" }}>
                  Please register your interest by <strong style={{ color: GOLD }}>{REGISTRATION_DEADLINE}</strong> (end of day) so we can finalise participating publishers and prepare your survey package.
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

      {/* ── Footer ── */}
      <footer className="px-5 sm:px-10 py-12" style={{ background: NAVY_2 }}>
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
              <CookieSettingsLink className="text-[13px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.7)" }} />
            </nav>
            <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>© {new Date().getFullYear()} Fanometrix</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { Toc, type TocItem } from "./Toc";

export const metadata: Metadata = {
  title: "Responsible Use of Reddit Data, Fanometrix Trust Centre",
  description:
    "How Fanometrix accesses and uses public Reddit data responsibly, and how our design maps to Reddit's Responsible Builder Policy. A governance reference from the Fanometrix Trust Centre.",
  robots: { index: false, follow: false },
};

// ─── Design tokens (matched to the Fanometrix marketing site) ───────────────
const NAVY    = "#0B1929";
const GOLD    = "#D7B87A";
const GREY    = "#4B5563";
const MUTED   = "#9CA3AF";
const BG_SOFT = "#F8F9FB";
const BORDER  = "#E5E7EB";
const SURFACE = "#F1F2F5";
const GREEN   = "#047857"; // emerald-700, compliant behaviours
const RED     = "#DC2626"; // red-600, prohibited behaviours

const PUBLISHED = "July 2026";

// ─── Table of contents (shared with the sticky ToC and the section headings) ─
const SECTIONS: TocItem[] = [
  { id: "commitment",   label: "Our Commitment" },
  { id: "why-reddit",   label: "Why Reddit?" },
  { id: "what-is",      label: "What Is Fanometrix?" },
  { id: "why-sources",  label: "Why Multiple Sources Matter" },
  { id: "how-used",     label: "How Reddit Data Is Used" },
  { id: "collect",      label: "What We Collect" },
  { id: "not-collect",  label: "What We Do Not Collect" },
  { id: "clients",      label: "What Clients Receive" },
  { id: "ai",           label: "AI Usage" },
  { id: "no-training",  label: "No AI Model Training" },
  { id: "insight",      label: "From Conversations to Insight" },
  { id: "human-review", label: "Human Review" },
  { id: "privacy",      label: "Privacy" },
  { id: "retention",    label: "Data Retention & Deletion" },
  { id: "api-usage",    label: "Responsible API Usage" },
  { id: "integrity",    label: "Platform Integrity" },
  { id: "attribution",  label: "Attribution & Ownership" },
  { id: "policy",       label: "Responsible Builder Policy" },
  { id: "principles",   label: "Our Principles" },
];

// ─── Icons ──────────────────────────────────────────────────────────────────
function CheckIcon({ size = 16, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CrossIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {down ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
    </svg>
  );
}

// ─── Small presentational helpers ───────────────────────────────────────────
function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      {eyebrow && (
        <p className="font-semibold uppercase tracking-[0.16em] mb-2.5" style={{ fontSize: 11, color: GOLD }}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-bold tracking-tight mb-5" style={{ fontSize: "clamp(21px, 2.4vw, 27px)", color: NAVY, letterSpacing: "-0.02em" }}>
        {title}
      </h2>
      <div className="space-y-4" style={{ color: GREY, fontSize: 15.5, lineHeight: 1.72 }}>
        {children}
      </div>
    </section>
  );
}

// Compliant / prohibited list rows
function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0"><CheckIcon /></span>
      <span>{children}</span>
    </li>
  );
}
function CrossRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0"><CrossIcon /></span>
      <span>{children}</span>
    </li>
  );
}

// Green "receive" / red "do not receive" two-column card block
function DualColumn({
  leftTitle, leftItems, leftKind, rightTitle, rightItems, rightKind,
}: {
  leftTitle: string; leftItems: string[]; leftKind: "check" | "cross";
  rightTitle: string; rightItems: string[]; rightKind: "check" | "cross";
}) {
  const Col = (title: string, items: string[], kind: "check" | "cross") => {
    const compliant = kind === "check";
    return (
      <div
        className="rounded-xl border p-5"
        style={{
          borderColor: compliant ? "#D5E8DE" : "#F2D9D9",
          background: compliant ? "#F4FBF7" : "#FEF6F6",
        }}
      >
        <h3 className="font-bold text-[14px] mb-3.5" style={{ color: compliant ? GREEN : RED }}>{title}</h3>
        <ul className="space-y-3 text-[14.5px]" style={{ color: GREY }}>
          {items.map(item =>
            compliant ? <CheckRow key={item}>{item}</CheckRow> : <CrossRow key={item}>{item}</CrossRow>
          )}
        </ul>
      </div>
    );
  };
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {Col(leftTitle, leftItems, leftKind)}
      {Col(rightTitle, rightItems, rightKind)}
    </div>
  );
}

// ─── Content data ───────────────────────────────────────────────────────────
const EVIDENCE_SOURCES = [
  "Zero-party fan surveys",
  "Public Reddit discussions",
  "Public YouTube comments",
  "Trusted news articles",
  "Industry reports",
  "Academic research",
  "Client-supplied documents",
];

const SOURCE_TABLE: { s: string; p: string }[] = [
  { s: "Survey responses", p: "Direct, zero-party opinion gathered straight from football fans in response to a specific question." },
  { s: "Reddit",           p: "Long-form, authentic public discussion that adds context, nuance and unprompted opinion." },
  { s: "YouTube",          p: "Public reactions and sentiment around football content, moments and campaigns." },
  { s: "News",             p: "Verified reporting that grounds findings in documented, real-world events." },
  { s: "Research reports",  p: "Industry data and benchmarks from the wider football and sponsorship economy." },
  { s: "Academic research", p: "Peer-reviewed evidence and established analytical frameworks." },
];

const NOT_COLLECT = [
  "Identify Reddit users",
  "Build behavioural profiles of individuals",
  "Infer sensitive personal characteristics",
  "Scrape private or non-public content",
  "Access private or restricted communities",
  "Collect direct messages",
  "Contact Reddit users",
  "Automate participation in communities",
  "Manipulate Reddit conversations",
];

const CLIENTS_RECEIVE = [
  "Executive summaries",
  "Strategic findings",
  "Aggregate themes",
  "Recommendations",
  "Supporting evidence references",
];
const CLIENTS_NOT_RECEIVE = [
  "Bulk Reddit posts",
  "Bulk Reddit comments",
  "User datasets",
  "Personal information",
  "Downloadable Reddit databases",
];

const AI_ASSISTS = [
  "Identifying recurring themes",
  "Organising relevant evidence",
  "Highlighting patterns across multiple evidence sources",
];
const AI_NEVER = [
  "Makes final decisions",
  "Publishes findings automatically",
  "Replaces human review",
  "Trains foundation AI models using Reddit data",
  "Generates Reddit content",
  "Interacts with Reddit users",
];

const API_USAGE = [
  "Respect Reddit API rate limits",
  "Minimise unnecessary API requests",
  "Request only the data required for a research project",
  "Comply with Reddit platform policies",
  "Adapt to future Reddit platform updates",
];

const INTEGRITY_NOT = [
  "Circumvent Reddit API restrictions",
  "Exceed permitted rate limits",
  "Create multiple or fraudulent accounts",
  "Automate voting",
  "Automate commenting",
  "Automate posting",
  "Interfere with Reddit communities",
];

const ATTRIBUTION = [
  "Reddit remains the source of Reddit content.",
  "Fanometrix does not claim ownership of Reddit discussions.",
  "Reddit content is analysed to identify aggregate themes, not republished.",
  "Fanometrix produces original research through independent analysis rather than redistribution of Reddit content.",
];

// Mapping of each Responsible Builder Policy expectation to how Fanometrix meets it.
const POLICY_MAP: { pillar: string; how: string; ref: string }[] = [
  { pillar: "Clearly defined application purpose", ref: "how-used",     how: "Reddit data is accessed only to analyse public discussion relevant to a specific, stated research question, never for open-ended collection." },
  { pillar: "Public conversation analysis only",   ref: "collect",      how: "We access only public posts and comments through Reddit's official API. We never access private content, private communities or direct messages." },
  { pillar: "Data minimisation",                   ref: "collect",      how: "Fanometrix requests only the minimum public information required to support a project, and only for conversations relevant to the active research question." },
  { pillar: "Responsible API usage",               ref: "api-usage",    how: "Fanometrix is designed to respect rate limits, minimise unnecessary requests, and request only the data required for a research project." },
  { pillar: "Human oversight",                     ref: "human-review", how: "No AI-generated finding is published automatically. A researcher reviews every finding and may accept, amend or reject it." },
  { pillar: "No user profiling",                   ref: "not-collect",  how: "We do not identify Reddit users, build behavioural profiles, or infer personal characteristics." },
  { pillar: "No manipulation of communities",      ref: "integrity",    how: "We never post, comment, vote, message users, or otherwise participate in Reddit communities." },
  { pillar: "No foundation model training",        ref: "no-training",  how: "Reddit content is never used to train large language or foundation models. It is analysed only within the context of its research project." },
  { pillar: "Aggregate reporting",                 ref: "clients",      how: "Findings describe themes and trends across multiple sources. Clients receive research outputs, not Reddit posts, comments or user datasets." },
  { pillar: "Respect for content removal",         ref: "retention",    how: "Where Reddit content changes or is deleted, the platform is designed to respect those changes during future collections, where supported by the Reddit API." },
  { pillar: "Clear attribution and ownership",     ref: "attribution",  how: "Reddit remains the source of Reddit content. Fanometrix does not claim ownership of Reddit discussions and does not redistribute them." },
  { pillar: "Respect for Reddit platform policies", ref: "integrity",   how: "Fanometrix is designed to work through Reddit's official API and is committed to respecting its rate limits and restrictions." },
];

const PRINCIPLES: { title: string; body: string }[] = [
  { title: "Fan First",           body: "Research should improve experiences for football fans." },
  { title: "Privacy First",       body: "Collect the minimum data necessary, and no more." },
  { title: "Evidence First",      body: "Use multiple independent evidence sources; no single source decides an outcome." },
  { title: "Human Accountability", body: "AI assists. People remain responsible for every published finding." },
  { title: "Platform Respect",    body: "Every data source is used according to its own rules, policies and expectations." },
];

// ─── Page ───────────────────────────────────────────────────────────────────
export default function ResponsibleRedditDataPage() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b px-4 sm:px-10" style={{ borderColor: BORDER }}>
        <div className="max-w-[1340px] mx-auto flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              className="h-4 sm:h-[19px] w-auto shrink-0"
              style={{
                objectFit: "contain",
                filter: "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
              }}
            />
            <span className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full" style={{ background: SURFACE, color: NAVY }}>
              Trust Centre
            </span>
          </Link>
          <span className="shrink-0 text-[13px] font-medium" style={{ color: MUTED }}>
            Responsible Use of Reddit Data
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b px-5 sm:px-10 pt-12 sm:pt-16 pb-12 sm:pb-14" style={{ borderColor: BORDER, background: BG_SOFT }}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 80% 60% at 15% 0%, rgba(11,25,41,0.05) 0%, transparent 65%)" }}
          />
          <div className="relative max-w-[1180px] mx-auto">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-6 text-[13px] font-medium" style={{ color: MUTED }}>
              <Link href="/" className="hover:underline">Fanometrix</Link>
              <span className="mx-2">/</span>
              <span>Trust Centre</span>
              <span className="mx-2">/</span>
              <span style={{ color: NAVY }}>Responsible Use of Reddit Data</span>
            </nav>

            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 mb-6" style={{ borderColor: BORDER }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: GREY }}>
                Governance &amp; Compliance
              </span>
            </div>

            <h1 className="font-bold tracking-tight mb-4" style={{ fontSize: "clamp(30px, 4.4vw, 50px)", color: NAVY, letterSpacing: "-0.03em", maxWidth: 760 }}>
              Responsible Use of Reddit Data
            </h1>

            {/* Document metadata (governance block) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium mb-5" style={{ color: MUTED }}>
              <span style={{ color: GREY }}>Document Version 1.0</span>
              <span aria-hidden>·</span>
              <span style={{ color: GREY }}>Published {PUBLISHED}</span>
              <span aria-hidden>·</span>
              <span style={{ color: GREY }}>Scope: Reddit data via the official Reddit API</span>
            </div>

            <p className="leading-relaxed" style={{ fontSize: "clamp(15px, 1.7vw, 17px)", color: GREY, maxWidth: 720 }}>
              This document forms part of the Fanometrix Trust Centre and outlines the principles governing the
              responsible use of Reddit data within the Fanometrix platform.
            </p>
            <p className="leading-relaxed mt-4" style={{ fontSize: "clamp(15px, 1.7vw, 17px)", color: GREY, maxWidth: 720 }}>
              It explains, in specific terms, what Reddit data Fanometrix accesses, how it is used, what we
              deliberately do not do, and how our design maps to Reddit&rsquo;s Responsible Builder Policy. It is a
              governance reference, not a marketing page.
            </p>

            {/* Key statement (prominent) */}
            <div className="mt-8 rounded-2xl border-l-4 bg-white px-6 py-6 sm:px-8 sm:py-7 shadow-sm" style={{ borderColor: GOLD, maxWidth: 820 }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: GOLD }}>The core principle</p>
              <p className="font-bold leading-snug" style={{ fontSize: "clamp(18px, 2.3vw, 24px)", color: NAVY, letterSpacing: "-0.01em" }}>
                Fanometrix does not redistribute or republish Reddit content. It produces original research by
                analysing multiple evidence sources together to identify aggregate themes and strategic insights.
              </p>
            </div>

          </div>
        </section>

        {/* ── Our Commitment to Reddit (prominent navy callout) ── */}
        <section className="px-5 sm:px-10 py-10 sm:py-12" style={{ background: NAVY }}>
          <div className="max-w-[1180px] mx-auto">
            <div className="flex items-center gap-2.5 mb-6">
              <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(215,184,122,0.16)" }}>
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z M9 12l2 2 4-4" />
                </svg>
              </span>
              <h2 className="font-bold tracking-tight" style={{ fontSize: "clamp(20px, 2.4vw, 26px)", color: "#fff", letterSpacing: "-0.01em" }}>
                Our Commitment to Reddit
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-4">
              {[
                "We recognise that Reddit's communities create value through authentic discussion.",
                "Fanometrix is committed to ensuring Reddit data is used responsibly, ethically and transparently.",
                "We do not seek to replace Reddit, republish Reddit conversations or redistribute Reddit content.",
                "Reddit is one evidence source used to identify aggregate themes that help organisations make better decisions.",
              ].map(line => (
                <div key={line} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD }} />
                  <p className="text-[15px] leading-relaxed" style={{ color: "#D8DEE7" }}>{line}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── At-a-glance summary ── */}
        <section className="border-b px-5 sm:px-10 py-10 sm:py-12" style={{ borderColor: BORDER }}>
          <div className="max-w-[1180px] mx-auto">
            <p className="font-semibold uppercase tracking-[0.16em] mb-6" style={{ fontSize: 11, color: GOLD }}>
              At a glance
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {[
                { k: "One of several sources", v: "Reddit is never the sole basis for any research finding or recommendation." },
                { k: "Public data only", v: "We access only public posts and comments through Reddit's official API." },
                { k: "No user profiling", v: "We do not identify users, build profiles, or infer personal characteristics." },
                { k: "No model training", v: "Reddit content is never used to train large language or foundation models." },
                { k: "Human oversight", v: "Every finding is reviewed by a researcher before it reaches a client report." },
                { k: "Research, not content", v: "Clients receive findings and recommendations, not Reddit posts or datasets." },
              ].map(card => (
                <div key={card.k} className="rounded-xl border p-5" style={{ borderColor: BORDER, background: "#fff" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckIcon size={15} />
                    <h3 className="font-bold text-[14px]" style={{ color: NAVY }}>{card.k}</h3>
                  </div>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: GREY }}>{card.v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Body: sticky ToC + content ── */}
        <div className="max-w-[1180px] mx-auto px-5 sm:px-10 py-12 sm:py-16">
          <div className="grid lg:grid-cols-[220px_1fr] gap-10 lg:gap-16 items-start">
            {/* Sticky ToC (desktop only) */}
            <aside className="hidden lg:block sticky top-24 self-start">
              <Toc items={SECTIONS} />
            </aside>

            {/* Content */}
            <div className="min-w-0 space-y-14 sm:space-y-16">

              <Section id="commitment" eyebrow="01" title="Our Commitment">
                <p>
                  At Fanometrix, we believe public conversations can help organisations better understand
                  football fans, provided those conversations are analysed responsibly, ethically and
                  transparently.
                </p>
                <p>
                  We are committed to using Reddit data in a way that respects Reddit&rsquo;s platform, its
                  communities and its users. Reddit is one of several independent evidence sources used within
                  Fanometrix, and is never the sole basis for a research finding or recommendation.
                </p>
                <p>
                  Our platform is designed around responsible data handling, human oversight and evidence-based
                  analysis. The sections below set out exactly how that works in practice.
                </p>
              </Section>

              <Section id="why-reddit" eyebrow="02" title="Why Reddit?">
                <p>
                  Football generates some of the richest long-form discussion anywhere online, and a great deal
                  of it happens on Reddit. Dedicated communities debate competitions, clubs, sponsorships and the
                  matchday experience in depth, over time, and in supporters&rsquo; own words.
                </p>
                <p>
                  For research, that depth matters. Surveys tell us what fans think when asked a specific
                  question. Reddit adds the context, nuance and authentic, unprompted opinion that helps explain
                  <em> why</em> fans feel the way they do. The two complement one another.
                </p>
                <p>
                  Reddit is only one evidence source within Fanometrix. It sits alongside zero-party surveys,
                  public YouTube comments, trusted news, academic research and industry reports, and no single
                  source determines a finding.
                </p>
                <p>
                  Fanometrix exists to understand football fans better, not to replace Reddit or reproduce its
                  content. We believe organisations that better understand football communities create more
                  authentic sponsorships, products and fan experiences. Responsible research helps organisations
                  engage with communities thoughtfully and respectfully.
                </p>
              </Section>

              <Section id="what-is" eyebrow="03" title="What Is Fanometrix?">
                <div className="rounded-xl border-l-4 px-5 py-4" style={{ borderColor: GOLD, background: "#FBF8F1" }}>
                  <p className="text-[15.5px]" style={{ color: NAVY }}>
                    <strong>Fanometrix is not a Reddit analytics platform.</strong> It is a football intelligence
                    platform. Reddit is one input among many, and never the product.
                  </p>
                </div>
                <p>
                  Fanometrix helps brands, rights holders, agencies and publishers better understand football
                  fans. Every project begins with a specific research question, for example:
                </p>
                <ul className="space-y-2 pl-1">
                  {[
                    "How can a sponsor create greater value for football fans?",
                    "What do supporters think about a competition format?",
                    "What experiences do match-going fans value most?",
                  ].map(q => (
                    <li key={q} className="flex items-start gap-3">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD }} />
                      <span className="italic">&ldquo;{q}&rdquo;</span>
                    </li>
                  ))}
                </ul>
                <p>
                  Evidence is then gathered from multiple independent sources and analysed together:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {EVIDENCE_SOURCES.map(s => (
                    <span key={s} className="rounded-full border px-3 py-1.5 text-[13px] font-medium" style={{ borderColor: BORDER, color: NAVY, background: BG_SOFT }}>
                      {s}
                    </span>
                  ))}
                </div>
                <p>
                  <strong style={{ color: NAVY }}>No individual source determines the findings.</strong> The
                  findings Fanometrix produces come from synthesising evidence across many sources, not from
                  analysing Reddit alone. Reddit contributes context and nuance; it does not, by itself, produce a
                  conclusion.
                </p>
              </Section>

              <Section id="why-sources" eyebrow="04" title="Why Multiple Evidence Sources Matter">
                <p>
                  Each source answers a different part of a research question. Combining them produces balanced,
                  defensible findings that no single source could support on its own. This table shows where
                  Reddit fits within the wider evidence ecosystem.
                </p>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-[32%]" style={{ color: NAVY, background: SURFACE }}>Source</th>
                        <th className="px-4 py-3 text-left font-bold" style={{ color: NAVY, background: SURFACE }}>Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SOURCE_TABLE.map(row => {
                        const isReddit = row.s === "Reddit";
                        return (
                          <tr key={row.s} style={{ borderTop: `1px solid ${BORDER}` }}>
                            <td className="px-4 py-3 font-semibold align-top" style={{ color: NAVY, background: isReddit ? "#FBF8F1" : BG_SOFT }}>
                              {row.s}
                            </td>
                            <td className="px-4 py-3" style={{ color: GREY, background: isReddit ? "#FEFCF8" : "#fff" }}>{row.p}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[14px]" style={{ color: MUTED }}>
                  Reddit (highlighted) is one component of this ecosystem. Its role is to add depth and context,
                  which is then weighed against every other source.
                </p>
              </Section>

              <Section id="how-used" eyebrow="05" title="How Reddit Data Is Used">
                <p>
                  Reddit is used solely to help understand public discussion relating to a specific research
                  question. Only discussions relevant to the active research question are collected.
                </p>
                {/* Worked example callout */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: BORDER, background: BG_SOFT }}>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>Worked example</span>
                  </div>
                  <div className="p-5 sm:p-6 space-y-4">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: MUTED }}>Research question</p>
                      <p className="italic" style={{ color: NAVY }}>
                        &ldquo;How can [Brand] create greater value for football fans through its
                        sponsorship?&rdquo;
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED }}>Relevant Reddit discussion may contribute evidence relating to</p>
                      <div className="flex flex-wrap gap-2">
                        {["Sponsorship perceptions", "Fan expectations", "Community sentiment", "Recurring themes"].map(t => (
                          <span key={t} className="rounded-md px-2.5 py-1 text-[13px] font-medium" style={{ background: SURFACE, color: NAVY }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-[14px]" style={{ color: GREY }}>
                      These discussions are analysed alongside survey responses, published research and other
                      public sources, never in isolation.
                    </p>
                  </div>
                </div>
              </Section>

              <Section id="collect" eyebrow="06" title="What We Collect">
                <p>
                  Fanometrix requests only the minimum public information necessary to answer a specific research
                  question, in accordance with the permissions granted through the Reddit API.
                </p>
                <p>
                  In practice, this means publicly visible discussion and the public context needed to interpret
                  it, and only for conversations relevant to the active research question. We do not access
                  private content, and we do not collect data speculatively or for any purpose beyond the project
                  it supports.
                </p>
                <div className="flex items-start gap-3 rounded-lg border-l-4 px-4 py-3" style={{ borderColor: GOLD, background: "#FBF8F1" }}>
                  <span className="mt-0.5 shrink-0"><CheckIcon /></span>
                  <p className="text-[14px]" style={{ color: NAVY }}>
                    Only public information relevant to the active research question is collected, and no more than
                    the project requires.
                  </p>
                </div>
              </Section>

              <Section id="not-collect" eyebrow="07" title="What We Do Not Collect">
                <p>Fanometrix is intentionally designed <strong style={{ color: NAVY }}>not</strong> to:</p>
                <div className="rounded-xl border p-5 sm:p-6" style={{ borderColor: BORDER, background: BG_SOFT }}>
                  <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[14.5px]" style={{ color: GREY }}>
                    {NOT_COLLECT.map(item => <CrossRow key={item}>{item}</CrossRow>)}
                  </ul>
                </div>
              </Section>

              <Section id="clients" eyebrow="08" title="What Clients Receive">
                <p>
                  This distinction is central to how Fanometrix works. Clients receive
                  <strong style={{ color: NAVY }}> research outputs, not Reddit content</strong>. They receive
                  independent analysis and recommendations; they do not receive, license or download Reddit data.
                </p>
                <DualColumn
                  leftTitle="Clients receive" leftKind="check" leftItems={CLIENTS_RECEIVE}
                  rightTitle="Clients do not receive" rightKind="cross" rightItems={CLIENTS_NOT_RECEIVE}
                />
                <p>
                  There is no path within Fanometrix for a client to export Reddit posts, comments, user
                  datasets or a Reddit database. The deliverable is always a research output.
                </p>
              </Section>

              <Section id="ai" eyebrow="09" title="AI Usage">
                <p>
                  Artificial intelligence assists researchers by helping identify patterns across evidence. Its
                  role is deliberately bounded: it supports analysis, and it never interacts with Reddit or makes
                  a decision on its own.
                </p>
                <DualColumn
                  leftTitle="AI assists researchers by" leftKind="check" leftItems={AI_ASSISTS}
                  rightTitle="AI never" rightKind="cross" rightItems={AI_NEVER}
                />
                <p>
                  Every AI-assisted output is treated as a draft for a researcher to review. All findings remain
                  subject to human review before publication.
                </p>
              </Section>

              <Section id="no-training" eyebrow="10" title="No AI Model Training">
                <p>
                  Fanometrix does not use Reddit content to train large language models or foundation models.
                </p>
                <p>
                  Reddit discussions are analysed only within the context of an individual research project. Once
                  analysed, they contribute to that project&rsquo;s evidence base and are not used to improve or
                  train general-purpose AI systems.
                </p>
              </Section>

              <Section id="insight" eyebrow="11" title="From Public Conversations to Strategic Insight">
                <p>
                  Fanometrix does not exist to redistribute Reddit content. Our platform produces original
                  research. Public conversations are transformed into evidence, evidence into findings, and
                  findings into strategic recommendations. The research we produce comes from independent
                  analysis across multiple sources, not from reproducing Reddit conversations.
                </p>

                {/* Evidence workflow diagram */}
                <figure className="rounded-2xl border p-6 sm:p-8" style={{ borderColor: BORDER, background: BG_SOFT }}>
                  <figcaption className="text-[11px] font-bold uppercase tracking-[0.14em] mb-6" style={{ color: MUTED }}>
                    How public conversation becomes strategic insight
                  </figcaption>

                  {/* Step 1, sources */}
                  <p className="text-[12px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: NAVY }}>Independent evidence sources</p>
                  <div className="flex flex-wrap gap-2">
                    {EVIDENCE_SOURCES.map(s => (
                      <span key={s} className="rounded-lg border px-3 py-1.5 text-[13px] font-medium bg-white" style={{ borderColor: BORDER, color: NAVY }}>{s}</span>
                    ))}
                  </div>

                  <div className="flex justify-center py-3"><Arrow down /></div>

                  {/* Step 2, analysis */}
                  <div className="rounded-xl border bg-white px-5 py-4" style={{ borderColor: BORDER }}>
                    <p className="font-bold text-[14.5px]" style={{ color: NAVY }}>Analysis across sources</p>
                    <p className="text-[13.5px] mt-1" style={{ color: GREY }}>Relevant evidence from every source is organised together and recurring themes are identified, with AI assisting the researcher.</p>
                  </div>

                  <div className="flex justify-center py-3"><Arrow down /></div>

                  {/* Step 3, human review */}
                  <div className="rounded-xl border bg-white px-5 py-4" style={{ borderColor: GOLD }}>
                    <p className="font-bold text-[14.5px]" style={{ color: NAVY }}>Human researcher review</p>
                    <p className="text-[13.5px] mt-1" style={{ color: GREY }}>A researcher accepts, amends or rejects each finding before it can be published.</p>
                  </div>

                  <div className="flex justify-center py-3"><Arrow down /></div>

                  {/* Step 4, finding */}
                  <div className="rounded-xl px-5 py-4" style={{ background: NAVY }}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: GOLD }}>Research finding, then strategic recommendation</p>
                    <p className="text-[14.5px] italic" style={{ color: "#E8EDF3" }}>
                      &ldquo;Football fans consistently value authentic sponsorship activation over traditional
                      branding.&rdquo;
                    </p>
                    <p className="text-[13px] mt-2" style={{ color: "#AEB9C7" }}>
                      Original, aggregated analysis that informs the recommendations in the client&rsquo;s research
                      report.
                    </p>
                  </div>
                </figure>
              </Section>

              <Section id="human-review" eyebrow="12" title="Human Review">
                <p>
                  AI-generated findings are never published automatically. Researchers review findings before they
                  become part of a client report, and each piece of evidence can be
                  <strong style={{ color: NAVY }}> accepted, rejected or amended</strong> before publication.
                </p>
                <div className="flex items-start gap-3 rounded-lg border-l-4 px-4 py-3" style={{ borderColor: GOLD, background: "#FBF8F1" }}>
                  <span className="mt-0.5 shrink-0"><CheckIcon /></span>
                  <p className="text-[14px]" style={{ color: NAVY }}>
                    AI assists researchers but does not replace human judgement. Research findings cannot be
                    published until they have been reviewed and approved by an authorised researcher.
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { t: "Accept", d: "Confirm a finding is accurate and supported by the evidence." },
                    { t: "Amend", d: "Refine wording or scope so the finding remains balanced and precise." },
                    { t: "Reject", d: "Remove findings that are not sufficiently supported by the evidence." },
                  ].map(x => (
                    <div key={x.t} className="rounded-xl border p-5" style={{ borderColor: BORDER }}>
                      <p className="font-bold text-[14px] mb-1.5" style={{ color: NAVY }}>{x.t}</p>
                      <p className="text-[13.5px] leading-relaxed" style={{ color: GREY }}>{x.d}</p>
                    </div>
                  ))}
                </div>
                <p>This human review process helps ensure findings remain accurate, balanced and evidence-based.</p>
              </Section>

              <Section id="privacy" eyebrow="13" title="Privacy">
                <p>Fanometrix is designed around data minimisation. We do not attempt to identify individuals.</p>
                <p>
                  Research focuses on aggregate discussion rather than individual opinions. Where possible,
                  findings describe trends rather than highlighting individual posts or users.
                </p>
              </Section>

              <Section id="retention" eyebrow="14" title="Data Retention &amp; Deletion">
                <p>
                  Fanometrix retains only the information necessary to support an active research project.
                </p>
                <p>
                  Where Reddit content changes or is deleted, the platform is designed to respect those changes
                  during future evidence collections, where supported by the Reddit API.
                </p>
              </Section>

              <Section id="api-usage" eyebrow="15" title="Responsible API Usage">
                <p>
                  Fanometrix is engineered to use the Reddit API responsibly and within its intended limits:
                </p>
                <div className="rounded-xl border p-5 sm:p-6" style={{ borderColor: "#D5E8DE", background: "#F4FBF7" }}>
                  <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[14.5px]" style={{ color: GREY }}>
                    {API_USAGE.map(item => <CheckRow key={item}>{item}</CheckRow>)}
                  </ul>
                </div>
              </Section>

              <Section id="integrity" eyebrow="16" title="Platform Integrity">
                <p>
                  Fanometrix is committed to respecting Reddit&rsquo;s platform rules and is designed to work
                  through Reddit&rsquo;s official API. By design, our platform does <strong style={{ color: NAVY }}>not</strong>:
                </p>
                <div className="rounded-xl border p-5 sm:p-6" style={{ borderColor: BORDER, background: BG_SOFT }}>
                  <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[14.5px]" style={{ color: GREY }}>
                    {INTEGRITY_NOT.map(item => <CrossRow key={item}>{item}</CrossRow>)}
                  </ul>
                </div>
              </Section>

              <Section id="attribution" eyebrow="17" title="Attribution &amp; Content Ownership">
                <p>
                  We are clear about where Reddit content comes from and what Fanometrix does with it.
                </p>
                <div className="rounded-xl border p-5 sm:p-6" style={{ borderColor: BORDER, background: BG_SOFT }}>
                  <ul className="space-y-3 text-[15px]" style={{ color: GREY }}>
                    {ATTRIBUTION.map(item => <CheckRow key={item}>{item}</CheckRow>)}
                  </ul>
                </div>
              </Section>

              <Section id="policy" eyebrow="18" title="Compliance with Reddit&rsquo;s Responsible Builder Policy">
                <p>
                  Fanometrix has been designed to align with Reddit&rsquo;s Responsible Builder Policy. The table
                  below maps each expectation to the specific way our platform meets it, and links to the section
                  where it is described in full.
                </p>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
                  {POLICY_MAP.map((row, i) => (
                    <div
                      key={row.pillar}
                      className="grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]"
                      style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-start gap-2.5 px-4 py-4" style={{ background: BG_SOFT }}>
                        <span className="mt-0.5 shrink-0"><CheckIcon /></span>
                        <a href={`#${row.ref}`} className="font-semibold text-[14px] hover:underline" style={{ color: NAVY }}>{row.pillar}</a>
                      </div>
                      <div className="px-4 py-4 text-[14px]" style={{ color: GREY }}>{row.how}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="principles" eyebrow="19" title="Our Principles">
                <p>Everything we build follows five principles.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {PRINCIPLES.map((p, i) => (
                    <div key={p.title} className={`rounded-xl border p-5 ${i === PRINCIPLES.length - 1 ? "sm:col-span-2" : ""}`} style={{ borderColor: BORDER }}>
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: SURFACE, color: NAVY }}>{i + 1}</span>
                        <h3 className="font-bold text-[15px]" style={{ color: NAVY }}>{p.title}</h3>
                      </div>
                      <p className="text-[14px] leading-relaxed pl-[34px]" style={{ color: GREY }}>{p.body}</p>
                    </div>
                  ))}
                </div>
              </Section>

            </div>
          </div>
        </div>
      </main>

      {/* ── Governance footer ── */}
      <footer className="border-t px-5 sm:px-10 py-8" style={{ borderColor: BORDER, background: BG_SOFT }}>
        <div className="max-w-[1180px] mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: MUTED }}>Governance</p>
          <p className="text-[13px] leading-relaxed mb-2" style={{ color: GREY, maxWidth: 760 }}>
            This document represents Fanometrix&rsquo;s current responsible data practices and forms part of the
            Fanometrix Trust Centre.
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: GREY, maxWidth: 760 }}>
            As Fanometrix evolves, this document will be reviewed and updated to reflect changes in platform
            capabilities, Reddit platform policies and industry best practice.
          </p>
          <div className="mt-6 pt-5 border-t" style={{ borderColor: BORDER }}>
            <span className="text-xs" style={{ color: MUTED }}>© {new Date().getFullYear()} Fanometrix · Trust Centre</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

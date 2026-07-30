// ─────────────────────────────────────────────────────────────────────────────
// Publisher Page configuration
//
// One template ([PublisherTemplate]) renders every publisher page. ~90% of the
// page is shared and identical; only the values in PublisherConfig change per
// partner. The canonical marketing page (/for-publishers) uses DEFAULT_CONFIG;
// each partner page (/for-publishers/<slug>) injects its own config into the
// same template.
//
// To add a publisher: add one entry to PUBLISHERS below. No new components,
// no new page implementation. Drop a logo into /public and set `logoSrc` when
// the asset is available; until then the name is used as a text co-brand.
// ─────────────────────────────────────────────────────────────────────────────

export type PublisherConfig = {
  /** URL slug. "" for the canonical /for-publishers page. */
  slug: string;
  /** Display name. "" on the canonical page (brand-neutral). */
  name: string;
  /** True for a personalised partner page (enables co-branding touches). */
  personalised: boolean;
  /** Optional publisher logo in /public (co-brands the header). */
  logoSrc?: string;

  // ── Hero ────────────────────────────────────────────────────────────────
  heroEyebrow: string;
  /** Rendered as separate lines. */
  heroHeadline: string[];
  heroBody: string;

  // ── "What Could Your Audience Tell You?" ─────────────────────────────────
  audienceQuestions: string[];

  // ── Product branding (chrome label on the survey/product visuals) ────────
  /** e.g. "LiveScore"; empty string leaves the visuals brand-neutral. */
  brandLabel: string;

  // ── Benchmarks / case study ──────────────────────────────────────────────
  /** Optional line shown under the benchmark intro to reference their audience. */
  benchmarkNote?: string;

  // ── Calls to action ──────────────────────────────────────────────────────
  joinLabel: string;
  demoLabel: string;
  joinHref: string;
  demoHref: string;

  // ── Optional contact (shown in the FAQ reassurance bridge) ───────────────
  contact?: { name?: string; email?: string };

  // ── Metadata ─────────────────────────────────────────────────────────────
  metaTitle: string;
  metaDescription: string;
};

// The join CTA must land on the "Run Your First Survey" form, which
// /request-access shows only when `from` is exactly "publisher". Publisher
// tracking therefore rides in a separate `publisher` param (not baked into
// `from`). The demo CTA lands on the "Book A Demo" contact form (`intent=demo`).
const RUN_SURVEY = "/request-access?from=publisher";
const BOOK_DEMO  = "/request-access?intent=demo";

// ─── Canonical page (/for-publishers) — the approved, brand-neutral content ───
export const DEFAULT_CONFIG: PublisherConfig = {
  slug: "",
  name: "",
  personalised: false,
  heroEyebrow: "For Publishers",
  heroHeadline: ["Give Football Fans a Voice.", "Give Your Business an Advantage."],
  heroBody:
    "Fanometrix helps football publishers transform supporter opinions into trusted audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
  audienceQuestions: [
    "Which sponsors improve the fan experience?",
    "Which content formats keep supporters engaged?",
    "Which subscriptions would fans genuinely pay for?",
    "Which advertisers do supporters trust most?",
    "What frustrates your audience?",
    "Which innovations excite football supporters?",
    "How does your audience compare across Europe?",
  ],
  brandLabel: "",
  joinLabel: "Become a Publisher Partner",
  demoLabel: "Arrange a Demo",
  joinHref: RUN_SURVEY,
  demoHref: BOOK_DEMO,
  metaTitle: "Become a Fanometrix Publisher Partner, Football Audience Intelligence",
  metaDescription:
    "Fanometrix helps football publishers transform supporter opinions into trusted audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
};

// Builds a personalised config from a small set of overrides, inheriting all
// shared behaviour (CTAs, hrefs with publisher tracking, metadata shape).
function publisher(
  slug: string,
  name: string,
  o: {
    heroHeadline: string[];
    heroBody: string;
    audienceQuestions: string[];
    benchmarkNote?: string;
    logoSrc?: string;
    contact?: { name?: string; email?: string };
  }
): PublisherConfig {
  return {
    slug,
    name,
    personalised: true,
    logoSrc: o.logoSrc,
    heroEyebrow: `Prepared for ${name}`,
    heroHeadline: o.heroHeadline,
    heroBody: o.heroBody,
    audienceQuestions: o.audienceQuestions,
    brandLabel: name,
    benchmarkNote: o.benchmarkNote,
    joinLabel: "Become a Publisher Partner",
    demoLabel: "Arrange a Demo",
    joinHref: `${RUN_SURVEY}&publisher=${slug}`,
    demoHref: `${BOOK_DEMO}&publisher=${slug}`,
    contact: o.contact,
    metaTitle: `Fanometrix for ${name}, Football Audience Intelligence`,
    metaDescription: `${o.heroBody}`,
  };
}

const BENCHMARK_NOTE = (name: string) =>
  `The illustration below uses our current pilot benchmarks. Your ${name} campaign benchmarks would be established together during onboarding.`;

// ─── Partner pages ────────────────────────────────────────────────────────────
export const PUBLISHERS: Record<string, PublisherConfig> = {
  livescore: publisher("livescore", "LiveScore", {
    logoSrc: "/LivescoreLogo.webp",
    heroHeadline: ["Give Your LiveScore Audience a Voice.", "Give Your Business an Advantage."],
    heroBody:
      "Fanometrix helps LiveScore turn the opinions of a global live-football audience into trusted, zero-party audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
    audienceQuestions: [
      "Which competitions do LiveScore users follow most closely?",
      "What would make live match coverage more valuable to fans?",
      "Which features would fans genuinely pay to unlock?",
      "Which brands do live-score users trust most?",
      "What frustrates fans when following matches in real time?",
      "Which new in-app experiences excite supporters?",
      "How does the LiveScore audience compare across Europe?",
    ],
    benchmarkNote: BENCHMARK_NOTE("LiveScore"),
  }),

  planetsport: publisher("planetsport", "Planet Sport", {
    logoSrc: "/PlanetSportLogo.webp",
    heroHeadline: ["Give Your Planet Sport Audience a Voice.", "Give Your Business an Advantage."],
    heroBody:
      "Fanometrix helps Planet Sport turn the opinions of an engaged editorial football audience into trusted, zero-party audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
    audienceQuestions: [
      "Which content formats keep Planet Sport readers coming back?",
      "Which football stories do fans most want to read?",
      "Which subscriptions would readers genuinely pay for?",
      "Which advertisers do Planet Sport readers trust most?",
      "What frustrates readers about football coverage today?",
      "Which editorial innovations excite supporters?",
      "How do reader opinions differ across your titles?",
    ],
    benchmarkNote: BENCHMARK_NOTE("Planet Sport"),
  }),

  flashscore: publisher("flashscore", "Flashscore", {
    logoSrc: "/FlashscoreLogoSmallWhite.webp",
    heroHeadline: ["Give Your Flashscore Audience a Voice.", "Give Your Business an Advantage."],
    heroBody:
      "Fanometrix helps Flashscore turn the opinions of one of football's largest global audiences into trusted, zero-party audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
    audienceQuestions: [
      "Which competitions do Flashscore users follow across the world?",
      "What would make live scores and stats more valuable to fans?",
      "Which premium features would fans genuinely pay for?",
      "Which brands do Flashscore users trust most?",
      "What frustrates fans following football in real time?",
      "Which innovations excite a global football audience?",
      "How do supporter attitudes differ across markets?",
    ],
    benchmarkNote: BENCHMARK_NOTE("Flashscore"),
  }),

  fotmob: publisher("fotmob", "FotMob", {
    logoSrc: "/FotMobLogoSmallWhite.webp",
    heroHeadline: ["Give Your FotMob Audience a Voice.", "Give Your Business an Advantage."],
    heroBody:
      "Fanometrix helps FotMob turn the opinions of a deeply engaged, stats-driven football audience into trusted, zero-party audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
    audienceQuestions: [
      "Which stats and insights do FotMob users value most?",
      "What would make match-following more valuable to fans?",
      "Which premium features would fans pay to unlock?",
      "Which brands do FotMob users trust most?",
      "What frustrates fans about following football today?",
      "Which product innovations excite engaged supporters?",
      "How does the FotMob audience compare across Europe?",
    ],
    benchmarkNote: BENCHMARK_NOTE("FotMob"),
  }),
};

export const PUBLISHER_SLUGS = Object.keys(PUBLISHERS);

export function getPublisherConfig(slug: string): PublisherConfig | null {
  return PUBLISHERS[slug] ?? null;
}

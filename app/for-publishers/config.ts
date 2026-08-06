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

// Template copy that is football/fan/supporter-specific by default but may be
// overridden per publisher (e.g. a non-football, lifestyle network). Every key
// defaults to the approved football wording in PublisherTemplate's
// DEFAULT_TEMPLATE_COPY; a publisher supplies only the keys it wants to change,
// so all other partner pages render byte-identically.
export type TemplateCopy = {
  capStudioBody: string;
  capZeroPartyBody: string;
  capAiBody: string;
  capBenchmarkBody: string;
  capIndustryBody: string;
  capCreativeBody: string;
  fanometrixInsights: string;
  netMarketComparisonBody: string;
  netIndustryTrendsBody: string;
  wayRunOwnBody: string;
  wayIndustryBody: string;
  platformIntro: string;
  complementIntro: string;
  audienceUnderstand: string;
  audienceContribute: string;
  pilotIntro: string;
  pilotValidationBody: string;
  networkCompare: string;
  networkExpand: string;
  businessValueIntro: string;
  faqSurveyExperience: string;
  faqSurveyDuration: string;
  becomePartnerIntro: string;
  closingLead: string;
  closingHighlight: string;
  footerTagline: string;
  // Sample-survey demo (SurveyDemo). Optional: when omitted the demo falls back
  // to its own football defaults, so only an overriding publisher changes it.
  demoInviteTitle?: string;
  demoThankYou?: string;
  demoQuestions?: { q: string; options: string[] }[];
};

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

  // ── Optional per-publisher copy overrides (see TemplateCopy) ──────────────
  copy?: Partial<TemplateCopy>;
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
    /** Override the default "…, Football Audience Intelligence" meta title. */
    metaTitle?: string;
    /** Per-publisher copy overrides (see TemplateCopy). */
    copy?: Partial<TemplateCopy>;
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
    metaTitle: o.metaTitle ?? `Fanometrix for ${name}, Football Audience Intelligence`,
    metaDescription: `${o.heroBody}`,
    copy: o.copy,
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

  // Hearst is a network of lifestyle and cultural publications, not a football
  // publisher — so its page is fully de-footballed via `copy` overrides. No
  // mention of football, fans or supporters; the language is generic to any
  // audience-led internet publisher (readers / audiences / brands).
  hearst: publisher("hearst", "Hearst", {
    logoSrc: "/HearstLogoTiny.webp",
    heroHeadline: ["Give Your Hearst Audience a Voice.", "Give Your Business an Advantage."],
    heroBody:
      "Fanometrix helps Hearst turn the opinions of the audiences across its brands into trusted, zero-party audience intelligence through survey research, AI-powered analysis and industry benchmarking.",
    audienceQuestions: [
      "Which content formats keep Hearst readers coming back?",
      "Which topics and stories do your audiences most want to read?",
      "Which subscriptions would readers genuinely pay for?",
      "Which advertisers and brands do Hearst audiences trust most?",
      "What frustrates readers about the experience today?",
      "Which editorial and product innovations excite your audiences?",
      "How do reader opinions differ across your brands and markets?",
    ],
    benchmarkNote: BENCHMARK_NOTE("Hearst"),
    metaTitle: "Fanometrix for Hearst, Audience Intelligence",
    copy: {
      capStudioBody: "Create, launch and manage your own audience surveys through the Fanometrix platform.",
      capZeroPartyBody: "Collect trusted information directly from your readers through consent-first research.",
      capAiBody: "Transform thousands of reader responses into clear, actionable audience intelligence.",
      capBenchmarkBody: "Compare your audience against wider network benchmarks.",
      capIndustryBody: "Contribute to collaborative research projects undertaken across the Fanometrix publisher network.",
      capCreativeBody: "Purpose-built creative designed to maximise engagement while protecting the reader experience.",
      fanometrixInsights: "Audience-specific insights",
      netMarketComparisonBody: "Explore differences in reader attitudes across brands, categories and regions.",
      netIndustryTrendsBody: "Track how audience opinions evolve through continuous research.",
      wayRunOwnBody: "Launch unlimited audience research through Fanometrix and build your own zero-party audience intelligence.",
      wayIndustryBody: "Opt in to collaborative industry-wide research using your house inventory. Receive benchmark data and audience intelligence alongside other publisher partners.",
      platformIntro: "Becoming a Publisher Partner gives you access to a complete audience intelligence platform designed specifically for publishers.",
      complementIntro: "Fanometrix complements existing survey platforms by transforming individual research campaigns into a growing body of audience intelligence.",
      audienceUnderstand: "The more you understand your readers, the better your commercial, editorial and product decisions become.",
      audienceContribute: "Every survey contributes to a growing body of audience intelligence that becomes more valuable over time.",
      pilotIntro: "Before opening Fanometrix to publisher partners, we conducted a pilot across four publishers spanning multiple European markets. The pilot enabled us to validate the platform, optimise the survey experience and establish our initial performance benchmarks. The illustration below represents a typical two to four week campaign based on those benchmarks. Actual performance will vary depending on audience, placement, survey design and campaign duration.",
      pilotValidationBody: "These benchmark assumptions were established through a real-world pilot across four publishers and multiple European markets.",
      networkCompare: "Every publisher understands their own audience. Fanometrix helps you understand how your audience compares with readers across the wider market.",
      networkExpand: "As more publisher partners join the network, every campaign contributes to an expanding body of audience intelligence that no individual publisher could create alone.",
      businessValueIntro: "Fanometrix supports commercial, editorial, product and leadership teams by providing trusted audience intelligence collected directly from your readers.",
      faqSurveyExperience: "See exactly what your readers experience. From invitation to thank you, the survey is deliberately lightweight and clean, designed to sit comfortably within your audience's experience.",
      faqSurveyDuration: "This helps reach a broader cross-section of readers and produces more representative audience intelligence.",
      becomePartnerIntro: "Join a growing network of publishers helping to build the future of audience intelligence.",
      closingLead: "Your readers share their time, attention and loyalty with your brands every day. Fanometrix exists to ensure their voices help shape better decisions for publishers, brands and the wider industry through ",
      closingHighlight: "trusted audience intelligence",
      footerTagline: "Audience intelligence, built from consent-first reader research, AI-powered analysis and industry benchmarking.",
      demoInviteTitle: "A quick question for readers",
      demoThankYou: "Your response helps publishers better understand their readers.",
      demoQuestions: [
        { q: "How often do you read Hearst titles?", options: ["Every day", "A few times a week", "Most weeks", "Occasionally"] },
        { q: "What matters most in your reading experience?", options: ["Quality of writing", "Range of topics", "Ad experience", "Ease of use"] },
      ],
    },
  }),
};

export const PUBLISHER_SLUGS = Object.keys(PUBLISHERS);

export function getPublisherConfig(slug: string): PublisherConfig | null {
  return PUBLISHERS[slug] ?? null;
}

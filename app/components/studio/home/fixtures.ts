// ── Survey Studio Home — preview harness ─────────────────────────────────────
// Representative, clearly-labelled SAMPLE data so the adaptive Home's states can
// be visually validated before real data exists in every shape. Reached only via
// ?preview=<state> (see useStudioHome); it never touches production data and is
// never shown without the "Preview — sample data" banner.
//
//   ?preview=new         — new organisation (lead with the CTA + entitled intel)
//   ?preview=established  — established org, nothing live (intelligence-led)
//   ?preview=live         — live research + performance rise above intelligence
//   ?preview=attention    — an actionable item rises to the very top
//
// Optional ?as=create|request forces the permission-aware CTA for the demo.

import type {
  StudioHomeData, CtaMode, ProjectCard, FindingCard, ReportItem, ActivityItem, AttentionItem,
} from "./types";

export const PREVIEW_STATES = ["new", "established", "live", "attention"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

export function isPreviewState(v: string | null): v is PreviewState {
  return v != null && (PREVIEW_STATES as readonly string[]).includes(v);
}

// Relative timestamps so timeAgo() reads naturally whenever the preview is opened.
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const DISCOVER = "/survey-studio/discover";

function project(p: Partial<ProjectCard> & { id: string; name: string }): ProjectCard {
  return {
    status: "live", totalResponses: 0, target: null, completionPct: null,
    publisherCount: 0, countryCount: 0, lastResponseAt: null,
    href: `/research-projects/${p.id}`, discoverHref: `${DISCOVER}?project=${p.id}`,
    ...p,
  };
}

function finding(f: Partial<FindingCard> & { id: string; headline: string; projectName: string }): FindingCard {
  return {
    projectId: f.id, aspect: null, need: null, detail: null,
    confidence: null, evidenceStrength: null, base: null,
    href: `${DISCOVER}?project=${f.id}`, ...f,
  };
}

// ── Shared sample intelligence (entitled published findings) ──────────────────
const SAMPLE_INTELLIGENCE: FindingCard[] = [
  finding({
    id: "f-01", projectName: "Matchday Companion — Second-Screen Behaviour", aspect: "Engagement",
    headline: "Fans check live scores a median of 7 times per match, peaking at half-time.",
    detail: "Second-screen checking clusters in the 5 minutes either side of the whistle across all competitions.",
    confidence: "high", evidenceStrength: "strong", base: 2140,
  }),
  finding({
    id: "f-02", projectName: "Fantasy Football Motivations 2026", aspect: "Motivation",
    headline: "Bragging rights, not prizes, is the primary driver of fantasy participation for 63% of players.",
    detail: "Social competition within a known friend group outranks cash prizes and official rewards.",
    confidence: "high", evidenceStrength: "strong", base: 1780,
  }),
  finding({
    id: "f-03", projectName: "Women's Football Audience Study", aspect: "Audience",
    headline: "41% of new women's-football followers came to the sport in the last two seasons.",
    detail: "This cohort skews younger and is markedly more likely to follow players over clubs.",
    confidence: "moderate", evidenceStrength: "moderate", base: 1320,
  }),
  finding({
    id: "f-04", projectName: "Streaming & Rights Willingness-to-Pay", aspect: "Commercial",
    headline: "Bundling a club channel with highlights lifts stated willingness-to-pay by 28%.",
    detail: "Standalone match passes underperform bundles across every market tested.",
    confidence: "moderate", evidenceStrength: "moderate", base: 960,
  }),
];

const SAMPLE_REPORTS: ReportItem[] = [
  { id: "r-01", projectName: "Fantasy Football Motivations 2026", label: "Executive report", at: ago(60 * 30), href: `${DISCOVER}?report=r-01` },
  { id: "r-02", projectName: "Women's Football Audience Study", label: "Key findings", at: ago(60 * 60), href: `${DISCOVER}?report=r-02` },
  { id: "r-03", projectName: "Matchday Companion — Second-Screen Behaviour", label: "Conclusion", at: ago(60 * 120), href: `${DISCOVER}?report=r-03` },
];

const SAMPLE_CONCLUDED: ProjectCard[] = [
  project({ id: "p-c1", name: "Fantasy Football Motivations 2026", status: "closed", totalResponses: 1780, publisherCount: 3, countryCount: 4, lastResponseAt: ago(60 * 30) }),
  project({ id: "p-c2", name: "Women's Football Audience Study", status: "closed", totalResponses: 1320, publisherCount: 2, countryCount: 6, lastResponseAt: ago(60 * 60) }),
  project({ id: "p-c3", name: "Streaming & Rights Willingness-to-Pay", status: "archived", totalResponses: 960, publisherCount: 4, countryCount: 8, lastResponseAt: ago(60 * 200) }),
];

const SAMPLE_LIVE: ProjectCard[] = [
  project({ id: "p-l1", name: "Transfer Window Sentiment Tracker", status: "live", totalResponses: 3420, target: 5000, completionPct: 68, publisherCount: 5, countryCount: 9, lastResponseAt: ago(12) }),
  project({ id: "p-l2", name: "Matchday Ticketing Friction", status: "live", totalResponses: 610, target: 1500, completionPct: 41, publisherCount: 2, countryCount: 3, lastResponseAt: ago(90) }),
  project({ id: "p-l3", name: "Broadcast Punditry Preferences", status: "scheduled", totalResponses: 0, target: 2000, completionPct: 0, publisherCount: 1, countryCount: 2, lastResponseAt: null }),
];

const SAMPLE_ACTIVITY: ActivityItem[] = [
  { key: "a1", kind: "project", label: "Research project created", title: "Transfer Window Sentiment Tracker", at: ago(60 * 26), href: "/research-projects/p-l1" },
  { key: "a2", kind: "campaign", label: "Campaign went live", title: "Matchday Ticketing — FotMob", at: ago(60 * 30), href: "/campaigns" },
  { key: "a3", kind: "project", label: "Report published", title: "Fantasy Football Motivations 2026", at: ago(60 * 30), href: "/research-projects/p-c1" },
];

function base(ctaMode: CtaMode, preview: PreviewState): StudioHomeData {
  return {
    loading: false, hasActivity: true, ctaMode, preview,
    attention: [], liveResearch: [], performance: [],
    intelligence: [], research: [], reports: [], activity: [],
  };
}

export function previewData(state: PreviewState, ctaMode: CtaMode): StudioHomeData {
  switch (state) {
    case "new":
      // No operational or concluded work yet — but the org is entitled to shared
      // Fanometrix intelligence. hasActivity=false triggers the CTA-led lead-in.
      return { ...base(ctaMode, state), hasActivity: false, intelligence: SAMPLE_INTELLIGENCE.slice(0, 3) };

    case "established":
      // Nothing live: lead with Latest Intelligence, recent research and reports.
      return {
        ...base(ctaMode, state),
        intelligence: SAMPLE_INTELLIGENCE,
        research: SAMPLE_CONCLUDED,
        reports: SAMPLE_REPORTS,
        activity: SAMPLE_ACTIVITY,
      };

    case "live":
      // Live Research and its Performance rise above Intelligence.
      return {
        ...base(ctaMode, state),
        liveResearch: SAMPLE_LIVE,
        performance: [
          { name: "Transfer Window Sentiment Tracker", value: 3420, live: true },
          { name: "Matchday Ticketing Friction", value: 610, live: true },
          { name: "Fantasy Football Motivations 2026", value: 1780, live: false },
        ],
        intelligence: SAMPLE_INTELLIGENCE.slice(0, 3),
        research: SAMPLE_CONCLUDED.slice(0, 2),
        reports: SAMPLE_REPORTS.slice(0, 2),
        activity: SAMPLE_ACTIVITY,
      };

    case "attention":
      // An actionable item rises to the very top, above live research.
      return {
        ...base(ctaMode, state),
        attention: attentionItems(ctaMode),
        liveResearch: SAMPLE_LIVE,
        performance: [
          { name: "Transfer Window Sentiment Tracker", value: 3420, live: true },
          { name: "Matchday Ticketing Friction", value: 610, live: true },
        ],
        intelligence: SAMPLE_INTELLIGENCE.slice(0, 3),
        research: SAMPLE_CONCLUDED.slice(0, 2),
        reports: SAMPLE_REPORTS.slice(0, 1),
        activity: SAMPLE_ACTIVITY,
      };
  }
}

function attentionItems(ctaMode: CtaMode): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: "awaiting",
      title: "Broadcast Punditry Preferences is live but has no responses yet",
      detail: "Scheduled and deployed, but nothing has come in — check the campaign is embedded.",
      href: "/research-projects/p-l3",
      action: "Open workspace",
    },
  ];
  if (ctaMode === "create") {
    items.unshift({
      key: "drafts",
      title: "2 surveys are still in draft",
      detail: "Finish them and mark them ready to deploy to your publishers.",
      href: "/survey-templates",
      action: "Continue drafts",
    });
  }
  return items;
}

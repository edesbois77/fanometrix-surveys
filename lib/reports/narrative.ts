// Narrative profiles: who a report is written for.
//
// The measurement engine is audience-neutral and stays that way. The numbers a
// publisher, a brand, an agency and an internal reader see are identical,
// because they are the same numbers. What differs is the order sections appear
// in, which of them appear at all, who the copy addresses, and what the report
// treats as the point.
//
// This module is the seam. Adding a brand report is a profile here plus a value
// in partner_reports.audience — never a change to engine.ts, and never a second
// way of calculating anything.
//
// Only `publisher` is filled in for v1. The others resolve to it with their own
// framing left explicitly unwritten rather than quietly approximated, so nobody
// ships a brand report that is a publisher report with the names swapped.

export type ReportAudience = "publisher" | "brand" | "agency" | "internal";

export type SectionId =
  | "highlights"
  | "executive-summary"
  | "what-fans-told-us"
  | "creative-gallery"
  | "creative-comparison"
  | "country-performance"
  | "engagement-trends"
  | "audience-reach"
  | "what-we-learned"
  | "value-delivered"
  | "recommendations"
  | "downloads"
  | "methodology";

export type NarrativeProfile = {
  audience: ReportAudience;
  /** Section order. Sections with no content are dropped at render time, and
   *  the numbering closes up behind them. */
  order: SectionId[];
  /** Section titles and standfirsts. A standfirst's job is to say why the
   *  section is in front of this particular reader. */
  copy: Record<SectionId, { eyebrow: string; title: string; standfirst?: string }>;
  /** Whether the report is allowed to talk about the reader's own commercial
   *  position. A brand report must not; a publisher report should. */
  addressesInventory: boolean;
};

const PUBLISHER: NarrativeProfile = {
  audience: "publisher",
  // Insight first, method last. A publisher opens this to find out what their
  // audience said and what to do about it; how it was collected matters, but it
  // is not what they came for and it should not stand between them and the
  // answer.
  order: [
    "highlights",
    "executive-summary",
    "what-fans-told-us",
    "creative-gallery",
    "creative-comparison",
    "country-performance",
    "engagement-trends",
    "audience-reach",
    "what-we-learned",
    "value-delivered",
    "recommendations",
    "downloads",
    "methodology",
  ],
  addressesInventory: true,
  copy: {
    "highlights": {
      eyebrow: "Highlights",
      title: "What we learned together",
    },
    "executive-summary": {
      eyebrow: "Executive Summary",
      title: "What to do differently, and the numbers behind it",
      standfirst:
        "Everything after this page is the evidence for these decisions. If you read nothing else, read this one.",
    },
    "what-fans-told-us": {
      eyebrow: "What Fans Told Us",
      title: "What your audience actually said",
      standfirst:
        "Every completed response, in full. This is what your readers think about sponsorship, in their own answers rather than inferred from behaviour.",
    },
    "creative-gallery": {
      eyebrow: "The Creative",
      title: "What fans were shown",
      standfirst:
        "The survey units that ran on your inventory, exactly as a reader saw them. The comparison that follows is between these.",
    },
    "creative-comparison": {
      eyebrow: "Creative Comparison",
      title: "Which format earned more from the same inventory",
      standfirst:
        "Both formats ran the same questions, on the same inventory, in the same market. Every measure is per impression, so a difference in delivery volume cannot flatter either one.",
    },
    "country-performance": {
      eyebrow: "Country Performance",
      title: "Where your audience answered",
      standfirst:
        "Each market indexed against this campaign's own average, set at 100. This is a market against the campaign it belongs to, never against another publisher.",
    },
    "engagement-trends": {
      eyebrow: "Engagement Trends",
      title: "When your audience is reachable",
      standfirst:
        "Every hour in the reader's own local time, so this is a scheduling input rather than a server log.",
    },
    "audience-reach": {
      eyebrow: "Audience Reach",
      title: "How the sample was built",
      standfirst:
        "Two funnels, each with one denominator. Delivery is measured against impressions; the survey is measured against the fans who started it.",
    },
    "what-we-learned": {
      eyebrow: "What We Learned",
      title: "What the evidence supports, and what it does not",
      standfirst:
        "Two lists, deliberately separate. The first is what the data establishes. The second is what it is consistent with but has not proved.",
    },
    "value-delivered": {
      eyebrow: "Value Delivered",
      title: "What this partnership produced",
      standfirst:
        "Research on publisher inventory is not an interruption to the reading experience. Done well, it is a second product the same audience produces.",
    },
    "recommendations": {
      eyebrow: "Recommendations",
      title: "What to do differently next time",
      standfirst:
        "Each of these is a decision someone can take this quarter, with the number it rests on and what it is worth.",
    },
    "downloads": {
      eyebrow: "Downloads",
      title: "Take the data with you",
      standfirst:
        "The full dataset behind every figure, in the formats an analyst and a board deck each need.",
    },
    "methodology": {
      eyebrow: "Methodology",
      title: "How these numbers were produced",
      standfirst:
        "A report that cannot be checked is not research. This is what was measured, how, and where the limits are.",
    },
  },
};

const PROFILES: Record<ReportAudience, NarrativeProfile> = {
  publisher: PUBLISHER,
  // Not yet written. Each of these needs its own order and its own copy: a
  // brand report leads with what the answers mean for the brief and must not
  // discuss the publisher's inventory position at all; an agency report adds
  // delivery accountability; the internal one keeps the caveats in the body
  // rather than the methodology. Falling back to the publisher profile is a
  // placeholder, and the audience field on the report says which it really is.
  brand: PUBLISHER,
  agency: PUBLISHER,
  internal: PUBLISHER,
};

export function profileFor(audience: ReportAudience): NarrativeProfile {
  return PROFILES[audience] ?? PUBLISHER;
}

export function isImplementedAudience(audience: ReportAudience): boolean {
  return audience === "publisher";
}

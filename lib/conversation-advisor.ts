// Conversation Advisor — the consultant briefing that fronts Conversation
// Intelligence (docs/conversation-advisor.md). The researcher commissions
// research; they do not configure a search engine. This module is client- and
// server-safe: the types, the internal→consultancy-language mapping, and the
// presentation helpers live here so the analyst, the API and the briefing UI
// share one definition.
//
// The engine reasons in recommendation STATES; the UI only ever shows
// consultancy LANGUAGE. Information Needs are the internal, durable unit of
// research; Research Themes (= Research Aspects) are the primary UX and each
// contains one or more needs.

import type { SearchStrategy } from "@/lib/search-strategy";
import type { InformationNeeds } from "@/lib/information-needs";

// Information Needs are now a platform-level concept (lib/information-needs.ts).
// Re-exported here so existing Conversation Advisor importers keep one import
// surface; new consumers (Survey, Library) should import from information-needs.
export type { MethodFit, InformationNeed, ResearchTheme, InformationNeeds, FlatNeed } from "@/lib/information-needs";
export { METHOD_FIT_LABEL, METHOD_FIT_TONE, allNeeds, flattenNeeds } from "@/lib/information-needs";

// ── Recommendation state (internal) ──────────────────────────────────────────
export type RecommendationState =
  | "proceed"                 // conversations are right for all of it
  | "proceed_plus_complement" // right for most; part needs another method too
  | "reframe_first"           // the question holds distinct objectives — split
  | "redirect";               // conversations aren't the right primary method

// A complementary/alternative method the advisor may hand off to.
export type ComplementMethod = "survey" | "document" | "news" | "interview";

export const METHOD_LABEL: Record<ComplementMethod, string> = {
  survey: "Survey", document: "Research Library", news: "News", interview: "Interviews",
};

export type PlatformRecommendation = {
  platform: string;      // must match a lib/social-taxonomy PLATFORMS id
  recommended: boolean;
  rationale: string;     // why recommended, or why not
};

// An actionable challenge — the difference between an assistant and a specialist.
export type ChallengeAction = "split_studies" | "add_survey" | "switch_method" | "refine_question";
export type AdvisorChallenge = {
  type: "reframe" | "method_handoff" | "sharpen";
  message: string;
  target_method: ComplementMethod | null;
  action: ChallengeAction;
  action_label: string;  // e.g. "Split into two studies"
};

export type ConversationRecommendation = {
  state: RecommendationState;
  headline: string;                         // the consultant's one-line verdict
  rationale: string;                        // why Conversation Intelligence (or not)
  can_answer: string;                       // what it can establish
  cannot_answer: string;                    // what it cannot
  complementary_method: ComplementMethod | null;
  platforms: PlatformRecommendation[];
  limitations: string[];
  challenges: AdvisorChallenge[];
  generated_at: string | null;
  model: string | null;
  edited: boolean;
};

// The full generated briefing (in memory). On save it is split across three
// columns on social_searches: recommendation, information_needs, search_strategy.
export type ConversationAdvisorBriefing = {
  recommendation: ConversationRecommendation;
  information_needs: InformationNeeds;
  strategy: SearchStrategy;
};

// ── Internal state → consultancy language ────────────────────────────────────
// The UI must never print a raw state. This is the single source of the labels.
export function recommendationLabel(
  rec: Pick<ConversationRecommendation, "state" | "complementary_method">,
): string {
  switch (rec.state) {
    case "proceed":                 return "Recommended";
    case "proceed_plus_complement": return `Recommended with ${METHOD_LABEL[rec.complementary_method ?? "survey"]}`;
    case "reframe_first":           return "We recommend refining the question";
    case "redirect":                return "We recommend a different method";
  }
}

// The character of the recommendation, for the InsightPanel/AIRecommendation tone.
export function recommendationTone(state: RecommendationState): "positive" | "opportunity" | "concern" {
  switch (state) {
    case "proceed":                 return "positive";
    case "proceed_plus_complement": return "opportunity";
    case "reframe_first":
    case "redirect":                return "concern";
  }
}

// Whether the recommendation endorses proceeding with conversation research.
export function recommendsProceeding(state: RecommendationState): boolean {
  return state === "proceed" || state === "proceed_plus_complement";
}

export function emptyRecommendation(): ConversationRecommendation {
  return {
    state: "proceed", headline: "", rationale: "", can_answer: "", cannot_answer: "",
    complementary_method: null, platforms: [], limitations: [], challenges: [],
    generated_at: null, model: null, edited: false,
  };
}

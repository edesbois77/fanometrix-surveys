// The Research Design — a first-class, stored project artefact that decides WHAT
// EVIDENCE IS WORTH COLLECTING before any collecting begins.
//
//   Commission → Research Design → Evidence Strategy → Searches → Collection → Analysis
//
// TWO SEPARATE CONCEPTS, deliberately not collapsed:
//
//   Evidence Requirement   WHAT we need to learn
//   Evidence Strategy      HOW Fanometrix proposes to obtain it
//
// Jumping straight from a requirement to a set of searches is what produced
// keyword-led research. A requirement states the need; its strategy recommends the
// research methods, and only the conversation method carries concrete searches.
//
// SOURCE-AGNOSTIC BY CONSTRUCTION. Conversation Intelligence is the only consumer
// today, but the design must never become a conversation-search generator. Survey
// Research, the Research Library, industry reports, academic research, news and
// trends are all recommendable methods, so new evidence sources slot in without
// reshaping the artefact or touching its consumers.
//
// Client- and server-safe: pure types + helpers, no I/O.
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// The evidence-producing methods the design can recommend. The platform
// RECOMMENDS how evidence should be gathered; it does not pick a single method.
// Only `conversation` generates concrete proposals today; the rest are reasoned
// about and carried, so the design is a programme view, not a listening plan.
export type ResearchMethod =
  | "conversation" | "survey" | "library" | "industry_report" | "academic" | "news" | "trends";

export const RESEARCH_METHODS: ResearchMethod[] = [
  "conversation", "survey", "library", "industry_report", "academic", "news", "trends",
];

export const RESEARCH_METHOD_LABEL: Record<ResearchMethod, string> = {
  conversation: "Conversation Intelligence",
  survey: "Survey Research",
  library: "Research Library",
  industry_report: "Industry & Analyst Reports",
  academic: "Academic Research",
  news: "News Coverage",
  trends: "Trend Analysis",
};

export const RESEARCH_METHOD_DESCRIPTION: Record<ResearchMethod, string> = {
  conversation: "Unprompted public conversation, what people say when nobody is asking.",
  survey: "Direct measurement of what conversation cannot reach, asked of a defined audience.",
  library: "Documents and prior research already held for this engagement.",
  industry_report: "Published industry, analyst and market research on the category.",
  academic: "Peer-reviewed research on the underlying behaviour or effect.",
  news: "Editorial coverage of the brand, category or competition.",
  trends: "Search and interest patterns over time.",
};

// How much evidence a requirement is realistically likely to yield. Recorded in
// the DESIGN, before collection, so futile work is never commissioned.
export type EvidenceAvailability = "high" | "moderate" | "low" | "none";

export const EVIDENCE_AVAILABILITY_LABEL: Record<EvidenceAvailability, string> = {
  high: "Widely available", moderate: "Some available", low: "Scarce", none: "Not available",
};

// A benchmark brand or property, with the reason it earns its place.
export type Comparator = { name: string; why: string };

// A conversation search the design proposes. Carries everything a search needs to
// be created without further human input (Phase 3).
export type ProposedSearch = {
  name: string;
  intent: string;                 // what it is trying to surface
  primary_entity: string | null;  // the anchor the relevance test judges against
  keywords: string[];
  platforms: string[];
  markets: string[];
  languages: string[];
  expected_availability: EvidenceAvailability;
};

export type MethodRecommendation = {
  method: ResearchMethod;
  fit: MethodFit;                        // reuses the shared four-verdict model
  rationale: string;                     // why this method can (or cannot) answer it
  conversation_searches?: ProposedSearch[]; // conversation method only, today
};

// HOW we propose to obtain a requirement's evidence. Separate from the
// requirement itself, which states only what we need to learn.
export type EvidenceStrategy = {
  recommended_methods: MethodRecommendation[];
  comparators: Comparator[];             // comparative requirements only
  rationale: string;                     // why this is the right way to obtain it
};

// WHAT we need to learn. Carries no collection detail.
export type EvidenceRequirement = {
  role: EvidenceRole;                    // direct | comparative | strategic
  requirement: string;
  why_it_matters: string;                // how it serves the decision
  aspect: string | null;                 // the Research Aspect it maps to, shared with Analysis
  information_needs: string[];           // the answerable sub-questions it covers
  expected_availability: EvidenceAvailability;
  availability_note: string;             // honest reasoning on whether it exists to be found
  evidence_strategy: EvidenceStrategy;   // HOW we propose to obtain it
};

export type ResearchDesignStatus = "draft" | "approved";

export type ResearchDesign = {
  research_question: string | null;
  research_objective: string | null;
  commercial_context: string | null;     // from the commission, where available
  strategy_summary: string;              // the overall strategy, stated plainly
  requirements: EvidenceRequirement[];
  not_worth_attempting: string[];        // deliberately not chased, and why
  // The approval gate: the user approves the STRATEGY, never the search terms.
  status: ResearchDesignStatus;
  approved_at: string | null;
  approved_by: string | null;
  generated_at: string | null;
  model: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Every conversation search the design proposes, flattened with the context each
 *  search must inherit when it is created (Phase 3). Carries requirement_index so
 *  a search is tied to the exact requirement that asked for it: matching on role
 *  and aspect double-counts whenever two requirements share them. */
export type ProposedSearchPlan = {
  search: ProposedSearch;
  role: EvidenceRole;
  aspect: string | null;
  information_needs: string[];
  requirement_index: number;
};

export function proposedConversationSearches(design: ResearchDesign | null | undefined): ProposedSearchPlan[] {
  const out: ProposedSearchPlan[] = [];
  (design?.requirements ?? []).forEach((r, requirement_index) => {
    for (const m of r.evidence_strategy?.recommended_methods ?? []) {
      if (m.method !== "conversation") continue;
      for (const s of m.conversation_searches ?? []) {
        out.push({ search: s, role: r.role, aspect: r.aspect, information_needs: r.information_needs, requirement_index });
      }
    }
  });
  return out;
}

/** Requirements grouped by role, in a stable reading order. */
export function requirementsByRole(design: ResearchDesign | null | undefined): Record<EvidenceRole, EvidenceRequirement[]> {
  const out: Record<EvidenceRole, EvidenceRequirement[]> = { direct: [], comparative: [], strategic: [] };
  for (const r of design?.requirements ?? []) out[r.role]?.push(r);
  return out;
}

/** Distinct methods the design recommends across every requirement. */
export function recommendedMethods(design: ResearchDesign | null | undefined): ResearchMethod[] {
  const seen = new Set<ResearchMethod>();
  for (const r of design?.requirements ?? []) {
    for (const m of r.evidence_strategy?.recommended_methods ?? []) {
      if (m.fit !== "not_suitable") seen.add(m.method);
    }
  }
  return RESEARCH_METHODS.filter(m => seen.has(m));
}

export const isApproved = (d: ResearchDesign | null | undefined): boolean => d?.status === "approved";

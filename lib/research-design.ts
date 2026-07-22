// The Research Design — a first-class, stored project artefact that decides WHAT
// EVIDENCE IS WORTH COLLECTING before any collecting begins.
//
//   Commission → Research Design → Evidence Strategy → Searches → Collection → Analysis
//
// SOURCE-AGNOSTIC BY CONSTRUCTION. Conversation Intelligence is the only consumer
// today, but the design must never become a conversation-search generator. So an
// EvidenceRequirement does NOT own searches: it owns METHOD RECOMMENDATIONS, and
// searches hang off the conversation method. Survey studies, document research,
// news collection and trend analysis slot in as further methods without
// reshaping the object or touching its consumers.
//
// Client- and server-safe: pure types + helpers, no I/O.
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// The evidence-producing methods the design can recommend. Only `conversation`
// generates concrete proposals today; the rest are reasoned about and carried so
// the design is already a whole-programme view, not a listening plan.
export type ResearchMethod = "conversation" | "survey" | "document" | "news" | "trends";

export const RESEARCH_METHODS: ResearchMethod[] = ["conversation", "survey", "document", "news", "trends"];

export const RESEARCH_METHOD_LABEL: Record<ResearchMethod, string> = {
  conversation: "Conversation Intelligence",
  survey: "Survey Research",
  document: "Document Research",
  news: "News Coverage",
  trends: "Trend Analysis",
};

// How much evidence a requirement is realistically likely to yield. Recorded in
// the DESIGN, before collection, so futile work is never commissioned.
export type EvidenceAvailability = "high" | "moderate" | "low" | "none";

export const EVIDENCE_AVAILABILITY_LABEL: Record<EvidenceAvailability, string> = {
  high: "Widely available", moderate: "Some available", low: "Scarce", none: "Not available",
};

// A benchmark brand or property, with the reason it earns its place.
export type Comparator = { name: string; why: string };

// A conversation search the design proposes. It carries everything a search needs
// to be created without further human input (Phase 3).
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

export type EvidenceRequirement = {
  role: EvidenceRole;                    // direct | comparative | strategic
  requirement: string;
  why_it_matters: string;                // how it serves the decision
  aspect: string | null;                 // the Research Aspect it maps to, shared with Analysis
  information_needs: string[];           // the answerable sub-questions it covers
  expected_availability: EvidenceAvailability;
  availability_note: string;             // honest reasoning on whether it exists to be found
  comparators: Comparator[];             // comparative requirements only
  methods: MethodRecommendation[];
};

export type ResearchDesignStatus = "draft" | "approved";

export type ResearchDesign = {
  research_question: string | null;
  research_objective: string | null;
  commercial_context: string | null;     // from the commission, where available
  evidence_strategy: string;             // the strategy stated plainly
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

/** Every conversation search the design proposes, flattened with the role and
 *  comparator context each search must inherit when it is created (Phase 3). */
export function proposedConversationSearches(
  design: ResearchDesign | null | undefined,
): { search: ProposedSearch; role: EvidenceRole; aspect: string | null; information_needs: string[] }[] {
  const out: { search: ProposedSearch; role: EvidenceRole; aspect: string | null; information_needs: string[] }[] = [];
  for (const r of design?.requirements ?? []) {
    for (const m of r.methods) {
      if (m.method !== "conversation") continue;
      for (const s of m.conversation_searches ?? []) {
        out.push({ search: s, role: r.role, aspect: r.aspect, information_needs: r.information_needs });
      }
    }
  }
  return out;
}

/** Requirements grouped by role, in a stable reading order. */
export function requirementsByRole(design: ResearchDesign | null | undefined): Record<EvidenceRole, EvidenceRequirement[]> {
  const out: Record<EvidenceRole, EvidenceRequirement[]> = { direct: [], comparative: [], strategic: [] };
  for (const r of design?.requirements ?? []) out[r.role]?.push(r);
  return out;
}

export const isApproved = (d: ResearchDesign | null | undefined): boolean => d?.status === "approved";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The social_searches ids attached to a Research Project as evidence
 * (evidence_type = 'social_search'). For a social-search evidence row the
 * evidence_id IS the social_searches.id, which is also social_mentions.search_id
 * — so these ids scope the existing conversation aggregation (stats/reports) to
 * one project without changing that aggregation logic.
 */
export async function getProjectSocialSearchIds(projectId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_id")
    .eq("research_project_id", projectId)
    .eq("evidence_type", "social_search");
  return (data ?? []).map(r => r.evidence_id as string).filter(Boolean);
}

/**
 * The Evidence Validation gate (docs/evidence-validation-blueprint.md): the
 * project's conversation searches whose evidence is APPROVED and therefore feeds
 * Analysis and Reports. Approved OR Archived counts — Archive freezes collection
 * but preserves the prior approval. Every project-scoped read that feeds
 * interpretation (aspect synthesis, key findings, reports) uses THIS, not
 * getProjectSocialSearchIds; Dashboard monitoring stays ungated and uses the
 * unfiltered list. Individual conversations are additionally gated by
 * `excluded = false` on the mention query.
 */
export async function getApprovedProjectSocialSearchIds(projectId: string): Promise<string[]> {
  const ids = await getProjectSocialSearchIds(projectId);
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("social_searches")
    .select("id")
    .in("id", ids)
    .in("review_status", ["approved", "archived"]);
  return (data ?? []).map(r => r.id as string);
}

/** The settled review states whose evidence Analysis always consumes. 'archived'
 *  counts because archiving freezes collection but PRESERVES a prior approval
 *  (lib/evidence-review.ts). 'pending_approval' is NOT here: it is eligible only
 *  conditionally — see isAnalysisEligible. */
export const SETTLED_ELIGIBLE_REVIEW_STATES = ["approved", "archived"] as const;

/** Just the fields the eligibility rule reads, so it can be decided as a pure
 *  function and unit-tested without a database. */
export type SearchReviewSnapshot = { reviewStatus: string; approvedAt: string | null };

/**
 * Whether Analysis is entitled to consume a conversation/news search's evidence:
 * "Approved + awaiting re-approval".
 *
 *   - approved / archived            → yes, a settled approval.
 *   - pending_approval, approved once → yes. Every collection run that adds new
 *       evidence reverts an approved search to pending_approval (the delta-review
 *       loop). approveSearch stamps approved_at; submitForApproval leaves it in
 *       place, so a non-null approved_at is the durable proof the search cleared
 *       the bar at least once. It must not silently vanish from Analysis merely
 *       because a later run wants a re-look.
 *   - pending_approval, never approved → NO. This is a first submission awaiting
 *       its first review; it is not trusted yet.
 *   - draft / collecting             → NO. Never reviewed.
 *
 * Excluded searches are not dropped: gather.ts names each in the Evidence
 * Consumption Report (see ineligibleReason) so the exclusion is visible.
 */
export function isAnalysisEligible({ reviewStatus, approvedAt }: SearchReviewSnapshot): boolean {
  if ((SETTLED_ELIGIBLE_REVIEW_STATES as readonly string[]).includes(reviewStatus)) return true;
  if (reviewStatus === "pending_approval") return approvedAt != null;
  return false;
}

/** The plainly-stated reason a not-eligible search was held back, for the Evidence
 *  Consumption Report. Null when the search IS eligible. Two distinct reasons,
 *  because they call for opposite responses: "review it" vs "it will re-appear on
 *  its own once approved". */
export function ineligibleReason(snap: SearchReviewSnapshot): string | null {
  if (isAnalysisEligible(snap)) return null;
  if (snap.reviewStatus === "pending_approval") return "Submitted for approval but not yet approved";
  return "Not yet reviewed for Analysis (draft or collecting)";
}

export type ProjectSearchState = {
  id: string;
  name: string;
  reviewStatus: string;
  /** True once the search has ever been approved (approved_at is set), even if a
   *  later collection run reverted it to pending_approval. */
  previouslyApproved: boolean;
  /** Whether Analysis will consume this search's evidence, per isAnalysisEligible. */
  eligible: boolean;
  /** When not eligible, the reason for the Evidence Consumption Report; else null. */
  ineligibleReason: string | null;
};

/**
 * Every conversation/news search attached to the project, WITH its review state
 * and whether Analysis is entitled to consume it. gather.ts uses this to both
 * gather eligible evidence and report the excluded searches with a reason, so
 * nothing disappears silently.
 */
export async function getProjectSearchStates(projectId: string): Promise<ProjectSearchState[]> {
  const ids = await getProjectSocialSearchIds(projectId);
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("social_searches")
    .select("id, name, review_status, approved_at")
    .in("id", ids);
  return (data ?? []).map(s => {
    const snap: SearchReviewSnapshot = {
      reviewStatus: (s.review_status as string | null) ?? "draft",
      approvedAt: (s.approved_at as string | null) ?? null,
    };
    return {
      id: s.id as string,
      name: (s.name as string | null) ?? "Untitled search",
      reviewStatus: snap.reviewStatus,
      previouslyApproved: snap.approvedAt != null,
      eligible: isAnalysisEligible(snap),
      ineligibleReason: ineligibleReason(snap),
    };
  });
}

/**
 * The Research Question a conversation search's evidence is judged against —
 * the project's research_question, found via the evidence link. Used as the
 * fallback anchor for relevance classification when the search carries no
 * question of its own (its own `description` is preferred when present).
 */
export async function getProjectResearchQuestionForSearch(searchId: string): Promise<string | null> {
  const { data: link } = await supabaseAdmin
    .from("research_project_evidence")
    .select("research_project_id")
    .eq("evidence_id", searchId)
    .eq("evidence_type", "social_search")
    .limit(1)
    .maybeSingle();
  if (!link?.research_project_id) return null;
  const { data: proj } = await supabaseAdmin
    .from("research_projects")
    .select("research_question")
    .eq("id", link.research_project_id)
    .maybeSingle();
  const q = (proj?.research_question as string | null)?.trim();
  return q || null;
}

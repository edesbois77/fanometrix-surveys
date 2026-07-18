// Server-only. The Evidence Validation gate's state machine + audit
// (docs/evidence-validation-blueprint.md). One Conversation Search moves through
//   draft → collecting → pending_approval → approved → archived
// and every transition is recorded in evidence_review_events. Approval is at the
// search level; it advances an approved_watermark so a later run that adds
// genuinely new evidence (first_seen_at > watermark) drops the search back to
// pending_approval — the delta-review loop. Nothing here deletes evidence; the
// append-only base (migration 118) is untouched.
import { supabaseAdmin } from "@/lib/supabase-admin";

export const REVIEW_STATUSES = ["draft", "collecting", "pending_approval", "approved", "archived"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewEvent =
  | "submitted_for_approval" | "approved" | "archived" | "reactivated"
  | "conversation_excluded" | "conversation_restored";

export async function logReviewEvent(
  searchId: string,
  event: ReviewEvent,
  opts: { actor?: string | null; note?: string | null; runId?: string | null; mentionId?: string | null } = {}
): Promise<void> {
  await supabaseAdmin.from("evidence_review_events").insert([{
    search_id: searchId, event,
    actor: opts.actor ?? null, note: opts.note ?? null,
    run_id: opts.runId ?? null, mention_id: opts.mentionId ?? null,
  }]);
}

/** The highest first_seen_at across a search's non-excluded evidence — the mark
 *  an approval covers, so only evidence collected AFTER it needs re-review. Null
 *  when the search has no evidence yet. */
async function maxFirstSeenAt(searchId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("social_mentions")
    .select("first_seen_at")
    .eq("search_id", searchId)
    .eq("excluded", false)
    .order("first_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.first_seen_at as string | null) ?? null;
}

/** A run added genuinely new evidence → the search needs (re-)approval. An
 *  archived search is frozen and never reopened by collection. */
export async function submitForApproval(searchId: string, runId?: string | null): Promise<void> {
  const { data } = await supabaseAdmin
    .from("social_searches").select("review_status").eq("id", searchId).maybeSingle();
  const status = data?.review_status as ReviewStatus | undefined;
  if (status === "archived") return;
  await supabaseAdmin.from("social_searches").update({ review_status: "pending_approval" }).eq("id", searchId);
  await logReviewEvent(searchId, "submitted_for_approval", { runId });
}

/** Approve the search: its Included, relevant evidence now feeds Analysis. The
 *  watermark advances to cover everything collected so far. */
export async function approveSearch(searchId: string, actor?: string | null): Promise<void> {
  const watermark = (await maxFirstSeenAt(searchId)) ?? new Date().toISOString();
  await supabaseAdmin.from("social_searches").update({
    review_status: "approved", approved_at: new Date().toISOString(), approved_by: actor ?? null,
    approved_watermark: watermark,
  }).eq("id", searchId);
  await logReviewEvent(searchId, "approved", { actor });
}

/** Archive: freeze future collection but PRESERVE approval — archived evidence
 *  still feeds Analysis (it was approved). */
export async function archiveSearch(searchId: string, actor?: string | null): Promise<void> {
  await supabaseAdmin.from("social_searches").update({
    review_status: "archived", archived_at: new Date().toISOString(),
  }).eq("id", searchId);
  await logReviewEvent(searchId, "archived", { actor });
}

/** Reactivate an archived search back to Approved so collection can resume. */
export async function reactivateSearch(searchId: string, actor?: string | null): Promise<void> {
  await supabaseAdmin.from("social_searches").update({
    review_status: "approved", archived_at: null,
  }).eq("id", searchId);
  await logReviewEvent(searchId, "reactivated", { actor });
}

/** How many Included conversations were collected AFTER the last approval — the
 *  delta a researcher still has to review. Before first approval, everything
 *  Included counts. */
export async function countEvidenceAwaitingReview(searchId: string, approvedWatermark: string | null): Promise<number> {
  let q = supabaseAdmin
    .from("social_mentions")
    .select("id", { count: "exact", head: true })
    .eq("search_id", searchId)
    .eq("excluded", false);
  if (approvedWatermark) q = q.gt("first_seen_at", approvedWatermark);
  const { count } = await q;
  return count ?? 0;
}

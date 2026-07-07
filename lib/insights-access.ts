import type { Insight } from "@/lib/types";
import type { AuthedUser } from "@/lib/auth-server";

/**
 * Determines whether a given user can see a given insight.
 *
 * Rules:
 *  1. Admins see everything (all statuses, all visibility levels).
 *  2. Non-admins only see published insights.
 *  3. visibility=public → all logged-in users.
 *  4. visibility=admin_only → admins only (non-admins never see this).
 *  5. visibility=restricted:
 *     - Organisation-wide users match if their own organisation's name
 *       appears in the insight's tags (case-insensitive) — insight tags
 *       are authored as org/agency/brand/publisher names, see
 *       supabase-migration-038.sql's column comment.
 *     - Selected Access users match only via an explicit grant
 *       (user_access_grants, resource_type='insight') on that exact
 *       insight — see lib/access.ts.
 *
 * Replaces the earlier associated_agency/associated_brand/
 * associated_publisher/associated_projects/associated_markets tag-matching
 * scheme, which was a fourth, independent access mechanism layered on top
 * of allowed_campaign_ids/allowed_publisher_ids and the Research Projects
 * scoping — this is the one unified model now. The project/market
 * dimension those fields covered doesn't have a direct equivalent here;
 * the same reach is achieved by granting the specific insights via Assign
 * Permissions instead of a recurring tag rule.
 */
export function canAccessInsight(
  insight: Insight,
  user: AuthedUser,
  grantedInsightIds: Set<string>
): boolean {
  if (user.role === "admin") return true;

  if (insight.status !== "published") return false;
  if (insight.visibility === "admin_only") return false;
  if (insight.visibility === "public") return true;

  // restricted
  if (user.accessScope === "selected") {
    return grantedInsightIds.has(insight.id);
  }

  if (!user.organisationName) return false;
  const tags = (insight.tags ?? []).map(t => t.toLowerCase());
  return tags.includes(user.organisationName.toLowerCase());
}

/** Filter an insight list to what a user is allowed to see. */
export function filterInsights(
  insights: Insight[],
  user: AuthedUser,
  grantedInsightIds: Set<string>
): Insight[] {
  return insights.filter(i => canAccessInsight(i, user, grantedInsightIds));
}

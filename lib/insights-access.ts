import type { Insight, FullUser } from "@/lib/types";

/**
 * Determines whether a given user can see a given insight.
 *
 * Rules:
 *  1. Admins see everything (all statuses, all visibility levels).
 *  2. Non-admins only see published insights.
 *  3. visibility=public  → all logged-in users.
 *  4. visibility=admin_only → admins only (non-admins never see this).
 *  5. visibility=restricted → user must have at least one field that matches
 *     one of the insight's tags (case-insensitive).
 *     Matched fields: organisation_name, associated_agency, associated_brand,
 *     associated_publisher, associated_projects[], associated_markets[].
 */
export function canAccessInsight(insight: Insight, user: FullUser): boolean {
  if (user.role === "admin") return true;

  if (insight.status !== "published") return false;
  if (insight.visibility === "admin_only") return false;
  if (insight.visibility === "public") return true;

  // restricted — check tags against user audience fields
  const tags = (insight.tags ?? []).map(t => t.toLowerCase());
  if (tags.length === 0) return false;

  const userFields = [
    user.organisation_name,
    user.associated_agency,
    user.associated_brand,
    user.associated_publisher,
    ...(user.associated_projects ?? []),
    ...(user.associated_markets ?? []),
  ].filter(Boolean).map(v => (v as string).toLowerCase());

  return userFields.some(f => tags.includes(f));
}

/** Filter an insight list to what a user is allowed to see. */
export function filterInsights(insights: Insight[], user: FullUser): Insight[] {
  return insights.filter(i => canAccessInsight(i, user));
}

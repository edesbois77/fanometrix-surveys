// -- Which group endpoint a tag addresses, decided before any request --------
//
// Two parameters can name a group, and they address different objects:
//
//   ?group=<slug>           LEGACY Research Project groups -> /api/embed/group
//   ?campaign_group=<slug>  Survey Studio groups           -> /api/embed/studio-group
//
// The public parameter is `campaign_group`, not `studio_group`: "Studio" names an
// internal owner_model, and a publisher-facing contract is close to permanent.
//
// A URL carrying BOTH is MALFORMED. It is not a routing question with a sensible
// default — it is a tag someone has assembled wrongly, and the two names point at
// different inventory. Preferring either would let a copy-paste error look like it
// worked, and the group that quietly lost is the one nobody investigates.
//
// So a conflict resolves to `conflict`: no endpoint is called, no renderer mounts,
// and therefore NO EVIDENCE PATH EXECUTES AT ALL. That is deliberately stronger
// than mounting and suppressing writes — a suppression flag is something a later
// change can regress, whereas an unmounted renderer cannot emit anything.
//
// Pure, so the rule is testable without a DOM — the same reason
// lib/embed-preview-phase.ts exists.

export type GroupRouting =
  | { kind: "none" }
  | { kind: "legacy"; slug: string }
  | { kind: "studio"; slug: string }
  | { kind: "conflict" };

/** The one diagnostic emitted for a malformed tag. Structured and stable, so it
 *  can be searched for in logs without matching prose. */
export const CONFLICTING_GROUP_PARAMETERS = "conflicting_group_parameters";

/** Blank or whitespace-only is treated as absent — an ad tag with an unfilled
 *  macro should not become a conflict. */
function present(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

export function resolveGroupRouting(
  groupParam: string | null | undefined,
  campaignGroupParam: string | null | undefined,
): GroupRouting {
  const legacy = present(groupParam);
  const studio = present(campaignGroupParam);

  if (legacy && studio) return { kind: "conflict" };
  if (studio) return { kind: "studio", slug: studio };
  if (legacy) return { kind: "legacy", slug: legacy };
  return { kind: "none" };
}

/** The endpoint for a resolved routing. Never called for none/conflict. */
export function groupEndpoint(routing: GroupRouting): string {
  if (routing.kind === "studio") return "/api/embed/studio-group";
  if (routing.kind === "legacy") return "/api/embed/group";
  throw new Error(`groupEndpoint called for ${routing.kind}`);
}

/** True when a group was named at all — used to decide whether the page must
 *  wait on a group resolution before it can mount anything. A conflict counts:
 *  the tag named a group, it just named two. */
export function namesAGroup(routing: GroupRouting): boolean {
  return routing.kind !== "none";
}

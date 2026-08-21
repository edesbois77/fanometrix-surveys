// -- Deriving what KIND of change a configuration represents ------------------
//
// change_kind decides which governance rules fire: a reason becomes mandatory
// for admissions and removals, and a comparability acknowledgement is demanded
// on a group that already has history. A client that chose its own kind could
// therefore choose its own rules — send "weights_changed" while removing a
// campaign and both requirements quietly disappear.
//
// So the server derives it from the diff and ignores what the client claimed.

export type ChangeKind =
  | "created"
  | "members_added"
  | "members_removed"
  | "member_paused"
  | "member_resumed"
  | "weights_changed"
  | "rotation_changed"
  | "limit_changed";

export interface MemberShape {
  campaign_id: string;
  weight: number;
  membership_state?: "active" | "paused";
}

export interface DiffInput {
  previous: MemberShape[] | null;      // null = there is no prior configuration
  next: MemberShape[];
  previousRotation: string | null;
  nextRotation: string;
}

export interface ChangeDiff {
  kind: ChangeKind;
  added: string[];
  removed: string[];
  paused: string[];
  resumed: string[];
  reweighted: string[];
  rotationChanged: boolean;
  /** True when the kind requires a reason (admissions and removals). */
  reasonRequired: boolean;
  /** True when membership itself changed, which is what makes results before and
   *  after not directly comparable. */
  membershipChanged: boolean;
}

const state = (m: MemberShape) => m.membership_state ?? "active";

/**
 * Derive the kind, and the diff that justifies it.
 *
 * PRECEDENCE, most consequential first: admissions and removals change which
 * campaigns can collect at all, so they outrank a pause, which outranks a
 * weight, which outranks rotation. When several things change at once the kind
 * names the most consequential, and the diff still reports everything.
 */
export function deriveChange(input: DiffInput): ChangeDiff {
  const { previous, next, previousRotation, nextRotation } = input;

  if (previous === null) {
    return {
      kind: "created",
      added: next.map(m => m.campaign_id),
      removed: [], paused: [], resumed: [], reweighted: [],
      rotationChanged: false,
      reasonRequired: false,      // the first configuration admits nothing
      membershipChanged: false,   // there is nothing to be incomparable with
    };
  }

  const prevById = new Map(previous.map(m => [m.campaign_id, m]));
  const nextById = new Map(next.map(m => [m.campaign_id, m]));

  const added   = next.filter(m => !prevById.has(m.campaign_id)).map(m => m.campaign_id);
  const removed = previous.filter(m => !nextById.has(m.campaign_id)).map(m => m.campaign_id);

  const paused: string[] = [];
  const resumed: string[] = [];
  const reweighted: string[] = [];
  for (const m of next) {
    const p = prevById.get(m.campaign_id);
    if (!p) continue;
    if (state(p) === "active" && state(m) === "paused") paused.push(m.campaign_id);
    if (state(p) === "paused" && state(m) === "active") resumed.push(m.campaign_id);
    if (p.weight !== m.weight) reweighted.push(m.campaign_id);
  }

  const rotationChanged = previousRotation !== null && previousRotation !== nextRotation;

  let kind: ChangeKind;
  if (added.length)          kind = "members_added";
  else if (removed.length)   kind = "members_removed";
  else if (paused.length)    kind = "member_paused";
  else if (resumed.length)   kind = "member_resumed";
  else if (reweighted.length) kind = "weights_changed";
  else if (rotationChanged)  kind = "rotation_changed";
  else                       kind = "weights_changed"; // a no-op republish; harmless and honest

  return {
    kind, added, removed, paused, resumed, reweighted, rotationChanged,
    reasonRequired: added.length > 0 || removed.length > 0,
    membershipChanged: added.length > 0 || removed.length > 0,
  };
}

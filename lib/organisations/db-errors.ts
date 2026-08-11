// ORG-004 BP-02 — map Postgres/PostgREST errors from the BP-02 tables to clear,
// human messages. The DATABASE stays authoritative for every integrity rule
// (migrations 150–153); the service layer only translates its failures so the API
// can surface them without divergence. Never invent a rule the DB doesn't enforce.

export type PgError = { code?: string; message?: string } | null | undefined;

/** Translate a Supabase error into a user-facing message + HTTP status.
 *  Falls back to the raw DB message so nothing is silently swallowed. */
export function mapOrgDbError(error: PgError): { message: string; status: number } {
  if (!error) return { message: "Unknown error", status: 500 };
  const code = error.code ?? "";
  const raw = error.message ?? "Database error";

  // P0001 = raise_exception from our guard functions (containment, protection …).
  // The RAISE text is already human-readable, so pass it through as a 409 conflict.
  // ORG-007 CF-002 — the Unit removal ↔ live-children guards (migration 177) raise P0001;
  // translate their coded messages into friendly text.
  if (code === "P0001") return { message: friendlyRaise(raw), status: 409 };
  if (code === "23514") return { message: friendlyCheck(raw), status: 400 }; // check_violation
  if (code === "23505") return { message: "That already exists.", status: 409 }; // unique_violation
  if (code === "23P01") return { message: friendlyExclusion(raw), status: 409 }; // exclusion_violation (ORG-007 CF-002)
  if (code === "23503") return { message: "Referenced record does not exist.", status: 400 }; // fk_violation
  if (code === "23502") return { message: "A required field is missing.", status: 400 }; // not_null

  return { message: raw, status: 500 };
}

function friendlyCheck(raw: string): string {
  if (raw.includes("effective_order") || raw.includes("effective_to"))
    return "Invalid dates: the end date must be after the start date (no same-day interval).";
  if (raw.includes("no_self_parent")) return "A unit cannot be its own parent.";
  if (raw.includes("subject_kind")) return "That subject type is not permitted here.";
  if (raw.includes("length") || raw.includes("btrim")) return "This value cannot be blank.";
  return "That value is not allowed.";
}

// ORG-007 CF-002 — friendly text for the Unit removal ↔ live-children guards (migration 177).
function friendlyRaise(raw: string): string {
  if (raw.includes("unit_has_live_children"))
    return "This unit still contains sub-unit(s). Remove or re-parent them first.";
  if (raw.includes("parent_unit_removed"))
    return "That parent unit has been removed. Choose a live parent unit.";
  return raw; // other guard functions already RAISE human-readable text
}

// ORG-007 CF-002 — friendly text for the Office attachment exclusivity constraint (FR-010).
function friendlyExclusion(raw: string): string {
  if (raw.includes("org_office_attachment_no_overlap"))
    return "This office already has a governing organisation for an overlapping period.";
  return "That change conflicts with an existing overlapping record.";
}

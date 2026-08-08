import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { recordSecurityEvent, withMandatoryAudit, MandatoryAuditUnavailableError } from "@/lib/authz/audit";
import { bumpTokenVersion } from "@/lib/authz/session-currency";
import { syncGovernedOrganisationAccess, syncSelectedStudyAuthorisations, selectedStudyGrantsForDisplay } from "@/lib/authz/provision-access";

const USER_SELECT = "id, first_name, last_name, work_email, job_title, role, organisation_id, access_scope, status, last_login_at, password_changed_at, created_by, created_at, updated_at, organisations ( name, type )";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PostgREST returns a to-one join as either an object or a single-element
// array depending on FK detection — normalise to a flat object or null so
// the client never has to guess (mirrors app/api/users/route.ts).
function normaliseOrg<T extends { organisations: unknown }>(row: T) {
  const org = row.organisations;
  return { ...row, organisations: Array.isArray(org) ? (org[0] ?? null) : org };
}

// Fetches a user together with their Selected Access grants, for
// populating the edit drawer's Assign Permissions section.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  // ORG-005 IW-11 / DEC-1 Option A — Selected Access read from the governed Study
  // URA (research_project shape), replacing the legacy user_access_grants reader.
  const [{ data: user, error }, grants] = await Promise.all([
    supabaseAdmin.from("users").select(USER_SELECT).eq("id", id).single(),
    selectedStudyGrantsForDisplay(id),
  ]);

  if (error || !user) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  return NextResponse.json({ data: { ...normaliseOrg(user), grants } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.first_name !== undefined) update.first_name = (body.first_name as string).trim();
  if (body.last_name !== undefined) update.last_name = (body.last_name as string).trim();
  if (body.job_title !== undefined) update.job_title = (body.job_title as string)?.trim() || null;

  if (body.work_email !== undefined) {
    const cleanEmail = (body.work_email as string).trim();
    if (!EMAIL_RE.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
    }
    update.work_email = cleanEmail;
  }

  if (body.role !== undefined) {
    if (!["admin", "brand", "agency", "publisher"].includes(body.role as string)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    update.role = body.role;
  }

  if (body.organisation_id !== undefined) update.organisation_id = body.organisation_id || null;

  const effectiveRole = (update.role as string | undefined) ?? undefined;
  if (body.access_scope !== undefined) {
    // A publisher account is always organisation-wide, regardless of what
    // the request asked for — mirrors the create-time enforcement.
    update.access_scope = effectiveRole === "publisher" || body.role === "publisher"
      ? "organisation_wide"
      : body.access_scope;
  }

  if (body.status !== undefined) update.status = body.status;
  if (body.force_password_change !== undefined) update.force_password_change = body.force_password_change;

  if (body.password && typeof body.password === "string" && body.password.length > 0) {
    update.hashed_password = await bcrypt.hash(body.password, 10);
    update.password_changed_at = new Date().toISOString();
  }

  // ORG-005 IW-7 — mandatory-audit FAIL-CLOSED (SG-7 / Q-34). The authz change is
  // audited BEFORE it is applied; if a live audit subsystem cannot durably record
  // it, withMandatoryAudit throws and the change is REFUSED (no unaudited change).
  // Guarded: pre-activation the audit is "unavailable" and the op proceeds as
  // before. Minimised to changed field NAMES only (no password/secret — Q-30).
  let data: unknown = null;
  let error: { code?: string; message: string } | null = null;
  try {
    await withMandatoryAudit({
      eventType: update.role !== undefined ? "role_assignment_change" : "user_lifecycle_change",
      action: "user.update",
      outcome: "authorised",
      actorUserId: session.id,
      actorLabel: session.workEmail,
      organisationId: (update.organisation_id as string | null | undefined) ?? null,
      resourceType: "user",
      resourceId: id,
      origin: "api/users/[id]",
      detail: { fields: Object.keys(update).filter(k => !["hashed_password", "password_changed_at"].includes(k)) },
    }, async () => {
      const res = await supabaseAdmin.from("users").update(update).eq("id", id).select(USER_SELECT).single();
      data = res.data; error = res.error;
    });
  } catch (e) {
    if (e instanceof MandatoryAuditUnavailableError) {
      return NextResponse.json({ error: "Security audit unavailable; change refused." }, { status: 503 });
    }
    throw e;
  }

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A user with this work email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });
  }

  // ORG-005 IW-11 (additive): keep the governed Active Context + contextual Role
  // in lockstep with this update so the user always resolves under G-1 sole
  // authority (never stranded by an org/role change).
  {
    const updated = data as { organisation_id: string | null; role: string | null };
    await syncGovernedOrganisationAccess(id, updated.organisation_id, updated.role);
  }

  // ORG-005 IW-9 (F058/F059) — revoke the target user's live sessions when this
  // change is session-affecting: a forced-password-change is set, their password
  // is reset, or they are disabled. A version bump invalidates their existing
  // tokens on the next request (disable is also immediate via the status gate).
  if (update.force_password_change === true || update.hashed_password !== undefined || update.status === "disabled") {
    await bumpTokenVersion(id);
  }

  // Selected Access grants: the client sends the full desired set, so
  // reconcile by replacing rather than diffing — simple and correct at
  // this scale. Also mandatory-audit fail-closed (SG-7).
  if (body.grants !== undefined) {
    const grants = body.grants as { resource_type: string; resource_id: string }[];
    try {
      await withMandatoryAudit({
        eventType: "access_grant_change", action: "user.grants.replace", outcome: "authorised",
        actorUserId: session.id, actorLabel: session.workEmail, resourceType: "user", resourceId: id,
        origin: "api/users/[id]", detail: { grantCount: grants.length },
      }, async () => {
        // ORG-005 IW-11 / DEC-1 Option A — Selected Access (Studies only) via governed URA.
        await syncSelectedStudyAuthorisations(id, grants);
      });
    } catch (e) {
      if (e instanceof MandatoryAuditUnavailableError) {
        return NextResponse.json({ error: "Security audit unavailable; grant change refused." }, { status: 503 });
      }
      throw e;
    }
  }

  return NextResponse.json({ data: normaliseOrg(data as { organisations: unknown }) });
}

// Quick status toggle — used by the table's Disable/Enable action.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!["active", "disabled"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
  }

  // ORG-005 IW-7 — mandatory-audit fail-closed (SG-7): a disable/enable is an
  // authz-significant change, recorded before it is applied.
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    await withMandatoryAudit({
      eventType: "user_lifecycle_change", action: "user.status", outcome: "authorised",
      actorUserId: session.id, actorLabel: session.workEmail, resourceType: "user", resourceId: id,
      origin: "api/users/[id]", detail: { status: body.status },
    }, async () => {
      const res = await supabaseAdmin.from("users").update({ status: body.status }).eq("id", id).select(USER_SELECT).single();
      data = res.data; error = res.error;
    });
  } catch (e) {
    if (e instanceof MandatoryAuditUnavailableError) {
      return NextResponse.json({ error: "Security audit unavailable; change refused." }, { status: 503 });
    }
    throw e;
  }

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });

  // ORG-005 IW-9 (F058) — disabling a user revokes their live sessions.
  if (body.status === "disabled") await bumpTokenVersion(id);

  return NextResponse.json({ data: normaliseOrg(data as { organisations: unknown }) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

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

  const [{ data: user, error }, { data: grants }] = await Promise.all([
    supabaseAdmin.from("users").select(USER_SELECT).eq("id", id).single(),
    supabaseAdmin.from("user_access_grants").select("resource_type, resource_id").eq("user_id", id),
  ]);

  if (error || !user) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  return NextResponse.json({ data: { ...normaliseOrg(user), grants: grants ?? [] } });
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

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(update)
    .eq("id", id)
    .select(USER_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A user with this work email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Selected Access grants: the client sends the full desired set, so
  // reconcile by replacing rather than diffing — simple and correct at
  // this scale.
  if (body.grants !== undefined) {
    const grants = body.grants as { resource_type: string; resource_id: string }[];
    await supabaseAdmin.from("user_access_grants").delete().eq("user_id", id);
    if (grants.length > 0) {
      await supabaseAdmin.from("user_access_grants").insert(
        grants.map(g => ({ user_id: id, resource_type: g.resource_type, resource_id: g.resource_id, created_by: session.workEmail }))
      );
    }
  }

  return NextResponse.json({ data: normaliseOrg(data) });
}

// Quick status toggle — used by the table's Disable/Enable action.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(req, ["admin"]);
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

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ status: body.status })
    .eq("id", id)
    .select(USER_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: normaliseOrg(data) });
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

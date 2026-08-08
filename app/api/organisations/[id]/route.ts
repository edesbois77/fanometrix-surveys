import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { withMandatoryAudit, MandatoryAuditUnavailableError } from "@/lib/authz/audit";

const ORG_TYPES = ["publisher", "agency", "brand", "internal"] as const;

// Single organisation (admin detail view). Additive — the list GET on
// /api/organisations is unchanged and still open to all authenticated roles.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, name, type, status, created_at, updated_at, deleted_at")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = { updated_at: now };
  if (body.name !== undefined) {
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
    update.name = name;
  }
  if (body.type !== undefined) {
    if (!ORG_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "A valid organisation type is required." }, { status: 400 });
    }
    update.type = body.type;
  }
  if (body.status !== undefined) {
    if (!["active", "disabled"].includes(body.status)) {
      return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
    }
    update.status = body.status;
  }

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An organisation with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// Quick status toggle — mirrors the users PATCH endpoint's enable/disable pattern.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();

  if (!["active", "disabled"].includes(body.status)) {
    return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
  }

  // ORG-005 IW-7 — mandatory-audit fail-closed (SG-7): organisation lifecycle
  // change recorded before it is applied.
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    await withMandatoryAudit({
      eventType: "organisation_lifecycle_change", action: "organisation.status", outcome: "authorised",
      actorUserId: session.id, actorLabel: session.workEmail, organisationId: id,
      resourceType: "organisation", resourceId: id, origin: "api/organisations/[id]", detail: { status: body.status },
    }, async () => {
      const res = await supabaseAdmin.from("organisations").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      data = res.data; error = res.error;
    });
  } catch (e) {
    if (e instanceof MandatoryAuditUnavailableError) {
      return NextResponse.json({ error: "Security audit unavailable; change refused." }, { status: 503 });
    }
    throw e;
  }

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const now = new Date().toISOString();

  // ORG-005 IW-11: active members via the governed user_organisation_access, not
  // the scalar users.organisation_id — count active users holding active access.
  const { data: members } = await supabaseAdmin
    .from("user_organisation_access")
    .select("user_id")
    .eq("organisation_id", id)
    .eq("status", "active");
  const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
  let count = 0;
  if (memberIds.length) {
    const { count: c } = await supabaseAdmin
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("id", memberIds)
      .eq("status", "active");
    count = c ?? 0;
  }

  if ((count ?? 0) > 0 && !force) {
    return NextResponse.json(
      { error: `This organisation still has ${count} active user account(s). Confirm to delete anyway.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("organisations")
    .update({ deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

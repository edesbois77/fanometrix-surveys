import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

const USER_SELECT = "id, first_name, last_name, work_email, job_title, role, organisation_id, access_scope, status, last_login_at, password_changed_at, created_by, created_at, updated_at, organisations ( name, type )";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PostgREST returns a to-one join as either an object or a single-element
// array depending on FK detection — normalise to a flat object or null so
// the client never has to guess.
function normaliseOrg<T extends { organisations: unknown }>(row: T) {
  const org = row.organisations;
  return { ...row, organisations: Array.isArray(org) ? (org[0] ?? null) : org };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(USER_SELECT)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map(normaliseOrg) });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    first_name, last_name, work_email, job_title,
    password, role, organisation_id,
    access_scope, force_password_change,
    grants,
  } = body as {
    first_name?: string;
    last_name?: string;
    work_email?: string;
    job_title?: string | null;
    password?: string;
    role?: string;
    organisation_id?: string | null;
    access_scope?: "organisation_wide" | "selected";
    force_password_change?: boolean;
    grants?: { resource_type: string; resource_id: string }[];
  };

  const cleanFirst = (first_name ?? "").trim();
  const cleanLast = (last_name ?? "").trim();
  const cleanEmail = (work_email ?? "").trim();

  if (!cleanFirst || !cleanLast || !cleanEmail || !password || !role) {
    return NextResponse.json(
      { error: "First name, last name, work email, password and role are required." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
  }
  if (!["admin", "brand", "agency", "publisher"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // Publisher accounts are always organisation-wide ("Publisher-wide") —
  // enforced server-side, not just hidden in the UI.
  const effectiveScope: "organisation_wide" | "selected" =
    role === "publisher" ? "organisation_wide" : (access_scope ?? "organisation_wide");

  const hashed_password = await bcrypt.hash(password, 10);

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      first_name: cleanFirst,
      last_name: cleanLast,
      work_email: cleanEmail,
      job_title: job_title?.trim() || null,
      hashed_password,
      role,
      organisation_id: organisation_id || null,
      access_scope: effectiveScope,
      status: "pending_invitation",
      force_password_change: force_password_change ?? true,
      created_by: session.workEmail,
    })
    .select(USER_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A user with this work email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (effectiveScope === "selected" && grants && grants.length > 0) {
    await supabaseAdmin.from("user_access_grants").insert(
      grants.map(g => ({ user_id: data.id, resource_type: g.resource_type, resource_id: g.resource_id, created_by: session.workEmail }))
    );
  }

  return NextResponse.json({ data: normaliseOrg(data) }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listAuthoritiesForOrganisation, listAdmittedHolderKinds, createAuthority } from "@/lib/organisations/authorities";

// Authority facts whose principal is this organisation ([id]), plus the admitted eligible holder
// kinds (empty while the external holder dependency is preserved) so the UI can reflect availability.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  try {
    const [data, admittedHolderKinds] = await Promise.all([listAuthoritiesForOrganisation(id), listAdmittedHolderKinds()]);
    return NextResponse.json({ data, admittedHolderKinds });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// Record an Authority fact for this principal organisation. While no eligible holder kind is
// admitted, the database guard rejects the insert (returned as 409 with the guard's message).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json();
  const r = await createAuthority({
    holderSubjectId: body.holderSubjectId, holderSubjectKind: body.holderSubjectKind,
    organisationId: id, organisationUnitId: body.organisationUnitId ?? null, scope: body.scope,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}

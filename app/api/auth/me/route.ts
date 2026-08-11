import { NextRequest, NextResponse } from "next/server";
import { requireIdentity, requireUser, resolveOrganisationContextView } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  // ORG-006 WP-01 (IS-01) — resolve identity first (independent of Organisation
  // context), then the platform-owned Organisation Context view. This lets the
  // logged-in client drive the governed 0/1/many context experience:
  //   • resolved            → a Current Organisation is established → full session user.
  //   • selection_required  → authenticated but must choose one Organisation from the
  //                           authoritative Accessible Organisation Set (no product user yet).
  //   • no_access / indeterminate → no valid Organisation context (fail-closed).
  // The Accessible Organisation Set comes from the SAME governed machinery as
  // requireUser — never a second access model, never a permission union.
  let identity;
  try {
    identity = await requireIdentity(req);
  } catch {
    return NextResponse.json({
      authenticated: false,
      user: null,
      identity: null,
      organisationContext: { status: "no_access", currentOrganisationId: null, accessibleOrganisations: [] },
    });
  }

  const organisationContext = await resolveOrganisationContextView(identity);

  // The full session user (with the resolved Current Organisation + contextual
  // role + product tier) is only meaningful once a Current Organisation resolves.
  let user = null;
  if (organisationContext.status === "resolved") {
    try {
      const u = await requireUser(req);
      user = {
        workEmail: u.workEmail,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        organisationId: u.organisationId,
        organisationName: u.organisationName,
        organisationType: u.organisationType,
        accessScope: u.accessScope,
        canPresentSimulations: u.canPresentSimulations,
      };
    } catch {
      user = null;
    }
  }

  return NextResponse.json({
    authenticated: true,
    user,
    identity: { workEmail: identity.workEmail, firstName: identity.firstName, lastName: identity.lastName },
    organisationContext,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  // ORG-005 IW-11: resolve through the governed authoritative path (requireUser) —
  // Active Organisation Context + contextual Role — rather than reading the legacy
  // scalar users.organisation_id / users.role. No valid session/context → user:null.
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      workEmail: user.workEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organisationId: user.organisationId,
      organisationName: user.organisationName,
      organisationType: user.organisationType,
      accessScope: user.accessScope,
      canPresentSimulations: user.canPresentSimulations,
    },
  });
}

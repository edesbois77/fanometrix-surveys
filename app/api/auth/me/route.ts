import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      username: session.username,
      role: session.role,
      organisationName: session.organisationName,
      allowedCampaignIds: session.allowedCampaignIds,
      allowedPublisherIds: session.allowedPublisherIds,
    },
  });
}

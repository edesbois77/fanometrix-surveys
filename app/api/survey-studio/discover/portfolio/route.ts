// ── Discover → Portfolio intelligence API (Stage 8, read-only) ───────────────
// "What can I learn across the surveys I have access to?" — access-scoped Core
// measured findings aggregated across the caller's entitled surveys. Exposure follows
// the same control as the single-survey read (internal admins always; others the
// product-read flag). Never invents cross-survey comparability; failure-isolated.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getPortfolioIntelligence, type PortfolioIntelligence } from "@/lib/studio/survey-portfolio";

export type PortfolioResponse = { authorised: true; portfolio: PortfolioIntelligence } | { authorised: false };

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const portfolio = await getPortfolioIntelligence(session);
  return NextResponse.json({ authorised: true, portfolio } satisfies PortfolioResponse);
}

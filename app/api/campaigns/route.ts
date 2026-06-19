import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import {
  computeEffectiveStatus,
  ACTION_NOTIFICATIONS,
  type CampaignForStatus,
} from "@/lib/campaign-status";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  let query = supabase
    .from("campaigns")
    .select("*, surveys(name)")
    .order("created_at", { ascending: false });

  if (session.role === "brand" || session.role === "agency") {
    const ids = session.allowedCampaignIds;
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("campaign_id", ids);
  }

  const [{ data: campaigns, error }, { data: statsData }] = await Promise.all([
    query,
    supabase.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap: Record<string, number> = {};
  for (const s of statsData ?? []) {
    statsMap[s.campaign_id] = Number(s.response_count ?? 0);
  }

  const now = new Date();

  // Compute effective status and detect auto-transitions
  const enriched = await Promise.all(
    (campaigns ?? []).map(async (c) => {
      const responseCount = statsMap[c.campaign_id] ?? 0;
      const effective = computeEffectiveStatus(c as CampaignForStatus, responseCount, now);

      // Persist auto-transition if stored status differs from computed
      if (
        c.status !== effective &&
        c.status !== "draft" &&
        c.status !== "archived" &&
        c.manual_status_override !== "paused"
      ) {
        await supabase
          .from("campaigns")
          .update({ status: effective, status_updated_at: now.toISOString() })
          .eq("id", c.id);

        // Create notification for meaningful auto-transitions
        const notifType =
          effective === "live"     ? "went_live"  :
          effective === "closed"   ? "closed"     :
          effective === "archived" ? "archived"   : null;

        if (notifType) {
          const campaignName = `${c.brand_name} – ${c.campaign_name}`;
          const messages: Record<string, string> = {
            went_live: `"${campaignName}" automatically went Live.`,
            closed:    `"${campaignName}" automatically closed.`,
            archived:  `"${campaignName}" was automatically archived.`,
          };
          await supabaseAdmin.from("campaign_notifications").insert({
            campaign_id:   c.id,
            campaign_name: campaignName,
            type:          notifType,
            message:       messages[notifType],
          });
        }
      }

      return { ...c, effective_status: effective, response_count: responseCount };
    })
  );

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();
  const { data, error } = await supabase
    .from("campaigns")
    .insert([{ ...body, updated_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

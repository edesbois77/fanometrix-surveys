import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaign_id, q1, q2, q3, country, fan_segment, publisher, placement } = body;

  if (!campaign_id || !q1) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { error } = await supabase.from("responses").insert([
    { campaign_id, q1, q2, q3, country, fan_segment, publisher, placement },
  ]);

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Public endpoint — no auth required.
// Returns only the question content for a survey UUID so the embed iframe
// can render the correct questions without exposing response data.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("surveys")
    .select("id, questions, thank_you_title, thank_you_body")
    .eq("id", id)
    .neq("status", "deleted")  // soft-deleted surveys must not be served
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  return NextResponse.json({
    questions:       data.questions ?? [],
    thank_you_title: data.thank_you_title ?? "Thank you!",
    thank_you_body:  data.thank_you_body  ?? "Your anonymous feedback helps improve the football experience for fans everywhere.",
  });
}

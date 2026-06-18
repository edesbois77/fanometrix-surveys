import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const [demoRes, realRes] = await Promise.all([
    supabase.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", false),
  ]);

  return NextResponse.json({
    demo_count: demoRes.count ?? 0,
    real_count: realRes.count ?? 0,
  });
}

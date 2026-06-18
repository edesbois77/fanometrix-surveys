import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE() {
  // Count first so we can report back
  const { count } = await supabase
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", true);

  // Only ever deletes rows where is_demo = true — real data is never touched
  const { error } = await supabase
    .from("responses")
    .delete()
    .eq("is_demo", true);

  if (error) {
    console.error("Demo delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}

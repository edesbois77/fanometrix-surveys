import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireUser } from "@/lib/auth-server";

export async function DELETE(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  // Optional: scope deletion to a specific campaign (used by the traffic simulator cleanup)
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  // Step 1: count demo rows before delete
  let countQuery = supabase
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", true);
  if (campaignId) countQuery = countQuery.eq("campaign_id", campaignId);

  const { count: beforeCount, error: beforeError } = await countQuery;

  if (beforeError) {
    console.error("Demo delete – pre-count error:", beforeError);
    return NextResponse.json({ error: beforeError.message }, { status: 500 });
  }

  console.log(`Demo delete – rows before delete: ${beforeCount}`);

  // Step 2: execute delete (RLS policy "Anyone can delete demo rows" permits this)
  let deleteQuery = supabase
    .from("responses")
    .delete({ count: "exact" })
    .eq("is_demo", true);
  if (campaignId) deleteQuery = deleteQuery.eq("campaign_id", campaignId);
  const { data, error, count } = await deleteQuery.select();

  console.log({ error, count, deletedRows: data?.length });

  if (error) {
    console.error("Demo delete – delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 3: recount to verify
  let afterQuery = supabase
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", true);
  if (campaignId) afterQuery = afterQuery.eq("campaign_id", campaignId);
  const { count: afterCount, error: afterError } = await afterQuery;

  if (afterError) {
    console.error("Demo delete – post-count error:", afterError);
  }

  console.log(`Demo delete – rows after delete: ${afterCount}`);

  const deleted = (beforeCount ?? 0) - (afterCount ?? 0);

  if (deleted === 0 && (beforeCount ?? 0) > 0) {
    const msg =
      `Delete ran but removed 0 rows (before: ${beforeCount}, after: ${afterCount}). ` +
      "Check RLS policies on the responses table.";
    console.error("Demo delete –", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ deleted: deleted > 0 ? deleted : 0 });
}

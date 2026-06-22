// Updates last_seen_at for the currently authenticated user.
// Called from AdminShell on every client-side navigation so all roles are tracked.
// Rate-limited: only writes to DB when last_seen_at is null or older than 5 minutes,
// preventing excessive writes when the user navigates rapidly.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Conditional update — only write when stale, to minimise DB load
  const { error } = await supabaseAdmin
    .from("users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.sub)
    .or(`last_seen_at.is.null,last_seen_at.lt.${fiveMinutesAgo}`);

  if (error) {
    console.error("[ping] last_seen_at update failed:", error.message);
  }

  return NextResponse.json({ ok: true });
}

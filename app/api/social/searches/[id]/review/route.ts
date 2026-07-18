// Evidence Validation gate — search-level review actions
// (docs/evidence-validation-blueprint.md). POST { action } where action is
//   approve     — validate the search; its Included, relevant evidence now feeds
//                 Analysis, and the approved_watermark advances to cover it.
//   archive     — freeze future collection but keep approval (evidence still feeds).
//   reactivate  — bring an archived search back to Approved.
// Admin-only. Nothing here deletes evidence; approval is a state over the
// append-only base.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { approveSearch, archiveSearch, reactivateSearch } from "@/lib/evidence-review";

const ACTIONS = { approve: approveSearch, archive: archiveSearch, reactivate: reactivateSearch } as const;
type Action = keyof typeof ACTIONS;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body?.action as Action | undefined;
  if (!action || !(action in ACTIONS)) {
    return NextResponse.json({ error: "action must be one of: approve, archive, reactivate" }, { status: 400 });
  }

  try {
    await ACTIONS[action](id, session.workEmail);
    return NextResponse.json({ ok: true, action });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Review action failed" }, { status: 500 });
  }
}

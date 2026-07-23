// One finding, with its grounds and its full revision history, and the endpoint
// the analyst adjudicates through. Every action maps to one adjudication verb;
// the route validates, delegates, and never contains judgement of its own.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getFinding } from "@/lib/analysis/finding-store";
import {
  reframe, narrow, split, merge, restance, dropCitation, requestEvidence,
  overrideConfidence, approve, reject, publish, reopen, author,
  type RejectClass,
} from "@/lib/analysis/adjudication";
import type { AssertionType, CitationStance, ConfidenceLevel } from "@/lib/analysis/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { findingId } = await params;

  const finding = await getFinding(findingId);
  if (!finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

  const { data: revisions } = await supabaseAdmin
    .from("finding_revisions")
    .select("version, action, actor, summary, created_at")
    .eq("finding_id", findingId)
    .order("version", { ascending: true });

  return NextResponse.json({ data: { finding, revisions: revisions ?? [] } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId, findingId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;
  const actor = session.workEmail;

  try {
    switch (action) {
      case "reframe":
        return ok(await reframe({ findingId, actor, statement: str(body.statement), assertion: body.assertion as AssertionType | undefined, scope: body.scope, warrant: body.warrant }));
      case "narrow":
        await narrow({ findingId, actor, scope: str(body.scope) }); return ok();
      case "split":
        return ok({ ids: await split({ findingId, actor, parts: body.parts ?? [] }) });
      case "merge":
        return ok({ id: await merge({ findingIds: body.findingIds ?? [findingId], actor, statement: str(body.statement), scope: body.scope, warrant: body.warrant }) });
      case "restance":
        return ok({ confidence: await restance({ findingId, evidenceRef: str(body.evidenceRef), stance: body.stance as CitationStance, actor }) });
      case "drop_citation":
        return ok({ confidence: await dropCitation({ findingId, evidenceRef: str(body.evidenceRef), actor, reason: str(body.reason) }) });
      case "request_evidence":
        await requestEvidence({ findingId, actor, what: str(body.what) }); return ok();
      case "override_confidence":
        await overrideConfidence({ findingId, actor, level: body.level as ConfidenceLevel, reason: str(body.reason) }); return ok();
      case "approve":
        await approve({ findingId, actor, note: body.note }); return ok();
      case "reject":
        await reject({ findingId, actor, rejectClass: body.rejectClass as RejectClass, note: body.note }); return ok();
      case "publish":
        await publish({ findingId, actor, publish: body.publish !== false }); return ok();
      case "reopen":
        await reopen({ findingId, actor, why: str(body.why) }); return ok();
      case "author":
        return ok({ id: await author({ projectId, actor, need: body.need, statement: str(body.statement), assertion: body.assertion as AssertionType, scope: str(body.scope), warrant: str(body.warrant), evidence: body.evidence ?? [] }) });
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    // Adjudication rules throw with a plain, analyst-readable message (a merge
    // across claim kinds, an approval of a superseded finding). Surface it.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const ok = (data: unknown = {}) => NextResponse.json({ data, ok: true });

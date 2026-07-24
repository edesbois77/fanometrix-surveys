// The evidence pipeline per source — collected → awaiting approval → awaiting
// extraction → awaiting review → approved, plus the blocking reason and next
// action. Powers the Findings Overview so a source with evidence is never shown
// as a silent "no findings yet".
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { sourcePipeline } from "@/lib/analysis/source-findings/pipeline";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  return NextResponse.json({ data: { sources: await sourcePipeline(id) } });
}

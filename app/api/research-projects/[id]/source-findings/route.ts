// Source findings for a project, grouped by source with per-source counts. The
// board reads this; the final-Analysis gate reads its approved totals.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listSourceFindings, summariseSourceFindings } from "@/lib/analysis/source-findings/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const findings = await listSourceFindings(id);
  const { byKind, approvedTotal } = summariseSourceFindings(findings);

  return NextResponse.json({ data: { findings, byKind, approvedTotal } });
}

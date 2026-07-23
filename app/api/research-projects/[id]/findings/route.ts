// The findings a project has produced, for the analyst surface. Grouped by
// Information Need, candidate (rank 1) first with its rivals available, and the
// latest run's coverage and honest remainders alongside.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listFindings, type StoredFinding } from "@/lib/analysis/finding-store";
import { latestRun } from "@/lib/analysis/run-analysis";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  // The live working set: candidates, in-review and approved. Superseded and
  // rejected stay in the record but off the board.
  const findings = await listFindings(id, { status: ["candidate", "in_review", "approved"] });

  // Group by need, best reading first, rivals after. The board leads with rank 1
  // so the first thing an analyst sees is the intelligence, not the raw
  // proposition set.
  const byNeed = new Map<string, { needId: string; need: string; requirement: string; aspect: string | null; candidate: StoredFinding | null; rivals: StoredFinding[] }>();
  for (const f of findings) {
    const g = byNeed.get(f.need_id) ?? {
      needId: f.need_id, need: f.need_text, requirement: f.requirement_text, aspect: f.aspect,
      candidate: null, rivals: [],
    };
    if (!g.candidate && f.rank === 1) g.candidate = f;
    else g.rivals.push(f);
    byNeed.set(f.need_id, g);
  }

  return NextResponse.json({
    data: {
      run: await latestRun(id),
      needs: [...byNeed.values()],
    },
  });
}

// Extract source findings for every eligible project source, as bounded jobs —
// one per survey, document and eligible search. Returns immediately; the surface
// polls the source-findings list. A best-effort drain kicks the queue for low
// latency, exactly like the analysis run route; pg_cron drains it otherwise.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { getProjectSearchStates } from "@/lib/research-sources/project-searches";
import { SOURCE_FINDINGS_EXTRACT_JOB, type SourceExtractUnit } from "@/lib/jobs/handlers/source-findings-extract.constants";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;

  // Enumerate the project's sources. Searches are gated by the same
  // analysis-eligibility rule as intake, so extraction never runs over a search
  // Analysis would not be allowed to consume.
  const { data: attached } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_type, evidence_id")
    .eq("research_project_id", projectId)
    .in("evidence_type", ["survey", "document"]);

  const links = (attached ?? []) as { evidence_type: string; evidence_id: string }[];
  const units: { unit: SourceExtractUnit; ref: string }[] = [];

  // ONE project-scoped survey job: its population is the project's deployment
  // responses (partials included), counted per question — not one job per survey
  // evidence, because there is no single per-survey denominator. ref = projectId.
  if (links.some(l => l.evidence_type === "survey")) {
    units.push({ unit: "survey", ref: projectId });
  }
  // Documents remain per-document.
  for (const link of links.filter(l => l.evidence_type === "document")) {
    units.push({ unit: "document", ref: link.evidence_id });
  }
  for (const s of (await getProjectSearchStates(projectId)).filter(s => s.eligible)) {
    units.push({ unit: "search", ref: s.id });
  }

  let enqueued = 0;
  for (const u of units) {
    const { deduped } = await enqueueJob({
      type: SOURCE_FINDINGS_EXTRACT_JOB,
      payload: { projectId, unit: u.unit, ref: u.ref },
      dedupeKey: `source-findings:${projectId}:${u.unit}:${u.ref}`,
    });
    if (!deduped) enqueued++;
  }

  if (enqueued > 0) {
    after(async () => {
      try {
        await import("@/lib/jobs/handlers");
        const { drainJobs } = await import("@/lib/jobs/worker");
        await drainJobs({ workerId: `source-findings-${projectId}`, types: [SOURCE_FINDINGS_EXTRACT_JOB], budgetMs: 290_000 });
      } catch (err) {
        console.error("[source-findings.extract] drain failed", err);
      }
    });
  }

  return NextResponse.json({ data: { units: units.length, enqueued } });
}

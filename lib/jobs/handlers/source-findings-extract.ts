// Source-finding extraction, one bounded unit at a time (Project Findings layer).
//
// One job = one source instance (one survey, one document, one search). The work
// is deterministic and small: it reads already-computed structures and writes
// discrete findings. It makes NO model call, so it can never recreate the
// reasoning timeout, and it is idempotent (persist supersedes the unit's prior
// unadjudicated candidates), so a retry after a crash re-extracts cleanly.
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext } from "@/lib/jobs/types";
import { SOURCE_FINDINGS_EXTRACT_JOB, type SourceExtractUnit } from "@/lib/jobs/handlers/source-findings-extract.constants";

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v) throw new PermanentJobError(`${SOURCE_FINDINGS_EXTRACT_JOB} job is missing string '${key}'`);
  return v;
}

async function run(ctx: JobContext): Promise<void> {
  const projectId = str(ctx.payload, "projectId");
  const unit = str(ctx.payload, "unit") as SourceExtractUnit;
  const ref = str(ctx.payload, "ref");

  // Lazy-import the extraction stack so merely registering this handler never
  // loads it. Any failure to load or run is a normal job error.
  const {
    extractProjectSurveyFindings, extractDocumentFindings, extractConversationFindings,
  } = await import("@/lib/analysis/source-findings/extractors");
  const { persistSourceFindings } = await import("@/lib/analysis/source-findings/store");

  // The survey unit is PROJECT-scoped: its population is the project's deployment
  // responses, so `ref` is the projectId.
  const drafts =
    unit === "survey"   ? await extractProjectSurveyFindings(ref)
    : unit === "document" ? await extractDocumentFindings(ref)
    : unit === "search"   ? await extractConversationFindings(ref)
    : (() => { throw new PermanentJobError(`Unknown extract unit '${unit}'`); })();

  await ctx.heartbeat();
  const { written, superseded } = await persistSourceFindings({ projectId, sourceRef: ref, drafts, runId: null });
  ctx.log(`Extracted ${written} findings from ${unit} ${ref} (superseded ${superseded}).`);
}

registerHandler(SOURCE_FINDINGS_EXTRACT_JOB, { run });

// ── Research Reasoner — orchestration (server-only, model injected) ───────────
// Evidence Core snapshot → reasoning package → model → VERIFY → shape → product
// artefact. The model caller is injected so tests run without a live model. This never
// mutates authoritative data; it only produces the artefact the job persists. Throws
// IntelligenceError on model/parse failure (the job framework decides retry vs fail);
// a clean but non-defensible story yields a completed-but-not-displayable artefact.
import { IntelligenceError } from "@/lib/intelligence/types";
import { buildReasonerPackage, type PackCoreFinding } from "./evidence-package";
import { buildReasonerSystemPrompt, buildReasonerUserPrompt } from "./reasoning-prompt";
import { verifyReasoning, type VerificationReport } from "./verifier";
import { shapeIntelligence, type ProductIntelligence, type DroppedClaim } from "./product";
import { REASONER_MODEL, REASONER_SCHEMA_VERSION, REASONER_PROMPT_VERSION, type ReasonerCaller, type ReasonerUsage } from "./model";
import type { ReasonerOutput } from "./reasoning-schema";

export type ReasoningArtefact = {
  status: "completed";
  displayable: boolean;
  product: ProductIntelligence;
  audit: { verification: VerificationReport; dropped: DroppedClaim[] };
  model: string;
  usage: ReasonerUsage;
  latencyMs: number;
  versions: { reasoner: string; schema: string; prompt: string };
};

/** Minimal structural guard so a malformed model response is a permanent failure, not a
 *  crash. We do NOT trust any content here — the verifier does that. */
function asReasonerOutput(v: unknown): ReasonerOutput {
  const o = v as Partial<ReasonerOutput> | null;
  if (!o || typeof o !== "object" || !o.executiveStory || typeof o.executiveStory !== "object" || typeof o.executiveStory.headline !== "string") {
    throw new IntelligenceError(422, "reasoner output missing a valid executiveStory");
  }
  return {
    executiveStory: { headline: o.executiveStory.headline, summary: String(o.executiveStory.summary ?? ""), evidenceRefs: Array.isArray(o.executiveStory.evidenceRefs) ? o.executiveStory.evidenceRefs : [] },
    insights: Array.isArray(o.insights) ? o.insights : [],
    supportingObservations: Array.isArray(o.supportingObservations) ? o.supportingObservations : [],
    tensions: Array.isArray(o.tensions) ? o.tensions : [],
    openQuestions: Array.isArray(o.openQuestions) ? o.openQuestions : [],
    cannotConclude: Array.isArray(o.cannotConclude) ? o.cannotConclude : [],
  };
}

export async function generateResearchIntelligence(input: {
  snapshot: unknown;
  coreFindings: PackCoreFinding[];
  caller: ReasonerCaller;
}): Promise<ReasoningArtefact> {
  const built = buildReasonerPackage(input.snapshot as never, input.coreFindings);
  const { pkg, validRefs, numbersByRef, refToQuestion, groupedShareRefs } = built;
  if (pkg.questions.length === 0) throw new IntelligenceError(422, "snapshot has no governed distributions to reason over");

  const call = await input.caller(buildReasonerSystemPrompt(), buildReasonerUserPrompt(pkg));
  const output = asReasonerOutput(call.parsed);

  const verification = verifyReasoning(output, validRefs, numbersByRef, groupedShareRefs, refToQuestion);
  const { product, dropped } = shapeIntelligence(output, pkg, { validRefs, numbersByRef, groupedShareRefs, refToQuestion });

  return {
    status: "completed",
    displayable: product.displayable,
    product,
    audit: { verification, dropped },
    model: call.model,
    usage: call.usage,
    latencyMs: call.latencyMs,
    versions: { reasoner: REASONER_MODEL, schema: REASONER_SCHEMA_VERSION, prompt: REASONER_PROMPT_VERSION },
  };
}

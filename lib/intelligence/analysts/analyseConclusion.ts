// Conclusion — the last step before Knowledge. Deliberately NOT a second
// synthesis pass: the Executive Report already computes `research_answer`,
// "one declarative sentence that directly answers the Research Question"
// (see analyseExecutiveReport.ts), reviewed and approved by a human before
// this ever runs. Re-asking the model for a fresh answer here would risk
// drifting from what was actually approved, and would be exactly the
// "another AI summary" this feature is explicitly not meant to be.
//
// So the Conclusion's `answer` is copied verbatim, in code, from the
// approved report — never regenerated. The one thing the model IS asked
// for is a short, standalone rationale: the report's own executive_summary
// is written to flow inside the report's narrative, but a Knowledge-
// library entry needs to be readable on its own, with no report open
// alongside it, months later, by someone researching something else.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";

export const CONCLUSION_SYNTHETIC_NOTICE_TEXT =
  "This conclusion is based entirely on simulated evidence generated for demonstration purposes. It does not reflect real research findings.";

export type Conclusion = {
  /** Verbatim copy of the approved Executive Report's research_answer — never AI-regenerated here. */
  answer: string;
  /** Short (2-4 sentence), standalone-readable rationale — written for Knowledge-library
   * consumption, where the report itself won't be open alongside it. */
  rationale: string;
  /** Copied so a Knowledge entry is legible without the project loaded. */
  research_question: string;
  generated_at: string;
  research_mode: "real" | "simulated";
  synthetic_notice: string | null;
};

type RawRationale = { rationale: string };

function buildRationalePrompt(
  researchQuestion: string, answer: string, report: ExecutiveReport
): string {
  const topFindings = report.key_findings.slice(0, 5).map(f => `- ${f.finding}`).join("\n");
  // Three independent facts, not the deprecated blended evidence_strength
  // summary — that sentence called source count "corroborated by", which
  // would hand this prompt the same misleading framing the Executive
  // Report itself no longer shows. See EvidenceStrength's doc comment in
  // analyseExecutiveReport.ts.
  const totalSources = report.evidence_strength.sources_included.length + report.evidence_strength.sources_excluded.length;
  const methodLabel = report.evidence_strength.method_diversity === "mixed_method" ? "mixed methods" : "a single method";
  return `A research project's Executive Report has already been written and approved. Its core answer to the project's Research Question has already been decided, do not change it, restate it differently, or hedge it.

RESEARCH QUESTION: "${researchQuestion}"
APPROVED ANSWER (verbatim, do not alter): "${answer}"

Supporting context from the approved report:
Executive Summary: ${report.executive_summary}
Key Findings:
${topFindings}
Evidence Coverage: ${report.evidence_strength.sources_included.length} of ${totalSources} approved sources included
Method Diversity: ${methodLabel}
Cross-source Corroboration: ${report.evidence_strength.corroborated_findings} of ${report.evidence_strength.total_findings} findings supported by more than one source

YOUR TASK
Write a short, standalone rationale (2-4 sentences) explaining WHY the answer above is true, grounded specifically in the findings listed. This will be read on its own, in a Knowledge library, months later, by someone who won't have the report open, so it must stand alone: no "as shown above", no "this report finds", just the reasoning itself. Do not repeat the answer sentence itself, only support it. Ban stock filler phrases: "it is worth noting", "in conclusion", "overall".

Return ONLY valid JSON:
{ "rationale": "2-4 sentences of standalone-readable supporting reasoning" }`;
}

export async function analyseConclusion(researchProjectId: string): Promise<Conclusion> {
  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("research_question, research_mode")
    .eq("id", researchProjectId)
    .single();

  if (!project) throw new IntelligenceError(404, "Research project not found");
  if (!project.research_question?.trim()) {
    throw new IntelligenceError(400, "This project has no Research Question set, a Conclusion has nothing to answer without one.");
  }

  const report = await getSummary<ExecutiveReport>("research_project", researchProjectId, "executive_report");
  if (!report || (report.status !== "approved" && report.status !== "published")) {
    throw new IntelligenceError(
      400,
      "This project's Executive Report must be approved before a Conclusion can be generated, the Conclusion distils the approved report, it doesn't synthesise the evidence again."
    );
  }

  const reportContent = report.edited_content ?? report.content;

  const raw = await completeJSON<RawRationale>({
    prompt: buildRationalePrompt(project.research_question, reportContent.research_answer, reportContent),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   512,
  });

  const expectedSimulated = project.research_mode === "simulated";

  return {
    answer:            reportContent.research_answer,
    rationale:         raw.rationale,
    research_question: project.research_question,
    generated_at:      new Date().toISOString(),
    research_mode:     project.research_mode,
    synthetic_notice:  expectedSimulated ? CONCLUSION_SYNTHETIC_NOTICE_TEXT : null,
  };
}

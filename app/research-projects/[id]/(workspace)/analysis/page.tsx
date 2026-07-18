"use client";

// Analysis homepage — the Research Intelligence workspace. Reads like a research
// report: Executive Summary → Research Confidence → Project Key Findings →
// Research Aspects → Researcher Notes, composed over the objects the engine
// already produced. Analysis answers "what does it mean?" (Dashboard answers
// "what have we collected?", Reports "how do we deliver it?"). Per-source finding
// readers remain as drill-downs behind the evidence, not first-class pages.
import { AnalysisWorkspace } from "@/app/components/research-projects/analysis/AnalysisWorkspace";

export default function AnalysisPage() {
  return <AnalysisWorkspace />;
}

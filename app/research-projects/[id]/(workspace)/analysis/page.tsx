"use client";

// Analysis homepage — the research synthesis workspace. Structured evidence is
// synthesised into findings organised by Research Aspect, each finding expandable
// to the conversations that support it. Analysis answers "what does it mean?"
// (Dashboard answers "what have we collected?", Reports "how do we deliver it?").
// The (workspace) layout provides the shell; AspectSynthesisReader provides its
// own PageContainer + header. Per-source finding readers remain as drill-downs
// behind the evidence, not first-class analysis pages.
import { AspectSynthesisReader } from "@/app/components/research-projects/analysis/AspectSynthesisReader";

export default function AnalysisPage() {
  return <AspectSynthesisReader />;
}

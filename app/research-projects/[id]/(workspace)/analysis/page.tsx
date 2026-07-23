"use client";

// Analysis — the analyst surface. Candidate Findings the reasoning engine
// produced, organised by Research Requirement and Information Need, led by the
// best-supported reading with its rivals one click away. The analyst reviews
// consultancy-quality candidate findings here, not raw AI output. Approved
// findings flow into Reports.
//
// This replaces the aspect-synthesis workspace (docs/intelligence-model.md
// supersedes the aspect model). The old readers survive as drill-downs under
// /analysis/{survey,conversation,document} until Reports is re-pointed.
import { FindingsBoard } from "@/app/components/research-projects/findings/FindingsBoard";

export default function AnalysisPage() {
  return <FindingsBoard />;
}

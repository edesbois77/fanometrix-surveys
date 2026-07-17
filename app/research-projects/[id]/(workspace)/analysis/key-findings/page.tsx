"use client";

// Analysis › Key Findings — the cross-source findings reader, mounted inside the
// Research Project workspace shell (Analysis active, project header, "← Back to
// Analysis"). Reuses the shared KeyFindingsReader; engine and stored output are
// untouched.
import { KeyFindingsReader } from "@/app/components/research-projects/analysis/KeyFindingsReader";

export default function AnalysisKeyFindingsPage() {
  return <KeyFindingsReader />;
}

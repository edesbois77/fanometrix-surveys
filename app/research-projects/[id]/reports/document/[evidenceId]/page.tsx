"use client";

// Document Findings — global/report host. The reader now lives in the shared,
// chromeless DocumentFindingsReader so it can also mount inside the Research
// Project workspace shell. This page keeps the AdminShell chrome, so Product
// Walkthrough's re-export of this page is unchanged.
import { AdminShell } from "@/app/components/AdminShell";
import { DocumentFindingsReader } from "@/app/components/research-projects/analysis/DocumentFindingsReader";

export default function DocumentIntelligencePage() {
  return (
    <AdminShell>
      <DocumentFindingsReader />
    </AdminShell>
  );
}

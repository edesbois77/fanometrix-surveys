"use client";

// Key Findings — global/report host. The reader now lives in the shared,
// chromeless KeyFindingsReader so it can also mount inside the Research Project
// workspace shell. This page keeps the AdminShell chrome, so Product
// Walkthrough's re-export of this page is unchanged.
import { AdminShell } from "@/app/components/AdminShell";
import { KeyFindingsReader } from "@/app/components/research-projects/analysis/KeyFindingsReader";

export default function KeyFindingsPage() {
  return (
    <AdminShell>
      <KeyFindingsReader />
    </AdminShell>
  );
}

"use client";

// Conversation Findings — global/report host. The reader now lives in the
// shared, chromeless ConversationFindingsReader so it can also mount inside the
// Research Project workspace shell. This page keeps the AdminShell chrome, so
// Product Walkthrough's re-export of this page is unchanged.
import { AdminShell } from "@/app/components/AdminShell";
import { ConversationFindingsReader } from "@/app/components/research-projects/analysis/ConversationFindingsReader";

export default function ConversationIntelligencePage() {
  return (
    <AdminShell>
      <ConversationFindingsReader />
    </AdminShell>
  );
}

"use client";

// Dashboard › Conversation Intelligence › Evidence — the collected conversations,
// project-scoped, to review before generating findings. The body reads the
// project from context and fetches every conversation across the project's
// searches; wrapped in Suspense because it reads a `?search=` query param.
import { Suspense } from "react";
import { ConversationEvidenceTab } from "@/app/components/research-projects/dashboard/ConversationEvidenceTab";

export default function DashboardConversationEvidencePage() {
  return (
    <Suspense fallback={<div className="fx-skeleton rounded-xl" style={{ height: 200 }} />}>
      <ConversationEvidenceTab />
    </Suspense>
  );
}

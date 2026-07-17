"use client";

// Analysis › Conversation Findings reader, mounted inside the Research Project
// workspace shell. Reuses the shared ConversationFindingsReader; review logic,
// engine, approval workflow and stored output are untouched.
import { ConversationFindingsReader } from "@/app/components/research-projects/analysis/ConversationFindingsReader";

export default function AnalysisConversationFindingsPage() {
  return <ConversationFindingsReader />;
}

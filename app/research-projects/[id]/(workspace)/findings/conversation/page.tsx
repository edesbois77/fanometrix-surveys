// Findings · Conversation — News, YouTube, Bluesky and other conversation
// evidence, grouped by platform.
import { SourceFindingsSection } from "@/app/components/research-projects/findings/SourceFindingsSection";
import { CONVERSATION_KINDS } from "@/lib/analysis/source-findings/types";

export default function ConversationFindingsPage() {
  return <SourceFindingsSection kinds={CONVERSATION_KINDS} />;
}

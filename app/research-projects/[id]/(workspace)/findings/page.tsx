// The Source Findings stage: Evidence → Source Findings → Approval → Analysis.
// The analyst reviews and approves per-source findings here; only approved
// findings feed the cross-source Analysis.
import { SourceFindingsBoard } from "@/app/components/research-projects/findings/SourceFindingsBoard";

export default function FindingsPage() {
  return <SourceFindingsBoard />;
}

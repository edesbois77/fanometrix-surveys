"use client";

import { SectionCard, InfoContent, CollapsedSummary } from "@/app/components/research-projects/Shell";
import { KnowledgeList, type KnowledgeEntry } from "@/app/components/research-projects/KnowledgeList";

export function KnowledgeSection({ publishedConclusion }: {
  publishedConclusion: { answer: string; rationale: string; generated_at: string } | null;
}) {
  const entries: KnowledgeEntry[] = publishedConclusion
    ? [{
        id: "conclusion",
        sourceLabel: "Conclusion",
        headline: publishedConclusion.answer,
        body: publishedConclusion.rationale,
        publishedAt: publishedConclusion.generated_at,
      }]
    : [];
  return (
    <SectionCard
      id="knowledge"
      title="Knowledge"
      info={
        <InfoContent title="Where this project's published Conclusion lands.">
          <p>The start of a reusable knowledge library, built as a list from day one.</p>
          <p className="mt-1.5">Scoped to this project for now, drawing on knowledge across research projects is a larger capability for later.</p>
        </InfoContent>
      }
      summary={
        <CollapsedSummary groups={[{ parts: [entries.length > 0 ? `${entries.length} entr${entries.length !== 1 ? "ies" : "y"}` : "No entries yet"] }]} />
      }
    >
      <KnowledgeList entries={entries} />
    </SectionCard>
  );
}

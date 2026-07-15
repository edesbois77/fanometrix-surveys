"use client";

// Knowledge, structured as a library from day one — a list of published
// entries belonging to this project, not a single hardcoded "the
// conclusion" block. Today that list only ever holds zero or one entry
// (the published Conclusion), but building it as a list now means a
// second entry — a republished Conclusion, or a future knowledge-eligible
// artifact type — is already the right shape, not a rebuild. Deliberately
// scoped to this project's own entries; a cross-project knowledge base is
// a separate, larger capability for later.
export type KnowledgeEntry = {
  id: string;
  sourceLabel: string;
  headline: string;
  body: string;
  publishedAt: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function KnowledgeList({ entries }: { entries: KnowledgeEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 py-2">No knowledge published yet, once this project&apos;s Conclusion is published, it appears here.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(e => (
        <div key={e.id} className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{e.sourceLabel}</span>
            <span className="text-xs text-gray-400">Published {formatDate(e.publishedAt)}</span>
          </div>
          <p className="text-base font-semibold text-gray-900 mb-1.5">{e.headline}</p>
          <p className="text-sm text-gray-600 leading-relaxed">{e.body}</p>
        </div>
      ))}
    </div>
  );
}

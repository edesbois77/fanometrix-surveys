"use client";

// Search, filter and attach an already-existing Research Library document
// to a Research Project — the Document counterpart to
// AttachExistingSurveyModal/AttachExistingConversationSearchModal. There is
// no "Create New" path here (documents are uploaded via the Research
// Library itself, not authored per-project), so unlike those two siblings
// this is the only picker AddEvidenceModal needs for Document.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DOCUMENT_TYPES } from "@/lib/library-documents/constants";

type LibraryDocumentRow = {
  id: string;
  title: string;
  document_type: string;
  status: "uploaded" | "extracting" | "analysing" | "pending_review" | "approved" | "failed";
  original_filename: string;
  page_count: number | null;
  tags: string[];
};

const STATUS_META: Record<LibraryDocumentRow["status"], { label: string; className: string }> = {
  uploaded:       { label: "Preparing…",   className: "bg-gray-100 text-gray-500" },
  extracting:     { label: "Extracting…",  className: "bg-gray-100 text-gray-500" },
  analysing:      { label: "Analysing…",   className: "bg-amber-50 text-amber-700" },
  pending_review: { label: "Needs Review", className: "bg-amber-50 text-amber-700" },
  approved:       { label: "Approved",     className: "bg-green-50 text-green-700" },
  failed:         { label: "Failed",       className: "bg-red-50 text-red-600" },
};

const SELECT_CLS = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600";

export function AttachExistingDocumentModal({
  excludeDocumentIds, onClose, onAttach, onUploadNew, projectId,
}: {
  excludeDocumentIds: string[];
  onClose: () => void;
  onAttach: (documentId: string) => Promise<void> | void;
  // When provided (in a Research Project), "upload a new document" happens
  // INSIDE the project rather than sending the user to the standalone Library.
  onUploadNew?: () => void;
  // Scopes the candidate list to documents whose governance permits attachment to
  // THIS project — org-restricted docs never surface outside their owning org.
  projectId?: string;
}) {
  const [docs, setDocs] = useState<LibraryDocumentRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(projectId ? `/api/library-documents?project_id=${encodeURIComponent(projectId)}` : "/api/library-documents");
      const json = await res.json();
      setDocs(json.data ?? []);
    })();
  }, [projectId]);

  const filtered = useMemo(() => {
    let list = (docs ?? [])
      .filter(d => !excludeDocumentIds.includes(d.id))
      .filter(d => d.status !== "failed");

    if (typeFilter !== "all") list = list.filter(d => d.document_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [docs, excludeDocumentIds, typeFilter, search]);

  async function handleAttach(d: LibraryDocumentRow) {
    setAttachingId(d.id);
    await onAttach(d.id);
    setAttachingId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">Add from Research Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 space-y-3">
          <input
            type="search"
            placeholder="Search documents or tags…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={SELECT_CLS}>
            <option value="all">All Types</option>
            {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {docs === null && <p className="text-sm text-gray-400 px-2 py-4">Loading…</p>}
          {docs !== null && filtered.length === 0 && (
            <p className="text-sm text-gray-400 px-2 py-4">
              No matching documents. Try a different search or filter{onUploadNew ? ", or upload a new one." : ", or upload one from the Research Library."}
            </p>
          )}
          {filtered.map(d => {
            const status = STATUS_META[d.status];
            const typeLabel = DOCUMENT_TYPES.find(t => t.value === d.document_type)?.label ?? d.document_type;
            return (
              <div key={d.id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>{status.label}</span>
                    <span className="text-xs text-gray-400">{typeLabel}</span>
                    {d.page_count && <span className="text-xs text-gray-400">· {d.page_count} pages</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleAttach(d)}
                  disabled={attachingId === d.id || d.status === "extracting" || d.status === "analysing" || d.status === "uploaded"}
                  title={d.status === "approved" ? "" : "This document is still being processed by the Research Library."}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                  style={{ background: "#D7B87A", color: "#0B1929" }}
                >
                  {attachingId === d.id ? "Attaching…" : "Attach"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0 text-center">
          {onUploadNew ? (
            <button onClick={onUploadNew} className="text-xs font-semibold text-[#0B1929] hover:underline">
              Don&apos;t see it? Upload a new document →
            </button>
          ) : (
            <Link href="/research-library" target="_blank" className="text-xs font-semibold text-[#0B1929] hover:underline">
              Don&apos;t see it? Upload a new document in the Research Library →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

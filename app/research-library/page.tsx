"use client";

// Research Library — list with keyword/metadata search & filter, plus the
// upload entry point. Keyword search hits the server's search_vector
// column (title/publisher/tags/topics/brands/markets/sports_competitions —
// see GET /api/library-documents' own comment); document type, status and
// tags are separate filter controls layered on top.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { UploadDocumentModal } from "@/app/components/library-documents/UploadDocumentModal";
import { MultiSelect } from "@/app/components/MultiSelect";
import { DOCUMENT_TYPES } from "@/lib/library-documents/constants";

type LibraryDocumentListItem = {
  id: string;
  title: string;
  document_type: string;
  status: "uploaded" | "extracting" | "analysing" | "pending_review" | "approved" | "failed";
  error_message: string | null;
  original_filename: string;
  page_count: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  approved_at: string | null;
  tags: string[];
};

const STATUS_LABEL: Record<LibraryDocumentListItem["status"], { label: string; tone: string }> = {
  uploaded:        { label: "Preparing…",     tone: "bg-gray-100 text-gray-500" },
  extracting:      { label: "Extracting…",    tone: "bg-gray-100 text-gray-500" },
  analysing:       { label: "Analysing…",     tone: "bg-amber-50 text-amber-700" },
  pending_review:  { label: "Needs Review",   tone: "bg-amber-50 text-amber-700" },
  approved:        { label: "Approved",       tone: "bg-green-50 text-green-700" },
  failed:          { label: "Failed",         tone: "bg-red-50 text-red-600" },
};

const SELECT = "px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A] transition-colors";

export default function ResearchLibraryPage() {
  const [docs, setDocs] = useState<LibraryDocumentListItem[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [q, setQ] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [status, setStatus] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Tag vocabulary for the filter dropdown — fetched unfiltered once, kept
  // separate from `docs` so the option list doesn't shrink as the user's
  // own filters narrow the visible results.
  useEffect(() => {
    fetch("/api/library-documents").then(r => r.json()).then(json => {
      const tagSet = new Set<string>();
      for (const d of (json.data ?? []) as LibraryDocumentListItem[]) d.tags.forEach(t => tagSet.add(t));
      setAllTags([...tagSet].sort());
    });
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (documentType) params.set("document_type", documentType);
    if (status) params.set("status", status);
    tags.forEach(t => params.append("tag", t));

    const res = await fetch(`/api/library-documents?${params.toString()}`);
    const json = await res.json();
    setDocs(json.data ?? []);
  }, [q, documentType, status, tags]);

  // Debounced — filters refetch immediately via the effect below, only the
  // free-text box needs a delay so every keystroke doesn't fire a request.
  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const hasFilters = q.trim() !== "" || documentType !== "" || status !== "" || tags.length > 0;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Research Library</h1>
            <p className="text-sm text-gray-400 mt-0.5">Reusable documents — industry reports, case studies, benchmarks and more.</p>
          </div>
          <button onClick={() => setUploadOpen(true)}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl" style={{ background: "#0B1929", color: "#D7B87A" }}>
            + Upload Document
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-3 mb-4">
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search title, publisher, tags, topics, brands, markets…"
            className="flex-1 min-w-[240px] px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors"
          />
          <select value={documentType} onChange={e => setDocumentType(e.target.value)} className={SELECT}>
            <option value="">All types</option>
            {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={SELECT}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as LibraryDocumentListItem["status"][]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s].label}</option>
            ))}
          </select>
          <div className="w-full md:w-56">
            <MultiSelect
              options={allTags.map(t => ({ value: t, label: t }))}
              selected={tags}
              onChange={setTags}
              placeholder="Filter by tag…"
            />
          </div>
        </div>

        {docs === null && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {docs !== null && docs.length === 0 && (
          <div className="border border-dashed border-gray-200 rounded-2xl p-10 text-center">
            <p className="text-sm text-gray-400">
              {hasFilters ? "No documents match these filters." : "No documents yet. Upload one to get started."}
            </p>
          </div>
        )}

        {docs !== null && docs.length > 0 && (
          <div className="space-y-2">
            {docs.map(d => {
              const status = STATUS_LABEL[d.status];
              const typeLabel = DOCUMENT_TYPES.find(t => t.value === d.document_type)?.label ?? d.document_type;
              return (
                <Link key={d.id} href={`/research-library/${d.id}`}
                  className="block border border-gray-100 rounded-xl px-4 py-3 hover:border-[#D7B87A] hover:bg-[#D7B87A]/5 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {typeLabel} · {d.original_filename}{d.page_count ? ` · ${d.page_count} pages` : ""}
                        {d.uploaded_by ? ` · Uploaded by ${d.uploaded_by}` : ""}
                      </p>
                      {d.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {d.tags.slice(0, 6).map(t => (
                            <span key={t} className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${status.tone}`}>{status.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {uploadOpen && <UploadDocumentModal onClose={() => { setUploadOpen(false); load(); }} />}
    </AdminShell>
  );
}

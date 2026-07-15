"use client";

// Search, filter, sort, preview and attach an already-existing survey to a
// Research Project — the counterpart to "Create New Survey" in the
// Evidence modal. Many projects reuse a survey created for another study,
// so this is a first-class path, not an afterthought.
import { useEffect, useMemo, useState } from "react";
import { SurveyPreviewModal, type PreviewableSurvey } from "@/app/components/SurveyPreviewModal";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { LocalisedQuestion, LocalisedText } from "@/lib/survey-locale";

type SurveyRow = {
  id: string;
  name: string;
  status: "draft" | "ready" | "archived" | "deleted";
  brand_org_id: string | null;
  agency_org_id: string | null;
  topic: string | null;
  campaign_count: number;
  response_count: number;
  created_at: string;
  questions: LocalisedQuestion[];
  thank_you_title: LocalisedText;
  thank_you_body: LocalisedText;
  enabled_languages: string[];
  is_simulated: boolean;
};

const SELECT_CLS = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600";

export function AttachExistingSurveyModal({
  excludeSurveyIds, orgName, orgBrands, isSimulated, onClose, onAttach,
}: {
  excludeSurveyIds: string[];
  orgName: (id: string | null) => string;
  orgBrands: { id: string; name: string }[];
  // Only surveys whose own is_simulated matches the current project are
  // ever attachable (the provenance trigger rejects anything else), so the
  // picker only ever shows matching ones rather than listing something
  // guaranteed to fail on Attach.
  isSimulated: boolean;
  onClose: () => void;
  onAttach: (surveyId: string) => Promise<void> | void;
}) {
  const [surveys, setSurveys] = useState<SurveyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "ready">("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "az" | "most_used">("recent");
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [previewSurvey, setPreviewSurvey] = useState<SurveyRow | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/surveys");
      const json = await res.json();
      setSurveys(json.data ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = (surveys ?? [])
      .filter(s => s.status !== "archived" && s.status !== "deleted")
      .filter(s => !excludeSurveyIds.includes(s.id))
      .filter(s => !!s.is_simulated === isSimulated);

    if (statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (brandFilter !== "all") list = list.filter(s => s.brand_org_id === brandFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.topic ?? "").toLowerCase().includes(q) ||
        orgName(s.brand_org_id).toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case "recent":    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "az":        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "most_used": return [...list].sort((a, b) => b.campaign_count - a.campaign_count);
      default:          return list;
    }
  }, [surveys, excludeSurveyIds, isSimulated, statusFilter, brandFilter, search, sortBy, orgName]);

  async function handleAttach(s: SurveyRow) {
    setAttachingId(s.id);
    await onAttach(s.id);
    setAttachingId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">Attach Existing Survey</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 space-y-3">
          <input
            type="search"
            placeholder="Search surveys…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          />
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={SELECT_CLS}>
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className={SELECT_CLS}>
              <option value="all">All Brands</option>
              {orgBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className={SELECT_CLS}>
              <option value="recent">Most recent</option>
              <option value="az">A–Z</option>
              <option value="most_used">Most used</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {surveys === null && <p className="text-sm text-gray-400 px-2 py-4">Loading…</p>}
          {surveys !== null && filtered.length === 0 && (
            <p className="text-sm text-gray-400 px-2 py-4">
              {isSimulated
                ? "No matching simulated surveys, try a different search or filter, or create a new one instead."
                : "No matching surveys, try a different search or filter."}
            </p>
          )}
          {filtered.map(s => (
            <div key={s.id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "ready" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {s.status === "ready" ? "Ready" : "Draft"}
                  </span>
                  {orgName(s.brand_org_id) && <span className="text-xs text-gray-400">{orgName(s.brand_org_id)}</span>}
                  {orgName(s.agency_org_id) && <span className="text-xs text-gray-400">· {orgName(s.agency_org_id)}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span>{s.response_count.toLocaleString()} response{s.response_count !== 1 ? "s" : ""}</span>
                  <span>Used by {s.campaign_count} campaign{s.campaign_count !== 1 ? "s" : ""}</span>
                  <span>Created {formatRelativeTime(s.created_at)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <button onClick={() => setPreviewSurvey(s)}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                  Preview
                </button>
                <button
                  onClick={() => handleAttach(s)}
                  disabled={attachingId === s.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                  style={{ background: "#D7B87A", color: "#0B1929" }}
                >
                  {attachingId === s.id ? "Attaching…" : "Attach"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewSurvey && (
        <SurveyPreviewModal survey={previewSurvey as PreviewableSurvey} onClose={() => setPreviewSurvey(null)} />
      )}
    </div>
  );
}

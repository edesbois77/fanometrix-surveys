"use client";

// Search, filter, sort and attach an already-existing Conversation Search
// to a Research Project — the counterpart to "Create New Search" in the
// Evidence modal. Structural twin of AttachExistingSurveyModal.tsx.
import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ENTITY_TYPES } from "@/lib/social-taxonomy";

type SearchRow = {
  id: string;
  name: string;
  status: "Draft" | "Active" | "Paused" | "Archived";
  entity_type: string;
  markets: string[];
  platforms: string[];
  social_keywords: { keyword: string; keyword_type: string }[];
  created_at: string;
  is_simulated: boolean;
};

const SELECT_CLS = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600";

export function AttachExistingConversationSearchModal({
  excludeSearchIds, isSimulated, onClose, onAttach,
}: {
  excludeSearchIds: string[];
  // Only searches whose own is_simulated matches the current project are
  // ever attachable (the provenance trigger rejects anything else), so the
  // picker only ever shows matching ones rather than listing something
  // guaranteed to fail on Attach.
  isSimulated: boolean;
  onClose: () => void;
  onAttach: (searchId: string) => Promise<void> | void;
}) {
  const [searches, setSearches] = useState<SearchRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Draft" | "Active" | "Paused">("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "az">("recent");
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/social/searches");
      const json = await res.json();
      setSearches(json.data ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = (searches ?? [])
      .filter(s => s.status !== "Archived")
      .filter(s => !excludeSearchIds.includes(s.id))
      .filter(s => !!s.is_simulated === isSimulated);

    if (statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (entityFilter !== "all") list = list.filter(s => s.entity_type === entityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.social_keywords ?? []).some(k => k.keyword.toLowerCase().includes(q))
      );
    }

    switch (sortBy) {
      case "recent": return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "az":     return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:       return list;
    }
  }, [searches, excludeSearchIds, isSimulated, statusFilter, entityFilter, search, sortBy]);

  async function handleAttach(s: SearchRow) {
    setAttachingId(s.id);
    await onAttach(s.id);
    setAttachingId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">Attach Existing Conversation Search</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 space-y-3">
          <input
            type="search"
            placeholder="Search by name or keyword…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          />
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={SELECT_CLS}>
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
            </select>
            <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={SELECT_CLS}>
              <option value="all">All Types</option>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className={SELECT_CLS}>
              <option value="recent">Most recent</option>
              <option value="az">A–Z</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {searches === null && <p className="text-sm text-gray-400 px-2 py-4">Loading…</p>}
          {searches !== null && filtered.length === 0 && (
            <p className="text-sm text-gray-400 px-2 py-4">
              {isSimulated
                ? "No matching simulated conversation searches, try a different search or filter, or create a new one instead."
                : "No matching conversation searches, try a different search or filter."}
            </p>
          )}
          {filtered.map(s => (
            <div key={s.id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.status === "Active" ? "bg-green-50 text-green-700" : s.status === "Paused" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {s.status}
                  </span>
                  <span className="text-xs text-gray-400">{s.entity_type}</span>
                  {s.markets.length > 0 && <span className="text-xs text-gray-400">· {s.markets.join(", ")}</span>}
                </div>
                {s.social_keywords.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1.5 truncate">
                    Keywords: {s.social_keywords.map(k => k.keyword).join(", ")}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">Created {formatRelativeTime(s.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
    </div>
  );
}

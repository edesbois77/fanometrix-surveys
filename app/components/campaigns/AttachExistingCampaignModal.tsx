"use client";

// "Attach Existing Campaign" — associate a campaign that already exists with
// THIS survey (and project). Mirrors the Attach-Existing pattern used for the
// other evidence types: pick from campaigns not already on this survey, and a
// partial PUT reassigns its research_project_id + survey_id (the PUT route only
// updates the fields sent, so nothing else is disturbed).
import { useEffect, useMemo, useState } from "react";
import type { Campaign } from "@/app/components/campaigns/types";
import { StatusBadge } from "@/app/components/campaigns/StatusBadge";

export function AttachExistingCampaignModal({
  projectId, surveyEvidenceId, surveyName, orgName, onClose, onAttached,
}: {
  projectId: string;
  surveyEvidenceId: string;
  surveyName: string;
  orgName: (id: string | null) => string;
  onClose: () => void;
  onAttached: (msg: string, ok: boolean) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [attaching, setAttaching] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/campaigns");
      const json = await res.json().catch(() => ({}));
      // Exclude campaigns already serving this survey; everything else is
      // attachable (standalone, or currently on another survey/project).
      setCampaigns((json.data ?? []).filter((c: Campaign) => (c.effective_survey_id ?? c.survey_id) !== surveyEvidenceId));
      setLoading(false);
    })();
  }, [surveyEvidenceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(c =>
      c.campaign_name.toLowerCase().includes(q) ||
      c.campaign_id.toLowerCase().includes(q) ||
      orgName(c.publisher_org_id).toLowerCase().includes(q)
    );
  }, [campaigns, search, orgName]);

  async function attach(c: Campaign) {
    setAttaching(c.id);
    const res = await fetch(`/api/campaigns/${c.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ research_project_id: projectId, survey_id: surveyEvidenceId }),
    });
    const json = await res.json().catch(() => ({}));
    setAttaching(null);
    if (!res.ok) { onAttached(json.error ?? "Failed to attach campaign.", false); return; }
    onAttached(`“${c.campaign_name}” attached to ${surveyName}.`, true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Select Existing Campaign</h2>
            <p className="text-xs text-gray-400 mt-0.5">Attach an existing campaign to {surveyName}.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns by name, ID or publisher…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          />
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading campaigns…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{campaigns.length === 0 ? "No other campaigns to attach." : "No campaigns match your search."}</p>
          ) : filtered.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.campaign_name}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                  {orgName(c.publisher_org_id) && <span>{orgName(c.publisher_org_id)}</span>}
                  {(c.market || c.country_code) && <span>· {c.market || c.country_code}</span>}
                  {c.surveys?.name && <span>· Survey: {c.surveys.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={c.effective_status ?? (c.status as Campaign["effective_status"])} />
                <button
                  onClick={() => attach(c)}
                  disabled={attaching === c.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  {attaching === c.id ? "Attaching…" : "Attach"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

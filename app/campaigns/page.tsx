"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import {
  availableActions,
  ACTION_LABELS,
  STATUS_META,
  type CampaignStatus,
  type CampaignAction,
} from "@/lib/campaign-status";

type Survey = { id: string; name: string };
type Campaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  campaign_description: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  surveys?: { name: string } | null;
  publishers: string[];
  status: string;
  effective_status: CampaignStatus;
  status_reason: string | null;
  is_auto_transition: boolean;
  response_count: number;
  target_responses: number | null;
  archive_after_days: number;
  manual_status_override: string | null;
  created_at: string;
};

const BLANK: Partial<Campaign> = {
  campaign_id: "", brand_name: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publishers: [], status: "draft",
  target_responses: null, archive_after_days: 90,
};

function generateCampaignId(brand: string, name: string): string {
  const year = new Date().getFullYear();
  return `${brand}_${name}_${year}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${m.bg} ${m.text}`}>
      <span className="text-[9px] leading-none">{m.dot}</span>
      {m.label}
    </span>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
  publish:  "border-blue-200 text-blue-700 hover:bg-blue-50",
  go_live:  "border-green-200 text-green-700 hover:bg-green-50",
  pause:    "border-orange-200 text-orange-700 hover:bg-orange-50",
  resume:   "border-green-200 text-green-700 hover:bg-green-50",
  close:    "border-gray-200 text-gray-600 hover:bg-gray-50",
  archive:  "border-gray-200 text-gray-500 hover:bg-gray-50",
  restore:  "border-blue-200 text-blue-700 hover:bg-blue-50",
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function CampaignProgress({ c }: { c: Campaign }) {
  const hasTarget = c.target_responses !== null && c.target_responses > 0;
  const pct = hasTarget
    ? Math.min(100, Math.round((c.response_count / c.target_responses!) * 100))
    : null;

  const now      = new Date();
  const end      = c.end_date ? new Date(c.end_date) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / 86_400_000) : null;

  // Always render if there's an auto-close reason to show, even without target/end
  if (!hasTarget && !end && !c.is_auto_transition) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {hasTarget && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {c.response_count.toLocaleString()} / {c.target_responses!.toLocaleString()} responses
            </span>
            <span className="font-semibold text-gray-700">{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct! >= 100 ? "#10b981" : pct! >= 75 ? "#D7B87A" : "#0B1929",
              }}
            />
          </div>
        </>
      )}
      {!hasTarget && c.response_count > 0 && (
        <p className="text-xs text-gray-400">{c.response_count.toLocaleString()} responses collected</p>
      )}
      {daysLeft !== null && c.effective_status === "live" && (
        <p className="text-xs text-gray-400">
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
            : "Ending today"}
        </p>
      )}
      {/* Auto-close / auto-transition reason — shown directly on the card */}
      {c.is_auto_transition && c.status_reason && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <span>🔴</span>
          <span>{c.status_reason}</span>
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [surveys,   setSurveys]   = useState<Survey[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,   setEditing]   = useState<Partial<Campaign>>(BLANK);
  const [pubInput,  setPubInput]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [error,     setError]     = useState("");
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [camRes, surRes] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/surveys"),
    ]);
    setCampaigns((await camRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing({ ...BLANK, publishers: [] });
    setPubInput("");
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(c: Campaign) {
    const { surveys: _surveys, ...rest } = c as Campaign & { surveys?: unknown };
    setEditing({ ...rest });
    setPubInput("");
    setError("");
    setDrawerOpen(true);
  }

  function autoId() {
    const id = generateCampaignId(editing.brand_name ?? "", editing.campaign_name ?? "");
    setEditing(e => ({ ...e, campaign_id: id }));
  }

  function addPublisher() {
    const val = pubInput.trim();
    if (!val) return;
    setEditing(e => ({ ...e, publishers: [...(e.publishers ?? []), val] }));
    setPubInput("");
  }

  function removePublisher(idx: number) {
    setEditing(e => ({ ...e, publishers: (e.publishers ?? []).filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!editing.brand_name?.trim())   { setError("Brand name is required.");   return; }
    if (!editing.campaign_name?.trim()) { setError("Campaign name is required."); return; }
    if (!editing.campaign_id?.trim())  { setError("Campaign ID is required.");   return; }
    setError(""); setSaving(true);

    // Strip joined fields before sending to API
    const {
      surveys: _s, effective_status: _es, response_count: _rc,
      ...payload
    } = editing as Campaign;

    const url    = editing.id ? `/api/campaigns/${editing.id}` : "/api/campaigns";
    const method = editing.id ? "PUT" : "POST";

    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to save.");
      return;
    }
    setDrawerOpen(false);
    showToast(editing.id ? "Campaign updated." : "Campaign created.");
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    showToast("Campaign deleted.");
    load();
  }

  async function handleAction(campaignId: string, action: CampaignAction) {
    setActioning(campaignId + action);
    const res  = await fetch(`/api/campaigns/${campaignId}/actions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    const json = await res.json();
    setActioning(null);

    if (!res.ok) {
      showToast(json.error ?? "Action failed.", false);
    } else {
      showToast(`Campaign ${ACTION_LABELS[action].toLowerCase()}d.`);
      load();
    }
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-sm text-gray-400 mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ background: "#D7B87A", color: "#0B1929" }}
          >
            + Create Campaign
          </button>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && campaigns.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first campaign to get started.</p>
          </div>
        )}

        <div className="space-y-3">
          {campaigns.map(c => {
            const actions = availableActions(c.effective_status ?? c.status as CampaignStatus);
            return (
              <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:border-gray-200 transition-colors">
                <div className="flex items-start gap-4">

                  {/* Left: campaign info */}
                  <Link href={`/campaigns/${c.id}`} className="flex-1 min-w-0 block group">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-gray-900 group-hover:text-[#0B1929]">{c.brand_name}</p>
                      <span className="text-gray-300">·</span>
                      <p className="text-gray-700">{c.campaign_name}</p>
                      <StatusBadge status={c.effective_status ?? c.status as CampaignStatus} />
                    </div>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{c.campaign_id}</p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {c.surveys?.name && (
                        <span className="text-xs bg-gray-100 text-[#0B1929] px-2 py-0.5 rounded-full">
                          Survey: {c.surveys.name}
                        </span>
                      )}
                      {(c.publishers ?? []).map(p => (
                        <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
                      ))}
                      {c.start_date && (
                        <span className="text-xs text-gray-400">
                          {c.start_date} → {c.end_date ?? "ongoing"}
                        </span>
                      )}
                    </div>

                    <CampaignProgress c={c} />
                  </Link>

                  {/* Right: action buttons */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {/* Primary actions */}
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {actions.map(action => (
                        <button
                          key={action}
                          onClick={() => handleAction(c.id, action)}
                          disabled={actioning === c.id + action}
                          className={`text-xs border px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${ACTION_STYLE[action] ?? "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                        >
                          {actioning === c.id + action ? "…" : ACTION_LABELS[action]}
                        </button>
                      ))}
                    </div>
                    {/* Edit / Delete */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                      >
                        Edit
                      </button>
                      {/* Delete only available for Draft/Scheduled with zero responses */}
                      {(c.status === "draft" || c.status === "scheduled") && c.response_count === 0 ? (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg"
                        >
                          Delete
                        </button>
                      ) : (
                        <span
                          title="Campaigns with responses cannot be deleted to preserve reporting integrity."
                          className="text-xs border border-gray-100 text-gray-300 px-3 py-1.5 rounded-lg cursor-not-allowed select-none"
                        >
                          Delete
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Edit / Create Drawer ─────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Campaign" : "Create Campaign"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand Name *">
                  <input value={editing.brand_name ?? ""} onChange={e => setEditing(x => ({ ...x, brand_name: e.target.value }))}
                    className={INP} placeholder="e.g. Carlsberg" />
                </Field>
                <Field label="Campaign Name *">
                  <input value={editing.campaign_name ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))}
                    className={INP} placeholder="e.g. UCL 2026" />
                </Field>
              </div>

              <Field label="Campaign ID *">
                <div className="flex gap-2">
                  <input value={editing.campaign_id ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))}
                    className={`flex-1 ${INP} font-mono`} placeholder="carlsberg_ucl_2026" />
                  <button onClick={autoId} className="text-xs border border-[#E0E1DD] text-[#0B1929] hover:bg-gray-50 px-3 rounded-lg">Auto</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Used in embed URLs. Lowercase, underscores only.</p>
              </Field>

              <Field label="Description">
                <input value={editing.campaign_description ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_description: e.target.value }))}
                  className={INP} placeholder="Optional" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                    className={INP} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={editing.end_date ?? ""} onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                    className={INP} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Target Responses">
                  <input
                    type="number" min={1}
                    value={editing.target_responses ?? ""}
                    onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))}
                    className={INP} placeholder="e.g. 10000 (optional)"
                  />
                </Field>
                <Field label="Archive After (days)">
                  <input
                    type="number" min={1}
                    value={editing.archive_after_days ?? 90}
                    onChange={e => setEditing(x => ({ ...x, archive_after_days: Number(e.target.value) || 90 }))}
                    className={INP} placeholder="90"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Survey">
                  <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                    className={INP}>
                    <option value="">None selected</option>
                    {surveys.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value }))}
                    className={INP}>
                    {(["draft","scheduled","live","paused","closed","archived"] as const).map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    Status controls whether the survey can accept responses. Certain statuses update automatically based on campaign dates and response targets.
                  </p>
                </Field>
              </div>

              <Field label="Publishers">
                <div className="flex gap-2 mb-2">
                  <input value={pubInput} onChange={e => setPubInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPublisher()}
                    className={INP} placeholder="e.g. FotMob" />
                  <button onClick={addPublisher} className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 rounded-lg">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editing.publishers ?? []).map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-[#0B1929] px-2 py-1 rounded-full">
                      {p}
                      <button onClick={() => removePublisher(i)} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              </Field>

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                {saving ? "Saving…" : "Save Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

"use client";

// Phase 1 of the Fanometrix V2 migration: gives Surveys the same
// AI-reviewed intelligence workflow Conversation Search already has,
// via the shared useIntelligenceReview hook. See
// lib/intelligence/analysts/analyseSurvey.ts for the analyst and
// app/api/surveys/[id]/insights/* for the backing routes.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";

// Must match lib/intelligence/analysts/analyseSurvey.ts's MIN_RESPONSES —
// duplicated here only so the modal can show the pre-check empty state
// before ever calling Generate (the server enforces the real limit).
const MIN_RESPONSES = 50;

type Status = "draft" | "edited" | "approved" | "published";

type SurveyForModal = { id: string; name: string; response_count: number };

type CampaignSummary = {
  id: string;
  campaign_name: string;
  status: string;
  response_count: number;
};

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string; style?: React.CSSProperties }> = {
    draft:     { label: "Draft",     className: "bg-gray-100 text-gray-600" },
    edited:    { label: "Edited",    className: "bg-amber-100 text-amber-700" },
    approved:  { label: "Approved",  className: "bg-green-100 text-green-700" },
    published: { label: "Published", className: "", style: { background: "#D7B87A", color: "#0B1929" } },
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`} style={s.style}>{s.label}</span>;
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-3 flex items-center gap-3" style={{ background: accent }}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function ListField({ items, onChange, addLabel }: { items: string[]; onChange: (items: string[]) => void; addLabel: string }) {
  return (
    <div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea value={item} rows={2}
              onChange={e => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, ""])} className="mt-2 text-xs font-semibold text-[#0B1929] hover:underline">
        + Add {addLabel}
      </button>
    </div>
  );
}

function NotableDifferencesField({ items, onChange }: {
  items: SurveyIntelligenceReport["notable_differences"];
  onChange: (items: SurveyIntelligenceReport["notable_differences"]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((nd, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={nd.segments.join(", ")} placeholder="Segments, e.g. IN, GB"
              onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, segments: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : it)))}
              className="w-40 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 ml-auto">×</button>
          </div>
          <textarea value={nd.finding} rows={2} placeholder="Finding"
            onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, finding: e.target.value } : it)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ))}
      <button onClick={() => onChange([...items, { finding: "", segments: [] }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add notable difference
      </button>
    </div>
  );
}

function RecommendedActionsField({ items, onChange }: {
  items: SurveyIntelligenceReport["recommended_actions"];
  onChange: (items: SurveyIntelligenceReport["recommended_actions"]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((a, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={a.action} placeholder="Recommended action"
              onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, action: e.target.value } : it)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1">×</button>
          </div>
          <textarea value={a.rationale} rows={2} placeholder="Rationale"
            onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, rationale: e.target.value } : it)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ))}
      <button onClick={() => onChange([...items, { action: "", rationale: "" }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add recommended action
      </button>
    </div>
  );
}

export function SurveyIntelligenceModal({ survey, onClose }: { survey: SurveyForModal; onClose: () => void }) {
  const adapter: IntelligenceReviewAdapter<SurveyIntelligenceReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights`);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate intelligence." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: json.data };
    },
  }), [survey.id]);

  const {
    row, draft, editing, loading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
  } = useIntelligenceReview<SurveyIntelligenceReport>(adapter, [survey.id]);

  const notEnoughData = !row && !loading && survey.response_count < MIN_RESPONSES;

  // Only needed to make the empty state useful (which campaign(s), if any,
  // are collecting responses for this survey) — fetched independently of
  // the review workflow, same pattern as the conversation page's `search`.
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);

  useEffect(() => {
    if (!notEnoughData) return;
    let cancelled = false;
    fetch(`/api/surveys/${survey.id}/campaigns`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setCampaigns(json.data ?? []); });
    return () => { cancelled = true; };
  }, [survey.id, notEnoughData]);

  const progressPct = Math.min(100, Math.round((survey.response_count / MIN_RESPONSES) * 100));
  const activeCampaigns = campaigns?.filter(c => c.status === "live") ?? [];
  const closedCampaigns = campaigns?.filter(c => c.status !== "live") ?? [];

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onBackdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-900 text-lg truncate">{survey.name} — Intelligence</h2>
              {row && <StatusBadge status={row.status} />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">AI-reviewed survey intelligence report</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4 flex-shrink-0">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {loading && (
            <div className="p-10 text-center">
              <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {notEnoughData && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              {/* Evidence Progress — the primary message */}
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#D7B87A" }}>
                Evidence Progress
              </p>
              <h3 className="text-2xl font-bold text-white mb-1">
                {survey.response_count} of {MIN_RESPONSES} responses collected
              </h3>
              <p className="text-xs text-white/40 mb-5">{progressPct}% of the way to Intelligence</p>

              <div className="max-w-sm mx-auto mb-5">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, background: "#D7B87A" }}
                  />
                </div>
              </div>

              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed">
                Fanometrix is building evidence from every response to this survey. Once it reaches a
                statistically meaningful sample, the Intelligence Engine will turn it into a client-ready
                summary — key findings, notable differences and recommended actions.
              </p>

              {/* Survey Deployments — secondary, supports the primary message rather than competing with it */}
              {campaigns === null ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full animate-spin mx-auto mt-6" />
              ) : campaigns.length === 0 ? (
                <div className="border-t border-white/10 mt-6 pt-5 max-w-sm mx-auto">
                  <p className="text-xs text-white/50 mb-3">
                    This survey isn&apos;t deployed to a campaign yet — evidence can only be gathered
                    once it&apos;s live on publisher inventory.
                  </p>
                  <Link
                    href="/research-projects"
                    className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
                    style={{ background: "#D7B87A", color: "#0B1929" }}
                  >
                    Deploy This Survey →
                  </Link>
                </div>
              ) : (
                <div className="border-t border-white/10 mt-6 pt-4 text-left max-w-sm mx-auto">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2.5">
                    Survey Deployments
                  </p>

                  {activeCampaigns.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {activeCampaigns.map(c => (
                        <Link
                          key={c.id}
                          href={`/campaigns/${c.id}`}
                          className="flex items-center justify-between gap-2 text-xs px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            <span className="text-white/90 truncate">{c.campaign_name}</span>
                          </span>
                          <span className="text-white/50 flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {c.response_count.toLocaleString()}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {closedCampaigns.length > 0 && (
                    <div className="space-y-0.5 mb-2 opacity-50">
                      <p className="text-[10px] text-white/50 uppercase tracking-wide px-2.5 mt-1.5 mb-1">Closed</p>
                      {closedCampaigns.map(c => (
                        <Link
                          key={c.id}
                          href={`/campaigns/${c.id}`}
                          className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <span className="text-white/60 truncate">{c.campaign_name}</span>
                          <span className="text-white/40 flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {c.response_count.toLocaleString()}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 justify-center mt-4">
                    {activeCampaigns.length > 0 ? (
                      <>
                        <Link
                          href={`/campaigns/${activeCampaigns[0].id}`}
                          className="text-sm font-semibold px-4 py-2 rounded-lg text-center"
                          style={{ background: "#D7B87A", color: "#0B1929" }}
                        >
                          View Active Campaign
                        </Link>
                        <Link
                          href="/dashboard"
                          className="text-sm border border-white/20 text-white/80 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors text-center"
                        >
                          Open Dashboard
                        </Link>
                      </>
                    ) : (
                      <Link
                        href="/research-projects"
                        className="text-sm font-semibold px-4 py-2 rounded-lg text-center"
                        style={{ background: "#D7B87A", color: "#0B1929" }}
                      >
                        Deploy Another Campaign →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !notEnoughData && !row && !generating && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#D7B87A" }}>
                Survey Intelligence
              </p>
              <h3 className="text-lg font-bold text-white mb-3">
                Generate client-ready intelligence from {survey.response_count.toLocaleString()} responses
              </h3>
              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
                Fanometrix analyses every response and produces a structured summary: key findings,
                notable differences and recommended actions, written for brands, clubs and agencies.
              </p>
              <button onClick={() => generate(false)}
                className="text-sm font-semibold px-6 py-3 rounded-xl"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                Generate Intelligence →
              </button>
            </div>
          )}

          {generating && (
            <div className="p-10 text-center">
              <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700">Analysing {survey.name} responses…</p>
              <p className="text-xs text-gray-400 mt-1">Using GPT-4o to generate client-ready intelligence</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!generating && row && current && (
            <div className="space-y-4">

              {/* Headline */}
              <div className="rounded-2xl p-6 text-center" style={{ background: "#0B1929" }}>
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#D7B87A" }}>
                  {current.response_count.toLocaleString()} responses · {new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                {editing && draft ? (
                  <input value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xl font-bold text-white text-center placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <h2 className="text-xl font-bold text-white leading-tight">{current.headline}</h2>
                )}
              </div>

              {/* Executive Summary */}
              <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
                {editing && draft ? (
                  <textarea value={draft.executive_summary} rows={3}
                    onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
                )}
              </div>

              {/* Key Findings */}
              <Section title="Key Findings" accent="#D7B87A">
                {editing && draft ? (
                  <ListField items={draft.key_findings} addLabel="finding" onChange={items => setDraft({ ...draft, key_findings: items })} />
                ) : (
                  <div className="space-y-3">
                    {current.key_findings.map((f, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                          style={{ background: "#D7B87A", color: "#0B1929" }}>
                          {i + 1}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{f}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Notable Differences */}
              <Section title="Notable Differences" accent="#5B6CFA">
                {editing && draft ? (
                  <NotableDifferencesField items={draft.notable_differences} onChange={items => setDraft({ ...draft, notable_differences: items })} />
                ) : (
                  <div className="space-y-4">
                    {current.notable_differences.map((nd, i) => (
                      <div key={i} className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
                        <div className="flex gap-1.5 mb-2 flex-wrap">
                          {nd.segments.map(seg => (
                            <span key={seg} className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{seg}</span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{nd.finding}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recommended Actions */}
              <Section title="Recommended Actions" accent="#22C55E">
                {editing && draft ? (
                  <RecommendedActionsField items={draft.recommended_actions} onChange={items => setDraft({ ...draft, recommended_actions: items })} />
                ) : (
                  <div className="space-y-4">
                    {current.recommended_actions.map((a, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 mb-1">{a.action}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{a.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Review trail */}
              {!editing && (row.reviewed_by || row.published_at) && (
                <div className="text-xs text-gray-400 text-center">
                  {row.reviewed_by && row.reviewed_at && (
                    <span>Approved by {row.reviewed_by} on {new Date(row.reviewed_at).toLocaleDateString("en-GB")}</span>
                  )}
                  {row.reviewed_by && row.published_at && <span> · </span>}
                  {row.published_at && <span>Published {new Date(row.published_at).toLocaleDateString("en-GB")}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-wrap flex-shrink-0">
          {!editing ? (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 mr-auto">Close</button>
              {row && (
                <button onClick={startEditing} disabled={busy}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Edit
                </button>
              )}
              {row && row.status !== "published" && (
                <button onClick={approveSummary} disabled={busy || row.status === "approved"}
                  className="text-xs font-semibold border-2 border-green-600 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40">
                  {approving ? "Approving…" : row.status === "approved" ? "Approved ✓" : "Approve"}
                </button>
              )}
              {row && (
                <button onClick={publishSummary} disabled={busy || row.status !== "approved"}
                  title={row.status !== "approved" && row.status !== "published" ? "Approve this summary first" : undefined}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: "#0B1929", color: "#D7B87A" }}>
                  {publishing ? "Publishing…" : row.status === "published" ? "Published ✓" : "Publish"}
                </button>
              )}
              {row && !notEnoughData && (
                <button onClick={() => generate(false)} disabled={busy}
                  className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}>
                  {generating ? "Generating…" : "Regenerate"}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={cancelEditing} disabled={saving}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 mr-auto">
                Cancel
              </button>
              <button onClick={saveEdits} disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Regenerate confirmation */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate summary?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This survey already has a {row?.status} summary. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRegen(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button onClick={() => { setConfirmRegen(false); generate(true); }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: "#0B1929", color: "#D7B87A" }}>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

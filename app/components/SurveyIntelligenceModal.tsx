"use client";

// Phase 1 of the Fanometrix V2 migration: gives Surveys the same
// AI-reviewed intelligence workflow Conversation Search already has,
// via the shared useIntelligenceReview hook. See
// lib/intelligence/analysts/analyseSurvey.ts for the analyst and
// app/api/surveys/[id]/insights/* for the backing routes.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import { normalizeSurveyRow } from "@/lib/intelligence/reportCompat";
import { Section, ListField, TracedRecommendationsField, TaggedFindingsField, FindingReferenceChips, StatusBadge } from "@/app/components/intelligence/ReviewFields";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { NAVY, GOLD, REPORT_TONES } from "@/lib/intelligence/theme";

const APPROVE_PUBLISH_EXPLAINER = (
  <>
    <p>Draft → Approved → Published.</p>
    <p><strong>Approve</strong> signs this report off as accurate and ready, approved reports are what the project&apos;s Executive Report actually draws from.</p>
    <p><strong>Publish</strong> is one further, formal sign-off recorded after approval, for your own audit trail; it doesn&apos;t currently unlock anything Approved doesn&apos;t already provide.</p>
  </>
);

// Must match lib/intelligence/analysts/analyseSurvey.ts's MIN_RESPONSES —
// duplicated here only so the modal can show the pre-check empty state
// before ever calling Generate (the server enforces the real limit).
const MIN_RESPONSES = 50;

type SurveyForModal = { id: string; name: string; response_count: number };

type CampaignSummary = {
  id: string;
  campaign_name: string;
  status: string;
  response_count: number;
};

function NotableDifferencesField({ items, onChange }: {
  items: SurveyIntelligenceReport["notable_differences"];
  onChange: (items: SurveyIntelligenceReport["notable_differences"]) => void;
}) {
  return (
    <TaggedFindingsField
      items={items} tagKey="segments" tagPlaceholder="Segments, e.g. IN, GB"
      addLabel="notable difference" onChange={onChange}
    />
  );
}

type RunStatus = "not_started" | "generating" | "ready" | "failed";

export function SurveyIntelligenceModal({ survey, onClose, isSimulated, runStatus, evidenceRowId, autoGenerate }: { survey: SurveyForModal; onClose: () => void; isSimulated?: boolean; runStatus?: RunStatus; evidenceRowId?: string; autoGenerate?: boolean }) {
  const adapter: IntelligenceReviewAdapter<SurveyIntelligenceReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights`);
      const json = await res.json();
      return json.data ? normalizeSurveyRow(json.data) : null;
    },
    generate: async confirm => {
      // research_project_evidence_id lets the server resolve the exact
      // attached source (which project, is it simulated, is its run
      // ready) — see lib/intelligence/assert-research-ready.ts. Omitted
      // entirely for a real source with no project context, matching
      // existing behaviour there.
      const res  = await fetch(`/api/surveys/${survey.id}/insights`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, research_project_evidence_id: evidenceRowId ?? null }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate intelligence." };
      return { ok: true, data: normalizeSurveyRow(json.data) };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: normalizeSurveyRow(json.data) };
    },
    approve: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: normalizeSurveyRow(json.data) };
    },
    publish: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: normalizeSurveyRow(json.data) };
    },
  }), [survey.id, evidenceRowId]);

  const {
    row, draft, editing, loading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
  } = useIntelligenceReview<SurveyIntelligenceReport>(adapter, [survey.id]);

  const notEnoughData = !row && !loading && survey.response_count < MIN_RESPONSES;
  // Simulated-only, additional to notEnoughData above (never touches real
  // projects, which never have a runStatus at all): the per-source "Run
  // Research" run itself is the completion authority (migration 095), not
  // response_count — a low target can produce "ready" while still under
  // MIN_RESPONSES, correctly still blocked by notEnoughData above; this
  // condition instead catches the run simply never having completed yet.
  const researchNotReady = !row && !loading && isSimulated && !!runStatus && runStatus !== "ready";
  const blocked = notEnoughData || researchNotReady;

  // Skips the "Generate Intelligence" click when the row's own button
  // already said "Generate Intelligence →" (i.e. there's nothing to show
  // yet) — the modal opens straight into the generating state instead of
  // making the user click Generate again.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoGenerate || loading || blocked || row || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, blocked, row]);

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

  // Covers the one-frame gap between mount and the auto-fired generate()
  // call actually flipping `generating` true, so the CTA never flashes.
  const showGenerating = generating || (autoGenerate && !loading && !blocked && !row);

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
              <h2 className="font-bold text-gray-900 text-lg truncate">{survey.name}, Intelligence</h2>
              {row && <StatusBadge status={row.status} />}
              {row && <InfoTooltip text={APPROVE_PUBLISH_EXPLAINER} />}
              {(row?.is_simulated || isSimulated) && <SimulatedBadge />}
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
                summary, key findings, notable differences and recommended actions.
              </p>

              {/* Survey Deployments — secondary, supports the primary
                  progress message above rather than competing with it. */}
              {campaigns === null ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full animate-spin mx-auto mt-6" />
              ) : campaigns.length === 0 ? (
                <div className="border-t border-white/10 mt-6 pt-5 max-w-sm mx-auto">
                  <p className="text-xs text-white/50 mb-3">
                    This survey isn&apos;t deployed to a campaign yet, evidence can only be gathered
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

          {researchNotReady && !notEnoughData && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#D7B87A" }}>
                Simulated Research
              </p>
              <h3 className="text-2xl font-bold text-white mb-1">
                {runStatus === "generating" ? "Research is running…" : runStatus === "failed" ? "Research Failed" : "Research hasn't run yet"}
              </h3>
              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mt-3">
                {runStatus === "generating"
                  ? "This survey's simulated evidence is still being generated, check back in a moment."
                  : "Run Research for this survey in Research Sources before generating Intelligence."}
              </p>
            </div>
          )}

          {!loading && !blocked && !row && !showGenerating && (
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

          {showGenerating && (
            <GeneratingProgress
              label={`Analysing ${survey.name} responses…`}
              sublabel="Reviewing the captured responses to generate client-ready intelligence"
              estimatedSeconds={20}
            />
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

              {/* Sources — computed from the actual response rows, never
                  model-generated, so it stays accurate to the exact data
                  this generation ran against. Optional-chained throughout:
                  reports generated before this field existed simply don't
                  show it, rather than crashing on a missing key. */}
              {current.sources_summary && (
                <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sources</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-600">
                    {current.sources_summary.publishers.length > 0 && (
                      <span><span className="text-gray-400">Publishers </span>{current.sources_summary.publishers.join(", ")}</span>
                    )}
                    {current.sources_summary.countries.length > 0 && (
                      <span><span className="text-gray-400">Countries </span>{current.sources_summary.countries.join(", ")}</span>
                    )}
                    {current.sources_summary.date_range && (
                      <span><span className="text-gray-400">Collected </span>
                        {new Date(current.sources_summary.date_range.from).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {" – "}
                        {new Date(current.sources_summary.date_range.to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Key Findings */}
              <Section title="Key Findings" tone="gold">
                {editing && draft ? (
                  <ListField items={draft.key_findings} addLabel="finding" onChange={items => setDraft({ ...draft, key_findings: items })} />
                ) : (
                  <div className="space-y-3">
                    {current.key_findings.map((f, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                          style={{ background: GOLD, color: NAVY }}>
                          {i + 1}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{f}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Notable Differences */}
              <Section title="Notable Differences" tone="difference">
                {editing && draft ? (
                  <NotableDifferencesField items={draft.notable_differences} onChange={items => setDraft({ ...draft, notable_differences: items })} />
                ) : (
                  <div className="space-y-4">
                    {current.notable_differences.map((nd, i) => (
                      <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${REPORT_TONES.difference.line}`, background: REPORT_TONES.difference.wash }}>
                        <div className="flex gap-1.5 mb-2 flex-wrap">
                          {nd.segments.map(seg => (
                            <span key={seg} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.difference.line, color: REPORT_TONES.difference.ink }}>{seg}</span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{nd.finding}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recommended Actions */}
              <Section title="Recommended Actions" tone="positive">
                {editing && draft ? (
                  <TracedRecommendationsField
                    items={draft.recommended_actions}
                    findingsCount={draft.key_findings.length}
                    onChange={items => setDraft({ ...draft, recommended_actions: items })}
                  />
                ) : (
                  <div className="space-y-4">
                    {current.recommended_actions.map((a, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 mb-1">{a.action}</p>
                            <p className="text-xs text-gray-500 leading-relaxed mb-2">{a.rationale}</p>
                            <FindingReferenceChips indices={a.based_on_findings} />
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

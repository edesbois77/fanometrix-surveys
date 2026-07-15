"use client";

// Survey Intelligence's own page — sibling of ../executive/page.tsx, same
// reasons: a "Back to Workspace" destination rather than a pop-up, one
// canonical place per report type instead of a modal only reachable from
// the Workspace. The review logic itself (adapter + useIntelligenceReview)
// is unchanged from the modal this replaced — only the chrome around it
// moved from a backdrop+box to a full page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import { normalizeSurveyRow } from "@/lib/intelligence/reportCompat";
import { Section, ListField, TracedRecommendationsField, TaggedFindingsField, FindingReferenceChips, StatusBadge } from "@/app/components/intelligence/ReviewFields";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { NAVY, GOLD, PAPER, PAPER_LINE, REPORT_TONES } from "@/lib/intelligence/theme";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { ReportHero } from "@/app/components/intelligence/ReportHero";

const APPROVE_PUBLISH_EXPLAINER = (
  <>
    <p>Draft → Approved → Published.</p>
    <p><strong>Approve</strong> signs this report off as accurate and ready, approved reports are what the project&apos;s Executive Report actually draws from.</p>
    <p><strong>Publish</strong> is one further, formal sign-off recorded after approval, for your own audit trail; it doesn&apos;t currently unlock anything Approved doesn&apos;t already provide.</p>
  </>
);

// Must match lib/intelligence/analysts/analyseSurvey.ts's MIN_RESPONSES —
// duplicated here only so the page can show the pre-check empty state
// before ever calling Generate (the server enforces the real limit).
const MIN_RESPONSES = 50;

type EvidenceRow = {
  id: string;
  evidence_id: string;
  evidence_type: string;
  run_status: "not_started" | "generating" | "ready" | "failed";
  survey: { id: string; name: string; response_count: number; summary_status: "draft" | "edited" | "approved" | "published" | null } | null;
};

type ProjectForPage = {
  project_name: string;
  topic: string | null;
  research_mode: "real" | "simulated";
  evidence: EvidenceRow[];
};

type CampaignSummary = { id: string; campaign_name: string; status: string; response_count: number };

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

export default function SurveyIntelligencePage() {
  const params = useParams();
  const id = params.id as string;
  const evidenceId = params.evidenceId as string;

  const [project, setProject] = useState<ProjectForPage | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) { setProject(json.data); setLoadingProject(false); } });
    return () => { cancelled = true; };
  }, [id]);

  const item = project?.evidence.find(e => e.evidence_type === "survey" && e.evidence_id === evidenceId) ?? null;
  const backHref = `/research-projects/${id}#intelligence`;

  if (loadingProject) {
    return (
      <AdminShell>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </AdminShell>
    );
  }

  if (!project || !item?.survey) {
    return (
      <AdminShell>
        <div className="p-6 max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-400 mb-4">This survey isn&apos;t attached to this project.</p>
          <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-[#D7B87A] hover:underline text-sm">← Back to Workspace</Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <SurveyIntelligenceBody
      survey={item.survey}
      evidenceRowId={item.id}
      runStatus={item.run_status}
      isSimulated={project.research_mode === "simulated"}
      autoGenerate={!item.survey.summary_status}
      backHref={backHref}
    />
  );
}

function SurveyIntelligenceBody({ survey, evidenceRowId, runStatus, isSimulated, autoGenerate, backHref }: {
  survey: { id: string; name: string; response_count: number };
  evidenceRowId: string;
  runStatus: "not_started" | "generating" | "ready" | "failed";
  isSimulated: boolean;
  autoGenerate: boolean;
  backHref: string;
}) {
  const adapter: IntelligenceReviewAdapter<SurveyIntelligenceReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/surveys/${survey.id}/insights`);
      const json = await res.json();
      return json.data ? normalizeSurveyRow(json.data) : null;
    },
    generate: async confirm => {
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

  // Skips the "Generate Intelligence" click when the source's own button
  // already said "Generate Intelligence →" (i.e. there's nothing to show
  // yet) — the page fires generation immediately on arrival instead of
  // making the user click Generate again.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoGenerate || loading || blocked || row || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, blocked, row]);

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

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {isSimulated && <div className="mb-4"><SimulatedBanner /></div>}

        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div className="min-w-0">
            <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-xs text-gray-400 hover:text-gray-600">← Back to Workspace</Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{survey.name}, Intelligence</h1>
              {row && <StatusBadge status={row.status} />}
              {row && <InfoTooltip text={APPROVE_PUBLISH_EXPLAINER} />}
              {(row?.is_simulated || isSimulated) && <SimulatedBadge />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">AI-reviewed survey intelligence report</p>
            {row && <p className="text-xs text-gray-400 mt-0.5">Last updated {formatRelativeTime(row.updated_at)}</p>}
          </div>

          <ReportActionRow
            editing={editing}
            hasRow={!!row}
            status={row?.status}
            busy={busy}
            saving={saving}
            approving={approving}
            publishing={publishing}
            generating={generating}
            showPublish
            showRegenerate={!notEnoughData}
            onEdit={startEditing}
            onApprove={approveSummary}
            onPublish={publishSummary}
            onRegenerate={() => generate(false)}
            onCancel={cancelEditing}
            onSave={saveEdits}
          />
        </div>

        {loading && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {notEnoughData && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
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
                  style={{ width: `${progressPct}%`, background: GOLD }}
                />
              </div>
            </div>

            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed">
              Fanometrix is building evidence from every response to this survey. Once it reaches a
              statistically meaningful sample, the Intelligence Engine will turn it into a client-ready
              summary, key findings, notable differences and recommended actions.
            </p>

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
                  style={{ background: GOLD, color: NAVY }}
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
                        style={{ background: GOLD, color: NAVY }}
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
                      style={{ background: GOLD, color: NAVY }}
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
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
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
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
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
              style={{ background: GOLD, color: NAVY }}>
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
          <div className="space-y-6">

            <ReportHero
              variant="flat"
              kicker={`${current.response_count.toLocaleString()} responses · ${new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
              headline={editing && draft ? draft.headline : current.headline}
              editing={editing && !!draft}
              onHeadlineChange={v => draft && setDraft({ ...draft, headline: v })}
            />

            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={3}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
              )}
            </div>

            {current.sources_summary && (
              <div className="rounded-2xl p-6" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
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
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: NAVY, color: GOLD }}>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

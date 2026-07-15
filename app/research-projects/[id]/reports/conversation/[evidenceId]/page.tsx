"use client";

// Conversation Intelligence's own page — sibling of ../../survey/[evidenceId]
// and ../executive/page.tsx, same reasons: a "Back to Workspace" destination
// rather than a pop-up. The review logic itself (adapter +
// useIntelligenceReview) is unchanged from the modal this replaced — only
// the chrome around it moved from a backdrop+box to a full page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import { normalizeInsightRow } from "@/lib/intelligence/reportCompat";
import { Section, ListField, DualTracedRecommendationsField, TaggedFindingsField, FindingReferenceChips, StatusBadge } from "@/app/components/intelligence/ReviewFields";
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

type EvidenceRow = {
  id: string;
  evidence_id: string;
  evidence_type: string;
  run_status: "not_started" | "generating" | "ready" | "failed";
  conversationSearch: { id: string; name: string; mention_count: number; summary_status: "draft" | "edited" | "approved" | "published" | null } | null;
};

type ProjectForPage = {
  project_name: string;
  topic: string | null;
  research_mode: "real" | "simulated";
  evidence: EvidenceRow[];
};

export default function ConversationIntelligencePage() {
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

  const item = project?.evidence.find(e => e.evidence_type === "social_search" && e.evidence_id === evidenceId) ?? null;
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

  if (!project || !item?.conversationSearch) {
    return (
      <AdminShell>
        <div className="p-6 max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-400 mb-4">This conversation search isn&apos;t attached to this project.</p>
          <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-[#D7B87A] hover:underline text-sm">← Back to Workspace</Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <ConversationIntelligenceBody
      search={item.conversationSearch}
      evidenceRowId={item.id}
      runStatus={item.run_status}
      isSimulated={project.research_mode === "simulated"}
      autoGenerate={!item.conversationSearch.summary_status}
      backHref={backHref}
    />
  );
}

function ConversationIntelligenceBody({ search, evidenceRowId, runStatus, isSimulated, autoGenerate, backHref }: {
  search: { id: string; name: string; mention_count: number };
  evidenceRowId: string;
  runStatus: "not_started" | "generating" | "ready" | "failed";
  isSimulated: boolean;
  autoGenerate: boolean;
  backHref: string;
}) {
  const adapter: IntelligenceReviewAdapter<InsightReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/social/insights?search_id=${search.id}`);
      const json = await res.json();
      return json.data ? normalizeInsightRow(json.data) : null;
    },
    generate: async confirm => {
      const res  = await fetch("/api/social/insights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: search.id, confirm, research_project_evidence_id: evidenceRowId ?? null }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate insights." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    saveEdit: async editedContent => {
      const res  = await fetch("/api/social/insights/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: search.id, edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    approve: async () => {
      const res  = await fetch("/api/social/insights/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: search.id }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    publish: async () => {
      const res  = await fetch("/api/social/insights/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: search.id }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
  }), [search.id, evidenceRowId]);

  const {
    row, draft, editing, loading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
  } = useIntelligenceReview<InsightReport>(adapter, [search.id]);

  const noMentions = !row && !loading && search.mention_count === 0;
  const researchNotReady = !row && !loading && isSimulated && !!runStatus && runStatus !== "ready";
  const blocked = noMentions || researchNotReady;

  // Skips the "Generate Intelligence" click when the source's own button
  // already said "Generate Intelligence →" — the page fires generation
  // immediately on arrival instead of making the user click again.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoGenerate || loading || blocked || row || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, blocked, row]);

  // Covers the one-frame gap between mount and the auto-fired generate()
  // call actually flipping `generating` true, so the CTA never flashes.
  const showGenerating = generating || (autoGenerate && !loading && !blocked && !row);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {isSimulated && <div className="mb-4"><SimulatedBanner /></div>}

        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div className="min-w-0">
            <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-xs text-gray-400 hover:text-gray-600">← Back to Workspace</Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{search.name}</h1>
              {row && <StatusBadge status={row.status} />}
              {row && <InfoTooltip text={APPROVE_PUBLISH_EXPLAINER} />}
              {(row?.is_simulated || isSimulated) && <SimulatedBadge />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">AI-reviewed conversation intelligence report</p>
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
            showRegenerate={!noMentions}
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

        {noMentions && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
              Evidence Progress
            </p>
            <h3 className="text-xl font-bold text-white mb-3">No classified mentions yet</h3>
            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed">
              This Conversation Search hasn&apos;t collected and classified any mentions yet. Once it has, Fanometrix
              will turn them into a client-ready summary, positive drivers, key concerns, market differences and
              recommended actions.
            </p>
          </div>
        )}

        {researchNotReady && !noMentions && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
              Simulated Research
            </p>
            <h3 className="text-xl font-bold text-white mb-3">
              {runStatus === "generating" ? "Research is running…" : runStatus === "failed" ? "Research Failed" : "Research hasn't run yet"}
            </h3>
            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed">
              {runStatus === "generating"
                ? "This search's simulated evidence is still being generated, check back in a moment."
                : "Run Research for this conversation search in Research Sources before generating Intelligence."}
            </p>
          </div>
        )}

        {!loading && !blocked && !row && !showGenerating && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
              Conversation Intelligence
            </p>
            <h3 className="text-lg font-bold text-white mb-3">
              Generate client-ready intelligence from {search.mention_count.toLocaleString()} classified mentions
            </h3>
            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
              Fanometrix analyses every classified mention and produces a structured summary: positive drivers, key
              concerns, market differences and recommended actions, written for brands, clubs and agencies.
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
            label={`Analysing ${search.name} mentions…`}
            sublabel="Reviewing the captured mentions to generate client-ready intelligence"
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
              kicker={`${current.mention_count.toLocaleString()} mentions · ${new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
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
                  {current.sources_summary.platforms.length > 0 && (
                    <span><span className="text-gray-400">Platforms </span>{current.sources_summary.platforms.join(", ")}</span>
                  )}
                  {current.sources_summary.markets.length > 0 && (
                    <span><span className="text-gray-400">Markets </span>{current.sources_summary.markets.join(", ")}</span>
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

            <Section title="Key Positive Drivers" tone="positive">
              {editing && draft ? (
                <ListField items={draft.positive_drivers} addLabel="driver" onChange={items => setDraft({ ...draft, positive_drivers: items })} />
              ) : (
                <div className="space-y-3">
                  {current.positive_drivers.map((d, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{d}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Key Concerns" tone="concern">
              {editing && draft ? (
                <ListField items={draft.key_concerns} addLabel="concern" onChange={items => setDraft({ ...draft, key_concerns: items })} />
              ) : (
                <div className="space-y-3">
                  {current.key_concerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.concern.wash, color: REPORT_TONES.concern.ink }}>
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{c}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Notable Topics" tone="gold">
              {editing && draft ? (
                <ListField items={draft.notable_topics} addLabel="topic" onChange={items => setDraft({ ...draft, notable_topics: items })} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {current.notable_topics.map((t, i) => (
                    <div key={i} className="rounded-xl px-4 py-2.5 text-sm text-gray-800 leading-relaxed max-w-sm" style={{ background: REPORT_TONES.gold.wash, border: `1px solid ${REPORT_TONES.gold.line}` }}>
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Market Intelligence" tone="difference">
              {editing && draft ? (
                <TaggedFindingsField
                  items={draft.market_differences} tagKey="markets" tagPlaceholder="Markets, e.g. IN, GB"
                  addLabel="market difference" onChange={items => setDraft({ ...draft, market_differences: items })}
                />
              ) : (
                <div className="space-y-4">
                  {current.market_differences.map((md, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${REPORT_TONES.difference.line}`, background: REPORT_TONES.difference.wash }}>
                      <div className="flex gap-1.5 mb-2 flex-wrap">
                        {md.markets.map(m => (
                          <span key={m} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.difference.line, color: REPORT_TONES.difference.ink }}>{m}</span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{md.finding}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Recommended Actions" tone="positive">
              {editing && draft ? (
                <DualTracedRecommendationsField
                  items={draft.recommended_actions}
                  positiveDriverCount={draft.positive_drivers.length}
                  keyConcernCount={draft.key_concerns.length}
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
                          <div className="flex flex-wrap gap-1.5">
                            <FindingReferenceChips indices={a.based_on_positive_drivers} label="Driver" />
                            <FindingReferenceChips indices={a.based_on_key_concerns} label="Concern" />
                          </div>
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
              This search already has a {row?.status} summary. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
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

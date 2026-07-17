"use client";

// Analysis homepage — the project's executive Intelligence Overview. It answers
// one question at a glance: "What has Fanometrix discovered?" A visually
// dominant KEY FINDINGS briefing (the cross-source synthesis) sits above a
// subordinate EVIDENCE SOURCES section (Survey / Conversation / Document
// Findings). Every card leads with the findings (the hero), supports them with a
// few quiet metrics, always ends with an action that reflects the current state,
// and carries a quiet status dot — the insight is the hero, status is quiet.
//
// Read-only and approved-only: finding previews come from /findings-preview,
// which only ever reads approved/published stored outputs — nothing is generated
// for this page. Non-approved sources show their real current state instead.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { documentTypeLabel } from "@/lib/library-documents/constants";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { Card, PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, Button, SentimentBar, Icon } from "@/app/components/workspace-ui";
import type { Campaign } from "@/app/components/campaigns/types";

const MIN_RESPONSES = 50;

type Preview = {
  status: string; generatedAt: string | null;
  headline?: string; executiveSummary?: string; evidenceStrength?: string;
  findings: string[];
};
type PreviewData = {
  keyFindings: { generatedAt: string | null; findings: string[] } | null;
  surveys: Record<string, Preview>;
  conversations: Record<string, Preview>;
  documents: Record<string, Preview>;
};

const APPROVED = (s: string | null | undefined) => s === "approved" || s === "published";

function pct(n: number, d: number | null): number | null {
  return d && d > 0 ? Math.min(100, Math.round((n / d) * 100)) : null;
}

type CardAction = { label: string; href?: string; primary?: boolean; disabled?: boolean };
type CardState =
  | { kind: "approved" }
  | { kind: "note"; note: string; dotLabel: string; dotColor: string; action: CardAction };

const note = (dotLabel: string, dotColor: string, noteText: string, action: CardAction): CardState =>
  ({ kind: "note", note: noteText, dotLabel, dotColor, action });

// The shared lifecycle states (generating / failed / edited / draft) — common to
// every source type. Returns null to fall through to a source-specific
// prerequisite or the ready-to-generate default.
function lifecycleState(e: EvidenceItem, summaryStatus: string | null, href: string): CardState | null {
  if (e.run_status === "generating") return note("Generating", "#C79A3E", "Findings are being generated, check back in a moment.", { label: "Generating…", disabled: true });
  if (e.run_status === "failed") return note("Failed", "#B4694C", "Generation failed. Open to review and retry.", { label: "Review Findings →", href, primary: true });
  if (summaryStatus === "edited") return note("Awaiting approval", "#C79A3E", "Findings generated and edited, awaiting approval.", { label: "Review Findings →", href, primary: true });
  if (summaryStatus === "draft") return note("Awaiting review", "#C79A3E", "Findings generated, awaiting review.", { label: "Review Findings →", href, primary: true });
  return null;
}

// The quiet status marker — a small dot + label, with an optional freshness line.
function StatusMarker({ label, color, updatedAt }: { label: string; color: string; updatedAt?: string | null }) {
  return (
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </span>
      {updatedAt && <span className="text-[10px]" style={{ color: "var(--text-disabled)" }}>Updated {formatRelativeTime(updatedAt)}</span>}
    </div>
  );
}

// The hero of every card: the findings themselves.
function Findings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2.5 mt-3">
      {items.map((f, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{f}</p>
        </li>
      ))}
    </ul>
  );
}

function ActionButton({ action }: { action: CardAction }) {
  // A primary "Generate Findings" stays gold but dulls to disabled opacity until
  // the source has enough evidence — so users see it coming and it lights up the
  // moment it's ready. Non-primary disabled actions fall back to a quiet outline.
  if (action.disabled) return <Button disabled variant={action.primary ? "primary" : "secondary"} size="sm">{action.label}</Button>;
  return <Button href={action.href} variant={action.primary ? "primary" : "ghost"} size="sm">{action.label}</Button>;
}

// A single evidence-source card: findings-first when approved, otherwise its real
// current state. No eyebrow (the section heading already names the source type);
// metrics are quiet support; there is always an action on the right.
function SourceCard({ name, state, preview, reviewHref, metrics, extra }: {
  name: string; state: CardState; preview?: Preview; reviewHref: string;
  metrics: React.ReactNode; extra?: React.ReactNode;
}) {
  const approved = state.kind === "approved";
  const action: CardAction = approved ? { label: "Review Findings →", href: reviewHref, primary: true } : state.action;
  return (
    <Card padding="md" className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold truncate min-w-0" style={{ color: "var(--text-primary)" }}>{name}</p>
        {approved
          ? <StatusMarker label={preview?.status === "published" ? "Published" : "Approved"} color="#2F7D55" updatedAt={preview?.generatedAt} />
          : <StatusMarker label={state.dotLabel} color={state.dotColor} />}
      </div>

      {state.kind === "approved" ? (
        preview && (preview.findings.length > 0 || preview.executiveSummary) ? (
          <>
            <Findings items={preview.findings} />
            {preview.findings.length === 0 && preview.executiveSummary && (
              <p className="text-sm leading-relaxed mt-3 line-clamp-3" style={{ color: "var(--text-primary)" }}>{preview.executiveSummary}</p>
            )}
          </>
        ) : (
          <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>Findings approved, open to view them in full.</p>
        )
      ) : (
        <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{state.note}</p>
      )}

      {extra}

      <div className="mt-auto pt-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="text-xs min-w-0" style={{ color: "var(--text-tertiary)" }}>{metrics}</div>
        <ActionButton action={action} />
      </div>
    </Card>
  );
}

// Useful, identifying document metadata — never a bare "Other". Prefers the
// author/publisher, then a real document type, then pages and evidence strength.
function docMetrics(d: NonNullable<EvidenceItem["document"]>, evidenceStrength?: string): string {
  const typeLabel = documentTypeLabel(d.document_type);
  const parts: string[] = [];
  if (d.author) parts.push(d.author);
  else if (typeLabel && typeLabel.toLowerCase() !== "other") parts.push(typeLabel);
  if (d.page_count) parts.push(`${d.page_count} pages`);
  if (evidenceStrength) parts.push(`${evidenceStrength} evidence`);
  return parts.length ? parts.join(" · ") : "Document";
}

export function AnalysisOverview() {
  const { projectId, project, campaigns, loading, error } = useResearchProject();
  const [preview, setPreview] = useState<PreviewData | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/research-projects/${projectId}/findings-preview`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setPreview(j?.data ?? { keyFindings: null, surveys: {}, conversations: {}, documents: {} }); })
      .catch(() => { if (!cancelled) setPreview({ keyFindings: null, surveys: {}, conversations: {}, documents: {} }); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project's analysis."} /></PageContainer>
  );

  const base = `/research-projects/${projectId}/analysis`;
  const surveyEvidence = project.evidence.filter((e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey);
  const conversationEvidence = project.evidence.filter((e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } => e.evidence_type === "social_search" && !!e.conversationSearch);
  const documentEvidence = project.evidence.filter((e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document);
  const totalSources = surveyEvidence.length + conversationEvidence.length + documentEvidence.length;

  const surveyTarget = (e: typeof surveyEvidence[number]) => {
    if (e.survey.target_responses != null) return e.survey.target_responses;
    const sum = (campaigns as Campaign[]).filter(c => c.effective_survey_id === e.evidence_id).reduce((s, c) => s + (c.effective_target_responses ?? c.target_responses ?? 0), 0);
    return sum > 0 ? sum : null;
  };

  const kf = preview?.keyFindings;
  const kfReady = !!kf && kf.findings.length > 0;

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Analysis"
        description="What Fanometrix has discovered, the intelligence generated from every research source, and the evidence behind it."
      />

      {totalSources === 0 ? (
        <Card padding="lg">
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No research sources yet, nothing to analyse.</p>
            <Button href={`/research-projects/${projectId}/research`} variant="secondary" size="sm" className="mt-3">Add sources in Research →</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ── TIER 1 · KEY FINDINGS (the executive briefing) ───────────────── */}
          <div className="rounded-[var(--radius-panel)] overflow-hidden" style={{ border: "1px solid var(--border-default)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ height: 3, background: "var(--accent-gold)" }} />
            <div className="p-5 md:p-6" style={{ background: "var(--surface)" }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--accent-ink)" }}>Key Findings</p>
                  <h2 className="text-lg md:text-xl font-bold mt-1.5 leading-snug" style={{ color: "var(--text-primary)" }}>
                    What the research has discovered across every source
                  </h2>
                  {kfReady && kf?.generatedAt && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-disabled)" }}>Updated {formatRelativeTime(kf.generatedAt)}</p>
                  )}
                </div>
                <Button href={`${base}/key-findings`} variant={kfReady ? "secondary" : "primary"} size="sm">
                  {kfReady ? "Review All Findings →" : "Generate Key Findings →"}
                </Button>
              </div>

              {preview === null ? (
                <p className="text-sm mt-4" style={{ color: "var(--text-tertiary)" }}>Loading intelligence…</p>
              ) : kfReady ? (
                <ul className="space-y-3 mt-4">
                  {kf!.findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background: "var(--accent-gold)", color: "var(--brand-navy)" }}>{i + 1}</span>
                      <p className="text-[15px] md:text-base leading-relaxed" style={{ color: "var(--text-primary)" }}>{f}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm mt-4" style={{ color: "var(--text-secondary)" }}>The cross-source synthesis hasn&apos;t been generated yet. Generate it once your evidence sources have approved findings.</p>
              )}
            </div>
          </div>

          {/* ── TIER 2 · EVIDENCE SOURCES (supporting evidence) ─────────────── */}
          <div>
            <div className="flex items-center gap-2 mt-2 mb-1">
              <Icon.layers size={15} strokeWidth={2} />
              <h2 className="text-sm font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>Evidence Sources</h2>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>The findings from each source that support the intelligence above.</p>

            {/* Survey Findings */}
            {surveyEvidence.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Survey Findings</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {surveyEvidence.map(e => {
                    const p = preview?.surveys[e.evidence_id];
                    const href = `${base}/survey/${e.evidence_id}`;
                    const target = surveyTarget(e);
                    const completion = pct(e.survey.response_count, target);
                    const notEnough = e.survey.response_count < MIN_RESPONSES && !APPROVED(e.survey.summary_status);
                    const state: CardState = APPROVED(e.survey.summary_status)
                      ? { kind: "approved" }
                      : lifecycleState(e, e.survey.summary_status, href)
                        ?? (notEnough
                          ? note("Awaiting responses", "#3B5A8A", `Collecting responses, ${e.survey.response_count}/${MIN_RESPONSES} needed before findings can be generated.`, { label: "Generate Findings →", primary: true, disabled: true })
                          : note("Ready", "#3B5A8A", "Ready to generate findings for this survey.", { label: "Generate Findings →", href, primary: true }));
                    return (
                      <SourceCard key={e.id} name={e.survey.name} state={state} preview={p} reviewHref={href}
                        metrics={<span>{e.survey.response_count.toLocaleString()} responses{target ? ` · ${completion}% of ${target.toLocaleString()} target` : ""}</span>}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversation Findings */}
            {conversationEvidence.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Conversation Findings</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {conversationEvidence.map(e => {
                    const cs = e.conversationSearch;
                    const p = preview?.conversations[e.evidence_id];
                    const href = `${base}/conversation/${e.evidence_id}`;
                    const noMentions = cs.mention_count === 0 && !APPROVED(cs.summary_status);
                    const state: CardState = APPROVED(cs.summary_status)
                      ? { kind: "approved" }
                      : lifecycleState(e, cs.summary_status, href)
                        ?? (noMentions
                          ? note("Awaiting mentions", "#3B5A8A", "No mentions collected yet, run collection in Execution before findings can be generated.", { label: "Generate Findings →", primary: true, disabled: true })
                          : note("Ready", "#3B5A8A", "Ready to generate findings for this search.", { label: "Generate Findings →", href, primary: true }));
                    return (
                      <SourceCard key={e.id} name={cs.name} state={state} preview={p} reviewHref={href}
                        metrics={<span>{cs.mention_count.toLocaleString()} mentions · {Math.round(cs.positive_pct)}% positive · {cs.markets.length} markets · {cs.platforms.length} platforms</span>}
                        extra={cs.mention_count > 0 ? <div className="mt-3"><SentimentBar positive={cs.positive_pct} neutral={cs.neutral_pct} negative={cs.negative_pct} /></div> : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Document Findings */}
            {documentEvidence.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Document Findings</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {documentEvidence.map(e => {
                    const d = e.document;
                    const p = preview?.documents[e.id];
                    const href = `${base}/document/${e.id}`;
                    const notLibraryApproved = d.library_status !== "approved" && !APPROVED(d.summary_status);
                    const state: CardState = APPROVED(d.summary_status)
                      ? { kind: "approved" }
                      : lifecycleState(e, d.summary_status, href)
                        ?? (notLibraryApproved
                          ? note("Awaiting Library approval", "#7A5C86", "This document's Research Library analysis must be approved before project findings can be generated.", { label: "Awaiting Library Approval", disabled: true })
                          : note("Ready", "#7A5C86", "Ready to generate findings for this document.", { label: "Generate Findings →", href, primary: true }));
                    return (
                      <SourceCard key={e.id} name={d.name} state={state} preview={p} reviewHref={href}
                        metrics={<span>{docMetrics(d, p?.evidenceStrength)}</span>}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            Approved findings feed the project&apos;s{" "}
            <Link href={`/research-projects/${projectId}/outputs`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Reports →</Link>
          </p>
        </>
      )}
    </PageContainer>
  );
}

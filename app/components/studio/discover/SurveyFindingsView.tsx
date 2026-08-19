"use client";

// ── Discover → Survey → Findings ─────────────────────────────────────────────
// "What does this research tell me?" — an executive interpretation layer.
//   • STATE 2 (a completed research synthesis exists): What the research says →
//     Key themes → findings grouped by theme. Evidence is present but secondary.
//   • STATE 1 (none yet): the always-on deterministic findings, so Discover is
//     never an empty "generate" page.
// The synthesis is presented simply as the research read — never labelled
// "AI-generated". Numbers are server-owned; every finding traces to validated
// evidence. This component only PRESENTS; it never invokes any model.

import { useState } from "react";
import { Card, StatusBadge, EmptyState, Button, type Tone } from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import type { SurveyFinding, SurveyFindingType, SurveyFindingsContext } from "@/lib/studio/survey-findings-engine";
import type { SurveyAnalysisView, AnalysisFinding } from "@/lib/studio/survey-analysis-service";
import type { CoreFindingsProjection, CoreFindingBasis } from "@/lib/core/studio/projection";
import { composeSurveyResults, type ResultsFinding } from "@/lib/studio/survey-results-compose";

const nf = (n: number) => n.toLocaleString();

const TYPE_TONE: Record<SurveyFindingType, Tone> = {
  dominant: "accent", leading: "accent", divided: "neutral", minority: "warning",
  pattern: "info", market: "info", device: "neutral", completion: "warning",
};

function ContextStrip({ context, answers }: { context: SurveyFindingsContext; answers: number }) {
  if (context === "none") return null;
  const emerging = context === "emerging";
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <StatusBadge label={emerging ? "Emerging findings" : "Final findings"} tone={emerging ? "info" : "neutral"} dot />
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {emerging
          ? `Based on ${nf(answers)} answer${answers === 1 ? "" : "s"} collected so far. Findings may change as more responses are received.`
          : `Based on the completed research dataset (${nf(answers)} answer${answers === 1 ? "" : "s"}).`}
      </p>
    </div>
  );
}

// ── Stage 7 — one coherent survey-intelligence experience ────────────────────
// Product language for analytical basis (never the raw authority enum). A "Measured"
// finding is a governed scale grouping (confident); "Observed" is a plain measured
// fact; "Worth exploring" is a subordinate model-origin reading — visibly NOT equal
// to a measured finding. Every finding discloses its underlying figures on request.
const BASIS_META: Record<CoreFindingBasis, { label: string; tone: Tone }> = {
  governed: { label: "Measured", tone: "accent" },
  observed: { label: "Observed", tone: "neutral" },
  exploratory: { label: "Worth exploring", tone: "info" },
};

// A single finding with progressive disclosure: headline → the numbers behind it.
function KeyFindingCard({ f, big, onViewResults }: { f: ResultsFinding; big?: boolean; onViewResults?: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = BASIS_META[f.basis];
  const hasNumbers = f.evidence.length > 0;
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <StatusBadge label={meta.label} tone={meta.tone} />
        {f.statistic && <span className="text-base font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{f.statistic}</span>}
      </div>
      <p className={big ? "text-lg font-semibold leading-snug" : "text-[15px] font-semibold leading-snug"} style={{ color: "var(--text-primary)" }}>{f.title}</p>
      {f.question && <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>From: {f.question}</p>}
      {f.caveat && <p className="text-[11px] mt-1.5" style={{ color: "#8A6A2F" }}>{f.caveat}</p>}
      {hasNumbers && (
        <div className="mt-2.5">
          <button
            type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}
          >
            {open ? "Hide the numbers" : "Show the numbers"}
            <span aria-hidden style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><StudioIcon.arrowRight size={12} /></span>
          </button>
          {open && (
            <div className="mt-2.5 space-y-1.5">
              {f.evidence.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>{e.option ?? "—"}</span>
                  <span className="h-1.5 rounded-full" style={{ width: `${Math.max(2, Math.min(100, e.percentage ?? 0)) * 0.9}px`, background: "var(--accent-gold)", opacity: 0.55 }} aria-hidden />
                  <span className="text-[11px] fx-tabular-nums w-10 text-right" style={{ color: "var(--text-tertiary)" }}>{e.percentage != null ? `${e.percentage}%` : "—"}</span>
                </div>
              ))}
              <p className="text-[11px] fx-tabular-nums pt-0.5" style={{ color: "var(--text-tertiary)" }}>
                n={nf(f.evidence[0]?.base ?? 0)}
                {onViewResults && <> · <button type="button" onClick={onViewResults} className="font-semibold" style={{ color: "var(--accent-ink)" }}>View in Results</button></>}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function IntelligenceView({ vm, context, answers, canGenerate, analyseBusy, onAnalyse, onViewResults }: {
  vm: Extract<ReturnType<typeof composeSurveyResults>, { mode: "intelligence" }>;
  context: SurveyFindingsContext; answers: number;
  canGenerate?: boolean; analyseBusy?: boolean; onAnalyse?: () => void; onViewResults?: () => void;
}) {
  return (
    <div className="space-y-7">
      <ContextStrip context={context} answers={answers} />
      {canGenerate && <AnalyseOpportunity busy={analyseBusy} onAnalyse={onAnalyse} />}

      {/* A — What should I know? The strongest findings lead. */}
      {vm.keyFindings.length > 0 ? (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--text-tertiary)" }}>What stands out</p>
          <div className="space-y-3">{vm.keyFindings.map((f) => <KeyFindingCard key={f.id} f={f} big onViewResults={onViewResults} />)}</div>
        </section>
      ) : (
        <div className="rounded-[var(--radius-panel)] border p-5" style={{ borderColor: "var(--border-default)", background: "var(--surface-sunken)" }}>
          <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{vm.emptyMessage}</p>
        </div>
      )}

      {/* C — What might this mean? Subordinate interpretive summary (never a headline). */}
      {vm.interpretation && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>What this might mean</p>
          <div className="rounded-[var(--radius-panel)] border p-4 md:p-5" style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{vm.interpretation}</p>
            <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>An interpretation of the findings above — the measured figures remain the primary read.</p>
          </div>
        </section>
      )}

      {/* D — What else is interesting? Subordinate observations. */}
      {vm.worthNoting.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--text-tertiary)" }}>Also worth noting</p>
          <div className="space-y-3">{vm.worthNoting.map((f) => <KeyFindingCard key={f.id} f={f} onViewResults={onViewResults} />)}</div>
        </section>
      )}

      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Every figure is drawn from this survey&rsquo;s collected answers; open Results to see the full distributions.</p>
    </div>
  );
}

// ── STATE 2 — research synthesis ─────────────────────────────────────────────
function AnalysisFindingCard({ f, onViewResults }: { f: AnalysisFinding; onViewResults?: () => void }) {
  return (
    <Card padding="md">
      <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{f.headline}</p>
      {f.explanation && <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.explanation}</p>}
      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
        {f.supportingQuestions.length > 0 && (
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Supported by {f.supportingQuestions.length === 1 ? "1 question" : `${f.supportingQuestions.length} questions`}
            {f.base != null ? ` · n=${nf(f.base)}` : ""}
          </span>
        )}
        {onViewResults && (
          <button type="button" onClick={onViewResults} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
            View in Results <StudioIcon.arrowRight size={12} />
          </button>
        )}
      </div>
    </Card>
  );
}

function SynthesisView({ analysis, context, answers, onViewResults }: {
  analysis: SurveyAnalysisView; context: SurveyFindingsContext; answers: number; onViewResults?: () => void;
}) {
  const byId = new Map(analysis.findings.map((f) => [f.id, f]));
  const grouped = new Set<string>();
  const themes = analysis.themes.map((t) => {
    const findings = t.proposalIds.map((id) => byId.get(id)).filter((f): f is AnalysisFinding => !!f);
    findings.forEach((f) => grouped.add(f.id));
    return { title: t.title, interpretation: t.interpretation, findings };
  }).filter((t) => t.findings.length > 0);
  const ungrouped = analysis.findings.filter((f) => !grouped.has(f.id));

  return (
    <div className="space-y-6">
      <ContextStrip context={context} answers={answers} />

      {analysis.narrative && (
        <div className="rounded-[var(--radius-panel)] border p-5 md:p-6" style={{ borderColor: "var(--accent-gold)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "var(--text-tertiary)" }}>What the research says</p>
          <p className="text-lg font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{analysis.narrative.headline}</p>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{analysis.narrative.summary}</p>
        </div>
      )}

      {themes.length > 0 && (
        <div className="space-y-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Key themes</p>
          {themes.map((t, i) => (
            <div key={i}>
              <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{i + 1}. {t.title}</h3>
              {t.interpretation && <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t.interpretation}</p>}
              <div className="space-y-3 mt-3">
                {t.findings.map((f) => <AnalysisFindingCard key={f.id} f={f} onViewResults={onViewResults} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {ungrouped.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--text-tertiary)" }}>{themes.length > 0 ? "Further findings" : "Findings"}</p>
          <div className="space-y-3">{ungrouped.map((f) => <AnalysisFindingCard key={f.id} f={f} onViewResults={onViewResults} />)}</div>
        </div>
      )}

      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Every finding is drawn from this survey&rsquo;s collected answers; open Results to see the underlying distributions.</p>
    </div>
  );
}

// ── STATE 1 — deterministic findings (always-on baseline) ────────────────────
function DeterministicFindingCard({ f, big, onViewResults }: { f: SurveyFinding; big?: boolean; onViewResults?: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <StatusBadge label={f.tag} tone={TYPE_TONE[f.type]} />
      </div>
      <p className={big ? "text-lg font-semibold leading-snug" : "text-[15px] font-semibold leading-snug"} style={{ color: "var(--text-primary)" }}>{f.title}</p>
      {f.detail && <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.detail}</p>}
      <p className="text-[11px] mt-2 fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
        {[`n=${nf(f.base)}`, f.metrics.option && f.metrics.pct != null ? `${f.metrics.option} ${f.metrics.pct}%` : null].filter(Boolean).join(" · ")}
        {f.confidence === "low" && <span className="ml-2" style={{ color: "#8A6A2F" }}>· modest base, read with care</span>}
      </p>
      {onViewResults && (
        <button type="button" onClick={onViewResults} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
          View in Results <StudioIcon.arrowRight size={12} />
        </button>
      )}
    </div>
  );
}

// A restrained opportunity to generate the richer analysis — shown ONLY when the
// caller is authorised (canManageSurvey) AND the survey is analysis-eligible AND no
// completed analysis exists. Clicking runs the GOVERNED generation endpoint (which
// re-authorises server-side); the page never invokes the model on render.
function AnalyseOpportunity({ busy, onAnalyse }: { busy?: boolean; onAnalyse?: () => void }) {
  return (
    <Card tone="info" padding="md">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>More detailed analysis is available for this survey.</p>
        <Button variant="secondary" size="sm" onClick={onAnalyse} disabled={busy}>{busy ? "Analysing…" : "Analyse survey"}</Button>
      </div>
    </Card>
  );
}

function DeterministicView({ findings, context, answers, mode, canGenerate, analyseBusy, onAnalyse, onViewResults }: {
  findings: SurveyFinding[]; context: SurveyFindingsContext; answers: number;
  mode: "studio_native" | "historical_completed_only";
  canGenerate?: boolean; analyseBusy?: boolean; onAnalyse?: () => void; onViewResults?: () => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="space-y-4">
        <ContextStrip context={context} answers={answers} />
        {canGenerate && <AnalyseOpportunity busy={analyseBusy} onAnalyse={onAnalyse} />}
        <EmptyState
          icon={<StudioIcon.discover size={22} />}
          title="Findings will appear once enough responses have been collected"
          description={context === "none"
            ? "This survey hasn't collected enough answers yet for a dependable read. Check Performance for collection progress."
            : "There isn't a dependable finding to surface at the current base. The full answer distributions are in Results."}
        />
      </div>
    );
  }
  const [primary, ...rest] = findings;
  return (
    <div className="space-y-5">
      <ContextStrip context={context} answers={answers} />
      {canGenerate && <AnalyseOpportunity busy={analyseBusy} onAnalyse={onAnalyse} />}
      <div className="rounded-[var(--radius-panel)] border p-5 md:p-6" style={{ borderColor: "var(--accent-gold)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "var(--text-tertiary)" }}>What the research says</p>
        <DeterministicFindingCard f={primary} big onViewResults={onViewResults} />
      </div>
      {rest.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--text-tertiary)" }}>Findings</p>
          <div className="space-y-3">{rest.map((f) => <Card key={f.id} padding="md"><DeterministicFindingCard f={f} onViewResults={onViewResults} /></Card>)}</div>
        </div>
      )}
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {mode === "historical_completed_only"
          ? "Based on completed-response answers (this survey pre-dates per-answer capture, so only its first questions are analysed)."
          : "Based on collected answer values. Every finding links to its distribution in Results."}
      </p>
    </div>
  );
}

export function SurveyFindingsView({
  findings, context, answers, mode, analysis, coreIntelligence, canGenerate, analyseBusy, onAnalyse, onViewResults,
}: {
  findings: SurveyFinding[];
  context: SurveyFindingsContext;
  answers: number;
  mode: "studio_native" | "historical_completed_only";
  analysis?: SurveyAnalysisView | null;
  /** Stage 6/7 (controlled read): Core-derived findings. When present (flag on), the
   *  view composes ONE coherent intelligence experience; when absent it falls back to
   *  the unchanged legacy analysis/findings — so the flag rolls back cleanly. */
  coreIntelligence?: CoreFindingsProjection | null;
  /** Authorised (canManageSurvey) + eligible + no completed analysis → show the CTA. */
  canGenerate?: boolean;
  analyseBusy?: boolean;
  onAnalyse?: () => void;
  onViewResults?: () => void;
}) {
  // Stage 7: compose the three analytical layers into ONE story. With Core intelligence
  // present the composed "intelligence" experience leads (Core owns findings; the AI
  // narrative becomes a subordinate summary; redundant cards are gone). Without it, the
  // model is "legacy" and we render the EXISTING experience byte-for-byte unchanged.
  const vm = composeSurveyResults({ core: coreIntelligence, analysis });
  if (vm.mode === "intelligence") {
    return <IntelligenceView vm={vm} context={context} answers={answers} canGenerate={canGenerate} analyseBusy={analyseBusy} onAnalyse={onAnalyse} onViewResults={onViewResults} />;
  }

  // ── Legacy experience (flag off / no Core / Core failure) — UNCHANGED ─────────
  // STATE 2 — a completed synthesis with at least a narrative or a finding.
  if (analysis && (analysis.narrative || analysis.findings.length > 0)) {
    return <SynthesisView analysis={analysis} context={context} answers={answers} onViewResults={onViewResults} />;
  }
  // NO STRONG CONCLUSIONS — a run COMPLETED but found nothing worth a confident
  // conclusion. Say so plainly; the deterministic results remain the honest read.
  const noStrong = analysis?.noStrongConclusions === true;
  return (
    <>
      {noStrong && (
        <p className="text-sm mb-4 px-3 py-2 rounded-[var(--radius-panel)]" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
          We analysed this survey and found no strong overarching conclusion yet. The results below tell the story.
        </p>
      )}
      <DeterministicView findings={findings} context={context} answers={answers} mode={mode} canGenerate={canGenerate} analyseBusy={analyseBusy} onAnalyse={onAnalyse} onViewResults={onViewResults} />
    </>
  );
}

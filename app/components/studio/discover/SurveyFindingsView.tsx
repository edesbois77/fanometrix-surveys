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

import { Card, StatusBadge, EmptyState, Button, type Tone } from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import type { SurveyFinding, SurveyFindingType, SurveyFindingsContext } from "@/lib/studio/survey-findings-engine";
import type { SurveyAnalysisView, AnalysisFinding } from "@/lib/studio/survey-analysis-service";

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
  findings, context, answers, mode, analysis, canGenerate, analyseBusy, onAnalyse, onViewResults,
}: {
  findings: SurveyFinding[];
  context: SurveyFindingsContext;
  answers: number;
  mode: "studio_native" | "historical_completed_only";
  analysis?: SurveyAnalysisView | null;
  /** Authorised (canManageSurvey) + eligible + no completed analysis → show the CTA. */
  canGenerate?: boolean;
  analyseBusy?: boolean;
  onAnalyse?: () => void;
  onViewResults?: () => void;
}) {
  // STATE 2 — a completed synthesis with at least a narrative or a finding.
  if (analysis && (analysis.narrative || analysis.findings.length > 0)) {
    return <SynthesisView analysis={analysis} context={context} answers={answers} onViewResults={onViewResults} />;
  }
  // NO STRONG CONCLUSIONS — a run COMPLETED but found nothing worth a confident
  // conclusion. Say so plainly (never a manufactured finding); the deterministic
  // results below remain the honest read.
  const noStrong = analysis?.noStrongConclusions === true;
  // STATE 1 / STATE 3 — deterministic baseline (also the fallback when the latest
  // run failed and there is no previously valid analysis). The Analyse opportunity
  // appears only for an authorised, eligible survey with no analysis yet.
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

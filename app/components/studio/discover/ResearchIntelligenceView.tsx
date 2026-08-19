"use client";

// ── Discover → Survey → Findings: Research Intelligence (gated) ──────────────
// Renders the VERIFIED, model-produced research story for a survey when a displayable
// artefact exists. Every material claim shown here has already passed the deterministic
// verifier server-side (fabricated numbers/refs and unsupported overreach are removed
// before this component ever sees them). This component only PRESENTS; it invokes no
// model and does no arithmetic. It keeps the authority distinction visible — measured
// fact vs synthesis vs interpretation vs hypothesis — so interpretation is never dressed
// up as measured truth. When no artefact is present the caller renders the existing
// deterministic Findings experience instead (safe fallback).
import { useState } from "react";
import { Card, StatusBadge, type Tone } from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import type { ProductIntelligence, ProductInsight, EvidenceLine, AuthorityTier } from "@/lib/studio/reasoning/product";
import type { SurveyFindingsContext } from "@/lib/studio/survey-findings-engine";

const nf = (n: number) => n.toLocaleString();

// Authority is shown explicitly and de-jargonised. "Measured" = read straight off the
// governed evidence; "Synthesis" = a relationship across measured facts; "Interpretation"
// = a plausible meaning; "Worth considering" = a hypothesis the survey does not prove.
const AUTHORITY_META: Record<AuthorityTier, { label: string; tone: Tone }> = {
  measured: { label: "Measured", tone: "accent" },
  synthesis: { label: "Synthesis", tone: "info" },
  interpretation: { label: "Interpretation", tone: "neutral" },
  hypothesis: { label: "Worth considering", tone: "warning" },
};

function EvidenceRows({ lines }: { lines: EvidenceLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {lines.map((e, i) => (
        <div key={i} className="flex items-baseline gap-2 flex-wrap">
          {e.percentage != null && <span className="text-[11px] font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{e.percentage}%</span>}
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{e.label}</span>
          {e.question && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>· {e.question}{e.base != null ? ` (n=${nf(e.base)})` : ""}</span>}
        </div>
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: ProductInsight }) {
  const [open, setOpen] = useState(false);
  const meta = AUTHORITY_META[insight.authority];
  const hasEvidence = insight.evidence.length > 0 || insight.counterEvidence.length > 0;
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <StatusBadge label={meta.label} tone={meta.tone} />
        {insight.confidence && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{insight.confidence} confidence</span>}
      </div>
      <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{insight.takeaway}</p>
      {insight.explanation && <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{insight.explanation}</p>}
      {insight.whyItMatters && <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--text-tertiary)" }}>Why it matters: </span>{insight.whyItMatters}</p>}
      {insight.caveat && <p className="text-[11px] mt-1.5" style={{ color: "#8A6A2F" }}>{insight.caveat}</p>}
      {hasEvidence && (
        <div className="mt-2.5">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
            {open ? "Hide the evidence" : "Show the evidence"}
            <span aria-hidden style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><StudioIcon.arrowRight size={12} /></span>
          </button>
          {open && (
            <div className="mt-1">
              <EvidenceRows lines={insight.evidence} />
              {insight.counterEvidence.length > 0 && (
                <>
                  <p className="text-[11px] mt-2.5 font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Counter-evidence</p>
                  <EvidenceRows lines={insight.counterEvidence} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2.5" style={{ color: "var(--text-tertiary)" }}>{title}</p>
      {children}
    </section>
  );
}

export function ResearchIntelligenceView({ intel, context, answers, respondents }: {
  intel: ProductIntelligence; context: SurveyFindingsContext; answers: number; respondents?: number;
}) {
  const [showLimits, setShowLimits] = useState(false);
  const r = respondents ?? answers;
  const scope = `${nf(r)} respondent${r === 1 ? "" : "s"}${answers > r ? ` (${nf(answers)} answers across the questions)` : ""}`;
  const limits = [...intel.cannotConclude, ...intel.openQuestions];
  return (
    <div className="space-y-7">
      <div className="flex items-center gap-2.5 flex-wrap">
        <StatusBadge label={context === "emerging" ? "Emerging" : "Research read"} tone={context === "emerging" ? "info" : "neutral"} dot />
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Based on {scope}. Interpretation is checked against this survey&rsquo;s evidence; the figures remain the measured record.</p>
      </div>

      {/* The story */}
      {intel.story && (
        <div className="rounded-[var(--radius-panel)] border p-5 md:p-6" style={{ borderColor: "var(--accent-gold)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "var(--text-tertiary)" }}>What the research says</p>
          <p className="text-lg font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{intel.story.headline}</p>
          {intel.story.summary && <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{intel.story.summary}</p>}
        </div>
      )}

      {/* Key insights (synthesis + interpretation) */}
      {intel.keyInsights.length > 0 && (
        <Section title="Key insights"><div className="space-y-3">{intel.keyInsights.map((i) => <InsightCard key={i.id} insight={i} />)}</div></Section>
      )}

      {/* Tensions */}
      {intel.tensions.length > 0 && (
        <Section title="Tensions in the data">
          <div className="space-y-2">
            {intel.tensions.map((t, i) => (
              <div key={i} className="rounded-[var(--radius-panel)] border p-3.5" style={{ borderColor: "var(--border-default)", background: "var(--surface-sunken)" }}>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t.statement}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* What to consider (implications / hypotheses) */}
      {intel.toConsider.length > 0 && (
        <Section title="What to consider"><div className="space-y-3">{intel.toConsider.map((i) => <InsightCard key={i.id} insight={i} />)}</div></Section>
      )}

      {/* What this survey cannot tell us — progressive disclosure */}
      {limits.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowLimits((v) => !v)} aria-expanded={showLimits}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>
            What this survey cannot tell us
            <span aria-hidden style={{ transform: showLimits ? "rotate(90deg)" : "none", transition: "transform .15s" }}><StudioIcon.arrowRight size={11} /></span>
          </button>
          {showLimits && (
            <ul className="mt-2 space-y-1.5">
              {limits.map((l, i) => <li key={i} className="text-[13px] leading-relaxed pl-3 border-l-2" style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>{l}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>AI-assisted research interpretation, checked against this survey&rsquo;s governed evidence. Interpretations and hypotheses are labelled as such and are not measured facts. Open Results for the full distributions.</p>
    </div>
  );
}

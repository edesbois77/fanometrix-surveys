"use client";

// The Overview's closing beats (docs/overview-page.md §B.4–§B.6):
//   • Confidence in our current understanding
//   • What we still need to learn (the frontier)
//   • Fanometrix's Recommendation — the professional judgment, with an adaptive
//     CTA that IS the recommendation.
// Presentational — the parent (OverviewIntelligence) fetches the knowledge
// position and passes it in. Slice 3 of the Overview redesign.
import { Card, SectionHeading, StatusBadge, Button, Icon, Eyebrow } from "@/app/components/workspace-ui";
import {
  type KnowledgePosition,
  OUTCOME_LABEL, OUTCOME_TONE, CONFIDENCE_TONE, CONFIDENCE_LABEL, outcomeAction,
} from "@/lib/knowledge-position";

// Recommendation hero palette by outcome.
const REC_TONE: Record<"success" | "accent" | "info" | "warning", { rail: string; ink: string; wash: string; line: string }> = {
  success: { rail: "#5C8560", ink: "#3F5D42", wash: "#EEF3EC", line: "#D3E0D0" },
  accent:  { rail: "#C7A75E", ink: "#8A6D2F", wash: "#FBF3E1", line: "#ECDCB8" },
  info:    { rail: "#5B7FA6", ink: "#3B5A8A", wash: "#EEF3FB", line: "#D6E2F1" },
  warning: { rail: "#C29A4C", ink: "#8A6A2F", wash: "#FBF3E1", line: "#ECDCB8" },
};

export function OverviewRecommendation({ kp, loading, projectId, onRefine }: {
  kp?: KnowledgePosition | null; loading: boolean; projectId: string; onRefine: () => void;
}) {
  if (loading) {
    return (
      <section className="scroll-mt-6">
        <Card>
          <div className="flex items-center gap-3 py-4">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md" style={{ background: "#F2E6C8", color: "#8A6D2F" }}><Icon.target size={15} /></span>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Weighing what we know against what the decision needs…</p>
          </div>
        </Card>
      </section>
    );
  }
  if (!kp) return null;

  const { confidence, frontier, recommendation } = kp;
  const tone = OUTCOME_TONE[recommendation.outcome];
  const c = REC_TONE[tone];
  const action = outcomeAction(recommendation.outcome);
  const href = action.kind === "decide" ? `/research-projects/${projectId}/conclusion`
    : action.kind === "design" ? `/research-projects/${projectId}/research`
    : undefined;

  return (
    <section className="scroll-mt-6 space-y-6">
      {/* Confidence in current understanding */}
      <div>
        <span className="block w-10 h-0.5 rounded-full mb-5" style={{ background: "var(--accent-gold)" }} aria-hidden />
        <div className="flex items-center gap-2">
          <Eyebrow tone="accent">Confidence in our current understanding</Eyebrow>
          <StatusBadge label={`${CONFIDENCE_LABEL[confidence.overall]} overall`} tone={CONFIDENCE_TONE[confidence.overall]} size="sm" />
        </div>
        {confidence.summary && <p className="mt-3 text-[15px] leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>{confidence.summary}</p>}
        {confidence.dimensions.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
            {confidence.dimensions.map((d, i) => (
              <div key={i} className="p-3 border" style={{ borderRadius: "var(--radius-tile)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{d.dimension}</span>
                  <StatusBadge label={CONFIDENCE_LABEL[d.level]} tone={CONFIDENCE_TONE[d.level]} size="sm" />
                </div>
                {d.basis && <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{d.basis}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* What we still need to learn */}
      {frontier.length > 0 && (
        <div>
          <Eyebrow>What we still need to learn</Eyebrow>
          <div className="mt-3 space-y-1.5 max-w-2xl">
            {frontier.map((f, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />
                <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.question}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fanometrix's Recommendation — the professional judgment + adaptive CTA */}
      <div className="border p-5 md:p-6" style={{ borderRadius: "var(--radius-panel)", background: c.wash, borderColor: c.line, borderLeft: `3px solid ${c.rail}`, boxShadow: "var(--shadow-sm)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: c.ink }}>Fanometrix&apos;s recommendation</span>
          <StatusBadge label={OUTCOME_LABEL[recommendation.outcome]} tone={tone} size="sm" />
        </div>
        {recommendation.headline && <h3 className="text-lg md:text-xl font-bold tracking-[-0.015em] leading-snug mt-2.5" style={{ color: "var(--text-primary)" }}>{recommendation.headline}</h3>}
        {recommendation.rationale && <p className="text-sm md:text-[15px] leading-relaxed mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{recommendation.rationale}</p>}
        <div className="mt-5">
          {action.kind === "refine"
            ? <Button variant="primary" onClick={onRefine}>{action.label}</Button>
            : <Button variant="primary" href={href}>{action.label} →</Button>}
        </div>
      </div>
    </section>
  );
}

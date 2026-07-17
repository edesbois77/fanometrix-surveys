"use client";

// ── Insight, recommendation & theme components ───────────────────────────────
// The synthesis tier — what the research MEANS, not what it collected. These
// read top-down: the claim first, then its confidence and the evidence beneath
// it. Colour marks the character of a finding (positive / concern / opportunity)
// and never decorates.

import { Icon } from "./icons";
import { ConfidenceIndicator, type ConfidenceLevel } from "./Badges";
import { SENTIMENT } from "./tokens";

// ── InsightPanel (primary component) ─────────────────────────────────────────
// The workspace's headline unit: one synthesized insight, its confidence, the
// evidence that backs it, and — optionally — the metrics that quantify it. The
// tone rail on the left gives an analyst the character of the finding before
// they read a word.
type InsightTone = "positive" | "concern" | "opportunity" | "neutral";

const INSIGHT_TONE: Record<InsightTone, { rail: string; ink: string; label: string; wash: string }> = {
  positive:    { rail: "#5C8560", ink: "#3F5D42", label: "Positive signal",  wash: "#EEF3EC" },
  concern:     { rail: "#B4694C", ink: "#8A4B33", label: "Concern",          wash: "#F7ECE6" },
  opportunity: { rail: "#C7A75E", ink: "#8A6D2F", label: "Opportunity",      wash: "#FBF3E1" },
  neutral:     { rail: "#48586B", ink: "#48586B", label: "Finding",          wash: "#EEF1F4" },
};

export function InsightPanel({
  eyebrow, title, summary, tone = "neutral", confidence, evidence, metrics, actions, footer,
}: {
  /** Small kicker, e.g. "Key finding 01". Defaults to the tone label. */
  eyebrow?: string;
  /** The insight statement — the headline. */
  title: React.ReactNode;
  /** The rationale narrative beneath the claim. */
  summary?: React.ReactNode;
  tone?: InsightTone;
  confidence?: { level: ConfidenceLevel; basis?: string };
  /** Evidence backing this insight; the button opens an EvidenceDrawer. */
  evidence?: { count: number; label?: string; onView?: () => void };
  /** Supporting quantified callouts. */
  metrics?: { label: string; value: React.ReactNode; caption?: React.ReactNode }[];
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = INSIGHT_TONE[tone];
  return (
    <div
      className="border overflow-hidden"
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)", borderLeft: `3px solid ${t.rail}` }}
    >
      <div className="p-5 md:p-6">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.rail }} aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.ink }}>{eyebrow ?? t.label}</span>
        </div>

        <h3 className="text-lg md:text-xl font-bold tracking-[-0.015em] leading-snug mt-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>

        {summary && (
          <p className="text-sm md:text-[15px] leading-relaxed mt-2.5 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{summary}</p>
        )}

        {metrics && metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            {metrics.map((m, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: "var(--surface-sunken)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{m.label}</p>
                <p className="fx-tabular-nums text-xl font-bold mt-0.5 tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{m.value}</p>
                {m.caption && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{m.caption}</p>}
              </div>
            ))}
          </div>
        )}

        {(confidence || evidence || actions) && (
          <div className="flex items-center justify-between gap-3 flex-wrap mt-5 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-4 flex-wrap">
              {confidence && <ConfidenceIndicator level={confidence.level} basis={confidence.basis} />}
              {evidence && (
                <button
                  onClick={evidence.onView}
                  disabled={!evidence.onView}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:cursor-default"
                  style={{ color: evidence.onView ? "var(--accent-ink)" : "var(--text-tertiary)" }}
                >
                  <Icon.layers size={14} />
                  {evidence.count} {evidence.label ?? (evidence.count === 1 ? "source" : "sources")}
                  {evidence.onView && <Icon.chevronRight size={13} />}
                </button>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
      </div>
      {footer && (
        <div className="px-5 md:px-6 py-3 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>{footer}</div>
      )}
    </div>
  );
}

// ── AIRecommendation ─────────────────────────────────────────────────────────
// A machine-generated next step, clearly marked as such. The sparkle + "AI
// recommendation" label sets expectations (this is a suggestion, backed by a
// stated rationale and confidence) so it's never mistaken for a system fact.
export function AIRecommendation({
  title, rationale, confidence, basis, action, onDismiss, label = "AI recommendation",
}: {
  title: React.ReactNode;
  rationale: React.ReactNode;
  confidence?: ConfidenceLevel;
  basis?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  label?: string;
}) {
  return (
    <div
      className="border p-5 relative overflow-hidden"
      style={{
        borderRadius: "var(--radius-panel)",
        borderColor: "#E7DCC2",
        background: "linear-gradient(135deg, #FCF8EF 0%, #FFFFFF 60%)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md" style={{ background: "#F2E6C8", color: "#8A6D2F" }} aria-hidden>
            <Icon.sparkles size={14} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#8A6D2F" }}>{label}</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="-m-1.5 p-1.5 rounded-lg transition-colors hover:bg-black/5" style={{ color: "var(--text-tertiary)" }} aria-label="Dismiss">
            <Icon.close size={16} />
          </button>
        )}
      </div>

      <h3 className="text-base font-bold mt-3 tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{title}</h3>
      <p className="text-sm leading-relaxed mt-1.5" style={{ color: "var(--text-secondary)" }}>{rationale}</p>

      {(confidence || action) && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
          {confidence ? <ConfidenceIndicator level={confidence} basis={basis} /> : <span />}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
    </div>
  );
}

// ── ThemeCard ────────────────────────────────────────────────────────────────
// A theme surfaced from analysis — a cluster of related evidence. Shows how
// prevalent it is (share of the corpus) and its sentiment split, so an analyst
// can triage which themes matter before opening them.
export function ThemeCard({
  name, description, prevalence, sentiment, mentions, onOpen,
}: {
  name: React.ReactNode;
  description?: React.ReactNode;
  /** Share of the corpus this theme represents, 0–100. */
  prevalence?: number;
  /** Sentiment split as three parts that sum to ~100. */
  sentiment?: { positive: number; neutral: number; negative: number };
  /** Underlying evidence count. */
  mentions?: number;
  onOpen?: () => void;
}) {
  return (
    <div
      className={`border p-4 md:p-5 ${onOpen ? "cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]" : ""}`}
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{name}</h3>
        {typeof mentions === "number" && (
          <span className="fx-tabular-nums text-xs font-semibold flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
            {mentions.toLocaleString()} {mentions === 1 ? "mention" : "mentions"}
          </span>
        )}
      </div>
      {description && <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{description}</p>}

      {typeof prevalence === "number" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Prevalence</span>
            <span className="fx-tabular-nums text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>{Math.round(prevalence)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, prevalence)}%`, background: "#48586B" }} />
          </div>
        </div>
      )}

      {sentiment && <SentimentBar {...sentiment} className="mt-4" />}
    </div>
  );
}

// A compact three-part sentiment split bar, reused by ThemeCard and anywhere a
// positive/neutral/negative breakdown is shown.
export function SentimentBar({
  positive, neutral, negative, className = "", showLegend = true,
}: {
  positive: number; neutral: number; negative: number; className?: string; showLegend?: boolean;
}) {
  const total = Math.max(1, positive + neutral + negative);
  const parts: [keyof typeof SENTIMENT, number][] = [["positive", positive], ["neutral", neutral], ["negative", negative]];
  return (
    <div className={className}>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
        {parts.map(([k, v]) => v > 0 && (
          <span key={k} style={{ width: `${(v / total) * 100}%`, background: SENTIMENT[k].fill }} />
        ))}
      </div>
      {showLegend && (
        <div className="flex items-center gap-3 mt-2">
          {parts.map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: SENTIMENT[k].fill }} />
              <span className="capitalize">{k}</span>
              <span className="fx-tabular-nums font-semibold" style={{ color: "var(--text-secondary)" }}>{Math.round((v / total) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

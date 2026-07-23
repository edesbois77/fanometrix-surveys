"use client";

// One candidate Finding, as a consultant reads it: the claim first, then the
// trust signals, then its evidence and its rivals on demand. The whole design
// intent is that this reads as a finding to review, not an AI output to accept.
import { useState } from "react";
import { Card, StatusBadge, ConfidenceIndicator, Icon, Button } from "@/app/components/workspace-ui";
import {
  type FindingView, type EvidenceView, effectiveConfidence, confidenceMeter, strengthLabel,
  assertionWord, attentionFlags, STATUS_TONE, STATUS_LABEL, STANCE_META, kindLabel,
} from "./finding-view";

function ConfidenceExplain({ f }: { f: FindingView }) {
  const c = f.assessment?.confidence;
  if (!c) return null;
  return (
    <div className="mt-2 p-3 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Why this confidence?</p>
      <ul className="space-y-1.5">
        {c.factors.map((factor, i) => (
          <li key={i} className="flex items-center gap-2 text-xs" style={{ color: factor.state === "off" ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
            <span className="flex-shrink-0 inline-flex w-3.5 justify-center" style={{ color: factor.state === "on" ? "#3F5D42" : factor.state === "off" ? "var(--text-disabled)" : "var(--accent-gold)" }}>
              {factor.state === "on" ? <Icon.check size={12} strokeWidth={2.5} /> : factor.state === "off" ? "–" : "•"}
            </span>
            {factor.label}
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed mt-2.5 pt-2.5 border-t" style={{ color: "var(--text-tertiary)", borderColor: "var(--border-subtle)" }}>{c.rationale}</p>
      {c.what_would_raise_it.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-tertiary)" }}>What would raise it</p>
          <ul className="mt-1 space-y-1">
            {c.what_would_raise_it.map((s, i) => (
              <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />{s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ e }: { e: EvidenceView }) {
  const meta = STANCE_META[e.stance];
  return (
    <div className="p-2.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", opacity: e.rejected ? 0.6 : 1 }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold min-w-0" style={{ color: "var(--text-secondary)" }}>
          <StatusBadge label={kindLabel(e.contribution_kind)} tone="neutral" />
          {e.provenance && <span className="truncate" style={{ color: "var(--text-tertiary)" }}>{e.provenance}</span>}
        </span>
        {e.rejected
          ? <StatusBadge label="Cannot support this claim" tone="danger" />
          : <StatusBadge label={meta.label} tone={meta.tone} dot />}
      </div>
      {e.snippet && <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{e.snippet}</p>}
      {e.rejected && e.rejected_reason && <p className="text-[11px] mt-1" style={{ color: "#8A4B33" }}>{e.rejected_reason}</p>}
    </div>
  );
}

export function FindingCard({
  finding, rivals, onAction, busy,
}: {
  finding: FindingView;
  rivals: FindingView[];
  onAction: (action: string, body?: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [showConf, setShowConf] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showRivals, setShowRivals] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceView[] | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const conf = effectiveConfidence(finding);
  const flags = attentionFlags(finding, rivals.length);
  const supporting = finding.assessment?.strength?.independence.supporting ?? 0;

  async function loadEvidence() {
    if (evidence || showEvidence) { setShowEvidence(v => !v); return; }
    const res = await fetch(`/api/research-projects/${projectIdFrom()}/findings/${finding.id}`).then(r => r.json()).catch(() => null);
    setEvidence(res?.data?.finding?.evidence ?? []);
    setShowEvidence(true);
  }

  return (
    <Card padding="lg">
      {/* Header — the kind of claim, its status, its confidence */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge label={assertionWord(finding.assertion_type)} tone="accent" uppercase />
          <StatusBadge label={STATUS_LABEL[finding.status]} tone={STATUS_TONE[finding.status]} dot />
          {finding.published && <StatusBadge label="Published" tone="info" />}
        </div>
        <button type="button" onClick={() => setShowConf(v => !v)} className="text-left" style={{ cursor: "pointer" }} aria-expanded={showConf}>
          <ConfidenceIndicator level={confidenceMeter(conf)} basis={supporting > 0 ? `${supporting} independent observation${supporting === 1 ? "" : "s"}` : undefined} />
        </button>
      </div>

      {/* The claim leads. It is a sentence, not a widget. */}
      <p className="text-[17px] leading-relaxed font-semibold tracking-[-0.01em] mt-3" style={{ color: "var(--text-primary)" }}>
        {finding.statement}
      </p>
      {finding.scope && (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>Holds for: {finding.scope}</p>
      )}
      {finding.override_confidence && (
        <p className="text-[11px] mt-1.5" style={{ color: "#8A4B33" }}>
          Confidence set to {finding.override_confidence} by {finding.reviewed_by ?? "an analyst"}: {finding.override_reason}
        </p>
      )}

      {showConf && <ConfidenceExplain f={finding} />}

      {/* The warrant — why the evidence carries the claim */}
      {finding.warrant && (
        <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <span className="font-semibold" style={{ color: "var(--text-tertiary)" }}>Why we believe this: </span>{finding.warrant}
        </p>
      )}

      {/* What a person should look at first */}
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {flags.map((flag, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={13} /></span>{flag}
            </li>
          ))}
        </ul>
      )}

      {/* The evidence, on demand */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={loadEvidence} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>
          <span aria-hidden style={{ transform: showEvidence ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
          {showEvidence ? "Hide the evidence" : "Show the evidence"}
        </button>
        {rivals.length > 0 && (
          <button type="button" onClick={() => setShowRivals(v => !v)} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>
            <span aria-hidden style={{ transform: showRivals ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
            {showRivals ? "Hide" : "See"} {rivals.length} other reading{rivals.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {showEvidence && (
        <div className="mt-2.5 space-y-2">
          {evidence === null ? <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
            : evidence.length === 0 ? <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No evidence is attached to this reading.</p>
            : evidence.map(e => <EvidenceRow key={e.id} e={e} />)}
        </div>
      )}

      {/* Rivals — the competing readings, kept so the choice can be reopened */}
      {showRivals && rivals.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-2.5" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Competing readings</p>
          {rivals.map(r => (
            <div key={r.id} className="p-3 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <ConfidenceIndicator level={confidenceMeter(effectiveConfidence(r))} showLabel={false} />
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{assertionWord(r.assertion_type)}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{r.statement}</p>
              <button type="button" onClick={() => onAction("approve_rival", { rivalId: r.id })} disabled={busy}
                className="text-[11px] font-semibold mt-1.5" style={{ color: "var(--accent-ink)", cursor: busy ? "default" : "pointer" }}>
                Approve this reading instead →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Adjudication — the analyst's judgement */}
      {(finding.status === "candidate" || finding.status === "in_review") && (
        <div className="mt-4 pt-3.5 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border-default)" }}>
          <Button variant="primary" onClick={() => onAction("approve")} disabled={busy}>Approve</Button>
          {!rejecting
            ? <Button variant="ghost" onClick={() => setRejecting(true)} disabled={busy}>Set aside</Button>
            : (
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                {(["unwarranted", "immaterial", "out_of_scope", "duplicate"] as const).map(rc => (
                  <button key={rc} type="button" onClick={() => onAction("reject", { rejectClass: rc })} disabled={busy}
                    className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ color: "#8A4B33", background: "#F6EEEA", border: "1px solid #E4D2C8", cursor: "pointer" }}>
                    {REJECT_WORD[rc]}
                  </button>
                ))}
                <button type="button" onClick={() => setRejecting(false)} className="text-[11px]" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>cancel</button>
              </div>
            )}
          <span className="text-[11px] ml-auto" style={{ color: "var(--text-tertiary)" }}>{strengthLabel(finding.evidence_strength)}</span>
        </div>
      )}

      {finding.status === "approved" && (
        <div className="mt-4 pt-3.5 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--border-default)" }}>
          <StatusBadge label={`Approved by ${finding.reviewed_by ?? "an analyst"}`} tone="success" dot />
          {!finding.published
            ? <Button variant="secondary" onClick={() => onAction("publish", { publish: true })} disabled={busy}>Publish to reports</Button>
            : <Button variant="ghost" onClick={() => onAction("publish", { publish: false })} disabled={busy}>Withhold</Button>}
          <button type="button" onClick={() => onAction("reopen", { why: "Reopened for a second look." })} disabled={busy}
            className="text-[11px] font-semibold ml-auto" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>Reopen</button>
        </div>
      )}
    </Card>
  );
}

const REJECT_WORD: Record<string, string> = {
  unwarranted: "Not supported", immaterial: "Immaterial", out_of_scope: "Out of scope", duplicate: "Duplicate",
};

// The project id is not on the finding shape; the board passes it via a closure
// on onAction, and evidence is loaded through the same project scope. Kept here
// as a tiny read off the URL so the card stays self-contained for the drawer.
function projectIdFrom(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/research-projects\/([^/]+)/);
  return m?.[1] ?? "";
}

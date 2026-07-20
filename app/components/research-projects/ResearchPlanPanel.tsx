"use client";

// The Research Plan surface — the project's methodology briefing at the top of the
// Research area (docs/research-plan-blueprint.md, Phase 1). It reads like a
// consultancy brief: objective, hypothesis/assumptions, the methodology with a
// per-method brief (suitability · role · contribution · limitations · outputs),
// the evidence themes and the evidence each requires, expected coverage, gaps, and
// what the client gets. It carries NO confidence — that is Analysis's word, after
// evidence. Review → regenerate → approve; the methods grid below is what it drives.
import { useCallback, useEffect, useState } from "react";
import { Card, Button, Icon } from "@/app/components/workspace-ui";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  METHOD_LABEL, SUITABILITY_TONE,
  type ResearchPlan, type RecommendedMethod, type EvidenceTheme, type EvidenceMethod, type Coverage,
} from "@/lib/research-plan";

type Row = { content: ResearchPlan; edited_content: ResearchPlan | null; status: string; generated_at: string | null } | null;

function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 pt-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <span aria-hidden className="rounded-full" style={{ width: 3, height: 14, background: tone ?? "var(--accent-gold)" }} />
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: tone ?? "var(--text-tertiary)" }}>{children}</h3>
    </div>
  );
}

function SuitabilityBadge({ m }: { m: RecommendedMethod }) {
  const t = SUITABILITY_TONE[m.suitability];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.ink, background: t.bg, border: `1px solid ${t.border}` }}>
      {m.suitability}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-[13px] leading-relaxed mt-0.5" style={{ color: "var(--text-secondary)" }}>{children}</p>
    </div>
  );
}

function MethodBrief({ m }: { m: RecommendedMethod }) {
  const dim = !m.recommended;
  return (
    <div className="rounded-lg p-3.5" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", opacity: dim ? 0.7 : 1 }}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{METHOD_LABEL[m.method]}</span>
          <SuitabilityBadge m={m} />
          {!m.available && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-tertiary)", background: "var(--surface-sunken)", border: "1px dashed var(--border-subtle)" }} title={m.availability_note ?? ""}>
              Not available yet
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: m.recommended ? "#3F5D42" : "var(--text-tertiary)" }}>
          {m.recommended ? "Recommended" : "Not recommended"}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
        <Field label="Why">{m.why_recommended}</Field>
        <Field label="Role in answering the question">{m.role}</Field>
        <Field label="Expected contribution">{m.expected_contribution}</Field>
        <Field label="Evidence required">{m.evidence_requirements}</Field>
        <Field label="Limitations">{m.limitations}</Field>
        <Field label="Expected outputs">{m.expected_outputs}</Field>
      </div>
      {!m.available && m.availability_note && (
        <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>{m.availability_note}</p>
      )}
    </div>
  );
}

const METHOD_SHORT: Record<EvidenceMethod, string> = { conversation: "Conversation", survey: "Survey", document: "Document", news: "News" };

function ThemeCard({ t }: { t: EvidenceTheme }) {
  return (
    <div className="rounded-lg p-3.5" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t.theme}</span>
        {t.best_methods.map(m => (
          <span key={m} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>{METHOD_SHORT[m]}</span>
        ))}
      </div>
      {t.description && <p className="text-[13px] leading-relaxed mt-1" style={{ color: "var(--text-secondary)" }}>{t.description}</p>}
      {t.required_evidence.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Evidence required to answer this</p>
          <ul className="space-y-1">
            {t.required_evidence.map((r, i) => (
              <li key={i} className="text-[12px] flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-0.5 text-[10px] font-semibold flex-shrink-0" style={{ color: "var(--accent-ink)" }}>{METHOD_SHORT[r.method]}</span>
                <span>{r.description}{r.rough_target ? <span style={{ color: "var(--text-tertiary)" }}> · target: {r.rough_target}</span> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const COVERAGE_DOT: Record<Coverage, string> = { strong: "#3F5D42", partial: "var(--accent-gold)", none: "var(--text-disabled)" };

export function ResearchPlanPanel({ projectId, researchQuestion, canManage }: { projectId: string; researchQuestion: string | null; canManage: boolean }) {
  const [row, setRow] = useState<Row>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/research-plan`).then(r => (r.ok ? r.json() : { data: null })).catch(() => ({ data: null }));
    setRow(res.data ?? null); setLoaded(true);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/research-projects/${projectId}/research-plan`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "Couldn't generate the research plan."); return; }
    await load();
  }
  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/research-projects/${projectId}/research-plan`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
    setBusy(false);
    if (res.ok) load();
  }

  if (!loaded) return null;

  const plan = row ? (row.edited_content ?? row.content) : null;
  const approved = row?.status === "approved";

  // No plan yet — the invitation to design the research.
  if (!plan) {
    return (
      <Card padding="lg">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--accent-ink)" }}>Research Plan</p>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          Design the research before collecting anything. Fanometrix will propose how to answer your research question — which methods to use and why, what evidence each needs, and where the evidence may fall short — for you to review and approve.
        </p>
        {researchQuestion
          ? <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>Research question: {researchQuestion}</p>
          : <p className="text-xs mt-2" style={{ color: "#8A4B33" }}>Add a research question to this project first, then generate the plan.</p>}
        {err && <p className="text-xs mt-2" style={{ color: "#8A4B33" }}>{err}</p>}
        {canManage && researchQuestion && (
          <div className="mt-3"><Button variant="primary" onClick={generate} disabled={busy}>{busy ? "Designing the research…" : "Generate Research Plan"}</Button></div>
        )}
      </Card>
    );
  }

  return (
    <Card padding="lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap pb-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-tertiary)" }}>Research Plan · methodology briefing</p>
          <h2 className="text-lg font-bold tracking-[-0.01em] mt-0.5" style={{ color: "var(--text-primary)" }}>{plan.objective || "Research Plan"}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={approved ? { color: "#3F5D42", background: "#EEF3EC", border: "1px solid #D3E0D0" } : { color: "var(--accent-ink)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            {approved ? <><Icon.check size={12} strokeWidth={2.5} /> Approved</> : "Draft — awaiting approval"}
          </span>
          {canManage && (
            <>
              <Button variant="secondary" onClick={generate} disabled={busy}>{busy ? "Working…" : "Regenerate"}</Button>
              {!approved && <Button variant="primary" onClick={approve} disabled={busy}>Approve plan</Button>}
            </>
          )}
        </div>
      </div>

      {/* Hypothesis + assumptions */}
      {(plan.hypothesis || plan.assumptions.length > 0) && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {plan.hypothesis && <Field label="Initial hypothesis">{plan.hypothesis}</Field>}
          {plan.assumptions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Assumptions</p>
              <ul className="mt-0.5 space-y-0.5">
                {plan.assumptions.map((a, i) => <li key={i} className="text-[13px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}><span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} />{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Methodology */}
      <Eyebrow>Methodology</Eyebrow>
      {plan.methodology.approach && <p className="text-[14px] leading-7" style={{ color: "var(--text-secondary)" }}>{plan.methodology.approach}</p>}
      {plan.methodology.advisor_note && (
        <div className="mt-2 rounded-lg p-3 flex items-start gap-2" style={{ background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
          <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.bulb size={14} /></span>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--accent-ink)" }}>{plan.methodology.advisor_note}</p>
        </div>
      )}
      <div className="mt-3 space-y-2.5">
        {plan.methodology.recommended_methods.map(m => <MethodBrief key={m.method} m={m} />)}
      </div>

      {/* Evidence themes */}
      {plan.evidence_themes.length > 0 && (
        <>
          <Eyebrow>Evidence themes</Eyebrow>
          <div className="space-y-2.5">{plan.evidence_themes.map((t, i) => <ThemeCard key={i} t={t} />)}</div>
        </>
      )}

      {/* Expected coverage */}
      {plan.expected_coverage.length > 0 && (
        <>
          <Eyebrow>Expected coverage</Eyebrow>
          <ul className="space-y-1">
            {plan.expected_coverage.map((c, i) => (
              <li key={i} className="text-[12px] flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COVERAGE_DOT[c.coverage] }} />
                <span className="font-medium">{c.theme}</span>
                <span style={{ color: "var(--text-tertiary)" }}>· {METHOD_SHORT[c.method]} · {c.coverage}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Gaps */}
      {plan.gaps.length > 0 && (
        <>
          <Eyebrow tone="#8A4B33">Known evidence gaps</Eyebrow>
          <ul className="space-y-2">
            {plan.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={13} /></span>
                <span className="min-w-0">
                  <span className="text-[13px] block" style={{ color: "var(--text-secondary)" }}>{g.message}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{g.recommended_action}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Expected outputs + remaining limitations */}
      {(plan.expected_outputs.length > 0 || plan.remaining_limitations.length > 0) && (
        <>
          <Eyebrow>What you'll get</Eyebrow>
          <div className="grid md:grid-cols-2 gap-4">
            {plan.expected_outputs.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Expected outputs if completed</p>
                <ul className="space-y-0.5">{plan.expected_outputs.map((o, i) => <li key={i} className="text-[13px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}><span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} />{o}</li>)}</ul>
              </div>
            )}
            {plan.remaining_limitations.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>What it still won't answer</p>
                <ul className="space-y-0.5">{plan.remaining_limitations.map((o, i) => <li key={i} className="text-[13px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--text-tertiary)" }}><span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--text-disabled)" }} />{o}</li>)}</ul>
              </div>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] mt-5 pt-4 border-t" style={{ color: "var(--text-tertiary)", borderColor: "var(--border-subtle)" }}>
        {plan.generated_at ? `Generated ${formatRelativeTime(plan.generated_at)}` : ""}
        {plan.edited ? " · edited" : ""}
        {" · "}Method suitability and expected contribution are judged here, before collection. Research confidence is calculated later by Analysis, from the evidence itself.
      </p>
    </Card>
  );
}

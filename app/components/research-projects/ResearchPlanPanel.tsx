"use client";

// The Research Plan surface — the project's methodology briefing at the top of the
// Research area (docs/research-plan-blueprint.md). Designed to read like a
// consultancy RECOMMENDATION, not a generated report: it leads with a concise
// recommendation, discloses the per-method brief only on demand, invites the
// researcher's own assumptions/context before approval (so the plan feels
// co-authored), and flows explicitly into configuring the methods below. It
// carries NO "confidence" — that is Analysis's word, after evidence.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Icon } from "@/app/components/workspace-ui";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { NotesPanel, type ResearcherNote } from "@/app/components/research-projects/analysis/ResearcherNotes";
import {
  METHOD_LABEL, SUITABILITY_TONE,
  type ResearchPlan, type RecommendedMethod, type EvidenceTheme, type EvidenceMethod,
} from "@/lib/research-plan";

type Row = { content: ResearchPlan; edited_content: ResearchPlan | null; status: string; generated_at: string | null } | null;

// research_notes reused as the plan's human-contribution store — namespaced by
// scope_ref so it never collides with Analysis project notes, and persists across
// plan regeneration (the future Research Advisor's foundation).
const PLAN_NOTE_REF = "research_plan";
const METHOD_SLUG: Partial<Record<EvidenceMethod, string>> = { conversation: "conversation", survey: "survey", document: "library" };
const METHOD_SHORT: Record<EvidenceMethod, string> = { conversation: "Conversation", survey: "Survey", document: "Document", news: "News" };

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function SuitabilityBadge({ m }: { m: RecommendedMethod }) {
  const t = SUITABILITY_TONE[m.suitability];
  return <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: t.ink, background: t.bg, border: `1px solid ${t.border}` }}>{m.suitability}</span>;
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

// A method — collapsed to a one-line recommendation; expands to the full brief.
function MethodRow({ m, open, onToggle }: { m: RecommendedMethod; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", opacity: m.recommended ? 1 : 0.72 }}>
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-3 text-left p-3" style={{ cursor: "pointer" }}>
        <span aria-hidden className="inline-flex flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={14} strokeWidth={2.5} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{METHOD_LABEL[m.method]}</span>
            <SuitabilityBadge m={m} />
            {!m.available && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-tertiary)", background: "var(--surface-sunken)", border: "1px dashed var(--border-subtle)" }} title={m.availability_note ?? ""}>Not available yet</span>}
            <span className="text-[10px] font-semibold ml-auto" style={{ color: m.recommended ? "#3F5D42" : "var(--text-tertiary)" }}>{m.recommended ? "Recommended" : "Not recommended"}</span>
          </span>
          <span className="text-[13px] leading-relaxed block mt-1" style={{ color: "var(--text-secondary)" }}>{m.role || m.why_recommended}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3.5 grid sm:grid-cols-2 gap-x-4 gap-y-2.5" style={{ paddingLeft: 32 }}>
          <Field label="Why">{m.why_recommended}</Field>
          <Field label="Expected contribution">{m.expected_contribution}</Field>
          <Field label="Evidence required">{m.evidence_requirements}</Field>
          <Field label="Limitations">{m.limitations}</Field>
          <Field label="What you get from it">{m.expected_outputs}</Field>
          {!m.available && m.availability_note && <Field label="Availability">{m.availability_note}</Field>}
        </div>
      )}
    </div>
  );
}

function Section({ eyebrow, tone, children }: { eyebrow: string; tone?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden className="rounded-full" style={{ width: 3, height: 14, background: tone ?? "var(--accent-gold)" }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: tone ?? "var(--text-tertiary)" }}>{eyebrow}</h3>
      </div>
      {children}
    </section>
  );
}

function ThemeRow({ t }: { t: EvidenceTheme }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.theme}</span>
        {t.best_methods.map(m => <span key={m} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>{METHOD_SHORT[m]}</span>)}
      </div>
      {t.description && <p className="text-[13px] leading-relaxed mt-1" style={{ color: "var(--text-secondary)" }}>{t.description}</p>}
      {t.required_evidence.length > 0 && (
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
          Needs: {t.required_evidence.map(r => `${METHOD_SHORT[r.method]}${r.rough_target ? ` (${r.rough_target})` : ""}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Bullets({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="space-y-1">
      {items.map((o, i) => (
        <li key={i} className="text-[13px] leading-relaxed flex items-start gap-1.5" style={{ color: muted ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
          <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: muted ? "var(--text-disabled)" : "var(--accent-gold)" }} />{o}
        </li>
      ))}
    </ul>
  );
}

export function ResearchPlanPanel({ projectId, researchQuestion, canManage }: { projectId: string; researchQuestion: string | null; canManage: boolean }) {
  const [row, setRow] = useState<Row>(null);
  const [notes, setNotes] = useState<ResearcherNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openMethods, setOpenMethods] = useState<Set<string>>(new Set());
  const toggleMethod = (k: string) => setOpenMethods(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/notes`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setNotes(res?.notes ?? []);
  }, [projectId]);

  const load = useCallback(async () => {
    const [planRes, notesRes] = await Promise.all([
      fetch(`/api/research-projects/${projectId}/research-plan`).then(r => (r.ok ? r.json() : { data: null })).catch(() => ({ data: null })),
      fetch(`/api/research-projects/${projectId}/notes`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setRow(planRes.data ?? null); setNotes(notesRes?.notes ?? []); setLoaded(true);
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
  const planNotes = notes.filter(n => n.scope === "project" && n.scope_ref === PLAN_NOTE_REF);

  // No plan yet — the invitation to design the research.
  if (!plan) {
    return (
      <Card padding="lg">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--accent-ink)" }}>Research Plan</p>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          Design the research before collecting anything. Based on your research question, Fanometrix will recommend how to answer it — which methods to use and why, what evidence each needs, and where the evidence may fall short — for you to review, add to, and approve.
        </p>
        {researchQuestion
          ? <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>Research question: {researchQuestion}</p>
          : <p className="text-xs mt-2" style={{ color: "#8A4B33" }}>Add a research question to this project first, then generate the plan.</p>}
        {err && <p className="text-xs mt-2" style={{ color: "#8A4B33" }}>{err}</p>}
        {canManage && researchQuestion && <div className="mt-3"><Button variant="primary" onClick={generate} disabled={busy}>{busy ? "Designing the research…" : "Generate Research Plan"}</Button></div>}
      </Card>
    );
  }

  const recommended = plan.methodology.recommended_methods.filter(m => m.recommended);
  const recNames = recommended.map(m => METHOD_LABEL[m.method]);
  const bridgeMethods = recommended.filter(m => m.available && METHOD_SLUG[m.method]);

  return (
    <Card padding="lg">
      {/* Framing — advice to review, not automation that has run. */}
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Based on your research question, Fanometrix recommends the following methodology to maximise the quality and reliability of your findings. Review the approach below before configuring your research methods.
      </p>

      {/* Header: status + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-tertiary)" }}>Recommended methodology</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={approved ? { color: "#3F5D42", background: "#EEF3EC", border: "1px solid #D3E0D0" } : { color: "var(--accent-ink)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            {approved ? <><Icon.check size={12} strokeWidth={2.5} /> Approved</> : "Draft — awaiting your approval"}
          </span>
          {canManage && (
            <>
              <Button variant="secondary" onClick={generate} disabled={busy}>{busy ? "Working…" : "Regenerate"}</Button>
              {!approved && <Button variant="primary" onClick={approve} disabled={busy}>Approve plan</Button>}
            </>
          )}
        </div>
      </div>

      {/* THE RECOMMENDATION — lead, not a wall of fields. */}
      {recNames.length > 0 && (
        <p className="text-[17px] leading-snug font-semibold tracking-[-0.01em] mt-2" style={{ color: "var(--text-primary)" }}>
          To answer this well, we recommend {listJoin(recNames)}.
        </p>
      )}
      {plan.methodology.approach && <p className="text-[14px] leading-7 mt-2" style={{ color: "var(--text-secondary)" }}>{plan.methodology.approach}</p>}
      {plan.methodology.advisor_note && (
        <div className="mt-3 rounded-lg p-3 flex items-start gap-2" style={{ background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
          <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.bulb size={14} /></span>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--accent-ink)" }}>{plan.methodology.advisor_note}</p>
        </div>
      )}
      {plan.hypothesis && <p className="text-[13px] leading-relaxed mt-2" style={{ color: "var(--text-tertiary)" }}><span className="font-semibold">Working hypothesis:</span> {plan.hypothesis}</p>}

      {/* METHODS — progressive disclosure: one line each, expand for the brief. */}
      <Section eyebrow="The methods, and what each will do">
        <div className="space-y-2">
          {plan.methodology.recommended_methods.map(m => (
            <MethodRow key={m.method} m={m} open={openMethods.has(m.method)} onToggle={() => toggleMethod(m.method)} />
          ))}
        </div>
      </Section>

      {/* THEMES — what we'll investigate. */}
      {plan.evidence_themes.length > 0 && (
        <Section eyebrow="What we’ll investigate">
          <div className="space-y-2">{plan.evidence_themes.map((t, i) => <ThemeRow key={i} t={t} />)}</div>
        </Section>
      )}

      {/* GAPS — honest, up front. */}
      {plan.gaps.length > 0 && (
        <Section eyebrow="Where the evidence may fall short" tone="#8A4B33">
          <ul className="space-y-2">
            {plan.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={13} /></span>
                <span className="min-w-0"><span className="text-[13px] block" style={{ color: "var(--text-secondary)" }}>{g.message}</span><span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{g.recommended_action}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* WHAT YOU'LL GET — single altitude (project level). */}
      {(plan.expected_outputs.length > 0 || plan.remaining_limitations.length > 0) && (
        <Section eyebrow="What you'll get">
          <div className="grid md:grid-cols-2 gap-4">
            {plan.expected_outputs.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>If the methodology is completed</p><Bullets items={plan.expected_outputs} /></div>}
            {plan.remaining_limitations.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>What it still won’t answer</p><Bullets items={plan.remaining_limitations} muted /></div>}
          </div>
        </Section>
      )}

      {/* YOUR CONTRIBUTION — makes the plan co-authored, not machine-authored. */}
      <Section eyebrow="Your assumptions & context">
        <p className="text-[12px] leading-relaxed mb-2" style={{ color: "var(--text-tertiary)" }}>
          Add what you know that the plan can’t — audience specifics, prior findings, constraints, or an assumption you’d challenge. Your input is kept with the project and preserved when the plan is regenerated.
        </p>
        <NotesPanel projectId={projectId} scope="project" scopeRef={PLAN_NOTE_REF} notes={planNotes} onChanged={loadNotes} />
      </Section>

      {/* THE BRIDGE — the plan flows into configuring the methods. */}
      <Section eyebrow={approved ? "Set up your research" : "Next"}>
        <p className="text-[13px] leading-relaxed mb-2.5" style={{ color: "var(--text-secondary)" }}>
          {approved ? "Plan approved. Configure the recommended methods to begin:" : "When you’re happy with the approach, approve it and configure the recommended methods below."}
        </p>
        {bridgeMethods.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {bridgeMethods.map(m => (
              <Link key={m.method} href={`/research-projects/${projectId}/research/${METHOD_SLUG[m.method]}`}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg" style={{ color: "var(--accent-ink)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
                {METHOD_LABEL[m.method]} <Icon.chevronRight size={13} strokeWidth={2.5} />
              </Link>
            ))}
          </div>
        )}
      </Section>

      <p className="text-[11px] mt-5 pt-4 border-t" style={{ color: "var(--text-tertiary)", borderColor: "var(--border-subtle)" }}>
        {plan.generated_at ? `Generated ${formatRelativeTime(plan.generated_at)}` : ""}{plan.edited ? " · edited" : ""}
        {" · "}This is method suitability, judged before collection. Research confidence is calculated later by Analysis, from the evidence itself.
      </p>
    </Card>
  );
}

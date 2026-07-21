"use client";

// "Our Understanding" — the Overview commissioning experience (docs/overview-page.md).
// The Overview leads with this: it reads as a consultancy DELIVERABLE, not a form.
//   • No understanding yet  → Intake (describe the challenge, or upload a brief).
//   • Understanding present  → Reflect: the reflected problem, structured fields
//     with stated/inferred provenance, tensions, and the shared-understanding gate.
// Method-neutral throughout — no surveys/searches here; those belong to Planning.
//
// Slice 1 of the Overview redesign: identity letterhead + Intake + Reflect.
// Recall (Existing Intelligence), Confidence and Frontier land in later slices.
import { useRef, useState } from "react";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { Card, SectionHeading, Button, StatusBadge, Icon, Eyebrow } from "@/app/components/workspace-ui";
import {
  type ProjectUnderstanding, type SourcedList,
  UNDERSTANDING_FIELDS, PROVENANCE_LABEL, PROVENANCE_TONE, hasUnderstanding,
} from "@/lib/understanding";

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };

const isList = (key: string) => UNDERSTANDING_FIELDS.find(f => f.key === key)?.kind === "list";
const fieldOf = (u: ProjectUnderstanding, key: string) => (u as unknown as Record<string, { value?: string; values?: string[]; provenance: string; source: string | null }>)[key];

export function OverviewUnderstanding() {
  const { projectId, project, load } = useResearchProject();
  const understanding = project?.understanding ?? null;
  const present = hasUnderstanding(understanding);

  const [forceIntake, setForceIntake] = useState(false);
  const showIntake = !present || forceIntake;

  return showIntake
    ? <Intake projectId={projectId} existing={project?.research_question ?? null} onDone={() => { setForceIntake(false); load(); }} onCancel={present ? () => setForceIntake(false) : undefined} />
    : <Deliverable projectId={projectId} understanding={understanding!} engagement={project?.project_name ?? "This engagement"} onReanalyse={() => setForceIntake(true)} onSaved={load} />;
}

// ── Intake ────────────────────────────────────────────────────────────────────
function Intake({ projectId, existing, onDone, onCancel }: {
  projectId: string; existing: string | null; onDone: () => void; onCancel?: () => void;
}) {
  const [description, setDescription] = useState(existing ?? "");
  const [busy, setBusy] = useState<null | "reading" | "reflecting">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submitDescription() {
    if (description.trim().length < 20) { setError("Tell us a little more about the challenge — a sentence or two."); return; }
    setError(null); setBusy("reflecting");
    try {
      const res = await fetch(`/api/research-projects/${projectId}/understanding`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Couldn't reflect that back. Please try again."); setBusy(null); return; }
      onDone();
    } catch { setError("Something went wrong. Please try again."); setBusy(null); }
  }

  async function submitFile(file: File) {
    setError(null); setBusy("reading");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`/api/research-projects/${projectId}/understanding`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Couldn't read that brief. Please try again."); setBusy(null); return; }
      onDone();
    } catch { setError("Something went wrong. Please try again."); setBusy(null); }
  }

  if (busy) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-6">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md" style={{ background: "#F2E6C8", color: "#8A6D2F" }}><Icon.sparkles size={16} /></span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{busy === "reading" ? "Reading your brief…" : "Reflecting it back…"}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Understanding the business problem before we plan any research.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <section id="hero" className="scroll-mt-6">
      <span className="block w-10 h-0.5 rounded-full mb-5" style={{ background: "var(--accent-gold)" }} aria-hidden />
      <Eyebrow tone="accent">Commissioning</Eyebrow>
      <h2 className="mt-3 text-[26px] md:text-[32px] font-bold tracking-[-0.02em] leading-tight max-w-3xl" style={{ color: "var(--text-primary)" }}>
        Let&apos;s understand your challenge
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
        Share the client brief or describe the problem, and Fanometrix will reflect back its understanding before any research is planned.
      </p>

      <Card className="mt-6">
        <SectionHeading title="Describe the challenge" description="A few sentences on the business problem — we'll sharpen it from there." />
        <div className="mt-4">
          <textarea value={description} onChange={e => setDescription(e.target.value)} onFocus={focusGold} onBlur={blurGold} rows={4}
            className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
            placeholder="e.g. Our Champions League sponsorship has strong awareness but weak affinity with fans. We want it to build real cultural relevance, especially with business travellers…" />
          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".pdf,.docx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) submitFile(f); }} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <span className="inline-flex items-center gap-1.5"><Icon.document size={14} /> Upload a brief</span>
              </Button>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>PDF or Word</span>
            </div>
            <div className="flex items-center gap-2">
              {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
              <Button variant="primary" onClick={submitDescription}>Reflect this back</Button>
            </div>
          </div>
          {error && <p className="text-xs mt-3" style={{ color: "#8A4B33" }}>{error}</p>}
        </div>
      </Card>
    </section>
  );
}

// ── Deliverable ─────────────────────────────────────────────────────────────
function Deliverable({ projectId, understanding, engagement, onReanalyse, onSaved }: {
  projectId: string; understanding: ProjectUnderstanding; engagement: string; onReanalyse: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ProjectUnderstanding | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const u = draft ?? understanding;

  async function save(next: ProjectUnderstanding) {
    setSaving(true);
    const res = await fetch(`/api/research-projects/${projectId}/understanding`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ understanding: next }),
    });
    setSaving(false);
    if (res.ok) { setDraft(null); onSaved(); }
  }
  const confirm = () => save({ ...understanding, confirmed: true, confirmed_at: new Date().toISOString() });

  const markets = u.markets.values.length ? u.markets.values.join(" · ") : null;

  return (
    <section id="hero" className="scroll-mt-6">
      {/* Deliverable letterhead */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-4 mb-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5 flex-wrap text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{engagement}</span>
          {markets && <><span>·</span><span>{markets}</span></>}
          <StatusBadge label="Commissioning" tone="accent" size="sm" />
          {u.confirmed && <StatusBadge label="Understanding confirmed" tone="success" size="sm" dot />}
        </div>
        {u.source_label && (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
            <Icon.document size={11} /> Based on: {u.source_label}
          </span>
        )}
      </div>

      <Eyebrow tone="accent">Our understanding</Eyebrow>

      {/* Reflect-with-insight narrative — the opening of the deliverable */}
      {u.reflection && (
        <p className="mt-3 text-[19px] md:text-[22px] font-medium tracking-[-0.015em] leading-[1.4] max-w-3xl" style={{ color: "var(--text-primary)" }}>
          {u.reflection}
        </p>
      )}

      {/* Tensions / assumptions to resolve */}
      {u.tensions.length > 0 && (
        <div className="mt-5 space-y-2 max-w-3xl">
          {u.tensions.map((t, i) => (
            <div key={i} className="flex items-start gap-2.5 p-3 border" style={{ borderRadius: "var(--radius-tile)", background: "#FBF3E1", borderColor: "#ECDCB8" }}>
              <span className="mt-0.5 flex-shrink-0" style={{ color: "#8A6D2F" }}><Icon.alert size={15} /></span>
              <p className="text-[13px] leading-relaxed" style={{ color: "#6B5220" }}>
                <span className="font-semibold uppercase tracking-wide text-[10px] mr-1.5">{t.kind}</span>{t.message}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Structured fields — the reflected brief, each with provenance */}
      <Card className="mt-6" padding="lg">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="How we read the brief" description="What the client stated, and what we've inferred — refine anything that isn't right." />
          {!editing && <Button variant="ghost" size="sm" onClick={() => setDraft(structuredClone(understanding))}>Refine</Button>}
        </div>

        <div className="mt-5 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {UNDERSTANDING_FIELDS.map(({ key, label }) => {
            const f = fieldOf(u, key);
            const prov = f.provenance as keyof typeof PROVENANCE_LABEL;
            const emphasised = key === "research_question";
            return (
              <div key={key} className="py-3.5 grid md:grid-cols-[190px_1fr] gap-2 md:gap-4">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.05em] pt-0.5" style={{ color: "var(--text-tertiary)" }}>{label}</span>
                </div>
                <div className="min-w-0">
                  {editing
                    ? <FieldEditor u={draft!} setU={setDraft} fieldKey={key} />
                    : <FieldValue field={f} emphasised={emphasised} isList={isList(key)} />}
                  <div className="mt-1.5">
                    <StatusBadge label={PROVENANCE_LABEL[prov] + (f.source ? ` · ${f.source}` : "")} tone={PROVENANCE_TONE[prov]} size="sm" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {editing && (
          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => save(draft!)} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        )}
      </Card>

      {/* Shared-understanding gate + hand-off */}
      {!editing && (
        <Card className="mt-4" padding="lg">
          {u.confirmed ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5" style={{ color: "#3F5D42" }}><Icon.check size={16} /></span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Shared understanding confirmed</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>We can now design the research around this problem.</p>
                </div>
              </div>
              <Button variant="primary" href={`/research-projects/${projectId}/research`}>Plan the research →</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Does this reflect your business challenge?</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>We&apos;ll only begin designing the research once we agree on the problem.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onReanalyse}>Start over</Button>
                <Button variant="primary" onClick={confirm} disabled={saving}>{saving ? "…" : "Yes, this reflects my challenge"}</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

function FieldValue({ field, emphasised, isList }: {
  field: { value?: string; values?: string[] }; emphasised: boolean; isList: boolean;
}) {
  if (isList) {
    const vals = field.values ?? [];
    if (!vals.length) return <span className="text-sm italic" style={{ color: "var(--text-tertiary)" }}>—</span>;
    return (
      <ul className="space-y-1">
        {vals.map((v, i) => <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--text-tertiary)" }}>·</span><span>{v}</span></li>)}
      </ul>
    );
  }
  const val = field.value ?? "";
  if (!val) return <span className="text-sm italic" style={{ color: "var(--text-tertiary)" }}>—</span>;
  return emphasised
    ? <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{val}</p>
    : <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{val}</p>;
}

function FieldEditor({ u, setU, fieldKey }: {
  u: ProjectUnderstanding; setU: (u: ProjectUnderstanding) => void; fieldKey: string;
}) {
  const f = fieldOf(u, fieldKey);
  const list = isList(fieldKey);
  if (list) {
    const text = (f.values ?? []).join("\n");
    return (
      <textarea value={text} rows={Math.max(2, (f.values ?? []).length)} onFocus={focusGold} onBlur={blurGold}
        onChange={e => setU({ ...u, [fieldKey]: { ...(f as SourcedList), values: e.target.value.split("\n").map(s => s.trim()).filter(Boolean), provenance: "stated" } } as unknown as ProjectUnderstanding)}
        className="w-full px-2.5 py-1.5 text-sm outline-none transition-colors" style={inputStyle} placeholder="One per line" />
    );
  }
  return (
    <input value={f.value ?? ""} onFocus={focusGold} onBlur={blurGold}
      onChange={e => setU({ ...u, [fieldKey]: { ...f, value: e.target.value, provenance: fieldKey === "research_question" ? "proposed" : "stated" } } as unknown as ProjectUnderstanding)}
      className="w-full px-2.5 py-1.5 text-sm outline-none transition-colors" style={inputStyle} />
  );
}

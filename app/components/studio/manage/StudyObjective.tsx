"use client";

// ── Manage → Study → Objective ───────────────────────────────────────────────
// The objective states what the study is trying to learn or establish. Prominent at
// the top of Overview, editable by an authorised user, with optional AI drafting from
// plain-language intent. Nothing is saved until the user approves the wording. Editing
// the objective changes only the objective — never results, responses, membership or
// findings.

import { useState } from "react";
import { Card, Button } from "@/app/components/workspace-ui";

export function StudyObjective({ studyId, objective, onSaved }: { studyId: string; objective: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(objective ?? "");
  const [intent, setIntent] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const start = () => { setDraft(objective ?? ""); setIntent(""); setAiOpen(!objective); setNote(null); setEditing(true); };

  const suggest = async () => {
    if (busy || !intent.trim()) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/objective/suggest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, avoid: draft.trim() || null }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.objective) setDraft(j.objective); else setNote(j?.error || "Could not draft an objective.");
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (busy || !draft.trim()) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/survey-studio/studies/${studyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objective: draft }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || "Could not save the objective."); return; }
      setEditing(false); onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Objective</h2>
      <Card padding="lg">
        {!editing ? (
          <div className="flex items-start justify-between gap-4">
            {objective ? (
              <p className="text-[15px] leading-relaxed max-w-2xl" style={{ color: "var(--text-primary)" }}>{objective}</p>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No objective yet. Set out what this study is trying to learn or establish — it guides the analysis.</p>
            )}
            <Button onClick={start} variant="secondary" size="sm" className="flex-shrink-0">{objective ? "Edit objective" : "Set objective"}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>What is this study trying to learn or establish?</label>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="e.g. Assess how fans perceive the sponsorship, and where it can create more value for them."
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>

            {!aiOpen ? (
              <button type="button" onClick={() => setAiOpen(true)} className="text-xs font-medium" style={{ color: "var(--accent-gold)" }}>✨ Draft with AI instead</button>
            ) : (
              <div className="rounded-[var(--radius-control)] p-3" style={{ background: "var(--accent-wash)" }}>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Describe it in your own words and we&apos;ll suggest an objective</label>
                <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={2} placeholder="e.g. We want to know if FedEx feels like a natural Champions League sponsor and what would make fans care more."
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                <div className="mt-2 flex items-center gap-2">
                  <Button onClick={suggest} variant="secondary" size="sm" disabled={busy || !intent.trim()}>{busy ? "Drafting…" : draft.trim() ? "Generate another" : "Suggest objective"}</Button>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>The suggestion appears in the box above — edit it, or generate another. Nothing is saved until you press Save.</span>
                </div>
              </div>
            )}

            {note && <p className="text-xs" style={{ color: "#B4694C" }}>{note}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={save} variant="primary" size="sm" disabled={busy || !draft.trim()}>Save objective</Button>
              <Button onClick={() => { setEditing(false); setNote(null); }} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

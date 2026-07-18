"use client";

// Researcher Notes — the human interpretation layer over Analysis
// (docs/analysis-workspace-blueprint.md §11.3). Visually "the analyst's margin":
// a gold-edged, distinct-from-AI surface. Notes persist independently of the AI
// synthesis and survive every regeneration; this panel is self-contained (it does
// its own reads/writes) and calls onChanged() so the parent can refresh.
import { useState } from "react";
import { Icon } from "@/app/components/workspace-ui";
import { formatRelativeTime } from "@/lib/format-relative-time";

export type ResearcherNote = {
  id: string;
  scope: "project" | "aspect" | "finding";
  scope_ref: string;
  body: string;
  author: string | null;
  created_at: string;
  updated_at: string;
};

// Stable anchor for a finding-scoped note: the aspect (a durable label) plus a
// normalised key of the finding text. If the finding text is unchanged on
// regeneration the note re-attaches; if it changes, the note is kept and
// surfaced at aspect level, flagged — never dropped.
export function findingKey(aspect: string, findingText: string): string {
  const slug = findingText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100);
  return `${aspect}::${slug}`;
}

async function api(projectId: string, method: string, payload: unknown, query = "") {
  const res = await fetch(`/api/research-projects/${projectId}/notes${query}`, {
    method, headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(payload),
  });
  return res.ok;
}

export function NotesPanel({
  projectId, scope, scopeRef, notes, onChanged, compact = false,
}: {
  projectId: string; scope: ResearcherNote["scope"]; scopeRef: string;
  notes: ResearcherNote[]; onChanged: () => void; compact?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!draft.trim()) return;
    setBusy(true);
    const ok = await api(projectId, "POST", { scope, scope_ref: scopeRef, body: draft.trim() });
    setBusy(false);
    if (ok) { setDraft(""); setAdding(false); onChanged(); }
  }
  async function save(id: string) {
    if (!editDraft.trim()) return;
    setBusy(true);
    const ok = await api(projectId, "PATCH", { id, body: editDraft.trim() });
    setBusy(false);
    if (ok) { setEditingId(null); onChanged(); }
  }
  async function remove(id: string) {
    setBusy(true);
    const ok = await api(projectId, "DELETE", null, `?noteId=${encodeURIComponent(id)}`);
    setBusy(false);
    if (ok) onChanged();
  }

  const textareaCls = "w-full text-sm rounded-lg p-2.5 resize-y";
  const textareaStyle = { background: "var(--surface)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", minHeight: 60 } as const;

  // Compact + empty: a near-invisible "Add note" link, no gold box, so a finding
  // stays clean until the researcher actually annotates it (report-feel).
  if (compact && notes.length === 0 && !adding) {
    return (
      <button type="button" onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>
        <Icon.sparkles size={11} /> Add note
      </button>
    );
  }

  return (
    <div className="rounded-lg" style={{ background: "var(--accent-wash)", borderLeft: "3px solid var(--accent-gold)", padding: compact ? "8px 10px" : "12px 14px" }}>
      {!compact && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2 flex items-center gap-1.5" style={{ color: "var(--accent-ink)" }}>
          <Icon.sparkles size={12} /> Researcher Notes
        </p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-2 mb-2">
          {notes.map(n => (
            <li key={n.id}>
              {editingId === n.id ? (
                <div>
                  <textarea className={textareaCls} style={textareaStyle} value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button type="button" disabled={busy} onClick={() => save(n.id)} className="text-[11px] font-semibold" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-[11px]" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="group">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{n.body}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {n.author ? `${n.author} · ` : ""}{formatRelativeTime(n.updated_at)}
                    </span>
                    <button type="button" onClick={() => { setEditingId(n.id); setEditDraft(n.body); }} className="text-[10px] font-semibold" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>Edit</button>
                    <button type="button" disabled={busy} onClick={() => remove(n.id)} className="text-[10px]" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div>
          <textarea autoFocus className={textareaCls} style={textareaStyle} placeholder="Your interpretation — kept separate from the AI, preserved across every regeneration." value={draft} onChange={e => setDraft(e.target.value)} />
          <div className="flex items-center gap-2 mt-1.5">
            <button type="button" disabled={busy || !draft.trim()} onClick={add} className="text-[11px] font-semibold" style={{ color: "var(--accent-ink)", cursor: "pointer", opacity: draft.trim() ? 1 : 0.5 }}>Save note</button>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="text-[11px]" style={{ color: "var(--text-tertiary)", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>
          <Icon.sparkles size={11} /> Add {compact ? "a note" : notes.length ? "another note" : "a note"}
        </button>
      )}
    </div>
  );
}

"use client";

// Shared client-side state machine for the Intelligence review workflow —
// draft → edited → approved → published — reused across every source type
// (Conversation Intelligence today, Survey Intelligence from Phase 1
// onward). Extracted unchanged in behavior from the original conversation
// insights page: same flags, same regenerate-confirm flow, same sequencing.
//
// Deliberately decoupled from any specific API request/response shape via
// the IntelligenceReviewAdapter the caller provides — this hook doesn't
// know or care whether a request body uses "search_id" or "survey_id", so
// existing API routes never need to change to be reused here.
import { useState, useEffect, useCallback } from "react";

export type ReviewStatus = "draft" | "edited" | "approved" | "published";

export type SummaryRow<TReport> = {
  id:             string;
  content:        TReport;
  edited_content: TReport | null;
  status:         ReviewStatus;
  generated_at:   string;
  reviewed_by:    string | null;
  reviewed_at:    string | null;
  published_at:   string | null;
};

type ActionResult<TReport> =
  | { ok: true;  data: SummaryRow<TReport> }
  | { ok: false; error: string; requiresConfirm?: boolean };

export type IntelligenceReviewAdapter<TReport> = {
  fetchCurrent: () => Promise<SummaryRow<TReport> | null>;
  generate:     (confirm: boolean) => Promise<ActionResult<TReport>>;
  saveEdit:     (editedContent: TReport) => Promise<ActionResult<TReport>>;
  approve:      () => Promise<ActionResult<TReport>>;
  publish:      () => Promise<ActionResult<TReport>>;
};

export function useIntelligenceReview<TReport>(
  adapter: IntelligenceReviewAdapter<TReport>,
  // Re-runs `load()` when any of these change (e.g. the source id) — mirrors
  // the original page's `useCallback(..., [id])` dependency.
  deps: readonly unknown[]
) {
  const [row,        setRow]        = useState<SummaryRow<TReport> | null>(null);
  const [draft,      setDraft]      = useState<TReport | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [approving,  setApproving]  = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error,      setError]      = useState("");
  const [confirmRegen, setConfirmRegen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await adapter.fetchCurrent();
    setRow(data);
    setLoading(false);
    // adapter is expected to be stable (defined per-render from stable
    // deps by the caller); re-running is driven by `deps` alone, same as
    // the original page's fetch effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  const current: TReport | null = row ? (row.edited_content ?? row.content) : null;
  const busy = generating || saving || approving || publishing;

  async function generate(confirm = false) {
    setGenerating(true); setError("");
    const result = await adapter.generate(confirm);
    setGenerating(false);
    if (!result.ok) {
      if (result.requiresConfirm) { setConfirmRegen(true); return; }
      setError(result.error);
      return;
    }
    setRow(result.data); setEditing(false); setDraft(null);
  }

  function startEditing() {
    if (!current) return;
    setDraft(current);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(null);
    setEditing(false);
  }

  async function saveEdits() {
    if (!draft) return;
    setSaving(true); setError("");
    const result = await adapter.saveEdit(draft);
    setSaving(false);
    if (result.ok) { setRow(result.data); setEditing(false); setDraft(null); }
    else setError(result.error);
  }

  async function approveSummary() {
    setApproving(true); setError("");
    const result = await adapter.approve();
    setApproving(false);
    if (result.ok) setRow(result.data);
    else setError(result.error);
  }

  async function publishSummary() {
    setPublishing(true); setError("");
    const result = await adapter.publish();
    setPublishing(false);
    if (result.ok) setRow(result.data);
    else setError(result.error);
  }

  return {
    row, draft, editing, loading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
    reload: load,
  };
}

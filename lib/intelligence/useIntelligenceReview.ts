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
//
// `publish` is optional on the adapter (added when the Research Library's
// global document analysis needed this same draft → edited → approved
// workflow, but has no "published" state at all — see
// supabase-migration-101.sql's header comment on why). Every existing
// adapter still provides it and behaves exactly as before; an adapter that
// omits it simply has no publish action, publishSummary() becomes a no-op.
import { useState, useEffect, useCallback, useRef } from "react";

export type ReviewStatus = "draft" | "edited" | "approved" | "published";

export type SummaryRow<TReport> = {
  id:             string;
  content:        TReport;
  edited_content: TReport | null;
  status:         ReviewStatus;
  generated_at:   string;
  /** The row's own last-modified timestamp — bumped by any edit, approve
   * or publish, not just the original generation. Already present on
   * every API response (getSummary/saveDraft/saveEdit/approve/publish all
   * select("*") or return the full updated row), this just declares it on
   * the client-facing type so every report page can show a genuine "Last
   * updated" rather than only ever showing when it was first generated. */
  updated_at:     string;
  reviewed_by:    string | null;
  reviewed_at:    string | null;
  published_at:   string | null;
  /** Set server-side, resolved from the source itself — see
   * lib/intelligence/store.ts's saveDraft(). */
  is_simulated:   boolean;
};

type ActionResult<TReport> =
  | { ok: true;  data: SummaryRow<TReport> }
  | { ok: false; error: string; requiresConfirm?: boolean };

export type IntelligenceReviewAdapter<TReport> = {
  fetchCurrent: () => Promise<SummaryRow<TReport> | null>;
  generate:     (confirm: boolean) => Promise<ActionResult<TReport>>;
  saveEdit:     (editedContent: TReport) => Promise<ActionResult<TReport>>;
  approve:      () => Promise<ActionResult<TReport>>;
  publish?:     () => Promise<ActionResult<TReport>>;
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

  // Single in-flight generation guard. `setGenerating(true)` is async, so it
  // cannot by itself stop two calls that arrive in the same tick (a rapid
  // double-click, or an auto-generate effect racing the explicit Generate
  // button) from both reaching `adapter.generate()` and firing duplicate
  // POSTs. This ref flips synchronously, so a second call while one is in
  // flight is a no-op — making `generate()` the one authoritative path no
  // matter how many triggers call it.
  const generatingRef = useRef(false);

  async function generate(confirm = false) {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true); setError("");
    try {
      const result = await adapter.generate(confirm);
      if (!result.ok) {
        if (result.requiresConfirm) { setConfirmRegen(true); return; }
        setError(result.error);
        return;
      }
      setRow(result.data); setEditing(false); setDraft(null);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
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
    if (!adapter.publish) return;
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

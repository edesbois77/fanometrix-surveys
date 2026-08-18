"use client";

// ── Manage → Surveys: operational survey list (owner-scoped) ─────────────────
// A calm, scannable list of the Current Organisation's Studio surveys. Each row
// opens the Survey management detail; it also carries ONE contextual primary
// action + a ••• overflow, derived from the PURE lifecycle matrix
// (surveyListActions) — never four equal buttons. All actions are projections of
// the server-authoritative rules (delete guard, analysis base gate, research
// lock); the same endpoints the detail page uses are called here. Active =
// not archived/not deleted (NOT "currently collecting"); deleted never appears.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, StatusBadge, Skeleton, Button, SegmentedControl, FilterSearch } from "@/app/components/workspace-ui";
import type { Tone } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";
import { relativeResponseLabel, isRealSurvey } from "@/lib/studio/collection-health";
import { surveyListActions, type ListAction } from "@/lib/studio/survey-lifecycle";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";

type SurveyRow = {
  id: string; name: string | null; status: string;
  response_count?: number; live_campaign_count?: number; campaign_count?: number;
  last_response_at?: string | null; is_simulated?: boolean | null; has_analysis?: boolean;
  analysis_eligible?: boolean; analysis_reason?: string | null;
};

type ListView = "active" | "archived" | "all";

function listBadge(s: SurveyRow): { label: string; tone: Tone } {
  if (s.status === "archived") return { label: "Archived", tone: "warning" };
  if ((s.live_campaign_count ?? 0) > 0) return { label: "Live", tone: "success" };
  if ((s.response_count ?? 0) > 0) return { label: "Closed", tone: "neutral" };
  if (s.status === "ready") return { label: "Ready", tone: "info" };
  return { label: "Draft", tone: "neutral" };
}

const ACTION_LABEL: Record<ListAction, string> = {
  open: "Open", edit: "Edit", analyse: "Analyse", regenerate: "Regenerate analysis",
  "view-findings": "View findings", archive: "Archive", restore: "Restore", delete: "Delete",
};

export function ManageSurveysList() {
  const router = useRouter();
  const [rows, setRows] = useState<SurveyRow[] | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [view, setView] = useState<ListView>("active");
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SurveyRow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/surveys")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (cancelled) return;
        const list = ((j.data ?? []) as SurveyRow[])
          .filter((s) => s.status !== "deleted" && isRealSurvey(s))
          .sort((a, b) => String(b.last_response_at ?? "").localeCompare(String(a.last_response_at ?? "")));
        setRows(list);
      })
      .catch(() => setRows([]));
    return () => { cancelled = true; };
  }, [reloadKey]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clock seed
  useEffect(() => { setNowMs(Date.now()); }, []);

  const archivedCount = useMemo(() => (rows ?? []).filter((s) => s.status === "archived").length, [rows]);
  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (view === "active") list = list.filter((s) => s.status !== "archived");
    else if (view === "archived") list = list.filter((s) => s.status === "archived");
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((s) => (s.name ?? "").toLowerCase().includes(q));
    return list;
  }, [rows, view, query]);

  const openDetail = (id: string) => router.push(`/survey-studio/manage/surveys/${id}`);

  async function doAction(action: ListAction, s: SurveyRow) {
    setMenuId(null); setBanner(null);
    switch (action) {
      case "open": openDetail(s.id); return;
      case "edit": router.push(`/survey-studio/create/${s.id}?stage=about`); return;
      case "view-findings": router.push(`${DISCOVER_BASE}/surveys/${s.id}?view=findings`); return;
      case "delete": setConfirmDelete(s); return;
      case "analyse":
      case "regenerate": {
        setBusyId(s.id);
        try {
          const res = await fetch(`/api/studio/surveys/${s.id}/analysis`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body?.status === "failed" || body?.status === "empty") setBanner(body?.error ?? "Analysis could not be generated.");
        } catch { setBanner("Analysis could not be generated."); }
        setBusyId(null); setReloadKey((k) => k + 1); return;
      }
      case "archive":
      case "restore": {
        setBusyId(s.id);
        try {
          const res = await fetch(`/api/surveys/${s.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _action: action }) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) setBanner(body?.error ?? `Could not ${action} this survey.`);
        } catch { setBanner(`Could not ${action} this survey.`); }
        setBusyId(null); setReloadKey((k) => k + 1); return;
      }
    }
  }

  async function confirmDeleteNow() {
    if (!confirmDelete) return;
    const s = confirmDelete; setBusyId(s.id);
    try {
      const res = await fetch(`/api/surveys/${s.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setBanner(body?.error ?? "This survey could not be deleted.");
    } catch { setBanner("This survey could not be deleted."); }
    setBusyId(null); setConfirmDelete(null); setReloadKey((k) => k + 1);
  }

  if (rows == null) return <div className="space-y-3"><Skeleton className="h-[72px]" /><Skeleton className="h-[72px]" /></div>;

  const controls = (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <SegmentedControl<ListView>
        value={view} onChange={setView}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: archivedCount ? `Archived (${archivedCount})` : "Archived" },
          { value: "all", label: "All" },
        ]}
      />
      <FilterSearch value={query} onChange={setQuery} placeholder="Search surveys…" width={200} />
    </div>
  );

  if (rows.length === 0) {
    return (
      <Card>
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>No surveys yet</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Surveys you create appear here for live monitoring.</p>
        <div className="mt-3"><Button href="/survey-studio/create" variant="primary" size="sm"><StudioIcon.create size={14} /> New survey</Button></div>
      </Card>
    );
  }

  return (
    <div>
      {controls}
      {banner && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-wash, #F7ECE6)", color: "var(--danger-ink, #8A4B33)" }}>{banner}</div>}
      {filtered.length === 0 ? (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {view === "archived" ? "No archived surveys." : query ? "No surveys match your search." : "No surveys in this view."}
        </p></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const badge = listBadge(s);
            const responses = s.response_count ?? 0;
            const campaigns = s.campaign_count ?? 0;
            const live = s.live_campaign_count ?? 0;
            const last = relativeResponseLabel(s.last_response_at ?? null, nowMs ?? 0);
            const acts = surveyListActions({ status: s.status, liveCampaignCount: live, responseCount: responses, analysisEligible: !!s.analysis_eligible, hasAnalysis: !!s.has_analysis });
            const rowBusy = busyId === s.id;
            const primaryLabel = (acts.primary === "analyse" || acts.primary === "regenerate") && rowBusy ? "Generating…"
              : acts.primary ? ACTION_LABEL[acts.primary] : null;
            // Disabled Analyse teaches that analysis unlocks as evidence accumulates.
            const primaryDisabled = rowBusy || acts.primaryDisabled;
            const primaryTitle = acts.primaryDisabled ? (s.analysis_reason ?? undefined) : undefined;
            return (
              <Card key={s.id} interactive>
                <div className="flex items-start justify-between gap-4">
                  {/* Clickable identity — opens the detail. Not a <button> so the
                      quick-action buttons below can be real buttons (no nesting). */}
                  <div role="button" tabIndex={0} onClick={() => openDetail(s.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(s.id); } }}
                    className="min-w-0 flex-1 cursor-pointer focus-visible:outline-none">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{s.name || "Untitled survey"}</h3>
                      <StatusBadge label={badge.label} tone={badge.tone} dot />
                    </div>
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--text-tertiary)" }}>
                      {[
                        `${responses.toLocaleString()} response${responses === 1 ? "" : "s"}`,
                        campaigns ? `${campaigns} campaign${campaigns === 1 ? "" : "s"}${live > 0 ? ` · ${live} live` : ""}` : null,
                        last ? `last response ${last}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  {/* Contextual quick actions (stopPropagation so they never open the row). */}
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {acts.primary && primaryLabel && (
                      <Button
                        variant={acts.primary === "analyse" && !acts.primaryDisabled ? "primary" : "secondary"} size="sm"
                        disabled={primaryDisabled} title={primaryTitle}
                        onClick={() => doAction(acts.primary!, s)}>
                        {primaryLabel}
                      </Button>
                    )}
                    {acts.overflow.length > 0 && (
                      <div className="relative">
                        <button type="button" aria-label="More actions" disabled={rowBusy}
                          onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}
                          className="rounded-lg px-2 py-1.5 text-sm" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>•••</button>
                        {menuId === s.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuId(null); }} />
                            <div className="absolute right-0 mt-1 z-50 w-52 rounded-lg py-1" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-subtle)" }}>
                              {acts.overflow.map((a) => (
                                <button key={a} type="button" onClick={(e) => { e.stopPropagation(); doAction(a, s); }}
                                  className="block w-full text-left px-3 py-2 text-sm"
                                  style={{ color: a === "delete" ? "var(--danger-ink, #8A4B33)" : "var(--text-primary)" }}>
                                  {ACTION_LABEL[a]}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <span className="pt-1.5 pl-0.5" style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.arrowRight size={16} /></span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation (only offered where the lifecycle marks the survey safe). */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,23,0.45)" }} onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[var(--radius-panel)] p-5 md:p-6" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Delete survey?</h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              “{confirmDelete.name || "Untitled survey"}” has never collected research and is not live. This cannot be undone through the normal Survey Studio interface.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id}>Cancel</Button>
              <button type="button" onClick={confirmDeleteNow} disabled={busyId === confirmDelete.id}
                className="text-sm font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60" style={{ background: "var(--danger-ink, #8A4B33)", color: "#fff" }}>
                {busyId === confirmDelete.id ? "Deleting…" : "Delete survey"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

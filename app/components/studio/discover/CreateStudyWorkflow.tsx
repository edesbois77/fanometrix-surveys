"use client";

// ── Discover → Dashboards → Study Builder (Create / Edit) ────────────────────
// "Build a research view from the surveys available to me." A two-column builder:
// selectable survey cards on the left, a live "Your study" summary on the right
// (a compact sticky bottom bar on mobile). Purely presentational over the SAME
// governed workflow: the picker shows ONLY the caller's authorised universe
// (useDashboardsContext), the server independently revalidates every id on submit,
// and membership never grants access. Edit reuses this component unchanged; hidden
// (currently-unauthorised) members are preserved server-side.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceHeader, Button, FilterSearch, PageLoadingState, ErrorState, EmptyState } from "@/app/components/workspace-ui";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";
import { STUDY_MIN_SURVEYS, STUDY_NAME_MAX } from "@/lib/studio/user-study";
import { useStudioBreadcrumbLabel } from "@/app/components/studio/breadcrumb/StudioBreadcrumbContext";
import { useDashboardsContext } from "./useDashboardsContext";
import type { DashboardContext, LandingSurvey } from "@/app/api/survey-studio/discover/dashboards/context/route";

const STUDIES_HREF = `${DISCOVER_BASE}/studies`;
const NAVY = "#0B1929";

function surveyMeta(s: LandingSurvey): string {
  return [
    `${s.questionCount} question${s.questionCount === 1 ? "" : "s"}`,
    `${s.campaignCount} campaign${s.campaignCount === 1 ? "" : "s"}`,
    s.marketCount > 0 ? `${s.marketCount} market${s.marketCount === 1 ? "" : "s"}` : null,
    s.publisherCount > 0 ? `${s.publisherCount} publisher${s.publisherCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
}

// A soft, whole-card-selectable survey (no tiny checkbox target).
function SelectableSurveyCard({ s, on, onToggle }: { s: LandingSurvey; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onToggle}
      className="w-full text-left rounded-[var(--radius-panel)] border p-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)]"
      style={on ? { borderColor: "var(--accent-gold)", background: "var(--accent-wash)" } : { borderColor: "var(--border-default)", background: "var(--surface)" }}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md border flex-shrink-0 transition-colors"
          style={on ? { borderColor: "var(--accent-gold)", background: "var(--accent-gold)" } : { borderColor: "var(--border-default)", background: "var(--surface)" }}>
          {on && <span className="text-[11px] leading-none font-bold" style={{ color: NAVY }}>✓</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{s.name}</span>
          <span className="block text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{surveyMeta(s)}</span>
        </span>
        {on && <span className="text-[10px] font-bold uppercase tracking-[0.06em] flex-shrink-0 mt-0.5" style={{ color: "var(--accent-ink)" }}>Selected</span>}
      </div>
    </button>
  );
}

export function CreateStudyWorkflow({ studyId, previewContext, previewEditing }: {
  studyId?: string;
  previewContext?: DashboardContext;
  previewEditing?: { name: string; memberSurveyIds: string[]; ownerOrganisation?: { id: string; name: string } | null };
}) {
  const router = useRouter();
  const isPreview = previewContext != null;
  const realEditing = !!studyId && !isPreview;   // an actual edit (fetches the study)
  const editing = realEditing || !!previewEditing; // edit-mode UI (heading + CTA + preselect)
  // Create-mode picker source = the CALLER's authorised universe. Edit-mode picker
  // source = the OWNING organisation's universe, returned by the study GET endpoint
  // (so a cross-org operator sees the CLIENT's eligible surveys, not their own).
  const live = useDashboardsContext(undefined, !isPreview && !editing);
  const ctx = isPreview ? { loading: false, error: false, data: previewContext! } : live;

  const [name, setName] = useState(previewEditing?.name ?? "");
  const [loadedName, setLoadedName] = useState(previewEditing?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(previewEditing?.memberSurveyIds ?? []));
  const [editEligible, setEditEligible] = useState<LandingSurvey[] | null>(previewEditing ? (previewContext?.surveys ?? []) : null);
  const [ownerOrg, setOwnerOrg] = useState<{ id: string; name: string } | null>(previewEditing?.ownerOrganisation ?? null);
  const [query, setQuery] = useState("");
  const [seeded, setSeeded] = useState(!realEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Edit mode: seed name + current members + the OWNER org's eligible universe.
  useEffect(() => {
    if (!realEditing || seeded) return;
    let cancelled = false;
    fetch(`/api/survey-studio/discover/dashboards/studies/${studyId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { name: string; memberSurveyIds: string[]; eligibleSurveys: LandingSurvey[]; ownerOrganisation: { id: string; name: string } | null }) => {
        if (!cancelled) { setName(j.name); setLoadedName(j.name); setSelected(new Set(j.memberSurveyIds)); setEditEligible(j.eligibleSurveys ?? []); setOwnerOrg(j.ownerOrganisation ?? null); setSeeded(true); }
      })
      .catch(() => { if (!cancelled) { setError("This study could not be opened for editing."); setSeeded(true); } });
    return () => { cancelled = true; };
  }, [realEditing, seeded, studyId]);

  // Breadcrumb leaf for the /study/[studyId]/edit route → the Study's real name.
  useStudioBreadcrumbLabel(realEditing ? studyId : null, loadedName || null);

  const authorised = useMemo(() => (editing ? (editEligible ?? []) : (ctx.data?.surveys ?? [])), [editing, editEligible, ctx.data]);
  // Only the AUTHORISED members are shown/counted here; hidden members stay server-side.
  const visibleSelected = useMemo(() => authorised.filter((s) => selected.has(s.id)), [authorised, selected]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => authorised.filter((s) => !q || s.name.toLowerCase().includes(q)), [authorised, q]);

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const title = editing ? "Edit study" : "Create study";
  const ownerLine = ownerOrg ? `Editing this study for ${ownerOrg.name}. Only surveys ${ownerOrg.name} is authorised to access are shown.` : "Group surveys you can access to analyse them together.";
  const header = <WorkspaceHeader eyebrow="Discover · Dashboards" title={title} description={ownerLine} />;

  if ((!editing && ctx.loading) || (realEditing && !seeded)) return <>{header}<div className="mt-8"><PageLoadingState lines={2} /></div></>;
  if (!editing && (ctx.error || !ctx.data)) return <>{header}<div className="mt-8"><ErrorState title="We couldn't load your surveys" backHref={STUDIES_HREF} backLabel="Back to studies" /></div></>;
  if (authorised.length < STUDY_MIN_SURVEYS && !editing) {
    return <>{header}<div className="mt-8"><EmptyState title="Not enough surveys yet" description={`You need access to at least ${STUDY_MIN_SURVEYS} surveys to create a study.`} action={<Button href={STUDIES_HREF} variant="secondary" size="sm">Back to studies</Button>} /></div></>;
  }

  const count = visibleSelected.length;
  const enough = count >= STUDY_MIN_SURVEYS;
  const hasName = name.trim().length > 0;
  const canSubmit = hasName && enough && !submitting;
  // The one thing still blocking submit (drives the disabled-state hint).
  const blockingHint = !enough ? `Choose at least ${STUDY_MIN_SURVEYS} surveys` : !hasName ? "Add a study name to finish" : null;
  const cta = submitting ? "Saving…" : editing ? "Save changes" : "Create study";
  const countLabel = count === 0 ? `Choose at least ${STUDY_MIN_SURVEYS} surveys`
    : enough ? `${count} survey${count === 1 ? "" : "s"} selected`
    : `${count} selected · choose at least ${STUDY_MIN_SURVEYS}`;

  const submit = async () => {
    if (!canSubmit || isPreview) return;
    setSubmitting(true); setError(null);
    try {
      const url = editing ? `/api/survey-studio/discover/dashboards/studies/${studyId}` : `/api/survey-studio/discover/dashboards/studies`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), surveyIds: visibleSelected.map((s) => s.id) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || "Could not save the study."); setSubmitting(false); return; }
      const targetId = editing ? studyId : (json?.studyId as string);
      router.push(`${STUDIES_HREF}/${encodeURIComponent(targetId!)}`);
    } catch { setError("Could not save the study."); setSubmitting(false); }
  };

  // Live selected list (shared by the desktop panel and the mobile sheet).
  const selectedList = (
    <ul className="space-y-1">
      {visibleSelected.map((s) => (
        <li key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: "var(--surface)" }}>
          <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>{s.name}</span>
          <button type="button" onClick={() => toggle(s.id)} aria-label={`Remove ${s.name}`} className="flex-shrink-0 w-5 h-5 inline-flex items-center justify-center rounded transition-colors hover:bg-[var(--surface-sunken)]" style={{ color: "var(--text-tertiary)" }}>×</button>
        </li>
      ))}
      {visibleSelected.length === 0 && <li className="text-xs px-2 py-1.5" style={{ color: "var(--text-tertiary)" }}>No surveys selected yet.</li>}
    </ul>
  );

  return (
    <>
      {header}

      <div className="mt-6 pb-28 lg:pb-0">
        {/* Study name — compact, near the top */}
        <div className="max-w-xl">
          <label htmlFor="study-name" className="block text-xs font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Study name</label>
          <input id="study-name" type="text" value={name} maxLength={STUDY_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="e.g. Women's World Cup Study"
            className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)]"
            style={{ background: "var(--surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
        </div>

        {error && <p className="text-sm mt-4" style={{ color: "#B4694C" }}>{error}</p>}

        {/* Builder: available surveys (left) + Your study (right, desktop) */}
        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
          {/* Available surveys */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Available surveys</h2>
              <FilterSearch value={query} onChange={setQuery} placeholder="Search surveys…" width={240} />
            </div>
            <div className="space-y-2">
              {shown.map((s) => <SelectableSurveyCard key={s.id} s={s} on={selected.has(s.id)} onToggle={() => toggle(s.id)} />)}
              {shown.length === 0 && <div className="rounded-[var(--radius-panel)] border px-4 py-8 text-center text-xs" style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}>No surveys match your search.</div>}
            </div>
          </section>

          {/* Your study — desktop sticky panel */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-6 rounded-[var(--radius-panel)] border p-4" style={{ borderColor: "#ECDCB8", background: "var(--accent-wash)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>Your study{ownerOrg ? ` · for ${ownerOrg.name}` : ""}</p>
              <p className="text-base font-bold mt-1 leading-snug break-words" style={{ color: name.trim() ? "var(--text-primary)" : "var(--text-tertiary)" }}>{name.trim() || "Untitled study"}</p>
              <p className="text-xs mt-1 fx-tabular-nums" style={{ color: enough ? "var(--accent-ink)" : "var(--text-tertiary)" }}>{countLabel}</p>
              <div className="mt-3 max-h-[16rem] overflow-y-auto">{selectedList}</div>
              <div className="mt-4 space-y-2">
                {blockingHint && !submitting && <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--accent-ink)" }}><span aria-hidden>→</span>{blockingHint}</p>}
                <Button variant="primary" size="sm" className="w-full" onClick={submit} disabled={!canSubmit}>{cta}</Button>
                <Button href={STUDIES_HREF} variant="ghost" size="sm" className="w-full">Cancel</Button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Your study — mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t" style={{ background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "0 -4px 16px rgba(11,25,41,0.06)" }}>
        {mobileOpen && count > 0 && (
          <div className="max-h-[40vh] overflow-y-auto px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--accent-wash)" }}>{selectedList}</div>
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {enough && !hasName ? (
            <span className="text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>Add a study name</span>
          ) : (
            <button type="button" onClick={() => count > 0 && setMobileOpen((o) => !o)} className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: enough ? "var(--text-primary)" : "var(--text-tertiary)" }} aria-expanded={mobileOpen} disabled={count === 0}>
              {countLabel}{count > 0 && <span aria-hidden style={{ color: "var(--text-tertiary)" }}>{mobileOpen ? "▾" : "▴"}</span>}
            </button>
          )}
          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>{cta}</Button>
        </div>
      </div>
    </>
  );
}

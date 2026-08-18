"use client";

// ── Manage → Survey → detail (management control centre) ─────────────────────
// The dedicated management page for one survey: what it is, what state it's in,
// whether it has collected research, where it ran, what can safely change, and
// which lifecycle actions apply — with every unavailable action EXPLAINED. This
// is a management surface, not a Discover analytics dashboard. All state,
// truthful campaign universe (Studio + legacy), lock and action permissions come
// from ONE owner-scoped endpoint (/api/studio/surveys/[id]/manage). Edit hands off
// to the existing editor; this page never becomes a second editor. Results and
// (admin) Findings reuse the existing operational components.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioContainer } from "../StudioContainer";
import { useStudioBreadcrumbLabel } from "../breadcrumb/StudioBreadcrumbContext";
import { Card, StatusBadge, Skeleton, Button, SectionHeading, Eyebrow } from "@/app/components/workspace-ui";
import type { Tone } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";
import { relativeResponseLabel } from "@/lib/studio/collection-health";
import type { EffectiveLifecycle, LifecycleTone, SurveyActions } from "@/lib/studio/survey-lifecycle";

// ── Endpoint payload shape (also the preview fixture shape) ──────────────────
type CampaignItem = {
  name: string; slug: string; status: string; publisher: string; market: string;
  language: string; isStudio: boolean; hasData: boolean; responses: number;
};
export type ManageData = {
  survey: {
    id: string; name: string | null; persistedStatus: string;
    description: string | null; topic: string | null; about: Record<string, unknown> | null;
    questions: unknown[]; enabledLanguages: string[]; createdAt: string | null;
    createdBy: string | null; organisationId: string | null;
    study: { id: string; name: string } | null;
  };
  lifecycle: { effective: EffectiveLifecycle; label: string; tone: LifecycleTone };
  flags: { hasLiveCampaign: boolean; hasEvidence: boolean; researchLocked: boolean; lockReason: string | null };
  counts: {
    responses: number; totalCampaigns: number; studioCampaigns: number; legacyCampaigns: number;
    publishers: number; markets: number; questions: number; lastResponseAt: string | null;
  };
  campaigns: CampaignItem[];
  actions: SurveyActions;
  deletion: { deletable: boolean; reason: string | null; campaignsToSoftDelete: number };
};

const num = (n: number) => n.toLocaleString();

// English (source) display text from the localised {lang: text} shape, or a flat string.
function enText(t: unknown): string {
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (typeof t === "object") {
    const rec = t as Record<string, string>;
    return rec.en ?? rec[Object.keys(rec)[0]] ?? "";
  }
  return String(t);
}

const CAMPAIGN_TONE: Record<string, Tone> = {
  draft: "neutral", scheduled: "info", live: "success", paused: "warning", closed: "neutral", archived: "neutral",
};

// ── Small confirm modal (local, dependency-free) ─────────────────────────────
function ConfirmModal({ open, title, body, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string;
  tone?: "primary" | "danger"; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,23,0.45)" }} onClick={onCancel} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[var(--radius-panel)] p-5 md:p-6" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <div className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{body}</div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="text-sm font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
            style={tone === "danger"
              ? { background: "var(--danger-ink, #8A4B33)", color: "#fff" }
              : { background: "var(--accent-gold)", color: "var(--accent-ink)" }}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Analysis header-action state (from /api/studio/surveys/[id]/analysis).
export type AnalysisActionState = { eligible: boolean; reason: string | null; generatedAt: string | null; busy: boolean } | null;

// ── The presentational management view (shared with the preview) ─────────────
export function SurveyManagementView({ data, nowMs, analysis, onEdit, onAnalyse, onArchive, onRestore, onDelete, onViewInDiscover }: {
  data: ManageData;
  nowMs: number | null;
  analysis?: AnalysisActionState;
  onEdit?: () => void;
  onAnalyse?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onViewInDiscover?: () => void;
}) {
  const { survey, lifecycle, flags, counts, campaigns, actions, deletion } = data;
  // Analyse header action — truthful state from the authoritative endpoint.
  const analyseLabel = analysis?.busy ? "Generating…" : analysis?.generatedAt ? "Regenerate analysis" : "Analyse";
  const analyseDisabled = !!analysis && (analysis.busy || !analysis.eligible);
  const analyseTitle = analysis && !analysis.eligible && analysis.reason ? analysis.reason : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const last = relativeResponseLabel(counts.lastResponseAt, nowMs ?? 0);

  // Restrained summary line — only metrics we can truthfully resolve.
  const summary = [
    `${num(counts.responses)} response${counts.responses === 1 ? "" : "s"}`,
    counts.totalCampaigns ? `${num(counts.totalCampaigns)} campaign${counts.totalCampaigns === 1 ? "" : "s"}` : null,
    counts.publishers ? `${num(counts.publishers)} publisher${counts.publishers === 1 ? "" : "s"}` : null,
    counts.markets ? `${num(counts.markets)} market${counts.markets === 1 ? "" : "s"}` : null,
    last ? `last response ${last}` : null,
  ].filter(Boolean).join(" · ");

  // Status & rules — the effective state, in plain language. Kept calm: the
  // lifecycle badge already carries the colour, so the card only lightly tints
  // (info) when the state is worth noting, and stays plain for an editable draft.
  const ruleTone: "info" | "warning" | "success" | undefined =
    lifecycle.effective === "archived" || flags.hasLiveCampaign || flags.researchLocked ? "info" : undefined;
  const ruleText =
    lifecycle.effective === "archived"
      ? "This survey is archived. Its research and historical data are preserved and it stays available in Discover where you remain data-entitled."
      : flags.hasLiveCampaign
        ? "This survey is currently collecting responses. Its questions and answer options are locked. Stop collection before archiving it."
        : flags.researchLocked
          ? "This survey has collected responses. Its research definition is locked to protect the integrity of the existing results. You can still edit non-research metadata."
          : "This survey has not collected responses. Its questionnaire can still be edited.";

  const overflowActions: Array<{ label: string; onClick?: () => void; danger?: boolean; disabledReason?: string | null }> = [];
  if (actions.canDelete) overflowActions.push({ label: "Delete survey", onClick: onDelete, danger: true });
  else if (actions.deleteBlockedReason) overflowActions.push({ label: "Delete survey", disabledReason: actions.deleteBlockedReason });

  return (
    <>
      <Button
        href={survey.study ? `/survey-studio/manage/studies/${survey.study.id}` : "/survey-studio/manage?view=surveys"}
        variant="ghost" size="sm" className="mb-3"
      >← {survey.study ? survey.study.name : "All surveys"}</Button>

      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>{survey.study ? "Survey Studio · Study survey" : "Survey Studio · Manage"}</Eyebrow>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>{survey.name || "Untitled survey"}</h1>
            <StatusBadge label={lifecycle.label} tone={lifecycle.tone} dot size="md" />
          </div>
          <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>{summary}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
            {onViewInDiscover && (
              <button type="button" onClick={onViewInDiscover} className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent-ink)" }}>
                View in Discover <StudioIcon.arrowRight size={12} />
              </button>
            )}
            {analysis?.generatedAt && (
              <span style={{ color: "var(--text-tertiary)" }}>· Analysis generated {new Date(analysis.generatedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions.canEditMetadata && (
            <Button variant="secondary" size="sm" onClick={onEdit}>Edit survey</Button>
          )}
          {analysis && onAnalyse && lifecycle.effective !== "archived" && (
            <Button variant={analysis.generatedAt ? "secondary" : "primary"} size="sm" onClick={onAnalyse} disabled={analyseDisabled} title={analyseTitle}>{analyseLabel}</Button>
          )}
          {actions.canRestore && (
            <Button variant="secondary" size="sm" onClick={onRestore}>Restore survey</Button>
          )}
          {actions.canArchive && (
            <Button variant="secondary" size="sm" onClick={onArchive}>Archive survey</Button>
          )}
          {!actions.canArchive && actions.archiveBlockedReason && (
            <Button variant="secondary" size="sm" disabled title={actions.archiveBlockedReason}>Archive survey</Button>
          )}
          {overflowActions.length > 0 && (
            <div className="relative">
              <button type="button" aria-label="More actions" onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg px-2 py-1.5 text-sm" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>•••</button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-50 w-56 rounded-lg py-1" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-subtle)" }}>
                    {overflowActions.map((a) => (
                      <button key={a.label} type="button" disabled={!a.onClick}
                        onClick={() => { setMenuOpen(false); a.onClick?.(); }}
                        className="block w-full text-left px-3 py-2 text-sm disabled:cursor-default"
                        style={{ color: a.onClick ? (a.danger ? "var(--danger-ink, #8A4B33)" : "var(--text-primary)") : "var(--text-disabled)" }}>
                        {a.label}
                        {a.disabledReason && <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{a.disabledReason}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 1. Status & management rules */}
      <div className="mt-5">
        <Card tone={ruleTone} padding="md">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{ruleText}</p>
        </Card>
      </div>

      {/* 2. Survey overview (management facts) */}
      <div className="mt-6">
        <SectionHeading title="Overview" className="mb-3" />
        <Card padding="md">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {[
              ["Status", `${lifecycle.label}${survey.persistedStatus && survey.persistedStatus !== lifecycle.effective ? ` (${survey.persistedStatus})` : ""}`],
              ["Questions", num(counts.questions)],
              ["Responses", num(counts.responses)],
              ["Campaigns", `${num(counts.totalCampaigns)}${counts.legacyCampaigns ? ` · ${counts.legacyCampaigns} legacy` : ""}`],
              ["Publishers", counts.publishers ? num(counts.publishers) : "—"],
              ["Markets", counts.markets ? num(counts.markets) : "—"],
              ["Created", survey.createdAt ? new Date(survey.createdAt).toLocaleDateString() : "—"],
              ["Last response", last ?? "None yet"],
              ["Study", survey.study ? survey.study.name : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{k}</dt>
                <dd className="mt-0.5 font-medium truncate" style={{ color: "var(--text-primary)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* 3. Questions (read-only; locked explanation when applicable) */}
      <div className="mt-6">
        <SectionHeading
          title="Questions"
          description={flags.researchLocked ? "Read-only — the research definition is locked." : "The questionnaire. Use Edit survey to change it."}
          className="mb-3"
        />
        {survey.questions.length === 0 ? (
          <Card padding="md"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No questions yet.</p></Card>
        ) : (
          <div className="space-y-2.5">
            {survey.questions.map((q, i) => {
              const qq = (q ?? {}) as { text?: unknown; options?: unknown[] };
              const opts = Array.isArray(qq.options) ? qq.options : [];
              return (
                <Card key={i} padding="md">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Q{i + 1}.</span> {enText(qq.text) || "Untitled question"}
                  </p>
                  {opts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {opts.map((o, j) => (
                        <li key={j} className="text-sm flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--border-default)" }} aria-hidden />
                          {enText((o as { text?: unknown })?.text) || "Option"}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Campaigns — TRUTHFUL universe (Studio + legacy) */}
      <div className="mt-6">
        <SectionHeading
          title="Campaigns"
          description={`${num(counts.totalCampaigns)} associated with this survey${counts.legacyCampaigns ? ` (${counts.legacyCampaigns} legacy, read-only)` : ""}.`}
          className="mb-3"
        />
        {campaigns.length === 0 ? (
          <Card padding="md"><p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No campaigns associated with this survey.</p></Card>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-panel)] border" style={{ borderColor: "var(--border-default)" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)" }}>
                  {["Campaign", "Type", "Status", "Publisher", "Market", "Responses"].map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.slug} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" style={{ color: "var(--text-primary)" }}>{c.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[11px] px-1.5 py-0.5 rounded" style={c.isStudio
                        ? { background: "var(--accent-wash)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
                        {c.isStudio ? "Studio" : "Legacy"}
                      </span>
                    </td>
                    <td className="px-3 py-2"><StatusBadge label={c.status} tone={CAMPAIGN_TONE[c.status] ?? "neutral"} dot /></td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{c.publisher}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{c.market}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{num(c.responses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. About / metadata */}
      <div className="mt-6">
        <SectionHeading
          title="About & metadata"
          description="Safe, non-research details."
          action={actions.canEditMetadata ? <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button> : undefined}
          className="mb-3"
        />
        <Card padding="md">
          <dl className="space-y-3 text-sm">
            {[
              ["Objective / description", survey.description],
              ["Topic", survey.topic],
              ["Languages", survey.enabledLanguages.length ? survey.enabledLanguages.join(", ") : null],
              ["Owner", survey.createdBy],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-[11px] uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{k}</dt>
                <dd className="mt-0.5" style={{ color: v ? "var(--text-primary)" : "var(--text-tertiary)" }}>{(v as string) || "Not set"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* 6. Danger zone */}
      {(actions.canDelete || actions.deleteBlockedReason || lifecycle.effective !== "archived") && (
        <div className="mt-8 pt-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Danger zone</h2>
          <div className="mt-3">
            <Card padding="md">
              {actions.canDelete ? (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Delete survey</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      Never collected research and not live{deletion.campaignsToSoftDelete > 0 ? ` — also removes ${deletion.campaignsToSoftDelete} unused campaign configuration${deletion.campaignsToSoftDelete === 1 ? "" : "s"}` : ""}.
                    </p>
                  </div>
                  <button type="button" onClick={onDelete}
                    className="text-sm font-semibold rounded-lg px-3 py-1.5"
                    style={{ border: "1px solid var(--danger-line, #E8D2C4)", color: "var(--danger-ink, #8A4B33)" }}>Delete survey</button>
                </div>
              ) : actions.deleteBlockedReason ? (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Delete unavailable</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{actions.deleteBlockedReason}</p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No destructive actions available for this survey.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

// ── Container: fetch, wire lifecycle + analysis actions ──────────────────────
export function ManageSurveyDetail({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ManageData | null | "error">(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<null | "archive" | "restore" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Analysis state (from the authoritative endpoint) — the ONLY model trigger.
  const [analysisMeta, setAnalysisMeta] = useState<{ currentGeneratedAt: string | null; eligible: boolean; reason: string | null } | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisKey, setAnalysisKey] = useState(0);
  useStudioBreadcrumbLabel(surveyId, data && data !== "error" ? data.survey.name : null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/surveys/${surveyId}/manage`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (!cancelled) setData(j as ManageData); })
      .catch(() => { if (!cancelled) setData("error"); });
    return () => { cancelled = true; };
  }, [surveyId, reloadKey]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/surveys/${surveyId}/analysis`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setAnalysisMeta(j); })
      .catch(() => { if (!cancelled) setAnalysisMeta(null); });
    return () => { cancelled = true; };
  }, [surveyId, analysisKey]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clock seed
  useEffect(() => { setNowMs(Date.now()); }, []);

  async function runAnalyse() {
    setAnalysisBusy(true); setBanner(null);
    try {
      const res = await fetch(`/api/studio/surveys/${surveyId}/analysis`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setBanner(body?.error ?? "Analysis could not be generated.");
      else if (body?.status === "failed") setBanner(body?.error ?? "Analysis could not be completed — your previous analysis is unchanged.");
      else if (body?.status === "empty") setBanner(body?.error ?? "Not enough answers to analyse yet.");
    } catch { setBanner("Analysis could not be generated."); }
    setAnalysisBusy(false); setAnalysisKey((k) => k + 1);
  }

  async function runAction(kind: "archive" | "restore" | "delete") {
    setBusy(true); setBanner(null);
    try {
      const res = kind === "delete"
        ? await fetch(`/api/surveys/${surveyId}`, { method: "DELETE" })
        : await fetch(`/api/surveys/${surveyId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _action: kind }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setBanner(body?.error ?? "That action could not be completed."); setBusy(false); setConfirm(null); return; }
      setBusy(false); setConfirm(null);
      if (kind === "delete") { router.push("/survey-studio/manage?view=surveys"); return; }
      setData(null); setReloadKey((k) => k + 1);
    } catch {
      setBanner("That action could not be completed."); setBusy(false); setConfirm(null);
    }
  }

  if (data == null) {
    return <StudioContainer><Skeleton className="h-7 w-64 mb-4" /><Skeleton className="h-40 w-full max-w-3xl" /></StudioContainer>;
  }
  if (data === "error") {
    return (
      <StudioContainer>
        <div className="max-w-md py-6">
          <Eyebrow className="mb-1.5">Survey Studio · Manage</Eyebrow>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Survey not found</h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>This survey could not be opened, or it belongs to another organisation.</p>
          <Button href="/survey-studio/manage?view=surveys" variant="secondary" size="sm" className="mt-4">← Back to Manage</Button>
        </div>
      </StudioContainer>
    );
  }

  const goEdit = () => router.push(`/survey-studio/create/${surveyId}?stage=about`);

  return (
    <StudioContainer>
      {banner && (
        <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-wash, #F7ECE6)", color: "var(--danger-ink, #8A4B33)" }}>{banner}</div>
      )}

      <SurveyManagementView
        data={data} nowMs={nowMs}
        analysis={analysisMeta ? { eligible: analysisMeta.eligible, reason: analysisMeta.reason, generatedAt: analysisMeta.currentGeneratedAt, busy: analysisBusy } : null}
        onEdit={goEdit}
        onAnalyse={runAnalyse}
        onArchive={() => setConfirm("archive")}
        onRestore={() => setConfirm("restore")}
        onDelete={() => setConfirm("delete")}
        onViewInDiscover={() => router.push(`/survey-studio/discover/surveys/${surveyId}?view=findings`)}
      />

      <ConfirmModal
        open={confirm === "archive"} title="Archive survey?"
        body="The survey and all its research, campaigns and historical data are preserved. It moves out of your Active list and can be restored at any time."
        confirmLabel="Archive survey" busy={busy}
        onConfirm={() => runAction("archive")} onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "restore"} title="Restore survey?"
        body="This survey returns to your Active list. Nothing about its research or history changes."
        confirmLabel="Restore survey" busy={busy}
        onConfirm={() => runAction("restore")} onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "delete"} title="Delete survey?" tone="danger"
        body={
          <>
            This survey has never collected research and is not live.
            {data.deletion.campaignsToSoftDelete > 0 && <> Deleting it will also remove {data.deletion.campaignsToSoftDelete} unused campaign configuration{data.deletion.campaignsToSoftDelete === 1 ? "" : "s"}.</>}
            {" "}This cannot be undone through the normal Survey Studio interface.
          </>
        }
        confirmLabel="Delete survey" busy={busy}
        onConfirm={() => runAction("delete")} onCancel={() => setConfirm(null)}
      />
    </StudioContainer>
  );
}

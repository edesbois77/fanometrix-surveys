"use client";

// ── CreateWorkspace — the reusable Create workspace (Phase 1) ────────────────
// One workspace for both a NEW draft and an EXISTING survey
// (/survey-studio/create/[surveyId]), composed over the existing survey
// persistence (GET/PUT /api/surveys/[id]) — no new draft object, no second
// editor. Phase 1 adds the real About form; the other four stages remain
// restrained placeholders.
//
// The header is deliberately COMPACT (survey name as a small title + autosave
// status) so it never becomes tall permanent chrome — the editable Survey name
// now lives inside the About form, not the header. Autosave persists Survey name
// (surveys.name), About research context (surveys.about jsonb) and required
// languages (surveys.enabled_languages) together, reusing the Phase 0 autosave
// foundation (debounced, serialised, no-clobber, Saving/Saved/Error).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { StudioContainer } from "../StudioContainer";
import { useStudioBreadcrumbLabel } from "../breadcrumb/StudioBreadcrumbContext";
import { Eyebrow, Card, Skeleton, StatusBadge, Button } from "@/app/components/workspace-ui";
import { CREATE_STAGES, stageHref, type CreateStageKey } from "./create-stages";
import { StageTabs } from "./StageTabs";
import { StudioIcon } from "../studio-icons";
import { useAutosave } from "./useAutosave";
import { AboutStage, type AboutValues, type OrgOption } from "./AboutStage";
import { CreativeStage } from "./CreativeStage";
import { SurveyStage } from "./survey/SurveyStage";
import { CampaignsStage } from "./campaigns/CampaignsStage";
import { DeployStage } from "./deploy/DeployStage";
import { blankQuestion, resolveDeliveryLanguages, type SurveyContent } from "./survey/types";
import { computeLocalisationStatus } from "@/lib/survey-localisation";
import { isThirdPartyPurpose, isPurposeValue, showsCommissionedAttribution, type PurposeValue } from "@/lib/survey-purpose";
import { canCreateCommissionedResearch } from "@/lib/survey-create-capability";
import { summariseSurveyContent, type SurveyContentSummary } from "@/lib/creative-compatibility";
import { inferLanguagesForMarkets } from "@/lib/locales";
import type { LocalisedQuestion, LocalisedText } from "@/lib/survey-locale";

type LoadState = { phase: "loading" } | { phase: "ready" } | { phase: "error"; message: string };

const EMPTY_VALUES: AboutValues = {
  name: "", objective: "", audience: "", markets: [], purpose: "", languages: ["en"],
  brandOrgId: "", agencyOrgId: "",
};

const EMPTY_CONTENT: SurveyContentSummary = {
  questionCount: 0, maxOptionsPerQuestion: 0, maxQuestionChars: 0, maxOptionChars: 0, hasIntro: false,
};

// Defaults for a fresh Studio survey (no persisted questions yet): intro ENABLED
// with SEEDED recommended English copy, one blank question, empty topic. The
// Thank-You is system-owned (mandatory) and is NOT authored/stored here. An
// EXISTING survey reads its stored values instead (see `load`), so legacy surveys
// never gain a phantom intro or lose their authored thank-you. A module-level
// factory keeps blankQuestion()'s Date.now() out of render.
function defaultSurveyContent(): SurveyContent {
  return {
    questions: [blankQuestion()],
    introEnabled: true,
    introTitle: { en: "Football fans deserve a voice." },
    introBody: { en: "Help shape better football experiences by sharing yours." },
    topic: "",
  };
}

// Coerce a jsonb column that should be a LocalisedText map into one, tolerating
// null / legacy plain-string shapes without throwing (keeps pre-migration loads
// safe — an absent new column simply defaults to empty).
function asLocalised(v: unknown): LocalisedText {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as LocalisedText;
  if (typeof v === "string" && v) return { en: v };
  return {};
}

// ── Autosave status pill ─────────────────────────────────────────────────────
// Relative "Saved …" label from the actual successful-save timestamp. Coarse
// buckets so a ~20s refresh reads naturally without per-second churn.
function relativeSaved(now: number, savedAt: number): string {
  const s = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (s < 10) return "Saved just now";
  if (s < 45) return `Saved ${Math.max(15, Math.round(s / 15) * 15)} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `Saved ${h} hour${h === 1 ? "" : "s"} ago`;
}

// The saved-status indicator + an always-available manual Save button. Manual Save
// runs the SAME canonical persistence path as autosave (onSave → saveNow → the CAS
// PUT), so there is no second save implementation. The button stays clickable even
// when everything appears saved (deliberate reassurance); a brief "Saved ✓" flashes
// after a user-requested save, then it returns to "Save" while the timestamp ages.
function SavePanel({
  status, lastSavedAt, onSave,
}: {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  onSave: () => void;
}) {
  // Coarse clock so the "Saved …" label ages. `now` is written only from the
  // interval callback (never synchronously in the effect), so there is no
  // cascading-render setState-in-effect. Until the first tick — and after any newer
  // save (now < lastSavedAt) — the label falls back to "Saved just now".
  const [now, setNow] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const requestedRef = useRef(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "saved" || !lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [status, lastSavedAt]);

  // Flash "Saved ✓" briefly, but only after a save the USER requested (not ambient
  // autosave). The clear is on its own ref timer so a later status change doesn't
  // cancel it; the label priority (below) hides it during saving/error anyway.
  useEffect(() => {
    if (status === "saved" && requestedRef.current) {
      requestedRef.current = false;
      setConfirm(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirm(false), 1500);
    }
  }, [status]);
  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); }, []);

  const handleSave = () => { requestedRef.current = true; onSave(); };

  let statusText: React.ReactNode = null;
  let statusColor = "var(--text-tertiary)";
  if (status === "error") { statusText = "Couldn't save."; statusColor = "#B4694C"; }
  else if (status === "saved") {
    const fresh = now != null && lastSavedAt != null && now >= lastSavedAt ? now : null;
    statusText = fresh != null && lastSavedAt != null ? relativeSaved(fresh, lastSavedAt) : "Saved just now";
  }

  const saving = status === "saving";
  return (
    <div className="flex items-center gap-2.5">
      {statusText && <span className="text-xs" style={{ color: statusColor }}>{statusText}</span>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        aria-label={status === "error" ? "Retry save" : "Save"}
        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-control)] border transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
        style={{ background: "var(--accent-wash)", borderColor: "var(--accent-gold)", color: "var(--accent-ink)" }}
      >
        {saving ? "Saving…" : status === "error" ? "Retry" : confirm ? <><StudioIcon.check size={13} strokeWidth={2.5} /> Saved</> : "Save"}
      </button>
    </div>
  );
}

// ── Per-stage placeholder (Creative/Survey/Campaigns/Deploy — later phases) ──
function StagePlaceholder({ stage }: { stage: CreateStageKey }) {
  const meta = CREATE_STAGES.find((s) => s.key === stage) ?? CREATE_STAGES[0];
  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{meta.label}</h2>
          <p className="text-sm mt-1 max-w-xl leading-relaxed" style={{ color: "var(--text-secondary)" }}>{meta.blurb}</p>
        </div>
        <StatusBadge label="Coming in a later phase" tone="neutral" />
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
        This stage&apos;s form isn&apos;t built yet. You can still move freely between stages — your draft is saved as you go.
      </p>
    </Card>
  );
}

// ── Build the PUT payload from the About values, honouring the guardrail ──────
// `canUseCommissionedPurposes` is the resolved governed Q-10 capability, not a
// role — the same value the server enforces with.
function payloadFor(values: AboutValues, creativeDesign: string | null, canUseCommissionedPurposes: boolean, content: SurveyContent) {
  const blocked = !canUseCommissionedPurposes && isThirdPartyPurpose(values.purpose);
  const about: Record<string, unknown> = {
    objective: values.objective.trim() || null,
    audience: values.audience.trim() || null,
    markets: values.markets,
  };
  // Never persist a third-party purpose for a non-admin — it stays client-side
  // only (the About form shows the Request redirect). The server enforces this
  // too (defence in depth).
  if (!blocked && values.purpose) about.purpose = values.purpose;
  const payload: Record<string, unknown> = {
    name: values.name,
    about,
    enabled_languages: values.languages.length ? values.languages : ["en"],
    // Survey-stage journey content (Phase 3). Sent on every autosave so a save
    // triggered from any stage carries the current in-memory journey — matching
    // how About fields are always included. intro_* / thank_you_enabled require
    // migration 182; treated as existing columns per the plan.
    questions: content.questions,
    intro_enabled: content.introEnabled,
    intro_title: content.introTitle,
    intro_body: content.introBody,
    // Short, optional, NON-localised survey subject.
    topic: content.topic.trim() || null,
    // Thank-You is system-owned (mandatory) — the Survey stage authors NO
    // thank_you_* fields, so new Studio surveys never carry thank_you_enabled=false.
  };
  // Only write surveys.creative_design once a Creative is actually chosen. Keeps
  // About autosave independent of this new column, and never writes null over an
  // unmanaged column (there is no "clear creative" action in Phase 2).
  if (creativeDesign) payload.creative_design = creativeDesign;
  // Brand/Agency ATTRIBUTION — persisted only for a commissioned survey; any other
  // purpose writes null, so switching purpose away never leaves stale attribution
  // (the server enforces the same rule). "" → null via the route's uuid guard.
  // Attribution is NOT access — these never affect ownership or permissions.
  if (showsCommissionedAttribution(values.purpose, canUseCommissionedPurposes)) {
    payload.brand_org_id = values.brandOrgId || null;
    payload.agency_org_id = values.agencyOrgId || null;
  } else {
    payload.brand_org_id = null;
    payload.agency_org_id = null;
  }
  return payload;
}

export function CreateWorkspace({
  surveyId,
  stage,
  // Defaults to FALSE on purpose: a caller that forgets to pass it hides the
  // capability rather than exposing it. The safe direction is the default one.
  campaignGroupsEnabled = false,
}: {
  surveyId: string;
  stage: CreateStageKey;
  campaignGroupsEnabled?: boolean;
}) {
  const router = useRouter();
  const { user } = useSession();
  // UX projection of the governed Q-10 capability — consumed from the session,
  // never authored here. The server re-resolves and enforces authoritatively.
  const canUseCommissionedPurposes = canCreateCommissionedResearch(user);

  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [values, setValues] = useState<AboutValues>(EMPTY_VALUES);
  // Breadcrumb leaf for /create/[surveyId] — the draft's name (never the id).
  useStudioBreadcrumbLabel(surveyId, state.phase === "loading" ? null : (values.name.trim() || "Untitled survey"));
  const [creativeDesign, setCreativeDesign] = useState<string | null>(null);
  // Read-only summary of the survey's current content, used only to gate an
  // incompatible Creative switch. Populated at load; empty for a fresh draft
  // (the Survey stage that adds content is Phase 3).
  const [surveyContent, setSurveyContent] = useState<SurveyContentSummary>(EMPTY_CONTENT);
  // Editable Survey-stage journey content (Phase 3).
  const [content, setContent] = useState<SurveyContent>(defaultSurveyContent);
  // Research-definition lock signal — locked once the survey holds evidence OR is
  // live (mirrors the server rule; the server remains authoritative).
  const [researchLocked, setResearchLocked] = useState(false);
  // Governed Brand/Agency organisations (type=brand/agency) for the commissioned
  // attribution pickers. Fetched ONCE, and only when the principal may use
  // commissioned purposes (obeys the capability rule; skips the call otherwise).
  // Brands/agencies are global reference data — one batched request supplies both
  // lists (no N+1), and there is no other-org record that could briefly show.
  const [brandOptions, setBrandOptions] = useState<OrgOption[]>([]);
  const [agencyOptions, setAgencyOptions] = useState<OrgOption[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  // Compare-and-swap: the row's last-known updated_at, refreshed from every
  // GET/PUT. Sent as expected_updated_at so a concurrent save in another tab
  // can't silently clobber this one (409 → conflict).
  const lastUpdatedAtRef = useRef<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const touchedRef = useRef(false);
  // Languages the user picked by hand (beyond what the selected markets require).
  // Market-derived languages are added/removed as markets change; these extras
  // persist across those changes. Seeded on load.
  const manualLangsRef = useRef<Set<string>>(new Set());

  // Load the existing survey (governed + org-scoped server-side).
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/surveys/${surveyId}`);
      if (res.status === 403) { setState({ phase: "error", message: "You don't have access to this survey." }); return; }
      if (res.status === 404) { setState({ phase: "error", message: "This survey could not be found." }); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data) { setState({ phase: "error", message: json?.error || "Could not open this survey." }); return; }
      const d = json.data as Record<string, unknown>;
      const about = (d.about ?? {}) as Record<string, unknown>;
      const rawPurpose = about.purpose;
      const loadedMarkets = Array.isArray(about.markets) ? (about.markets as string[]) : [];
      const loadedLanguages = Array.isArray(d.enabled_languages) && d.enabled_languages.length ? (d.enabled_languages as string[]) : ["en"];
      // Seed the manual-language set: any stored language that isn't required by
      // the stored markets is treated as a hand-picked extra (so it survives
      // market changes), including the lone "en" default.
      const requiredOnLoad = new Set(inferLanguagesForMarkets(loadedMarkets));
      manualLangsRef.current = new Set(loadedLanguages.filter((l) => !requiredOnLoad.has(l)));
      setValues({
        name: typeof d.name === "string" ? d.name : "",
        objective: typeof about.objective === "string" ? about.objective : "",
        audience: typeof about.audience === "string" ? about.audience : "",
        markets: loadedMarkets,
        purpose: isPurposeValue(rawPurpose) ? (rawPurpose as PurposeValue) : "",
        languages: loadedLanguages,
        // Governed Brand/Agency attribution — top-level survey columns, not `about`.
        brandOrgId: typeof d.brand_org_id === "string" ? d.brand_org_id : "",
        agencyOrgId: typeof d.agency_org_id === "string" ? d.agency_org_id : "",
      });
      setCreativeDesign(typeof d.creative_design === "string" ? d.creative_design : null);
      setSurveyContent(summariseSurveyContent(d));

      // Survey journey content. A survey with persisted questions is EXISTING —
      // read its stored intro/thank-you flags (legacy null intro → off; legacy
      // thank-you was always shown → on). A survey with no questions is a fresh
      // draft and gets the new-survey defaults.
      const storedQuestions = Array.isArray(d.questions) ? (d.questions as LocalisedQuestion[]) : [];
      if (storedQuestions.length > 0) {
        // EXISTING survey — read its stored intro copy + topic. The Thank-You is
        // system-owned and no longer authored/stored from the Survey stage;
        // historical authored thank-you rows are left untouched in the DB.
        setContent({
          questions: storedQuestions,
          introEnabled: d.intro_enabled === true,
          introTitle: asLocalised(d.intro_title),
          introBody: asLocalised(d.intro_body),
          topic: typeof d.topic === "string" ? d.topic : "",
        });
      } else {
        setContent(defaultSurveyContent());
      }

      setResearchLocked(json.research_locked === true);
      lastUpdatedAtRef.current = typeof d.updated_at === "string" ? d.updated_at : null;
      setConflict(false);
      touchedRef.current = false; // a fresh load is not a user edit
      setState({ phase: "ready" });
    } catch {
      setState({ phase: "error", message: "Could not open this survey." });
    }
  }, [surveyId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  // Load the governed Brand/Agency organisations once, only when the principal may
  // use commissioned purposes (so the pickers can exist). Same open GET the legacy
  // pickers use; filtered by type client-side. No N+1, cancel-safe.
  useEffect(() => {
    if (!canUseCommissionedPurposes) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch lifecycle flag
    setOrgsLoading(true);
    fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const rows = (json?.data ?? []) as { id: string; name: string; type: string }[];
        setBrandOptions(rows.filter((o) => o.type === "brand").map((o) => ({ id: o.id, name: o.name })));
        setAgencyOptions(rows.filter((o) => o.type === "agency").map((o) => ({ id: o.id, name: o.name })));
      })
      .catch(() => {/* leave empty on failure — the pickers show their empty state */})
      .finally(() => { if (!cancelled) setOrgsLoading(false); });
    return () => { cancelled = true; };
  }, [canUseCommissionedPurposes]);

  const save = useCallback(async (payload: ReturnType<typeof payloadFor>) => {
    const res = await fetch(`/api/surveys/${surveyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Compare-and-swap token — the row's last-known updated_at. The server only
      // applies the write when it still matches; a concurrent tab's save advances
      // it and yields a 409.
      body: JSON.stringify({ ...payload, expected_updated_at: lastUpdatedAtRef.current }),
    });
    if (res.status === 409) {
      // Non-destructive: keep this tab's edits, stop autosaving into a moved row,
      // and surface a reload banner. Throw so autosave shows the error state.
      setConflict(true);
      throw new Error("stale_write");
    }
    if (!res.ok) throw new Error("save failed");
    const json = await res.json().catch(() => ({}));
    const ua = json?.data?.updated_at;
    if (typeof ua === "string") lastUpdatedAtRef.current = ua;
  }, [surveyId]);

  // Autosave cadence ≈ once per minute (reassurance comes from the manual Save +
  // the aged timestamp, not per-keystroke writes). Navigation safety is preserved
  // by useAutosave's flush-on-unmount and the explicit saveNow on stage handoff.
  const { status, lastSavedAt, schedule, saveNow } = useAutosave<ReturnType<typeof payloadFor>>({ save, delay: 60_000 });

  // Persist the current draft immediately and resolve when the write completes.
  // Used by the Survey stage to guarantee the English base is saved before a
  // generate-only translate call reads it server-side.
  const persistNow = useCallback(async () => {
    await save(payloadFor(values, creativeDesign, canUseCommissionedPurposes, content));
  }, [save, values, creativeDesign, canUseCommissionedPurposes, content]);

  // Autosave whenever an About OR Survey-journey field changes — but only after a
  // real user edit (never on initial load), so opening a draft doesn't fire a
  // redundant write. A serialised content key covers the nested journey shape.
  const marketsKey = values.markets.join(",");
  const languagesKey = values.languages.join(",");
  const contentKey = JSON.stringify(content);
  useEffect(() => {
    if (state.phase !== "ready" || !touchedRef.current || conflict) return;
    schedule(payloadFor(values, creativeDesign, canUseCommissionedPurposes, content));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.name, values.objective, values.audience, values.purpose, marketsKey, languagesKey, creativeDesign, contentKey, state.phase, canUseCommissionedPurposes, conflict]);

  const handleChange = (patch: Partial<AboutValues>) => {
    touchedRef.current = true;
    setValues((v) => {
      const next = { ...v, ...patch };
      // Reconcile enabled_languages with the markets' governed delivery languages
      // whenever markets OR languages change. The enabled set is always the union
      // of the languages the selected markets require and the user's hand-picked
      // extras — so selecting a market adds its language and DEselecting a market
      // removes it, while a language chosen by hand is never dropped by a market
      // change.
      if (patch.languages) {
        // A manual language edit: the extras are whatever the user now has
        // selected beyond what the current markets require.
        const required = new Set(inferLanguagesForMarkets(v.markets));
        manualLangsRef.current = new Set(patch.languages.filter((l) => !required.has(l)));
      }
      if (patch.markets || patch.languages) {
        const required = inferLanguagesForMarkets(next.markets);
        const merged = [...required];
        for (const l of manualLangsRef.current) if (!merged.includes(l)) merged.push(l);
        next.languages = merged;
      }
      return next;
    });
  };

  const handleContentChange = (patch: Partial<SurveyContent>) => {
    touchedRef.current = true;
    setContent((c) => ({ ...c, ...patch }));
  };

  // Persist a compatible Creative selection (CreativeStage runs the compatibility
  // gate before calling this). Autosaves via the same PUT path as About.
  const handleSelectCreative = (slug: string) => {
    touchedRef.current = true;
    setCreativeDesign(slug);
  };

  const chooseCreative = () => {
    saveNow(payloadFor(values, creativeDesign, canUseCommissionedPurposes, content));
    router.push(stageHref(surveyId, "creative"));
  };

  if (state.phase === "loading") {
    return (
      <StudioContainer>
        <Skeleton className="h-3 w-40 mb-3" />
        <Skeleton className="h-7 w-64 mb-6" />
        <Skeleton className="h-9 w-full mb-6" />
        <Skeleton className="h-64 w-full max-w-[42rem]" />
      </StudioContainer>
    );
  }

  if (state.phase === "error") {
    return (
      <StudioContainer>
        <div className="max-w-md py-6">
          <Eyebrow className="mb-1.5">Survey Studio · Create</Eyebrow>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Can&apos;t open this survey</h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>{state.message}</p>
          <div className="mt-4 flex items-center gap-3">
            <Link href="/survey-studio/create" className="text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>Start a new survey →</Link>
            <Link href="/survey-studio" className="text-sm font-semibold" style={{ color: "var(--text-tertiary)" }}>Back to Home</Link>
          </div>
        </div>
      </StudioContainer>
    );
  }

  // ── Campaigns/Deploy eligibility ────────────────────────────────────────────
  // Progression to Campaigns (and Deploy) requires the Survey's Publisher-authored
  // content to be complete in every required delivery language. This EXTENDS the
  // single existing progression surface (StageTabs) — the first eligibility gate,
  // not a second mechanism. English must pass required-field validation; each
  // required non-English delivery language must be fully translated. The
  // system-owned Thank-You is excluded (centrally translated).
  const deliveryLanguages = resolveDeliveryLanguages(values.markets, values.languages);
  // Languages a selected market requires — locked on in About (deselecting the
  // market is how you remove them). Empty when no markets are selected.
  const requiredLanguages = values.markets.length ? inferLanguagesForMarkets(values.markets) : [];
  const localisation = computeLocalisationStatus(content, deliveryLanguages);
  // An enabled intro screen MUST have a Topic — it's the subject shown on that
  // screen. If the intro is on and the Topic is blank (never set, or later
  // cleared), progression to Campaigns/Deploy is blocked until it's filled or the
  // intro screen is switched off. Checked before translation-completeness so the
  // author sees the structural fix first.
  const introNeedsTopic = content.introEnabled && content.topic.trim().length === 0;
  const campaignsReason =
    !localisation.englishValid
      ? "Finish the Survey first. Every question needs its text and answers before setting up Campaigns."
      : introNeedsTopic
        ? "Your intro screen needs a Topic. Add one in Survey, or turn the intro screen off, before setting up Campaigns."
        : !localisation.allComplete
          ? "Complete every required Survey language before setting up Campaigns."
          : null;
  // Deploy unlocks on the SAME Survey-governance (localisation) gate as Campaigns —
  // not on every Campaign being ready. Per-campaign deployment readiness is handled
  // inside the Deploy stage, so a user can work on individual Campaigns there.
  const stageGates: Partial<Record<CreateStageKey, string | null>> | undefined =
    campaignsReason ? { campaigns: campaignsReason, deploy: campaignsReason } : undefined;

  return (
    <StudioContainer>
      {/* Compact workspace header — survey identity + autosave, not tall chrome. */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>Survey Studio · Create</Eyebrow>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em] leading-tight truncate" style={{ color: "var(--text-primary)" }}>
            {values.name.trim() || "Untitled survey"}
          </h1>
        </div>
        <div className="pt-1"><SavePanel status={status} lastSavedAt={lastSavedAt} onSave={() => saveNow(payloadFor(values, creativeDesign, canUseCommissionedPurposes, content))} /></div>
      </header>

      {/* Multi-tab conflict — non-destructive; this tab's edits are kept. */}
      {conflict && (
        <div className="mt-4 rounded-[var(--radius-control)] px-3 py-2.5 text-sm" style={{ background: "#F9EFEA", border: "1px solid #E8D2C4", color: "#8A4B2F" }} role="status">
          This survey was changed in another tab — reload to continue.
        </div>
      )}

      {/* Local stage navigation. Campaigns/Deploy are gated until the Survey is
          complete in every required language — with a visible explanation. */}
      <StageTabs surveyId={surveyId} active={stage} gates={stageGates} />
      {campaignsReason && (
        // Sit equidistant between the tabs border above and the first stage card
        // below (which is mt-6), so the message is vertically centred in the gap.
        <p className="mt-6 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {campaignsReason}
        </p>
      )}

      {/* Active stage */}
      {stage === "about" ? (
        <AboutStage canUseCommissionedPurposes={canUseCommissionedPurposes} values={values} onChange={handleChange} onChooseCreative={chooseCreative} requiredLanguages={requiredLanguages} brandOptions={brandOptions} agencyOptions={agencyOptions} orgsLoading={orgsLoading} />
      ) : stage === "creative" ? (
        <CreativeStage selectedSlug={creativeDesign} surveyContent={surveyContent} onSelect={handleSelectCreative} />
      ) : stage === "survey" ? (
        <SurveyStage
          surveyId={surveyId}
          creativeDesign={creativeDesign}
          languages={values.languages}
          markets={values.markets}
          researchLocked={researchLocked}
          content={content}
          onContentChange={handleContentChange}
          persistNow={persistNow}
        />
      ) : stage === "campaigns" ? (
        <CampaignsStage surveyId={surveyId} campaignGroupsEnabled={campaignGroupsEnabled} />
      ) : stage === "deploy" ? (
        <DeployStage surveyId={surveyId} campaignGroupsEnabled={campaignGroupsEnabled} />
      ) : (
        <StagePlaceholder stage={stage} />
      )}

      {/* Consistent "next step" progression at the bottom of each tab (About has its
          own "Choose creative"; Deploy is the final stage). The action fades out
          until the stage's mandatory prerequisite is met, with the reason shown. */}
      {(() => {
        const prog =
          stage === "creative" ? { next: "survey" as CreateStageKey, label: "Continue to Survey", enabled: creativeDesign != null, reason: "Select a creative to continue." }
          : stage === "survey" ? { next: "campaigns" as CreateStageKey, label: "Continue to Campaigns", enabled: campaignsReason == null, reason: campaignsReason }
          : stage === "campaigns" ? { next: "deploy" as CreateStageKey, label: "Continue to Deploy", enabled: campaignsReason == null, reason: campaignsReason }
          : null;
        if (!prog) return null;
        return (
          <div className="mt-10 pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <Button variant="primary" size="md" disabled={!prog.enabled} onClick={() => router.push(stageHref(surveyId, prog.next))}>
              {prog.label} <StudioIcon.arrowRight size={15} />
            </Button>
            {!prog.enabled && prog.reason && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{prog.reason}</span>
            )}
          </div>
        );
      })()}
    </StudioContainer>
  );
}

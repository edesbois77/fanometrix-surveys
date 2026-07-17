"use client";

// The canonical Survey Editor — the single, reusable survey-editing experience
// for the whole of Fanometrix. Both the standalone Surveys area and a Research
// Project mount THIS exact component; only the surrounding shell (a drawer vs a
// full page) and the post-save behaviour (`onSaved`) differ. One survey, one
// editor, one API (/api/surveys), no duplicated logic.
//
// Scope — everything needed to DEFINE a survey lives here:
//   • Basic information (name via NameBuilder, description, status, template)
//   • Questions & answers (per-language, char-limited, add/remove/reorder)
//   • Languages (add/remove + auto-translate from English)
//   • Thank-you screen
//   • Validation (+ auto-downgrade Ready→Draft when invalid)
//   • Save
// Deliberately OUTSIDE this editor: Campaigns / Campaign Groups / Deployment /
// scheduling / running (→ Execution), and Survey Intelligence (→ Analysis).
//
// This is a behaviour-preserving extraction of the editor drawer that used to
// live inline in app/survey-templates/page.tsx — the persistence, validation,
// translation and auto-downgrade logic are unchanged. The one seam is `onSaved`:
// after a successful save the editor hands control back to the mounting shell
// (attach-to-project / return / refresh the list) rather than owning navigation.
//
// Presentation is the shared Research UI v2 language (Card + SectionHeading,
// token inputs, Button) so Survey, Conversation and Library feel like one
// product. Only the fields specific to a survey differ.
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { validateSurvey, SURVEY_LIMITS } from "@/lib/survey-validation";
import {
  SUPPORTED_LANGUAGES, findLanguageMatches, getCompletedLanguages,
  type LangCode, type LocalisedQuestion, type LocalisedText, type LanguageOption,
} from "@/lib/survey-locale";
import { STUDY_TYPES, STUDY_TYPE_LABELS } from "@/lib/naming";
import { Card, SectionHeading, Button, Icon } from "@/app/components/workspace-ui";

const { MAX_QUESTIONS, MAX_OPTIONS, MAX_Q_CHARS, MAX_OPT_CHARS, MAX_TY_TITLE, MAX_TY_BODY } = SURVEY_LIMITS;

// Over-limit accent (matches the UI v2 danger ink used elsewhere).
const ERR_BORDER = "#DC2626";

type Question = LocalisedQuestion;

// Content-only fields for the editor (mirrors the survey record's editable shape).
export type EditFields = {
  name:           string;
  description:    string | null;
  brand_org_id:   string;
  agency_org_id:  string;
  topic:          string;
  study_type:     string;
  questions:      Question[];
  thank_you_title: LocalisedText;
  thank_you_body:  LocalisedText;
  enabled_languages: string[];
  status:          "draft" | "ready";
  is_template:     boolean;
};

// A minimal shape for the saved survey handed back to the shell via onSaved.
export type SavedSurvey = { id: string; name: string; status: string };

export type SurveyEditorSaved = { survey: SavedSurvey; isCreate: boolean; autoDowngraded: boolean };

const BLANK_Q = (): Question => ({
  id:      `q${Date.now()}`,
  text:    { en: "" },
  // Every question always shows the full set of answer inputs (no "add option").
  options: Array.from({ length: MAX_OPTIONS }, (_, i) => ({ id: i + 1, text: { en: "" } })),
});

// Pads a stored question up to MAX_OPTIONS answer inputs (older surveys may have
// been saved with fewer) so all answers are always visible and editable.
function padOptions(q: Question): Question {
  const opts = q.options.slice(0, MAX_OPTIONS);
  while (opts.length < MAX_OPTIONS) opts.push({ id: opts.length + 1, text: { en: "" } });
  return { ...q, options: opts.map((o, i) => ({ ...o, id: i + 1 })) };
}

export const BLANK_FIELDS: EditFields = {
  name: "", description: "", brand_org_id: "", agency_org_id: "", topic: "", study_type: "custom",
  questions: [BLANK_Q()],
  thank_you_title: { en: "Thank you!" },
  thank_you_body: { en: "Your response has been recorded." },
  enabled_languages: ["en"],
  status: "draft", is_template: false,
};

// ── Shared UI v2 form primitives (mirror SearchConfigForm / the Research pages) ─
const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };
// A char-limited input keeps a red border when over the limit, even unfocused.
const blurFor = (over: boolean) => (e: React.FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = over ? ERR_BORDER : "var(--border-default)";
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}

function CharCount({ len, max }: { len: number; max: number }) {
  const over = len > max;
  const near = len > max * 0.85;
  return (
    <span className="text-xs tabular-nums" style={{ color: over ? ERR_BORDER : near ? "#B45309" : "var(--text-tertiary)", fontWeight: over ? 600 : 400 }}>
      {len} / {max}
    </span>
  );
}

function AddLanguageButton({ enabledLanguages, onAdd }: {
  enabledLanguages: string[];
  onAdd: (lang: LanguageOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = findLanguageMatches(query, enabledLanguages);

  function pick(lang: LanguageOption) {
    onAdd(lang);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-xs px-2.5 py-1 rounded-full border border-dashed transition-colors"
        style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-gold)"; e.currentTarget.style.color = "var(--text-primary)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
        + Add language
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-64 p-2" style={{ background: "var(--surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-panel)", boxShadow: "var(--shadow-md)" }}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onFocus={focusGold} onBlur={blurGold}
            placeholder="Type a country or language…"
            className="w-full px-2.5 py-1.5 text-sm outline-none transition-colors" style={inputStyle} />
          {query.trim() && (
            <div className="mt-1 max-h-48 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No matching language found.</p>
              ) : (
                matches.map(lang => (
                  <button key={lang.code} type="button" onClick={() => pick(lang)}
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between"
                    style={{ color: "var(--text-primary)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-sunken)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <span>{lang.label} <span style={{ color: "var(--text-tertiary)" }}>· {lang.nativeLabel}</span></span>
                    {!lang.autoTranslatable && <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>manual</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── The editor ────────────────────────────────────────────────────────────────
export function SurveyEditor({
  surveyId, initialFields, isSimulated, layout = "drawer", onSaved, onCancel, onRecordLabel,
}: {
  /** Edit an existing survey; omit to create a new one. */
  surveyId?: string;
  /** Prefill for create (e.g. a project's topic / brand / study type). */
  initialFields?: Partial<EditFields>;
  /** Create-for-project provenance — stamps is_simulated on the NEW survey. */
  isSimulated?: boolean;
  /** "drawer" = sticky footer inside a scrolling panel; "page" = inline flow. */
  layout?: "drawer" | "page";
  /** Called after a successful save — the shell owns what happens next. */
  onSaved: (result: SurveyEditorSaved) => void;
  onCancel: () => void;
  /** Surfaces the survey name to the surrounding shell (in-project breadcrumb). */
  onRecordLabel?: (label: string | null) => void;
}) {
  const [fields, setFields] = useState<EditFields>(() => {
    const base = { ...BLANK_FIELDS, questions: [BLANK_Q()], ...initialFields } as EditFields;
    return { ...base, questions: (base.questions?.length ? base.questions : [BLANK_Q()]).map(padOptions) };
  });
  // True once the user has attempted a save — drives the red "all answers
  // required" highlighting so it never shows before the first save attempt.
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [editingOriginalStatus, setEditingOriginalStatus] = useState<"draft" | "ready" | "archived" | "deleted" | null>(null);
  const [loading, setLoading] = useState(!!surveyId);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editorLang, setEditorLang] = useState<LangCode>("en");
  const [translating, setTranslating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  // Which char-limited field currently has focus (by key) — drives whether its
  // character counter is shown. Null = nothing focused.
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type: string }[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<{ id: string; project_name: string }[]>([]);
  const loadedRef = useRef<string | null>(null);
  // Guards against the save handler firing more than once (double-click, a
  // re-fired onClick) — so a save runs, and toasts, exactly once.
  const savingRef = useRef(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // Orgs for the NameBuilder (brand / agency pickers).
  useEffect(() => {
    fetch("/api/organisations").then(r => r.json()).then(json => setOrgs(json.data ?? [])).catch(() => {});
  }, []);

  // Surface the (live) name to the workspace breadcrumb (no-op when standalone).
  useEffect(() => {
    onRecordLabel?.(surveyId ? (fields.name || "Survey") : (fields.name || "New survey"));
    return () => onRecordLabel?.(null);
  }, [fields.name, surveyId, onRecordLabel]);

  // Brand / agency options for the identity dropdowns. `is_template` stays in
  // state (loaded on edit, defaulting false on create) and is still sent to the
  // API — template capability is intact platform-wide; it's just no longer part
  // of this editor's UI. Likewise `topic` is preserved on the record but no
  // longer edited here.
  const brandOrgs = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const agencyOrgs = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);

  // Edit mode: load the survey and prefill; also read (read-only) which
  // Research Projects currently point at it as evidence.
  useEffect(() => {
    if (!surveyId || loadedRef.current === surveyId) return;
    loadedRef.current = surveyId;
    (async () => {
      const res = await fetch(`/api/surveys/${surveyId}`);
      if (!res.ok) { setLoading(false); return; }
      const { data: s } = await res.json();
      setEditingOriginalStatus(s.status);
      setFields({
        name:           s.name,
        description:    s.description,
        brand_org_id:   s.brand_org_id ?? "",
        agency_org_id:  s.agency_org_id ?? "",
        topic:          s.topic ?? "",
        study_type:     s.study_type ?? "custom",
        questions:      (s.questions ?? []).map(padOptions),
        thank_you_title: s.thank_you_title ?? { en: "Thank you!" },
        thank_you_body:  s.thank_you_body ?? { en: "Your response has been recorded." },
        enabled_languages: s.enabled_languages?.length ? s.enabled_languages : ["en"],
        status: (s.status === "draft" || s.status === "ready") ? s.status : "draft",
        is_template: s.is_template,
      });
      setLoading(false);
    })();
    fetch("/api/research-projects").then(r => r.json()).then(json => {
      const projects = (json.data ?? []) as { id: string; project_name: string; survey_id: string | null }[];
      setLinkedProjects(projects.filter(p => p.survey_id === surveyId).map(p => ({ id: p.id, project_name: p.project_name })));
    }).catch(() => {});
  }, [surveyId]);

  // ── Auto-translate all questions from English into targetLang ───────────────
  async function handleTranslate(targetLang: LangCode = editorLang, silent = false) {
    if (targetLang === "en" || translating) return;
    setTranslating(true);

    type Slot = { type: "question" | "option" | "thankYouTitle" | "thankYouBody"; qIdx?: number; oIdx?: number };
    const structure: Slot[] = [];
    const texts: string[] = [];

    fields.questions.forEach((q, qi) => {
      const enText = q.text.en ?? "";
      if (enText.trim()) { structure.push({ qIdx: qi, type: "question" }); texts.push(enText); }
      q.options.forEach((o, oi) => {
        const enOpt = o.text.en ?? "";
        if (enOpt.trim()) { structure.push({ qIdx: qi, type: "option", oIdx: oi }); texts.push(enOpt); }
      });
    });
    if ((fields.thank_you_title.en ?? "").trim()) { structure.push({ type: "thankYouTitle" }); texts.push(fields.thank_you_title.en!); }
    if ((fields.thank_you_body.en ?? "").trim()) { structure.push({ type: "thankYouBody" }); texts.push(fields.thank_you_body.en!); }

    if (!texts.length) {
      if (!silent) showToast("No English text to translate. Fill in the EN tab first.", false);
      setTranslating(false);
      return;
    }

    const res = await fetch("/api/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Translation failed.", false); setTranslating(false); return; }

    const translations: string[] = json.translations;
    setFields(f => {
      const qs = f.questions.map(q => ({ ...q, text: { ...q.text }, options: q.options.map(o => ({ ...o, text: { ...o.text } })) }));
      let thankYouTitle = f.thank_you_title;
      let thankYouBody = f.thank_you_body;
      structure.forEach((s, i) => {
        const translated = translations[i];
        if (!translated) return;
        if (s.type === "question" && s.qIdx !== undefined) qs[s.qIdx].text[targetLang] = translated;
        else if (s.type === "option" && s.qIdx !== undefined && s.oIdx !== undefined) qs[s.qIdx].options[s.oIdx].text[targetLang] = translated;
        else if (s.type === "thankYouTitle") thankYouTitle = { ...thankYouTitle, [targetLang]: translated };
        else if (s.type === "thankYouBody") thankYouBody = { ...thankYouBody, [targetLang]: translated };
      });
      return { ...f, questions: qs, thank_you_title: thankYouTitle, thank_you_body: thankYouBody };
    });

    let overLimit = 0;
    structure.forEach((s, i) => {
      const t = translations[i] ?? "";
      if (s.type === "question" && t.length > MAX_Q_CHARS) overLimit++;
      if (s.type === "option" && t.length > MAX_OPT_CHARS) overLimit++;
      if (s.type === "thankYouTitle" && t.length > MAX_TY_TITLE) overLimit++;
      if (s.type === "thankYouBody" && t.length > MAX_TY_BODY) overLimit++;
    });
    const langLabel = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)?.label ?? targetLang;
    if (overLimit > 0) {
      showToast(`Translated into ${langLabel}, but ${overLimit} field${overLimit !== 1 ? "s" : ""} exceed the character limit. Review fields highlighted in red before saving.`, false);
    } else {
      showToast(`Translated ${texts.length} field${texts.length !== 1 ? "s" : ""} into ${langLabel}.`);
    }
    setTranslating(false);
  }

  // ── Field editing ───────────────────────────────────────────────────────────
  function setQText(idx: number, lang: LangCode, text: string) {
    setFields(f => ({ ...f, questions: f.questions.map((q, i) => i === idx ? { ...q, text: { ...q.text, [lang]: text } } : q) }));
  }
  function setThankYouText(field: "thank_you_title" | "thank_you_body", lang: LangCode, text: string) {
    setFields(f => ({ ...f, [field]: { ...f[field], [lang]: text } }));
  }
  function addLanguage(lang: LanguageOption) {
    setFields(f => f.enabled_languages.includes(lang.code) ? f : { ...f, enabled_languages: [...f.enabled_languages, lang.code] });
    setEditorLang(lang.code as LangCode);
    if (lang.autoTranslatable) handleTranslate(lang.code as LangCode, true);
    else showToast(`${lang.label} added, Fanometrix can't auto-translate this language yet, so it needs to be filled in manually.`);
  }
  function removeLanguage(code: string) {
    if (code === "en") return;
    setFields(f => ({ ...f, enabled_languages: f.enabled_languages.filter(l => l !== code) }));
    if (editorLang === code) setEditorLang("en");
  }
  function addQuestion() {
    if (fields.questions.length >= MAX_QUESTIONS) return;
    setFields(f => ({ ...f, questions: [...f.questions, BLANK_Q()] }));
  }
  function removeQuestion(idx: number) {
    setFields(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  }
  function setOptionText(qIdx: number, oIdx: number, lang: LangCode, val: string) {
    setFields(f => ({ ...f, questions: f.questions.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? { ...o, text: { ...o.text, [lang]: val } } : o) } : q) }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (savingRef.current) return; // in-flight — ignore repeat fires
    setAttemptedSave(true);
    if (!fields.name?.trim()) { setFormError("Survey name is required."); return; }
    const qs = fields.questions ?? [];
    if (!qs.length) { setFormError("At least one question is required."); return; }
    for (const q of qs) {
      if (!(q.text.en ?? "").trim()) { setFormError("All questions need English text."); setEditorLang("en"); return; }
      // Every question must have all answers filled in (English).
      if (q.options.filter(o => (o.text.en ?? "").trim()).length < MAX_OPTIONS) {
        setFormError(`Every question must have all ${MAX_OPTIONS} answers filled in.`); setEditorLang("en"); return;
      }
    }

    const cleanedQs = qs.map(q => ({
      ...q,
      options: q.options.filter(o => (o.text.en ?? "").trim()).map((o, i) => ({ ...o, id: i + 1 })),
    }));
    const validationErrors = validateSurvey({
      name: fields.name, questions: cleanedQs,
      thank_you_title: fields.thank_you_title, thank_you_body: fields.thank_you_body,
    });

    const wantsReady = fields.status === "ready";
    const wasReady = editingOriginalStatus === "ready";

    if (validationErrors.length > 0 && wantsReady && !wasReady) {
      setFormError(`This survey cannot be marked Ready until all MPU validation errors are fixed.\n${validationErrors[0]}`);
      return;
    }

    setFormError(""); savingRef.current = true; setSaving(true);

    let saveStatus: "draft" | "ready" | "archived" = fields.status;
    const autoDowngraded = wasReady && validationErrors.length > 0;
    if (editingOriginalStatus === "archived") saveStatus = "archived";
    else if (autoDowngraded || (wantsReady && validationErrors.length > 0)) saveStatus = "draft";

    const payload = {
      ...fields,
      status: saveStatus,
      questions: cleanedQs,
      // Provenance only on a brand-new survey created for a linked project.
      ...(!surveyId && isSimulated !== undefined ? { is_simulated: isSimulated } : {}),
    };

    const res = await fetch(surveyId ? `/api/surveys/${surveyId}` : "/api/surveys", {
      method: surveyId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    savingRef.current = false; setSaving(false);

    // Only ever toast/notify once the API has genuinely resolved.
    if (!res.ok) {
      const msg = json.error ?? "Couldn't save the survey. Please try again.";
      setFormError(msg);
      showToast(msg, false);
      return;
    }

    if (autoDowngraded) {
      // A Ready survey edited into an invalid state saves as Draft — a warning,
      // not a plain success (preserves the standalone's prior behaviour).
      showToast("Saved, but validation issues moved this survey back to Draft.", false);
    } else {
      showToast(surveyId ? "Survey changes saved" : "Survey created successfully", true);
    }
    onSaved({ survey: json.data, isCreate: !surveyId, autoDowngraded });
  }

  // Char counters stay hidden until a field has focus (or its text approaches
  // the limit) — keeps the editor calm while still warning when it matters.
  const countHandlers = (key: string, over: boolean) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { focusGold(e); setFocusedField(key); },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => { blurFor(over)(e); setFocusedField(null); },
  });
  const showCount = (key: string, len: number, max: number) => focusedField === key || len > max * 0.85;

  const rootClass = layout === "drawer" ? "flex-1 flex flex-col min-h-0" : "flex flex-col gap-6";
  const bodyClass = layout === "drawer" ? "flex-1 overflow-y-auto p-6 space-y-6" : "space-y-6";
  const footerClass = layout === "drawer"
    ? "px-6 py-4 flex items-center justify-end gap-2"
    : "flex items-center justify-end gap-2";
  const footerStyle: React.CSSProperties | undefined = layout === "drawer"
    ? { borderTop: "1px solid var(--border-subtle)" }
    : undefined;

  return (
    <div className={rootClass}>
      <div className={bodyClass}>
        {loading ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-tertiary)" }}>Loading survey…</p>
        ) : (
          <>
            {linkedProjects.length > 0 && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Linked Research Project{linkedProjects.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {linkedProjects.map(p => (
                    <Link key={p.id} href={`/research-projects/${p.id}`} target="_blank" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>
                      {p.project_name} ↗
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {editingOriginalStatus === "archived" && (
              <Card tone="warning" padding="md">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Editing an archived survey</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Content changes will be saved. The survey will remain archived, use Restore to make it active again.</p>
              </Card>
            )}

            {/* Identity */}
            <Card>
              <SectionHeading title="Survey identity" description="Name this survey, who it's for, and its status." />
              <div className="mt-5 space-y-4">
                <Field label="Survey name *">
                  <input value={fields.name} onChange={e => setFields(f => ({ ...f, name: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold}
                    className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                    placeholder="e.g. Fan Understanding — Wave 1" />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Brand *">
                    <select value={fields.brand_org_id} onChange={e => setFields(f => ({ ...f, brand_org_id: e.target.value }))}
                      onFocus={focusGold} onBlur={blurGold}
                      className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                      <option value="">N/A</option>
                      {brandOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Agency *">
                    <select value={fields.agency_org_id} onChange={e => setFields(f => ({ ...f, agency_org_id: e.target.value }))}
                      onFocus={focusGold} onBlur={blurGold}
                      className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                      <option value="">N/A</option>
                      {agencyOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Survey type *">
                    <select value={fields.study_type} onChange={e => setFields(f => ({ ...f, study_type: e.target.value }))}
                      onFocus={focusGold} onBlur={blurGold}
                      className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                      {STUDY_TYPES.map(t => <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Description">
                  <textarea value={fields.description ?? ""} onChange={e => setFields(f => ({ ...f, description: e.target.value || null }))}
                    onFocus={focusGold} onBlur={blurGold} rows={2}
                    className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                    placeholder="Optional. What is this survey for?" />
                </Field>

                {editingOriginalStatus !== "archived" && (
                  <Field label="Status *">
                    <select value={fields.status} onChange={e => setFields(f => ({ ...f, status: e.target.value as "draft" | "ready" }))}
                      onFocus={focusGold} onBlur={blurGold}
                      className="w-full px-3 py-2 text-sm outline-none transition-colors sm:max-w-xs" style={inputStyle}>
                      <option value="draft">Draft, still being edited</option>
                      <option value="ready">Ready, can be attached to campaigns</option>
                    </select>
                  </Field>
                )}
              </div>
            </Card>

            {/* Questions */}
            <Card>
              <SectionHeading
                title="Questions"
                description={`Up to ${MAX_QUESTIONS} questions, ${MAX_OPTIONS} answers each. English is required, translations are optional.`}
              />

              <div className="mt-5">
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-tertiary)" }}>{fields.questions.length} of {MAX_QUESTIONS} added</p>

                <div className="flex gap-1.5 mb-2 flex-wrap items-center">
                  {(() => {
                    const completedLangs = getCompletedLanguages({ questions: fields.questions, thank_you_title: fields.thank_you_title, thank_you_body: fields.thank_you_body });
                    return fields.enabled_languages.map(code => {
                      const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
                      if (!lang) return null;
                      const isActive = editorLang === code;
                      const isEN = code === "en";
                      const isComplete = !isEN && completedLangs.includes(code as LangCode);
                      const hasAny = !isEN && fields.questions.some(q => (q.text[code as LangCode] ?? "").trim());
                      return (
                        <span key={code} className="inline-flex items-center">
                          <button type="button" onClick={() => setEditorLang(code as LangCode)}
                            className={`text-xs pl-2.5 py-1 rounded-full border font-medium transition-colors flex items-center gap-1.5 ${isEN ? "pr-2.5" : "pr-1.5"}`}
                            style={isActive
                              ? { background: "var(--brand-navy)", color: "var(--accent-gold)", borderColor: "var(--brand-navy)" }
                              : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                            {lang.label}{isEN ? " *" : ""}
                            {isComplete && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#5C8560" }} />}
                            {hasAny && !isComplete && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#C79A3E" }} />}
                            {!isEN && (
                              <span role="button" onClick={e => { e.stopPropagation(); removeLanguage(code); }}
                                className="leading-none ml-0.5 hover:opacity-70" style={{ color: isActive ? "var(--accent-gold)" : "var(--text-tertiary)" }} title={`Remove ${lang.label}`}>×</span>
                            )}
                          </button>
                        </span>
                      );
                    });
                  })()}
                  <AddLanguageButton enabledLanguages={fields.enabled_languages} onAdd={addLanguage} />
                  {editorLang !== "en" && (() => {
                    const lang = SUPPORTED_LANGUAGES.find(l => l.code === editorLang);
                    return lang?.autoTranslatable ? (
                      <Button className="ml-auto" variant="secondary" size="sm" onClick={() => handleTranslate()} disabled={translating}>
                        {translating ? "Translating…" : "✦ Translate from English"}
                      </Button>
                    ) : (
                      <span className="ml-auto text-xs" style={{ color: "var(--text-tertiary)" }}>Automatic translation isn&apos;t available for this language yet.</span>
                    );
                  })()}
                </div>
                {editorLang !== "en" && !translating && (
                  <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>Optional, leave blank to show English as fallback. Click &quot;Translate from English&quot; to auto-fill.</p>
                )}

                <div className="space-y-4">
                  {fields.questions.map((q, qi) => {
                    const qVal = (q.text[editorLang] ?? "");
                    const qOver = qVal.length > MAX_Q_CHARS;
                    return (
                      <div key={q.id} className="p-4 space-y-3 border" style={{ borderColor: qOver ? ERR_BORDER : "var(--border-subtle)", background: "var(--surface-sunken)", borderRadius: "var(--radius-panel)" }}>
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold w-6 mt-1.5" style={{ color: "var(--text-primary)" }}>Q{qi + 1}</span>
                          <div className="flex-1 min-w-0">
                            <input value={qVal} maxLength={MAX_Q_CHARS + 10} onChange={e => setQText(qi, editorLang, e.target.value)}
                              {...countHandlers(`q-${qi}`, qOver)}
                              className="w-full px-3 py-1.5 text-sm outline-none transition-colors" style={{ ...inputStyle, borderColor: qOver ? ERR_BORDER : "var(--border-default)" }}
                              placeholder={editorLang === "en" ? "Question text…" : (q.text.en ? `"${q.text.en}"` : "Question text…")} />
                            {showCount(`q-${qi}`, qVal.length, MAX_Q_CHARS) && (
                              <div className="flex justify-end mt-0.5"><CharCount len={qVal.length} max={MAX_Q_CHARS} /></div>
                            )}
                          </div>
                          {fields.questions.length > 1 && (
                            <button onClick={() => removeQuestion(qi)} className="mt-1.5 flex-shrink-0 hover:opacity-70" style={{ color: "var(--text-tertiary)" }} title="Remove question">
                              <Icon.close size={14} />
                            </button>
                          )}
                        </div>
                        <div className="space-y-2 pl-8">
                          {q.options.map((opt, oi) => {
                            const oVal = (opt.text[editorLang] ?? "");
                            const oOver = oVal.length > MAX_OPT_CHARS;
                            // Answers are required (English) — flag empties in red once a save is attempted.
                            const oEmptyErr = attemptedSave && editorLang === "en" && !oVal.trim();
                            return (
                              <div key={opt.id}>
                                <input value={oVal} maxLength={MAX_OPT_CHARS + 5} onChange={e => setOptionText(qi, oi, editorLang, e.target.value)}
                                  {...countHandlers(`o-${qi}-${oi}`, oOver)}
                                  className="w-full px-2.5 py-1 text-xs outline-none transition-colors" style={{ ...inputStyle, borderColor: (oOver || oEmptyErr) ? ERR_BORDER : "var(--border-default)" }}
                                  placeholder={editorLang === "en" ? `Answer ${oi + 1}` : (opt.text.en ? `"${opt.text.en}"` : `Answer ${oi + 1}`)} />
                                {showCount(`o-${qi}-${oi}`, oVal.length, MAX_OPT_CHARS) && <div className="flex justify-end"><CharCount len={oVal.length} max={MAX_OPT_CHARS} /></div>}
                              </div>
                            );
                          })}
                          {attemptedSave && editorLang === "en" && q.options.some(o => !(o.text.en ?? "").trim()) && (
                            <p className="text-xs font-medium" style={{ color: ERR_BORDER }}>All {MAX_OPTIONS} answers are required.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add a new question from the bottom of the list, where the eye
                    already is after filling the last question in. */}
                {fields.questions.length < MAX_QUESTIONS && (
                  <div className="flex justify-end mt-4">
                    <Button variant="secondary" size="sm" onClick={addQuestion}>+ Add question</Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Thank-you screen */}
            <Card>
              <SectionHeading title="Thank-you screen" description="Shown to fans after they finish the survey." />
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-end">
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Editing: {SUPPORTED_LANGUAGES.find(l => l.code === editorLang)?.label ?? editorLang}</p>
                </div>
                <div>
                  <input value={fields.thank_you_title[editorLang] ?? ""} maxLength={MAX_TY_TITLE + 5} onChange={e => setThankYouText("thank_you_title", editorLang, e.target.value)}
                    {...countHandlers("ty-title", (fields.thank_you_title[editorLang] ?? "").length > MAX_TY_TITLE)}
                    className="w-full px-3 py-1.5 text-sm outline-none transition-colors" style={{ ...inputStyle, borderColor: (fields.thank_you_title[editorLang] ?? "").length > MAX_TY_TITLE ? ERR_BORDER : "var(--border-default)" }}
                    placeholder="Thank you title" />
                  {showCount("ty-title", (fields.thank_you_title[editorLang] ?? "").length, MAX_TY_TITLE) && (
                    <div className="flex justify-end mt-0.5"><CharCount len={(fields.thank_you_title[editorLang] ?? "").length} max={MAX_TY_TITLE} /></div>
                  )}
                </div>
                <div>
                  <input value={fields.thank_you_body[editorLang] ?? ""} maxLength={MAX_TY_BODY + 10} onChange={e => setThankYouText("thank_you_body", editorLang, e.target.value)}
                    {...countHandlers("ty-body", (fields.thank_you_body[editorLang] ?? "").length > MAX_TY_BODY)}
                    className="w-full px-3 py-1.5 text-sm outline-none transition-colors" style={{ ...inputStyle, borderColor: (fields.thank_you_body[editorLang] ?? "").length > MAX_TY_BODY ? ERR_BORDER : "var(--border-default)" }}
                    placeholder="Thank you message" />
                  {showCount("ty-body", (fields.thank_you_body[editorLang] ?? "").length, MAX_TY_BODY) && (
                    <div className="flex justify-end mt-0.5"><CharCount len={(fields.thank_you_body[editorLang] ?? "").length} max={MAX_TY_BODY} /></div>
                  )}
                </div>
                {editorLang !== "en" && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Optional, leave blank to show English as fallback.</p>}
              </div>
            </Card>

            {formError && <p className="text-xs whitespace-pre-line" style={{ color: ERR_BORDER }}>{formError}</p>}
          </>
        )}
      </div>

      <div className={footerClass} style={footerStyle}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving…" : surveyId ? "Save changes" : "Create survey"}
        </Button>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ borderRadius: "var(--radius-panel)" }}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </div>
  );
}

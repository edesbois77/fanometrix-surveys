"use client";

// ── Survey stage (Survey Studio Create — Phase 3, refined) ───────────────────
// The survey journey editor: optional Intro → 1–5 Questions → mandatory
// system-owned Thank You.
//
// Desktop composition = two horizontal zones:
//   TOP    — LEFT: language selector (+ translate) + Journey navigator;
//            RIGHT: the integrated frame Preview (the real creative, this frame).
//   BOTTOM — the selected-frame editor, spanning the full width.
// Mobile = one column: Language → Journey → Preview → Editor, plus a separate
// full-journey "Preview my survey" overlay.
//
// This component owns only local UI state (which frame is selected, the editing
// language, the preview overlay, transient translate status). CreateWorkspace
// owns the persisted content + autosave; content flows in and changes flow out
// via onContentChange. Validation is reused from lib/survey-validation (the fixed
// contract), never re-implemented here.

import { useEffect, useState } from "react";
import { resolveQuestion, resolveText, SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import type { LangCode, LocalisedText } from "@/lib/survey-locale";
import { validateSurvey } from "@/lib/survey-validation";
import { computeLocalisationStatus } from "@/lib/survey-localisation";
import { resolveSystemThankYou } from "@/lib/system-thankyou";
import { Card } from "@/app/components/workspace-ui";
import { CreativeDesignPreview, type SurveyDraftPreview } from "@/app/components/CreativeDesignPreview";
import { StudioIcon } from "../../studio-icons";
import { JourneyNavigator } from "./JourneyNavigator";
import { QuestionEditor } from "./QuestionEditor";
import { IntroEditor } from "./IntroEditor";
import { ThankYouEditor } from "./ThankYouEditor";
import {
  blankQuestion, resolveDeliveryLanguages,
  SURVEY_LIMITS, STUDIO_AUTHORING_LIMITS, type SurveyContent, type Selection,
} from "./types";
import { resolveSelection, frameForSelection, frameLabel as journeyFrameLabel } from "./journey-preview";
import { resolveCreativeRules, type CreativeLayout } from "@/lib/creative-rules";

const LANG_LABEL: Record<string, string> = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]));

// The subset of a creative_designs row this stage reads: the display name plus the
// genuine renderer rules that govern the authored answer count.
type DesignRow = { slug: string; name: string; rules?: unknown; layout?: CreativeLayout };

// ── Local modal overlay (same pattern as CreativeStage) ──────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-panel)] overflow-hidden" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--text-tertiary)" }} aria-label="Close">Close</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// The translate endpoint returns this shape (generate-only; writes nothing).
type TranslatePayload = {
  targetLang: string;
  questions: { id: string; text?: string; options: { id: number; text: string }[] }[];
  intro_title: string;
  intro_body: string;
};

export function SurveyStage({
  surveyId, creativeDesign, languages, markets, researchLocked, content, onContentChange, persistNow,
}: {
  surveyId: string;
  creativeDesign: string | null;
  languages: string[];
  markets: string[];
  /** Research-definition lock — set once the survey holds evidence OR is live. */
  researchLocked: boolean;
  content: SurveyContent;
  onContentChange: (patch: Partial<SurveyContent>) => void;
  /** Persist the current draft immediately, resolving when the write completes —
   *  used to guarantee English is saved before a generate-only translate call. */
  persistNow: () => Promise<void>;
}) {
  // Delivery languages are DERIVED from the About markets (governed mapping),
  // unioned with any languages already on the survey. English is always first.
  const deliveryLanguages = resolveDeliveryLanguages(markets, languages);
  const [lang, setLang] = useState<LangCode>("en");
  const [selected, setSelected] = useState<Selection>(
    content.questions[0] ? { kind: "question", id: content.questions[0].id } : { kind: "intro" },
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [designRows, setDesignRows] = useState<DesignRow[]>([]);
  const [translateState, setTranslateState] = useState<"idle" | "working" | "error" | "unsupported">("idle");

  const locked = researchLocked;

  // Load the design catalogue once; the setState lands in an async callback.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/creative-designs")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled) setDesignRows((json?.data ?? []) as DesignRow[]); })
      .catch(() => {/* leave empty on failure */});
    return () => { cancelled = true; };
  }, []);

  const selectedDesign = creativeDesign ? designRows.find((d) => d.slug === creativeDesign) : undefined;
  const creativeName = creativeDesign ? (selectedDesign?.name ?? creativeDesign) : null;

  // Authored answer count for NEW questions — a genuine RENDERER capability.
  const answerOptionCount = selectedDesign
    ? resolveCreativeRules(selectedDesign.rules, selectedDesign.layout ?? "timer").maxOptions
    : SURVEY_LIMITS.MAX_OPTIONS;

  // Guard the editing language if the derived set doesn't include it.
  const activeLang: LangCode = deliveryLanguages.includes(lang) ? lang : "en";

  // Localisation completeness+validity (per delivery language) — the single source
  // for the language pills, the LOCALISATION count and the Campaigns gate. English
  // base validity also drives the Journey "Ready" status (structure, not language).
  const loc = computeLocalisationStatus(content, deliveryLanguages);

  // ── Validation (fixed contract) — filtered for the fixed-answer editor ──────
  // Name lives in About; a stand-in keeps its rule from surfacing here. We surface
  // only question/intro issues. The fixed 4-answer editor must NOT show the "at
  // least 2 answers are required" / "maximum N answers" messages — those are
  // filtered out of the per-question presentation while validateSurvey itself
  // (server/historical integrity) stays untouched.
  const allErrors = validateSurvey({
    name: "ok",
    questions: content.questions,
    intro_title: content.introTitle,
    intro_body: content.introBody,
  } as unknown as Parameters<typeof validateSurvey>[0]);

  const isAnswerCountMsg = (e: string) => /at least 2 answers are required|maximum \d+ answers allowed/i.test(e);
  const questionErrorsFor = (index: number) =>
    allErrors
      .filter((e) => new RegExp(`^Q${index + 1}[:,]`).test(e))
      .filter((e) => !isAnswerCountMsg(e))
      .map((e) => e.replace(/^Q\d+[,:]\s*/, ""));

  // Content-completeness for the journey ✓/!: English question text present and
  // within the Studio limit, AND EVERY answer slot the question carries filled and
  // within the answer limit (four for new Studio questions; 2–3 for preserved
  // historical surveys — whatever the question actually has). No slot is manufactured.
  const questionComplete = (id: string) => {
    const q = content.questions.find((qq) => qq.id === id);
    if (!q) return false;
    const qt = (q.text.en ?? "").trim();
    if (qt.length === 0 || qt.length > STUDIO_AUTHORING_LIMITS.MAX_Q_CHARS) return false;
    if (q.options.length < SURVEY_LIMITS.MIN_OPTIONS) return false;
    return q.options.every((o) => {
      const t = (o.text.en ?? "").trim();
      return t.length > 0 && t.length <= STUDIO_AUTHORING_LIMITS.MAX_OPT_CHARS;
    });
  };

  // Journey readiness = the English/base survey STRUCTURE being complete + valid
  // (NOT whether every delivery language is translated — that's the pills).
  const overallReady = loc.englishValid;

  // Keep selection valid if the active question was removed (pure — no setState).
  // Authoritative journey mapping lives in ./journey-preview so the count, frame
  // and counter can never drift from the live draft.
  const effectiveSelection: Selection = resolveSelection(selected, content.questions);

  // ── Structural mutations (all suppressed when locked, in the UI) ────────────
  const addQuestion = () => {
    const q = blankQuestion(answerOptionCount);
    onContentChange({ questions: [...content.questions, q] });
    setSelected({ kind: "question", id: q.id });
  };
  const deleteQuestion = (id: string) => {
    const idx = content.questions.findIndex((q) => q.id === id);
    const remaining = content.questions.filter((q) => q.id !== id);
    onContentChange({ questions: remaining });
    const nextIdx = Math.min(idx, remaining.length - 1);
    setSelected(remaining[nextIdx] ? { kind: "question", id: remaining[nextIdx].id } : { kind: "intro" });
  };
  const moveQuestion = (id: string, dir: -1 | 1) => {
    const idx = content.questions.findIndex((q) => q.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= content.questions.length) return;
    const next = [...content.questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onContentChange({ questions: next });
  };
  const updateQuestion = (id: string, nextQ: SurveyContent["questions"][number]) =>
    onContentChange({ questions: content.questions.map((q) => (q.id === id ? nextQ : q)) });

  const onIntroChange = (patch: { enabled?: boolean; title?: LocalisedText; body?: LocalisedText; topic?: string }) =>
    onContentChange({
      ...(patch.enabled !== undefined ? { introEnabled: patch.enabled } : {}),
      ...(patch.title !== undefined ? { introTitle: patch.title } : {}),
      ...(patch.body !== undefined ? { introBody: patch.body } : {}),
      ...(patch.topic !== undefined ? { topic: patch.topic } : {}),
    });

  // Per-language status accessors for the pills + translate CTA (loc computed above).
  const statusFor = (l: string) => loc.perLanguage.find((p) => p.lang === l);
  const activeStatus = statusFor(activeLang);
  const canTranslate = activeLang !== "en" && (activeStatus?.total ?? 0) > 0 && (activeStatus?.filled ?? 0) < (activeStatus?.total ?? 0);
  const translateLabel = (activeStatus?.filled ?? 0) === 0
    ? `Translate to ${LANG_LABEL[activeLang] ?? activeLang}`
    : `Fill remaining ${LANG_LABEL[activeLang] ?? activeLang} translations`;

  // Apply generated translations into the draft — ONLY where the target language
  // is currently empty, so a manually-reviewed translation is never overwritten.
  const applyTranslations = (payload: TranslatePayload, target: LangCode) => {
    const fill = (map: LocalisedText, tr?: string): LocalisedText =>
      tr && tr.trim() && !(map[target] ?? "").trim() ? { ...map, [target]: tr } : map;

    const nextQuestions = content.questions.map((q) => {
      const tq = payload.questions.find((x) => x.id === q.id);
      if (!tq) return q;
      const text = fill(q.text, tq.text);
      const opts = q.options.map((o) => {
        const to = tq.options.find((x) => x.id === o.id);
        return to ? { ...o, text: fill(o.text, to.text) } : o;
      });
      return { ...q, text, options: opts };
    });

    const patch: Partial<SurveyContent> = { questions: nextQuestions };
    const nextTitle = fill(content.introTitle, payload.intro_title);
    if (nextTitle !== content.introTitle) patch.introTitle = nextTitle;
    const nextBody = fill(content.introBody, payload.intro_body);
    if (nextBody !== content.introBody) patch.introBody = nextBody;
    onContentChange(patch);
  };

  const runTranslate = async () => {
    if (activeLang === "en") return;
    setTranslateState("working");
    try {
      await persistNow(); // ensure English base is saved server-side first
      const res = await fetch(`/api/surveys/${surveyId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLang: activeLang }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTranslateState(json?.code === "language_not_machine_translatable" ? "unsupported" : "error");
        return;
      }
      applyTranslations(json as TranslatePayload, activeLang);
      setTranslateState("idle");
    } catch {
      setTranslateState("error");
    }
  };

  const onSelectLang = (l: LangCode) => { setLang(l); setTranslateState("idle"); };

  // ── The active editor for the bottom zone ───────────────────────────────────
  let editor: React.ReactNode;
  if (effectiveSelection.kind === "intro") {
    editor = (
      <IntroEditor
        enabled={content.introEnabled}
        title={content.introTitle}
        body={content.introBody}
        topic={content.topic}
        lang={activeLang}
        onChange={onIntroChange}
      />
    );
  } else if (effectiveSelection.kind === "thankyou") {
    editor = <ThankYouEditor lang={activeLang} deliveryLanguages={deliveryLanguages} />;
  } else {
    const idx = content.questions.findIndex((q) => q.id === effectiveSelection.id);
    const q = content.questions[idx];
    editor = q ? (
      <QuestionEditor
        question={q}
        index={idx}
        total={content.questions.length}
        lang={activeLang}
        locked={locked}
        errors={questionErrorsFor(idx)}
        onChange={(next) => updateQuestion(q.id, next)}
        onMoveUp={() => moveQuestion(q.id, -1)}
        onMoveDown={() => moveQuestion(q.id, 1)}
      />
    ) : null;
  }

  // ── Preview draft (resolved to the active editing language) ─────────────────
  // The Thank-You is the system-owned frame: pass its central copy for the active
  // language and mark thankYouSystem so the renderer shows the managed frame.
  const sysTy = resolveSystemThankYou(activeLang);
  const previewDraft: SurveyDraftPreview = {
    surveyId,
    lang: activeLang,
    questions: content.questions.map((q) => resolveQuestion(q, activeLang)),
    introEnabled: content.introEnabled,
    introTitle: resolveText(content.introTitle, activeLang),
    introBody: resolveText(content.introBody, activeLang),
    introTopic: content.topic || undefined,
    thankYouSystem: true,
    thankYouEnabled: true,
    thankYouTitle: sysTy.title,
    thankYouBody: sysTy.body,
  };

  // Which frame the integrated preview renders, mirroring the selected step.
  const currentFrame = frameForSelection(effectiveSelection, content.questions);

  // Localisation summary (validity, not mere presence).
  const completeCount = loc.perLanguage.filter((p) => p.complete).length;
  const totalLangs = loc.perLanguage.length;

  // ── Languages — a shallow full-width localisation strip ─────────────────────
  // Green = complete AND valid · Red = needs attention (missing OR over-limit).
  // Selection (which language you're editing) is a SEPARATE gold ring, independent
  // of the green/red validity status. ✓ / ! keep it legible without colour.
  const languagePanel = (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Languages</span>
        {totalLangs > 1 && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: completeCount === totalLangs ? "#2E7D5B" : "var(--text-tertiary)" }}>
            Localisation · {completeCount} of {totalLangs} complete
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {deliveryLanguages.map((code) => {
          const complete = code === "en" ? loc.englishValid : !!statusFor(code)?.complete;
          const active = code === activeLang;
          const label = `${LANG_LABEL[code] ?? code}${code === "en" ? " (base)" : ""}`;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelectLang(code)}
              aria-pressed={active}
              aria-label={`${label}, ${complete ? "complete" : "needs attention"}${active ? ", selected" : ""}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
              style={{
                background: complete ? "#EAF3EE" : "#F9EFEA",
                borderColor: complete ? "#BFDDCB" : "#E8D2C4",
                color: "var(--text-primary)",
                fontWeight: active ? 600 : 500,
                boxShadow: active ? "0 0 0 2px var(--accent-gold)" : "none",
              }}
            >
              <span className="truncate max-w-[10rem]">{label}</span>
              <span aria-hidden className="text-[12px] font-bold" style={{ color: complete ? "#2E7D5B" : "#B4694C" }}>
                {complete ? "✓" : "!"}
              </span>
            </button>
          );
        })}
      </div>

      {activeLang !== "en" && (
        <div className="space-y-1.5">
          {canTranslate && (
            <button
              type="button"
              onClick={runTranslate}
              disabled={translateState === "working"}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-[var(--radius-control)] border transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
              style={{ background: "var(--accent-wash)", borderColor: "var(--accent-gold)", color: "var(--accent-ink)" }}
            >
              <StudioIcon.discover size={14} /> {translateState === "working" ? "Translating…" : translateLabel}
            </button>
          )}
          {!canTranslate && (activeStatus?.total ?? 0) > 0 && activeStatus?.complete && (
            <p className="text-[11px]" style={{ color: "#2E7D5B" }}>All {LANG_LABEL[activeLang] ?? activeLang} fields translated and within limits.</p>
          )}
          {/* Every field present but the language is still not complete ⇒ one or
              more values are over the authoring limit. Point the author to fix it. */}
          {!canTranslate && (activeStatus?.total ?? 0) > 0 && !activeStatus?.complete && (
            <p className="text-[11px]" style={{ color: "#B4694C" }}>
              Some {LANG_LABEL[activeLang] ?? activeLang} fields are over the authoring limit. Shorten the highlighted fields to complete this language.
            </p>
          )}
          {translateState === "error" && (
            <p className="text-[11px]" style={{ color: "#B4694C" }}>Couldn&apos;t generate translations. Try again.</p>
          )}
          {translateState === "unsupported" && (
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {LANG_LABEL[activeLang] ?? activeLang} isn&apos;t machine-translatable, so enter it manually.
            </p>
          )}
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
            Fills empty fields only — your reviewed translations are never overwritten.
          </p>
        </div>
      )}
    </div>
  );

  const frameLabel = journeyFrameLabel(currentFrame);

  const previewCard = (
    <div className="flex flex-col h-full">
      {/* Section heading (consistent Studio eyebrow) + the separate full-journey
          action. The integrated preview below shows the SELECTED frame only. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Preview</span>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-control)] border transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
          style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--accent-ink)" }}
        >
          <StudioIcon.discover size={14} /> Preview full survey
        </button>
      </div>
      {/* Representative creative — centred horizontally AND vertically, no excess. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3 min-h-[276px]">
        {creativeDesign ? (
          // Non-interactive: a faithful STILL of the SELECTED Journey frame. You move
          // between frames using the Journey list on the left — clicking inside the
          // preview must NOT advance the creative's own flow (e.g. the Stack's built-in
          // Gender/Age demographic frames, which are not authored Journey frames and
          // would otherwise appear here). The interactive, full walk-through — including
          // that real fan flow — lives behind "Preview full survey".
          <div style={{ pointerEvents: "none" }}>
            <CreativeDesignPreview designId={creativeDesign} surveyDraft={previewDraft} frame={currentFrame} variant="bare" />
          </div>
        ) : (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-secondary)" }}>
            Choose a Creative first, then preview your survey inside it.
          </p>
        )}
        {/* Secondary context line — what's being previewed (not the section title). */}
        {creativeDesign && (
          <p className="text-[11px] text-center" style={{ color: "var(--text-tertiary)" }}>
            {frameLabel}{creativeName ? ` · ${creativeName}` : ""}
          </p>
        )}
      </div>
    </div>
  );

  const navigator = (
    <JourneyNavigator
      questions={content.questions}
      introEnabled={content.introEnabled}
      lang={activeLang}
      selected={effectiveSelection}
      onSelect={setSelected}
      locked={locked}
      questionComplete={questionComplete}
      onAddQuestion={addQuestion}
      onDeleteQuestion={deleteQuestion}
      overallReady={overallReady}
      creativeName={creativeName}
    />
  );

  return (
    <div className="mt-6 space-y-6">
      {/* ROW 1 — Journey (≈55%, the primary construction surface) + integrated
          Preview (≈45%). The Journey content sets the row height; both cards are
          equal-height on desktop (items-stretch) and the Preview creative is
          centred within its card. Mobile stacks as Journey → Preview (no forced
          equal height). */}
      <div className="grid grid-cols-1 lg:grid-cols-[11fr_9fr] gap-6 lg:items-stretch">
        <Card>{navigator}</Card>
        <Card className="h-full">{previewCard}</Card>
      </div>

      {/* ROW 2 — Languages, a shallow full-width localisation strip. */}
      <Card>{languagePanel}</Card>

      {/* ROW 3 — the selected-frame editor, full width. */}
      <Card>{editor}</Card>

      {previewOpen && (
        <Overlay title="Preview full survey" onClose={() => setPreviewOpen(false)}>
          <div className="flex justify-center">
            {creativeDesign ? (
              <CreativeDesignPreview designId={creativeDesign} surveyDraft={previewDraft} />
            ) : (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-secondary)" }}>
                Choose a Creative first, then preview your survey inside it.
              </p>
            )}
          </div>
        </Overlay>
      )}
    </div>
  );
}

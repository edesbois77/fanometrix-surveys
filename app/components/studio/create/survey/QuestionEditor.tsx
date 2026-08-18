"use client";

// ── QuestionEditor (main pane) ───────────────────────────────────────────────
// The primary editing surface for one question: localised question text, a fixed
// set of localised answers (governed by the selected Creative), reorder (Move up
// / Move down — no drag), and Delete. All structural affordances (delete,
// reorder) are suppressed when the survey is structurally locked (has responses);
// text stays editable.
//
// Authoring guidance uses STUDIO_AUTHORING_LIMITS (45 / 24) for maxLength +
// counters — tighter than the renderer/historical SURVEY_LIMITS ceiling so
// natural translation expansion still fits. maxLength blocks NEW over-limit
// typing but never truncates already-stored content: a loaded value that exceeds
// the limit is shown in full and simply flagged over-limit.
//
// Also the home of the shared LocalisedTextControl — a labelled localised text
// field with a live character counter — reused by the Intro editor.

import type { LocalisedQuestion, LocalisedText, LangCode } from "@/lib/survey-locale";
import { StudioIcon } from "../../studio-icons";
import { STUDIO_AUTHORING_LIMITS } from "./types";

const INPUT_CLS =
  "w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]";
const INPUT_STYLE = { background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" } as const;
const NEEDS = "#B4694C";
const OVER_BORDER = "#E8D2C4";
const ATTN_BORDER = "#E6C79A";

// ── Shared localised text control ────────────────────────────────────────────
// Writes into the LocalisedText map under the active language key. When editing a
// non-English language, the English base is offered as the placeholder so the
// author always sees what they're translating. English is the validated base.
// `enforceMax` sets a hard maxLength (used for authoring-limited fields); it never
// truncates a value already longer than max — the browser only blocks new input.
export function LocalisedTextControl({
  label, hint, value, lang, max, onChange, multiline = false, rows = 2, required = false,
  disabled = false, autoFocus = false, enforceMax = false, attention = false,
}: {
  label: string;
  hint?: string;
  value: LocalisedText;
  lang: LangCode;
  max: number;
  onChange: (next: LocalisedText) => void;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  enforceMax?: boolean;
  /** Highlight as an empty required field needing attention. */
  attention?: boolean;
}) {
  const text = value[lang] ?? "";
  const len = text.length;
  const over = len > max;
  const empty = text.trim().length === 0;
  const enBase = lang !== "en" ? (value.en ?? "") : "";
  const placeholder = lang !== "en" && enBase ? enBase : undefined;
  const set = (v: string) => onChange({ ...value, [lang]: v });
  const borderColor = over ? OVER_BORDER : (attention && empty ? ATTN_BORDER : "var(--border-default)");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {label}{required && <span aria-hidden style={{ color: NEEDS }}> *</span>}
        </label>
        <span
          className="text-[11px] fx-tabular-nums flex-shrink-0"
          style={{ color: over ? NEEDS : "var(--text-tertiary)" }}
          aria-label={`${len} of ${max} characters used`}
        >
          {len}/{max}
        </span>
      </div>
      {hint && <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{hint}</p>}
      <div className="mt-1.5">
        {multiline ? (
          <textarea
            value={text}
            onChange={(e) => set(e.target.value)}
            rows={rows}
            maxLength={enforceMax ? max : undefined}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            className={`${INPUT_CLS} resize-y leading-relaxed`}
            style={{ ...INPUT_STYLE, borderColor }}
          />
        ) : (
          <input
            type="text"
            value={text}
            onChange={(e) => set(e.target.value)}
            maxLength={enforceMax ? max : undefined}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            className={INPUT_CLS}
            style={{ ...INPUT_STYLE, borderColor }}
          />
        )}
      </div>
      {attention && empty && (
        <p className="text-[11px] mt-1" style={{ color: NEEDS }}>Add {label.toLowerCase()} to complete this question.</p>
      )}
      {over && (
        <p className="text-[11px] mt-1" style={{ color: NEEDS }}>Over the {max}-character guide, shorten it so translations still fit.</p>
      )}
    </div>
  );
}

// ── Small icon buttons ───────────────────────────────────────────────────────
function IconButton({ label, disabled, onClick, children }: {
  label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-control)] border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
      style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

export function QuestionEditor({
  question, index, total, lang, locked, errors, onChange, onMoveUp, onMoveDown,
}: {
  question: LocalisedQuestion;
  index: number;
  total: number;
  lang: LangCode;
  locked: boolean;
  /** Filtered, per-question validation strings (fixed-answer count messages are
   *  removed upstream in SurveyStage; this keeps server integrity untouched). */
  errors: string[];
  onChange: (next: LocalisedQuestion) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { MAX_Q_CHARS, MAX_OPT_CHARS } = STUDIO_AUTHORING_LIMITS;
  const options = question.options;
  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;

  // "Needs attention" for THIS question in the CURRENT editing language: the
  // question text or ANY answer slot is empty. All answer slots the question
  // carries are required (four for new Studio questions; 2–3 for preserved
  // historical surveys). Drives the direct empty-field highlighting.
  const emptyIn = (t: LocalisedText) => (t[lang] ?? "").trim().length === 0;
  const anyAnswerEmpty = options.some((o) => emptyIn(o.text));
  const incomplete = emptyIn(question.text) || anyAnswerEmpty;

  const setQuestionText = (next: LocalisedText) => onChange({ ...question, text: next });
  const setOptionText = (optId: number, next: LocalisedText) =>
    onChange({ ...question, options: options.map((o) => (o.id === optId ? { ...o, text: next } : o)) });

  return (
    <div className="space-y-6">
      {/* Header row: numeric position + reorder / delete (structural — lockable) */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
          Question {index + 1} of {total}
        </p>
        {!locked && (
          <div className="flex items-center gap-1.5">
            {/* Explicit caption so these read as QUESTION-STRUCTURE controls, not
                frame navigation (frame navigation lives in the Journey card, which
                also owns Delete). */}
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] mr-0.5 hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
              Reorder
            </span>
            <IconButton label="Move question up" disabled={!canMoveUp} onClick={onMoveUp}>
              <span aria-hidden style={{ transform: "rotate(-90deg)" }}><StudioIcon.arrowRight size={15} /></span>
            </IconButton>
            <IconButton label="Move question down" disabled={!canMoveDown} onClick={onMoveDown}>
              <span aria-hidden style={{ transform: "rotate(90deg)" }}><StudioIcon.arrowRight size={15} /></span>
            </IconButton>
          </div>
        )}
      </div>

      <LocalisedTextControl
        label="Question"
        value={question.text}
        lang={lang}
        max={MAX_Q_CHARS}
        onChange={setQuestionText}
        required
        autoFocus
        enforceMax
        attention={incomplete}
        disabled={locked}
      />

      {/* Answers — a fixed set of answer fields governed by the selected Creative
          (the current V1 family authors four). There is deliberately no routine
          Add/Delete-answer control: answer COUNT is a Creative renderer capability,
          not a per-question authoring choice. Existing surveys keep whatever answer
          count they were authored with; only the text is edited here. */}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Answers</p>
        <div className="space-y-2.5">
          {options.map((o, oi) => {
            const displayText = o.text[lang] ?? "";
            const enBase = lang !== "en" ? (o.text.en ?? "") : "";
            const over = displayText.length > MAX_OPT_CHARS;
            // Every answer slot is required, so flag any empty one in the current
            // language (all four for new Studio questions; every slot a historical
            // question carries).
            const attn = emptyIn(o.text);
            const borderColor = over ? OVER_BORDER : (attn ? ATTN_BORDER : "var(--border-default)");
            return (
              <div key={o.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={displayText}
                      maxLength={MAX_OPT_CHARS}
                      onChange={(e) => setOptionText(o.id, { ...o.text, [lang]: e.target.value })}
                      placeholder={lang !== "en" && enBase ? enBase : `Answer ${oi + 1}`}
                      className={`${INPUT_CLS} pr-14`}
                      style={{ ...INPUT_STYLE, borderColor, ...(locked ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
                      aria-label={`Answer ${oi + 1}`}
                      disabled={locked}
                    />
                    <span
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] fx-tabular-nums pointer-events-none"
                      style={{ color: over ? NEEDS : "var(--text-tertiary)" }}
                    >
                      {displayText.length}/{MAX_OPT_CHARS}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {anyAnswerEmpty && (
          <p className="text-[11px] mt-2" style={{ color: NEEDS }}>Fill in every answer to complete this question.</p>
        )}
      </div>

      {/* Inline validation for THIS question (English base) — fixed-answer count
          messages are already filtered out upstream. */}
      {errors.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {errors.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: NEEDS }}>
              <span aria-hidden><StudioIcon.bell size={13} /></span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

// ── JourneyNavigator ─────────────────────────────────────────────────────────
// NAVIGATION only — never an editor, and never the Intro toggle (that lives in
// the Intro editor). Each row is an explicit interactive nav control (hover,
// selected gold-wash + inset ring, focus-visible ring, pointer cursor, trailing
// chevron, aria-current) that BOTH selects the frame's editor below and drives
// the integrated preview. The journey lists only frames that exist: Intro bookend
// → the questions that exist (no phantom Q2–Q5) → Thank You bookend.
//
// Status is restrained: Intro → Included / Not included; each Question → complete
// (✓) or needs attention (!); Thank You → Required. A single compact pill near the
// heading reports overall Ready / Needs attention. No "N of 5 questions" framing.

import type { LocalisedQuestion, LangCode } from "@/lib/survey-locale";
import { resolveText } from "@/lib/survey-locale";
import { StudioIcon } from "../../studio-icons";
import { SURVEY_LIMITS, type Selection, STRUCTURE_LOCKED_COPY } from "./types";

function Row({ active, muted, onClick, children, status, statusTone, onDelete, deleteLabel }: {
  active: boolean;
  muted?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  status?: React.ReactNode;
  statusTone?: "ok" | "warn" | "neutral";
  /** When present, a restrained Delete control appears on the row (question rows,
   *  while structural editing is allowed). It never triggers row selection. */
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const toneColor =
    statusTone === "ok" ? "var(--accent-ink)" : statusTone === "warn" ? "#B4694C" : "var(--text-tertiary)";
  // A role="button" div (not a native <button>) so the Delete control can legally
  // nest inside a clickable row; full keyboard support is retained.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      aria-current={active ? "true" : undefined}
      className="group w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-control)] text-left cursor-pointer transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
      style={{
        // Every row carries a light resting card border so it reads as selectable
        // at rest (not just on hover); the selected row is accent-gold + wash.
        background: active ? "var(--accent-wash)" : "var(--surface)",
        border: `1px solid ${active ? "var(--accent-gold)" : "var(--border-subtle)"}`,
      }}
    >
      <span className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className="min-w-0 truncate text-sm"
          style={{ color: muted ? "var(--text-tertiary)" : active ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: active ? 600 : 500 }}
        >
          {children}
        </span>
      </span>
      {status && (
        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: toneColor }}>
          {status}
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={deleteLabel ?? "Delete"}
          title={deleteLabel ?? "Delete"}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-control)] text-xs opacity-40 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
          style={{ color: "#B4694C" }}
        >
          ✕
        </button>
      )}
      <span
        aria-hidden
        className="flex-shrink-0 text-base leading-none transition-transform group-hover:translate-x-0.5"
        style={{ color: active ? "var(--accent-gold)" : "var(--text-secondary)" }}
      >
        ›
      </span>
    </div>
  );
}

export function JourneyNavigator({
  questions, introEnabled, lang, selected, onSelect,
  locked, questionComplete, onAddQuestion, onDeleteQuestion, overallReady, creativeName,
}: {
  questions: LocalisedQuestion[];
  introEnabled: boolean;
  lang: LangCode;
  selected: Selection;
  onSelect: (s: Selection) => void;
  locked: boolean;
  /** Whether a given question id is content-complete (text + all answers valid). */
  questionComplete: (id: string) => boolean;
  onAddQuestion: () => void;
  /** Delete a question by id (Journey owns deletion). */
  onDeleteQuestion: (id: string) => void;
  /** Overall pill: all existing questions complete + intro copy valid if on. */
  overallReady: boolean;
  creativeName: string | null;
}) {
  const atMax = questions.length >= SURVEY_LIMITS.MAX_QUESTIONS;
  const canAdd = !locked && !atMax;

  return (
    <div className="space-y-3">
      {/* Heading + one compact overall pill */}
      <div className="flex items-center justify-between gap-2 px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Journey</span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full inline-flex items-center gap-1"
          style={overallReady
            ? { color: "var(--accent-ink)", background: "var(--accent-wash)" }
            : { color: "#8A4B2F", background: "#F9EFEA" }}
          aria-label={overallReady ? "Survey ready" : "Survey needs attention"}
        >
          {overallReady ? <StudioIcon.check size={11} /> : <StudioIcon.bell size={11} />}
          {overallReady ? "Ready" : "Needs attention"}
        </span>
      </div>

      <p className="px-2.5 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Select a frame to edit and preview.
      </p>

      {/* Journey list — a clear vertical sequence of the frames that exist
          (Intro → Q1 → Qn → Thank You); question rows get full width so their
          text doesn't truncate prematurely. */}
      <nav aria-label="Survey journey" className="space-y-1.5">
        {/* Intro bookend */}
        <Row
          active={selected.kind === "intro"}
          muted={!introEnabled}
          onClick={() => onSelect({ kind: "intro" })}
          status={introEnabled ? "Included" : "Not included"}
          statusTone={introEnabled ? "ok" : "neutral"}
        >
          Intro
        </Row>

        {/* Questions — only those that exist (no phantom rows) */}
        {questions.map((q, i) => {
          const resolved = resolveText(q.text, lang).trim();
          const label = resolved ? `${i + 1} · ${resolved}` : `Question ${i + 1}`;
          const complete = questionComplete(q.id);
          return (
            <Row
              key={q.id}
              active={selected.kind === "question" && selected.id === q.id}
              onClick={() => onSelect({ kind: "question", id: q.id })}
              status={complete ? "✓" : "!"}
              statusTone={complete ? "ok" : "warn"}
              onDelete={!locked && questions.length > 1 ? () => onDeleteQuestion(q.id) : undefined}
              deleteLabel={`Delete question ${i + 1}`}
            >
              {label}
            </Row>
          );
        })}

        {/* Add question — or a quiet max notice at 5 */}
        {canAdd ? (
          <button
            type="button"
            onClick={onAddQuestion}
            className="w-full flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-control)] text-sm font-semibold cursor-pointer border border-dashed transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
            style={{ color: "var(--accent-ink)", borderColor: "var(--border-default)" }}
          >
            <StudioIcon.create size={14} /> Add question
          </button>
        ) : (!locked && atMax) ? (
          <p className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Maximum 5 questions</p>
        ) : null}

        {/* Thank-you bookend — mandatory, system-owned */}
        <Row
          active={selected.kind === "thankyou"}
          onClick={() => onSelect({ kind: "thankyou" })}
          status="Required"
          statusTone="neutral"
        >
          Thank you
        </Row>
      </nav>

      {/* Structural-lock notice (exact settled copy) */}
      {locked && (
        <p className="text-xs leading-relaxed rounded-[var(--radius-control)] p-2.5" style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)" }}>
          {STRUCTURE_LOCKED_COPY}
        </p>
      )}

      {/* Read-only Creative reminder */}
      <div className="px-2.5 pt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
          Creative: <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{creativeName ?? "Not chosen yet"}</span>
        </p>
      </div>
    </div>
  );
}

"use client";

// ── IntroEditor (main pane) ──────────────────────────────────────────────────
// The optional opening screen. ALL of its controls live here (never on the
// navigator): the Include-Intro toggle, a Topic field, a localised headline and
// short message with live counters. The mechanical line ("N questions · Around
// ~Xs") and the "Start survey" button are added automatically by the creative —
// not authored here — so the editor says so rather than pretending to own them.
//
// Topic is a SHORT, OPTIONAL, NON-localised survey subject (surveys.topic),
// DISTINCT from the About Objective. It is available even when the intro screen
// is switched off (it can inform the creative), so it sits above the toggle.
//
// Also the home of the shared Toggle switch.

import type { LocalisedText, LangCode } from "@/lib/survey-locale";
import { LocalisedTextControl } from "./QuestionEditor";
import { SURVEY_LIMITS } from "./types";

const MAX_TOPIC = 60;

// ── Shared on/off toggle ─────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (next: boolean) => void; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-1"
      style={{ background: checked ? "var(--accent-gold)" : "var(--border-default)" }}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        aria-hidden
      />
    </button>
  );
}

export function IntroEditor({
  enabled, title, body, topic, lang, onChange,
}: {
  enabled: boolean;
  title: LocalisedText;
  body: LocalisedText;
  topic: string;
  lang: LangCode;
  onChange: (patch: { enabled?: boolean; title?: LocalisedText; body?: LocalisedText; topic?: string }) => void;
}) {
  // When the intro screen is ON, the Topic is what it's about — so it becomes
  // REQUIRED. Empty-while-on blocks progression to Campaigns/Deploy (enforced in
  // CreateWorkspace); here we spell that out and flag it inline.
  const topicMissing = enabled && (topic ?? "").trim().length === 0;
  const topicOverLimit = (topic?.length ?? 0) > MAX_TOPIC;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Intro screen</h3>
        <p className="text-sm mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>
          An optional welcome shown before the first question.
        </p>
      </div>

      {/* Topic — short, not per-language. Available regardless of the intro toggle
          (it can inform the creative), but REQUIRED once the intro screen is on,
          since it's the subject shown on that screen. Distinct from About Objective. */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label className="block text-sm font-semibold" htmlFor="survey-topic" style={{ color: "var(--text-primary)" }}>
            Topic{" "}
            <span className="font-normal" style={{ color: topicMissing ? "#B4694C" : "var(--text-tertiary)" }}>
              {enabled ? "(required for the intro screen)" : "(optional)"}
            </span>
          </label>
          <span className="text-[11px] fx-tabular-nums flex-shrink-0" style={{ color: topicOverLimit ? "#B4694C" : "var(--text-tertiary)" }}>
            {topic?.length ?? 0}/{MAX_TOPIC}
          </span>
        </div>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          A short subject for this survey (e.g. &ldquo;Matchday experience&rdquo;). One language, shared across the journey.
          {enabled ? " It appears on your intro screen, so set it to suit this survey." : ""}
        </p>
        <input
          id="survey-topic"
          type="text"
          value={topic}
          maxLength={MAX_TOPIC}
          onChange={(e) => onChange({ topic: e.target.value })}
          placeholder="e.g. Matchday experience"
          aria-invalid={topicMissing || undefined}
          className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
          style={{ background: "var(--surface)", borderColor: topicMissing ? "#E8D2C4" : "var(--border-default)", color: "var(--text-primary)" }}
        />
        {topicMissing && (
          <p className="mt-1.5 text-xs leading-snug flex items-start gap-1.5" style={{ color: "#B4694C" }} role="alert">
            <span aria-hidden>⚠</span>
            <span>Add a Topic for your intro screen to suit this survey. You&apos;ll need it before continuing to Campaigns, or you can turn the intro screen off below.</span>
          </p>
        )}
      </div>

      {/* Include-intro toggle — the toggle lives HERE, not in the journey. */}
      <div className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] p-3" style={{ background: "var(--surface-sunken)" }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Include an intro screen</p>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>
            {enabled ? "Fans see a welcome before Question 1." : "Fans go straight to Question 1."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>{enabled ? "On" : "Off"}</span>
          <Toggle checked={enabled} onChange={(v) => onChange({ enabled: v })} label="Include an intro screen" />
        </div>
      </div>

      {enabled && (
        <>
          <LocalisedTextControl
            label="Headline"
            value={title}
            lang={lang}
            max={SURVEY_LIMITS.MAX_INTRO_TITLE}
            onChange={(next) => onChange({ title: next })}
          />
          <LocalisedTextControl
            label="Short message"
            value={body}
            lang={lang}
            max={SURVEY_LIMITS.MAX_INTRO_BODY}
            onChange={(next) => onChange({ body: next })}
            multiline
            rows={2}
          />
          <p className="text-xs leading-relaxed rounded-[var(--radius-control)] p-3" style={{ color: "var(--text-tertiary)", background: "var(--surface-sunken)" }}>
            The mechanical line (&ldquo;N questions · Around ~Xs&rdquo;) and the <strong style={{ color: "var(--text-secondary)" }}>Start survey</strong> button
            are added automatically by the creative, so you don&apos;t author them here.
          </p>
        </>
      )}
    </div>
  );
}

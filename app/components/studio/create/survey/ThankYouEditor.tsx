"use client";

// ── ThankYouEditor (main pane) — INFORMATIONAL only ──────────────────────────
// V1 product rule: the completion frame is a MANDATORY, Fanometrix-owned Thank
// You. Its copy is NOT authored per survey — it comes from lib/system-thankyou.ts
// and is shown automatically in each of the survey's delivery languages. This
// panel explains that; it renders NO editable inputs (no fake disabled fields)
// and shows the exact copy a fan will see in the language currently being edited.

import type { LangCode } from "@/lib/survey-locale";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import { resolveSystemThankYou } from "@/lib/system-thankyou";
import { StudioIcon } from "../../studio-icons";

const LANG_LABEL: Record<string, string> = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]));

export function ThankYouEditor({
  lang, deliveryLanguages,
}: {
  /** The language currently being edited — the preview copy is shown for it. */
  lang: LangCode;
  /** All of the survey's delivery languages (the frame is shown in each). */
  deliveryLanguages: LangCode[];
}) {
  const copy = resolveSystemThankYou(lang);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Thank-you screen</h3>
        <p className="text-sm mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>
          The completion frame every fan sees after they submit.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-[var(--radius-control)] p-3.5" style={{ background: "var(--accent-wash)" }}>
        <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }} aria-hidden><StudioIcon.check size={16} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Managed by Fanometrix</p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            This closing message is written and maintained centrally, so every survey ends consistently. It appears
            automatically in each of your delivery languages, so there&apos;s nothing to author here.
          </p>
        </div>
      </div>

      {/* Exactly what a fan sees, in the language being edited. */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          Shown in {LANG_LABEL[lang] ?? lang}
        </p>
        <div className="rounded-[var(--radius-control)] border p-4 text-center" style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}>
          <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{copy.title}</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{copy.body}</p>
        </div>
      </div>

      {deliveryLanguages.length > 1 && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Delivered in: {deliveryLanguages.map((c) => LANG_LABEL[c] ?? c).join(", ")}.
        </p>
      )}
    </div>
  );
}

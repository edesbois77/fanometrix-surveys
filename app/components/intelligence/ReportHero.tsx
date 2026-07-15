"use client";

// The report "cover" moment — extracted from two treatments that already
// existed and were never meant to diverge on purpose: Executive Report's
// on-screen gradient cover (no inline-editable headline; editing happens
// in the Research Answer band below it, so the hero itself just
// disappears while editing) and Survey/Conversation Intelligence's flat
// navy hero (byte-identical between the two, headline editable inline).
// Only these two variants exist because only these two treatments existed
// — Key Findings has never had a hero and doesn't gain one here.
import type { ReactNode } from "react";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

export function ReportHero({
  variant, kicker, headline, subtitle, syntheticNotice, editing, onHeadlineChange,
}: {
  variant: "gradient" | "flat";
  /** Small uppercase label above the headline — Executive's static
   * "Fanometrix, Executive Report" branding, or Survey/Conversation's
   * dynamic "N responses/mentions · date" line. */
  kicker?: ReactNode;
  headline: string;
  /** Gradient variant only — rendered below the headline (Executive shows
   * "{project} · {date}" here). */
  subtitle?: ReactNode;
  /** Gradient variant only — Executive's "Simulated Research" pill. */
  syntheticNotice?: string | null;
  editing?: boolean;
  /** Flat variant only — headline becomes an input while editing;
   * gradient's hero has no inline edit affordance at all (unchanged from
   * the original Executive Report page, where editing happens in a
   * different band entirely). */
  onHeadlineChange?: (value: string) => void;
}) {
  if (variant === "gradient") {
    // Matches the original page exactly: the gradient hero simply isn't
    // rendered while editing, same as `{!editing && (...)}` did inline.
    if (editing) return null;
    return (
      <div className="rounded-2xl px-7 py-8 print:hidden text-center" style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #060D16 100%)` }}>
        {syntheticNotice && (
          <div className="inline-block mb-5 px-3 py-1.5 rounded-full" style={{ background: "rgba(215,184,122,0.12)", border: `1px solid ${GOLD}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>Simulated Research, Synthetic Data Only</p>
          </div>
        )}
        {kicker && (
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-3" style={{ color: GOLD }}>{kicker}</p>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight max-w-2xl mx-auto" style={{ textWrap: "balance" }}>
          {headline}
        </h1>
        {subtitle && <p className="text-sm text-white/40 mt-4">{subtitle}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 text-center" style={{ background: NAVY }}>
      {kicker && (
        <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>{kicker}</p>
      )}
      {editing ? (
        <input value={headline} onChange={e => onHeadlineChange?.(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xl font-bold text-white text-center placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
      ) : (
        <h2 className="text-xl font-bold text-white leading-tight">{headline}</h2>
      )}
    </div>
  );
}

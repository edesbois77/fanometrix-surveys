"use client";

// ── CreativeCardPreview — an authentic, non-interactive card render ───────────
// Renders the REAL production creative (via CreativeDesignPreview's `bare`
// variant — the same ThemedSurvey/ClassicSurvey/Stack-iframe an impression uses)
// scaled to fit a card, so the user sees what each design actually looks like
// without opening the modal. Deliberately:
//   • LAZY — the real renderer mounts only when the card nears the viewport
//     (IntersectionObserver), so a long library doesn't mount every renderer at
//     once; a skeleton shows until then.
//   • SCALED — a ResizeObserver measures the card width and scales the native
//     300×250 render to fit (no magic numbers, responsive-safe).
//   • STATIC & NON-INTERACTIVE — `staticFrame` freezes the representative
//     question frame (Countdown's countdown is frozen, Stack starts on a research
//     question not its intro, Classic is already static) and pointer-events:none
//     means no clicks reach it. So the card is a still image of the mechanic.
// The full, exact (animated) production Preview stays available in the modal.

import { useEffect, useRef, useState } from "react";
import { CreativeDesignPreview, type CreativeDesignRow } from "@/app/components/CreativeDesignPreview";

const NATIVE_W = 300;
const NATIVE_H = 250;
// The representative render stays the primary visual, but it is capped at (just
// under) its native 300×250 rather than stretching to the full card width. On
// desktop that keeps each type card compact — Countdown + Stack sit within the
// initial viewport with Classic beginning below — while the mechanic is still
// shown at full, legible fidelity (never a tiny thumbnail). The cap is a MAX: on
// a narrow (mobile) card the box shrinks to the column and the render scales down.
const MAX_W = 280;

export function CreativeCardPreview({ design }: { design: CreativeDesignRow }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / NATIVE_W);
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  const ready = inView && scale > 0;

  return (
    // Centre the capped render on a sunken surface so the card reads as a compact,
    // deliberate presentation frame rather than an edge-to-edge banner.
    <div className="w-full flex justify-center px-4 pt-4 pb-4" style={{ background: "var(--surface-sunken)" }}>
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-[10px]"
        style={{ width: `min(100%, ${MAX_W}px)`, aspectRatio: "6 / 5", background: "#0B1929", pointerEvents: "none", boxShadow: "var(--shadow-sm)" }}
        aria-hidden
      >
        {!ready && <div className="absolute inset-0 animate-pulse" style={{ background: "var(--surface-sunken)" }} />}
        {ready && (
          <div style={{ position: "absolute", top: 0, left: 0, width: NATIVE_W, height: NATIVE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <CreativeDesignPreview design={design} variant="bare" staticFrame />
          </div>
        )}
      </div>
    </div>
  );
}

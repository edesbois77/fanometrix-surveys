"use client";

import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 256; // px, matches w-64

/**
 * Small "ⓘ" icon that reveals an explanatory popover on hover (desktop) or
 * tap (touch, since touch devices have no hover) — toggled via click state
 * rather than pure CSS so it works reliably on both.
 *
 * Renders the popover into a portal positioned by viewport coordinates
 * rather than as a normal absolutely-positioned child, because the button
 * usually sits inside a card with `overflow-hidden` (for rounded corners),
 * which would otherwise clip the popover.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="More information"
        className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-semibold border border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
      >
        i
      </button>
      {open && pos && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
          className="z-50 text-xs leading-relaxed text-gray-600 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}

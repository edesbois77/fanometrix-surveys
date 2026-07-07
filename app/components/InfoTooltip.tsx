"use client";

import { useState } from "react";

/**
 * Small "ⓘ" icon that reveals an explanatory popover on hover (desktop) or
 * tap (touch, since touch devices have no hover) — toggled via click state
 * rather than pure CSS so it works reliably on both.
 */
export function InfoTooltip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="More information"
        className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-semibold border border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
      >
        i
      </button>
      {open && (
        <div
          className={`absolute z-20 top-5 ${align === "left" ? "left-0" : "right-0"} w-64 text-xs leading-relaxed text-gray-600 bg-white border border-gray-200 rounded-lg shadow-lg p-3`}
        >
          {text}
        </div>
      )}
    </span>
  );
}

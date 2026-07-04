"use client";

import { useRef, useState } from "react";

const NAVY    = "#0B1929";
const GREY    = "#6B7280";
const BORDER  = "#E5E7EB";
const SURFACE = "#F1F2F5";

type Item = { label: string; body: string; icon: React.ReactNode };

export function BuiltForCarousel({ items }: { items: Item[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const scrollToIndex = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.min(items.length - 1, Math.max(0, idx)));
  };

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(({ label, body, icon }) => (
          <div key={label} className="snap-center shrink-0 w-full flex flex-col items-center text-center px-10">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-5" style={{ background: SURFACE }}>
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={NAVY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </div>
            <h3 className="text-[16px] font-bold mb-2.5 tracking-[-0.01em]" style={{ color: NAVY }}>{label}</h3>
            <p className="text-sm leading-relaxed" style={{ color: GREY }}>{body}</p>
          </div>
        ))}
      </div>

      {/* Prev / dots / Next — normal flow row beneath the card, not overlaid */}
      <div className="flex items-center justify-center gap-6 mt-7">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scrollToIndex(active - 1)}
          disabled={active === 0}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white border shadow-sm disabled:opacity-30 transition-opacity"
          style={{ borderColor: BORDER }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={NAVY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              aria-label={`Go to ${item.label}`}
              onClick={() => scrollToIndex(i)}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === active ? 18 : 7,
                height: 7,
                background: i === active ? NAVY : BORDER,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Next"
          onClick={() => scrollToIndex(active + 1)}
          disabled={active === items.length - 1}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white border shadow-sm disabled:opacity-30 transition-opacity"
          style={{ borderColor: BORDER }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={NAVY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

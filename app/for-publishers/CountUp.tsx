"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gentle number count-up that fires once when the element scrolls into view.
 * Respects prefers-reduced-motion (renders the final value immediately) and
 * falls back to the final value where IntersectionObserver is unavailable.
 */
export function CountUp({
  to,
  duration = 1600,
  className,
  style,
  format = (n: number) => n.toLocaleString(),
}: {
  to: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  format?: (n: number) => string;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      // Defer the final-value set out of the effect body (avoids sync setState).
      const raf = requestAnimationFrame(() => setVal(to));
      return () => cancelAnimationFrame(raf);
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setVal(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { run(); obs.disconnect(); } }),
      { threshold: 0.4 }
    );
    obs.observe(el);

    // Safety fallback — reveal the final value if the observer never fires.
    const timer = setTimeout(() => { if (!started.current) setVal(to); }, 3000);

    return () => { obs.disconnect(); clearTimeout(timer); };
  }, [to, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {format(val)}
    </span>
  );
}

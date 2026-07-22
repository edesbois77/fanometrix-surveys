"use client";

import { useEffect, useState } from "react";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";
const MUTED = "#9CA3AF";

export type TocItem = { id: string; label: string };

/**
 * Sticky, scroll-spy table of contents for the Reddit Trust Centre page.
 *
 * Desktop-only (the parent hides it below `lg`). Uses IntersectionObserver to
 * highlight the section currently in view, and intercepts clicks for smooth
 * scrolling with a header offset (native anchor jumps would sit under the
 * sticky header). Falls back to plain anchor links if JS is disabled, the
 * `href` values are real fragment links.
 */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map(i => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    // A section counts as "current" once its heading passes ~120px from the
    // top. rootMargin pulls the active line down as the reader scrolls.
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 }
    );

    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return; // let the browser fall back to the native anchor jump
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  return (
    <nav aria-label="On this page" className="text-sm">
      <p
        className="font-semibold uppercase tracking-[0.16em] mb-4"
        style={{ fontSize: 11, color: MUTED }}
      >
        On this page
      </p>
      <ul className="space-y-0.5 border-l" style={{ borderColor: "#E5E7EB" }}>
        {items.map(item => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={e => handleClick(e, item.id)}
                className="block py-1.5 pl-4 -ml-px border-l-2 leading-snug transition-colors duration-150"
                style={{
                  borderColor: isActive ? GOLD : "transparent",
                  color: isActive ? NAVY : "#6B7280",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

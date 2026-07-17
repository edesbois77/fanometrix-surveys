"use client";

// ── Icon set ─────────────────────────────────────────────────────────────────
// A small, consistent line-icon set for the intelligence components. Monoline,
// 1.5px stroke, currentColor — so an icon inherits the ink of whatever it sits
// in and stays visually quiet. Deliberately minimal: only the glyphs the
// component library actually uses. Prefer these over emoji for a premium,
// uniform feel.

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function svg(path: React.ReactNode, { size = 16, className = "", strokeWidth = 1.5 }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      {path}
    </svg>
  );
}

export const Icon = {
  survey: (p: IconProps) => svg(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>, p),
  conversation: (p: IconProps) => svg(<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5A8 8 0 1 1 21 12Z" />, p),
  document: (p: IconProps) => svg(<><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M9 13h6M9 17h6" /></>, p),
  sparkles: (p: IconProps) => svg(<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" /><path d="M18 15l.7 1.8L20.5 17l-1.8.7L18 19.5l-.7-1.8L15.5 17l1.8-.2Z" /></>, p),
  clock: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p),
  chart: (p: IconProps) => svg(<><path d="M4 20V4M4 20h16" /><path d="M8 16v-3M12 16V8M16 16v-6" /></>, p),
  filter: (p: IconProps) => svg(<path d="M3 5h18l-7 8v5l-4 2v-7Z" />, p),
  search: (p: IconProps) => svg(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, p),
  quote: (p: IconProps) => svg(<path d="M9 7H5v6h4v-2H7a2 2 0 0 1 2-2Zm10 0h-4v6h4v-2h-2a2 2 0 0 1 2-2Z" strokeWidth={0} />, { ...p, strokeWidth: 0 }),
  chevronRight: (p: IconProps) => svg(<path d="m9 6 6 6-6 6" />, p),
  chevronDown: (p: IconProps) => svg(<path d="m6 9 6 6 6-6" />, p),
  external: (p: IconProps) => svg(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>, p),
  check: (p: IconProps) => svg(<path d="m5 12 4 4 10-10" />, p),
  alert: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>, p),
  info: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>, p),
  arrowUp: (p: IconProps) => svg(<path d="M12 19V5M6 11l6-6 6 6" />, p),
  arrowDown: (p: IconProps) => svg(<path d="M12 5v14M6 13l6 6 6-6" />, p),
  close: (p: IconProps) => svg(<path d="M6 6l12 12M18 6 6 18" />, p),
  target: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>, p),
  globe: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></>, p),
  bulb: (p: IconProps) => svg(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0 0 12 3Z" /></>, p),
  layers: (p: IconProps) => svg(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>, p),
};

export type IconName = keyof typeof Icon;

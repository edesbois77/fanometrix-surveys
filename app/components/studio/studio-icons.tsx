"use client";

// ── Survey Studio icon set ───────────────────────────────────────────────────
// The glyphs the new product shell needs that the workspace-ui Icon set doesn't
// already carry (home, create, request, discover, manage, the product switcher,
// org, account, menu, sign-out). Same drawing language as
// app/components/workspace-ui/icons.tsx — monoline, 1.5px stroke, currentColor,
// 24×24 — so a Studio glyph and a workspace glyph read as one family. Kept in a
// separate file so the new shell never has to edit the shared workspace icons.

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function svg(path: React.ReactNode, { size = 18, className = "", strokeWidth = 1.5 }: IconProps) {
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

export const StudioIcon = {
  // Sidebar
  home:     (p: IconProps) => svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>, p),
  create:   (p: IconProps) => svg(<><path d="M12 3v18M3 12h18" /></>, p),
  request:  (p: IconProps) => svg(<><path d="M3 13h4l2 3h6l2-3h4" /><path d="M4 13 6 5h12l2 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /></>, p),
  discover: (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>, p),
  manage:   (p: IconProps) => svg(<><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="8" cy="18" r="1.6" fill="currentColor" stroke="none" /></>, p),

  // Shell furniture
  studio:   (p: IconProps) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 14h5M8 17h8" /></>, p),
  archive:  (p: IconProps) => svg(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></>, p),
  apps:     (p: IconProps) => svg(<><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>, p),
  org:      (p: IconProps) => svg(<><path d="M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15" /><path d="M14 21V10h5a1 1 0 0 1 1 1v10" /><path d="M7.5 9h3M7.5 13h3M7.5 17h3M17 14h.5M17 18h.5" /></>, p),
  user:     (p: IconProps) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, p),
  menu:     (p: IconProps) => svg(<><path d="M3 6h18M3 12h18M3 18h18" /></>, p),
  logout:   (p: IconProps) => svg(<><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h11" /></>, p),
  chevronDown: (p: IconProps) => svg(<path d="m6 9 6 6 6-6" />, p),
  bell:     (p: IconProps) => svg(<><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>, p),
  arrowRight: (p: IconProps) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, p),
  check:    (p: IconProps) => svg(<path d="m5 12.5 4.5 4.5L19 7" />, p),
  trash:    (p: IconProps) => svg(<><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" /><path d="M10 11v6M14 11v6" /></>, p),
} as const;

export type StudioIconName = keyof typeof StudioIcon;

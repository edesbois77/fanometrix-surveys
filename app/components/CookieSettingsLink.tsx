"use client";

// Discreet footer link that re-opens the consent banner so a visitor can change
// or withdraw their analytics choice at any time. Styled by the caller (pass
// className/style) so it blends into whichever footer it sits in.

import { openCookieSettings } from "@/lib/consent";

export function CookieSettingsLink({
  className,
  style,
  label = "Cookie Settings",
}: {
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  return (
    <button type="button" onClick={openCookieSettings} className={className} style={style}>
      {label}
    </button>
  );
}

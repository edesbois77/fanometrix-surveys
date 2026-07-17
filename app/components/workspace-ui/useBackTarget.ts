"use client";

// Dynamic back navigation. Pages declare their hierarchical parent as a
// fallback, but a link that navigates INTO a page can attach where it came from
// via ?returnTo (+ ?backLabel); the destination's back button then returns
// exactly there. Predictable by default (the parent), origin-aware when an entry
// point opts in — and, unlike history.back(), it keeps a real label and survives
// refresh / deep links / new tabs because the origin lives in the URL.
import { useSearchParams } from "next/navigation";

/**
 * Append an origin to a link so the destination can return exactly here. Only
 * same-origin internal paths are carried (leading "/", not protocol-relative
 * "//"), so a crafted returnTo can never turn the back button into an
 * open-redirect off-site.
 */
export function withReturn(href: string, returnTo: string, backLabel?: string): string {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return href;
  const params = new URLSearchParams({ returnTo });
  if (backLabel) params.set("backLabel", backLabel);
  return `${href}${href.includes("?") ? "&" : "?"}${params}`;
}

/**
 * Resolve a page's back target: an explicit, safe ?returnTo (+ ?backLabel) when
 * an entry point supplied one, otherwise the page's declared hierarchical parent.
 */
export function useBackTarget(fallback: { href: string; label: string }): { href: string; label: string } {
  const sp = useSearchParams();
  const to = sp.get("returnTo");
  if (to && to.startsWith("/") && !to.startsWith("//")) {
    const label = sp.get("backLabel");
    return { href: to, label: label ? `Back to ${label}` : "Back" };
  }
  return fallback;
}

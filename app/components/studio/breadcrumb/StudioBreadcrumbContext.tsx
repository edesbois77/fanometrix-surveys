"use client";

// ── Survey Studio breadcrumb context ─────────────────────────────────────────
// A tiny label registry so a detail page can supply the human name for a dynamic
// route segment (Study/Survey/Request/Report) that the shell-level breadcrumb
// otherwise couldn't know. The page calls useStudioBreadcrumbLabel(id, name); the
// breadcrumb reads the map by id. NOT a navigation system — purely a name channel,
// so the trail never has to show a raw id. Scoped to the Survey Studio shell.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Ctx = { labels: Record<string, string>; setLabel: (key: string, label: string | null) => void };
const StudioBreadcrumbContext = createContext<Ctx | null>(null);

export function StudioBreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const setLabel = useCallback((key: string, label: string | null) => {
    setLabels((prev) => {
      if (label == null) { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; }
      if (prev[key] === label) return prev;
      return { ...prev, [key]: label };
    });
  }, []);
  const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel]);
  return <StudioBreadcrumbContext.Provider value={value}>{children}</StudioBreadcrumbContext.Provider>;
}

export function useBreadcrumbLabels(): Record<string, string> {
  return useContext(StudioBreadcrumbContext)?.labels ?? {};
}

/** Register the display name for a dynamic route segment (keyed by its id). Pass a
 *  falsy label while loading — the breadcrumb shows a loading placeholder, never
 *  the id. Automatically cleared on unmount. No-op outside the provider.
 *
 *  Depends on the STABLE `setLabel` (not the context object) — depending on the
 *  whole context would re-run this effect every time any label changes, and its
 *  set→cleanup→set cycle would loop forever. */
export function useStudioBreadcrumbLabel(key: string | null | undefined, label: string | null | undefined): void {
  const setLabel = useContext(StudioBreadcrumbContext)?.setLabel;
  useEffect(() => {
    if (!setLabel || !key) return;
    setLabel(key, label && label.trim() ? label : null);
    return () => setLabel(key, null);
  }, [setLabel, key, label]);
}

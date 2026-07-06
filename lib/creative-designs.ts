"use client";

/**
 * Fixed Theme classification for the creative_designs table (a stable,
 * curated list — same pattern as research_projects.study_type — not itself
 * a lookup table). Every actual Design (built-in or custom) lives in the
 * creative_designs table; see /api/creative-designs and
 * app/components/CreativeDesignPicker.tsx / CreativeDesignPreview.tsx.
 */

import { useEffect, useState } from "react";

export type DesignCategory = "fanometrix" | "brand" | "tournament" | "publisher";

export const DESIGN_CATEGORIES: { id: DesignCategory; label: string }[] = [
  { id: "fanometrix", label: "Fanometrix" },
  { id: "brand", label: "Brand Theme" },
  { id: "tournament", label: "Tournament Theme" },
  { id: "publisher", label: "Publisher Theme" },
];

/** Slug → display name lookup for every design, fetched once client-side. */
export function useCreativeDesignNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const rows = (json?.data ?? []) as { slug: string; name: string }[];
        setNames(Object.fromEntries(rows.map(r => [r.slug, r.name])));
      })
      .catch(() => {});
  }, []);
  return names;
}

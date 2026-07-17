"use client";

// Project-scoped survey responses for the Dashboard Overview. The Overview reuses
// PerformanceHighlights + InsightsEngine (which operate on raw responses), so it
// needs the project's responses; the Survey Intelligence sub-page self-fetches
// its own scoped data via SurveyDashboardBody. This is a plain hook (no provider)
// so only the Overview pays for the fetch — the other sub-pages never load it.
//
// Responses are scoped to THIS project's campaigns: /api/responses already
// supports research_project_id server-side, and we additionally guard by
// campaign slug client-side.
import { useEffect, useRef, useState } from "react";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import type { SurveyResponse } from "@/lib/types";

/** The project's survey responses: null while loading, then the scoped rows. */
export function useProjectResponses(): SurveyResponse[] | null {
  const { projectId, project, campaigns } = useResearchProject();
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!project || fetchedRef.current) return;
    fetchedRef.current = true;
    const slugs = new Set(campaigns.map(c => c.campaign_id));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/responses?research_project_id=${projectId}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const rows: SurveyResponse[] = (json.data ?? []).filter((r: SurveyResponse) => slugs.size === 0 || slugs.has(r.campaign_id));
        if (!cancelled) setResponses(rows);
      } catch {
        if (!cancelled) setResponses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, project, campaigns]);

  return responses;
}

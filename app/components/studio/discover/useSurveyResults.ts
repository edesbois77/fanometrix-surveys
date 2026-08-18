"use client";

// Governed Results consumer — fetches the Phase 4 Results contract for one
// authorised survey. Consumes server-computed per-question distributions; never
// derives results client-side, never fetches raw rows. Re-runs on org/survey/filters.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { ResultsResponse } from "@/app/api/survey-studio/discover/dashboards/[surveyId]/results/route";

export type SurveyResultsState = { loading: boolean; error: boolean; data: ResultsResponse | null };

export function useSurveyResults(surveyId: string, filters: Record<string, string>, enabled = true): SurveyResultsState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [state, setState] = useState<SurveyResultsState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ loading: true, error: false, data: null });
    try {
      const res = await fetch(`/api/survey-studio/discover/dashboards/${encodeURIComponent(surveyId)}/results${qs ? `?${qs}` : ""}`);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      setState({ loading: false, error: false, data: (await res.json()) as ResultsResponse });
    } catch { setState({ loading: false, error: true, data: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, qs, orgId, enabled]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);
  return state;
}

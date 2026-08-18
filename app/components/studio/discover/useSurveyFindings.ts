"use client";

// Governed Findings consumer — fetches the deterministic, evidence-backed
// findings for one authorised survey. Server-computed; never derives findings or
// fetches raw rows client-side. Re-runs on org/survey/filters.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { FindingsResponse } from "@/app/api/survey-studio/discover/dashboards/[surveyId]/findings/route";

export type SurveyFindingsState = { loading: boolean; error: boolean; data: FindingsResponse | null };

export function useSurveyFindings(surveyId: string, filters: Record<string, string>, enabled = true, reloadKey = 0): SurveyFindingsState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [state, setState] = useState<SurveyFindingsState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ loading: true, error: false, data: null });
    try {
      const res = await fetch(`/api/survey-studio/discover/dashboards/${encodeURIComponent(surveyId)}/findings${qs ? `?${qs}` : ""}`);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      setState({ loading: false, error: false, data: (await res.json()) as FindingsResponse });
    } catch { setState({ loading: false, error: true, data: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, qs, orgId, enabled, reloadKey]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);
  return state;
}

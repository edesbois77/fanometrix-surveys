"use client";

// ── Discover → Dashboards → Performance — governed data consumer ─────────────
// Fetches the Phase 3 Performance contract for one authorised Survey. Consumes
// what the server computed — it derives no analytics client-side and fetches no
// raw response rows. Re-runs when the Current Organisation, survey or filters
// change, so every scope is re-resolved server-side.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { PerformanceResponse } from "@/lib/studio/dashboard-performance";

export type SurveyPerformanceState = {
  loading: boolean;
  error: boolean;
  data: PerformanceResponse | null;
};

export function useSurveyPerformance(surveyId: string, filters: Record<string, string>, enabled = true): SurveyPerformanceState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [state, setState] = useState<SurveyPerformanceState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return; // preview harness supplies data directly; no fetch
    setState({ loading: true, error: false, data: null });
    try {
      const url = `/api/survey-studio/discover/dashboards/${encodeURIComponent(surveyId)}/performance${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      setState({ loading: false, error: false, data: (await res.json()) as PerformanceResponse });
    } catch {
      setState({ loading: false, error: true, data: null });
    }
    // orgId intentional: re-resolve when the platform Current Organisation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, qs, orgId, enabled]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  return state;
}

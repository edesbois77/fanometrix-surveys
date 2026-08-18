"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { StudyResponse } from "@/lib/studio/dashboard-study";

export type StudyDashboardState = { loading: boolean; error: boolean; data: StudyResponse | null };

export function useStudyDashboard(studyId: string, filters: Record<string, string> = {}, enabled = true): StudyDashboardState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const [state, setState] = useState<StudyDashboardState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ loading: true, error: false, data: null });
    try {
      const res = await fetch(`/api/survey-studio/discover/dashboards/study/${encodeURIComponent(studyId)}${qs ? `?${qs}` : ""}`);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      setState({ loading: false, error: false, data: (await res.json()) as StudyResponse });
    } catch { setState({ loading: false, error: true, data: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, qs, orgId, enabled]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);
  return state;
}

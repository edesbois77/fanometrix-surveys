"use client";

// ── Discover → Dashboards — governed context consumer ────────────────────────
// The ONLY source of Dashboard scope on the client. It calls the Phase 1 governed
// endpoint and consumes what the server decided — it NEVER derives Survey
// visibility, filter dimensions or values on the client, and never falls back to
// a global list. Re-runs when the platform Current Organisation changes (as
// useStudioHome does), so switching org re-resolves the whole scope server-side.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { DashboardContext } from "@/app/api/survey-studio/discover/dashboards/context/route";

export type DashboardsContextState = {
  loading: boolean;
  error: boolean;
  data: DashboardContext | null;
};

const CONTEXT_URL = "/api/survey-studio/discover/dashboards/context";

export function useDashboardsContext(_unused?: unknown, enabled = true): DashboardsContextState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const [state, setState] = useState<DashboardsContextState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return; // preview harness supplies data directly
    setState({ loading: true, error: false, data: null });
    try {
      const res = await fetch(CONTEXT_URL);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      const json = (await res.json()) as DashboardContext;
      setState({ loading: false, error: false, data: json });
    } catch {
      setState({ loading: false, error: true, data: null });
    }
    // orgId is an intentional dependency: re-resolve when the platform Current
    // Organisation changes, even though the fetch reads it server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  return state;
}

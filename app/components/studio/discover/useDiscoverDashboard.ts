"use client";

// ── Discover → Dashboard — governed data consumer ────────────────────────────
// The ONLY client source for the Dashboard. It calls the governed endpoint and
// renders what the server decided — it NEVER derives findings, analysis visibility,
// or entitlement on the client, and never invokes a model. Re-runs when the
// platform Current Organisation changes so the whole scope re-resolves server-side.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import type { DiscoverDashboardData } from "@/app/api/survey-studio/discover/dashboard/route";

export type DiscoverDashboardState = {
  loading: boolean;
  error: boolean;
  data: DiscoverDashboardData | null;
};

const URL = "/api/survey-studio/discover/dashboard";

export function useDiscoverDashboard(enabled = true): DiscoverDashboardState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const [state, setState] = useState<DiscoverDashboardState>({ loading: enabled, error: false, data: null });

  const load = useCallback(async () => {
    if (!enabled) return; // preview harness supplies data directly
    setState({ loading: true, error: false, data: null });
    try {
      const res = await fetch(URL);
      if (!res.ok) { setState({ loading: false, error: true, data: null }); return; }
      const json = (await res.json()) as DiscoverDashboardData;
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

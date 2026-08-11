"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type SessionUser = {
  workEmail: string;
  firstName: string | null;
  lastName: string | null;
  role: "admin" | "brand" | "agency" | "publisher";
  organisationId: string | null;
  organisationName: string | null;
  organisationType: "publisher" | "agency" | "brand" | "internal" | null;
  accessScope: "organisation_wide" | "selected";
  canPresentSimulations: boolean;
};

// ORG-006 WP-01 (IS-01) — the platform-owned Organisation Context, distinct from
// the session user. Accessible Organisation Set ≠ Remembered ≠ Current: the set is
// `accessibleOrganisations`; the Current Organisation is `currentOrganisationId`;
// the governed status drives the 0/1/many experience.
export type OrganisationRef = { id: string; name: string | null };
export type OrganisationContext = {
  status: "resolved" | "selection_required" | "no_access" | "indeterminate";
  currentOrganisationId: string | null;
  accessibleOrganisations: OrganisationRef[];
};
export type SessionIdentity = { workEmail: string; firstName: string | null; lastName: string | null };

const NO_CONTEXT: OrganisationContext = { status: "no_access", currentOrganisationId: null, accessibleOrganisations: [] };

type SessionContextValue = {
  user: SessionUser | null;
  identity: SessionIdentity | null;
  organisationContext: OrganisationContext;
  loading: boolean;
  refresh: () => void;
  /** Select or switch the Current Organisation (governed operation). On success the
   *  page is reloaded so all Organisation-scoped product data re-resolves under the
   *  new Current Organisation. Never mutates the Accessible Organisation Set. */
  switchOrganisation: (organisationId: string) => Promise<{ ok: boolean; error?: string }>;
};

const SessionContext = createContext<SessionContextValue>({
  user: null,
  identity: null,
  organisationContext: NO_CONTEXT,
  loading: true,
  refresh: () => {},
  switchOrganisation: async () => ({ ok: false }),
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [organisationContext, setOrganisationContext] = useState<OrganisationContext>(NO_CONTEXT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      setUser(json.user ?? null);
      setIdentity(json.identity ?? null);
      setOrganisationContext(json.organisationContext ?? NO_CONTEXT);
    } catch {
      setUser(null);
      setIdentity(null);
      setOrganisationContext(NO_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { refresh(); }, [refresh]);

  const switchOrganisation = useCallback(async (organisationId: string) => {
    try {
      const res = await fetch("/api/auth/active-organisation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return { ok: false, error: j.error ?? "Could not switch organisation." };
      }
      // Re-resolve everything under the new Current Organisation.
      if (typeof window !== "undefined") window.location.reload();
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not switch organisation." };
    }
  }, []);

  return (
    <SessionContext.Provider value={{ user, identity, organisationContext, loading, refresh, switchOrganisation }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

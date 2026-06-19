"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type SessionUser = {
  username: string;
  role: "admin" | "brand" | "agency" | "publisher";
  organisationName: string | null;
  allowedCampaignIds: string[];
  allowedPublisherIds: string[];
};

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => void;
};

const SessionContext = createContext<SessionContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch("/api/auth/me");
      const json = await res.json();
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

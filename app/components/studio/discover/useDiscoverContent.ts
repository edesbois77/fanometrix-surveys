"use client";

// ── Discover → Overview → "From Fanometrix" — governed editorial content ─────
// Reuses the EXISTING governed endpoint GET /api/insights, which already applies
// filterInsights (public → all logged-in users; restricted → allowed_organisation_ids;
// admin_only → operators). The client renders only what the server returns — it never
// derives visibility. This is Fanometrix-published market-wide content, entitlement-
// governed SEPARATELY from per-survey Discover scope (by design), so a caller with no
// research of their own still has something useful to read.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";

export type DiscoverContentItem = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  content_type: string;
  summary: string | null;
  featured_image_url: string | null;
  published_at: string | null;
};

export type DiscoverContentState = { loading: boolean; error: boolean; items: DiscoverContentItem[] };

const URL = "/api/insights";

export function useDiscoverContent(enabled = true): DiscoverContentState {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const [state, setState] = useState<DiscoverContentState>({ loading: enabled, error: false, items: [] });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ loading: true, error: false, items: [] });
    try {
      const res = await fetch(URL);
      if (!res.ok) { setState({ loading: false, error: true, items: [] }); return; }
      const json = (await res.json()) as { data?: DiscoverContentItem[] };
      // Already governed + published_at DESC by the endpoint. Only 'published' reaches
      // a non-operator; guard defensively for the shape we render.
      const items = (json.data ?? []).filter((i) => i && i.slug && i.title);
      setState({ loading: false, error: false, items });
    } catch {
      setState({ loading: false, error: true, items: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  return state;
}

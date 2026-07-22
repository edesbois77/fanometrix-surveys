"use client";

// Evidence Strategy — the Research Design workspace. The user approves the
// research STRATEGY here, never the search terms: what we need to learn, whether
// that evidence plausibly exists, and how we propose to obtain it. Searches are
// generated from an approved strategy, not authored by hand.
import { EvidenceStrategyWorkspace } from "@/app/components/research-projects/design/EvidenceStrategyWorkspace";

export default function EvidenceStrategyPage() {
  return <EvidenceStrategyWorkspace />;
}

// Server-only. What each research METHOD can actually do today — the ground truth
// the Research Plan advisor is constrained by so it never recommends a dead source
// (docs/research-plan-blueprint.md §8). Conversation availability is derived from
// the connector registry (`isConfigured()`); survey + document are native methods;
// news has no connector yet.
import { CONNECTORS } from "@/lib/connectors";
import type { EvidenceMethod } from "@/lib/research-plan";

export type MethodAvailability = {
  method: EvidenceMethod;
  available: boolean;
  note: string | null;
  sources: string[];   // human names of the usable sources for this method
};

export function getMethodAvailability(): MethodAvailability[] {
  const configured = Object.values(CONNECTORS).filter(c => c.isConfigured());
  return [
    {
      method: "conversation",
      available: configured.length > 0,
      note: configured.length > 0 ? null : "No conversation connectors are configured",
      sources: configured.map(c => c.name),
    },
    { method: "survey",   available: true,  note: null, sources: ["Fanometrix Survey"] },
    { method: "document", available: true,  note: null, sources: ["Research Library"] },
    { method: "news",     available: false, note: "No news connector yet", sources: [] },
  ];
}

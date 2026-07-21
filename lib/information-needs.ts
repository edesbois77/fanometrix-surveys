// Information Needs — the platform-level, source-agnostic unit of research
// (docs/conversation-advisor.md, docs/research-methodology.md). An Information
// Need is an answerable sub-question about the world; a Research Theme groups
// needs under a Research Aspect (the durable organising unit shared with
// Analysis). NOTHING here is Conversation-Intelligence-specific: Survey
// Research, the Research Library and future intelligence products all consume
// this same shape.
//
// Ownership today is the Conversation Advisor (stored on social_searches), but
// this module deliberately carries NO knowledge of that storage. Read needs
// through resolveInformationNeeds (lib/research-sources/information-needs.ts),
// never by reaching into a search row — so when needs move to a project-level,
// versioned, approved Research Design, only the resolver changes.
//
// Client- and server-safe: pure types + pure helpers, no I/O.

// ── Method fit (a per-method assessment of a shared need) ─────────────────────
// NOTE: method_fit is one method's VERDICT on a need, not an intrinsic property
// of the need. The durable core of a need is { aspect, need } (+ a stable id in
// future); method_fit/rationale are an assessment that becomes per-method when
// multiple specialists weigh the same shared need.
export type MethodFit = "primary" | "supporting" | "conditional" | "not_suitable";

export const METHOD_FIT_LABEL: Record<MethodFit, string> = {
  primary:      "Primary method",
  supporting:   "Supporting",
  conditional:  "Conditional",
  not_suitable: "Not suitable",
};

// Badge tone for a method-fit verdict — values are workspace StatusBadge `Tone`s.
export const METHOD_FIT_TONE: Record<MethodFit, "success" | "neutral" | "warning" | "info"> = {
  primary: "success", supporting: "info", conditional: "warning", not_suitable: "neutral",
};

// ── Structure ─────────────────────────────────────────────────────────────────
export type InformationNeed = {
  need: string;          // an answerable sub-question about the world
  method_fit: MethodFit;
  rationale: string;     // why this method can (or can't) answer it
  // (future) id: a stable identity so evidence references survive re-wording —
  // added in seam 3 before significant production evidence accumulates.
};

// A Research Theme is a Research Aspect surfaced at the front of a briefing.
export type ResearchTheme = {
  aspect: string;        // short Title Case — the durable organising unit
  description: string;
  needs: InformationNeed[];
};

export type InformationNeeds = { themes: ResearchTheme[] };

// The flat {aspect, need} shape consumers judge/collect against (e.g. the
// conversation relevance classifier). The single neutral consumer contract.
export type FlatNeed = { aspect: string; need: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
// Every need across all themes (e.g. for counts).
export function allNeeds(needs: InformationNeeds): InformationNeed[] {
  return needs.themes.flatMap(t => t.needs);
}

// Flatten to the neutral {aspect, need} pairs, dropping empties. Accepts a
// loosely-typed object so it tolerates jsonb read straight from storage.
export function flattenNeeds(
  needs: { themes?: { aspect?: string; needs?: { need?: string }[] }[] } | null | undefined,
): FlatNeed[] {
  const out: FlatNeed[] = [];
  for (const t of needs?.themes ?? []) {
    const aspect = (t.aspect ?? "").trim();
    for (const n of t.needs ?? []) {
      const need = (n.need ?? "").trim();
      if (aspect && need) out.push({ aspect, need });
    }
  }
  return out;
}

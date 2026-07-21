// "Our Understanding" — the artefact the Overview (commissioning) page produces
// (docs/overview-page.md). Fanometrix's reflected understanding of the client's
// business problem, before any research is planned. It is LIVING ENGAGEMENT
// CONTEXT on the Research Project, and it PROPOSES the research question + the
// knowledge gaps that later flow into (and are owned by) the Research Design.
//
// Client- and server-safe: pure types + helpers, no I/O.

// Where a piece of understanding came from — a senior consultant distinguishes
// what the client TOLD them from what they INFERRED. The research question is
// always "proposed" (the Design owns it).
export type Provenance = "stated" | "inferred" | "proposed";

// A single reflected value with its provenance and (optional) brief citation.
export type Sourced = { value: string; provenance: Provenance; source: string | null };
export type SourcedList = { values: string[]; provenance: Provenance; source: string | null };

// A tension or assumption the advisor surfaces for the user to resolve.
export type UnderstandingTension = { kind: "tension" | "assumption"; message: string };

export type ProjectUnderstanding = {
  // The reflect-with-insight narrative — the problem restated sharper than given.
  reflection: string;
  // Structured, editable fields (each carries stated/inferred provenance).
  business_challenge: Sourced;
  objectives: SourcedList;
  research_question: Sourced;   // provenance is always "proposed"
  target_audience: Sourced;
  markets: SourcedList;
  deliverables: SourcedList;
  constraints: SourcedList;
  stakeholders: SourcedList;
  // Tensions / assumptions to resolve before planning.
  tensions: UnderstandingTension[];
  // Provenance / lineage.
  source_label: string | null;  // "Acme_UCL_Brief.pdf" or "Described challenge"
  generated_at: string | null;
  model: string | null;
  // The shared-understanding gate: planning begins only once confirmed.
  confirmed: boolean;
  confirmed_at: string | null;
};

// The ordered scalar/list fields, for uniform rendering + edit.
export const UNDERSTANDING_FIELDS = [
  { key: "business_challenge", label: "Business Challenge", kind: "scalar" },
  { key: "objectives",         label: "Objectives",        kind: "list"   },
  { key: "research_question",  label: "Research Question",  kind: "scalar" },
  { key: "target_audience",    label: "Target Audience",   kind: "scalar" },
  { key: "markets",            label: "Markets",           kind: "list"   },
  { key: "deliverables",       label: "Deliverables",      kind: "list"   },
  { key: "constraints",        label: "Constraints",       kind: "list"   },
  { key: "stakeholders",       label: "Stakeholders",      kind: "list"   },
] as const;

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  stated: "Stated", inferred: "Inferred", proposed: "Proposed",
};
// Tone values are workspace StatusBadge `Tone`s.
export const PROVENANCE_TONE: Record<Provenance, "info" | "neutral" | "accent"> = {
  stated: "info", inferred: "neutral", proposed: "accent",
};

export function emptyUnderstanding(): ProjectUnderstanding {
  const s: Sourced = { value: "", provenance: "inferred", source: null };
  const l: SourcedList = { values: [], provenance: "inferred", source: null };
  return {
    reflection: "",
    business_challenge: { ...s }, objectives: { ...l },
    research_question: { value: "", provenance: "proposed", source: null },
    target_audience: { ...s }, markets: { ...l }, deliverables: { ...l },
    constraints: { ...l }, stakeholders: { ...l }, tensions: [],
    source_label: null, generated_at: null, model: null,
    confirmed: false, confirmed_at: null,
  };
}

// Has this understanding been generated (vs an empty/absent one)?
export function hasUnderstanding(u: ProjectUnderstanding | null | undefined): boolean {
  return !!u && (!!u.reflection.trim() || !!u.business_challenge.value.trim() || !!u.research_question.value.trim());
}

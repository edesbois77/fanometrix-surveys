// The Brief — the FIRST of three artefacts a project produces, and the only purely
// FACTUAL one (docs/commissioning-journey.md):
//
//   Brief            what the client actually asked for (factual synthesis)
//   Engagement       what we believe the real problem is (consultative interpretation)
//   Research Design  how we propose to answer it (Planning)
//
// These are DISTINCT and must not be merged. The Brief carries no opinion: it simply
// proves Fanometrix has read and understood the supplied material, and it supports
// the Engagement rather than replacing it. It persists onto the project and surfaces
// (collapsed) on commissioning and the Overview.
//
// Client- and server-safe: pure types + helpers, no I/O.

export type Brief = {
  client: string | null;          // the brand/organisation named in the material
  commissioned_by: string | null; // who commissioned it (agency / person / team)
  campaign: string | null;        // the campaign or initiative named, if any
  geography: string | null;       // markets / regions stated
  audience: string | null;        // the target audience stated
  objectives: string[];           // objectives as STATED (not inferred)
  deliverables: string[];         // deliverables / outputs requested
  constraints: string[];          // timings, budget, mandatories stated
  summary: string;                // the AI Brief Summary, a neutral factual precis
  generated_at: string | null;
  model: string | null;
};

// Ordered scalar fields, for uniform rendering.
export const BRIEF_FIELDS = [
  { key: "client",          label: "Client" },
  { key: "commissioned_by", label: "Commissioned by" },
  { key: "campaign",        label: "Campaign" },
  { key: "geography",       label: "Geography" },
  { key: "audience",        label: "Audience" },
] as const;

// Ordered list fields.
export const BRIEF_LIST_FIELDS = [
  { key: "objectives",   label: "Objectives" },
  { key: "deliverables", label: "Deliverables" },
  { key: "constraints",  label: "Constraints" },
] as const;

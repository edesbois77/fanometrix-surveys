// Engagement Context — Fanometrix's STRUCTURED read of the situation, built in the
// Orient stage before any document is interpreted (docs/commissioning-journey.md).
//
// The progression a consultant actually follows:
//   Situation → Engagement Context → Understanding → Overview → Planning → …
//
// Situation is the raw reality the user hands over. Engagement Context is our
// structured understanding of it, and it becomes the PERSISTENT LENS through which
// every later stage is interpreted. Understanding is our first opinion, formed
// through that lens. This artefact is deliberately separate from Understanding so
// it can be corrected on its own terms, and everything downstream re-reads through
// the fix. The Adidas failure was an ORIENTATION error (a European pitch read as a
// North American market problem); a correctable lens is what prevents it.
//
// Client- and server-safe: pure types + helpers, no I/O.

// How sure we are of the CONTEXT itself — distinct from confidence in the read.
// Low context confidence is what drives orientation questions ("who actually owns
// this decision?") rather than clarifying questions about the brief.
export type ContextConfidence = "high" | "medium" | "low";

// What a given piece of material IS. Knowing a document is an agency pitch, not a
// client brief, changes how much its framing can be trusted.
export type MaterialType =
  | "client_brief" | "agency_pitch" | "email" | "meeting_notes"
  | "existing_research" | "proposal" | "commercial" | "concern" | "described" | "other";

export type MaterialItem = {
  label: string;        // "Adidas_EU_Brief.pdf", "Client email", "Described situation"
  type: MaterialType;   // what kind of thing it is
  note?: string | null; // one line on what it tells us / how far to trust it
};

export type EngagementContext = {
  // The spoken orientation — one or two plain sentences Fanometrix says back before
  // it reads anything closely. This is the visible, correctable beat.
  orientation: string;

  engagement_type: string | null;      // inferred; ties into the engagement-types lens
  organisation: string | null;         // the brand the work is ultimately about
  commissioner: string | null;         // who handed us the work (agency / person / team)
  decision: string | null;             // the decision they are trying to make
  commercial_objective: string | null; // the commercial outcome they are chasing
  market: string | null;               // geography / market scope — its OWN field on purpose
  intended_audience: string | null;    // who the eventual output must speak to

  available_materials: MaterialItem[];  // the inventory of what we actually have
  missing_information: string[];        // what a strategist notices is conspicuously absent

  confidence: ContextConfidence;        // confidence in the CONTEXT (not the read)
  generated_at: string | null;
  model: string | null;
};

// The ordered scalar fields, for uniform rendering of "the world I'm entering".
export const ENGAGEMENT_CONTEXT_FIELDS = [
  { key: "engagement_type",      label: "Engagement" },
  { key: "organisation",         label: "Organisation" },
  { key: "commissioner",         label: "Commissioned by" },
  { key: "market",               label: "Market" },
  { key: "intended_audience",    label: "Audience" },
  { key: "decision",             label: "Decision" },
  { key: "commercial_objective", label: "Commercial objective" },
] as const;

export const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  client_brief: "Client brief", agency_pitch: "Agency pitch", email: "Email",
  meeting_notes: "Meeting notes", existing_research: "Existing research",
  proposal: "Previous proposal", commercial: "Commercial context",
  concern: "A worry raised", described: "Described situation", other: "Material",
};

export const CONTEXT_CONFIDENCE_LABEL: Record<ContextConfidence, string> = {
  high: "I'm oriented", medium: "Roughly oriented", low: "Still getting my bearings",
};

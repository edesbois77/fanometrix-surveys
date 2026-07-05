/**
 * Shared creative design catalog for the survey MPU.
 * Used by the Campaigns editor (per-deployment design/override) and the
 * Research Project editor (the design inherited by every generated
 * deployment that hasn't overridden it — same null-means-inherit pattern as
 * Survey, dates, target responses, etc.).
 *
 * "Theme" (DesignCategory) is purely a classification used to filter this
 * catalog in the picker UI — it is never itself stored anywhere. Only a
 * Design `id` is persisted, on both `research_projects.creative_design` and
 * `campaigns.creative_design`.
 *
 * "Layout" determines which React component renders the design at embed
 * time (see the registry in app/embed/page.tsx) — adding a new design later
 * is one new component + one catalog entry + one registry line.
 */

export type DesignCategory = "fanometrix" | "brand" | "tournament" | "publisher";
export type DesignLayout = "timer" | "classic";

export type CreativeDesign = {
  id: string;
  name: string;
  category: DesignCategory;
  layout: DesignLayout;
  gradient: string;
  text: string;
};

export const DESIGN_CATEGORIES: { id: DesignCategory; label: string }[] = [
  { id: "fanometrix", label: "Fanometrix" },
  { id: "brand", label: "Brand Theme" },
  { id: "tournament", label: "Tournament Theme" },
  { id: "publisher", label: "Publisher Theme" },
];

export const CREATIVE_DESIGNS: CreativeDesign[] = [
  // Ids below are unchanged from the original CREATIVE_THEMES catalog — they
  // must keep matching ThemedSurvey.tsx's EMBED_THEMES keys and every
  // existing campaigns.creative_design row.
  { id: "classic", name: "Fanometrix Default", category: "fanometrix", layout: "classic", gradient: "linear-gradient(135deg,#071B2F,#0B1929)", text: "#D7B87A" },
  { id: "fanometrix", name: "Fanometrix Premium", category: "fanometrix", layout: "timer", gradient: "linear-gradient(135deg,#D7B87A,#A8864A)", text: "#041B33" },
  { id: "electric-football", name: "Electric Football", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#00F5A0,#00C2FF)", text: "#061A2F" },
  { id: "fan-energy", name: "Fan Energy", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#FF4FA3,#A855F7)", text: "#fff" },
  { id: "electric-purple", name: "Electric Purple", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#D946EF,#7C3AED)", text: "#fff" },
  { id: "sky-pulse", name: "Sky Pulse", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#7DD3FC,#3B82F6)", text: "#071625" },
  { id: "ocean", name: "Ocean", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#7DD3FC,#2563EB)", text: "#081421" },
  { id: "lime-energy", name: "Lime Energy", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#F8F32B,#A3D92F)", text: "#10120B" },
  { id: "stadium-green", name: "Stadium Green", category: "fanometrix", layout: "timer", gradient: "linear-gradient(180deg,#64DD17,#0B5D1E)", text: "#fff" },
  // brand / tournament / publisher: intentionally empty for now — future
  // curated designs land here with zero further schema changes. Picker UIs
  // must render an empty-state message when a category has no entries.
];

export const DESIGN_LAYOUTS: Record<string, DesignLayout> = Object.fromEntries(
  CREATIVE_DESIGNS.map(d => [d.id, d.layout])
);

export function designById(id: string | null | undefined): CreativeDesign | undefined {
  return id ? CREATIVE_DESIGNS.find(d => d.id === id) : undefined;
}

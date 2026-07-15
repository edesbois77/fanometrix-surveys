// Shared tone-preset definitions for the Simulation engine. A tone
// preset is the only sentiment-shaping lever exposed anywhere in the
// Demo Projects UX (Launch a Scenario templates and the Build a Custom
// Demo wizard both resolve to one of these four) — everything a
// salesperson or template author can pick is one of these named
// presets, never a raw percentage or free text.
export type TonePreset = "positive_momentum" | "mixed_reaction" | "concerned_fanbase" | "balanced";

export const TONE_PRESETS: { id: TonePreset; label: string; description: string }[] = [
  { id: "positive_momentum", label: "Positive Momentum", description: "Fans broadly receptive, some skepticism" },
  { id: "mixed_reaction",    label: "Mixed Reaction",     description: "Split roughly down the middle" },
  { id: "concerned_fanbase", label: "Concerned Fanbase",  description: "Mostly critical, a few defenders" },
  { id: "balanced",          label: "Balanced / Neutral", description: "No strong lean either way" },
];

/**
 * Weight multiplier for an option at a given normalised position along
 * a scale, assuming the scale runs from most-negative (0) to
 * most-positive (1) — the same convention the survey question option
 * lists already use today (e.g. Poor→Average→Good→Excellent). Applies
 * uniformly across every question on a simulated survey; there's no
 * per-question semantic understanding of "which option is positive"
 * beyond this ordering assumption.
 */
export function toneWeight(preset: TonePreset, normalisedPosition: number): number {
  switch (preset) {
    case "positive_momentum":
      return 1 + 2 * normalisedPosition;               // skews toward the end of the scale
    case "concerned_fanbase":
      return 1 + 2 * (1 - normalisedPosition);          // skews toward the start of the scale
    case "mixed_reaction":
      return 1 + 3 * Math.abs(normalisedPosition - 0.5) * 2; // bimodal — peaks at both ends
    case "balanced":
    default:
      return 1;                                          // flat
  }
}

/** Picks a weighted-random index from `length` positions laid out evenly across [0,1]. */
export function pickTonedIndex(preset: TonePreset, length: number): number {
  if (length <= 1) return 0;
  const weights = Array.from({ length }, (_, i) => toneWeight(preset, i / (length - 1)));
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return length - 1;
}

/** A short natural-language sentiment steer for the conversation-mention generation prompt. */
export function tonePromptDescriptor(preset: TonePreset): string {
  switch (preset) {
    case "positive_momentum":
      return "Overall sentiment should skew mostly positive, enthusiastic and receptive fans, with a believable minority of skeptics.";
    case "concerned_fanbase":
      return "Overall sentiment should skew mostly negative, critical and concerned fans, with a believable minority of defenders.";
    case "mixed_reaction":
      return "Overall sentiment should be polarised, strong opinions at both ends, few lukewarm middle-ground takes.";
    case "balanced":
    default:
      return "Overall sentiment should be evenly balanced, without a strong lean in either direction.";
  }
}

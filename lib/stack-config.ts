// Stack creative configuration — the small, deliberate set of options exposed
// for the "stack" layout. Stored on creative_designs.config (jsonb) and plumbed
// through the embed APIs to StackSurvey. Kept intentionally minimal: Stack is a
// designed system, not a free-form theme (no colour/spacing/font controls here).

export type StackHoverVariant   = "fade" | "swipe";
export type StackCompletionMode = "standard" | "panel";

export interface StackConfig {
  hoverVariant:   StackHoverVariant;
  completionMode: StackCompletionMode;
  // The design's DEFAULT Topic (e.g. "Women's Football"). A survey/campaign that
  // uses this design inherits this unless it sets its own override or clears it.
  defaultTopic:   string | null;
  panelUrl:       string | null;   // Panel Recruitment CTA destination (inert until set)
}

export const DEFAULT_STACK_CONFIG: StackConfig = {
  hoverVariant:   "fade",
  completionMode: "standard",
  defaultTopic:   null,
  panelUrl:       null,
};

// Defensive coercion — the value comes from a jsonb column that could be null,
// partial, or legacy, so every field falls back to its approved default.
// `topic` is read as a fallback for `defaultTopic` for backward-compat with rows
// saved before the field was renamed.
export function coerceStackConfig(raw: unknown): StackConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<StackConfig> & { topic?: string | null };
  const dt = c.defaultTopic ?? c.topic;
  return {
    hoverVariant:   c.hoverVariant === "swipe" ? "swipe" : "fade",
    completionMode: c.completionMode === "panel" ? "panel" : "standard",
    defaultTopic:   typeof dt === "string" && dt.trim() ? dt.trim() : null,
    panelUrl:       typeof c.panelUrl === "string" && c.panelUrl.trim() ? c.panelUrl.trim() : null,
  };
}

// Resolve the Topic actually rendered, from the three-state model:
//   campaign topic null/undefined → inherit the design default
//   campaign topic "" (empty)     → explicitly cleared → no Topic
//   campaign topic has text       → override
// An empty string never falls back to the default (that's the whole point).
export function resolveEffectiveTopic(
  campaignTopic: string | null | undefined,
  designDefault: string | null,
): string | null {
  if (campaignTopic === null || campaignTopic === undefined) return designDefault ?? null;
  if (campaignTopic.trim() === "") return null;
  return campaignTopic;
}

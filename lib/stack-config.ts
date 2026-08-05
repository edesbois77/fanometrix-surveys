// Stack creative configuration — the small, deliberate set of options exposed
// for the "stack" layout. Stored on creative_designs.config (jsonb) and plumbed
// through the embed APIs to StackSurvey. Kept intentionally minimal: Stack is a
// designed system, not a free-form theme (no colour/spacing/font controls here).

export type StackHoverVariant   = "fade" | "swipe";
export type StackCompletionMode = "standard" | "panel";

export interface StackConfig {
  hoverVariant:   StackHoverVariant;
  completionMode: StackCompletionMode;
  topic:          string | null;   // survey subject shown as Intro metadata
  panelUrl:       string | null;   // Panel Recruitment CTA destination (inert until set)
}

export const DEFAULT_STACK_CONFIG: StackConfig = {
  hoverVariant:   "fade",
  completionMode: "standard",
  topic:          null,
  panelUrl:       null,
};

// Defensive coercion — the value comes from a jsonb column that could be null,
// partial, or legacy, so every field falls back to its approved default.
export function coerceStackConfig(raw: unknown): StackConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<StackConfig>;
  return {
    hoverVariant:   c.hoverVariant === "swipe" ? "swipe" : "fade",
    completionMode: c.completionMode === "panel" ? "panel" : "standard",
    topic:          typeof c.topic === "string" && c.topic.trim()    ? c.topic.trim()    : null,
    panelUrl:       typeof c.panelUrl === "string" && c.panelUrl.trim() ? c.panelUrl.trim() : null,
  };
}

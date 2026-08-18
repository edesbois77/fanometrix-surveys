// ── Survey Studio Create — stage configuration (Phase 0) ─────────────────────
// The five workspace-level stages. This is the Level-3 local navigation that
// lives INSIDE the content area (About | Creative | Survey | Campaigns | Deploy)
// — never a second sidebar tier. Stage identity travels as a `?stage=` query
// param on /survey-studio/create/[surveyId], so the chosen Survey ID always
// stays in the path and no nested route tree is needed for the tabs.

export type CreateStageKey = "about" | "creative" | "survey" | "campaigns" | "deploy";

export interface CreateStage {
  key: CreateStageKey;
  label: string;
  /** One restrained line describing what the stage will hold (Phase 0 placeholder). */
  blurb: string;
}

export const CREATE_STAGES: CreateStage[] = [
  { key: "about",     label: "About",     blurb: "Name, objective, audience, purpose, markets and languages." },
  { key: "creative",  label: "Creative",  blurb: "Choose an approved Creative and see what structure it allows." },
  { key: "survey",    label: "Survey",    blurb: "Build the intro, questions and thank-you the Creative permits." },
  { key: "campaigns", label: "Campaigns", blurb: "Set up one or more deployments, markets, timing and targets." },
  { key: "deploy",    label: "Deploy",    blurb: "Get the embed code and instructions for each campaign." },
];

export const DEFAULT_STAGE: CreateStageKey = "about";

export function isStageKey(v: unknown): v is CreateStageKey {
  return typeof v === "string" && CREATE_STAGES.some((s) => s.key === v);
}

export function stageHref(surveyId: string, key: CreateStageKey): string {
  return `/survey-studio/create/${surveyId}?stage=${key}`;
}

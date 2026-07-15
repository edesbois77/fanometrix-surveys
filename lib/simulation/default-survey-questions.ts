// The Demo Projects creation flow never asks a salesperson to author
// actual survey questions — the wizard only collects sources, topic,
// and tone (blueprint's "no free-text input that shapes report
// content"). Every simulated survey therefore uses this one fixed,
// well-formed question set — the same negative→positive Likert
// ordering convention lib/simulation/generate-survey-responses.ts's
// tone weighting assumes. Not topic-specific by design: making it
// topic-aware would mean generating question text, which is exactly
// the kind of free-text content-authoring the product principles rule
// out for a wizard step.
import type { LocalisedQuestion } from "@/lib/survey-locale";

export const DEFAULT_SIMULATED_SURVEY_QUESTIONS: LocalisedQuestion[] = [
  {
    id: "q_sim_1",
    text: { en: "How likely are you to recommend this to a friend?" },
    options: [
      { id: 1, text: { en: "Not likely" } },
      { id: 2, text: { en: "Somewhat likely" } },
      { id: 3, text: { en: "Likely" } },
      { id: 4, text: { en: "Very likely" } },
    ],
  },
  {
    id: "q_sim_2",
    text: { en: "How would you rate it overall?" },
    options: [
      { id: 1, text: { en: "Poor" } },
      { id: 2, text: { en: "Average" } },
      { id: 3, text: { en: "Good" } },
      { id: 4, text: { en: "Excellent" } },
    ],
  },
  {
    id: "q_sim_3",
    text: { en: "How well does this reflect what fans want?" },
    options: [
      { id: 1, text: { en: "Not at all" } },
      { id: 2, text: { en: "Somewhat" } },
      { id: 3, text: { en: "Mostly" } },
      { id: 4, text: { en: "Completely" } },
    ],
  },
];

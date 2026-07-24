import { test } from "node:test";
import assert from "node:assert/strict";
import { surveyObservations, type SurveyResponseRow } from "./survey-observations";
import type { LocalisedQuestion } from "@/lib/survey-locale";

// A one-question survey whose options carry stable numeric ids, the shape
// `responses` stores against q1/q2/q3.
const q = (text: string, options: { id: number; text: string }[]): LocalisedQuestion => ({
  // Only the fields survey-observations reads; the real type carries more.
  text: { en: text },
  options: options.map(o => ({ id: o.id, text: { en: o.text } })),
} as unknown as LocalisedQuestion);

const QUESTION = q("How do fans perceive it?", [
  { id: 1, text: "Strong fit" },
  { id: 2, text: "Relevant but unclear" },
  { id: 3, text: "Never noticed" },
]);

/** n rows all answering q1 with the given option id, in a market/segment. */
function rows(spec: { q1: number; country?: string; fan_segment?: string; n: number }[]): SurveyResponseRow[] {
  const out: SurveyResponseRow[] = [];
  for (const s of spec) {
    for (let i = 0; i < s.n; i++) {
      out.push({ q1: String(s.q1), q2: null, q3: null, country: s.country ?? null, fan_segment: s.fan_segment ?? null });
    }
  }
  return out;
}

test("every option is reported, including a minority below the old 15% floor", () => {
  // 80 fit / 15 unclear / 5 never noticed = 100 → 5% is a minority the crude
  // gatherer used to erase.
  const responses = rows([
    { q1: 1, n: 80 }, { q1: 2, n: 15 }, { q1: 3, n: 5 },
  ]);
  const obs = surveyObservations({ surveyName: "Perception", questions: [QUESTION], responses });
  const text = obs.map(o => o.content).join("\n");

  // Question-level valid-response count (100 answered this question), not a
  // completed-survey total.
  assert.match(text, /80% of the 100 respondents who answered .* chose "Strong fit"/);
  assert.match(text, /15% of the 100 respondents who answered .* chose "Relevant but unclear"/);
  // The 5% option survives AND is flagged as a notable minority.
  assert.match(text, /5% of the 100 respondents who answered .* chose "Never noticed" \(a notable minority\)/);
  // Scope references the question's valid-response count.
  assert.ok(obs.every(o => o.validResponses === 100 && /valid responses/.test(o.scope)));
});

test("a market that diverges from the whole is reported as a contrast", () => {
  // Overall "Never noticed" ~ 5%. In DE it is 60% — a genuine market difference.
  const responses = rows([
    { q1: 1, country: "GB", n: 80 },
    { q1: 2, country: "GB", n: 15 },
    { q1: 3, country: "GB", n: 5 },
    { q1: 3, country: "DE", n: 30 },
    { q1: 1, country: "DE", n: 20 },
  ]);
  const obs = surveyObservations({ surveyName: "Perception", questions: [QUESTION], responses });
  const de = obs.find(o => o.provenance.includes("DE"));
  assert.ok(de, "a DE market divergence observation should exist");
  assert.match(de!.content, /Among the 50 DE respondents who answered/);
  assert.match(de!.content, /across all 150 answers/);
  assert.equal(de!.validResponses, 50);
});

test("each question's denominator is its OWN valid-answer count, not a shared total (652/317/274 funnel)", () => {
  const q1 = q("How do fans perceive it?", [{ id: 1, text: "Strong fit" }, { id: 2, text: "Unclear" }]);
  const q2 = q("What should sponsors offer?", [{ id: 1, text: "Experiences" }, { id: 2, text: "Access" }]);
  const q3 = q("FedEx as a sponsor?", [{ id: 1, text: "Natural fit" }, { id: 2, text: "Noticed" }]);

  // A partial-completion funnel: 652 answered Q1, 317 reached Q2, 274 completed Q3.
  const responses: SurveyResponseRow[] = [];
  for (let i = 0; i < 652; i++) {
    responses.push({
      q1: String((i % 2) + 1),                 // all 652 answered Q1
      q2: i < 317 ? String((i % 2) + 1) : null, // 317 answered Q2
      q3: i < 274 ? String((i % 2) + 1) : null, // 274 answered Q3
      country: null, fan_segment: null,
    });
  }

  const obs = surveyObservations({ surveyName: "FedEx", questions: [q1, q2, q3], responses });
  const forQ = (text: string) => obs.filter(o => o.provenance === text);

  // Each question's option findings quote its own denominator, independently.
  assert.ok(forQ("How do fans perceive it?").every(o => o.validResponses === 652), "Q1 denominator must be 652");
  assert.ok(forQ("What should sponsors offer?").every(o => o.validResponses === 317), "Q2 denominator must be 317");
  assert.ok(forQ("FedEx as a sponsor?").every(o => o.validResponses === 274), "Q3 denominator must be 274");

  const text = obs.map(o => o.content).join("\n");
  assert.match(text, /of the 652 respondents who answered "How do fans perceive it\?"/);
  assert.match(text, /of the 317 respondents who answered "What should sponsors offer\?"/);
  assert.match(text, /of the 274 respondents who answered "FedEx as a sponsor\?"/);
});

test("a market too small to read is not reported as a difference", () => {
  const responses = rows([
    { q1: 1, country: "GB", n: 90 },
    { q1: 3, country: "XX", n: 3 }, // below MIN_SUBGROUP
  ]);
  const obs = surveyObservations({ surveyName: "Perception", questions: [QUESTION], responses });
  assert.equal(obs.some(o => o.provenance.includes("XX")), false);
});

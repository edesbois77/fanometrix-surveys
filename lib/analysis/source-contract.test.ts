import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_CONTRACT, NEWS_CONTRACT, SURVEY_CONTRACT, DOCUMENT_CONTRACT,
  resolve, sourceContracts, sourcesProducing, describeSource,
} from "./source-contract";
import { countObservations } from "./framing";

// docs/intelligence-model.md §4 Layer 2. A source declares what it can establish
// and what one observation of it is. Nothing downstream infers either, because a
// gatherer that makes epistemic judgements quietly redefines what the platform is
// entitled to say.

// ── Contribution is declared, and may be a mapping ───────────────────────────

test("a source with one kind of knowledge declares it as a constant", () => {
  assert.equal(resolve(CONVERSATION_CONTRACT, { id: "m1", author: "alice" }).contribution, "unprompted_discourse");
  assert.equal(resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 200 }).contribution, "elicited_perception");
});

test("news declares a mapping, because three kinds of knowledge arrive through one connector", () => {
  const article = (sourceType: "reporting" | "brand_announcement" | "opinion" | "unclear") =>
    resolve(NEWS_CONTRACT, { id: "a1", syndicationKey: null, publisher: "The Times", sourceType }).contribution;

  assert.equal(article("reporting"), "documented_activity");
  assert.equal(article("brand_announcement"), "interested_claim");
  assert.equal(article("opinion"), "expert_judgement");
});

test("an article whose voice we cannot identify is read as the kind that establishes least", () => {
  assert.equal(
    resolve(NEWS_CONTRACT, { id: "a1", syndicationKey: null, publisher: null, sourceType: "unclear" }).contribution,
    "interested_claim",
  );
});

test("a client's own case study is not established knowledge", () => {
  const independent = resolve(DOCUMENT_CONTRACT, { documentId: "d1", authorship: "independent" });
  const interested = resolve(DOCUMENT_CONTRACT, { documentId: "d1", authorship: "interested" });
  assert.equal(independent.contribution, "established_knowledge");
  assert.equal(interested.contribution, "interested_claim");
});

// ── The observation unit ─────────────────────────────────────────────────────

test("one person posting forty times is one observation of what one person thinks", () => {
  const posts = Array.from({ length: 40 }, (_, i) => resolve(CONVERSATION_CONTRACT, { id: `m${i}`, author: "Alice" }));
  assert.equal(countObservations(posts), 1);
});

test("an author is matched regardless of how the handle was cased", () => {
  const a = resolve(CONVERSATION_CONTRACT, { id: "m1", author: "Alice" });
  const b = resolve(CONVERSATION_CONTRACT, { id: "m2", author: " alice " });
  assert.equal(a.observationKey, b.observationKey);
});

test("anonymous items count as distinct, because merging strangers erases them", () => {
  const a = resolve(CONVERSATION_CONTRACT, { id: "m1", author: null });
  const b = resolve(CONVERSATION_CONTRACT, { id: "m2", author: null });
  assert.notEqual(a.observationKey, b.observationKey);
  assert.equal(countObservations([a, b]), 2, "the safer error is to dilute one voice, not to erase two");
});

test("fifty outlets carrying one wire story are one observation of one event", () => {
  const carried = Array.from({ length: 50 }, (_, i) =>
    resolve(NEWS_CONTRACT, { id: `a${i}`, syndicationKey: "wire-1", publisher: `Outlet ${i}`, sourceType: "reporting" }));
  assert.equal(countObservations(carried), 1);
});

test("two publishers with genuinely separate stories are two observations", () => {
  const a = resolve(NEWS_CONTRACT, { id: "a1", syndicationKey: null, publisher: "The Times", sourceType: "reporting" });
  const b = resolve(NEWS_CONTRACT, { id: "a2", syndicationKey: null, publisher: "The Guardian", sourceType: "reporting" });
  assert.equal(countObservations([a, b]), 2);
});

test("a survey statistic carries every response behind it", () => {
  const stat = resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 412 });
  assert.equal(stat.observations, 412);
  assert.equal(countObservations([stat]), 412);
});

test("two statistics from one survey draw on one pool of respondents", () => {
  const a = resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 412 });
  const b = resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 412 });
  assert.equal(countObservations([a, b]), 412, "the instrument is the dedup key even though the response is the unit");
});

test("two separate surveys are two pools", () => {
  const a = resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 400 });
  const b = resolve(SURVEY_CONTRACT, { surveyId: "s2", responses: 300 });
  assert.equal(countObservations([a, b]), 700);
});

test("an observation count is never below one, however a source reports it", () => {
  assert.equal(resolve(SURVEY_CONTRACT, { surveyId: "s1", responses: 0 }).observations, 1);
});

// ── The registry ─────────────────────────────────────────────────────────────

test("every declared source states what it cannot establish", () => {
  for (const d of sourceContracts()) {
    assert.ok(d.produces.length > 0, `${d.id} produces nothing`);
    assert.ok(d.cannotEstablish.length > 0, `${d.id} does not say what it cannot establish`);
    assert.ok(d.observation.unit.length > 0, `${d.id} does not declare an observation unit`);
  }
});

test("the platform can answer which sources could supply a kind of knowledge", () => {
  // The question Research Design asks when a requirement needs something the
  // collected evidence cannot give it.
  assert.deepEqual(sourcesProducing("elicited_perception").map(d => d.id), ["survey"]);
  assert.deepEqual(sourcesProducing("unprompted_discourse").map(d => d.id), ["conversation"]);
  assert.deepEqual(sourcesProducing("interested_claim").map(d => d.id).sort(), ["document", "news"]);
});

test("a source describes itself in the language of research, not of the model", () => {
  const text = describeSource(NEWS_CONTRACT);
  assert.ok(text.includes("original publishers"));
  assert.ok(text.includes("cannot establish"));
  assert.ok(!/[—–]/.test(text));
});

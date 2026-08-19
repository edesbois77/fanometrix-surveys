import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswerRequest, parseSubmitAnswers, parseAnswer, isUuid, MAX_QUESTIONS } from "./survey-answer-request";

const SESSION = "3f1c0d9e-8b2a-4c6d-9e1f-2a7b5c8d0e34";

const valid = (over: Record<string, unknown> = {}) => ({
  session_id: SESSION,
  campaign_id: "studio_abc",
  question_index: 0,
  answer_value: "2",
  question_id: "q1786719811050",
  canonical_question_key: "q1786719811050",
  ...over,
});

// ── Shape ───────────────────────────────────────────────────────────────────

test("a well-formed answer is accepted with its identity intact", () => {
  const r = parseAnswerRequest(valid());
  assert.ok(r.ok);
  assert.equal(r.value.sessionId, SESSION);
  assert.equal(r.value.answer.questionIndex, 0);
  assert.equal(r.value.answer.answerValue, "2");
  assert.equal(r.value.answer.questionId, "q1786719811050");
  assert.equal(r.value.answer.canonicalQuestionKey, "q1786719811050");
});

test("question identity is optional — historical surveys carry no canonical key", () => {
  const r = parseAnswerRequest(valid({ canonical_question_key: undefined }));
  assert.ok(r.ok);
  assert.equal(r.value.answer.canonicalQuestionKey, null);
  assert.equal(r.value.answer.questionId, "q1786719811050", "the stable question id still travels");
});

// ── 1-5 questions, and nothing else ─────────────────────────────────────────

test("question_index 0-4 covers exactly the 1-5 research questions", () => {
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    assert.ok(parseAnswerRequest(valid({ question_index: i })).ok, `index ${i} accepted`);
  }
});

test("an index beyond the fifth question is rejected", () => {
  const r = parseAnswerRequest(valid({ question_index: 5 }));
  assert.ok(!r.ok);
  assert.equal(r.status, 400);
});

test("intro and goodbye frames cannot masquerade as questions", () => {
  // They have no index at all; any attempt to send a non-question position fails.
  for (const bad of [-1, 5, 6, 1.5, "intro", "thankyou", null, undefined]) {
    assert.ok(!parseAnswerRequest(valid({ question_index: bad })).ok, `${String(bad)} rejected`);
  }
});

// ── session_id is a UUID, because the column is ─────────────────────────────

test("a non-UUID session is rejected with a clear 400, not an opaque database 500", () => {
  const r = parseAnswerRequest(valid({ session_id: "not-a-uuid" }));
  assert.ok(!r.ok);
  assert.equal(r.status, 400);
  assert.match(r.error, /UUID/);
});

test("isUuid accepts a real crypto.randomUUID() value", () => {
  assert.ok(isUuid(crypto.randomUUID()));
  assert.ok(!isUuid(""));
  assert.ok(!isUuid("3f1c0d9e8b2a4c6d9e1f2a7b5c8d0e34"));
});

// ── Required fields ─────────────────────────────────────────────────────────

test("campaign_id is required — an answer with no campaign cannot be attributed", () => {
  assert.ok(!parseAnswerRequest(valid({ campaign_id: "" })).ok);
  assert.ok(!parseAnswerRequest(valid({ campaign_id: undefined })).ok);
});

test("an empty or oversized answer value is rejected", () => {
  assert.ok(!parseAnswerRequest(valid({ answer_value: "" })).ok);
  assert.ok(!parseAnswerRequest(valid({ answer_value: "x".repeat(201) })).ok);
});

test("oversized context fields are rejected rather than stored as junk", () => {
  assert.ok(!parseAnswerRequest(valid({ placement: "x".repeat(201) })).ok);
  assert.ok(!parseAnswerRequest(valid({ renderer: "x".repeat(201) })).ok);
});

// ── Demo / test traffic ─────────────────────────────────────────────────────

test("client-declared test traffic is carried through so it can be excluded", () => {
  const r = parseAnswerRequest(valid({ is_demo: true }));
  assert.ok(r.ok);
  assert.equal(r.value.client.isDemo, true);
});

test("is_demo defaults to false and is never inferred from a truthy string", () => {
  const a = parseAnswerRequest(valid());
  const b = parseAnswerRequest(valid({ is_demo: "yes" }));
  assert.ok(a.ok && b.ok);
  assert.equal(a.value.client.isDemo, false);
  assert.equal(b.value.client.isDemo, false);
});

// ── The completion backfill array ───────────────────────────────────────────

test("the submit backfill accepts the full 1-5 answer set", () => {
  const answers = parseSubmitAnswers([
    { question_index: 0, answer_value: "1", question_id: "qa" },
    { question_index: 1, answer_value: "2", question_id: "qb" },
    { question_index: 2, answer_value: "3", question_id: "qc" },
    { question_index: 3, answer_value: "4", question_id: "qd" },
    { question_index: 4, answer_value: "5", question_id: "qe" },
  ]);
  assert.equal(answers.length, 5);
  assert.deepEqual(answers.map((a) => a.questionIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(answers.map((a) => a.questionId), ["qa", "qb", "qc", "qd", "qe"]);
});

test("a malformed backfill entry is dropped, never failing the completion", () => {
  const answers = parseSubmitAnswers([
    { question_index: 0, answer_value: "1" },
    { question_index: 99, answer_value: "9" },   // out of range
    { question_index: 1, answer_value: "" },      // empty
    { question_index: 2, answer_value: "3" },
  ]);
  assert.deepEqual(answers.map((a) => a.questionIndex), [0, 2]);
});

test("a duplicated index in the backfill collapses to one entry, matching the upsert key", () => {
  const answers = parseSubmitAnswers([
    { question_index: 0, answer_value: "1" },
    { question_index: 0, answer_value: "4" },
  ]);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].answerValue, "4", "the last assertion wins, as the upsert would");
});

test("a missing or non-array backfill is simply empty", () => {
  assert.deepEqual(parseSubmitAnswers(undefined), []);
  assert.deepEqual(parseSubmitAnswers(null), []);
  assert.deepEqual(parseSubmitAnswers("q1"), []);
});

test("the backfill is bounded so a hostile payload cannot balloon the write", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ question_index: i % 5, answer_value: String(i) }));
  assert.ok(parseSubmitAnswers(many).length <= MAX_QUESTIONS);
});

test("parseAnswer rejects a non-object entry safely", () => {
  assert.ok(!parseAnswer(null).ok);
  assert.ok(!parseAnswer("nope").ok);
});

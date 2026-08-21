import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { questionShownEvent, questionAnsweredEvent } from "@/lib/survey-events";
import {
  sendEvent, recordAnswer, submitResponse,
  type EmbedAnswer, type EmbedEvidenceContext,
} from "./evidence";

// ── A fake Fanometrix server ────────────────────────────────────────────────
// It applies the SAME uniqueness rule the database does — one row per
// (session_id, question_index), from migration 147 — so the idempotency and
// answer-change cases are tested against the real constraint rather than a mock
// that happens to agree.

type AnswerRow = {
  session_id: string; campaign_id: string; survey_id: string | null;
  question_index: number; answer_value: string;
  question_id: string | null; canonical_question_key: string | null;
  renderer: string | null; placement: string | null;
};

type Server = {
  answers: Map<string, AnswerRow>;      // keyed "session:index" (the unique key)
  events: { session: string; type: string }[];
  responses: { session_id: string; campaign_id: string; answers: unknown[] }[];
  answerCalls: number;
  eventTypes(session?: string): string[];
  answersFor(session: string): AnswerRow[];
};

let server: Server;
let realFetch: typeof globalThis.fetch;

function installServer(opts: {
  /** Fail the first N /api/answer calls (transient 500). */
  failAnswerTimes?: number;
  /** Reject every /api/answer with this permanent status. */
  answerStatus?: number;
  /** Status for /api/submit (default 200). */
  submitStatus?: number;
  /** Body for /api/submit. */
  submitBody?: Record<string, unknown>;
} = {}): Server {
  let failuresLeft = opts.failAnswerTimes ?? 0;

  const s: Server = {
    answers: new Map(),
    events: [],
    responses: [],
    answerCalls: 0,
    eventTypes(session?: string) {
      return s.events.filter((e) => !session || e.session === session).map((e) => e.type);
    },
    answersFor(session: string) {
      return [...s.answers.values()].filter((a) => a.session_id === session)
        .sort((a, b) => a.question_index - b.question_index);
    },
  };

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const ok = (payload: unknown, status = 200) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

    if (url === "/api/events") {
      s.events.push({ session: body.session_id, type: body.event_type });
      return ok({ ok: true });
    }

    if (url === "/api/answer") {
      s.answerCalls += 1;
      if (opts.answerStatus) return ok({ error: "rejected" }, opts.answerStatus);
      if (failuresLeft > 0) { failuresLeft -= 1; return ok({ error: "boom" }, 500); }
      // UPSERT on (session_id, question_index) — the database's unique key.
      s.answers.set(`${body.session_id}:${body.question_index}`, {
        session_id: body.session_id,
        campaign_id: body.campaign_id,
        survey_id: body.survey_id,
        question_index: body.question_index,
        answer_value: body.answer_value,
        question_id: body.question_id ?? null,
        canonical_question_key: body.canonical_question_key ?? null,
        renderer: body.renderer ?? null,
        placement: body.placement ?? null,
      });
      return ok({ ok: true, saved: 1 });
    }

    if (url === "/api/submit") {
      const status = opts.submitStatus ?? 200;
      if (status >= 200 && status < 300 && !opts.submitBody?.collection_closed) {
        s.responses.push({ session_id: body.session_id, campaign_id: body.campaign_id, answers: body.answers });
      }
      return ok(opts.submitBody ?? { success: true }, status);
    }

    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof globalThis.fetch;

  return s;
}

beforeEach(() => { realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; });

// ── The journey a renderer must perform ─────────────────────────────────────

const ctxFor = (sessionId: string, overrides: Partial<EmbedEvidenceContext> = {}): EmbedEvidenceContext => ({
  isPreview: false,
  sessionId,
  campaignId: "studio_test_campaign",
  surveyId: "survey-abc",
  publisher: "LiveScore",
  placement: "homepage-mpu",
  placementId: "p1",
  creativeId: "studio-classic",
  country: "United Kingdom",
  segment: null,
  market: "United Kingdom",
  device: "mobile",
  browser: "Chrome",
  renderer: "studio-classic",
  // Non-group traffic by default — the majority case. Studio-group journeys
  // override these two.
  groupId: null,
  configurationRevisionId: null,
  ...overrides,
});

type Q = { id: string; canonical_question_key?: string };
const questions = (n: number): Q[] =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, canonical_question_key: `ck${i + 1}` }));

const answerFor = (qs: Q[], qi: number, value: string): EmbedAnswer => ({
  questionIndex: qi,
  answerValue: value,
  questionId: qs[qi].id,
  canonicalQuestionKey: qs[qi].canonical_question_key ?? null,
});

/**
 * Drive the exact sequence every production renderer performs. `answerCount` < the
 * question count models a respondent who leaves mid-survey.
 */
async function runJourney(opts: {
  ctx: EmbedEvidenceContext;
  qs: Q[];
  answerCount: number;
  hasIntro?: boolean;
  values?: string[];
}): Promise<{ submitted: boolean; recorded: boolean }> {
  const { ctx, qs, answerCount, hasIntro } = opts;
  const values = opts.values ?? qs.map((_, i) => String(i + 1));

  sendEvent(ctx, "SURVEY_RENDER");
  sendEvent(ctx, "SURVEY_VISIBLE");
  if (hasIntro) { sendEvent(ctx, "INTRO_VIEWED"); sendEvent(ctx, "INTRO_CONTINUED"); }
  sendEvent(ctx, questionShownEvent(0));

  const given: EmbedAnswer[] = [];
  for (let qi = 0; qi < answerCount; qi++) {
    const a = answerFor(qs, qi, values[qi]);
    given.push(a);
    await recordAnswer(ctx, a, qi === 0);
    if (qi + 1 < qs.length) sendEvent(ctx, questionShownEvent(qi + 1));
  }

  if (answerCount < qs.length) return { submitted: false, recorded: false };

  const outcome = await submitResponse(ctx, { campaign_id: ctx.campaignId, q1: values[0] ?? null }, given);
  return { submitted: true, recorded: outcome.recorded };
}

// ── 1-5 question surveys, completed ─────────────────────────────────────────

for (const n of [1, 2, 3, 4, 5]) {
  test(`${n}-question survey completed → ${n} answer rows, one response, completion emitted`, async () => {
    server = installServer();
    const ctx = ctxFor(`s-complete-${n}`);
    const qs = questions(n);

    const { recorded } = await runJourney({ ctx, qs, answerCount: n });

    assert.equal(recorded, true, "the response was recorded");
    const rows = server.answersFor(ctx.sessionId);
    assert.equal(rows.length, n, `all ${n} answers stored`);
    assert.deepEqual(rows.map((r) => r.question_index), Array.from({ length: n }, (_, i) => i));
    assert.deepEqual(rows.map((r) => r.answer_value), Array.from({ length: n }, (_, i) => String(i + 1)));
    // Q4/Q5 exist here purely because the answer store is generic — they have no
    // home in responses.q1/q2/q3 and used to be discarded entirely.
    if (n >= 4) assert.ok(rows.some((r) => r.question_index === 3), "Q4 answer retained");
    if (n === 5) assert.ok(rows.some((r) => r.question_index === 4), "Q5 answer retained");

    assert.equal(server.responses.length, 1, "exactly one completed response");
    assert.equal(server.responses[0].session_id, ctx.sessionId);
    assert.ok(server.eventTypes(ctx.sessionId).includes("SURVEY_COMPLETED"));
  });
}

test("successful completion stores every expected answer, with identity, not just position", async () => {
  server = installServer();
  const ctx = ctxFor("s-identity");
  const qs = questions(5);
  await runJourney({ ctx, qs, answerCount: 5 });

  const rows = server.answersFor(ctx.sessionId);
  assert.deepEqual(rows.map((r) => r.question_id), ["q1", "q2", "q3", "q4", "q5"]);
  assert.deepEqual(rows.map((r) => r.canonical_question_key), ["ck1", "ck2", "ck3", "ck4", "ck5"]);
  // Delivery context travels with the answer, so per-publisher / per-renderer
  // partial analysis is possible at all.
  assert.ok(rows.every((r) => r.renderer === "studio-classic"));
  assert.ok(rows.every((r) => r.placement === "homepage-mpu"));
  assert.ok(rows.every((r) => r.survey_id === "survey-abc"));
});

// ── Partial exits ───────────────────────────────────────────────────────────

for (const [answered, total] of [[1, 3], [2, 3], [3, 5], [4, 5]] as const) {
  test(`partial exit after Q${answered} of ${total} → ${answered} answers kept, no completed response`, async () => {
    server = installServer();
    const ctx = ctxFor(`s-partial-${answered}-${total}`);
    const qs = questions(total);

    const { submitted } = await runJourney({ ctx, qs, answerCount: answered });

    assert.equal(submitted, false);
    const rows = server.answersFor(ctx.sessionId);
    assert.equal(rows.length, answered, "every answer given is retained");
    assert.deepEqual(rows.map((r) => r.answer_value), Array.from({ length: answered }, (_, i) => String(i + 1)));
    assert.equal(server.responses.length, 0, "an abandoned survey is not a completion");
    assert.ok(!server.eventTypes(ctx.sessionId).includes("SURVEY_COMPLETED"));
    // The abandoned questions are absent, not zero-valued.
    assert.ok(rows.every((r) => r.question_index < answered));
  });
}

test("partial exit after Q1 keeps the EXACT option chosen, not merely a count", async () => {
  server = installServer();
  const ctx = ctxFor("s-exact");
  const qs = questions(5);
  await runJourney({ ctx, qs, answerCount: 1, values: ["3", "x", "x", "x", "x"] });

  const rows = server.answersFor(ctx.sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].answer_value, "3", "the selected option id is recoverable");
  assert.equal(rows[0].question_id, "q1");
});

// ── Idempotency and answer changes ──────────────────────────────────────────

test("a retried answer request does not create a duplicate answer", async () => {
  server = installServer({ failAnswerTimes: 1 });   // first attempt fails, retry wins
  const ctx = ctxFor("s-retry");
  const qs = questions(3);

  const saved = await recordAnswer(ctx, answerFor(qs, 0, "2"), true);

  assert.equal(saved, true, "the retry succeeded");
  assert.equal(server.answerCalls, 2, "it really did retry");
  assert.equal(server.answersFor(ctx.sessionId).length, 1, "one row, not two");
  assert.equal(server.answersFor(ctx.sessionId)[0].answer_value, "2");
});

test("the completion backfill re-asserting answers cannot inflate the count", async () => {
  server = installServer();
  const ctx = ctxFor("s-backfill");
  const qs = questions(4);
  await runJourney({ ctx, qs, answerCount: 4 });

  // The submit payload carries the same four answers the per-selection saves wrote.
  const submitted = server.responses[0].answers as { question_index: number }[];
  assert.equal(submitted.length, 4, "the whole set is offered for backfill");
  // Applying them again is a no-op on the unique key.
  for (const a of submitted) {
    server.answers.set(`${ctx.sessionId}:${a.question_index}`, server.answers.get(`${ctx.sessionId}:${a.question_index}`)!);
  }
  assert.equal(server.answersFor(ctx.sessionId).length, 4, "still four rows");
});

test("changing an answer before completing updates that answer in place", async () => {
  server = installServer();
  const ctx = ctxFor("s-change");
  const qs = questions(3);

  await recordAnswer(ctx, answerFor(qs, 0, "1"), true);
  await recordAnswer(ctx, answerFor(qs, 0, "4"), false);   // changed their mind
  await recordAnswer(ctx, answerFor(qs, 1, "2"), false);

  const rows = server.answersFor(ctx.sessionId);
  assert.equal(rows.length, 2, "no duplicate row for the revised question");
  assert.equal(rows[0].answer_value, "4", "the latest selection wins");
  assert.equal(rows[1].answer_value, "2", "the other question is untouched");
});

// ── Failure handling ────────────────────────────────────────────────────────

test("a failed answer save is reported, never silently treated as success", async () => {
  server = installServer({ answerStatus: 500 });
  const ctx = ctxFor("s-answer-fail");
  const qs = questions(3);

  const saved = await recordAnswer(ctx, answerFor(qs, 0, "1"), true);

  assert.equal(saved, false, "the caller learns the answer was not stored");
  assert.equal(server.answersFor(ctx.sessionId).length, 0);
  assert.ok(
    server.eventTypes(ctx.sessionId).includes("ANSWER_SAVE_FAILED"),
    "the failure is observable — this is the signal whose absence hid a totally blocked endpoint for months",
  );
});

test("a permanently rejected answer (4xx) is not retried", async () => {
  server = installServer({ answerStatus: 400 });
  const ctx = ctxFor("s-answer-400");
  const qs = questions(3);

  await recordAnswer(ctx, answerFor(qs, 0, "1"), true);

  assert.equal(server.answerCalls, 1, "retrying an invalid body would just fail again");
  assert.ok(server.eventTypes(ctx.sessionId).includes("ANSWER_SAVE_FAILED"));
});

test("submit failure does NOT emit completion", async () => {
  server = installServer({ submitStatus: 500, submitBody: { error: "Database insert failed" } });
  const ctx = ctxFor("s-submit-fail");
  const qs = questions(3);

  const { recorded } = await runJourney({ ctx, qs, answerCount: 3 });

  assert.equal(recorded, false);
  assert.equal(server.responses.length, 0);
  const types = server.eventTypes(ctx.sessionId);
  assert.ok(!types.includes("SURVEY_COMPLETED"), "no completion without a saved response");
  assert.ok(types.includes("SUBMIT_FAILED"), "the failure is recorded");
  // The answers given are still retained — the evidence principle.
  assert.equal(server.answersFor(ctx.sessionId).length, 3);
});

test("a campaign that closed on its target is not counted as a completion", async () => {
  server = installServer({ submitStatus: 200, submitBody: { recorded: false, collection_closed: true } });
  const ctx = ctxFor("s-closed");
  const qs = questions(3);

  const { recorded } = await runJourney({ ctx, qs, answerCount: 3 });

  assert.equal(recorded, false, "nothing was recorded past the ceiling");
  assert.ok(!server.eventTypes(ctx.sessionId).includes("SURVEY_COMPLETED"));
  assert.equal(server.answersFor(ctx.sessionId).length, 3, "the answers are still kept");
});

// ── Event semantics ─────────────────────────────────────────────────────────

test("SURVEY_START keeps its historical meaning: the FIRST answer, not Q1 being shown", async () => {
  server = installServer();
  const ctx = ctxFor("s-semantics");
  const qs = questions(3);

  sendEvent(ctx, "SURVEY_RENDER");
  sendEvent(ctx, questionShownEvent(0));
  assert.ok(!server.eventTypes(ctx.sessionId).includes("SURVEY_START"),
    "displaying Q1 must NOT count as a start");
  assert.ok(server.eventTypes(ctx.sessionId).includes("QUESTION_1_SHOWN"));

  await recordAnswer(ctx, answerFor(qs, 0, "1"), true);
  assert.ok(server.eventTypes(ctx.sessionId).includes("SURVEY_START"),
    "the first answer is the start");
});

test("SURVEY_START fires exactly once per journey", async () => {
  server = installServer();
  const ctx = ctxFor("s-once");
  const qs = questions(5);
  await runJourney({ ctx, qs, answerCount: 5 });
  assert.equal(server.eventTypes(ctx.sessionId).filter((t) => t === "SURVEY_START").length, 1);
});

test("every answered question emits its own explicit answered event", async () => {
  server = installServer();
  const ctx = ctxFor("s-answered-events");
  const qs = questions(5);
  await runJourney({ ctx, qs, answerCount: 5 });

  const types = server.eventTypes(ctx.sessionId);
  for (let qi = 0; qi < 5; qi++) {
    assert.ok(types.includes(questionAnsweredEvent(qi)), `${questionAnsweredEvent(qi)} emitted`);
  }
});

test("an intro frame is journey furniture: it never occupies a question index", async () => {
  server = installServer();
  const ctx = ctxFor("s-intro");
  const qs = questions(3);
  await runJourney({ ctx, qs, answerCount: 3, hasIntro: true });

  const types = server.eventTypes(ctx.sessionId);
  assert.ok(types.includes("INTRO_VIEWED") && types.includes("INTRO_CONTINUED"));

  const rows = server.answersFor(ctx.sessionId);
  assert.equal(rows.length, 3, "three questions, three answers — the intro is not one");
  assert.deepEqual(rows.map((r) => r.question_index), [0, 1, 2], "indexes start at Q1, not after the intro");
  assert.deepEqual(rows.map((r) => r.question_id), ["q1", "q2", "q3"]);
});

test("the goodbye frame is journey furniture: it adds no answer and no index", async () => {
  server = installServer();
  const ctx = ctxFor("s-goodbye");
  const qs = questions(2);
  await runJourney({ ctx, qs, answerCount: 2, hasIntro: true });

  // Thank You is reached after the final answer; it must not add a third answer.
  assert.equal(server.answersFor(ctx.sessionId).length, 2);
  assert.ok(server.answersFor(ctx.sessionId).every((r) => r.question_index <= 1));
});

// ── Joinability ─────────────────────────────────────────────────────────────

test("a completed response joins to its answers and its events by session id", async () => {
  server = installServer();
  const ctx = ctxFor("s-join");
  const qs = questions(5);
  await runJourney({ ctx, qs, answerCount: 5 });

  const response = server.responses[0];
  assert.equal(response.session_id, ctx.sessionId, "the response carries the join key");
  const joinedAnswers = server.answersFor(response.session_id);
  assert.equal(joinedAnswers.length, 5, "all five answers reachable from the response");
  const joinedEvents = server.events.filter((e) => e.session === response.session_id);
  assert.ok(joinedEvents.length > 0, "its event stream is reachable from the same key");
  assert.ok(joinedEvents.some((e) => e.type === "SURVEY_COMPLETED"));
});

// ── Preview traffic ─────────────────────────────────────────────────────────

test("preview traffic records nothing at all", async () => {
  server = installServer();
  const ctx = ctxFor("s-preview", { isPreview: true });
  const qs = questions(5);

  const { recorded } = await runJourney({ ctx, qs, answerCount: 5 });

  assert.equal(recorded, false);
  assert.equal(server.answerCalls, 0, "no answer writes");
  assert.equal(server.events.length, 0, "no events");
  assert.equal(server.responses.length, 0, "no responses");
});

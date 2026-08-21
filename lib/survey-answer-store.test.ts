import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { CampaignEvidenceContext } from "./survey-evidence-context";

// The store talks to Supabase, so the client is mocked at module level and we assert
// on the ROWS it would write. What matters is that the row is self-describing: an
// answer that knows only its position is not durable research evidence.

type Upsert = { table: string; rows: Record<string, unknown>[]; opts: unknown };
const upserts: Upsert[] = [];
let nextError: { code?: string; message?: string } | null = null;

mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from(table: string) {
        return {
          upsert(rows: Record<string, unknown>[], opts: unknown) {
            upserts.push({ table, rows, opts });
            const error = nextError;
            nextError = null;
            return Promise.resolve({ error });
          },
        };
      },
    },
  },
});

// Imported after mock.module is registered. A `before` hook rather than a
// top-level await, which the test transform emits as CJS and cannot support.
let persistAnswers: typeof import("./survey-answer-store").persistAnswers;
let __resetAnswerStoreProbe: typeof import("./survey-answer-store").__resetAnswerStoreProbe;

before(async () => {
  ({ persistAnswers, __resetAnswerStoreProbe } = await import("./survey-answer-store"));
});

const CTX: CampaignEvidenceContext = {
  campaignId: "studio_9f21_ab_gb_en",
  campaignUuid: "11111111-2222-3333-4444-555555555555",
  isSimulated: false,
  surveyId: "d729de2f-00ae-487d-afc7-61aa2db0e9d8",
  publisher: "LiveScore",
  market: "United Kingdom",
  countryCode: "GB",
  surveyLanguage: "en",
  groupId: null,
  configurationRevisionId: null,
};

const SESSION = "3f1c0d9e-8b2a-4c6d-9e1f-2a7b5c8d0e34";
const answer = (qi: number, value: string) => ({
  sessionId: SESSION,
  questionIndex: qi,
  answerValue: value,
  questionId: `q100${qi}`,
  canonicalQuestionKey: `ck${qi}`,
});

beforeEach(() => { upserts.length = 0; nextError = null; __resetAnswerStoreProbe?.(); });

// ── The written row ─────────────────────────────────────────────────────────

test("an answer row is self-describing: identity, position, and delivery context", async () => {
  const r = await persistAnswers([answer(3, "2")], CTX, {
    country: "United Kingdom", fanSegment: null, placement: "homepage-mpu",
    placementId: "p1", creativeId: "studio-classic", renderer: "studio-classic",
  });

  assert.equal(r.error, null);
  assert.equal(r.saved, 1);
  const row = upserts[0].rows[0];

  // Identity — the point of the repair. Position alone is not durable.
  assert.equal(row.question_id, "q1003");
  assert.equal(row.canonical_question_key, "ck3");
  assert.equal(row.question_index, 3, "Q4 — a position that has no home in responses.q1/q2/q3");
  assert.equal(row.answer_value, "2");

  // Server-resolved context beats anything the browser asserted.
  assert.equal(row.survey_id, CTX.surveyId);
  assert.equal(row.publisher, "LiveScore");
  assert.equal(row.market, "United Kingdom");
  assert.equal(row.country_code, "GB");
  assert.equal(row.survey_language, "en");

  // Client-only context the server cannot know.
  assert.equal(row.placement, "homepage-mpu");
  assert.equal(row.renderer, "studio-classic");
});

test("the write upserts on the (session, question) key, so it is idempotent", async () => {
  await persistAnswers([answer(0, "1")], CTX, {});
  assert.deepEqual(upserts[0].opts, { onConflict: "session_id,question_index" });
});

test("the campaign's market wins over a market the ad tag asserted", async () => {
  await persistAnswers([answer(0, "1")], CTX, { market: "Wrongland" });
  assert.equal(upserts[0].rows[0].market, "United Kingdom");
});

test("a whole 5-answer set is written in one round trip", async () => {
  await persistAnswers([answer(0, "1"), answer(1, "2"), answer(2, "3"), answer(3, "4"), answer(4, "5")], CTX, {});
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].rows.length, 5);
  assert.deepEqual(upserts[0].rows.map((r) => r.question_index), [0, 1, 2, 3, 4]);
});

test("an empty answer set writes nothing at all", async () => {
  const r = await persistAnswers([], CTX, {});
  assert.equal(r.saved, 0);
  assert.equal(upserts.length, 0);
});

// ── Test / simulated traffic ────────────────────────────────────────────────

test("a simulated campaign's answers are marked as test data, whatever the client says", async () => {
  await persistAnswers([answer(0, "1")], { ...CTX, isSimulated: true }, { isDemo: false });
  assert.equal(upserts[0].rows[0].is_demo, true, "server-derived, not client-asserted");
});

test("client-declared test traffic is also marked, so QA runs stay excludable", async () => {
  await persistAnswers([answer(0, "1")], CTX, { isDemo: true });
  assert.equal(upserts[0].rows[0].is_demo, true);
});

test("real traffic is not marked as test data", async () => {
  await persistAnswers([answer(0, "1")], CTX, {});
  assert.equal(upserts[0].rows[0].is_demo, false);
});

// ── Campaign Group readiness (nullable; nothing reads it yet) ───────────────

test("a Campaign Group id is recorded when one exists, and omitted otherwise", async () => {
  // Omitted, not null: sending null would blank a group id an earlier write stored.
  await persistAnswers([answer(0, "1")], CTX, {});
  assert.ok(!("group_id" in upserts[0].rows[0]));

  upserts.length = 0;
  await persistAnswers([answer(0, "1")], { ...CTX, groupId: "wwc_2027_group" }, {});
  assert.equal(upserts[0].rows[0].group_id, "wwc_2027_group");
});

// ── Metadata preservation: a sparser write must never blank a richer one ────
// The completion backfill runs from /api/submit, whose payload differs from the
// per-selection one. Because an upsert writes every column it is GIVEN, a field the
// completion happens not to carry would otherwise overwrite the stored value with
// null. It cost us the `renderer` of every completed journey. Optional metadata is
// now OMITTED when absent, so ON CONFLICT DO UPDATE leaves it untouched.

const OPTIONAL = [
  "question_id", "canonical_question_key", "group_id", "publisher",
  "placement", "placement_id", "creative_id", "renderer",
  "survey_language", "country_code",
];

test("a write that lacks a field OMITS the column, so the stored value survives", async () => {
  // Completion-style context: no renderer, no placement ids, no creative.
  await persistAnswers([answer(0, "1")], { ...CTX, groupId: null }, { country: "United Kingdom" });
  const row = upserts[0].rows[0];
  for (const col of ["renderer", "placement", "placement_id", "creative_id", "group_id"]) {
    assert.ok(!(col in row), `${col} must be omitted, not sent as null (sending null would blank it)`);
  }
  // What IS known is still written.
  assert.equal(row.survey_id, CTX.surveyId);
  assert.equal(row.country_code, "GB");
});

test("every optional metadata column is written when known", async () => {
  await persistAnswers([answer(1, "2")], { ...CTX, groupId: "wwc_group" }, {
    placement: "homepage-mpu", placementId: "p1", creativeId: "studio-classic",
    renderer: "studio-classic", country: "United Kingdom",
  });
  const row = upserts[0].rows[0];
  const expected: Record<string, string> = {
    question_id: "q1001", canonical_question_key: "ck1", group_id: "wwc_group",
    publisher: "LiveScore", placement: "homepage-mpu", placement_id: "p1",
    creative_id: "studio-classic", renderer: "studio-classic",
    survey_language: "en", country_code: "GB",
  };
  for (const col of OPTIONAL) {
    assert.equal(row[col], expected[col], `${col} written`);
  }
});

test("an empty string counts as absent — it must not blank a stored value either", async () => {
  await persistAnswers([answer(0, "1")], CTX, { renderer: "", placement: "" });
  const row = upserts[0].rows[0];
  assert.ok(!("renderer" in row));
  assert.ok(!("placement" in row));
});

test("question identity is omitted rather than nulled when a caller cannot supply it", async () => {
  await persistAnswers(
    [{ sessionId: SESSION, questionIndex: 0, answerValue: "1", questionId: null, canonicalQuestionKey: null }],
    CTX, { renderer: "themed" },
  );
  const row = upserts[0].rows[0];
  assert.ok(!("question_id" in row), "identity absent, so an earlier identity survives");
  assert.ok(!("canonical_question_key" in row));
  assert.equal(row.renderer, "themed", "what IS known is still written");
});

test("bulk rows carry a uniform key set, as PostgREST requires", async () => {
  await persistAnswers(
    [answer(0, "1"), { sessionId: SESSION, questionIndex: 1, answerValue: "2", questionId: "q1001b", canonicalQuestionKey: null }],
    CTX, { renderer: "stack" },
  );
  const [r0, r1] = upserts[0].rows;
  assert.deepEqual(Object.keys(r0).sort(), Object.keys(r1).sort(), "same keys on every row of the batch");
  // canonical key present on one row only -> unioned in, null on the row without it.
  assert.equal(r0.canonical_question_key, "ck0");
  assert.equal(r1.canonical_question_key, null);
});

// ── Migration tolerance ─────────────────────────────────────────────────────

test("a pending migration 200 degrades the columns but never loses the answer", async () => {
  nextError = { code: "PGRST204", message: "Could not find the 'question_id' column of 'response_answers' in the schema cache" };

  const r = await persistAnswers([answer(2, "3")], CTX, { renderer: "themed" });

  assert.equal(r.error, null, "the answer was still saved");
  assert.equal(r.degraded, true);
  assert.equal(upserts.length, 2, "extended attempt, then the base-column fallback");

  const fallback = upserts[1].rows[0];
  // The migration-147 columns are always present, so the answer itself survives.
  assert.equal(fallback.session_id, SESSION);
  assert.equal(fallback.question_index, 2);
  assert.equal(fallback.answer_value, "3");
  assert.equal(fallback.survey_id, CTX.surveyId);
  // The migration-200 additions are simply absent, not null-stuffed.
  assert.ok(!("question_id" in fallback));
  assert.ok(!("renderer" in fallback));
});

test("the missing-column probe happens once, not on every answer", async () => {
  nextError = { code: "PGRST204", message: "column not found in schema cache" };
  await persistAnswers([answer(0, "1")], CTX, {});
  assert.equal(upserts.length, 2);

  upserts.length = 0;
  await persistAnswers([answer(1, "2")], CTX, {});
  assert.equal(upserts.length, 1, "goes straight to the base columns");
  assert.ok(!("question_id" in upserts[0].rows[0]));
});

test("a genuine database error is reported, not silently degraded", async () => {
  nextError = { code: "23505", message: "some other failure" };
  const r = await persistAnswers([answer(0, "1")], CTX, {});
  assert.equal(r.degraded, false);
  assert.match(String(r.error), /some other failure/);
  assert.equal(upserts.length, 1, "no pointless fallback attempt");
});

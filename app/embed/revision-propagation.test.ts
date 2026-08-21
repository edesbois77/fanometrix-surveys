// ── Carrying the server-issued revision through the shared evidence path ─────
//
// Criterion 8's failure mode was not a broken rule — it was a value the server
// computed correctly and the client silently dropped. The serve response has
// always carried configuration_revision_id; app/embed/page.tsx read five other
// fields from that response and discarded this one, and EmbedEvidenceContext
// had nowhere to put it. Every server-side test passed throughout.
//
// These tests therefore assert on the BODIES that actually leave the browser,
// and on the wiring that fills them, because that is where the value was lost.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sendEvent, saveAnswer, submitResponse,
  type EmbedEvidenceContext, type EmbedAnswer,
} from "./evidence";

const REV = "9f21ab00-1111-4222-8333-444455556666";
const GROUP = "fotmob-rotation";

let realFetch: typeof globalThis.fetch;
let sent: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  realFetch = globalThis.fetch;
  sent = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return { ok: true, status: 200, json: async () => ({ ok: true, saved: 1, success: true }) } as Response;
  }) as typeof globalThis.fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const ctx = (over: Partial<EmbedEvidenceContext> = {}): EmbedEvidenceContext => ({
  isPreview: false,
  sessionId: "11111111-2222-4333-8444-555555555555",
  campaignId: "wwc_fotmob_gb",
  surveyId: "survey-abc",
  publisher: "FotMob", placement: "mpu", placementId: "p1", creativeId: "c1",
  country: "United Kingdom", segment: null, market: "United Kingdom",
  device: "mobile", browser: "Chrome", renderer: "studio-classic",
  groupId: GROUP,
  configurationRevisionId: REV,
  ...over,
});

const answer = (qi: number): EmbedAnswer => ({
  questionIndex: qi, answerValue: "Alpha", questionId: `q${qi + 1}`, canonicalQuestionKey: `ck${qi + 1}`,
});

const bodiesFor = (path: string) => sent.filter(s => s.url === path).map(s => s.body);

describe("a Studio-group journey carries the revision on every write", () => {
  test("events carry it", async () => {
    sendEvent(ctx(), "SURVEY_RENDER");
    sendEvent(ctx(), "QUESTION_1_SHOWN");
    sendEvent(ctx(), "SURVEY_COMPLETED");
    const bodies = bodiesFor("/api/events");
    assert.equal(bodies.length, 3);
    for (const b of bodies) {
      assert.equal(b.configuration_revision_id, REV, `event ${b.event_type} lost the revision`);
      assert.equal(b.group_id, GROUP);
    }
  });

  test("every partial answer carries it, not just the completion", async () => {
    // The partial case is the one that matters: a respondent who answers Q1 and
    // closes on Q2 never reaches /api/submit, so if only the completion carried
    // provenance their answer would be unattributable.
    await saveAnswer(ctx(), answer(0));
    await saveAnswer(ctx(), answer(1));
    const bodies = bodiesFor("/api/answer");
    assert.equal(bodies.length, 2);
    for (const b of bodies) assert.equal(b.configuration_revision_id, REV);
  });

  test("the completion carries it", async () => {
    await submitResponse(ctx(), { campaign_id: "wwc_fotmob_gb", q1: "Alpha" }, [answer(0)]);
    const [b] = bodiesFor("/api/submit");
    assert.equal(b.configuration_revision_id, REV);
    assert.equal(b.group_id, GROUP);
  });

  test("all three tables receive the SAME session, campaign, group and revision", async () => {
    sendEvent(ctx(), "SURVEY_RENDER");
    await saveAnswer(ctx(), answer(0));
    await submitResponse(ctx(), { campaign_id: "wwc_fotmob_gb" }, [answer(0)]);
    // Deliberately NOT a fixed count: submitResponse also emits SURVEY_COMPLETED,
    // and any future write must agree too. Asserting on the set, not the tally,
    // is what makes this survive the evidence path gaining another call.
    assert.ok(sent.length >= 3, `expected at least three writes, saw ${sent.length}`);
    assert.ok(sent.some(s => s.url === "/api/events"));
    assert.ok(sent.some(s => s.url === "/api/answer"));
    assert.ok(sent.some(s => s.url === "/api/submit"));
    const key = (b: Record<string, unknown>) =>
      [b.session_id, b.campaign_id, b.group_id, b.configuration_revision_id].join("|");
    const keys = new Set(sent.map(s => key(s.body)));
    assert.equal(keys.size, 1, `evidence disagreed across tables: ${[...keys].join(" vs ")}`);
  });

  test("the completion cannot override the context's revision from its payload", async () => {
    // A renderer passing a stale value in `payload` must not win over the
    // shared context — that is how one renderer drifts from the other three.
    await submitResponse(
      ctx(),
      { campaign_id: "wwc_fotmob_gb", configuration_revision_id: "00000000-0000-4000-8000-000000000000" },
      [answer(0)],
    );
    const [b] = bodiesFor("/api/submit");
    assert.equal(b.configuration_revision_id, REV, "a renderer payload overrode the served revision");
  });
});

describe("non-group traffic carries NULL, and previews carry nothing at all", () => {
  test("an individual campaign sends null on all three", async () => {
    const c = ctx({ groupId: null, configurationRevisionId: null });
    sendEvent(c, "SURVEY_RENDER");
    await saveAnswer(c, answer(0));
    await submitResponse(c, { campaign_id: "wwc_fotmob_gb" }, [answer(0)]);
    for (const s of sent) {
      assert.equal(s.body.configuration_revision_id, null, `${s.url} invented a revision`);
      assert.equal(s.body.group_id, null);
    }
  });

  test("a legacy group journey sends a group but never a revision", async () => {
    const c = ctx({ groupId: "legacy_rotation", configurationRevisionId: null });
    sendEvent(c, "SURVEY_RENDER");
    await saveAnswer(c, answer(0));
    for (const s of sent) assert.equal(s.body.configuration_revision_id, null);
  });

  test("preview suppression is unchanged — no request leaves at all", async () => {
    // P0 rule. Adding a field must not make a preview start writing.
    const c = ctx({ isPreview: true });
    sendEvent(c, "SURVEY_RENDER");
    const saved = await saveAnswer(c, answer(0));
    const outcome = await submitResponse(c, { campaign_id: "wwc_fotmob_gb" }, [answer(0)]);
    assert.equal(sent.length, 0, "a preview wrote evidence");
    assert.equal(saved, true, "preview must still report success to the renderer");
    assert.equal(outcome.recorded, false);
  });

  test("a preview WITH a revision still writes nothing", async () => {
    // Belt and braces: suppression is decided by isPreview, never by whether
    // provenance happens to be present.
    const c = ctx({ isPreview: true, configurationRevisionId: REV, groupId: GROUP });
    sendEvent(c, "SURVEY_RENDER");
    await saveAnswer(c, answer(0));
    await submitResponse(c, { campaign_id: "wwc_fotmob_gb" }, [answer(0)]);
    assert.equal(sent.length, 0);
  });
});

describe("the wiring that fills the context", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

  test("the embed page captures the revision from the serve response", () => {
    const src = read("app/embed/page.tsx");
    assert.match(src, /data\.configuration_revision_id/,
      "page.tsx must read the revision the serve response carries — dropping it is the original defect");
  });

  test("the captured revision is WRITE-ONCE, so a boundary cannot retag a live journey", () => {
    const src = read("app/embed/page.tsx");
    assert.match(src, /revisionLocked/,
      "without a lock, a re-resolve mid-journey would replace the revision the journey was served under");
    // The lock must be checked before the setter, not merely declared.
    const guard = src.indexOf("!revisionLocked.current");
    const setter = src.indexOf("setResolvedRevisionId(data.configuration_revision_id)");
    assert.ok(guard !== -1 && setter !== -1 && guard < setter,
      "the write-once guard must gate the setter");
  });

  test("all four renderers put the revision in their shared evidence context", () => {
    // Not renderer-specific propagation: each builds the SAME context type, and
    // the shared evidence path is what sends it.
    for (const r of ["ClassicSurvey", "ThemedSurvey", "StudioClassicSurvey", "StackSurvey"]) {
      const src = read(`app/embed/${r}.tsx`);
      assert.match(src, /configurationRevisionId:/,
        `${r} does not carry the revision into its evidence context`);
    }
  });

  test("the shared evidence path is the ONLY place that builds the write bodies", () => {
    // If a renderer posted to /api/answer itself it would bypass this entirely.
    for (const r of ["ClassicSurvey", "ThemedSurvey", "StudioClassicSurvey", "StackSurvey"]) {
      const src = read(`app/embed/${r}.tsx`);
      for (const endpoint of ["/api/answer", "/api/events", "/api/submit"]) {
        assert.ok(!src.includes(`fetch("${endpoint}"`),
          `${r} posts to ${endpoint} directly instead of through evidence.ts`);
      }
    }
  });
});

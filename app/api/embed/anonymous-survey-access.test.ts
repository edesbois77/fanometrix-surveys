
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Anonymous access by survey UUID must fail closed, with or without ?preview=1.
//
// A survey UUID is not a secret: it appears in embed configuration and in every
// log line of an embed request. Anonymous review is served by a campaign-scoped
// GRANT, never by knowing a survey id.

let sessionOk = false;   // no session, and no organisation match

mock.module("@/lib/embed-preview-auth", {
  namedExports: {
    canPreviewSurvey: async () => sessionOk,
    canPreviewCampaign: async () => sessionOk,
    resolvePreviewSession: async () => null,
    ownsSurvey: () => false,
  },
});
mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from: () => {
        const api: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "in", "neq", "order", "limit"]) api[m] = () => api;
        api.single = () => Promise.resolve({
          data: { id: "s1", name: "Secret Draft", status: "draft", creative_design: "fanometrix",
                  topic: "Women's Football",
                  questions: [{ id: "q1", text: { en: "A confidential question?" }, options: [{ id: 1, text: { en: "Yes" } }] }],
                  intro_enabled: true, intro_title: { en: "Confidential intro" }, intro_body: { en: "x" },
                  thank_you_title: { en: "t" }, thank_you_body: { en: "b" }, thank_you_enabled: true },
          error: null,
        });
        api.maybeSingle = api.single;
        (api as { then?: unknown }).then = (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r);
        return api;
      },
    },
  },
});

let surveyGET: (req: NextRequest) => Promise<Response>;
before(async () => { ({ GET: surveyGET } = await import("./survey/route")); });

const ID = "d50eb76f-1e45-4264-b196-c3017aecfb69";

test("anonymous survey-UUID access is refused WITH preview=1", async () => {
  sessionOk = false;
  const res = await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${ID}&preview=1`));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.questions, undefined);
  assert.ok(!JSON.stringify(body).includes("confidential"), "no draft content in the body");
});

test("anonymous survey-UUID access is refused WITHOUT preview=1", async () => {
  // Previously this path was public for any survey bound to a deployed campaign.
  // Survey-id access is now the authenticated Studio builder context only.
  sessionOk = false;
  const res = await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${ID}`));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).questions, undefined);
});

test("the refusal leaks nothing about the survey — not even that it exists", async () => {
  sessionOk = false;
  const a = await (await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${ID}&preview=1`))).json();
  const b = await (await surveyGET(new NextRequest("https://x/api/embed/survey?id=00000000-0000-4000-8000-000000000000&preview=1"))).json();
  assert.deepEqual(a, b, "a real and an imaginary survey must answer identically");
});

test("an authorised session DOES resolve the draft", async () => {
  sessionOk = true;
  const res = await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${ID}&preview=1`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.questions.length, 1);
  assert.equal(body.intro_topic, "Women's Football", "and carries the Topic");
  assert.equal(body.creative_design, "fanometrix");
});

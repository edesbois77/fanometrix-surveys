
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Parity across every preview surface AND production.
//
// Requirement: Studio full-survey preview, Deploy inline preview and a valid
// ad-ops review link must resolve the SAME renderer, layout, creative, branding,
// topic, intro copy, questions, thank-you behaviour and language. This runs the
// real route handlers over one mocked database and diffs the resolved payloads.

const SURVEY_ID = "d50eb76f-1e45-4264-b196-c3017aecfb69";
const CAMPAIGN_SLUG = "zzz_parity_campaign";
const VALID_TOKEN = "T".repeat(43);

const BUILDER = {
  mode: "gradient", name: "Fanometrix Premium", text: "#FFFFFF", timer: "#D7B87A",
  border: "#D7B87A", glowHex: "#000000", glowAlpha: 0.6, background: "#041B33",
  headerText: "#041B33", headerColor: "#D7B87A", quadrantBase: "#0B1929",
  selectedText: "#041B33", selectedColor: "#D7B87A", useThirdColor: false,
  gradientColor1: "#D7B87A", gradientColor2: "#A8864A", gradientColor3: "#7C3AED",
  gradientDirection: "180deg", mirrorTopQuadrants: true,
};

const DESIGNS: Record<string, { layout: string; builder_state: unknown; branding: unknown; config: unknown }> = {
  "fanometrix":       { layout: "timer",      builder_state: BUILDER, branding: null, config: null },
  "studio-classic":   { layout: "classic",    builder_state: BUILDER, branding: null, config: { renderer: "studio-classic" } },
  "classic":          { layout: "classic",    builder_state: BUILDER, branding: null, config: null },
  "fan-invitation":   { layout: "invitation", builder_state: BUILDER, branding: null, config: null },
  "fanometrix-stack": { layout: "stack",      builder_state: BUILDER, branding: null, config: { defaultTopic: "Champions League" } },
  "my_custom_theme":  { layout: "timer",      builder_state: BUILDER, branding: { publisher_logo_url: "https://x/l.png", publisher_logo_visible: true }, config: null },
};
let CURRENT_DESIGN = "fanometrix";

// The survey the Studio authored: a Topic, an intro, five questions.
const SURVEY_ROW = () => ({
  id: SURVEY_ID, name: "Parity Survey", status: "ready",
  creative_design: CURRENT_DESIGN,
  topic: "Women's Football",
  questions: [
    { id: "q1", text: { en: "Q1?" }, options: [{ id: 1, text: { en: "A" } }, { id: 2, text: { en: "B" } }] },
    { id: "q2", text: { en: "Q2?" }, options: [{ id: 1, text: { en: "C" } }, { id: 2, text: { en: "D" } }] },
  ],
  intro_enabled: true, intro_title: { en: "Football fans deserve a voice." }, intro_body: { en: "Help shape it." },
  thank_you_title: { en: "Thanks" }, thank_you_body: { en: "Body" }, thank_you_enabled: true,
});

let grantRow: Record<string, unknown> | null = null;

function builder(table: string) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "neq", "order", "limit", "update"]) api[m] = () => api;
  const row = () => {
    if (table === "creative_designs") {
      const d = DESIGNS[CURRENT_DESIGN];
      return d ? { layout: d.layout, builder_state: d.builder_state, branding: d.branding, config: d.config } : null;
    }
    if (table === "surveys") return SURVEY_ROW();
    if (table === "campaigns") return {
      id: "cid", campaign_id: CAMPAIGN_SLUG, status: "live", manual_status_override: null,
      start_date: null, end_date: null, target_responses: null, target_mode: "continue",
      archive_after_days: null, status_updated_at: null, country_code: "GB",
      survey_language: "en", creative_design: CURRENT_DESIGN, survey_id: SURVEY_ID,
      research_project_id: null, topic: null, deleted_at: null,
    };
    if (table === "campaign_preview_grants") return grantRow;
    return null;
  };
  api.single = () => Promise.resolve({ data: row(), error: null });
  api.maybeSingle = api.single;
  (api as { then?: unknown }).then = (r: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(r);
  return api;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => builder(t) } } });
mock.module("@/lib/embed-preview-auth", {
  namedExports: { canPreviewSurvey: async () => true, canPreviewCampaign: async () => true,
                  resolvePreviewSession: async () => null, ownsSurvey: () => true },
});

let surveyGET: (req: NextRequest) => Promise<Response>;
let campaignGET: (req: NextRequest) => Promise<Response>;
before(async () => {
  ({ GET: surveyGET }   = await import("./survey/route"));
  ({ GET: campaignGET } = await import("./campaign/route"));
  grantRow = {
    id: "g1", campaign_id: "cid", survey_id: SURVEY_ID, organisation_id: "org-1",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(), revoked_at: null, last_used_at: null, use_count: 0,
  };
});

// Everything a reviewer sees must match, not just the creative.
const PARITY_FIELDS = [
  "creative_design", "custom_theme", "layout", "renderer", "config", "topic", "branding",
  "intro_enabled", "intro_title", "intro_body", "intro_topic",
  "thank_you_title", "thank_you_body", "thank_you_system", "thank_you_enabled",
  "questions",
] as const;
const pick = (o: Record<string, unknown>) => Object.fromEntries(PARITY_FIELDS.map(k => [k, o[k] ?? null]));

const surveyPreview   = async () => (await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${SURVEY_ID}&preview=1`))).json();
const deployInline    = async () => (await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}&preview=1`))).json();
const adopsGrant      = async () => (await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}&preview_token=${VALID_TOKEN}`))).json();
const productionServe = async () => (await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}`))).json();

test("Topic reaches every surface — the reported defect", async () => {
  for (const [name, fetcher] of Object.entries({ surveyPreview, deployInline, adopsGrant, productionServe })) {
    const p = await fetcher();
    assert.equal(p.intro_topic, "Women's Football", `${name} must carry the authored Topic`);
  }
});

test("all four surfaces resolve IDENTICAL configuration, for every layout", async () => {
  for (const slug of Object.keys(DESIGNS)) {
    CURRENT_DESIGN = slug;
    const [a, b, c, d] = [await surveyPreview(), await deployInline(), await adopsGrant(), await productionServe()];
    assert.deepEqual(pick(a), pick(b), `${slug}: Studio preview vs Deploy inline`);
    assert.deepEqual(pick(b), pick(c), `${slug}: Deploy inline vs ad-ops grant`);
    assert.deepEqual(pick(c), pick(d), `${slug}: ad-ops grant vs production`);
  }
  CURRENT_DESIGN = "fanometrix";
});

test("intro copy, thank-you behaviour and questions all match", async () => {
  const a = await surveyPreview(), d = await productionServe();
  for (const f of ["intro_enabled", "intro_title", "intro_body", "intro_topic",
                   "thank_you_title", "thank_you_body", "thank_you_system", "thank_you_enabled"]) {
    assert.deepEqual(a[f], d[f], `${f} must match`);
  }
  assert.deepEqual(a.questions, d.questions, "questions must match");
  assert.equal(a.questions.length, 2);
});

test("a valid grant serves the campaign with NO session", async () => {
  const p = await adopsGrant();
  assert.equal(p.creative_design, "fanometrix");
  assert.equal(p.questions.length, 2);
  assert.equal(p.intro_topic, "Women's Football");
});

test("expired, revoked, malformed and mismatched grants reveal NO content", async () => {
  const saved = grantRow;
  const cases: Array<[string, () => void, string]> = [
    ["expired",   () => { grantRow = { ...(saved as object), expires_at: new Date(Date.now() - 1000).toISOString() }; }, VALID_TOKEN],
    ["revoked",   () => { grantRow = { ...(saved as object), revoked_at: new Date().toISOString() }; }, VALID_TOKEN],
    ["unknown",   () => { grantRow = null; }, VALID_TOKEN],
    ["malformed", () => { grantRow = saved; }, "nope"],
  ];
  for (const [name, setup, token] of cases) {
    setup();
    const res = await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}&preview_token=${token}`));
    assert.equal(res.status, 404, `${name} must 404`);
    const body = await res.json();
    assert.equal(body.questions, undefined, `${name} must reveal no questions`);
    assert.equal(body.intro_title, undefined, `${name} must reveal no intro`);
    assert.equal(body.creative_design, undefined, `${name} must reveal no creative`);
  }
  grantRow = saved;
});

test("a mismatched campaign beside a valid token reveals nothing", async () => {
  const res = await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=some_other&preview_token=${VALID_TOKEN}`));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).questions, undefined);
});

test("preview responses carry Referrer-Policy: no-referrer", async () => {
  const res = await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}&preview_token=${VALID_TOKEN}`));
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
});

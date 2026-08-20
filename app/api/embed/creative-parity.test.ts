import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Integration: the Studio draft Preview and the deployed campaign for the SAME
// survey must resolve IDENTICAL creative configuration.
//
// This is the assertion the WWC requirement reduces to — "Preview must show the
// exact creative that partners will receive". It runs both real route handlers
// over one mocked database and diffs the seven creative fields, so a divergence
// fails the suite instead of reaching a partner.
//
// /api/embed/campaign is deliberately NOT refactored in this release (it is the
// live delivery path). This test is what pins the two together meanwhile.

const SURVEY_ID = "d50eb76f-1e45-4264-b196-c3017aecfb69";
const CAMPAIGN_SLUG = "zzz_parity_campaign";

const BUILDER = {
  mode: "gradient", name: "Fanometrix Premium", text: "#FFFFFF", timer: "#D7B87A",
  border: "#D7B87A", glowHex: "#000000", glowAlpha: 0.6, background: "#041B33",
  headerText: "#041B33", headerColor: "#D7B87A", quadrantBase: "#0B1929",
  selectedText: "#041B33", selectedColor: "#D7B87A", useThirdColor: false,
  gradientColor1: "#D7B87A", gradientColor2: "#A8864A", gradientColor3: "#7C3AED",
  gradientDirection: "180deg", mirrorTopQuadrants: true,
};

// Every layout, so parity is proven across the whole creative surface rather
// than for one happy case.
const DESIGNS: Record<string, { layout: string; builder_state: unknown; branding: unknown; config: unknown }> = {
  "fanometrix":       { layout: "timer",      builder_state: BUILDER, branding: null, config: null },
  "studio-classic":   { layout: "classic",    builder_state: BUILDER, branding: null, config: { renderer: "studio-classic" } },
  "classic":          { layout: "classic",    builder_state: BUILDER, branding: null, config: null },
  "fan-invitation":   { layout: "invitation", builder_state: BUILDER, branding: null, config: null },
  "fanometrix-stack": { layout: "stack",      builder_state: BUILDER, branding: null, config: { defaultTopic: "Champions League" } },
  "my_custom_theme":  { layout: "timer",      builder_state: BUILDER, branding: { publisher_logo_url: "https://x/l.png", publisher_logo_visible: true }, config: null },
};

// The design under test — reassigned per case so both routes read the same one.
let CURRENT_DESIGN = "fanometrix";

const QUESTIONS = [
  { id: "q1", text: { en: "Q1?" }, options: [{ id: 1, text: { en: "A" } }, { id: 2, text: { en: "B" } }] },
];

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const api: Record<string, unknown> = {};
  const chain = (k: string) => (a?: unknown, b?: unknown) => { if (typeof a === "string") filters[`${k}:${a}`] = b; return api; };
  for (const m of ["select", "eq", "is", "in", "neq", "order", "limit"]) api[m] = chain(m);

  const row = () => {
    if (table === "creative_designs") {
      const d = DESIGNS[CURRENT_DESIGN];
      return d ? { layout: d.layout, builder_state: d.builder_state, branding: d.branding, config: d.config } : null;
    }
    if (table === "surveys") {
      return { id: SURVEY_ID, name: "Parity Survey", questions: QUESTIONS, creative_design: CURRENT_DESIGN,
               thank_you_title: { en: "Thanks" }, thank_you_body: { en: "Body" },
               intro_enabled: true, intro_title: { en: "Intro" }, intro_body: { en: "Body" }, thank_you_enabled: true };
    }
    if (table === "campaigns") {
      return { id: "cid", campaign_id: CAMPAIGN_SLUG, status: "live", manual_status_override: null,
               start_date: null, end_date: null, target_responses: null, target_mode: "continue",
               archive_after_days: null, status_updated_at: null, country_code: "GB",
               survey_language: "en", creative_design: CURRENT_DESIGN, survey_id: SURVEY_ID,
               research_project_id: null, topic: null };
    }
    return null;
  };

  api.single = () => Promise.resolve({ data: row(), error: null });
  // `.select("*", { count, head })` and plain awaited chains
  (api as { then?: unknown }).then = (res: (v: unknown) => void) =>
    Promise.resolve({ data: table === "campaigns" ? [row()] : [], error: null, count: 0 }).then(res);
  return api;
}

mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => builder(t) } } });
// Preview authorisation is exercised by lib/embed-preview-auth.test.ts; here it
// is stubbed so this test isolates creative resolution.
mock.module("@/lib/embed-preview-auth", {
  namedExports: { canPreviewSurvey: async () => true, canPreviewCampaign: async () => true, resolvePreviewSession: async () => null, ownsSurvey: () => true },
});

let surveyGET: (req: NextRequest) => Promise<Response>;
let campaignGET: (req: NextRequest) => Promise<Response>;
before(async () => {
  ({ GET: surveyGET }   = await import("./survey/route"));
  ({ GET: campaignGET } = await import("./campaign/route"));
});

const CREATIVE_FIELDS = ["creative_design", "custom_theme", "layout", "renderer", "config", "topic", "branding"] as const;
const pick = (o: Record<string, unknown>) => Object.fromEntries(CREATIVE_FIELDS.map(k => [k, o[k] ?? null]));

async function bothPayloads() {
  const s = await (await surveyGET(new NextRequest(`https://x/api/embed/survey?id=${SURVEY_ID}&preview=1`))).json();
  const c = await (await campaignGET(new NextRequest(`https://x/api/embed/campaign?campaign_id=${CAMPAIGN_SLUG}`))).json();
  return { s, c };
}

test("survey Preview returns all seven creative fields", async () => {
  const { s } = await bothPayloads();
  for (const f of CREATIVE_FIELDS) {
    assert.ok(f in s, `survey payload must carry "${f}" — its absence was the original defect`);
  }
});

test("Preview and campaign resolve IDENTICAL creative config, for every layout", async () => {
  for (const slug of Object.keys(DESIGNS)) {
    CURRENT_DESIGN = slug;
    const { s, c } = await bothPayloads();
    assert.deepEqual(pick(s), pick(c),
      `${slug}: draft Preview and deployed campaign must resolve the same creative`);
    assert.equal(s.creative_design, slug, `${slug}: echoed back`);
  }
  CURRENT_DESIGN = "fanometrix";
});

test("the selected creative is never silently replaced by a default", async () => {
  // The reported symptom: Preview showed a default creative instead of the one
  // chosen on the Creative stage.
  CURRENT_DESIGN = "fanometrix";
  const { s } = await bothPayloads();
  assert.equal(s.creative_design, "fanometrix");
  assert.equal(s.layout, "timer");
  assert.equal(s.renderer, "timer");
  assert.notEqual(s.custom_theme, null, "Fanometrix Premium is a timer design and must carry its palette");
});

test("Preview still carries the survey journey fields alongside the creative", async () => {
  const { s } = await bothPayloads();
  assert.equal(s.intro_enabled, true);
  assert.equal(Array.isArray(s.questions), true);
  assert.ok(s.thank_you_title, "thank-you copy preserved");
});

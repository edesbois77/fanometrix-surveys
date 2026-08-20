import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDesignSample, isPreviewContext, isProductionDelivery, suppressEvidence,
  initialPhase, phaseForFailure, mayMountSurvey, type EmbedContext,
} from "./embed-preview-phase";

const ctx = (o: Partial<EmbedContext> = {}): EmbedContext => ({
  hasCampaignSlug: false, hasGroupSlug: false, hasSurveyId: false,
  previewFlag: false, hasPreviewToken: false, ...o,
});

const SURVEY_PREVIEW  = ctx({ hasSurveyId: true, previewFlag: true });
const CAMPAIGN_INLINE = ctx({ hasCampaignSlug: true, previewFlag: true });
const ADOPS_GRANT     = ctx({ hasCampaignSlug: true, hasPreviewToken: true });
const PRODUCTION      = ctx({ hasCampaignSlug: true });
const PRODUCTION_GRP  = ctx({ hasGroupSlug: true });
const DESIGN_SAMPLE   = ctx();

// ── 1. No survey renderer before resolution ─────────────────────────────────
test("every resolved context starts in loading, so nothing can mount first", () => {
  for (const [name, c] of Object.entries({ SURVEY_PREVIEW, CAMPAIGN_INLINE, ADOPS_GRANT, PRODUCTION, PRODUCTION_GRP })) {
    assert.equal(initialPhase(c), "loading", `${name} must start loading`);
    assert.equal(mayMountSurvey(initialPhase(c)), false, `${name} must not mount a renderer initially`);
  }
});

test("only the design sample may render sample content immediately", () => {
  assert.equal(isDesignSample(DESIGN_SAMPLE), true);
  assert.equal(initialPhase(DESIGN_SAMPLE), "resolved");
  for (const c of [SURVEY_PREVIEW, CAMPAIGN_INLINE, ADOPS_GRANT, PRODUCTION, PRODUCTION_GRP]) {
    assert.equal(isDesignSample(c), false);
  }
});

// ── 2. A delayed resolution cannot flash a renderer ─────────────────────────
test("a slow API keeps the phase in loading — no intermediate mount to replace", () => {
  let phase = initialPhase(SURVEY_PREVIEW);
  for (let tick = 0; tick < 50; tick++) {
    assert.equal(mayMountSurvey(phase), false, `still unresolved at tick ${tick}`);
  }
  phase = "resolved";
  assert.equal(mayMountSurvey(phase), true, "mounts exactly once, after resolution");
});

// ── 5. Failures reveal nothing ──────────────────────────────────────────────
test("401/403/404 are unavailable; nothing may mount", () => {
  for (const status of [401, 403, 404]) {
    assert.equal(phaseForFailure(status), "unavailable");
    assert.equal(mayMountSurvey(phaseForFailure(status)), false);
  }
});

test("a network failure is an error; nothing may mount", () => {
  assert.equal(phaseForFailure(null), "error");
  assert.equal(mayMountSurvey(phaseForFailure(null)), false);
});

test("no status maps to a phase that renders content", () => {
  for (const status of [200, 204, 301, 400, 418, 429, 500, 502, 503, null]) {
    assert.equal(mayMountSurvey(phaseForFailure(status)), false, `status ${status} must not mount`);
  }
});

// ── 10 / 12. Evidence isolation ─────────────────────────────────────────────
test("ONLY production delivery records evidence", () => {
  assert.equal(isProductionDelivery(PRODUCTION), true);
  assert.equal(isProductionDelivery(PRODUCTION_GRP), true);
  assert.equal(suppressEvidence(PRODUCTION), false, "production must still record");
  assert.equal(suppressEvidence(PRODUCTION_GRP), false, "group production must still record");
});

test("every preview context is silent, including an ad-ops grant with no preview flag", () => {
  for (const [name, c] of Object.entries({ SURVEY_PREVIEW, CAMPAIGN_INLINE, ADOPS_GRANT, DESIGN_SAMPLE })) {
    assert.equal(suppressEvidence(c), true, `${name} must write no evidence`);
  }
});

test("regression: a token WITHOUT preview=1 is still silent", () => {
  // ?preview=1 alone was the old switch. An ad-ops review link does not carry
  // it, so keying on that flag would have written real evidence against a real
  // campaign from an anonymous reviewer's browser.
  const tokenOnly = ctx({ hasCampaignSlug: true, hasPreviewToken: true, previewFlag: false });
  assert.equal(isProductionDelivery(tokenOnly), false);
  assert.equal(suppressEvidence(tokenOnly), true);
});

// ── Context classification ──────────────────────────────────────────────────
test("survey-id access is always a gated preview context, flag or not", () => {
  assert.equal(isPreviewContext(ctx({ hasSurveyId: true })), true);
  assert.equal(isPreviewContext(ctx({ hasSurveyId: true, previewFlag: true })), true);
});

test("production is never treated as a preview context", () => {
  assert.equal(isPreviewContext(PRODUCTION), false);
  assert.equal(isPreviewContext(PRODUCTION_GRP), false);
});

test("the four contexts are mutually consistent", () => {
  const all = [SURVEY_PREVIEW, CAMPAIGN_INLINE, ADOPS_GRANT, PRODUCTION, PRODUCTION_GRP, DESIGN_SAMPLE];
  for (const c of all) {
    // Production and preview are exclusive; evidence follows production exactly.
    assert.notEqual(isProductionDelivery(c) && isPreviewContext(c), true, "cannot be both");
    assert.equal(suppressEvidence(c), !isProductionDelivery(c));
  }
});

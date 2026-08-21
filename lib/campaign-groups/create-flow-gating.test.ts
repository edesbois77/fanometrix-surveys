// ── The Campaigns stage must not show Campaign Groups when the flag is off ───
//
// Post-merge repair. The flag gate closed the APIs correctly, but
// CampaignGroupsSection is a client component that was mounted unconditionally:
// it swallowed the two 404s and still rendered its heading, its explanatory copy
// and a disabled Create button — plus empty-state text ("Add campaigns above")
// that was untrue, because the candidates call had been gated rather than the
// survey lacking campaigns.
//
// The repair copies /survey-studio/manage: resolve the flag in the SERVER
// component and hand down a plain boolean. Availability is deliberately NOT
// inferred from 404 responses — a request can fail for reasons unrelated to the
// rollout, and treating those as "feature off" would let an unrelated API
// outage silently hide the interface.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campaignGroupsStudioEnabled } from "./flag";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const PAGE      = "app/survey-studio/create/[surveyId]/page.tsx";
const WORKSPACE = "app/components/studio/create/CreateWorkspace.tsx";
const CAMPAIGNS = "app/components/studio/create/campaigns/CampaignsStage.tsx";
const DEPLOY    = "app/components/studio/create/deploy/DeployStage.tsx";
const SECTION   = "app/components/studio/create/campaigns/CampaignGroupsSection.tsx";

describe("the flag contract stays strict", () => {
  test("true and 1 enable; absent and every near-miss do not", () => {
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: "true" }), true);
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: "1" }), true);

    assert.equal(campaignGroupsStudioEnabled({}), false, "absent must be off");
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: "false" }), false);
    for (const v of ["TRUE", "True", "yes", "YES", "on", "ON", "enabled", " true", "true ", "0", ""]) {
      assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: v }), false,
        `${JSON.stringify(v)} must not enable the feature`);
    }
  });
});

describe("the boolean is resolved on the server and threaded down", () => {
  test("the Create page resolves the flag itself", () => {
    const src = read(PAGE);
    assert.match(src, /campaignGroupsStudioEnabled/,
      "the server page must resolve the flag");
    assert.match(src, /campaignGroupsEnabled=\{campaignGroupsStudioEnabled\(\)\}/,
      "the resolved boolean must be passed to CreateWorkspace");
    assert.doesNotMatch(src, /"use client"/, "this page must stay a server component");
  });

  test("the workspace passes it to BOTH stages that can surface groups", () => {
    const src = read(WORKSPACE);
    assert.match(src, /<CampaignsStage[^>]*campaignGroupsEnabled=\{campaignGroupsEnabled\}/);
    assert.match(src, /<DeployStage[^>]*campaignGroupsEnabled=\{campaignGroupsEnabled\}/);
  });

  test("every prop in the chain defaults to FALSE", () => {
    // A caller that forgets the prop must hide the feature, never expose it.
    for (const p of [WORKSPACE, CAMPAIGNS, DEPLOY]) {
      assert.match(read(p), /campaignGroupsEnabled = false/,
        `${p}: the prop must default to false`);
      assert.match(read(p), /campaignGroupsEnabled\?: boolean/,
        `${p}: the prop must be optional so the default applies`);
    }
  });
});

describe("when off, the section is not mounted at all", () => {
  test("CampaignsStage gates the mount, not merely the visibility", () => {
    const src = read(CAMPAIGNS);
    assert.match(src, /\{campaignGroupsEnabled && <CampaignGroupsSection/,
      "the section must be conditionally MOUNTED — a hidden-but-mounted component still runs its effects");
    assert.doesNotMatch(src, /^\s*<CampaignGroupsSection surveyId=\{surveyId\} \/>\s*$/m,
      "an ungated render of the section remains");
  });

  test("DeployStage gates its group tags the same way", () => {
    const src = read(DEPLOY);
    assert.match(src, /\{campaignGroupsEnabled && <DeployGroupTags/);
  });

  test("no Campaign Group request can be issued while off", () => {
    // The fetches live inside the two gated components and nowhere else in the
    // stage, so not mounting them is what guarantees no request is made.
    const stage = read(CAMPAIGNS);
    for (const endpoint of ["/api/studio/campaign-groups", "group-candidates"]) {
      assert.ok(!stage.includes(endpoint),
        `CampaignsStage itself calls ${endpoint}; gating the child would not stop it`);
    }
    const section = read(SECTION);
    assert.match(section, /\/api\/studio\/campaign-groups/, "the section is where the calls belong");
    assert.match(section, /group-candidates/);
  });
});

describe("when on, nothing about the existing implementation changes", () => {
  test("the section itself is untouched by this repair — no flag reaches it", () => {
    const src = read(SECTION);
    assert.doesNotMatch(src, /CAMPAIGN_GROUPS_STUDIO_ENABLED/,
      "the environment variable NAME must never appear in a client component");
    assert.doesNotMatch(src, /campaignGroupsStudioEnabled/,
      "the client must not resolve the flag; it receives a decision, not the question");
    // It still renders its heading and control when it IS mounted.
    assert.match(src, /Campaign groups/);
    assert.match(src, /Create campaign group/);
  });

  test("the flag's value and name stay out of every client component", () => {
    for (const p of [WORKSPACE, CAMPAIGNS, DEPLOY, SECTION]) {
      assert.ok(!read(p).includes("CAMPAIGN_GROUPS_STUDIO_ENABLED"),
        `${p} names the environment variable in the client bundle`);
      assert.ok(!read(p).includes("process.env"),
        `${p} reads process.env in a client component`);
    }
  });

  test("existing Campaigns-stage behaviour is untouched", () => {
    // The repair must be additive: the campaign controls above the section keep
    // working identically whether the capability is on or off.
    const src = read(CAMPAIGNS);
    for (const marker of ["Plan distribution", "Configure campaigns"]) {
      assert.ok(src.includes(marker), `the stage lost "${marker}"`);
    }
    assert.match(src, /useCampaignSelection/, "campaign selection must remain");
    assert.match(src, /DeployConfirmModal/, "the deploy confirmation must remain");
    // Stage navigation lives in the workspace, not the stage, and the added prop
    // must not have disturbed it.
    assert.match(read(WORKSPACE), /Continue to Deploy/, "stage navigation was lost");
  });
});

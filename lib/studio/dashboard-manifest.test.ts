import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardManifest,
  resolveDashboardManifest,
  validateDashboardFilters,
  effectiveSlugsForFilters,
  type DashboardManifest,
} from "./dashboard-manifest";
import type { ScopeCampaign, DashboardDb } from "./dashboard-scope";

// Publisher-name resolver whose domain is the authorised org ids only.
const NAMES: Record<string, string> = { "org-fotmob": "FotMob", "org-livescore": "LiveScore", "org-f365": "Football365" };
const nameOf = (id: string) => NAMES[id] ?? "Publisher";

function camp(over: Partial<ScopeCampaign>): ScopeCampaign {
  return { id: "c", campaign_id: "slug", survey_id: "s", publisher_org_id: null, market: null, country_code: null, survey_language: null, ...over };
}

const dimKeys = (m: DashboardManifest) => m.dimensions.map((d) => d.key).sort();
const dim = (m: DashboardManifest, k: string) => m.dimensions.find((d) => d.key === k);
const allLabels = (m: DashboardManifest) => m.dimensions.flatMap((d) => d.values.map((v) => v.label));

// ── FotMob scenario: single authorised publisher ─────────────────────────────
test("FotMob (single-publisher universe): Publisher dimension omitted; no rival names anywhere", () => {
  const campaigns = [
    camp({ id: "1", campaign_id: "studio_fot_a", publisher_org_id: "org-fotmob", market: "GB", survey_language: "en" }),
    camp({ id: "2", campaign_id: "studio_fot_b", publisher_org_id: "org-fotmob", market: "DE", survey_language: "de" }),
  ];
  const m = buildDashboardManifest(campaigns, nameOf);
  assert.ok(!dim(m, "publisher"), "single-publisher: Publisher omitted (no comparison)");
  const labels = allLabels(m).join(" | ");
  assert.ok(!labels.includes("LiveScore"), "LiveScore never present");
  assert.ok(!labels.includes("Football365"), "Football365 never present");
  // Market/Language still carry two distinct values → present.
  assert.deepEqual(dimKeys(m).filter((k) => k !== "campaign"), ["language", "market"]);
});

test("multi-publisher client: Publisher dimension present with exactly the authorised publishers", () => {
  const campaigns = [
    camp({ id: "1", campaign_id: "s1", publisher_org_id: "org-fotmob", market: "GB", survey_language: "en" }),
    camp({ id: "2", campaign_id: "s2", publisher_org_id: "org-livescore", market: "GB", survey_language: "en" }),
  ];
  const m = buildDashboardManifest(campaigns, nameOf);
  const pub = dim(m, "publisher")!;
  assert.ok(pub, "two publishers → comparable → present");
  assert.deepEqual(pub.values.map((v) => v.id).sort(), ["org-fotmob", "org-livescore"].sort());
  assert.deepEqual(pub.values.map((v) => v.label).sort(), ["FotMob", "LiveScore"].sort());
});

test("Market is always surfaced when present (even a single market); language with one value is still omitted", () => {
  const campaigns = [
    camp({ id: "1", campaign_id: "s1", publisher_org_id: "org-fotmob", market: "GB", survey_language: "en" }),
    camp({ id: "2", campaign_id: "s2", publisher_org_id: "org-livescore", market: "GB", survey_language: "en" }),
  ];
  const m = buildDashboardManifest(campaigns, nameOf);
  assert.ok(dim(m, "market"), "single market GB → still shown (Market is a core filter)");
  assert.deepEqual(dim(m, "market")!.values.map((v) => v.id), ["GB"], "the one market is the only value");
  assert.ok(!dim(m, "language"), "single language en → omitted");
  assert.ok(dim(m, "publisher"), "two publishers → present");
  assert.ok(dim(m, "campaign"), "two campaigns → present");
});

test("Market is omitted only when NO market is recorded at all (campaigns with null market/country)", () => {
  const campaigns = [
    camp({ id: "1", campaign_id: "s1", publisher_org_id: "org-fotmob", market: null, country_code: null }),
    camp({ id: "2", campaign_id: "s2", publisher_org_id: "org-livescore", market: null, country_code: null }),
  ];
  const m = buildDashboardManifest(campaigns, nameOf);
  assert.ok(!dim(m, "market"), "zero market values → nothing to filter → omitted");
  assert.ok(dim(m, "publisher"), "two publishers → present");
});

test("manifest never contains a publisher outside the authorised campaign set (leak-safe by construction)", async () => {
  // The organisations table also holds an inaccessible publisher (Football365),
  // but only FotMob+LiveScore campaigns are authorised → only they can appear.
  const db = {
    from: () => ({
      select: () => ({
        in: (_c: string, ids: unknown[]) => ({
          then: (resolve: (v: { data: { id: string; name: string }[]; error: null }) => void) => {
            const all = [
              { id: "org-fotmob", name: "FotMob" },
              { id: "org-livescore", name: "LiveScore" },
              { id: "org-f365", name: "Football365" },
            ];
            const set = new Set(ids as string[]);
            resolve({ data: all.filter((o) => set.has(o.id)), error: null });
          },
        }),
      }),
    }),
  } as unknown as DashboardDb;
  const campaigns = [
    camp({ id: "1", campaign_id: "s1", publisher_org_id: "org-fotmob" }),
    camp({ id: "2", campaign_id: "s2", publisher_org_id: "org-livescore" }),
  ];
  const m = await resolveDashboardManifest(campaigns, { client: db });
  const labels = allLabels(m).join(" | ");
  assert.ok(!labels.includes("Football365"), "inaccessible publisher never resolved into the manifest");
  assert.deepEqual(dim(m, "publisher")!.values.map((v) => v.label).sort(), ["FotMob", "LiveScore"].sort());
});

// ── Filter validation (fail-closed, manifest-bound) ──────────────────────────
const twoPublisherManifest: DashboardManifest = {
  dimensions: [{ key: "publisher", label: "Publisher", values: [{ id: "org-fotmob", label: "FotMob" }, { id: "org-livescore", label: "LiveScore" }] }],
};
const fotmobOnlyManifest: DashboardManifest = { dimensions: [] }; // single-publisher → publisher omitted

test("valid value accepted", () => {
  const r = validateDashboardFilters(twoPublisherManifest, { publisher: "org-fotmob" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filters, { publisher: "org-fotmob" });
});

test("unknown dimension fails closed", () => {
  const r = validateDashboardFilters(twoPublisherManifest, { device: "ios" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejections[0].reason, "unknown_dimension");
});

test("out-of-manifest value fails closed", () => {
  const r = validateDashboardFilters(twoPublisherManifest, { publisher: "org-f365" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejections[0].reason, "value_out_of_manifest");
});

test("FotMob cannot filter to a Publisher the manifest never offered (omitted dim = unknown)", () => {
  // The arbitrary publisher id is compared to the manifest and rejected — it is
  // NEVER resolved to a name, so no inaccessible organisation can be disclosed.
  const r = validateDashboardFilters(fotmobOnlyManifest, { publisher: "org-livescore" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejections[0].reason, "unknown_dimension");
});

test("empty / absent filters are valid (no constraint)", () => {
  const r = validateDashboardFilters(twoPublisherManifest, { publisher: "", market: undefined });
  assert.equal(r.ok, true);
  assert.deepEqual(r.filters, {});
});

test("effectiveSlugsForFilters narrows the authorised set by a validated filter", () => {
  const campaigns = [
    camp({ id: "1", campaign_id: "s1", publisher_org_id: "org-fotmob" }),
    camp({ id: "2", campaign_id: "s2", publisher_org_id: "org-livescore" }),
  ];
  assert.deepEqual(effectiveSlugsForFilters(campaigns, { publisher: "org-fotmob" }), ["s1"]);
});

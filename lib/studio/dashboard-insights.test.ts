import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsights, type DimensionSlice } from "./dashboard-insights";

const slice = (value: string, label: string, starts: number, completions: number): DimensionSlice => ({ value, label, starts, completions });

test("geographic insight fires for a dominant market; offers filter only when market is in the manifest", () => {
  const input = {
    totalStarts: 1000,
    byMarket: [slice("GB", "United Kingdom", 440, 300), slice("DE", "Germany", 300, 200), slice("FR", "France", 260, 150)],
    byDevice: [], byPublisher: [], manifestDimensions: new Set(["market"]),
  };
  const geo = buildInsights(input).find((i) => i.id === "geo")!;
  assert.match(geo.text, /United Kingdom generated 44% of survey starts/);
  assert.deepEqual(geo.filter, { dimension: "market", value: "GB" });

  // Same data, market NOT in manifest → text stays, no filter action (no leak).
  const noFilter = buildInsights({ ...input, manifestDimensions: new Set() }).find((i) => i.id === "geo")!;
  assert.equal(noFilter.filter, undefined);
});

test("device insight fires when a device dominates (no filter — device isn't a manifest dimension)", () => {
  const ins = buildInsights({ totalStarts: 500, byMarket: [], byDevice: [slice("mobile", "Mobile", 410, 0), slice("desktop", "Desktop", 90, 0)], byPublisher: [], manifestDimensions: new Set() });
  const dev = ins.find((i) => i.id === "device")!;
  assert.match(dev.text, /Mobile accounted for 82% of survey starts/);
  assert.equal(dev.filter, undefined);
});

test("publisher insight ranks by completion RATE, not volume; needs ≥2 publishers", () => {
  const ins = buildInsights({
    totalStarts: 600,
    byMarket: [], byDevice: [],
    byPublisher: [slice("orgA", "FotMob", 400, 100), slice("orgB", "Football365", 200, 120)], // F365 higher rate (60%)
    manifestDimensions: new Set(["publisher"]),
  });
  const pub = ins.find((i) => i.id === "publisher")!;
  assert.match(pub.text, /Football365 had the highest completion rate \(60%\)/);
  assert.deepEqual(pub.filter, { dimension: "publisher", value: "orgB" });
});

test("thin data yields no insights (min sample)", () => {
  assert.deepEqual(buildInsights({ totalStarts: 12, byMarket: [slice("GB", "UK", 12, 5)], byDevice: [], byPublisher: [], manifestDimensions: new Set(["market"]) }), []);
});

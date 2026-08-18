import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestToFilterControls } from "./dashboard-filter-controls";
import type { DashboardManifest } from "./dashboard-manifest";

test("omitted dimension → NO control (FotMob single-publisher manifest has no Publisher control)", () => {
  const m: DashboardManifest = { dimensions: [] };
  assert.deepEqual(manifestToFilterControls(m), []);
});

test("present dimension → one control with an 'All …' default then the manifest values", () => {
  const m: DashboardManifest = {
    dimensions: [{ key: "publisher", label: "Publisher", values: [{ id: "a", label: "FotMob" }, { id: "b", label: "LiveScore" }] }],
  };
  const controls = manifestToFilterControls(m);
  assert.equal(controls.length, 1);
  const c = controls[0];
  assert.equal(c.key, "publisher");
  assert.deepEqual(c.options[0], { value: "", label: "All Publishers" });
  assert.deepEqual(c.options.slice(1), [{ value: "a", label: "FotMob" }, { value: "b", label: "LiveScore" }]);
});

test("controls mirror the manifest 1:1 — the client never adds dimensions", () => {
  const m: DashboardManifest = {
    dimensions: [
      { key: "publisher", label: "Publisher", values: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
      { key: "market", label: "Market", values: [{ id: "GB", label: "GB" }, { id: "DE", label: "DE" }] },
    ],
  };
  assert.deepEqual(manifestToFilterControls(m).map((c) => c.key), ["publisher", "market"]);
});

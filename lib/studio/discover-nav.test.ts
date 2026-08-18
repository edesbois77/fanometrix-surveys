import { test } from "node:test";
import assert from "node:assert/strict";
import { DISCOVER_NAV, DISCOVER_BASE, activeDiscoverSegment, surveyDashboardHref, studyDashboardHref } from "./discover-nav";
import { STUDIO_NAV } from "@/lib/studio-nav";

test("Discover top nav is exactly Overview | Surveys | Studies | Reports", () => {
  // Overview is the Discover-LEVEL landing (renamed from Dashboard). Object-level
  // Survey/Study pages keep "Dashboard" as their first tab — asserted elsewhere.
  assert.deepEqual(DISCOVER_NAV.map((i) => i.label), ["Overview", "Surveys", "Studies", "Reports"]);
  assert.deepEqual(DISCOVER_NAV.map((i) => i.segment), ["", "surveys", "studies", "reports"]);
  assert.ok(!DISCOVER_NAV.some((i) => i.label === "Dashboard"), "no 'Dashboard' at Discover top level");
});

test("Overview / Surveys / Studies are live destinations", () => {
  for (const seg of ["", "surveys", "studies"]) assert.equal(DISCOVER_NAV.find((i) => i.segment === seg)?.live, true);
});

test("Research and Data are removed from the top-level Discover nav", () => {
  assert.ok(!DISCOVER_NAV.some((i) => i.segment === "research"), "no Research tab");
  assert.ok(!DISCOVER_NAV.some((i) => i.segment === "data"), "no Data tab");
  assert.ok(!DISCOVER_NAV.some((i) => i.segment === "dashboards"), "no Dashboards container tab");
});

test("Discover is unchanged in the primary STUDIO_NAV (sidebar untouched)", () => {
  assert.ok(!STUDIO_NAV.some((i) => i.href.includes("/dashboards")), "no dashboards sidebar href");
  assert.deepEqual(STUDIO_NAV.map((i) => i.key), ["home", "create", "request", "discover", "manage"]);
});

test("active segment: index = Overview (''); a survey route keeps Surveys active; a study route keeps Studies active", () => {
  assert.equal(activeDiscoverSegment(DISCOVER_BASE), "");
  assert.equal(activeDiscoverSegment(`${DISCOVER_BASE}/surveys`), "surveys");
  assert.equal(activeDiscoverSegment(`${DISCOVER_BASE}/surveys/abc-123`), "surveys");
  assert.equal(activeDiscoverSegment(`${DISCOVER_BASE}/studies/xyz`), "studies");
  assert.equal(activeDiscoverSegment(`${DISCOVER_BASE}/reports`), "reports");
});

test("surveyDashboardHref deep-links to /surveys and carries only non-empty scope filters", () => {
  assert.equal(surveyDashboardHref("s1"), `${DISCOVER_BASE}/surveys/s1`);
  assert.equal(surveyDashboardHref("s1", {}), `${DISCOVER_BASE}/surveys/s1`);
  assert.equal(surveyDashboardHref("s1", { publisher: "org-f365" }), `${DISCOVER_BASE}/surveys/s1?publisher=org-f365`);
});

test("studyDashboardHref deep-links to /studies", () => {
  assert.equal(studyDashboardHref("st1"), `${DISCOVER_BASE}/studies/st1`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { studioBreadcrumbTrail, BREADCRUMB_LOADING, STUDIO_BASE } from "./breadcrumb";

const labels = (t: ReturnType<typeof studioBreadcrumbTrail>) => t.map((c) => c.label);
const B = STUDIO_BASE;

test("Home is the only crumb at the root and is the current page (no link)", () => {
  const t = studioBreadcrumbTrail(B);
  assert.deepEqual(labels(t), ["Home"]);
  assert.equal(t[0].href, undefined); // current page is never a link
});

test("deeper pages link Home; the current (last) item is never a link", () => {
  const t = studioBreadcrumbTrail(`${B}/create`);
  assert.deepEqual(labels(t), ["Home", "Create"]);
  assert.equal(t[0].href, B); // Home links up
  assert.equal(t.at(-1)!.href, undefined); // "Create" is current
});

test("Request breadcrumb", () => {
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/request`)), ["Home", "Request"]);
});

test("Discover and its top-level destinations (Dashboard | Surveys | Studies | Reports)", () => {
  // Discover index is "Dashboard" — the trail leaf is simply "Discover" (current).
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover`)), ["Home", "Discover"]);
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover/surveys`)), ["Home", "Discover", "Surveys"]);
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover/studies`)), ["Home", "Discover", "Studies"]);
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover/reports`)), ["Home", "Discover", "Reports"]);
  // The removed IA (Dashboards / Research / Data) no longer produces a labelled area.
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover/research`)), ["Home", "Discover"]);
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/discover/data`)), ["Home", "Discover"]);
  // Discover index: "Discover" is current → not a link.
  assert.equal(studioBreadcrumbTrail(`${B}/discover`).at(-1)!.href, undefined);
  // Ancestors carry hrefs.
  const surveys = studioBreadcrumbTrail(`${B}/discover/surveys`);
  assert.equal(surveys[1].href, `${B}/discover`);
  assert.equal(surveys[2].href, undefined); // Surveys is current here
});

test("Study dashboard shows the dynamic Study name, never the id", () => {
  const id = "e398f93f-461d-47c7-94cc-6f1352716ae6";
  const t = studioBreadcrumbTrail(`${B}/discover/studies/${id}`, { [id]: "FedEx UCL Study" });
  assert.deepEqual(labels(t), ["Home", "Discover", "Studies", "FedEx UCL Study"]);
  assert.equal(t.at(-1)!.href, undefined);
  assert.equal(t[2].href, `${B}/discover/studies`); // Studies links up
  assert.ok(!t.some((c) => c.label.includes(id)), "raw id must never be a label");
});

test("Survey dashboard shows the dynamic Survey name; ancestors route correctly", () => {
  const id = "155c6cd5-aaaa";
  const t = studioBreadcrumbTrail(`${B}/discover/surveys/${id}`, { [id]: "FedEx UCL Sponsorship" });
  assert.deepEqual(labels(t), ["Home", "Discover", "Surveys", "FedEx UCL Sponsorship"]);
  assert.equal(t[2].href, `${B}/discover/surveys`); // Surveys links up
});

test("unresolved dynamic leaf shows a loading placeholder, never the raw id", () => {
  const id = "abc-123-uuid";
  const t = studioBreadcrumbTrail(`${B}/discover/surveys/${id}`); // no labels supplied
  assert.equal(t.at(-1)!.label, BREADCRUMB_LOADING);
  assert.ok(!labels(t).some((l) => l.includes(id)));
});

test("Manage landing + nested Studies/Surveys detail with dynamic names", () => {
  assert.deepEqual(labels(studioBreadcrumbTrail(`${B}/manage`)), ["Home", "Manage"]);
  const sid = "study-1";
  const studyT = studioBreadcrumbTrail(`${B}/manage/studies/${sid}`, { [sid]: "Champions League Study" });
  assert.deepEqual(labels(studyT), ["Home", "Manage", "Studies", "Champions League Study"]);
  assert.equal(studyT[1].href, `${B}/manage`);
  assert.equal(studyT[2].href, `${B}/manage?view=studies`); // Studies → Manage studies view
  assert.equal(studyT.at(-1)!.href, undefined); // study is current

  const svid = "survey-9";
  const surveyT = studioBreadcrumbTrail(`${B}/manage/surveys/${svid}`, { [svid]: "Wave 2 Survey" });
  assert.deepEqual(labels(surveyT), ["Home", "Manage", "Surveys", "Wave 2 Survey"]);
  assert.equal(surveyT[2].href, `${B}/manage?view=surveys`);
});

test("deeply nested Manage report: study links up, report is the current leaf", () => {
  const sid = "study-1", rid = "report-7";
  const t = studioBreadcrumbTrail(`${B}/manage/studies/${sid}/reports/${rid}`, { [sid]: "UCL Study", [rid]: "Sponsorship Report" });
  assert.deepEqual(labels(t), ["Home", "Manage", "Studies", "UCL Study", "Sponsorship Report"]);
  assert.equal(t[3].href, `${B}/manage/studies/${sid}`); // study is now an ancestor → links
  assert.equal(t.at(-1)!.href, undefined); // report is current
});

test("Edit Study: study links up to its dashboard, 'Edit study' is the current leaf", () => {
  const id = "study-77";
  const t = studioBreadcrumbTrail(`${B}/discover/studies/${id}/edit`, { [id]: "My WWC Group" });
  assert.deepEqual(labels(t), ["Home", "Discover", "Studies", "My WWC Group", "Edit study"]);
  assert.equal(t[3].href, `${B}/discover/studies/${id}`); // study name links to its dashboard
  assert.equal(t.at(-1)!.href, undefined); // Edit study is current
  assert.ok(!t.some((c) => c.label.includes(id)), "raw id never shown");
});

test("Create Study is a static leaf under Studies", () => {
  const t = studioBreadcrumbTrail(`${B}/discover/studies/create`);
  assert.deepEqual(labels(t), ["Home", "Discover", "Studies", "Create study"]);
  assert.equal(t[2].href, `${B}/discover/studies`); // Studies links up
  assert.equal(t.at(-1)!.href, undefined); // Create study is current
});

test("Create editor shows the draft survey name", () => {
  const id = "draft-1";
  const t = studioBreadcrumbTrail(`${B}/create/${id}`, { [id]: "New Fan Survey" });
  assert.deepEqual(labels(t), ["Home", "Create", "New Fan Survey"]);
  assert.equal(t[1].href, `${B}/create`);
});

test("paths outside Survey Studio yield no trail", () => {
  assert.deepEqual(studioBreadcrumbTrail("/research-projects/123"), []);
  assert.deepEqual(studioBreadcrumbTrail("/home"), []);
  assert.deepEqual(studioBreadcrumbTrail("/survey-studio-other"), []); // must not prefix-match loosely
});

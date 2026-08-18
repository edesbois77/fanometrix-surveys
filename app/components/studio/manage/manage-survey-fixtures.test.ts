import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_FIXTURES } from "./manage-survey-fixtures";

// These fixtures are built through the REAL pure lifecycle functions, so they
// double as an end-to-end check that effective state + actions + deletion wire up
// correctly for each lifecycle state the detail page must render.

test("draft-empty: fully editable, deletable, archive offered", () => {
  const d = PREVIEW_FIXTURES["draft-empty"];
  assert.equal(d.lifecycle.effective, "draft");
  assert.equal(d.actions.canEditResearchDefinition, true);
  assert.equal(d.actions.canDelete, true);
  assert.equal(d.deletion.deletable, true);
});

test("live: research locked, archive blocked, delete blocked", () => {
  const d = PREVIEW_FIXTURES["live"];
  assert.equal(d.flags.researchLocked, true);
  assert.equal(d.actions.canEditResearchDefinition, false);
  assert.equal(d.actions.canArchive, false);
  assert.match(d.actions.archiveBlockedReason ?? "", /Stop collection/);
  assert.equal(d.actions.canDelete, false);
});

test("historical: locked, metadata editable, archive allowed, delete blocked (archive instead)", () => {
  const d = PREVIEW_FIXTURES["historical"];
  assert.equal(d.flags.researchLocked, true);
  assert.equal(d.actions.canEditMetadata, true);
  assert.equal(d.actions.canArchive, true);
  assert.equal(d.actions.canDelete, false);
  assert.match(d.actions.deleteBlockedReason ?? "", /Archive it instead/);
});

test("archived: restore offered; not archivable/deletable; preserves study membership in view", () => {
  const d = PREVIEW_FIXTURES["archived"];
  assert.equal(d.lifecycle.effective, "archived");
  assert.equal(d.actions.canRestore, true);
  assert.equal(d.actions.canArchive, false);
  assert.equal(d.actions.canDelete, false);
  assert.ok(d.survey.study); // Study membership still shown
});

test("legacy campaign: counted in the truthful universe, marked legacy, and included in safe deletion", () => {
  const d = PREVIEW_FIXTURES["legacy"];
  // Reconciliation: the detail counts include the legacy campaign (not studio-only).
  assert.equal(d.counts.totalCampaigns, 1);
  assert.equal(d.counts.legacyCampaigns, 1);
  assert.equal(d.campaigns.length, 1);
  assert.equal(d.campaigns[0].isStudio, false);
  // No live campaign, no evidence → deletable, and the legacy config is cleared with it.
  assert.equal(d.deletion.deletable, true);
  assert.equal(d.deletion.campaignsToSoftDelete, 1);
});

test("draft-config: unused draft campaigns don't block deletion", () => {
  const d = PREVIEW_FIXTURES["draft-config"];
  assert.equal(d.counts.totalCampaigns, 2);
  assert.equal(d.actions.canDelete, true);
  assert.equal(d.deletion.campaignsToSoftDelete, 2);
});

test("ready no-data: research still editable (no lock), deletable", () => {
  const d = PREVIEW_FIXTURES["ready"];
  assert.equal(d.lifecycle.effective, "ready");
  assert.equal(d.actions.canEditResearchDefinition, true);
  assert.equal(d.actions.canDelete, true);
});

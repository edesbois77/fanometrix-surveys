import { test, describe, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Revision } from "./model";

type Row = { campaign_id: string; session_id: string | null; configuration_revision_id: string | null };
let rows: Row[] = [];
let failWith: string | null = null;

mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from() {
        const b: Record<string, unknown> = {
          select() { return b; },
          in() { return failWith ? Promise.resolve({ data: null, error: { message: failWith } })
                                 : Promise.resolve({ data: rows, error: null }); },
        };
        return b;
      },
    },
  },
});

let loadGroupResults: typeof import("./results").loadGroupResults;
let UNATTRIBUTED: typeof import("./results").UNATTRIBUTED;
before(async () => { ({ loadGroupResults, UNATTRIBUTED } = await import("./results")); });
beforeEach(() => { rows = []; failWith = null; });

const REV_A = "aaaaaaaa-1111-4222-8333-444455556666";
const REV_B = "bbbbbbbb-1111-4222-8333-444455556666";

const rev = (id: string, effectiveAt: string): Revision => ({
  id, groupId: "g1", effectiveAt: new Date(effectiveAt), createdAt: new Date(effectiveAt),
  cancelledAt: null, rotation: "equal", changeKind: "created", reason: null, members: [],
});
const REVISIONS = [rev(REV_B, "2026-08-20T12:00:00Z"), rev(REV_A, "2026-08-19T12:00:00Z")];

describe("loadGroupResults", () => {
  test("no campaigns means no query and an empty result", async () => {
    const r = await loadGroupResults([], REVISIONS);
    assert.deepEqual(r.cells, []);
    assert.equal(r.hasUnattributed, false);
  });

  test("answers are split by campaign AND configuration", async () => {
    rows = [
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: REV_A },
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: REV_A },
      { campaign_id: "c-a", session_id: "s2", configuration_revision_id: REV_B },
      { campaign_id: "c-b", session_id: "s3", configuration_revision_id: REV_B },
    ];
    const r = await loadGroupResults(["c-a", "c-b"], REVISIONS);
    assert.equal(r.cells.length, 3);
    const cell = (slug: string, id: string) => r.cells.find(c => c.campaignSlug === slug && c.revisionId === id)!;
    assert.equal(cell("c-a", REV_A).answers, 2);
    assert.equal(cell("c-a", REV_A).respondents, 1, "two answers from one session is ONE respondent");
    assert.equal(cell("c-a", REV_B).answers, 1);
    assert.equal(cell("c-b", REV_B).answers, 1);
    assert.equal(r.totalAnswers, 4);
  });

  test("a session spanning two configurations is counted once in the group total", async () => {
    rows = [
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: REV_A },
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: REV_B },
    ];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.equal(r.cells.reduce((s, c) => s + c.respondents, 0), 2, "each cell sees the session");
    assert.equal(r.totalRespondents, 1, "the group total must not double-count it");
  });

  test("evidence with NO revision is reported as unattributed, never folded into a revision", async () => {
    rows = [
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: null },
      { campaign_id: "c-a", session_id: "s2", configuration_revision_id: REV_A },
    ];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.equal(r.hasUnattributed, true);
    const un = r.cells.find(c => c.revisionId === UNATTRIBUTED)!;
    assert.equal(un.answers, 1);
    assert.equal(r.cells.find(c => c.revisionId === REV_A)!.answers, 1,
      "the unattributed answer must not be added to the earliest revision");
  });

  test("a revision id from ANOTHER group is treated as unattributed", async () => {
    rows = [{ campaign_id: "c-a", session_id: "s1", configuration_revision_id: "cccccccc-1111-4222-8333-444455556666" }];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.equal(r.cells[0].revisionId, UNATTRIBUTED);
    assert.equal(r.hasUnattributed, true);
  });

  test("a group with only attributed evidence reports no unattributed bucket", async () => {
    rows = [{ campaign_id: "c-a", session_id: "s1", configuration_revision_id: REV_B }];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.equal(r.hasUnattributed, false);
    assert.ok(!r.cells.some(c => c.revisionId === UNATTRIBUTED));
  });

  test("cells are ordered newest configuration first, unattributed last", async () => {
    rows = [
      { campaign_id: "c-a", session_id: "s1", configuration_revision_id: null },
      { campaign_id: "c-a", session_id: "s2", configuration_revision_id: REV_A },
      { campaign_id: "c-a", session_id: "s3", configuration_revision_id: REV_B },
    ];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.deepEqual(r.cells.map(c => c.revisionId), [REV_B, REV_A, UNATTRIBUTED]);
  });

  test("a campaign slug containing the separator is not mis-split", async () => {
    rows = [{ campaign_id: "weird|slug", session_id: "s1", configuration_revision_id: REV_A }];
    const r = await loadGroupResults(["weird|slug"], REVISIONS);
    assert.equal(r.cells[0].campaignSlug, "weird|slug");
    assert.equal(r.cells[0].revisionId, REV_A);
  });

  test("a failed read throws rather than reporting zero results", async () => {
    failWith = "connection reset";
    await assert.rejects(
      () => loadGroupResults(["c-a"], REVISIONS),
      /response_answers read failed/,
      "an empty result would read as a group that collected nothing",
    );
  });

  test("answers with no session still count as answers", async () => {
    rows = [{ campaign_id: "c-a", session_id: null, configuration_revision_id: REV_A }];
    const r = await loadGroupResults(["c-a"], REVISIONS);
    assert.equal(r.totalAnswers, 1);
    assert.equal(r.totalRespondents, 0);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// -- The rule migration 214's index imposes on queries -------------------------
//
// idx_survey_events_revision_render is PARTIAL:
//
//   WHERE configuration_revision_id IS NOT NULL AND event_type = 'SURVEY_RENDER'
//
// A query that filters survey_events by revision but omits the event_type
// predicate cannot use it, and the planner falls back to a sequential scan.
// Measured on production at 1.14M rows:
//
//   with    event_type = 'SURVEY_RENDER'  ->  Index Only Scan        0.144 ms
//   without it                            ->  Parallel Seq Scan  6,595 ms
//
// That is a factor of roughly 45,000, and it degrades as the table grows rather
// than failing visibly — which is the harder kind of regression to notice.
//
// Migration 214's header asserts that a test enforces this. It did not exist
// when the migration was written; this is it.

const ROOT = join(import.meta.dirname, "..", "..");
const rel = (f: string) => f.slice(ROOT.length + 1);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every PostgREST builder chain starting at .from("survey_events").
 * A generous window captures the whole chain without hand-rolling a parser.
 */
function surveyEventQueries(src: string): string[] {
  const out: string[] = [];
  const marker = `.from("survey_events")`;
  let i = src.indexOf(marker);
  while (i !== -1) {
    out.push(src.slice(i, i + 700));
    i = src.indexOf(marker, i + marker.length);
  }
  return out;
}

// A FILTER on the column, not merely a mention of it. POST /api/events writes
// configuration_revision_id via .insert({...}) — that is a write, needs no index,
// and must not be flagged. Only read predicates matter here.
const FILTERS_BY_REVISION =
  /\.(?:eq|neq|in|gt|gte|lt|lte|is|filter|match|not)\(\s*["'`]configuration_revision_id/;
const CONSTRAINS_EVENT_TYPE =
  /\.(?:eq|in|filter|match)\(\s*["'`]event_type/;

const sourceFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]
  .filter(f => !/\.test\.tsx?$/.test(f));

describe("survey_events revision queries must stay index-eligible", () => {
  test("every survey_events query filtering by revision also constrains event_type", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes(`.from("survey_events")`)) continue;
      for (const q of surveyEventQueries(src)) {
        if (FILTERS_BY_REVISION.test(q) && !CONSTRAINS_EVENT_TYPE.test(q)) {
          offenders.push(`${rel(file)}: ${q.split("\n").slice(0, 3).join(" ").trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      "These queries filter survey_events by configuration_revision_id without an " +
      "event_type predicate, so idx_survey_events_revision_render cannot apply and " +
      "the planner will sequential-scan the table (6.6 s at 1.14M rows, worse as it " +
      "grows). Add .eq(\"event_type\", \"SURVEY_RENDER\") or widen the index deliberately.");
  });

  test("the guard is discriminating — it detects a query that would lose the index", () => {
    // Without this, the assertion above could pass because the matcher broke
    // rather than because the codebase is clean.
    const bad = `supabaseAdmin.from("survey_events").select("id").eq("configuration_revision_id", revId);`;
    const found = surveyEventQueries(bad);
    assert.equal(found.length, 1);
    assert.equal(FILTERS_BY_REVISION.test(found[0]), true);
    assert.equal(CONSTRAINS_EVENT_TYPE.test(found[0]), false, "a losing query must be detected");

    const good = `supabaseAdmin.from("survey_events").select("id")
      .eq("configuration_revision_id", revId).eq("event_type", "SURVEY_RENDER");`;
    const ok = surveyEventQueries(good)[0];
    assert.equal(FILTERS_BY_REVISION.test(ok) && CONSTRAINS_EVENT_TYPE.test(ok), true);

    // And a WRITE of the column must NOT be treated as a filter. This is the
    // real shape in app/api/events/route.ts, and matching it would have made the
    // guard fire on correct code.
    const write = `supabaseAdmin.from("survey_events").insert({ session_id, event_type,
      ...(revisionId ? { configuration_revision_id: revisionId } : {}) });`;
    assert.equal(FILTERS_BY_REVISION.test(surveyEventQueries(write)[0]), false,
      "an insert that writes the column is not a filter and needs no index");
  });

  test("states plainly that no such query exists yet", () => {
    // Honesty about scope: the assertion above is currently VACUOUS, because
    // nothing reads survey_events by revision. loadGroupResults uses
    // response_answers, which is the authoritative per-answer store. The index
    // and this guard are both in place ahead of the consumer, so the first
    // person to write that query gets the rule enforced rather than discovering
    // it from a slow dashboard months later.
    const withRevisionFilter = sourceFiles.filter(f => {
      const src = readFileSync(f, "utf8");
      return src.includes(`.from("survey_events")`) &&
             surveyEventQueries(src).some(q => FILTERS_BY_REVISION.test(q));
    }).map(rel);
    assert.deepEqual(withRevisionFilter, [],
      "A consumer now exists. Remove this test and rely on the assertion above, " +
      "which is no longer vacuous.");
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Structural guard: the two owner models must never meet ───────────────────
//
// WP1 puts a second kind of row into campaign_groups. Legacy rows keep their
// membership in campaign_group_members; Studio rows keep theirs inside a
// configuration revision. Every pre-existing query against campaign_groups was
// written when only one kind existed, so each one now silently means "any
// group" where it used to mean "the only kind of group".
//
// The consequences are not cosmetic. A legacy DELETE that matched a Studio row
// would cascade away its entire configuration history, including revisions that
// governed real serves. A legacy serve that matched a Studio row would read an
// empty campaign_group_members and 404 with a misleading reason. A dashboard
// that counted both would report a member count of zero for a group that is
// serving.
//
// A behavioural test can only cover the queries someone remembered to test.
// This guard covers every query that exists, including ones added later, by
// reading the source — which is exactly how the next unfiltered query gets
// caught.

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

const sourceFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]
  .filter(f => !/\.test\.tsx?$/.test(f));

/**
 * Files allowed to query campaign_groups WITHOUT an owner_model predicate,
 * each with the reason it is safe. Anything not listed here must filter.
 */
const EXEMPT: Record<string, string> = {
  "lib/simulation/delete-simulated-project.ts":
    "This is a BLOCKING safety check that refuses to delete a Research Project " +
    "while any group still references it. Narrowing a guard is the wrong " +
    "direction: if a Studio group ever did carry a research_project_id, we " +
    "would want the delete blocked, not permitted.",
  "lib/campaign-groups/store.ts":
    "The Studio store. It filters to owner_model 'survey_studio' via the " +
    "OWNER_MODEL.studio constant, which is the same predicate seen from the " +
    "other side.",
};

/** Split a file into the statement following each .from("campaign_groups"). */
function queriesIn(src: string): string[] {
  const out: string[] = [];
  const marker = `.from("campaign_groups")`;
  let i = src.indexOf(marker);
  while (i !== -1) {
    // A PostgREST builder chain ends at the first semicolon or comma-at-depth-0.
    // Taking a generous 600-char window is enough to contain the predicates and
    // avoids hand-rolling a parser.
    out.push(src.slice(i, i + 600));
    i = src.indexOf(marker, i + marker.length);
  }
  return out;
}

const OWNER_PREDICATE = /\.eq\(\s*["']owner_model["']\s*,/;
const OWNER_INSERT    = /owner_model\s*:/;

describe("legacy / Studio isolation", () => {
  test("every campaign_groups query pins owner_model", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const r = rel(file);
      if (EXEMPT[r]) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes(`.from("campaign_groups")`)) continue;
      for (const q of queriesIn(src)) {
        if (!OWNER_PREDICATE.test(q) && !OWNER_INSERT.test(q)) {
          offenders.push(`${r}: ${q.split("\n").slice(0, 3).join(" ").trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      "These queries would return, mutate or delete BOTH owner models. Add " +
      '.eq("owner_model", OWNER_MODEL.legacy) — or OWNER_MODEL.studio for a ' +
      "Studio path — or add the file to EXEMPT with a stated reason.");
  });

  test("the guard is discriminating — an unfiltered query is actually detected", () => {
    // Without this, a regex that silently stops matching would leave the test
    // above passing for the wrong reason.
    const bad = `const x = supabaseAdmin.from("campaign_groups").select("*").eq("id", id);`;
    const found = queriesIn(bad);
    assert.equal(found.length, 1);
    assert.equal(OWNER_PREDICATE.test(found[0]), false);

    const good = `const x = supabaseAdmin.from("campaign_groups").select("*").eq("owner_model", OWNER_MODEL.legacy);`;
    assert.equal(OWNER_PREDICATE.test(queriesIn(good)[0]), true);
  });

  test("the legacy serve endpoint refuses Studio groups", () => {
    const src = readFileSync(join(ROOT, "app/api/embed/group/route.ts"), "utf8");
    assert.match(src, OWNER_PREDICATE);
    assert.match(src, /OWNER_MODEL\.legacy/);
    assert.ok(!src.includes("OWNER_MODEL.studio"),
      "the legacy serve path must never resolve a Studio group");
  });

  test("the legacy delete cannot remove a Studio group, and reports a no-match as 404", () => {
    const src = readFileSync(join(ROOT, "app/api/campaign-groups/[id]/route.ts"), "utf8");
    const del = src.slice(src.indexOf("export async function DELETE"));
    assert.match(del, OWNER_PREDICATE, "the DELETE statement itself must carry the predicate");
    // A filtered delete that matches nothing returns success with zero rows.
    // Reporting that as {success:true} would tell an operator a Studio group
    // had been deleted when it had not.
    assert.match(del, /if \(!deleted\?\.length\) return NextResponse\.json\(\s*\{ error: "Not found" \}/);
  });

  test("the legacy create sets owner_model explicitly rather than relying on the column default", () => {
    const src = readFileSync(join(ROOT, "app/api/campaign-groups/route.ts"), "utf8");
    assert.match(src, /owner_model:\s*OWNER_MODEL\.legacy/);
  });

  test("the legacy edit route pins owner_model on the UPDATE, not only on the preceding read", () => {
    const src = readFileSync(join(ROOT, "app/api/campaign-groups/[id]/route.ts"), "utf8");
    const put = src.slice(src.indexOf("export async function PUT"));
    const updateChain = put.slice(put.indexOf(".update("));
    assert.match(updateChain.slice(0, 600), OWNER_PREDICATE);
  });

  test("visibility resolution in lib/access.ts filters both of its group paths", () => {
    const src = readFileSync(join(ROOT, "lib/access.ts"), "utf8");
    const qs = queriesIn(src);
    assert.equal(qs.length, 2, "expected the direct-targeting and by-project paths");
    for (const q of qs) assert.match(q, OWNER_PREDICATE);
  });

  test("the exempt list states a reason for every entry", () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      assert.ok(reason.length > 40, `${file} needs a real justification, not a placeholder`);
    }
  });

  test("exempt entries still exist — a stale exemption silently widens the guard", () => {
    for (const file of Object.keys(EXEMPT)) {
      const full = join(ROOT, file);
      let exists = true;
      try { statSync(full); } catch { exists = false; }
      assert.ok(exists, `${file} is exempt but no longer exists; remove the exemption`);
    }
  });
});

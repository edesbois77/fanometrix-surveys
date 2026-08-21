import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// -- The RPC contract, checked against the migrations that define it -----------
//
// PostgREST resolves an RPC by its NAMED-ARGUMENT SET. One wrong argument name
// does not produce a type error or a null — it resolves to no function at all
// and fails at runtime with "Could not find the function". Nothing in a unit
// suite that mocks the Supabase client can catch that, because the mock accepts
// any arguments.
//
// It reached production-candidate code: the store sent p_reason / p_actor while
// the functions declare p_change_reason / p_created_by / p_cancelled_by, so every
// Studio group edit and cancellation would have failed the first time anyone
// used the feature. This file compares the two sides directly.

const ROOT = join(import.meta.dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip `-- …` line comments. Parameter lists carry comments containing commas,
 *  which would otherwise split a declaration in the middle and silently drop
 *  parameters — making every comparison below weaker than it looks. */
function stripComments(sql: string): string {
  return sql.split("\n").map(line => {
    const at = line.indexOf("--");
    return at === -1 ? line : line.slice(0, at);
  }).join("\n");
}

/** Parameter names declared by a CREATE FUNCTION in the migration SQL. */
function declaredParams(rawSql: string, fnName: string): string[] {
  const sql = stripComments(rawSql);
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}(`);
  if (start === -1) return [];
  const open = sql.indexOf("(", start);
  let depth = 0, i = open;
  for (; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") { depth--; if (depth === 0) break; }
  }
  return sql.slice(open + 1, i)
    .split(",")
    .map(seg => seg.trim().split(/\s+/)[0])
    .filter(name => /^p_[a-z_]+$/.test(name));
}

/** Argument names passed to supabaseAdmin.rpc("<fn>", { ... }) in TypeScript. */
function passedArgs(src: string, fnName: string): string[] {
  const marker = `rpc("${fnName}"`;
  const at = src.indexOf(marker);
  if (at === -1) return [];
  const open = src.indexOf("{", at);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  const body = src.slice(open, i + 1);
  return [...body.matchAll(/(?:^|[\s{(])(p_[a-z_]+)\s*:/g)].map(m => m[1]);
}

// The migration that declares each function. 212a supersedes 212 for the cancel
// function, so it is listed last and wins.
const MIGRATIONS = ["supabase-migration-212.sql", "supabase-migration-212a.sql"];

function declaredFor(fnName: string): string[] {
  let found: string[] = [];
  for (const m of MIGRATIONS) {
    const p = declaredParams(readFileSync(join(ROOT, m), "utf8"), fnName);
    if (p.length) found = p;
  }
  return found;
}

describe("Studio group RPC argument contract", () => {
  test("the parser actually finds the declared parameters", () => {
    // Guard the guard: if this returns [] the comparisons below are vacuous.
    const edit = declaredFor("fx_campaign_group_edit");
    assert.deepEqual(edit, [
      "p_group_id", "p_effective_at", "p_rotation", "p_members", "p_change_kind",
      "p_change_reason", "p_created_by", "p_active_limit", "p_comparability_ack", "p_based_on",
    ], "the parser must see ALL ten parameters — comments in the list previously hid two");
    const cancel = declaredFor("fx_campaign_group_cancel_revision");
    assert.deepEqual(cancel, ["p_revision_id", "p_cancelled_by"]);
  });

  test("every argument the store sends to fx_campaign_group_edit is declared", () => {
    const declared = new Set(declaredFor("fx_campaign_group_edit"));
    const sent = passedArgs(readFileSync(join(ROOT, "lib/campaign-groups/store.ts"), "utf8"),
                            "fx_campaign_group_edit");
    assert.ok(sent.length > 0, "no arguments parsed from the store — the parser has drifted");
    const unknown = sent.filter(a => !declared.has(a));
    assert.deepEqual(unknown, [],
      `these arguments are not parameters of the function, so PostgREST will resolve to no ` +
      `function at all: ${unknown.join(", ")}. Declared: ${[...declared].join(", ")}`);
  });

  test("every argument the store sends to fx_campaign_group_cancel_revision is declared", () => {
    const declared = new Set(declaredFor("fx_campaign_group_cancel_revision"));
    const sent = passedArgs(readFileSync(join(ROOT, "lib/campaign-groups/store.ts"), "utf8"),
                            "fx_campaign_group_cancel_revision");
    assert.ok(sent.length > 0, "no arguments parsed from the store");
    const unknown = sent.filter(a => !declared.has(a));
    assert.deepEqual(unknown, [], `undeclared arguments: ${unknown.join(", ")}`);
  });

  test("every REQUIRED parameter is supplied", () => {
    // Parameters with a DEFAULT may be omitted; the rest may not.
    const sql = stripComments(readFileSync(join(ROOT, "supabase-migration-212.sql"), "utf8"));
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.fx_campaign_group_edit(");
    const open = sql.indexOf("(", start);
    let depth = 0, i = open;
    for (; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") { depth--; if (depth === 0) break; }
    }
    const required = sql.slice(open + 1, i).split(",")
      .filter(seg => !/DEFAULT/i.test(seg))
      .map(seg => seg.trim().split(/\s+/)[0])
      .filter(n => /^p_/.test(n));
    const sent = new Set(passedArgs(readFileSync(join(ROOT, "lib/campaign-groups/store.ts"), "utf8"),
                                    "fx_campaign_group_edit"));
    const missing = required.filter(r => !sent.has(r));
    assert.deepEqual(missing, [], `required parameters never sent: ${missing.join(", ")}`);
  });

  test("the discrimination check — a wrong name IS detected", () => {
    const declared = new Set(declaredFor("fx_campaign_group_cancel_revision"));
    assert.equal(declared.has("p_cancelled_by"), true);
    assert.equal(declared.has("p_actor"), false,
      "p_actor was the name that shipped and broke; it must not be a declared parameter");
  });
});

// -- Migration 212a: the guarantees the cancel function must keep --------------

describe("migration 212a — cancel guarantees", () => {
  const sql = () => readFileSync(join(ROOT, "supabase-migration-212a.sql"), "utf8");

  test("the group lock precedes every decision-driving read", () => {
    const s = sql();
    const lock = s.indexOf("FOR UPDATE");
    const decisionRead = s.indexOf("INTO v_effective, v_cancelled_at");
    assert.ok(lock > -1 && decisionRead > -1);
    assert.ok(lock < decisionRead,
      "effective_at / cancelled_at must be read UNDER the lock, or a concurrent " +
      "caller decides on a stale value");
  });

  test("legacy groups are refused", () => {
    assert.match(sql(), /v_owner_model IS DISTINCT FROM 'survey_studio'/);
  });

  test("an already-cancelled revision raises, and raises a mappable SQLSTATE", () => {
    const s = sql();
    assert.match(s, /IF v_cancelled_at IS NOT NULL THEN/);
    assert.match(s, /ERRCODE = '23505'/,
      "the route maps this to HTTP 409 on the code, not on message text");
  });

  test("the UPDATE cannot overwrite an existing cancellation", () => {
    assert.match(sql(), /AND cancelled_at IS NULL/,
      "defence in depth: even without the guard, the statement must not rewrite a cancellation");
  });

  test("the already-cancelled check comes BEFORE the effective_at check", () => {
    const s = sql();
    assert.ok(s.indexOf("IF v_cancelled_at IS NOT NULL") < s.indexOf("IF v_effective <= now()"),
      "a cancelled revision never took effect, so reporting it as 'already effective' would be wrong");
  });

  test("the edit function is not redefined by 212a", () => {
    assert.ok(!sql().includes("CREATE OR REPLACE FUNCTION public.fx_campaign_group_edit"),
      "212a must touch only the cancel function");
  });
});

// -- The route must map the SQLSTATE ------------------------------------------

describe("cancel route", () => {
  test("maps SQLSTATE 23505 to HTTP 409", () => {
    const src = readFileSync(
      join(ROOT, "app/api/studio/campaign-groups/[id]/revisions/[revisionId]/route.ts"), "utf8");
    assert.match(src, /result\.code === "23505"/);
    const at = src.indexOf('result.code === "23505"');
    assert.match(src.slice(at, at + 300), /status: 409/);
  });

  test("the store propagates the code so the route can map it", () => {
    const src = readFileSync(join(ROOT, "lib/campaign-groups/store.ts"), "utf8");
    assert.match(src, /code\?: string/);
    assert.match(src, /code: error\.code/);
  });
});

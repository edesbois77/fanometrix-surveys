import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Structural guards for the P0 Supabase exposure remediation.
//
// The exposure existed because permissive "Anyone can ..." RLS policies let the
// anon key read production research data, and fifteen server routes quietly
// depended on those policies. Once the policies are gone, a single new route
// importing the anon client fails at runtime; a single client component
// importing the service role leaks a credential that bypasses RLS entirely.
// Neither is caught by a unit test of behaviour, so they are caught here.

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const ANON_IMPORT  = /from\s+["']@\/lib\/supabase["']/;
const ADMIN_IMPORT = /from\s+["']@\/lib\/supabase-admin["']/;
const rel = (f: string) => f.slice(ROOT.length + 1);

test("no API route imports the anonymous Supabase client", () => {
  const offenders = walk(join(ROOT, "app", "api"))
    .filter(f => ANON_IMPORT.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(offenders, [],
    "These routes would break once the permissive policies are dropped, and they " +
    "carry no authorisation of their own. Use @/lib/supabase-admin behind an " +
    "explicit auth check, or a narrowly scoped RPC.");
});

test("no client component imports the service-role client", () => {
  const offenders = walk(join(ROOT, "app"))
    .filter(f => {
      const src = readFileSync(f, "utf8");
      return /^\s*["']use client["']/m.test(src) && ADMIN_IMPORT.test(src);
    })
    .map(rel);
  assert.deepEqual(offenders, [],
    "The service role bypasses RLS. It must never reach a public bundle.");
});

test("the only client-side Supabase usage is the Library document upload", () => {
  // Documented exception: it uploads directly to the PRIVATE library-documents
  // bucket with the anon key. If this list grows, the anon key's blast radius
  // has grown with it and needs re-reviewing.
  const clientUsers = walk(join(ROOT, "app"))
    .filter(f => {
      const src = readFileSync(f, "utf8");
      return /^\s*["']use client["']/m.test(src) && ANON_IMPORT.test(src);
    })
    .map(rel);
  assert.deepEqual(clientUsers, ["app/components/library-documents/UploadDocumentModal.tsx"]);
});

test("migration 205 denies anon on every confirmed-exposed table", () => {
  const sql = readFileSync(join(ROOT, "supabase-migration-205.sql"), "utf8");
  for (const table of [
    "responses", "surveys", "campaigns",
    "campaign_groups", "campaign_group_members", "survey_events",
  ]) {
    assert.match(sql, new RegExp(`CREATE POLICY deny_all_anon ON public\\.${table}\\b`),
      `${table} must end with a deny-all-anon policy`);
  }
});

test("migration 205 drops every permissive policy found in production", () => {
  const sql = readFileSync(join(ROOT, "supabase-migration-205.sql"), "utf8");
  // Captured verbatim from pg_policies on 2026-08-20 before any change.
  for (const policy of [
    "Anyone can read", "Anyone can insert", "Anyone can delete demo rows",
    "Anyone can read surveys", "Anyone can insert surveys",
    "Anyone can update surveys", "Anyone can delete surveys",
    "Anyone can read campaigns", "Anyone can insert campaigns",
    "Anyone can update campaigns", "Anyone can delete campaigns",
    "Anyone can read campaign_groups", "Anyone can read campaign_group_members",
    "events_insert_anon", "events_select_authenticated",
  ]) {
    assert.ok(sql.includes(`DROP POLICY IF EXISTS "${policy}"`) || sql.includes(`DROP POLICY IF EXISTS ${policy}`),
      `policy "${policy}" is not dropped`);
  }
});

test("migration 205 revokes anon SELECT on all five RLS-bypassing views", () => {
  const sql = readFileSync(join(ROOT, "supabase-migration-205.sql"), "utf8");
  for (const view of [
    "vw_campaign_responses", "vw_campaign_stats", "vw_survey_stats",
    "vw_research_project_stats", "vw_conversation_search_stats",
  ]) {
    assert.match(sql, new RegExp(`REVOKE SELECT ON public\\.${view}\\s+FROM anon, authenticated`),
      `${view} still grants anon SELECT — a view is NOT protected by the RLS of its sources`);
  }
});

test("the completion RPC takes typed parameters, never arbitrary jsonb", () => {
  const strip = (f: string) => readFileSync(join(ROOT, f), "utf8")
    // Strip `--` comments: the migrations deliberately QUOTE the old
    // jsonb_populate_record call to explain what is being removed, and that
    // explanation must not read as the statement still being present.
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");

  const add    = strip("supabase-migration-204.sql");
  const remove = strip("supabase-migration-205.sql");

  // 204 adds the typed signature and nothing else destructive.
  assert.ok(!/CREATE OR REPLACE FUNCTION public\.fx_submit_response_if_under_ceiling\([^)]*jsonb/.test(add),
    "the replacement must not accept a jsonb payload");
  assert.match(add, /SET search_path = pg_catalog, public/);
  assert.match(add, /GRANT EXECUTE ON FUNCTION public\.fx_submit_response_if_under_ceiling[\s\S]*?TO service_role/);
  assert.ok(!add.includes("DROP POLICY"), "204 must be additive — no policy changes");
  assert.ok(!add.includes("REVOKE SELECT"), "204 must be additive — no grant changes");

  // 205 retires the untyped one.
  assert.match(remove, /DROP FUNCTION IF EXISTS public\.fx_submit_response_if_under_ceiling\(text, integer, jsonb\)/);
  assert.ok(!remove.includes("jsonb_populate_record"),
    "no executable statement may still populate a response row from arbitrary jsonb");
});

test("both migrations have a rollback, and 204's is decoupled from the code", () => {
  const rb204 = readFileSync(join(ROOT, "supabase-migration-204-rollback.sql"), "utf8");
  const rb205 = readFileSync(join(ROOT, "supabase-migration-205-rollback.sql"), "utf8");

  // 204 only added a function, so its rollback only drops one.
  assert.match(rb204, /DROP FUNCTION IF EXISTS public\.fx_submit_response_if_under_ceiling/);
  assert.ok(!rb204.includes("CREATE POLICY"), "204 changed no policy, so its rollback restores none");

  // 205's rollback restores the prior state verbatim, including the old function.
  assert.match(rb205, /Anyone can read/);
  assert.match(rb205, /jsonb_populate_record/, "the rollback must restore the prior function verbatim");
  assert.match(rb205, /CREATE POLICY events_insert_anon/);
});

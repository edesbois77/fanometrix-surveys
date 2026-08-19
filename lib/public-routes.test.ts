import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_API_PREFIXES, SURVEYS_ALLOWED_PREFIXES, PUBLIC_EMBED_PATHS } from "./public-routes";

// The regression guard for the P0 incident.
//
// `/api/answer` shipped declared in NONE of the three places a public survey write
// path has to appear, so anonymous embeds got 401 on the app host and 302 on the
// surveys host. The client swallowed both and `response_answers` stayed empty for
// months. These tests fail loudly if any public write path is ever dropped again.

const middlewareSource = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

test("every public embed write path is exempt from the browser-session gate", () => {
  for (const p of PUBLIC_EMBED_PATHS) {
    if (p === "/embed") continue; // a page, gated by PUBLIC_PATHS not the API list
    assert.ok(
      PUBLIC_API_PREFIXES.includes(p as never),
      `${p} must be in PUBLIC_API_PREFIXES or the session gate answers it 401`,
    );
  }
});

test("every public embed write path is servable on the survey delivery host", () => {
  for (const p of PUBLIC_EMBED_PATHS) {
    assert.ok(
      SURVEYS_ALLOWED_PREFIXES.some((allowed) => p.startsWith(allowed)),
      `${p} must be in SURVEYS_ALLOWED_PREFIXES or surveys.fanometrix.com 302s it to marketing`,
    );
  }
});

test("every public embed write path is excluded from the middleware matcher", () => {
  const matcher = middlewareSource.slice(middlewareSource.indexOf("matcher: ["));
  for (const p of PUBLIC_EMBED_PATHS) {
    const token = p.replace(/^\//, "");           // "/api/answer" → "api/answer"
    assert.ok(
      matcher.includes(`${token}$`) || matcher.includes(`${token}/`),
      `${p} must be excluded from the middleware matcher (anchored as ${token}$|${token}/)`,
    );
  }
});

test("/api/answer specifically is public — the exact defect that caused the incident", () => {
  assert.ok(PUBLIC_API_PREFIXES.includes("/api/answer"));
  assert.ok(SURVEYS_ALLOWED_PREFIXES.includes("/api/answer"));
  assert.ok(middlewareSource.includes("api/answer$|api/answer/"));
});

test("middleware reads its allow-lists from this module, so they cannot drift", () => {
  assert.ok(
    /import \{[^}]*PUBLIC_API_PREFIXES[^}]*\} from "@\/lib\/public-routes"/.test(middlewareSource),
    "middleware.ts must import the shared lists rather than redeclaring them",
  );
  assert.ok(
    !/^const PUBLIC_API_PREFIXES/m.test(middlewareSource),
    "middleware.ts must not redeclare PUBLIC_API_PREFIXES locally",
  );
  assert.ok(
    !/^const SURVEYS_ALLOWED_PREFIXES/m.test(middlewareSource),
    "middleware.ts must not redeclare SURVEYS_ALLOWED_PREFIXES locally",
  );
});

test("admin routes are NOT accidentally public", () => {
  for (const guarded of ["/api/users", "/api/admin", "/api/social", "/api/demo", "/api/campaign-groups"]) {
    assert.ok(
      !PUBLIC_API_PREFIXES.includes(guarded as never),
      `${guarded} must stay behind the session gate`,
    );
  }
  // "/embed-test" is admin-only and must never inherit the /embed exclusion.
  const matcher = middlewareSource.slice(middlewareSource.indexOf("matcher: ["));
  assert.ok(matcher.includes("embed$|embed/"), "the /embed exclusion must stay anchored");
  assert.ok(!matcher.includes("embed-test"), "/embed-test must remain gated");
});

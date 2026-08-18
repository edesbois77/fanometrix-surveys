import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDIO_NAV } from "./studio-nav";

// ── 17. Request page terminology remains singular "Request" ──────────────────
test("the Request nav destination is singular 'Request', never 'Requests'", () => {
  const request = STUDIO_NAV.find((i) => i.key === "request");
  assert.ok(request, "a request nav item should exist");
  assert.equal(request!.label, "Request");
  assert.equal(request!.href, "/survey-studio/request");
  // No top-level Survey Studio destination is pluralised to "Requests".
  assert.equal(STUDIO_NAV.some((i) => i.label === "Requests"), false);
});

import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// -- The gate, exercised rather than read -------------------------------------
//
// flag.test.ts proves the gate is PRESENT and correctly placed by reading the
// source. This file proves it WORKS by calling the handlers.
//
// The discriminating move is comparing the two settings. With the flag off the
// gate returns 404 before authentication or any database work, so the call
// completes with no credentials configured. With it on, the same call gets past
// the gate and fails somewhere else - 401, 403, 500, or a throw. Any of those is
// fine: the point is that it is NOT the gate's 404, which is what proves the 404
// came from the gate and not from something incidental.

const ORIGINAL = process.env.CAMPAIGN_GROUPS_STUDIO_ENABLED;
const setFlag = (v: string | undefined) => {
  if (v === undefined) delete process.env.CAMPAIGN_GROUPS_STUDIO_ENABLED;
  else process.env.CAMPAIGN_GROUPS_STUDIO_ENABLED = v;
};

const req = (url: string) => new NextRequest(new Request(url, { method: "GET" }));
const post = (url: string, body: unknown) =>
  new NextRequest(new Request(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
const del = (url: string) => new NextRequest(new Request(url, { method: "DELETE" }));

const ID = "9f21ab00-1111-4222-8333-444455556666";
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });

type Mod = Record<string, (...a: never[]) => Promise<Response>>;
let list: Mod, detail: Mod, revisions: Mod, revision: Mod, serve: Mod, legacyServe: Mod;

before(async () => {
  list      = await import("@/app/api/studio/campaign-groups/route") as unknown as Mod;
  detail    = await import("@/app/api/studio/campaign-groups/[id]/route") as unknown as Mod;
  revisions = await import("@/app/api/studio/campaign-groups/[id]/revisions/route") as unknown as Mod;
  revision  = await import("@/app/api/studio/campaign-groups/[id]/revisions/[revisionId]/route") as unknown as Mod;
  serve     = await import("@/app/api/embed/studio-group/route") as unknown as Mod;
  legacyServe = await import("@/app/api/embed/group/route") as unknown as Mod;
});

beforeEach(() => setFlag(undefined));
after(() => setFlag(ORIGINAL));

/** Call a handler and report its status, or "threw" if it did not return. */
async function status(call: () => Promise<Response>): Promise<number | "threw"> {
  try { return (await call()).status; } catch { return "threw"; }
}

const CALLS: Array<{ name: string; run: () => Promise<Response> }> = [];

before(() => {
  CALLS.push(
    { name: "GET    /api/studio/campaign-groups",
      run: () => list.GET(req("http://x/api/studio/campaign-groups") as never) },
    { name: "POST   /api/studio/campaign-groups",
      run: () => list.POST(post("http://x/api/studio/campaign-groups", { name: "n", slug: "s-1" }) as never) },
    { name: "GET    /api/studio/campaign-groups/[id]",
      run: () => detail.GET(req(`http://x/api/studio/campaign-groups/${ID}`) as never, params({ id: ID }) as never) },
    { name: "PATCH  /api/studio/campaign-groups/[id]",
      run: () => detail.PATCH(post(`http://x/api/studio/campaign-groups/${ID}`, { status: "live" }) as never, params({ id: ID }) as never) },
    { name: "POST   /api/studio/campaign-groups/[id]/revisions",
      run: () => revisions.POST(post(`http://x/api/studio/campaign-groups/${ID}/revisions`,
        { rotation: "equal", change_kind: "created", members: [] }) as never, params({ id: ID }) as never) },
    { name: "DELETE /api/studio/campaign-groups/[id]/revisions/[revisionId]",
      run: () => revision.DELETE(del(`http://x/api/studio/campaign-groups/${ID}/revisions/${ID}`) as never,
        params({ id: ID, revisionId: ID }) as never) },
  );
});

describe("condition 2 (behaviour) - management APIs 404 when the flag is off", () => {
  test("every management call returns 404 with the flag ABSENT", async () => {
    for (const c of CALLS) {
      assert.equal(await status(c.run), 404, `${c.name} did not 404 with the flag absent`);
    }
  });

  test('every management call returns 404 with the flag "false"', async () => {
    setFlag("false");
    for (const c of CALLS) {
      assert.equal(await status(c.run), 404, `${c.name} did not 404 with the flag "false"`);
    }
  });

  test("the 404 body says only 'Not found'", async () => {
    const res = await CALLS[0].run();
    assert.deepEqual(await res.json(), { error: "Not found" });
  });

  test("with the flag ON the same calls no longer return the gate's 404", async () => {
    // This is what makes the assertions above mean something. If a call still
    // 404'd here, the 404 would be incidental and the gate unproven.
    setFlag("true");
    const stillGated: string[] = [];
    for (const c of CALLS) {
      const s = await status(c.run);
      // 404 is only suspicious if it came from the gate. These handlers cannot
      // reach their own not-found paths without a database, so any 404 here
      // would mean the gate is still closed.
      if (s === 404) stillGated.push(`${c.name} -> 404`);
    }
    assert.deepEqual(stillGated, [],
      "these calls behaved identically with the flag on, so the gate is not what produced the 404");
  });
});

describe("condition 3 (behaviour) - Studio groups do not serve when the flag is off", () => {
  const url = "http://x/api/embed/studio-group?slug=zzz-any";

  test("the serve endpoint 404s with the flag absent", async () => {
    assert.equal(await status(() => serve.GET(req(url) as never)), 404);
  });

  test("it 404s for every non-enabling value", async () => {
    for (const v of ["false", "0", "TRUE", "yes", ""]) {
      setFlag(v);
      assert.equal(await status(() => serve.GET(req(url) as never)), 404, `flag "${v}" served`);
    }
  });

  test("it 404s even without a slug - the gate precedes validation", async () => {
    // A 400 here would mean the request was parsed before the gate ran.
    assert.equal(await status(() => serve.GET(req("http://x/api/embed/studio-group") as never)), 404);
  });

  test("the disabled serve response is not cacheable", async () => {
    const res = await serve.GET(req(url) as never);
    assert.match(res.headers.get("Cache-Control") ?? "", /no-store/,
      "a cached 404 would outlive the flag being switched on");
  });

  test("the disabled serve response carries no fail_mode", async () => {
    // fail_mode 'closed' answers 409 with a body naming it. A disabled feature
    // must be indistinguishable from one that was never built.
    const body = await (await serve.GET(req(url) as never)).json();
    assert.deepEqual(body, { error: "Not found" });
  });

  test("with the flag ON the serve endpoint gets past the gate", async () => {
    setFlag("true");
    const s = await status(() => serve.GET(req("http://x/api/embed/studio-group") as never));
    // No slug, so the gate having opened means we reach validation: 400.
    assert.equal(s, 400, "expected to reach slug validation once the gate is open");
  });
});

describe("condition 4 (behaviour) - legacy delivery is unaffected by the flag", () => {
  test("the legacy serve endpoint reaches its OWN validation with the flag absent", async () => {
    // 400 is the legacy route's own "slug is required". Reaching it proves no
    // gate intercepted the request. A 404 here would mean the rollout gate had
    // leaked onto live delivery.
    setFlag(undefined);
    const res = await legacyServe.GET(req("http://x/api/embed/group") as never);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "slug is required" });
  });

  test("the legacy endpoint behaves identically at every flag setting", async () => {
    // Legacy delivery must not vary with a flag that has nothing to do with it -
    // including for the WWC surveys that run through this path.
    const seen = new Set<string>();
    for (const v of [undefined, "true", "1", "false", "0", "TRUE", ""]) {
      setFlag(v);
      const res = await legacyServe.GET(req("http://x/api/embed/group") as never);
      seen.add(`${res.status} ${JSON.stringify(await res.json())}`);
    }
    assert.equal(seen.size, 1,
      `legacy delivery varied with the flag: ${[...seen].join(" | ")}`);
  });
});

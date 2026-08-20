import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectMember, seededRandom, type Rotation } from "./selection";
import type { RevisionMember } from "./model";

const m = (id: string, weight: number, paused = false): RevisionMember => ({
  campaignId: id, campaignSlug: id, weight,
  membershipState: paused ? "paused" : "active",
});

describe("selectMember", () => {
  test("returns null for an empty candidate set rather than throwing", () => {
    assert.equal(selectMember([], "equal", seededRandom(1)), null);
    assert.equal(selectMember([], "weighted", seededRandom(1)), null);
    assert.equal(selectMember([], "priority", seededRandom(1)), null);
  });

  test("a single candidate is chosen without consulting the random source", () => {
    let calls = 0;
    const counted = () => { calls++; return 0.5; };
    const only = m("a", 1);
    assert.equal(selectMember([only], "weighted", counted), only);
    assert.equal(calls, 0);
  });

  test("priority rotation takes the first declared member, deterministically", () => {
    const set = [m("a", 1), m("b", 99)];
    for (let i = 0; i < 50; i++) {
      assert.equal(selectMember(set, "priority", seededRandom(i))!.campaignId, "a");
    }
  });

  test("equal rotation covers every candidate and stays within 3% of uniform", () => {
    const set = [m("a", 1), m("b", 1), m("c", 1), m("d", 1)];
    const rnd = seededRandom(20260820);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) counts[selectMember(set, "equal", rnd)!.campaignId]++;
    for (const k of Object.keys(counts)) {
      const share = counts[k] / N;
      assert.ok(Math.abs(share - 0.25) < 0.03, `${k} share ${share} not within 3% of 0.25`);
    }
  });

  test("weighted rotation tracks the declared weights over 10,000 draws", () => {
    // 60 / 30 / 10 split — deliberately uneven so a uniform implementation fails.
    const set = [m("a", 60), m("b", 30), m("c", 10)];
    const expected: Record<string, number> = { a: 0.6, b: 0.3, c: 0.1 };
    const rnd = seededRandom(987654321);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) counts[selectMember(set, "weighted", rnd)!.campaignId]++;
    for (const k of Object.keys(expected)) {
      const share = counts[k] / N;
      assert.ok(
        Math.abs(share - expected[k]) < 0.02,
        `${k} share ${share.toFixed(4)} not within 2pp of ${expected[k]}`,
      );
    }
    // Guard the guard: a uniform selector would give ~0.333 to c and must fail
    // the assertion above, so confirm the observed spread really is uneven.
    assert.ok(counts.a > counts.b && counts.b > counts.c, "weights had no ordering effect");
  });

  test("weighted rotation never returns a member whose weight is a smaller share than observed", () => {
    // A 1:1000 split must essentially never pick the light member 10% of the time.
    const set = [m("light", 1), m("heavy", 1000)];
    const rnd = seededRandom(4242);
    let light = 0;
    for (let i = 0; i < 10_000; i++) if (selectMember(set, "weighted", rnd)!.campaignId === "light") light++;
    assert.ok(light / 10_000 < 0.01, `light share ${light / 10_000} too high`);
  });

  test("the same seed reproduces the same sequence", () => {
    const set = [m("a", 3), m("b", 2), m("c", 1)];
    const run = (seed: number) => {
      const rnd = seededRandom(seed);
      return Array.from({ length: 40 }, () => selectMember(set, "weighted", rnd)!.campaignId).join("");
    };
    assert.equal(run(7), run(7));
    assert.notEqual(run(7), run(8));
  });

  test("boundary draws stay inside the candidate set for every rotation", () => {
    const set = [m("a", 5), m("b", 5)];
    for (const r of ["equal", "weighted", "priority"] as Rotation[]) {
      for (const v of [0, 0.4999999, 0.5, 0.9999999]) {
        const picked = selectMember(set, r, () => v);
        assert.ok(picked && set.includes(picked), `rotation ${r} at ${v} returned an outsider`);
      }
    }
  });

  test("a corrupt non-positive weight total degrades to uniform instead of dividing by zero", () => {
    // Unreachable through the schema (cgrm_weight_positive), asserted anyway so
    // a future data path that bypasses the CHECK cannot crash a serve.
    const corrupt = [m("a", 0), m("b", 0)];
    const picked = selectMember(corrupt, "weighted", () => 0.75);
    assert.ok(picked && corrupt.includes(picked));
  });
});

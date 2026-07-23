import { test } from "node:test";
import assert from "node:assert/strict";
import { toFramedItem, type CollectedRow } from "./gather";
import { frameEvidence, projectFor } from "./framing";
import type { FlatNeed } from "@/lib/information-needs";

// The seam between Collection and Analysis. Gathering must make no epistemic
// judgements of its own: what evidence can establish comes from the Source
// Contract, what one observation is comes from the Source Contract, and whether
// the method could answer the question comes from the approved design.

const need = (over: Partial<FlatNeed> = {}): FlatNeed => ({
  id: "need_abc", aspect: "Brand Perception", need: "How do fans describe it?", method_fit: "primary", requirement: "Understand how fans see the sponsorship", ...over,
});

const row = (over: Partial<CollectedRow> = {}): CollectedRow => ({
  id: "e1", content: "a fan said something", contentKind: null, author: "alice", publisher: null, syndicationKey: null,
  newsSourceType: null, platform: "Reddit", market: "UK", evidenceRole: "direct",
  relevanceScore: 0.8, publishedAt: null, ...over,
});

// ── Contribution and observation are inherited, never decided here ───────────

test("a conversation inherits unprompted discourse and is observed by its author", () => {
  const item = toFramedItem(row({ author: "Alice" }), need())!;
  assert.equal(item.contribution, "unprompted_discourse");
  assert.equal(item.observationKey, "author:alice");
  assert.equal(item.observations, 1);
});

test("an article inherits the kind its voice implies, not the kind its connector implies", () => {
  const reported = toFramedItem(row({ contentKind: "article", newsSourceType: "reporting", publisher: "The Times" }), need())!;
  const announced = toFramedItem(row({ contentKind: "article", newsSourceType: "brand_announcement", publisher: "PR Newswire" }), need())!;
  const opined = toFramedItem(row({ contentKind: "article", newsSourceType: "opinion", publisher: "The Times" }), need())!;

  assert.equal(reported.contribution, "documented_activity");
  assert.equal(announced.contribution, "interested_claim");
  assert.equal(opined.contribution, "expert_judgement");
});

test("syndicated coverage is observed by its story, so carriers do not multiply it", () => {
  const carried = Array.from({ length: 20 }, (_, i) =>
    toFramedItem(row({ id: `a${i}`, contentKind: "article", syndicationKey: "wire-1", publisher: `Outlet ${i}`, newsSourceType: "reporting" }), need())!);
  const frame = frameEvidence({ needId: "n", items: carried });
  assert.equal(frame.admitted.length, 20);
  assert.equal(frame.observations, 1, "twenty carriers of one story are one observation");
});

// ── The design's verdict travels with the evidence ───────────────────────────

test("the method verdict on the need becomes the item's method fit", () => {
  assert.equal(toFramedItem(row(), need({ method_fit: "supporting" }))!.methodFit, "supporting");
  assert.equal(toFramedItem(row(), need({ method_fit: "not_suitable" }))!.methodFit, "not_suitable");
});

test("evidence from a method the design ruled out never reaches a claim", () => {
  const items = [
    toFramedItem(row({ id: "ok" }), need({ method_fit: "primary" }))!,
    toFramedItem(row({ id: "ruled-out" }), need({ method_fit: "not_suitable" }))!,
  ];
  const p = projectFor(frameEvidence({ needId: "n", items }), "descriptive");
  assert.deepEqual(p.admitted.map(a => a.evidenceId), ["ok"]);
  assert.equal(p.excluded[0].reason, "method_not_suitable");
});

// ── Provenance and guards ────────────────────────────────────────────────────

test("provenance reads as a place for a conversation and as a masthead for an article", () => {
  assert.equal(toFramedItem(row(), need())!.provenance, "Reddit · UK");
  assert.equal(
    toFramedItem(row({ contentKind: "article", publisher: "SportsPro", author: "J Smith", publishedAt: "2026-05-04T10:00:00Z" }), need())!.provenance,
    "SportsPro · J Smith · 2026-05-04",
  );
});

test("an unclassified item is not framed, because nothing knows how far it bears", () => {
  assert.equal(toFramedItem(row({ relevanceScore: null }), need()), null);
});

test("evidence role travels from collection unchanged, and defaults to the strictest", () => {
  assert.equal(toFramedItem(row({ evidenceRole: "comparative" }), need())!.role, "comparative");
  assert.equal(toFramedItem(row({ evidenceRole: null }), need())!.role, "direct");
});

// ── The whole seam, end to end ───────────────────────────────────────────────

test("gathered conversation reaches a frame that knows what it cannot answer", () => {
  const items = [
    toFramedItem(row({ id: "a", author: "alice" }), need())!,
    toFramedItem(row({ id: "b", author: "bob" }), need())!,
    toFramedItem(row({ id: "c", author: "cara" }), need())!,
  ];
  const frame = frameEvidence({ needId: need().id, items });

  assert.equal(frame.observations, 3);
  assert.ok(frame.supportable.includes("descriptive"));
  assert.ok(!frame.supportable.includes("magnitude"), "conversation cannot measure a population, however much of it there is");
});

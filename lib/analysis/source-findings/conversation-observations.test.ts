import { test } from "node:test";
import assert from "node:assert/strict";
import { conversationObservations, bucketOf, type Mention } from "./conversation-observations";

const m = (over: Partial<Mention> = {}): Mention => ({
  content: "a fan said something about it", sentiment: "Positive", topic: "sponsorship",
  market: "GB", platform: "YouTube", contentKind: null, ...over,
});

test("mentions are bucketed by platform and content kind", () => {
  assert.equal(bucketOf({ contentKind: "article", platform: "News" }), "news");
  assert.equal(bucketOf({ contentKind: null, platform: "YouTube" }), "youtube");
  assert.equal(bucketOf({ contentKind: null, platform: "Bluesky" }), "bluesky");
  assert.equal(bucketOf({ contentKind: null, platform: "Reddit" }), "reddit");
  assert.equal(bucketOf({ contentKind: null, platform: "TikTok" }), "conversation");
});

test("a bucket with enough mentions yields an overall sentiment finding, cited", () => {
  const mentions = [
    ...Array.from({ length: 6 }, () => m({ sentiment: "Positive" })),
    ...Array.from({ length: 4 }, () => m({ sentiment: "Negative" })),
  ];
  const out = conversationObservations(mentions);
  const overall = out.find(f => f.bucket === "youtube" && /sentiment was/.test(f.statement));
  assert.ok(overall, "an overall sentiment finding should exist");
  assert.match(overall!.statement, /60% positive/);
  assert.ok(overall!.citation.snippet.length > 0, "the finding is cited");
});

test("a bucket below the floor produces nothing", () => {
  const out = conversationObservations([m(), m()]); // 2 < MIN_BUCKET
  assert.equal(out.length, 0);
});

test("news and youtube mentions produce findings under their own buckets", () => {
  const mentions = [
    ...Array.from({ length: 6 }, () => m({ platform: "YouTube", contentKind: null })),
    ...Array.from({ length: 6 }, () => m({ platform: "News", contentKind: "article" })),
  ];
  const buckets = new Set(conversationObservations(mentions).map(f => f.bucket));
  assert.ok(buckets.has("youtube"));
  assert.ok(buckets.has("news"));
});

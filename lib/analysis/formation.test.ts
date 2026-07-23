import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePropositions, buildFormationPrompt, assertionMenu, frameFacts, attributionRules, shownFor,
} from "./formation";
import { frameEvidence, projectFor, type FramedItem } from "./framing";
import type { ContributionKind } from "./types";
import type { EvidenceRole } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";

// docs/intelligence-model.md §5 FORMATION. Formation proposes rival readings and
// never grades them. Everything that decides what survives runs without a model,
// so these tests exercise the enforcement rather than the generation.

let seq = 0;
const item = (over: Partial<FramedItem> = {}): FramedItem => {
  seq += 1;
  return {
    evidenceId: `e${seq}`, content: `evidence ${seq}`,
    contribution: "unprompted_discourse" as ContributionKind, role: "direct" as EvidenceRole,
    bearing: 0.8, observationKey: `unit-${seq}`, observations: 1,
    methodFit: "primary" as MethodFit, provenance: null, ...over,
  };
};
const frameOf = (items: FramedItem[]) => frameEvidence({ needId: "need_1", items });
const parse = (frame: ReturnType<typeof frameOf>, propositions: unknown[]) =>
  parsePropositions({ raw: { propositions } as never, needId: "need_1", frame, shown: shownFor(frame) });

const proposition = (over: Record<string, unknown> = {}) => ({
  reading: "price is the barrier", statement: "Price is what holds this audience back.",
  assertion: "descriptive", scope: "UK fans, 2026", warrant: "Both cited items raise cost unprompted.",
  evidence: [0], ...over,
});

// ── Rival readings survive together ──────────────────────────────────────────

test("competing readings of the same evidence are all kept, not reconciled", () => {
  const frame = frameOf([item(), item()]);
  const parsed = parse(frame, [
    proposition({ reading: "price", evidence: [0] }),
    proposition({ reading: "trust, not price", statement: "Trust, not price, is the barrier.", evidence: [1] }),
  ]);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map(p => p.reading), ["price", "trust, not price"]);
  assert.notEqual(parsed[0].id, parsed[1].id, "each rival is separately addressable");
});

test("an absence proposition is legitimate and needs no evidence behind it", () => {
  const frame = frameOf([item(), item()]);
  const parsed = parse(frame, [
    proposition({ assertion: "absence", statement: "This evidence does not establish what fans value.", evidence: [] }),
  ]);
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0].isNull);
  assert.equal(parsed[0].citations.length, 0, "its grounds are the search, not the evidence");
});

// ── The matrix re-binds per proposition ──────────────────────────────────────

test("a proposition of a kind the evidence cannot support is discarded whatever it says", () => {
  // Conversation cannot establish population magnitude, so a beautifully argued
  // magnitude claim over conversation is not a weaker claim, it is not a claim.
  const frame = frameOf([item(), item()]);
  const parsed = parse(frame, [proposition({ assertion: "magnitude", statement: "Most fans say price is the barrier." })]);
  assert.deepEqual(parsed, []);
});

test("a citation its own assertion type cannot use is stripped, and the reach is recorded", () => {
  // The model chooses the assertion type, and that choice decides which of ITS
  // OWN citations are admissible. Reaching for evidence the claim cannot use
  // loses the evidence, never gains the platform a claim.
  const frame = frameOf([
    item({ contribution: "established_knowledge" as ContributionKind }),
    item({ contribution: "interested_claim" as ContributionKind }),
  ]);
  const parsed = parse(frame, [proposition({ assertion: "comparative", statement: "This sponsor outperforms its rivals.", evidence: [0, 1] })]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].citations.length, 1, "the interested claim cannot ground a comparison");
  assert.equal(parsed[0].rejectedCitations.length, 1);
  assert.ok(parsed[0].rejectedCitations[0].reason.includes("never ground a comparison"));
});

test("a proposition left with nothing behind it is dropped as a guess", () => {
  const frame = frameOf([item({ contribution: "interested_claim" as ContributionKind })]);
  assert.deepEqual(parse(frame, [proposition({ assertion: "comparative", evidence: [0] })]), []);
});

// ── Citation discipline ──────────────────────────────────────────────────────

test("an index that was never shown cannot be cited into existence", () => {
  const frame = frameOf([item()]);
  const parsed = parse(frame, [proposition({ evidence: [0, 7, -1, 99] })]);
  assert.equal(parsed[0].citations.length, 1);
});

test("the same item cited twice counts once", () => {
  const frame = frameOf([item(), item()]);
  assert.equal(parse(frame, [proposition({ evidence: [0, 0, 0] })])[0].citations.length, 1);
});

test("a proposition with no statement or an unknown assertion type is dropped", () => {
  const frame = frameOf([item()]);
  assert.deepEqual(parse(frame, [proposition({ statement: "" })]), []);
  assert.deepEqual(parse(frame, [proposition({ assertion: "vibes" })]), []);
});

test("em-dashes are stripped from everything a person will read", () => {
  const frame = frameOf([item()]);
  const parsed = parse(frame, [proposition({
    statement: "Price — not trust — is the barrier.", warrant: "Both items — cited above — raise cost.",
    reading: "price — the barrier", scope: "UK fans — 2026",
  })]);
  for (const s of [parsed[0].statement, parsed[0].warrant, parsed[0].reading, parsed[0].scope]) {
    assert.ok(!/[—–]/.test(s), s);
  }
});

// ── The prompt tells the truth about what is possible ────────────────────────

test("the menu names the claim types this evidence cannot support, and why that is not a quality judgement", () => {
  const frame = frameOf([item(), item()]);
  const menu = assertionMenu(frame);
  assert.ok(menu.includes(`"descriptive"`));
  assert.ok(menu.includes("CLOSED"));
  assert.ok(menu.includes(`"magnitude"`));
  assert.ok(menu.includes("not a judgement about the evidence's quality"));
  assert.ok(menu.includes(`"absence"`), "the null proposition is always available");
});

test("the facts give the model every figure it may use, and no others", () => {
  const frame = frameOf([item(), item({ bearing: 0.1 })]);
  const facts = frameFacts(frame);
  assert.ok(facts.includes("1 of 2 examined"));
  assert.ok(facts.includes("Independent observations behind them: 1"));
});

test("attribution rules are generated from what is present, not written per source", () => {
  const rules = attributionRules(projectFor(frameOf([
    item({ contribution: "interested_claim" as ContributionKind, role: "comparative" as EvidenceRole }),
  ]), "descriptive").admitted);

  assert.ok(rules.includes("COMPARATIVE"));
  assert.ok(rules.includes("speaking ABOUT ITSELF"));
  assert.ok(!rules.includes("unprompted"), "only the kinds actually present are stated");
});

test("the prompt forbids the model from grading its own propositions", () => {
  const frame = frameOf([item()]);
  const prompt = buildFormationPrompt({
    need: "What holds fans back?", aspect: "Fan Value", lens: "", frame, shown: shownFor(frame),
  });
  assert.ok(prompt.includes("DO NOT rank the propositions"));
  assert.ok(prompt.includes("do not state how confident you are"));
  assert.ok(prompt.includes("2 to 4 genuinely COMPETING readings"));
  assert.ok(prompt.includes("ONLY figures you may state"));
});

test("evidence admitted with limits carries its limit into the prompt", () => {
  const frame = frameOf([item({ contribution: "established_knowledge" as ContributionKind })]);
  const prompt = buildFormationPrompt({ need: "n", aspect: "a", lens: "", frame, shown: shownFor(frame) });
  assert.ok(prompt.includes("limit:"), "a constrained item must not read as an unconstrained one");
});

// ── What is shown ────────────────────────────────────────────────────────────

test("evidence the design ruled out is never put in front of the model", () => {
  // Showing it would invite claims that then get stripped at parse time, which
  // reads as the platform changing its mind rather than holding a line.
  const frame = frameOf([item({ methodFit: "primary" as MethodFit }), item({ methodFit: "not_suitable" as MethodFit })]);
  assert.equal(shownFor(frame).length, 1);
});

test("the most strongly bearing evidence is shown first, and unjudged evidence last", () => {
  const frame = frameOf([item({ bearing: null }), item({ bearing: 0.9 }), item({ bearing: 0.6 })]);
  const shown = shownFor(frame);
  assert.equal(shown[0].bearing, 0.9);
  assert.equal(shown[1].bearing, 0.6);
  assert.equal(shown[2].bearing, null, "unknown bearing sorts last, it is not treated as irrelevant");
});

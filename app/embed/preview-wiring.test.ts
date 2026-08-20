import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural guards on the embed client.
//
// The phase decisions are unit-tested in lib/embed-preview-phase.test.ts. These
// assert the WIRING those decisions depend on — the parts a DOM-less suite
// cannot execute, and exactly the parts that regressed.

const ROOT = join(import.meta.dirname, "..", "..");
const page = readFileSync(join(ROOT, "app", "embed", "page.tsx"), "utf8");
const code = page.split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

test("the hard-coded sample questions seed ONLY the design-sample context", () => {
  // The survey path used to seed these, so ClassicSurvey mounted before any
  // payload arrived — the flash — and stayed on screen when access was refused.
  const seeds = [...code.matchAll(/useState<Question\[\]>\(([^)]*)\)/g)].map(m => m[1]);
  assert.equal(seeds.length, 1, "exactly one questions seed");
  assert.match(seeds[0], /isDesignSample \? QUESTIONS : \[\]/,
    "QUESTIONS may seed the design sample and nothing else");
});

test("every renderer sits behind the resolved gate", () => {
  const gate = code.indexOf("mayMountSurvey(phase)");
  assert.ok(gate > 0, "the gate exists");
  for (const r of ["<StackSurvey", "<ThemedSurvey", "<StudioClassicSurvey", "<ClassicSurvey"]) {
    const at = code.indexOf(r);
    assert.ok(at > gate, `${r} must be rendered only after the gate`);
  }
});

test("the unavailable state renders no survey content", () => {
  const block = code.slice(code.indexOf('phase === "unavailable"'), code.indexOf("if (groupSlug && !groupReady)"));
  assert.match(block, /Preview unavailable/);
  for (const forbidden = ["QUESTIONS", "<StackSurvey", "<ThemedSurvey", "<StudioClassicSurvey", "<ClassicSurvey", "introTitle", "branding"]; ;) {
    for (const f of forbidden) assert.ok(!block.includes(f), `unavailable state must not reference ${f}`);
    break;
  }
});

test("all three fetch branches apply through ONE shared path", () => {
  // Parity is a property of there being one path, not of three setter blocks
  // agreeing. Adding a field to applyPayload must reach every surface at once.
  assert.equal((code.match(/applyPayload\(data\)/g) ?? []).length, 3,
    "group, campaign and survey branches each call applyPayload");
  assert.equal((code.match(/const applyPayload = useCallback/g) ?? []).length, 1,
    "exactly one application path");
  // No branch may set creative state directly any more.
  const branchArea = code.slice(code.indexOf("// Group mode"), code.indexOf("// ── Render gate"));
  assert.ok(!branchArea.includes("setResolvedRenderer("), "no branch sets the renderer directly");
  assert.ok(!branchArea.includes("setCreativeDesign("), "no branch sets the creative directly");
});

test("applyPayload carries the Topic, which no surface supplied before", () => {
  const fn = code.slice(code.indexOf("const applyPayload = useCallback"), code.indexOf("const failResolution"));
  assert.match(fn, /setIntroTopic\(/, "Topic must flow through the shared path");
  assert.match(fn, /setResolvedRenderer\(/);
  assert.match(fn, /setCustomTheme\(/);
  assert.match(fn, /setBranding\(/);
  assert.match(fn, /setPhase\("resolved"\)/, "resolution is the last thing it does");
});

test("introTopic reaches both renderers that display it", () => {
  assert.equal((code.match(/introTopic=\{introTopic\}/g) ?? []).length, 2,
    "ThemedSurvey and StudioClassicSurvey both receive it");
});

test("evidence suppression is derived, not keyed on ?preview=1 alone", () => {
  // An ad-ops review link carries a token WITHOUT preview=1. Keying on the flag
  // would have written real evidence from an anonymous reviewer's browser.
  assert.match(code, /const suppressEvidence = ctxSuppressEvidence\(embedCtx\)/);
  assert.equal((code.match(/isPreview=\{suppressEvidence\}/g) ?? []).length, 4,
    "all four renderers receive the derived switch");
  assert.ok(!/isPreview=\{isPreview\}/.test(code), "no renderer receives the raw flag");
});

test("the Deploy INLINE preview iframe is same-origin", () => {
  const dep = readFileSync(join(ROOT, "app", "campaign-deployment", "page.tsx"), "utf8");
  // The JSX preview iframe, identified by its key — NOT the production tag
  // template further down, which is a different artefact entirely.
  const at = dep.indexOf("key={previewParams}");
  assert.ok(at > 0, "the inline preview iframe exists");
  const block = dep.slice(at, at + 600);
  assert.match(block, /src=\{`\/embed\?\$\{previewParams\}`\}/,
    "a cross-origin iframe never receives the SameSite=Lax session cookie, which is why it went blank");
  assert.ok(!block.includes("${BASE}/embed"), "the inline preview must not point at the embed host");
});

test("the PRODUCTION tag still points at the embed host, unchanged", () => {
  // The partner-facing tag is a separate artefact and must stay cross-origin on
  // the embed host. Fixing the inline preview must not have touched it.
  const dep = readFileSync(join(ROOT, "app", "campaign-deployment", "page.tsx"), "utf8");
  assert.match(dep, /`  src="\$\{BASE\}\/embed\?\$\{params\}"`/, "iframe tag");
  assert.match(dep, /`  src="\$\{BASE\}\/embed\.js"`/, "script tag");
  // And it must never carry preview credentials.
  const tagArea = dep.slice(dep.indexOf("const iframeCode"), dep.indexOf("const scriptCode") + 900);
  assert.ok(!tagArea.includes("preview_token"), "the production tag must never carry a review token");
  assert.ok(!tagArea.includes('set("preview"'), "the production tag must never carry preview=1");
});

test("the Deploy page describes a secure review link, not a validation bypass", () => {
  const dep = readFileSync(join(ROOT, "app", "campaign-deployment", "page.tsx"), "utf8");
  assert.match(dep, /Secure review link/);
  assert.match(dep, /Regenerate/);
  assert.match(dep, /Revoke/);
  assert.match(dep, /Expires \{grantExpiry/, "expiry is shown");
  assert.ok(!dep.includes("Preview URLs bypass validation"),
    "the old wording described it as a bypass");
  assert.match(dep, /not<\/strong> the production tag/);
});

test("the review token travels in the FRAGMENT, never a query string", () => {
  const dep = readFileSync(join(ROOT, "app", "campaign-deployment", "page.tsx"), "utf8");
  // A fragment is never transmitted in an HTTP request, so it cannot reach a
  // Vercel access log, a Referer header, or a server-side log of any kind.
  assert.match(dep, /#pt=\$\{j\.token\}/, "shareable link puts the token after #");
  assert.ok(!dep.includes("preview_token="), "no query-string token anywhere in the Deploy UI");
});

test("the embed reads the token from the fragment and strips it immediately", () => {
  assert.match(code, /window\.location\.hash/, "read from the fragment");
  assert.match(code, /pt=\(\[A-Za-z0-9_-\]\{43\}\)/, "validated shape before use");
  assert.match(code, /history\.replaceState/, "removed from the address bar and history");
  // And exchanged over POST, whose body no access log records.
  assert.match(code, /method: "POST"/);
  assert.match(code, /preview_token: previewToken/);
  assert.ok(!/p\.set\("preview_token"/.test(code), "never appended to a query string");
});

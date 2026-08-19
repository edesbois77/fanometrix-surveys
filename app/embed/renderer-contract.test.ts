import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every renderer that can serve a live survey must follow ONE evidence contract.
//
// They drifted precisely because each owned a private copy of the plumbing: two
// checked whether the submission actually saved before declaring completion and two
// did not; only one emitted milestones past Q3; all four swallowed answer failures.
// These are structural assertions over the source, because the behavioural contract
// itself is exercised in evidence.test.ts — here we prove nobody is bypassing it.

/** The four renderers app/embed/page.tsx can dispatch to for a live campaign. */
const RENDERERS = ["ThemedSurvey", "ClassicSurvey", "StudioClassicSurvey", "StackSurvey"] as const;

const src = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
const pageSrc = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the dispatcher knows exactly these production renderers", () => {
  for (const r of RENDERERS) {
    assert.ok(pageSrc.includes(`<${r}`), `${r} is dispatched from app/embed/page.tsx`);
  }
  // A new renderer added without being listed here would slip the contract checks.
  // `EmbedSurvey` is the dispatcher itself, not a creative.
  const dispatched = [...pageSrc.matchAll(/<([A-Z][A-Za-z]*Survey)\b/g)]
    .map((m) => m[1])
    .filter((d) => d !== "EmbedSurvey");
  for (const d of new Set(dispatched)) {
    assert.ok(RENDERERS.includes(d as never), `${d} is dispatched but not covered by the contract tests`);
  }
});

for (const name of RENDERERS) {
  test(`${name} records through the shared evidence module`, () => {
    const s = src(name);
    assert.match(s, /from "\.\/evidence"/, "imports the shared contract");
    assert.match(s, /recordAnswer\(/, "records each answer through it");
    assert.match(s, /submitResponse\(/, "submits through it");
  });

  test(`${name} does not hand-roll its own survey write paths`, () => {
    const s = src(name);
    for (const endpoint of ["/api/answer", "/api/submit", "/api/events"]) {
      assert.ok(
        !s.includes(`fetch("${endpoint}"`),
        `${name} must not call ${endpoint} directly — that is how the renderers drifted apart`,
      );
    }
  });

  test(`${name} never declares completion without a confirmed save`, () => {
    const s = src(name);
    assert.ok(
      !/sendEvent\(\s*["']SURVEY_COMPLETED["']\s*\)/.test(s),
      `${name} must not emit SURVEY_COMPLETED itself — evidence.submitResponse() emits it only once the server confirms the response was written`,
    );
  });

  test(`${name} keeps SURVEY_START meaning the first ANSWER`, () => {
    const s = src(name);
    assert.ok(
      !/sendEvent\(\s*["']SURVEY_START["']\s*\)/.test(s),
      `${name} must not emit SURVEY_START on journey entry — that redefinition is what made "Started" mean two different things. recordAnswer() emits it on the first answer.`,
    );
  });

  test(`${name} carries question identity, not just position`, () => {
    const s = src(name);
    assert.match(s, /questionId:/, "sends the authored question id");
    assert.match(s, /canonicalQuestionKey:/, "sends the comparability anchor where present");
  });

  test(`${name} iterates its questions rather than hard-coding three`, () => {
    const s = src(name);
    // The old failure mode: milestone emission stopped at Q3, and Q4/Q5 answers had
    // nowhere to go. Nobody should be enumerating fixed question positions any more.
    assert.ok(
      !/QUESTION_4_REACHED/.test(s) && !/QUESTION_5_REACHED/.test(s),
      `${name} must derive milestones from questionShownEvent(), not enumerate them`,
    );
    assert.match(s, /questionShownEvent\(/, "derives the shown milestone generically");
  });
}

test("only the Stack renderer treats demographics as journey furniture, and never as questions", () => {
  const stack = src("StackSurvey");
  // Gender/Age are collected but are NOT survey questions: they must never consume a
  // question index, and the research index is always measured from RESEARCH_START.
  assert.match(stack, /const qi = step - RESEARCH_START/, "research index excludes the demographic frames");
  assert.match(stack, /gender: genderRef\.current, age: ageRef\.current/, "they travel as response dimensions instead");
});

// ── Fanometrix Intelligence Evals — Benchmark SCHEMA (pure, dependency-free) ──
//
// The machine-readable representation of a human-defined analytical Gold
// Standard, plus a pure validator. This file is deliberately free of any
// dependency on production analytical code (no Survey Studio, no lib/analysis,
// no Supabase, no OpenAI) so it can never affect production behaviour and can
// run in CI as a plain unit under the existing `lib/**/*.test.ts` runner.
//
// The schema scores SEMANTIC ANALYTICAL CORRECTNESS, not exact prose. Fields
// carry CONCEPTS and EVIDENCE, never required wording. A future analytical
// engine may express the same insight in different words and still pass.
//
// See ./README.md for the philosophy and ./benchmarks/fedex-ucl-001 for the
// first instance.

/** How a given expectation can currently be evaluated. The benchmark is
 *  honest about this: not everything is safely machine-scoreable today. */
export type ScoreabilityTier =
  | "deterministic"        // pure code can decide it now (arithmetic, grounding, counts)
  | "structured-output"    // decidable IF the system-under-test emits structured findings
  | "model-assisted"       // needs a semantic/LLM judge (kept out of CI)
  | "human";               // needs human judgement for now

/** A pointer into the benchmark's own source aggregates. `option` is the
 *  stable option id within `question`; `value` (a 1-dp percentage) is optional
 *  and only used where a specific figure is part of the expectation. */
export type EvidenceRef = { question: string; option?: string; value?: number };

/** An arithmetic combination of option percentages, classified by how many
 *  distinct questions its components span. `question_span > 1` is ALWAYS a
 *  prohibited cross-question sum (Principle 3). Same-question groupings are
 *  legitimate ONLY when the components share the grouped meaning — the
 *  benchmark lists the allowed ones explicitly rather than letting code guess
 *  semantics. */
export type Grouping = {
  value: number;                 // resulting percentage (1 dp)
  components: EvidenceRef[];      // the option refs summed
  question_span: number;         // count of distinct questions the components span
  concept?: string;              // the shared meaning that justifies an allowed grouping
  reason?: string;               // why a forbidden grouping is invalid
};

/** A finding the analysis SHOULD surface. Everything here is conceptual; no
 *  wording is required. `forbidden_extensions` are the over-reaches that would
 *  turn a correct finding into a MUST NOT SAY. */
export type MustFind = {
  id: string;
  expected_priority: number;         // 1 = highest
  concept: string;                   // the semantic target
  rationale?: string;
  evidence_requirements: EvidenceRef[];
  acceptable_interpretations: string[];
  required_caveats: string[];
  forbidden_extensions: string[];
};

/** A finding the analysis MAY surface. Legitimate, but must not displace the
 *  primary story, and carries its own forbidden extensions. */
export type MayFind = {
  id: string;
  concept: string;
  evidence_requirements: EvidenceRef[];
  conditions: string[];
  forbidden_extensions: string[];
  default_priority: "supporting" | "secondary" | "low";
};

/** A claim the analysis MUST NOT make. `detector` names the deterministic
 *  scorer that can catch it (when one exists); `scoreability` records whether
 *  code, a model, or a human is currently needed to judge it. */
export type MustNotSay = {
  id: string;
  failure_type: string;              // e.g. "overstated_lead", "cross_question_arithmetic"
  prohibited_concept: string;
  example_claim?: string;
  reason: string;
  rule_violated: string;             // a principle id (P1..P10) or explicit rule
  detector?: string | null;
  scoreability: ScoreabilityTier;
};

export type Principle = { id: string; title: string; statement: string };

/** The complete Gold Standard for one benchmark study. */
export type Benchmark = {
  benchmark_id: string;
  source_study: string;
  source_file: string;               // the file of record (the exported CSV)
  source_hash: string;               // hash of the source aggregates (see source.ts::sourceHash)
  version: string;
  /** Dimensions the source file does NOT contain. A claim resting on one of
   *  these is NOT ASSESSABLE from this benchmark's source and must not be
   *  scored as supported (nor auto-failed) — see MUST NOT SAY #9. */
  not_in_source: string[];
  allowed_groupings: Grouping[];
  forbidden_groupings: Grouping[];
  must_find: MustFind[];
  may_find: MayFind[];
  must_not_say: MustNotSay[];
  expected_hierarchy: string[];      // ordered must_find ids
  principles: Principle[];
  selectivity: { max_headline_findings: number; note: string };
};

export type ValidationResult = { ok: boolean; errors: string[] };

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Pure structural + referential validator. Returns every problem it finds
 *  (does not throw), so a test can assert `ok === true` and print `errors`. */
export function validateBenchmark(b: unknown): ValidationResult {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);
  if (typeof b !== "object" || b === null) return { ok: false, errors: ["benchmark is not an object"] };
  const x = b as Record<string, unknown>;

  for (const f of ["benchmark_id", "source_study", "source_file", "source_hash", "version"]) {
    if (!isNonEmptyString(x[f])) push(`missing/empty string field: ${f}`);
  }
  for (const f of ["not_in_source", "allowed_groupings", "forbidden_groupings", "must_find", "may_find", "must_not_say", "expected_hierarchy", "principles"]) {
    if (!Array.isArray(x[f])) push(`field ${f} must be an array`);
  }
  if (typeof x.selectivity !== "object" || x.selectivity === null || !isFiniteNumber((x.selectivity as Record<string, unknown>).max_headline_findings)) {
    push("selectivity.max_headline_findings must be a finite number");
  }

  const mustFind = Array.isArray(x.must_find) ? (x.must_find as MustFind[]) : [];
  const mayFind = Array.isArray(x.may_find) ? (x.may_find as MayFind[]) : [];
  const mustNot = Array.isArray(x.must_not_say) ? (x.must_not_say as MustNotSay[]) : [];

  // Unique, stable ids across each collection.
  const dupCheck = (rows: { id?: unknown }[], name: string) => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (!isNonEmptyString(r.id)) { push(`${name}: row with missing id`); continue; }
      if (seen.has(r.id)) push(`${name}: duplicate id ${r.id}`);
      seen.add(r.id);
    }
  };
  dupCheck(mustFind, "must_find");
  dupCheck(mayFind, "may_find");
  dupCheck(mustNot, "must_not_say");

  // must_find priorities present and unique.
  const priorities = mustFind.map((m) => m.expected_priority);
  if (new Set(priorities).size !== priorities.length) push("must_find: expected_priority values must be unique");
  for (const m of mustFind) {
    if (!isFiniteNumber(m.expected_priority)) push(`must_find ${m.id}: expected_priority must be a number`);
    if (!isNonEmptyString(m.concept)) push(`must_find ${m.id}: concept required`);
    if (!Array.isArray(m.evidence_requirements) || m.evidence_requirements.length === 0) push(`must_find ${m.id}: evidence_requirements required`);
  }

  // expected_hierarchy references only real must_find ids, and is complete.
  const mfIds = new Set(mustFind.map((m) => m.id));
  const hierarchy = Array.isArray(x.expected_hierarchy) ? (x.expected_hierarchy as string[]) : [];
  for (const id of hierarchy) if (!mfIds.has(id)) push(`expected_hierarchy references unknown must_find id: ${id}`);
  if (hierarchy.length !== mfIds.size) push(`expected_hierarchy length (${hierarchy.length}) != must_find count (${mfIds.size})`);
  // hierarchy order must match expected_priority order.
  const byPriority = [...mustFind].sort((a, b) => a.expected_priority - b.expected_priority).map((m) => m.id);
  if (JSON.stringify(byPriority) !== JSON.stringify(hierarchy)) push("expected_hierarchy order must match expected_priority order");

  // groupings: components reference at least one question; span is consistent.
  const checkGrouping = (g: Grouping, name: string) => {
    if (!isFiniteNumber(g.value)) push(`${name}: value must be a number`);
    if (!Array.isArray(g.components) || g.components.length < 2) push(`${name}: a grouping needs >= 2 components`);
    const span = new Set((g.components ?? []).map((c) => c.question)).size;
    if (g.question_span !== span) push(`${name}: question_span (${g.question_span}) != distinct component questions (${span})`);
  };
  for (const g of (x.allowed_groupings as Grouping[]) ?? []) {
    checkGrouping(g, `allowed_grouping ${g.value}`);
    if (g.question_span > 1) push(`allowed_grouping ${g.value}: cross-question sums can never be allowed (Principle 3)`);
  }
  for (const g of (x.forbidden_groupings as Grouping[]) ?? []) checkGrouping(g, `forbidden_grouping ${g.value}`);

  // must_not_say scoreability is a known tier.
  const tiers = new Set<ScoreabilityTier>(["deterministic", "structured-output", "model-assisted", "human"]);
  for (const r of mustNot) {
    if (!tiers.has(r.scoreability)) push(`must_not_say ${r.id}: unknown scoreability tier ${String(r.scoreability)}`);
    if (!isNonEmptyString(r.failure_type)) push(`must_not_say ${r.id}: failure_type required`);
    if (!isNonEmptyString(r.rule_violated)) push(`must_not_say ${r.id}: rule_violated required`);
  }

  // principles well-formed.
  for (const p of (x.principles as Principle[]) ?? []) {
    if (!isNonEmptyString(p.id) || !isNonEmptyString(p.title) || !isNonEmptyString(p.statement)) push(`principle ${String(p.id)}: id/title/statement required`);
  }

  return { ok: errors.length === 0, errors };
}

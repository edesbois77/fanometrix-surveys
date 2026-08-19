// ── Benchmark Study 001 — FedEx UCL — LOADER (pure, dependency-free) ──
//
// Reads the JSON Gold Standard, injects the live source hash (so the numbers
// can never silently drift from source.ts), validates it against the schema,
// and exposes the SourceModel the scorer needs. ESM-safe file resolution via
// import.meta.url — no __dirname, no bundler assumptions.

import { readFileSync } from "node:fs";
import { validateBenchmark, type Benchmark } from "../../schema";
import type { SourceModel } from "../../scoring";
import { FEDEX_SOURCE, governedNumbers, optionPct, sourceHash } from "./source";

/** Load the raw JSON gold standard, with the source hash injected from the
 *  live source aggregates. Throws if the benchmark fails schema validation. */
export function loadFedexBenchmark(): Benchmark {
  const raw = JSON.parse(readFileSync(new URL("./benchmark.json", import.meta.url), "utf8")) as Benchmark;
  const withHash: Benchmark = { ...raw, source_hash: sourceHash() };
  const v = validateBenchmark(withHash);
  if (!v.ok) throw new Error("fedex-ucl-001 benchmark invalid:\n" + v.errors.join("\n"));
  return withHash;
}

/** The SourceModel (governed numbers + every option percentage) that the
 *  source-agnostic scorer consumes. */
export function fedexSourceModel(): SourceModel {
  return {
    governedNumbers: governedNumbers(),
    options: FEDEX_SOURCE.questions.flatMap((q) =>
      q.options.map((o) => ({ question: q.key, option: o.id, pct: optionPct(q.key, o.id) }))
    ),
  };
}

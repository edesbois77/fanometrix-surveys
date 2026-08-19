# Capturing a producer's analysis for scoring

The scorer reads a neutral [`AnalysisUnderTest`](../capture-contract.ts). A
**capture** turns one producer's native output into that shape. Captures are
written here (e.g. `captures/survey-studio-<sha>-run1.json`) and then scored.

Nothing in this folder runs in CI, and no capture touches the database or
changes production behaviour.

## Survey Studio baseline — DEFERRED (on purpose)

The current Survey Studio Study Analysis is the intended **baseline** producer.
Capturing it is **deferred** while Survey Studio and Discover are being actively
changed in another session, because a live adapter would couple this benchmark
to volatile types and risk touching production analytical behaviour.

**Do not add the adapter until Survey Studio's analysis output shape settles.**

### How to add it later (read-only, no production change)

1. The existing harness `lib/studio/qa/fedex-analysis-qa.ts` already runs the
   **real** analysis pipeline (real prompts + real validators + real OpenAI)
   against the hermetic FedEx fixture **without any DB write** — it calls the
   pure prompt/validator functions, not `analyseStudy`. That is the safe place
   to capture from.
2. Add `lib/intelligence-evals/capture/capture-survey-studio.ts` with a single
   pure mapping function (see the DEFERRED note in
   [`../capture-contract.ts`](../capture-contract.ts) for the exact signature and
   field-by-field mapping): validated proposals + themes + narrative →
   `AnalysisUnderTest`.
   - Map displayed `NN.N%` / `NNpp` tokens out of the producer's prose into
     `statedNumbers` — **capture what it stated, do not re-derive**.
   - Resolve `evidenceRefs` → the governed line's `canonicalQuestionKey` for
     `citedQuestions`.
   - `claimsMustFindId` stays empty unless/until the producer self-tags; without
     it, recall/ranking fall to the model-assisted tier (by design).
3. Run the harness N times (analysis is non-deterministic), map each run, write
   the JSON here, and score each with
   [`scoreBenchmark`](../scoring.ts). Report the distribution across runs (the
   harness already runs the analyst "twice and union", mirroring production).

### Why capture N times

The AI stage is non-deterministic. A single capture is a sample, not a verdict.
Score several and report min/mean/max per dimension, plus the **hard gates**
(`arithmeticViolations === 0`, `ungroundedNumbers === 0`) which should hold on
*every* run.

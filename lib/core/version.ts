// ── Fanometrix Analytical Core — versioning (Decision 13) ─────────────────────
// Three distinct concepts, kept deliberately minimal in Stage 1:
//   • Analytical Standard version — the methodology/rules version.
//   • Analytical Core version     — this software implementation.
//   • Analysis-run provenance     — the run/snapshot that produced intelligence.

/** Fanometrix Analysis & Insight Standard version this Core implements. */
export const STANDARD_VERSION = "1.1";

/** Analytical Core software version (Stage 1). */
export const CORE_VERSION = "0.1.0";

/** The provenance triple carried on a Finding. Nulls are legitimate:
 *  `standardVersion: null` = produced before the Standard existed;
 *  `coreVersion: null`     = not produced by the Core;
 *  `runProvenance: null`   = no run/snapshot id is known. */
export type VersionTriple = {
  standardVersion: string | null;
  coreVersion: string | null;
  runProvenance: string | null;
};

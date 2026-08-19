// ── Fanometrix Analytical Core — input fingerprint (Stage 5B, pure) ───────────
// A deterministic hash of the GOVERNED EVIDENCE in a DiscoveryInput, so two
// analyses can be compared for "same evidence?". Order-insensitive (questions/
// options/waves are sorted); excludes volatile/metadata (objective, wording,
// timestamps). Identical evidence → identical fingerprint.

import { createHash } from "node:crypto";
import type { DiscoveryInput } from "../candidates/types";

function canonical(input: DiscoveryInput): unknown {
  return {
    questions: [...input.questions]
      .sort((a, b) => a.questionKey.localeCompare(b.questionKey))
      .map((q) => ({
        q: q.questionKey, base: q.base,
        options: [...q.options].sort((a, b) => a.id.localeCompare(b.id)).map((o) => ({ id: o.id, count: o.count })),
        waves: q.waves
          ? [...q.waves].sort((a, b) => a.waveId.localeCompare(b.waveId)).map((w) => ({ w: w.waveId, base: w.base, options: [...w.options].sort((a, b) => a.id.localeCompare(b.id)).map((o) => ({ id: o.id, count: o.count })) }))
          : null,
      })),
  };
}

export function fingerprintInput(input: DiscoveryInput): string {
  return "sha256:" + createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex").slice(0, 32);
}

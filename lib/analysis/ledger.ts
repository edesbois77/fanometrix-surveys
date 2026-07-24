// The Evidence Consumption Report — a complete internal ledger of exactly what
// reached Analysis, built by gather.ts BEFORE the reasoning engine forms a single
// proposition (Phase 1 calibration objective 2).
//
// It exists to make one thing provable: which of a project's approved evidence
// the platform actually consumed, how many observations each source contributed,
// and — the part that matters for calibration — what was excluded and why.
// Nothing disappears silently (framing invariant 7): an exclusion the user cannot
// see is indistinguishable from evidence we failed to collect.
//
// PURE. A plain data shape plus a sum. gather.ts owns the counting; this file
// owns the contract, so the debug panel and the stored jsonb never disagree.

/** One counted fact about a source, in reading order (e.g. surveys → responses →
 *  observations extracted). */
export type LedgerLine = { label: string; count: number };

/** Evidence that did NOT reach reasoning, with the reason stated plainly. The
 *  reasons a person is entitled to see: awaiting approval, analysis not
 *  generated, information needs missing, below the relevance threshold, too few
 *  responses, unassignable by the design. */
export type LedgerExclusion = { reason: string; count: number };

export type LedgerSource = {
  /** Stable key: 'survey' | 'document' | 'conversation' | 'news'. */
  key: string;
  label: string;
  /** Counted facts, most meaningful first. */
  lines: LedgerLine[];
  /** Evidence objects from this source actually supplied to the reasoning
   *  engine — the honest denominator for "what did Analysis consume". */
  supplied: number;
  /** What was withheld, each with its reason. Empty means nothing was dropped. */
  exclusions: LedgerExclusion[];
};

export type EvidenceLedger = {
  sources: LedgerSource[];
  /** Total evidence objects supplied to reasoning, across every source. */
  totalSupplied: number;
  /** Cross-cutting notes, e.g. searches assigned by the approved design rather
   *  than by their own Information Needs. */
  notes: string[];
};

/** Assemble the report and total the supplied observations in one place, so the
 *  headline figure is always the sum of the parts it is shown above. */
export function buildLedger(sources: LedgerSource[], notes: string[] = []): EvidenceLedger {
  return {
    sources,
    totalSupplied: sources.reduce((n, s) => n + s.supplied, 0),
    notes,
  };
}

/** Drop zero-count exclusions so the report shows only what actually happened. */
export function realExclusions(exclusions: LedgerExclusion[]): LedgerExclusion[] {
  return exclusions.filter(e => e.count > 0);
}

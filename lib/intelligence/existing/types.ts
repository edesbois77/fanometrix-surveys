// Existing Intelligence — the provider contract (docs/existing-intelligence.md).
// The Overview "Recall" section surfaces only intelligence that can genuinely be
// queried today, and every statement is traceable to a real source. New
// intelligence products (Football Intelligence, Survey Findings, Trends, News,
// Knowledge Objects) implement this interface and register themselves; the
// Overview and its UI never change.
//
// Pure types — client- and server-safe.
import type { ProjectUnderstanding } from "@/lib/understanding";

export type IntelligenceCategory = "house" | "organisation";
export type IntelligenceConfidence = "high" | "moderate" | "low";

// The traceability unit. Every finding cites >= 1 of these; each should point at
// a real object (a link/ref where possible) so a claim is always explainable.
export type IntelligenceSource = {
  provider: string;                          // provider name, e.g. "Research Library"
  label: string;                             // the specific source, e.g. "Sponsorship Benchmark 2024"
  href?: string | null;                      // deep link, where one exists
  ref?: { kind: string; id: string } | null; // structured reference to the object
};

// One grounded finding. `sources` MUST be non-empty — a finding with no source is
// inadmissible and is dropped by the orchestrator (the honesty invariant).
export type IntelligenceFinding = {
  statement: string;
  detail?: string | null;
  confidence: IntelligenceConfidence;
  sources: IntelligenceSource[];
  aspect?: string | null;                    // which aspect of the problem it bears on
};

// What a provider is given to decide relevance — the understood problem.
export type IntelligenceContext = {
  projectId: string;
  orgId: string | null;                      // scope for organisation providers
  researchQuestion: string;
  understanding: ProjectUnderstanding | null;
  markets: string[];
};

// The contract. Keep providers cheap in isAvailable() (a config/feature check);
// do the real work in retrieve(), and return [] whenever nothing is genuinely
// evidenced — never fabricate.
export interface IntelligenceProvider {
  id: string;
  name: string;
  category: IntelligenceCategory;
  isAvailable(): boolean | Promise<boolean>;
  retrieve(ctx: IntelligenceContext): Promise<IntelligenceFinding[]>;
}

// ── Orchestrator output (what the Overview renders) ──────────────────────────
export type ProviderContribution = { id: string; name: string; findings: IntelligenceFinding[] };
export type IntelligenceCategoryResult = { category: IntelligenceCategory; providers: ProviderContribution[] };

export type ExistingIntelligence = {
  categories: IntelligenceCategoryResult[];  // house first, then organisation; only contributing providers
  providersConsulted: number;                // available providers actually queried
  providersContributed: number;              // those that returned >= 1 grounded finding
};

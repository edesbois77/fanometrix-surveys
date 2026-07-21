// Existing Intelligence — registry + orchestrator (docs/existing-intelligence.md).
// Providers self-register here; `gatherExistingIntelligence` runs them and
// enforces the honesty invariants so only grounded, attributed intelligence can
// reach the Overview. Adding a provider never touches the Overview or its UI.
//
// The registry is intentionally EMPTY for now — the genuine v1 providers
// (Research Library, Previous Projects, Approved Findings) are wired in slice 2,
// and House providers (Football Intelligence, …) plug in later. Until a provider
// genuinely returns evidence, nothing surfaces.
import type {
  IntelligenceProvider, IntelligenceContext, IntelligenceFinding,
  IntelligenceCategory, ExistingIntelligence, IntelligenceCategoryResult, ProviderContribution,
} from "@/lib/intelligence/existing/types";

const CATEGORY_ORDER: IntelligenceCategory[] = ["house", "project"];
const RETRIEVE_CONCURRENCY = 5;

const REGISTRY = new Map<string, IntelligenceProvider>();

/** Register (or replace) a provider by id. Later registration wins, so a real
 *  provider can supersede a stub. */
export function registerIntelligenceProvider(provider: IntelligenceProvider): void {
  REGISTRY.set(provider.id, provider);
}

export function registeredProviders(): IntelligenceProvider[] {
  return Array.from(REGISTRY.values());
}

// A finding is admissible only if it carries at least one usable source — the
// invariant that keeps unattributed claims off the screen.
function isGrounded(f: IntelligenceFinding): boolean {
  return !!f.statement?.trim() && Array.isArray(f.sources) && f.sources.some(s => s?.provider && s?.label);
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

/** Gather Existing Intelligence for a context. Filters to available providers,
 *  retrieves concurrently, enforces the invariants (drop unsourced findings, omit
 *  empty providers), and groups by category. Never fabricates and never throws
 *  for one bad provider — a failing provider simply contributes nothing. */
export async function gatherExistingIntelligence(ctx: IntelligenceContext): Promise<ExistingIntelligence> {
  const all = registeredProviders();

  // Availability gate — unavailable providers are never queried or shown.
  const availability = await pool(all, RETRIEVE_CONCURRENCY, async p => {
    try { return await p.isAvailable(); } catch { return false; }
  });
  const available = all.filter((_, i) => availability[i]);

  // Retrieve; a provider that throws contributes nothing (best-effort).
  const retrieved = await pool(available, RETRIEVE_CONCURRENCY, async p => {
    try { return { provider: p, findings: await p.retrieve(ctx) }; }
    catch { return { provider: p, findings: [] as IntelligenceFinding[] }; }
  });

  // Enforce invariants: keep only grounded findings; omit providers that
  // contributed none.
  const contributions = retrieved
    .map(({ provider, findings }) => ({ provider, findings: (findings ?? []).filter(isGrounded) }))
    .filter(c => c.findings.length > 0);

  const categories: IntelligenceCategoryResult[] = CATEGORY_ORDER
    .map(category => ({
      category,
      providers: contributions
        .filter(c => c.provider.category === category)
        .map<ProviderContribution>(c => ({ id: c.provider.id, name: c.provider.name, findings: c.findings })),
    }))
    .filter(cat => cat.providers.length > 0);

  return {
    categories,
    providersConsulted: available.length,
    providersContributed: contributions.length,
  };
}

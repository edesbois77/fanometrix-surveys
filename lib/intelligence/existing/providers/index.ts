// Registers the genuine v1 Existing Intelligence providers. Import this module
// (for side effects) wherever intelligence is gathered — the registration
// happens once. Adding a new provider (Football Intelligence, Survey Findings,
// Google Trends, News, Knowledge Objects…) means adding one line here; the
// Overview and its UI never change (docs/existing-intelligence.md §5.4).
//
// v1: Project Intelligence only, and only providers that genuinely return
// evidence today. House Intelligence has no provider yet — it stays dormant
// rather than fabricating capability.
import { registerIntelligenceProvider } from "@/lib/intelligence/existing/registry";
import { researchLibraryProvider } from "@/lib/intelligence/existing/providers/research-library";
import { previousProjectsProvider } from "@/lib/intelligence/existing/providers/previous-projects";

let registered = false;

export function registerExistingIntelligenceProviders(): void {
  if (registered) return;
  registered = true;
  registerIntelligenceProvider(researchLibraryProvider);
  registerIntelligenceProvider(previousProjectsProvider);
}

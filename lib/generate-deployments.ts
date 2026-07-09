// Thin client wrapper around the existing, unchanged
// POST /api/research-projects/[id]/generate-deployments endpoint — the one
// place that call is made from, shared by GenerateDeploymentsCard and the
// Research Projects list page's "Save & Generate Deployments" compound
// action, so the two never diverge in how they call or interpret it.
export type GenerateResult = {
  created: Array<{ publisher: string; country: string; campaign_id: string }>;
  restored: Array<{ publisher: string; country: string; campaign_id: string }>;
  skipped_existing: Array<{ publisher: string; country: string }>;
  failed: Array<{ publisher: string; country: string; reason: string }>;
};

export async function generateDeployments(
  projectId: string
): Promise<{ ok: true; data: GenerateResult } | { ok: false; error: string }> {
  const res = await fetch(`/api/research-projects/${projectId}/generate-deployments`, { method: "POST" });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate deployments." };
  return { ok: true, data: json.data as GenerateResult };
}

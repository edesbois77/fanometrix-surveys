"use client";

// Shared "Generate Deployments" action — the single place that renders the
// button, its blocked-reason tooltip, and the created/restored/skipped/
// failed result summary. Extracted so the Research Projects list page and
// the Research Project Workspace's Generate Deployments step call the exact
// same validation and the exact same endpoint, instead of two copies
// drifting apart. The endpoint itself
// (POST /api/research-projects/[id]/generate-deployments) is unchanged —
// this only wraps it via lib/generate-deployments.ts.
import { useState } from "react";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { generateDeployments, type GenerateResult } from "@/lib/generate-deployments";
import { missingLanguageCountries, languageLabel } from "@/lib/survey-language-readiness";
import type { LangCode } from "@/lib/survey-locale";

export function GenerateDeploymentsCard({
  projectId,
  publisherOrgIds,
  countryCodes,
  surveyId,
  deploymentCount,
  completedLanguages,
  blockedPrefix,
  onGenerated,
}: {
  projectId: string;
  publisherOrgIds: string[];
  countryCodes: string[];
  surveyId: string | null;
  deploymentCount: number;
  completedLanguages: LangCode[];
  /** e.g. "In Edit" — prefixed to the disabled-button tooltip so callers can point the user at where to fix things. */
  blockedPrefix?: string;
  onGenerated?: (result: GenerateResult) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  const possibleCombos = publisherOrgIds.length * countryCodes.length;
  const mismatches = missingLanguageCountries(completedLanguages, countryCodes);
  const canGenerate = publisherOrgIds.length > 0 && countryCodes.length > 0 && !!surveyId && mismatches.length === 0;
  const blockedReasons = [
    publisherOrgIds.length === 0 && "add publishers",
    countryCodes.length === 0 && "add countries",
    !surveyId && "select a survey",
    surveyId && mismatches.length > 0 &&
      `fix survey language mismatch (${mismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)}`).join(", ")})`,
  ].filter(Boolean) as string[];

  async function handleGenerate() {
    // Hard block — mirrors the server-side check in generate-deployments.
    // The button is disabled in this state too; this only matters if the
    // underlying data changed since this card last rendered.
    if (mismatches.length > 0) {
      setError(`Cannot generate — survey language mismatch (${mismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)} version required`).join(", ")}).`);
      return;
    }
    setError("");
    setGenerating(true);
    setResult(null);
    const outcome = await generateDeployments(projectId);
    setGenerating(false);
    if (!outcome.ok) { setError(outcome.error); return; }
    setResult(outcome.data);
    onGenerated?.(outcome.data);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="inline-flex items-center gap-1">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            title={canGenerate ? "" : `${blockedPrefix ? blockedPrefix + ": " : ""}${blockedReasons.join(", ")}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#0B1929", color: "#D7B87A" }}
          >
            {generating ? "Generating…" : "Generate Deployments"}
          </button>
          <InfoTooltip text="Creates a campaign for each Publisher × Country combination on this project. Safe to click again later — existing campaigns are skipped, only new or removed-then-re-added combinations are created or restored. It never deletes campaigns for publishers/countries you've since removed." />
        </span>
        {canGenerate && deploymentCount < possibleCombos && (
          <span className="text-xs text-amber-600">
            {possibleCombos - deploymentCount} deployment{possibleCombos - deploymentCount !== 1 ? "s" : ""} pending
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="text-xs space-y-1 bg-gray-50 border border-gray-100 rounded-lg p-3">
          <p className="text-green-700">✓ {result.created.length} created</p>
          {result.restored.length > 0 && (
            <p className="text-green-700">↺ {result.restored.length} restored (previously deleted)</p>
          )}
          {result.skipped_existing.length > 0 && (
            <p className="text-gray-400">– {result.skipped_existing.length} already existed</p>
          )}
          {result.failed.length > 0 && (
            <div className="text-red-500">
              <p>✕ {result.failed.length} failed:</p>
              <ul className="list-disc list-inside">
                {result.failed.map((f, i) => (
                  <li key={i}>{f.publisher} / {f.country}: {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

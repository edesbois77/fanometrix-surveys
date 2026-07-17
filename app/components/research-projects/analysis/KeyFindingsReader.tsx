"use client";

// Shared, CHROMELESS Key Findings reader — the project-level cross-source list
// of raw stat facts (no per-source id, no review lifecycle: only generate /
// regenerate + CSV). Extracted from reports/key-findings so the identical reader
// mounts in two hosts: reports/key-findings (AdminShell; Product Walkthrough
// re-exports it, unchanged) and (workspace)/analysis/key-findings (Research
// Project workspace shell). Engine and stored output are untouched.
import { useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import type { KeyFindingsReport, KeyFinding } from "@/lib/intelligence/analysts/analyseKeyFindings";
import { getSourceLabel, isKnownEvidenceType } from "@/lib/research-sources/registry";
import { ProvenanceBadges } from "@/app/components/intelligence/ReviewFields";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

// Defensive against a stored (schema-free JSONB) report predating a
// vocabulary or type-set change — never let an unrecognised source value
// crash this page, degrade to showing the raw value instead.
function sourceLabel(source: string): string {
  return isKnownEvidenceType(source) ? getSourceLabel(source) : source;
}

type ProjectForPage = {
  project_name: string;
  topic: string | null;
  research_mode: "real" | "simulated";
  key_findings_status: string | null;
};

export function KeyFindingsReader() {
  const params = useParams();
  const id = params.id as string;
  const pathname = usePathname();
  const projectBase = pathname?.startsWith("/product-walkthrough") ? `/product-walkthrough/${id}` : `/research-projects/${id}`;
  const isWalkthrough = pathname?.startsWith("/product-walkthrough") ?? false;
  const backHref = isWalkthrough ? `${projectBase}#intelligence` : `${projectBase}/analysis`;
  const backLabel = isWalkthrough ? "← Back to Workspace" : "← Back to Analysis";

  const [project, setProject] = useState<ProjectForPage | null>(null);
  const [report, setReport] = useState<KeyFindingsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/research-projects/${id}`).then(r => r.json()),
      fetch(`/api/research-projects/${id}/key-findings`).then(r => r.json()),
    ]).then(([projectJson, findingsJson]) => {
      if (cancelled) return;
      setProject(projectJson.data ?? null);
      setReport(findingsJson.data?.content ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const autoFired = useRef(false);
  const autoGenerate = !!project && !project.key_findings_status;
  useEffect(() => {
    if (!autoGenerate || loading || report || autoFired.current) return;
    autoFired.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, report]);

  const showGenerating = generating || (autoGenerate && !loading && !report);

  async function generate() {
    setGenerating(true); setError("");
    const res = await fetch(`/api/research-projects/${id}/key-findings`, { method: "POST" });
    const json = await res.json();
    setGenerating(false);
    if (!res.ok) { setError(json.error ?? "Failed to generate Key Findings."); return; }
    setReport(json.data.content);
  }

  function download() {
    if (!report || !project) return;
    const rows = report.findings.map(f => ({
      Source: sourceLabel(f.source),
      "Source Name": f.source_label,
      Type: f.kind === "combined" ? "Combined" : "Direct",
      Finding: f.text,
    }));
    const csv = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${project.project_name} - Key Findings.csv`;
    link.click();
  }

  const bySource = new Map<string, KeyFinding[]>();
  if (report) {
    for (const f of report.findings) {
      const key = `${sourceLabel(f.source)}: ${f.source_label}`;
      bySource.set(key, [...(bySource.get(key) ?? []), f]);
    }
  }

  const isSimulated = project?.research_mode === "simulated";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {isSimulated && <div className="mb-4"><SimulatedBanner /></div>}

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div className="min-w-0">
          <Link href={backHref} scroll={false} onClick={() => { if (isWalkthrough) setWorkspaceScrollTarget("intelligence"); }} className="text-xs text-gray-400 hover:text-gray-600">{backLabel}</Link>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Key Findings</h1>
            {isSimulated && <SimulatedBadge />}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">The raw facts from every attached source, no interpretation</p>
        </div>

        {report && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={download}
              className="text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
              Download CSV
            </button>
            <button onClick={generate} disabled={generating}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: NAVY, color: GOLD }}>
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="p-10 text-center">
          <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      )}

      {!loading && !report && !showGenerating && (
        <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
            Key Findings
          </p>
          <h3 className="text-lg font-bold text-white mb-3">
            Pull the raw facts from every attached source
          </h3>
          <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
            A flat, downloadable list of plain stat facts, e.g. &quot;72% of fans said X&quot;, no analysis, just the real percentages and counts.
          </p>
          {error && <p className="text-sm text-red-300 mb-4">{error}</p>}
          <button onClick={generate}
            className="text-sm font-semibold px-6 py-3 rounded-xl"
            style={{ background: GOLD, color: NAVY }}>
            Generate Key Findings →
          </button>
        </div>
      )}

      {showGenerating && (
        <GeneratingProgress
          label="Pulling findings from every attached source…"
          sublabel="Reviewing the underlying data to identify related data points, the numbers themselves are computed directly, never by the model"
          estimatedSeconds={20}
        />
      )}

      {error && report && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {report && !generating && (
        <div className="space-y-4">
          {/* Key Findings has no edit/approve lifecycle — it only ever
              regenerates, so generated_at is its genuine last-updated
              moment. Same "Last updated" wording as every other report
              page for consistency. */}
          <p className="text-xs text-gray-400">Last updated {formatRelativeTime(report.generated_at)}</p>
          {[...bySource.entries()].map(([label, findings]) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
              <ul className="space-y-1.5">
                {findings.map((f, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed flex items-start gap-2">
                    <span className="text-gray-300 flex-shrink-0 mt-0.5">•</span>
                    <div className="min-w-0">
                      <span>{f.text}</span>
                      {f.provenance && <ProvenanceBadges provenance={f.provenance} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

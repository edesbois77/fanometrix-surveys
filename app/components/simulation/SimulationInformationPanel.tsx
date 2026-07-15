import { formatRelativeTime } from "@/lib/format-relative-time";

export type SimulationInfo = {
  scenarioName: string | null; // scenario_templates.name, or null for a Custom build
  label: string | null;        // the creator's own private label, e.g. "Heineken pitch"
  status: "generating" | "ready" | "failed";
  generatedAt: string | null;
  surveyResponseCount: number | null;  // null when survey isn't one of this run's sources
  mentionCount: number | null;         // null when conversation_search isn't one of this run's sources
  surveyResponseTarget: number | null; // null when survey isn't one of this run's sources
  mentionTarget: number | null;        // null when conversation_search isn't one of this run's sources
};

const STATUS_META: Record<SimulationInfo["status"], { label: string; className: string }> = {
  generating: { label: "Generating…", className: "bg-blue-50 text-blue-700" },
  ready:      { label: "Ready",       className: "bg-green-50 text-green-700" },
  failed:     { label: "Failed",      className: "bg-red-50 text-red-700" },
};

/** A read-only card in Project Information — scenario, purpose, generated
 * date, and simulated sources. Reuses the same fact-row layout the rest
 * of Project Information already uses, so it doesn't read as a bolted-on
 * component. */
export function SimulationInformationPanel({ info }: { info: SimulationInfo }) {
  const statusMeta = STATUS_META[info.status];
  return (
    <div className="border border-gray-100 rounded-lg px-4 py-3 mt-3" style={{ background: "#FBF9F4" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#A98A52" }}>Simulation Information</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-gray-400">Scenario</p>
          <p className="text-gray-800">{info.scenarioName ?? "Custom"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Purpose</p>
          <p className="text-gray-800">{info.label ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Status</p>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
        </div>
        <div>
          <p className="text-xs text-gray-400">Generated</p>
          <p className="text-gray-800">{info.generatedAt ? formatRelativeTime(info.generatedAt) : "—"}</p>
        </div>
        {info.surveyResponseCount !== null && (
          <div>
            <p className="text-xs text-gray-400">Simulated survey responses</p>
            <p className="text-gray-800">{info.surveyResponseCount.toLocaleString()}</p>
          </div>
        )}
        {info.mentionCount !== null && (
          <div>
            <p className="text-xs text-gray-400">Simulated conversation mentions</p>
            <p className="text-gray-800">{info.mentionCount.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

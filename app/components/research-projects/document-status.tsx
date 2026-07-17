"use client";

// Shared document lifecycle presentation.
//
// The user-facing lifecycle is deliberately just three states: Uploaded →
// Processing → Ready (Failed on error). The underlying DB pipeline
// (uploaded → extracting → analysing → pending_review → approved) runs
// automatically after upload and is approved behind the scenes — there is
// no human review gate in the Research Project workflow, so those internal
// states are never surfaced.
//
// Following the Research / Execution / Analysis model: Research just shows
// the current state as a badge; the operational processing pipeline
// (DocumentPipeline) belongs in Execution, where evidence is collected and
// prepared. Analysis consumes the result.
import { Icon, type Tone } from "@/app/components/workspace-ui";

export function documentStatusMeta(s: string): { label: string; tone: Tone } {
  const m: Record<string, { label: string; tone: Tone }> = {
    uploaded:       { label: "Uploaded",   tone: "neutral" },
    extracting:     { label: "Processing", tone: "info"    },
    analysing:      { label: "Processing", tone: "info"    },
    pending_review: { label: "Processing", tone: "info"    },
    approved:       { label: "Ready",      tone: "success" },
    failed:         { label: "Failed",     tone: "danger"  },
  };
  return m[s] ?? { label: s || "—", tone: "neutral" };
}

/** True while the document is still being processed (not Ready, not Failed). */
export function isProcessing(status: string): boolean {
  return status === "uploaded" || status === "extracting" || status === "analysing" || status === "pending_review";
}

const PIPELINE_STAGES = [
  { key: "upload",  label: "Upload complete" },
  { key: "extract", label: "Text extracted" },
  { key: "analyse", label: "AI analysing" },
  { key: "ready",   label: "Ready" },
] as const;
const STATUS_ORDER = ["uploaded", "extracting", "analysing", "pending_review", "approved"];

function stageState(key: string, status: string): "done" | "active" | "upcoming" {
  const idx = STATUS_ORDER.indexOf(status);
  switch (key) {
    case "upload":  return idx >= 0 ? "done" : "upcoming";
    case "extract": return idx >= 2 ? "done" : (status === "uploaded" || status === "extracting") ? "active" : "upcoming";
    case "analyse": return idx >= 3 ? "done" : status === "analysing" ? "active" : "upcoming";
    case "ready":   return idx >= 4 ? "done" : status === "pending_review" ? "active" : "upcoming";
    default:        return "upcoming";
  }
}

/** The operational processing pipeline — mounted in Execution. */
export function DocumentPipeline({ status }: { status: string }) {
  return (
    <ol className="space-y-2.5">
      {PIPELINE_STAGES.map(st => {
        const state = stageState(st.key, status);
        const isDone = state === "done";
        const isActive = state === "active";
        return (
          <li key={st.key} className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
              style={isDone
                ? { background: "var(--accent-wash)", color: "var(--accent-ink)", border: "1px solid #ECDCB8" }
                : isActive
                ? { background: "var(--brand-navy)", color: "var(--accent-gold)" }
                : { background: "var(--surface)", border: "1px solid var(--border-default)" }}>
              {isDone
                ? <Icon.check size={12} strokeWidth={2.5} />
                : isActive
                ? <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "currentColor" }} />
                : <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-disabled)" }} />}
            </span>
            <span className="text-sm" style={{ color: isActive ? "var(--text-primary)" : isDone ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: isActive ? 600 : 400 }}>
              {st.label}{isActive ? "…" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

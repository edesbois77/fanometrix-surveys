"use client";

import { useEstimatedProgress } from "@/lib/intelligence/useEstimatedProgress";

export function GeneratingProgress({ label, sublabel, estimatedSeconds = 20 }: {
  label: string;
  sublabel: string;
  estimatedSeconds?: number;
}) {
  const { pct, elapsedSec } = useEstimatedProgress(true, estimatedSeconds * 1000);
  return (
    <div className="p-10 text-center">
      <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-1 mb-5">{sublabel}</p>
      <div className="max-w-xs mx-auto">
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#D7B87A", transition: "width 200ms linear" }}
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-2" style={{ fontVariantNumeric: "tabular-nums" }}>
          {elapsedSec}s elapsed, usually takes about {estimatedSeconds}s
        </p>
      </div>
    </div>
  );
}

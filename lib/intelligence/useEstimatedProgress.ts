"use client";

// Drives the progress bar shown while an Intelligence report is generating.
// There's no real completion percentage to report (it's a single request/
// response to the model), so this approaches (but never reaches) 96% over
// `estimatedMs` — a slower-than-usual generation still shows visible
// motion instead of stalling at 100% before the response actually lands.
import { useEffect, useRef, useState } from "react";

export function useEstimatedProgress(active: boolean, estimatedMs: number) {
  const [pct, setPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setPct(0); setElapsedSec(0); startRef.current = null; return; }
    startRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      setElapsedSec(Math.floor(elapsed / 1000));
      setPct(96 * (1 - Math.exp(-elapsed / estimatedMs)));
    }, 200);
    return () => clearInterval(id);
  }, [active, estimatedMs]);

  return { pct, elapsedSec };
}

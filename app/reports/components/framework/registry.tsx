"use client";

// The section registry — the one place that maps a section `type` to the
// component that renders it. This is what makes the framework open to extension
// and closed to modification: a new module is a new component + one entry here
// (or, for a report-specific module, an `extraModules` prop on ReportShell), and
// nothing else in the framework needs to change.
//
// A `views` value is threaded to every renderer; only the hero uses it. Unknown
// types (a bespoke module not registered) render nothing in production and a
// visible placeholder in development, so a mis-typed section can never crash a
// published report.

import type { ComponentType } from "react";
import { INK, SANS } from "@/app/reports/theme";
import type { Section } from "@/lib/reports/framework/types";
import { Hero } from "./Hero";
import {
  Prose,
  ExecutiveSummary,
  StatWall,
  SurveyEvidence,
  FindingsLadder,
  Insight,
  Benchmark,
  StrategyFramework,
  Recommendations,
  Methodology,
  ImageBand,
} from "./Sections";
import { Closing } from "./Closing";

export type SectionRenderer = ComponentType<{ section: never; views: number | null }>;

// Each renderer accepts its own narrowed section type; the registry stores them
// under a loose signature and the lookup narrows by `type` at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRenderer = ComponentType<{ section: any; views: number | null }>;

export const CORE_MODULES: Record<string, AnyRenderer> = {
  hero: Hero,
  prose: Prose,
  "executive-summary": ExecutiveSummary,
  "stat-wall": StatWall,
  "survey-evidence": SurveyEvidence,
  "findings-ladder": FindingsLadder,
  insight: Insight,
  benchmark: Benchmark,
  "strategy-framework": StrategyFramework,
  recommendations: Recommendations,
  methodology: Methodology,
  image: ImageBand,
  closing: Closing,
};

export function resolveModule(
  type: string,
  extra?: Record<string, AnyRenderer>,
): AnyRenderer | null {
  return extra?.[type] ?? CORE_MODULES[type] ?? null;
}

/** Rendered in place of an unregistered section type — silent in production. */
export function UnknownModule({ section }: { section: Section }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div
      style={{
        fontFamily: SANS,
        fontSize: 13,
        color: INK.tertiary,
        border: `1px dashed ${INK.hairline}`,
        borderRadius: 8,
        padding: "16px 20px",
        margin: "24px auto",
        maxWidth: 720,
      }}
    >
      No renderer registered for section type <strong>“{section.type}”</strong> (id: {section.id}).
    </div>
  );
}

export type { AnyRenderer };

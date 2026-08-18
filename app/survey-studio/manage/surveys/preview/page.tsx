"use client";

// Visual-review canvas for the Manage → Survey detail page. Not linked in the
// product; renders the SurveyManagementView over deterministic fixtures so header,
// lifecycle explanation, questions, campaigns, actions and danger zone can be
// reviewed in every lifecycle state. Actions are inert here (no mutation).
//   /survey-studio/manage/surveys/preview?state=<state>

import { useState } from "react";
import { StudioContainer } from "@/app/components/studio/StudioContainer";
import { SurveyManagementView } from "@/app/components/studio/manage/ManageSurveyDetail";
import { PREVIEW_FIXTURES, PREVIEW_STATES, type PreviewState } from "@/app/components/studio/manage/manage-survey-fixtures";

// Sample analysis header state per fixture (inert; for visual review of the
// Analyse / Regenerate / disabled header action).
function analysisFor(state: PreviewState) {
  if (state === "historical" || state === "admin-cross-org") return { eligible: true, reason: null, generatedAt: "2026-08-18T09:00:00Z", busy: false }; // Regenerate
  if (state === "live") return { eligible: true, reason: null, generatedAt: null, busy: false }; // Analyse
  if (state === "draft-empty" || state === "draft-config" || state === "ready" || state === "legacy")
    return { eligible: false, reason: "Not enough research evidence to analyse yet — a question needs at least 30 answers.", generatedAt: null, busy: false }; // disabled
  return null;
}

export default function ManageSurveyPreviewPage() {
  const [state, setState] = useState<PreviewState>("historical");
  const data = PREVIEW_FIXTURES[state];
  return (
    <StudioContainer>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {PREVIEW_STATES.map((s) => (
          <button key={s.key} type="button" onClick={() => setState(s.key)}
            className="text-xs font-semibold rounded-md px-2.5 py-1 transition-colors"
            style={state === s.key
              ? { background: "var(--accent-gold)", color: "var(--accent-ink)" }
              : { background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
            {s.label}
          </button>
        ))}
      </div>
      <SurveyManagementView data={data} nowMs={Date.parse("2026-08-17T00:00:00Z")}
        analysis={analysisFor(state)} onAnalyse={() => {}} onViewInDiscover={() => {}} />
    </StudioContainer>
  );
}

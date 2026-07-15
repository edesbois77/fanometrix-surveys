// Single source of truth for the Research Project lifecycle progress
// tracker — Research Question → Dashboard → Research Sources → Intelligence →
// Report → Conclusion → Knowledge — shared by the Workspace's pill row and
// its "Research Progress" hero stat, so there's exactly one place that
// decides what "complete" means for each stage. Dashboard sits ahead of
// Research Sources (not after it): as the project's operational home, it's
// what a returning user should see first, with Research Sources as the
// drill-down underneath it. "Research Sources" and "Intelligence" are
// display labels only — the `key`s below (evidence, intelligence) are
// unchanged, matching the rest of the codebase.
export type StageState = "complete" | "in_progress" | "not_started";

export type LifecycleStage = {
  key: "research_question" | "dashboard" | "evidence" | "intelligence" | "report" | "conclusion" | "knowledge";
  label: string;
  state: StageState;
  sectionId: string | null;
};

export type LifecycleProject = {
  research_question: string | null;
  /** Only whether any evidence exists matters here — never keyed on
   * survey_id/deployment_count (storage/delivery mechanics); a stage asks
   * "does the research contain X", not "how is X implemented". Also gates
   * Dashboard: a dashboard is only meaningful once there's evidence to
   * show progress on. */
  evidence: unknown[];
  /** Status of Survey Intelligence specifically — see decision 6 in the plan: no single project-level "intelligence_status", each AI service owns its own. */
  survey_intelligence_status: "draft" | "edited" | "approved" | "published" | null;
  /** Status of the Executive Report (Phase 4) — the only Report output_type
   * that exists today. If a second report type ships, this stage can widen
   * to "any report type approved" without changing its shape. */
  report_status: "draft" | "edited" | "approved" | "published" | null;
  /** Status of the Conclusion — the evidence-backed answer to
   * research_question, synthesised from the approved Executive Report.
   * Same draft/approved/published shape as survey_intelligence_status/
   * report_status. Publishing a Conclusion is what hands it to Knowledge. */
  conclusion_status: "draft" | "edited" | "approved" | "published" | null;
};

export function computeLifecycleStages(project: LifecycleProject): LifecycleStage[] {
  const evidenceState: StageState = project.evidence.length > 0 ? "complete" : "not_started";

  const intelligenceState: StageState =
    project.survey_intelligence_status === "approved" || project.survey_intelligence_status === "published"
      ? "complete"
      : project.survey_intelligence_status
      ? "in_progress"
      : "not_started";

  const reportState: StageState =
    project.report_status === "approved" || project.report_status === "published"
      ? "complete"
      : project.report_status
      ? "in_progress"
      : "not_started";

  const conclusionState: StageState =
    project.conclusion_status === "approved" || project.conclusion_status === "published"
      ? "complete"
      : project.conclusion_status
      ? "in_progress"
      : "not_started";

  const knowledgeState: StageState = project.conclusion_status === "published" ? "complete" : "not_started";

  return [
    {
      key: "research_question", label: "Research Question",
      state: project.research_question?.trim() ? "complete" : "not_started",
      sectionId: "hero",
    },
    { key: "dashboard", label: "Dashboard", state: evidenceState, sectionId: "dashboard" },
    { key: "evidence", label: "Research Sources", state: evidenceState, sectionId: "evidence" },
    { key: "intelligence", label: "Intelligence", state: intelligenceState, sectionId: "intelligence" },
    { key: "report", label: "Report", state: reportState, sectionId: "reports" },
    { key: "conclusion", label: "Conclusion", state: conclusionState, sectionId: "conclusion" },
    { key: "knowledge", label: "Knowledge", state: knowledgeState, sectionId: "knowledge" },
  ];
}

/** Friendly progress summary for the hero stat — e.g. "33%" alongside "2 of 6 stages complete". */
export function computeResearchProgress(stages: LifecycleStage[]): { completed: number; total: number; percent: number; label: string } {
  const completed = stages.filter(s => s.state === "complete").length;
  const total = stages.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent, label: `${percent}% (${completed} of ${total} stages complete)` };
}

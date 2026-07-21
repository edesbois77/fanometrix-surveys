"use client";

// The Overview's Recall + closing synthesis (docs/overview-page.md §B.3–§B.6).
// Fetches Existing Intelligence AND the Knowledge Position in a single gather,
// then renders "What we already know" (Recall), the confidence/frontier, and
// Fanometrix's Recommendation. Renders only once "Our Understanding" exists.
//
// One fetch powers both sections so providers (and the synthesis) run once.
import { useEffect, useState } from "react";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { OverviewRecall } from "@/app/components/research-projects/OverviewRecall";
import { OverviewRecommendation } from "@/app/components/research-projects/OverviewRecommendation";
import { hasUnderstanding } from "@/lib/understanding";
import type { ExistingIntelligence } from "@/lib/intelligence/existing/types";
import type { KnowledgePosition } from "@/lib/knowledge-position";

type State = { loading: boolean; intelligence?: ExistingIntelligence; knowledgePosition?: KnowledgePosition | null; error?: string };

export function OverviewIntelligence() {
  const { projectId, project } = useResearchProject();
  const present = hasUnderstanding(project?.understanding ?? null);
  const [state, setState] = useState<State>({ loading: true });

  useEffect(() => {
    if (!present) return;
    let cancelled = false;
    setState({ loading: true });
    fetch(`/api/research-projects/${projectId}/existing-intelligence`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setState({ loading: false, intelligence: j.intelligence, knowledgePosition: j.knowledgePosition, error: j.error }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: "Couldn't gather existing intelligence." }); });
    return () => { cancelled = true; };
  }, [projectId, present]);

  if (!present) return null;

  // "Refine the understanding" → return the user to the Understanding at the top.
  const onRefine = () => {
    if (typeof document !== "undefined") document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <OverviewRecall data={state.intelligence} loading={state.loading} />
      <OverviewRecommendation kp={state.knowledgePosition} loading={state.loading} projectId={projectId} onRefine={onRefine} />
    </>
  );
}

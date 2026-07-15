"use client";

// The Conclusions area body — at /research-projects/[id]/conclusion. It answers
// one question: "what is the final answer to this research?" Two distinct
// concepts kept in one top-level project area, not merged:
//
//   Conclusion — the final, project-level research answer. Distilled from the
//     approved Executive Report, it closes the project (generate → review →
//     approve → publish).
//   Knowledge — the durable, reusable organisational knowledge this research
//     leaves behind. It lives beyond this project and is populated only by
//     publishing the approved Conclusion; there is no other way in.
//
// The answer leads, the mechanics follow. When a *published* Conclusion exists
// it is promoted to a headline at the very top — the answer, its rationale, its
// basis and when it was published — so a reader sees the final answer first.
// The generate/review/approve/publish/regenerate machinery then sits below in
// the unchanged ConclusionSection, supporting the answer rather than dominating.
//
// PW-safe promotion: the headline is rendered here, in this Research-Project-only
// body, from project.published_conclusion — the shared ConclusionSection and
// KnowledgeSection are reused exactly as before, each keeping its own data
// model, generation/publish logic and review states. Product Walkthrough has its
// own single-page WalkthroughBody with its own copy of these sections and is
// unaffected.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout.
import Link from "next/link";
import { useResearchProject, type Conclusion } from "@/app/components/research-projects/ProjectProvider";
import { ConclusionSection } from "@/app/components/research-projects/ConclusionSection";
import { KnowledgeSection } from "@/app/components/research-projects/KnowledgeSection";
import { PageIntro } from "@/app/components/research-projects/PageIntro";
import { StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

// The published answer, promoted to the top as the page's headline. Shown only
// once a Conclusion is published (project.published_conclusion is populated on
// publish, and nowhere else). The "basis" is the one confidence signal actually
// available at this level — whether the answer rests on real or simulated
// research; a numeric confidence score would need a backend field and isn't
// invented here. "Published" uses the same generated_at timestamp Knowledge
// already treats as the publish date.
function PublishedAnswerHeadline({ conclusion }: { conclusion: Conclusion }) {
  const simulated = conclusion.research_mode === "simulated";
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: NAVY }}>
      <div className="p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: GOLD }}>
          The Final Answer
        </p>
        {conclusion.research_question?.trim() && (
          <p className="text-xs text-white/50 mb-3">Answering: {conclusion.research_question}</p>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">{conclusion.answer}</h1>

        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Rationale</p>
          <p className="text-sm md:text-base text-white/80 leading-relaxed">{conclusion.rationale}</p>
        </div>

        <div className="mt-5 flex items-center gap-2.5 flex-wrap">
          <StatusBadge label="Published" tone="success" />
          <StatusBadge label={simulated ? "Simulated research" : "Evidence-backed"} tone={simulated ? "warning" : "info"} />
          <span className="text-xs text-white/50">Published {formatRelativeTime(conclusion.generated_at)}</span>
        </div>

        {simulated && conclusion.synthetic_notice && (
          <p className="text-xs text-white/40 italic mt-3 leading-relaxed">{conclusion.synthetic_notice}</p>
        )}
      </div>
    </div>
  );
}

export function ConclusionKnowledgeBody() {
  const { project, loading, error } = useResearchProject();

  if (loading && !project) return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading research project…</p>
    </div>
  );
  if (error || !project) return (
    <div className="p-6 max-w-5xl mx-auto text-center py-20">
      <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
      <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
    </div>
  );

  const displayName = project.research_mode === "simulated" && project.topic?.trim()
    ? project.topic.trim()
    : project.project_name;

  const published = project.published_conclusion;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <PageIntro>Capture the final answer to your research and retain the knowledge generated for future projects.</PageIntro>

      {/* Promoted headline — the answer first, only once it's published. */}
      {published && <PublishedAnswerHeadline conclusion={published} />}

      {/* The Conclusion mechanics — generate/review/approve/publish/regenerate.
          When a headline is shown above, this is the management surface for it;
          otherwise it's how the conclusion gets created in the first place. */}
      {published && (
        <p className="text-xs text-gray-400 px-1 pt-1">Manage the answer below — review, edit, regenerate or republish it.</p>
      )}
      <ConclusionSection
        projectId={project.id}
        projectName={displayName}
        researchQuestion={project.research_question ?? ""}
        reportApproved={project.report_status === "approved" || project.report_status === "published"}
        isSimulated={project.research_mode === "simulated"}
      />

      {/* Knowledge — deliberately separated from the Conclusion above: the
          Conclusion is the answer to *this* project; Knowledge is the reusable
          intelligence that outlives it. */}
      <p className="text-xs text-gray-400 px-1 pt-2">Knowledge is the reusable intelligence this research leaves behind — it lives beyond this project, distinct from the conclusion above.</p>
      <KnowledgeSection publishedConclusion={project.published_conclusion} />
    </div>
  );
}

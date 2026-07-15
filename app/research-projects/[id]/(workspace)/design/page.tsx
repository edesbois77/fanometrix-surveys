"use client";

// The Design area — the project's research-design layer. Today it surfaces
// the existing research brief (the question the project investigates, its
// objective and classification) and, per attached survey, the Research Target
// and Creative Design that shape how that survey is fielded.
//
// Distinction preserved: context shapes what the project investigates;
// evidence determines what it can conclude. The brief here is context — it is
// never written into research_project_evidence and never counted by report
// readiness. This page is deliberately structured to grow (future Project
// Context, brief upload and AI-assisted Research Design slot in here as
// additional context inputs) but Step 3 only relocates existing functionality.
//
// Reuse, not rebuild: the brief is edited through the same
// ResearchProjectEditDrawer used everywhere else (one form, one save). The
// per-survey Research Target and Creative Design remain survey-owned and are
// still edited in Sources for now (each survey card); here they are shown
// read-only as the design-layer view. When Sources is split into its own area
// in a later step, that per-survey editor moves here.
import { useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { ResearchProjectEditDrawer, type ResearchProjectBriefFields } from "@/app/components/research-projects/ResearchProjectEditDrawer";
import { SectionCard, EmptyState, InfoContent } from "@/app/components/research-projects/Shell";
import { useCreativeDesignNames } from "@/lib/creative-designs";
import { studyTypeLabel } from "@/lib/naming";
import { researchSubjectLabel } from "@/lib/research-subjects";
import Link from "next/link";

export default function ResearchProjectDesignPage() {
  const { project, orgs, loading, error, load } = useResearchProject();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";
  const designNames = useCreativeDesignNames();

  const [editingBrief, setEditingBrief] = useState<Partial<ResearchProjectBriefFields> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  // Mirror the workspace's own loading/error handling — the shell layout
  // renders the header + nav around this, so these are just the body states.
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

  const p = project;
  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgAgencies = orgs.filter(o => o.type === "agency");
  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );

  function openEditBrief() {
    setEditingBrief({
      id: p.id, project_id: p.project_id,
      topic: p.topic, research_question: p.research_question, research_subject: p.research_subject,
      brand_org_id: p.brand_org_id, agency_org_id: p.agency_org_id, study_type: p.study_type,
      objective: p.objective, tags: p.tags,
    });
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

      {/* ── Research Brief — the project's context (question + framing) ────── */}
      <SectionCard
        id="design-brief"
        title="Research Brief"
        info={
          <InfoContent title="What this project sets out to investigate.">
            <p>The research question, its objective and how the project is classified. This is context — it shapes what the project investigates.</p>
            <p className="mt-1.5">Evidence (in Sources) is what the project can actually conclude from. Context is never counted as evidence.</p>
          </InfoContent>
        }
        cta={canManage && (
          <button onClick={openEditBrief} className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
            Edit Research Brief
          </button>
        )}
      >
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Research Question</p>
          {project.research_question ? (
            <p className="text-base font-medium text-gray-900 leading-relaxed">{project.research_question}</p>
          ) : (
            <p className="text-sm text-gray-400">No research question set{canManage ? ", edit the brief to add one." : "."}</p>
          )}
        </div>

        {project.objective && (
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objective</p>
            <p className="text-base font-medium text-gray-900 leading-relaxed">{project.objective}</p>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
          <span><span className="text-gray-400">Research Type </span>{studyTypeLabel(project.study_type)}</span>
          <span><span className="text-gray-400">Research Category </span>{researchSubjectLabel(project.research_subject)}</span>
          {project.brand_org_id && <span><span className="text-gray-400">Brand </span>{orgName(project.brand_org_id)}</span>}
          {project.agency_org_id && <span><span className="text-gray-400">Agency </span>{orgName(project.agency_org_id)}</span>}
        </div>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {project.tags.map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Research Target & Creative Design — per attached survey ────────── */}
      <SectionCard
        id="design-target-creative"
        title="Research Target & Creative Design"
        info={
          <InfoContent title="How each survey is fielded.">
            <p>Each attached survey has its own Research Target (the responses it aims to collect) and Creative Design (the look the survey is deployed with).</p>
            <p className="mt-1.5">These are survey-owned settings. For now they are edited on each survey&apos;s card in Sources; this is the design-layer view of them.</p>
          </InfoContent>
        }
      >
        {surveyEvidence.length === 0 ? (
          <EmptyState>No surveys attached yet. Add a survey in Sources to set its Research Target and Creative Design.</EmptyState>
        ) : (
          <div className="space-y-2">
            {surveyEvidence.map(item => (
              <div key={item.id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium text-gray-900 min-w-0 truncate">{item.survey.name}</p>
                <div className="flex items-center gap-x-6 gap-y-1 flex-wrap text-sm">
                  <span className="text-gray-700">
                    <span className="text-xs text-gray-400 uppercase tracking-wide mr-1.5">Research Target</span>
                    {item.survey.target_responses ? item.survey.target_responses.toLocaleString() : "Not set"}
                  </span>
                  <span className="text-gray-700">
                    <span className="text-xs text-gray-400 uppercase tracking-wide mr-1.5">Creative Design</span>
                    {designNames[item.survey.creative_design ?? ""] ?? "Fanometrix Default"}
                  </span>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">Edited per survey in Sources.</p>
          </div>
        )}
      </SectionCard>

      {editingBrief && (
        <ResearchProjectEditDrawer
          initial={editingBrief}
          orgBrands={orgBrands}
          orgAgencies={orgAgencies}
          orgName={orgName}
          onClose={() => setEditingBrief(null)}
          onSaved={() => { setEditingBrief(null); showToast("Research Brief updated."); load(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

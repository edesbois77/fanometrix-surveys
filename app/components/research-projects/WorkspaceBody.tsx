"use client";

// The Research Project Workspace — the central workspace of the platform,
// following the research methodology: Research Question → Dashboard →
// Research Sources → Intelligence → Report → Conclusion → Knowledge.
// "Research Sources" and "Intelligence" are this Workspace's display names
// for what the rest of the codebase still calls Evidence and AI
// Intelligence (types, API routes, DB columns, and the lifecycle stage
// `key`s are unchanged) — purely a first-time-user-facing relabel, not an
// architecture change. Project Information is the single home for every
// project-level fact and setting (including the Research Target and its
// derived Status — never a manual dropdown), Research Sources supports
// attaching an already-existing survey (not just creating new ones), the
// Deployment Wizard always starts at Step 1 rather than guessing where to
// reopen, and Campaigns is a fully operational manager (filters, bulk
// actions, per-card controls) shared with the standalone Campaigns page
// via app/components/campaigns/*.
//
// Extracted into its own component (previously the default export of
// app/research-projects/[id]/page.tsx directly) so both the real Research
// Projects Workspace and Product Walkthrough render the exact same UI —
// see the file-level comment on WorkspaceBody() below for how the split
// works.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { studyTypeLabel } from "@/lib/naming";
import { researchSubjectLabel } from "@/lib/research-subjects";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { computeLifecycleStages, computeResearchProgress } from "@/lib/research-project-lifecycle";
import { computeProjectStatus, PROJECT_STATUS_META } from "@/lib/research-project-status";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { SimulationInformationPanel } from "@/app/components/simulation/SimulationInformationPanel";
import { SectionCard, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { getWorkspaceScrollTarget, clearWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { STAGE_STATE_META, ProjectStatusBadge } from "@/app/components/research-projects/workspace-shared";

// The real, operational Research Project Workspace — rendered only at
// /research-projects/[id]. Product Walkthrough (/product-walkthrough/[id])
// is now a separate, self-contained single-page experience (see
// app/product-walkthrough/[id]/WalkthroughBody.tsx); the two trees share the
// data layer (ProjectProvider) and the section components, but no longer
// share this body. That decoupling (Step 1 of the Research Project Shell
// migration) is what lets the real workspace be restructured into the
// multi-page shell without touching the walkthrough, and vice versa. The
// old presentModeEnabled flag and the cross-route mode-redirect it drove
// have been removed from this path entirely.
//
// WorkspaceBodyContent is the workspace itself, and it renders no chrome of
// its own: the AdminShell, the ProjectProvider data layer, and the persistent
// project header + navigation are all provided by the Research Project shell
// layout (app/research-projects/[id]/(workspace)/layout.tsx), which mounts
// this as its page child. It reads project data through useResearchProject()
// from that layout's provider. (Product Walkthrough is unaffected — it keeps
// its own separate WalkthroughBody, which still mounts its own provider and
// AdminShell.)
export function WorkspaceBodyContent() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "publisher";

  const { project, campaigns, loading, error, load } = useResearchProject();

  const [toast, setToast] = useState<string | null>(null);

  // Project Information — edit mode for the settings subset (Confidentiality,
  // Version). Owner/Created/Last Updated/Status stay permanently read-only —
  // Status is derived, never a manual field.
  const [editingProjectInfo, setEditingProjectInfo] = useState(false);
  const [draftConfidentiality, setDraftConfidentiality] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);
  const [projectInfoError, setProjectInfoError] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // Scrolls back to a section once the real content exists to scroll to —
  // e.g. the "← Back to Workspace" link on a Survey/Conversation
  // Intelligence, Key Findings or Executive Report page. Reads
  // sessionStorage (set by that link, see lib/workspace-scroll.ts) first,
  // falling back to the URL's own #hash for a direct link/bookmark.
  //
  // Deliberately runs on *every* render (no dependency array) rather than
  // once when `project` first loads: a simulated project's back-link lands
  // on /research-projects/[id], which immediately redirects to
  // /product-walkthrough/[id] above — if that destination Workspace
  // instance is one Next's router cache already had mounted with `project`
  // already loaded, a `[project]`-keyed effect would never fire again since
  // that dependency never changes on this visit. Checking on every render
  // means it doesn't matter whether this is a fresh mount or a reused one;
  // `lastScrolledRef` still stops it from re-scrolling on unrelated
  // re-renders once it's already handled the current target, and it
  // deliberately waits (does nothing, tries again next render) rather than
  // giving up if the target element hasn't rendered yet.
  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    const stored = getWorkspaceScrollTarget();
    const targetId = stored || window.location.hash.replace(/^#/, "");
    if (!targetId || targetId === lastScrolledRef.current) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    lastScrolledRef.current = targetId;
    if (stored) clearWorkspaceScrollTarget();
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Only the very first load (no project fetched yet) replaces the whole
  // page with this placeholder. A background refresh (e.g. load() called
  // after closing an Intelligence modal) keeps loading true against an
  // already-populated project — gating on loading alone would unmount the
  // entire page in favour of this ~256px placeholder and back again, which
  // collapses the document height and resets scroll to the top even though
  // nothing actually navigated.
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

  const projectId = project.id;

  // Captured once (rather than read via `project.X` inside the nested
  // function declarations below) because TypeScript doesn't carry the
  // `project !== null` narrowing from the early-return guard above across
  // a nested function's own scope.
  const p = project;

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const projectStatus = computeProjectStatus(project, hasActiveCampaign);

  const stages = computeLifecycleStages(project);
  const progress = computeResearchProgress(stages);

  function openProjectInfoEdit() {
    setDraftConfidentiality(p.confidentiality);
    setDraftVersion(p.version);
    setProjectInfoError("");
    setEditingProjectInfo(true);
  }

  async function handleSaveProjectInfo() {
    setSavingProjectInfo(true); setProjectInfoError("");
    const res = await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidentiality: draftConfidentiality, version: draftVersion }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingProjectInfo(false);
    if (!res.ok) { setProjectInfoError(json.error ?? "Failed to save."); return; }
    setEditingProjectInfo(false);
    showToast("Project Information updated.");
    load();
  }

  async function handleCloseResearch() {
    if (!confirm("Close this research? You can reopen it later if more research sources are needed.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });
    showToast("Research closed.");
    load();
  }

  async function handleReopenResearch() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: null }),
    });
    showToast("Research reopened.");
    load();
  }

  async function handleArchiveProject() {
    if (!confirm("Archive this project? It'll be hidden from the default list but never deleted.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });
    showToast("Project archived.");
    load();
  }

  async function handleRestoreProject() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: null }),
    });
    showToast("Project restored.");
    load();
  }

  return (
    <>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

        {/* Permanent — no dismiss, no collapse. See Platform Contract §02/§03. */}
        {project.research_mode === "simulated" && <SimulatedBanner />}

        {/* ── Overview summary — the project's research question, objective and
            a source/progress rollup. Project identity (name, status,
            breadcrumb) now lives in the persistent shell header, and editing
            the brief now lives on the Design area, so neither is repeated
            here. */}
        <div id="hero" className="bg-white border border-gray-100 rounded-xl shadow-sm scroll-mt-4">
          <div className="p-6">
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Research Question</p>
              {project.research_question ? (
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.research_question}</p>
              ) : (
                <p className="text-sm text-gray-400">No research question set, edit the project to add one.</p>
              )}
            </div>

            {project.objective && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objective</p>
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.objective}</p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
              <span><span className="text-gray-400">Research Sources </span>{project.evidence.length}</span>
              <span><span className="text-gray-400">Research Progress </span>{progress.label}</span>
              <span><span className="text-gray-400">Research Type </span>{studyTypeLabel(project.study_type)}</span>
              <span><span className="text-gray-400">Research Category </span>{researchSubjectLabel(project.research_subject)}</span>
            </div>
          </div>
        </div>

        {/* ── Research Lifecycle — progress tracker + page nav ───────────────── */}
        {/* Sticky against <main>'s own scroll container (see AdminShell) so
            it stays visible while scrolling the rest of the Workspace —
            what's done and what's left should never require scrolling
            back up to check. */}
        <div className="sticky top-0 z-20 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-center flex-wrap gap-1.5">
            {stages.map((stage, i) => {
              const meta = STAGE_STATE_META[stage.state];
              const pill = (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border inline-flex items-center gap-1 whitespace-nowrap ${meta.className}`}>
                  <span className="text-[9px]">{meta.icon}</span>{stage.label}
                </span>
              );
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  {stage.sectionId ? (
                    <button
                      onClick={() =>
                        // Sections that have moved to their own area route are
                        // navigated to rather than scrolled to (their anchor
                        // isn't on this page): Research Sources → Sources,
                        // Dashboard → Dashboard, Intelligence → Analysis,
                        // Report → Outputs, Conclusion + Knowledge → Conclusion
                        // & Knowledge. The rest still scroll in-page. (This whole
                        // tracker is superseded by the shell nav and is removed
                        // once Overview is finalised.)
                        stage.sectionId === "evidence"
                          ? router.push(`/research-projects/${projectId}/sources`)
                          : stage.sectionId === "dashboard"
                            ? router.push(`/research-projects/${projectId}/dashboard`)
                            : stage.sectionId === "intelligence"
                              ? router.push(`/research-projects/${projectId}/analysis`)
                              : stage.sectionId === "reports"
                                ? router.push(`/research-projects/${projectId}/outputs`)
                                : stage.sectionId === "conclusion" || stage.sectionId === "knowledge"
                                  ? router.push(`/research-projects/${projectId}/conclusion`)
                                  : scrollToSection(stage.sectionId!)
                      }
                      className="transition-transform hover:scale-105"
                    >
                      {pill}
                    </button>
                  ) : pill}
                  {i < stages.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Project Information — the home for every project-level fact and
            setting: metadata, and Status (always derived, never manual).
            The Research Target lives in the Campaigns section instead —
            it's a campaign-collection setting, not project metadata. */}
        <SectionCard
          id="project-info"
          title="Project Information"
          info={
            <InfoContent title="Project-level facts, all in one place.">
              <p>Owner, Status, Created/Updated dates, Confidentiality and Version for this project.</p>
              <p className="mt-1.5">Status updates automatically from what&apos;s happening in Campaigns below, it&apos;s never set manually here. The Research Target lives in Campaigns too, since it&apos;s a campaign-collection setting rather than project metadata.</p>
            </InfoContent>
          }
          cta={canManage && !editingProjectInfo && (
            <button onClick={openProjectInfoEdit} className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
              Edit
            </button>
          )}
          summary={
            <CollapsedSummary groups={[
              { label: "Status", parts: [PROJECT_STATUS_META[projectStatus].label] },
              { label: "Owner", parts: [project.owner_name ?? "—"] },
            ]} />
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Owner</p>
              <p className="text-gray-700">{project.owner_name ?? "—"}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Set automatically from whoever created this project.</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Status</p>
              <ProjectStatusBadge status={projectStatus} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Created</p>
              <p className="text-gray-700">{formatRelativeTime(project.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Last Updated</p>
              <p className="text-gray-700">{formatRelativeTime(project.last_response_at ?? project.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Confidentiality</p>
              {editingProjectInfo ? (
                <select value={draftConfidentiality ?? ""} onChange={e => setDraftConfidentiality(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]">
                  <option value="">Not set</option>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                </select>
              ) : (
                <p className="text-gray-700 capitalize">{project.confidentiality ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Version</p>
              {editingProjectInfo ? (
                <input value={draftVersion ?? ""} onChange={e => setDraftVersion(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. v1" />
              ) : (
                <p className="text-gray-700">{project.version ?? "—"}</p>
              )}
            </div>
          </div>

          {editingProjectInfo && (
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              {projectInfoError && <p className="text-xs text-red-500 mr-auto self-center">{projectInfoError}</p>}
              <button onClick={() => setEditingProjectInfo(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
              <button onClick={handleSaveProjectInfo} disabled={savingProjectInfo}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {savingProjectInfo ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {canManage && !editingProjectInfo && (
            <div className="border-t border-gray-100 pt-3 mt-4 flex gap-4">
              {projectStatus !== "archived" && (
                <button
                  onClick={projectStatus === "complete" ? handleReopenResearch : handleCloseResearch}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {projectStatus === "complete" ? "Reopen Research" : "Close Research"}
                </button>
              )}
              <button
                onClick={projectStatus === "archived" ? handleRestoreProject : handleArchiveProject}
                className={`text-xs hover:underline ${projectStatus === "archived" ? "text-gray-500" : "text-red-400"}`}
              >
                {projectStatus === "archived" ? "Restore Project" : "Archive Project"}
              </button>
            </div>
          )}

          {project.research_mode === "simulated" && project.simulation_info && (
            <SimulationInformationPanel info={project.simulation_info} />
          )}
        </SectionCard>

      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          ✓ {toast}
        </div>
      )}

    </>
  );
}

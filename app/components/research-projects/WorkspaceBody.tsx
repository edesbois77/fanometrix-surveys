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
import { useSession } from "@/app/components/SessionProvider";
import { ResearchProjectEditDrawer, type ResearchProjectBriefFields } from "@/app/components/research-projects/ResearchProjectEditDrawer";
import { OverviewUnderstanding } from "@/app/components/research-projects/OverviewUnderstanding";
import { OverviewRecall } from "@/app/components/research-projects/OverviewRecall";
import { studyTypeLabel } from "@/lib/naming";
import { researchSubjectLabel } from "@/lib/research-subjects";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { computeLifecycleStages, computeResearchProgress } from "@/lib/research-project-lifecycle";
import { computeProjectStatus } from "@/lib/research-project-status";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { SimulationInformationPanel } from "@/app/components/simulation/SimulationInformationPanel";
import {
  PageContainer, PageLoadingState, ErrorState,
  Card, Panel, SectionHeading, Eyebrow, Button, MetricTile, ConfidenceIndicator, ActivityFeed, Icon,
  type ConfidenceLevel,
} from "@/app/components/workspace-ui";
import { getWorkspaceScrollTarget, clearWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { ProjectStatusBadge } from "@/app/components/research-projects/workspace-shared";

// The seven workspace areas, in workflow order — the horizontal research
// pipeline on Overview mirrors exactly this nav sequence.
const PIPELINE_AREAS = [
  { key: "overview", label: "Overview" },
  { key: "research", label: "Research" },
  { key: "execution", label: "Execution" },
  { key: "dashboard", label: "Dashboard" },
  { key: "analysis", label: "Analysis" },
  { key: "outputs", label: "Reports" },
  { key: "conclusion", label: "Conclusions" },
] as const;

// The Intelligence Status content shape, derived in the body from live state.
type IntelStatus = {
  state: "not_started" | "in_progress" | "complete";
  eyebrow: string;
  icon: "info" | "clock" | "sparkles";
  title: string;
  body: string;
  confidence?: ConfidenceLevel;
  confidenceBasis?: string;
  link?: { label: string; href: string };
};

// The Intelligence Status panel — tinted per state so it carries its own
// surface weight distinct from the plain white cards: a neutral well before
// research begins, an info tint while collecting, and the gold executive-summary
// treatment once analysis is complete.
function IntelligenceStatusPanel({ intel }: { intel: IntelStatus }) {
  const S = {
    not_started: { bg: "var(--surface-sunken)", border: "var(--border-default)", chipBg: "#E5E8EC", chipInk: "var(--text-tertiary)", eyebrowInk: "var(--text-tertiary)" },
    in_progress: { bg: "#F1F5FB", border: "#D6E2F1", chipBg: "#E1EBF8", chipInk: "#3B5A8A", eyebrowInk: "#3B5A8A" },
    complete:    { bg: "linear-gradient(135deg, #FCF8EF 0%, #FFFFFF 62%)", border: "#E7DCC2", chipBg: "#F2E6C8", chipInk: "#8A6D2F", eyebrowInk: "#8A6D2F" },
  }[intel.state];
  const Ico = Icon[intel.icon];
  const titleBig = intel.state === "complete";
  return (
    <div className="border p-5" style={{ borderRadius: "var(--radius-panel)", background: S.bg, borderColor: S.border }}>
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: S.chipBg, color: S.chipInk }} aria-hidden>
          <Ico size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: S.eyebrowInk }}>{intel.eyebrow}</p>
          <p className={`${titleBig ? "text-base md:text-lg" : "text-sm"} font-bold mt-1 tracking-[-0.01em] leading-snug`} style={{ color: "var(--text-primary)" }}>{intel.title}</p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{intel.body}</p>
          {(intel.confidence || intel.link) && (
            <div className="flex items-center justify-between gap-3 flex-wrap mt-3.5">
              {intel.confidence ? <ConfidenceIndicator level={intel.confidence} basis={intel.confidenceBasis} /> : <span />}
              {intel.link && <Button href={intel.link.href} variant="secondary" size="sm">{intel.link.label}</Button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A single label/value fact in the Project Information grid — the definition-
// list unit that gives every metadata field the same quiet, premium rhythm.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="text-sm mt-1 leading-snug" style={{ color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

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
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "publisher";

  const { project, orgs, campaigns, loading, error, load } = useResearchProject();

  const [toast, setToast] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState<Partial<ResearchProjectBriefFields> | null>(null);

  // Project Information — edit mode for the settings subset (Confidentiality,
  // Version). Owner/Created/Last Updated/Status stay permanently read-only —
  // Status is derived, never a manual field.
  const [editingProjectInfo, setEditingProjectInfo] = useState(false);
  const [draftConfidentiality, setDraftConfidentiality] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);
  const [projectInfoError, setProjectInfoError] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);

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

  // Only the very first load (no project fetched yet) replaces the whole
  // page with this placeholder. A background refresh (e.g. load() called
  // after closing an Intelligence modal) keeps loading true against an
  // already-populated project — gating on loading alone would unmount the
  // entire page in favour of this ~256px placeholder and back again, which
  // collapses the document height and resets scroll to the top even though
  // nothing actually navigated.
  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;

  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's overview."} />
    </PageContainer>
  );

  const projectId = project.id;

  // Captured once (rather than read via `project.X` inside the nested
  // function declarations below) because TypeScript doesn't carry the
  // `project !== null` narrowing from the early-return guard above across
  // a nested function's own scope.
  const p = project;

  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgAgencies = orgs.filter(o => o.type === "agency");
  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const projectStatus = computeProjectStatus(project, hasActiveCampaign);

  const stages = computeLifecycleStages(project);
  const progress = computeResearchProgress(stages);

  // Source-type breakdown for the Overview snapshot — derived from the project's
  // own evidence list, not a second dashboard computation.
  const surveyCount = project.evidence.filter(e => e.evidence_type === "survey").length;
  const searchCount = project.evidence.filter(e => e.evidence_type === "social_search").length;
  const docCount = project.evidence.filter(e => e.evidence_type === "document").length;

  // Intelligence-platform metrics for "Research at a glance" — all read from the
  // project's own totals; no new computation, just intelligence-flavoured names.
  const totalMentions = project.evidence.reduce((sum, e) => sum + (e.conversationSearch?.mention_count ?? 0), 0);
  const marketCount = project.country_codes.length;

  // Analysis is "complete" once source Intelligence is approved/published or the
  // project-level Key Findings are ready — the same signals the lifecycle uses.
  // This flips Overview from a project summary into a genuine Executive Summary.
  const stage = (key: string) => stages.find(s => s.key === key)?.state;
  const analysisComplete = stage("intelligence") === "complete" || project.key_findings_status === "ready";
  const isSimulated = project.research_mode === "simulated";

  // ── Intelligence Status — the first place to read the project's state. Three
  // states, all derived from data already loaded: not started → what's missing;
  // in progress → what's been collected; analysis complete → the headline answer
  // (the published conclusion when it exists is genuinely AI-generated) with a
  // confidence read. No new generation happens here.
  const collectedSummary = [
    `${project.evidence.length} evidence source${project.evidence.length !== 1 ? "s" : ""}`,
    project.total_responses > 0 ? `${project.total_responses.toLocaleString()} responses` : null,
    totalMentions > 0 ? `${totalMentions.toLocaleString()} conversations` : null,
    marketCount > 0 ? `${marketCount} market${marketCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  const intel: {
    state: "not_started" | "in_progress" | "complete";
    eyebrow: string; icon: "info" | "clock" | "sparkles"; title: string; body: string;
    confidence?: ConfidenceLevel; confidenceBasis?: string; link?: { label: string; href: string };
  } =
    project.evidence.length === 0
      ? {
          state: "not_started", eyebrow: "Intelligence status", icon: "info",
          title: "Research not started",
          body: "No evidence has been collected yet. Choose your research methods to begin building an answer to this question.",
        }
      : !analysisComplete
      ? {
          state: "in_progress", eyebrow: "Intelligence status", icon: "clock",
          title: "Research in progress",
          body: `Collecting evidence, ${collectedSummary}. Findings will appear here once analysis is complete.`,
        }
      : {
          state: "complete", eyebrow: "Executive summary", icon: "sparkles",
          title: project.published_conclusion?.answer
            ?? `Key findings are ready across ${project.evidence.length} evidence source${project.evidence.length !== 1 ? "s" : ""}.`,
          body: project.published_conclusion?.rationale
            ?? `Analysis is complete${project.key_findings_count ? ` with ${project.key_findings_count} key finding${project.key_findings_count !== 1 ? "s" : ""}` : ""}. Open Analysis to explore the full intelligence.`,
          confidence: project.evidence.length >= 3 ? "high" : project.evidence.length === 2 ? "medium" : "low",
          confidenceBasis: isSimulated ? "based on simulated research" : `across ${project.evidence.length} source${project.evidence.length !== 1 ? "s" : ""}`,
          link: { label: "View analysis →", href: `/research-projects/${projectId}/analysis` },
        };

  // Horizontal research pipeline — each nav area's completion, in workflow order.
  // A node is done when its underlying signal is met; the first not-done node is
  // the one the project is currently working through.
  const pipelineDone: Record<string, boolean> = {
    overview: !!project.research_question?.trim(),
    research: project.evidence.length > 0,
    execution: project.deployment_count > 0 || project.total_responses > 0,
    dashboard: project.total_responses > 0,
    analysis: analysisComplete,
    outputs: stage("report") === "complete",
    conclusion: stage("conclusion") === "complete",
  };
  const pipelineActiveIndex = PIPELINE_AREAS.findIndex(a => !pipelineDone[a.key]);

  // ── Next Recommended Action — the single most useful thing to do next,
  // derived from where the project actually is in its lifecycle. It walks the
  // same stages the progress bar counts (question → sources → collection →
  // analysis → reports → conclusion) and returns the first incomplete one,
  // pointing to the area that advances it. No backend involved — this reads
  // only state already loaded above. The CTA either navigates to the relevant
  // area or, for the very first step, opens the Research Brief editor in place
  // (defining the question is an Overview action, not another page).
  const nextAction: { title: string; body: string; ctaLabel: string; href?: string; onClick?: () => void; done?: boolean } =
    !project.research_question?.trim()
      ? { title: "Define your research question", body: "Set the question and objective this project will answer. Everything else follows from it.", ctaLabel: "Edit Research Brief", onClick: openEditBrief }
    : project.evidence.length === 0
      ? { title: "Choose your research methods", body: "Select the evidence sources, such as surveys, conversation intelligence or library documents, that will answer your question.", ctaLabel: "Go to Research →", href: `/research-projects/${projectId}/research` }
    : project.total_responses === 0 && project.deployment_count === 0
      ? { title: "Deploy and run your research", body: "Configure and launch your sources to start collecting data.", ctaLabel: "Go to Execution →", href: `/research-projects/${projectId}/execution` }
    : stage("intelligence") !== "complete"
      ? { title: "Analyse your findings", body: "Explore results from every source and capture the key insights emerging from your research.", ctaLabel: "Go to Analysis →", href: `/research-projects/${projectId}/analysis` }
    : stage("report") !== "complete"
      ? { title: "Communicate your findings", body: "Generate the reports and articles that present your research to stakeholders.", ctaLabel: "Go to Reports →", href: `/research-projects/${projectId}/outputs` }
    : stage("conclusion") !== "complete"
      ? { title: "Capture your conclusion", body: "Record the final, evidence-backed answer to your research question.", ctaLabel: "Go to Conclusions →", href: `/research-projects/${projectId}/conclusion` }
    : { title: "This research is complete", body: "Your conclusion is published and retained as knowledge. Review it any time.", ctaLabel: "View Conclusions →", href: `/research-projects/${projectId}/conclusion`, done: true };

  function openEditBrief() {
    setEditingBrief({
      id: p.id, project_id: p.project_id,
      topic: p.topic, research_question: p.research_question, research_subject: p.research_subject,
      brand_org_id: p.brand_org_id, agency_org_id: p.agency_org_id, study_type: p.study_type,
      objective: p.objective, tags: p.tags,
    });
  }

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

  const inputStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" };
  const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
  const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };

  return (
    <>
      <PageContainer gap="xl">

        {/* No page-level header: the persistent project shell above already
            carries the project identity (name + status) and the area nav, so a
            second "Project Overview" title / status / metadata block would just
            re-introduce the page. The project name+status sit directly above;
            everything here leads straight to the research question — the hero. */}

        {/* Permanent — no dismiss, no collapse. See Platform Contract §02/§03. */}
        {project.research_mode === "simulated" && <SimulatedBanner />}

        {/* ── Our Understanding — the commissioning stage (docs/overview-page.md).
            The Overview leads with Fanometrix's reflected understanding of the
            business problem (Intake → Reflect). It supersedes the old research-
            question hero: the proposed research question now lives inside the
            Understanding deliverable. Existing-intelligence, confidence and the
            knowledge frontier land in later slices. */}
        <OverviewUnderstanding />

        {/* ── What we already know — Existing Intelligence (Recall). Renders only
            once "Our Understanding" exists; surfaces grounded, attributed prior
            intelligence tiered into House and Project. (docs/existing-intelligence.md) */}
        <OverviewRecall />

        {/* ── Intelligence Status — the first place to read the state of the
            project. Tinted per state so it never reads as "just another white
            card": neutral well before research starts, gold-tinted once analysis
            is complete (the executive-summary moment). Reflects existing state
            only — no generation happens here. */}
        <IntelligenceStatusPanel intel={intel} />

        {/* ── Next Recommended Action — the "what should I do next?" answer,
            derived from lifecycle state. The one navy moment on the page: the
            single unambiguous prompt into the area that advances the project.
            Read-only Overview — the CTA routes elsewhere or opens the brief. */}
        <div className="overflow-hidden" style={{ borderRadius: "var(--radius-panel)", background: "var(--brand-navy)", boxShadow: "var(--shadow-md)" }}>
          <div className="p-6 md:p-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: "var(--accent-gold)" }}>{nextAction.done ? <Icon.check size={15} strokeWidth={2.5} /> : <Icon.bulb size={15} />}</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-gold)" }}>
                  {nextAction.done ? "Project complete" : "Next recommended action"}
                </span>
              </div>
              <p className="text-lg font-bold text-white tracking-[-0.01em] leading-snug">{nextAction.title}</p>
              <p className="text-sm mt-1.5 leading-relaxed max-w-xl" style={{ color: "rgba(255,255,255,0.62)" }}>{nextAction.body}</p>
            </div>
            {nextAction.href ? (
              <Button href={nextAction.href} variant="primary" size="md" className="self-start sm:self-auto">{nextAction.ctaLabel}</Button>
            ) : (
              canManage && (
                <Button onClick={nextAction.onClick} variant="primary" size="md" className="self-start sm:self-auto">{nextAction.ctaLabel}</Button>
              )
            )}
          </div>
        </div>

        {/* ── Research at a glance — the project's own top-level totals as a KPI
            row, with routes to the full Research and Dashboard areas. Not a
            second dashboard: the cross-source collection view is the Dashboard
            area. Progress is folded in as a target tile. */}
        <section id="snapshot" className="scroll-mt-6">
          <SectionHeading
            title="Research at a glance"
            action={
              <div className="flex items-center gap-2">
                <Button href={`/research-projects/${projectId}/research`} variant="ghost" size="sm">View research</Button>
                <Button href={`/research-projects/${projectId}/dashboard`} variant="secondary" size="sm">Open dashboard →</Button>
              </div>
            }
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            <MetricTile
              label="Sources" value={project.evidence.length} icon="layers"
              breakdown={[
                { label: "Survey", value: surveyCount },
                { label: "Conversation Search", value: searchCount },
                { label: "Documents", value: docCount },
              ]}
            />
            <MetricTile label="Responses" value={project.total_responses.toLocaleString()} icon="survey" />
            <MetricTile label="Conversations" value={totalMentions.toLocaleString()} icon="conversation" />
            <MetricTile label="Documents" value={docCount} icon="document" />
            <MetricTile label="Markets" value={marketCount} icon="globe" />
          </div>
        </section>

        {/* ── Research pipeline — the workflow this project moves through, in the
            exact order of the shell nav (Overview → … → Conclusions). A read-only
            "you are here" pipeline, not a checklist: filled up to the current
            stage. On a sunken surface so it reads as a distinct band, not another
            white card. */}
        <Panel padding="lg">
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-6 lg:gap-8">
            {/* LEFT — title + the pipeline, unchanged. */}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Research progress</h2>

              <ol className="flex items-start mt-6 overflow-x-auto pb-1">
                {PIPELINE_AREAS.map((a, i) => {
                  const done = pipelineDone[a.key];
                  const active = i === pipelineActiveIndex;
                  const prevDone = i > 0 && pipelineDone[PIPELINE_AREAS[i - 1].key];
                  const circle: React.CSSProperties = done
                    ? { background: "#5C8560", color: "#FFFFFF", border: "none" }
                    : active
                    ? { background: "var(--accent-gold)", color: "#FFFFFF", border: "none", boxShadow: "0 0 0 3px rgba(215,184,122,0.28)" }
                    : { background: "var(--surface)", color: "var(--text-tertiary)", border: "1px solid var(--border-default)" };
                  const labelColor = active ? "var(--text-primary)" : done ? "var(--text-secondary)" : "var(--text-tertiary)";
                  return (
                    <li key={a.key} className="relative flex flex-col items-center flex-1 min-w-[74px]">
                      {i > 0 && (
                        <span className="absolute top-[13px] h-0.5" style={{ left: "-50%", right: "50%", background: prevDone ? "#5C8560" : "var(--border-strong)" }} aria-hidden />
                      )}
                      <span className="relative z-10 inline-flex items-center justify-center rounded-full" style={{ width: 28, height: 28, ...circle }}>
                        {done ? <Icon.check size={14} strokeWidth={2.5} />
                          : active ? <span className="w-1.5 h-1.5 rounded-full bg-white fx-pulse" />
                          : <span className="fx-tabular-nums text-[11px] font-bold">{i + 1}</span>}
                      </span>
                      <span className="mt-2.5 text-[11px] font-semibold text-center leading-tight px-1" style={{ color: labelColor }}>{a.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Subtle vertical divider (horizontal when stacked) between the
                pipeline and the completion summary — two related but distinct
                pieces of information. */}
            <div
              className="hidden lg:block w-px self-stretch flex-shrink-0"
              style={{ background: "var(--border-default)" }}
              aria-hidden
            />

            {/* RIGHT — the completion summary as a KPI, vertically centred. */}
            <div
              className="flex flex-col items-center justify-center text-center lg:w-[22%] lg:flex-shrink-0 border-t lg:border-t-0 pt-6 lg:pt-0"
              style={{ borderColor: "var(--border-default)" }}
            >
              <p className="fx-tabular-nums text-4xl md:text-5xl font-bold tracking-[-0.025em] leading-none" style={{ color: "var(--text-primary)" }}>{progress.percent}%</p>
              <p className="text-sm font-medium mt-1.5" style={{ color: "var(--text-secondary)" }}>Complete</p>
              <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>Stage {progress.completed} of {progress.total}</p>
            </div>
          </div>
        </Panel>

        {/* ── Project Information — project-level facts and classification.
            Status is derived (never set manually here); classification is edited
            via the Research Brief. The lifecycle close/archive controls live in
            the quiet footer. */}
        <section id="project-info" className="scroll-mt-6">
          <Card>
            <SectionHeading
              title="Project information"
              action={canManage && !editingProjectInfo
                ? <Button variant="secondary" size="sm" onClick={openProjectInfoEdit}>Edit</Button>
                : undefined}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-4 mt-5">
              <Fact label="Owner">{project.owner_name ?? "—"}</Fact>
              <Fact label="Status"><ProjectStatusBadge status={projectStatus} /></Fact>
              <Fact label="Brand">{orgName(project.brand_org_id) || "—"}</Fact>
              <Fact label="Agency">{orgName(project.agency_org_id) || "—"}</Fact>
              <Fact label="Research type">{studyTypeLabel(project.study_type)}</Fact>
              <Fact label="Research category">{researchSubjectLabel(project.research_subject)}</Fact>
              <Fact label="Created">{formatRelativeTime(project.created_at)}</Fact>
              <Fact label="Last updated">{formatRelativeTime(project.last_response_at ?? project.updated_at)}</Fact>
              <Fact label="Confidentiality">
                {editingProjectInfo ? (
                  <select value={draftConfidentiality ?? ""} onChange={e => setDraftConfidentiality(e.target.value || null)}
                    onFocus={focusGold} onBlur={blurGold}
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors" style={inputStyle}>
                    <option value="">Not set</option>
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                  </select>
                ) : (
                  <span className="capitalize">{project.confidentiality ?? "—"}</span>
                )}
              </Fact>
              <Fact label="Version">
                {editingProjectInfo ? (
                  <input value={draftVersion ?? ""} onChange={e => setDraftVersion(e.target.value || null)}
                    onFocus={focusGold} onBlur={blurGold}
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors" style={inputStyle} placeholder="e.g. v1" />
                ) : (
                  <span>{project.version ?? "—"}</span>
                )}
              </Fact>
            </div>

            {editingProjectInfo && (
              <div className="flex justify-end items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {projectInfoError && <p className="text-xs mr-auto" style={{ color: "#B4694C" }}>{projectInfoError}</p>}
                <Button variant="ghost" size="sm" onClick={() => setEditingProjectInfo(false)}>Cancel</Button>
                <Button variant="brand" size="sm" onClick={handleSaveProjectInfo} disabled={savingProjectInfo}>
                  {savingProjectInfo ? "Saving…" : "Save"}
                </Button>
              </div>
            )}

            {canManage && !editingProjectInfo && (
              <div className="flex gap-4 mt-6 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {projectStatus !== "archived" && (
                  <button
                    onClick={projectStatus === "complete" ? handleReopenResearch : handleCloseResearch}
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {projectStatus === "complete" ? "Reopen research" : "Close research"}
                  </button>
                )}
                <button
                  onClick={projectStatus === "archived" ? handleRestoreProject : handleArchiveProject}
                  className="text-xs font-medium hover:underline"
                  style={{ color: projectStatus === "archived" ? "var(--text-tertiary)" : "#B4694C" }}
                >
                  {projectStatus === "archived" ? "Restore project" : "Archive project"}
                </button>
              </div>
            )}

            {project.research_mode === "simulated" && project.simulation_info && (
              <div className="mt-6">
                <SimulationInformationPanel info={project.simulation_info} />
              </div>
            )}
          </Card>
        </section>

        {/* ── Recent activity — the project's own event log, kept inside the
            project (not the application chrome). Shows ~5 most recent events;
            Expand reveals more inline, View all opens the full Activity log. The
            source of truth is unchanged — project.activity, same data the
            Activity page reads. */}
        <section id="activity" className="scroll-mt-6">
          <Card>
            <SectionHeading
              title="Recent activity"
              action={<Button href={`/research-projects/${projectId}/activity`} variant="ghost" size="sm">View all →</Button>}
            />
            {project.activity.length === 0 ? (
              <p className="text-sm mt-4" style={{ color: "var(--text-tertiary)" }}>No activity yet.</p>
            ) : (
              <>
                <ActivityFeed
                  className="mt-4"
                  items={(activityExpanded ? project.activity.slice(0, 20) : project.activity.slice(0, 5)).map(a => ({
                    action: a.description,
                    timestamp: formatRelativeTime(a.created_at),
                  }))}
                />
                {project.activity.length > 5 && (
                  <button
                    onClick={() => setActivityExpanded(v => !v)}
                    className="mt-3 text-xs font-semibold hover:underline"
                    style={{ color: "var(--accent-ink)" }}
                  >
                    {activityExpanded ? "Show less" : `Show ${Math.min(project.activity.length - 5, 15)} more`}
                  </button>
                )}
              </>
            )}
          </Card>
        </section>

      </PageContainer>

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
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 shadow-lg text-sm font-medium bg-green-600 text-white" style={{ borderRadius: "var(--radius-panel)" }}>
          ✓ {toast}
        </div>
      )}

    </>
  );
}

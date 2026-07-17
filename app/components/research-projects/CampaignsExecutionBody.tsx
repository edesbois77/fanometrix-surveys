"use client";

// The Campaigns page — a survey's operational home, at
// /research-projects/[id]/execution/survey/[surveyEvidenceId]. This is where a
// survey is taken from design into the field: create campaigns, group them,
// deploy them and watch them collect. The workflow reads top-to-bottom —
// Survey → Campaigns → Campaign Groups → Deploy → Collect.
//
// Reuse, not rebuild: state transitions go through the same
// POST /api/campaigns/[id]/actions the standalone page uses (via
// lib/campaign-status); bulk creation reuses the DeploymentWizardModal; preview
// reuses CampaignPreviewModal. Only the card presentation is Execution's own
// (ExecutionCampaignCard) — premium, not a management table.
//
// Create Campaign / Edit open the embedded CampaignEditor page inside the
// workspace (…/campaign/[new|id]) — never the global drawer — and saving
// returns here. Create Multiple is an in-page modal; Attach Existing reassigns
// an existing campaign to this survey. Chromeless: the (workspace) shell provides the
// project header + navigation; this body sets the breadcrumb tail (the survey
// name) via WorkspaceRecordContext.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, Button,
  FilterSelect, Icon,
} from "@/app/components/workspace-ui";
import { ExecutionCampaignCard } from "@/app/components/research-projects/ExecutionCampaignCard";
import { CampaignPreviewModal } from "@/app/components/campaigns/CampaignPreviewModal";
import { AttachExistingCampaignModal } from "@/app/components/campaigns/AttachExistingCampaignModal";
import { useCampaignSelection } from "@/app/components/campaigns/useCampaignSelection";
import { useCampaignBulkActions } from "@/app/components/campaigns/useCampaignBulkActions";
import { BulkEditCampaignsModal } from "@/app/components/research-projects/BulkEditCampaignsModal";
import { DeploymentWizardModal } from "@/app/components/research-projects/workspace-shared";
import { ACTION_LABELS, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import { studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";
import type { Campaign } from "@/app/components/campaigns/types";

const STATUS_ORDER: Record<CampaignStatus, number> = { live: 0, paused: 1, scheduled: 2, draft: 3, closed: 4, archived: 5 };
const STATUS_LIST: CampaignStatus[] = ["live", "paused", "scheduled", "draft", "closed", "archived"];

function duplicateSlug(topic: string, name: string): string {
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${topic}_${name}_copy_${new Date().getFullYear()}_${rnd}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

// Shared duplicate payload — used by single- and bulk-duplicate.
function duplicatePayload(c: Campaign) {
  return {
    campaign_name: `${c.campaign_name} (Copy)`,
    campaign_id: duplicateSlug(c.topic ?? "", c.campaign_name),
    campaign_description: c.campaign_description,
    start_date: null, end_date: null,
    survey_id: c.survey_id, publisher_org_id: c.publisher_org_id, brand_org_id: c.brand_org_id, agency_org_id: c.agency_org_id,
    topic: c.topic, study_type: c.study_type, status: "draft",
    target_responses: c.target_responses, archive_after_days: c.archive_after_days, research_project_id: c.research_project_id,
  };
}

export function CampaignsExecutionBody({ surveyEvidenceId }: { surveyEvidenceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";

  const { projectId, project, campaigns, orgs, loading, error, load } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Operations Toolbar filters + multi-select (bulk-ops framework) ───────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [sortBy, setSortBy] = useState("status");
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = useCampaignSelection();
  const { bulkWorking, handleBulkDelete, handleBulkAction } = useCampaignBulkActions({
    selectedIds, clearSelection, load, showToast, researchProjectId: projectId,
  });
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditWorking, setBulkEditWorking] = useState(false);

  // Apply a set of shared field changes across every selected campaign at once.
  async function handleBulkEdit(patch: Record<string, unknown>) {
    setBulkEditWorking(true);
    const res = await fetch("/api/campaigns/bulk-update", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), patch }),
    });
    const json = await res.json().catch(() => ({}));
    setBulkEditWorking(false);
    if (!res.ok) { showToast(json.error ?? "Couldn't update the campaigns.", false); return; }
    setBulkEditOpen(false);
    clearSelection();
    showToast(`Updated ${json.data?.updated ?? selectedIds.size} campaign${(json.data?.updated ?? 0) === 1 ? "" : "s"}.`);
    load();
  }

  const surveyItem = project?.evidence.find(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } =>
      e.evidence_type === "survey" && e.evidence_id === surveyEvidenceId && !!e.survey
  );

  // Feed the survey name to the breadcrumb tail; clear on unmount.
  useEffect(() => {
    setRecordLabel(surveyItem?.survey.name ?? null);
    return () => setRecordLabel(null);
  }, [surveyItem?.survey.name, setRecordLabel]);

  const thisPath = `/research-projects/${projectId}/execution/survey/${surveyEvidenceId}`;

  // Return journeys from the shared campaign editor (create/edit on /campaigns)
  // land back here with a flag — surface a toast and refresh, then clean the URL.
  const returnHandledRef = useRef(false);
  useEffect(() => {
    const added = searchParams.get("campaignAdded") === "1";
    const returned = searchParams.get("returned") === "1";
    if (!added && !returned) return;
    if (!project || returnHandledRef.current) return;
    returnHandledRef.current = true;
    showToast(added ? "Campaign created." : "Welcome back.");
    router.replace(thisPath);
    load();
  }, [searchParams, project, thisPath, router, load, showToast]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project."} />
    </PageContainer>
  );
  if (!surveyItem) return (
    <PageContainer>
      <ErrorState
        title="Survey not found"
        description="This survey isn't attached to the project, or it may have been removed."
        backHref={`/research-projects/${projectId}/execution/survey`}
        backLabel="Back to Surveys"
      />
    </PageContainer>
  );

  const survey = surveyItem.survey;
  const orgName = (id: string | null) => (id ? orgs.find(o => o.id === id)?.name ?? "" : "");
  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));

  const surveyCampaigns = campaigns.filter(c => c.effective_survey_id === surveyEvidenceId);

  // ── Operations Toolbar: filter option lists (only values actually present) ───
  const orgLabel = (id: string) => orgName(id) || "—";
  const statusOptions = [{ value: "all", label: "All Statuses" }, ...STATUS_LIST.filter(s => surveyCampaigns.some(c => c.effective_status === s)).map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))];
  const publisherOptions = [{ value: "all", label: "All Publishers" }, ...Array.from(new Set(surveyCampaigns.map(c => c.publisher_org_id).filter((v): v is string => !!v))).map(id => ({ value: id, label: orgLabel(id) })).sort((a, b) => a.label.localeCompare(b.label))];
  const countryOptions = [{ value: "all", label: "All Countries" }, ...Array.from(new Set(surveyCampaigns.map(c => c.country_code).filter((v): v is string => !!v))).map(code => ({ value: code, label: countryByCode(code)?.name ?? code }))];
  const typeOptions = [{ value: "all", label: "All Types" }, ...Array.from(new Set(surveyCampaigns.map(c => c.study_type).filter(Boolean))).map(t => ({ value: t, label: studyTypeLabel(t) || t }))];
  const usageOptions = [
    { value: "all", label: "All Usage" },
    { value: "no_responses", label: "No responses" },
    { value: "has_responses", label: "Has responses" },
    { value: "target_reached", label: "Target reached" },
    { value: "end_reached", label: "End date reached" },
  ];
  const sortOptions = [{ value: "status", label: "Status" }, { value: "recent", label: "Recent" }, { value: "responses", label: "Responses" }, { value: "name", label: "Name" }];

  const anyFilterActive = !!search.trim() || statusFilter !== "all" || publisherFilter !== "all" || countryFilter !== "all" || typeFilter !== "all" || usageFilter !== "all";
  function clearFilters() { setSearch(""); setStatusFilter("all"); setPublisherFilter("all"); setCountryFilter("all"); setTypeFilter("all"); setUsageFilter("all"); }

  const q = search.trim().toLowerCase();
  const displayed = surveyCampaigns
    .filter(c => !q || c.campaign_name.toLowerCase().includes(q) || c.campaign_id.toLowerCase().includes(q) || orgName(c.publisher_org_id).toLowerCase().includes(q))
    .filter(c => statusFilter === "all" || c.effective_status === statusFilter)
    .filter(c => publisherFilter === "all" || c.publisher_org_id === publisherFilter)
    .filter(c => countryFilter === "all" || c.country_code === countryFilter)
    .filter(c => typeFilter === "all" || c.study_type === typeFilter)
    .filter(c => {
      if (usageFilter === "no_responses") return c.response_count === 0;
      if (usageFilter === "has_responses") return c.response_count > 0;
      if (usageFilter === "target_reached") { const t = c.effective_target_responses ?? c.target_responses; return t != null && t > 0 && c.response_count >= t; }
      if (usageFilter === "end_reached") { const e = c.effective_end_date ?? c.end_date; return !!e && new Date(e) < new Date(); }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "responses") return b.response_count - a.response_count;
      if (sortBy === "name") return a.campaign_name.localeCompare(b.campaign_name);
      return (STATUS_ORDER[a.effective_status] ?? 9) - (STATUS_ORDER[b.effective_status] ?? 9);
    });

  const displayedIds = displayed.map(c => c.id);
  const allSelected = displayed.length > 0 && displayed.every(c => selectedIds.has(c.id));

  // Operational roll-up for the header summary (the lightweight take on the
  // "survey → campaigns → deployment → collection" pipeline idea).
  const counts = { live: 0, paused: 0, scheduled: 0, draft: 0, closed: 0, archived: 0 } as Record<CampaignStatus, number>;
  for (const c of surveyCampaigns) counts[c.effective_status] = (counts[c.effective_status] ?? 0) + 1;
  const totalResponses = surveyCampaigns.reduce((s, c) => s + c.response_count, 0);
  const summaryParts = [
    `${surveyCampaigns.length} campaign${surveyCampaigns.length === 1 ? "" : "s"}`,
    counts.live > 0 ? `${counts.live} Live` : null,
    counts.paused > 0 ? `${counts.paused} Paused` : null,
    counts.scheduled > 0 ? `${counts.scheduled} Scheduled` : null,
    counts.draft > 0 ? `${counts.draft} Draft` : null,
    `${totalResponses.toLocaleString()} response${totalResponses === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  const headerStatus = counts.live > 0
    ? { label: "Collecting", tone: "success" as const, dot: true }
    : counts.paused > 0
      ? { label: "Paused", tone: "warning" as const, dot: true }
      : surveyCampaigns.length > 0
        ? { label: "Not live", tone: "neutral" as const, dot: true }
        : { label: "Not deployed", tone: "neutral" as const, dot: true };

  async function handleAction(c: Campaign, action: CampaignAction) {
    setActioning(c.id + action);
    const res = await fetch(`/api/campaigns/${c.id}/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    setActioning(null);
    if (!res.ok) { showToast(json.error ?? "Action failed.", false); return; }
    showToast(`Campaign ${ACTION_LABELS[action].toLowerCase()}d.`);
    load();
  }

  async function handleDelete(c: Campaign) {
    const msg = c.response_count > 0
      ? `"${c.campaign_name}" has ${c.response_count.toLocaleString()} response${c.response_count !== 1 ? "s" : ""} collected. The data is preserved, but the campaign moves to deleted items. Continue?`
      : `Move "${c.campaign_name}" to deleted items? It can be restored later.`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(json.error ?? "Could not delete campaign.", false); return; }
    showToast("Campaign deleted.");
    load();
  }

  async function handleDuplicate(c: Campaign) {
    const res = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(duplicatePayload(c)),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(json.error ?? "Failed to duplicate campaign.", false); return; }
    showToast("Campaign duplicated.");
    load();
  }

  // Create stays INSIDE the workspace — the embedded CampaignEditor page, never
  // the global drawer. Saving returns here (see CampaignEditorBody). Edit and
  // the Campaign Dashboard are navigated to by the card itself.
  function handleCreateCampaign() {
    router.push(`${thisPath}/campaign/new`);
  }

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          back={{ href: `/research-projects/${projectId}/execution`, label: "Back to Execution" }}
          title={survey.name}
          description="Create, deploy and monitor this survey's campaigns."
          status={headerStatus}
          meta={<span className="fx-tabular-nums">{summaryParts.join(" · ")}</span>}
          secondaryActions={canManage ? <>
            <Button variant="primary" onClick={handleCreateCampaign}>+ Create Campaign</Button>
            <Button variant="brand" onClick={() => setWizardOpen(true)}>Create Multiple Campaigns</Button>
            <Button variant="secondary" onClick={() => setAttachOpen(true)}>Select Existing</Button>
          </> : undefined}
        />

        {/* ── Campaigns ─────────────────────────────────────────────────────── */}
        {surveyCampaigns.length === 0 ? (
          <EmptyState
            icon="＋"
            title="No campaigns yet"
            description="Create a campaign to deploy this survey to a publisher and market, or create several at once."
            action={canManage ? (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button variant="primary" onClick={handleCreateCampaign}>+ Create Campaign</Button>
                <Button variant="brand" onClick={() => setWizardOpen(true)}>Create Multiple Campaigns</Button>
                <Button variant="secondary" onClick={() => setAttachOpen(true)}>Select Existing</Button>
              </div>
            ) : undefined}
          />
        ) : (
          <div className="space-y-3">
            {/* ── Operations Toolbar — full-width search, then filters on one line ── */}
            <div className="border p-3 space-y-2.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }}><Icon.search size={15} /></span>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search campaigns…"
                  className="w-full text-sm rounded-lg pl-9 pr-3 py-2 outline-none transition-colors"
                  style={{ background: "var(--surface-sunken)", border: "1px solid transparent", color: "var(--text-primary)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-gold)"; e.currentTarget.style.background = "var(--surface)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--surface-sunken)"; }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
                <FilterSelect value={publisherFilter} onChange={setPublisherFilter} options={publisherOptions} />
                <FilterSelect value={countryFilter} onChange={setCountryFilter} options={countryOptions} />
                <FilterSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
                <FilterSelect value={usageFilter} onChange={setUsageFilter} options={usageOptions} />
                <FilterSelect label="Sort By" value={sortBy} onChange={setSortBy} options={sortOptions} />
                {anyFilterActive && (
                  <button onClick={clearFilters} className="ml-auto text-xs font-semibold px-2 py-1 rounded-md transition-colors hover:bg-[var(--surface-sunken)]" style={{ color: "var(--accent-ink)" }}>Clear</button>
                )}
              </div>
            </div>

            {/* ── Bulk actions — legacy lifecycle set, only once selected ────── */}
            {canManage && selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-4 py-2.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--brand-navy)" }}>
                <span className="text-sm font-semibold text-white fx-tabular-nums mr-1">{selectedIds.size} selected</span>
                {([
                  { label: "Publish", action: "publish" },
                  { label: "Go Live Now", action: "go_live" },
                  { label: "Pause", action: "pause" },
                  { label: "Resume", action: "resume" },
                  { label: "Close", action: "close" },
                  { label: "Archive", action: "archive" },
                ] as const).map(b => (
                  <button
                    key={b.action}
                    disabled={bulkWorking}
                    onClick={() => handleBulkAction(b.action, surveyCampaigns)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40"
                  >
                    {b.label}
                  </button>
                ))}
                {user?.role === "admin" && (
                  <button
                    disabled={bulkWorking}
                    onClick={() => setBulkEditOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: "var(--accent-gold)", color: "var(--brand-navy)" }}
                  >
                    Edit
                  </button>
                )}
                <button
                  disabled={bulkWorking}
                  onClick={() => handleBulkDelete(surveyCampaigns)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[#E5A08F] bg-[#B4694C]/20 hover:bg-[#B4694C]/30 transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
                <button onClick={clearSelection} className="ml-auto text-xs font-semibold px-2 py-1 text-white/60 hover:text-white transition-colors">Clear</button>
              </div>
            )}

            {/* ── Select all ────────────────────────────────────────────────── */}
            {canManage && displayed.length > 0 && (
              <label className="inline-flex items-center gap-2 px-1 cursor-pointer text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={allSelected} onChange={() => toggleSelectAll(displayedIds)} className="w-4 h-4" style={{ accentColor: "#0B1929" }} />
                {allSelected ? "Deselect all" : "Select all"}
              </label>
            )}

            {/* ── Cards ─────────────────────────────────────────────────────── */}
            {displayed.length === 0 ? (
              <div className="border px-4 py-8 text-center text-sm" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-subtle)", background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
                No campaigns match your filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayed.map(c => (
                  <ExecutionCampaignCard
                    key={c.id}
                    campaign={c}
                    basePath={thisPath}
                    returnLabel="Campaigns"
                    surveyStatus={survey.status}
                    fixSurveyHref={`/research-projects/${projectId}/research/survey/${surveyEvidenceId}`}
                    orgName={orgName}
                    actioning={actioning}
                    onAction={handleAction}
                    onPreview={setPreviewCampaign}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    selected={canManage ? selectedIds.has(c.id) : undefined}
                    onToggleSelect={canManage ? () => toggleSelect(c.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          Bundle campaigns from any survey behind one publisher embed in{" "}
          <Link href={`/research-projects/${projectId}/execution/campaign-groups`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Campaign Groups</Link>
          {" · "}once live, monitor responses in{" "}
          <Link href={`/research-projects/${projectId}/dashboard`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Dashboard →</Link>
        </p>
      </PageContainer>

      {wizardOpen && (
        <DeploymentWizardModal
          project={project}
          presetSurveyId={surveyEvidenceId}
          orgPublishers={orgPublishers}
          orgName={orgName}
          publishersDisabled={user?.role === "publisher"}
          publishersHelperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
          onClose={() => setWizardOpen(false)}
          onNeedEvidence={() => { setWizardOpen(false); router.push(`/research-projects/${projectId}/research/survey`); }}
          onComplete={result => {
            const parts = [`${result.created.length} created`];
            if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
            if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
            showToast(`Deployments generated: ${parts.join(", ")}.`);
            load();
            if (result.failed.length === 0) setWizardOpen(false);
          }}
        />
      )}

      {previewCampaign && (
        <CampaignPreviewModal campaign={previewCampaign} onClose={() => setPreviewCampaign(null)} />
      )}

      {bulkEditOpen && (
        <BulkEditCampaignsModal
          count={selectedIds.size}
          brandOrgs={orgs.filter(o => o.type === "brand")}
          agencyOrgs={orgs.filter(o => o.type === "agency")}
          publisherOrgs={orgs.filter(o => o.type === "publisher")}
          working={bulkEditWorking}
          onApply={handleBulkEdit}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {attachOpen && (
        <AttachExistingCampaignModal
          projectId={projectId}
          surveyEvidenceId={surveyEvidenceId}
          surveyName={survey.name}
          orgName={orgName}
          onClose={() => setAttachOpen(false)}
          onAttached={(msg, ok) => {
            showToast(msg, ok);
            if (ok) { setAttachOpen(false); load(); }
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}

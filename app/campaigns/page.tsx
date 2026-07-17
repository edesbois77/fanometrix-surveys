"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { CampaignsManager } from "@/app/components/campaigns/CampaignsManager";
import { CampaignEditor } from "@/app/components/campaigns/CampaignEditor";
import type { Campaign } from "@/app/components/campaigns/types";

// Reads the ?createForProject=&surveyId= query params a Research Project's
// "+ Create Campaign" action navigates here with — isolated in its own
// component so only this leaf needs the useSearchParams() Suspense boundary,
// not the whole (otherwise statically-rendered) page.
function CampaignLinkReader({
  onCreateForProject, onEditCampaignId, onReturnTo,
}: {
  onCreateForProject: (projectId: string | null, surveyId: string | null) => void;
  onEditCampaignId: (campaignId: string | null) => void;
  onReturnTo: (projectId: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const createForProject = searchParams.get("createForProject");
  const surveyId = searchParams.get("surveyId");
  const editCampaignId = searchParams.get("editCampaignId");
  const returnTo = searchParams.get("returnTo");
  useEffect(() => { onCreateForProject(createForProject, surveyId); }, [createForProject, surveyId, onCreateForProject]);
  useEffect(() => { onEditCampaignId(editCampaignId); }, [editCampaignId, onEditCampaignId]);
  useEffect(() => { onReturnTo(returnTo); }, [returnTo, onReturnTo]);
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// The platform-wide campaign manager. Every campaign, filters, bulk actions —
// plus create/edit via the shared CampaignEditor mounted in a drawer. The exact
// same editor powers the in-project embedded page (one editor, many entry
// points); this page's only job around it is the drawer chrome and the
// Research-Project return journeys (?createForProject / ?editCampaignId /
// ?returnTo), preserved unchanged.
export default function CampaignsPage() {
  const { user } = useSession();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const isLockedByAdminFor = useCallback((c: Campaign) => c.created_by_admin && !isAdmin, [isAdmin]);

  // Data
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState<Campaign[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // Drawer — the campaign being edited (null = create) + create-for-project preset.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCampaign, setDrawerCampaign] = useState<Campaign | null>(null);
  const [autoLinkActive, setAutoLinkActive] = useState(false);

  // ── Research Project deep-links ─────────────────────────────────────────────
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [linkedSurveyId, setLinkedSurveyId] = useState<string | null>(null);
  const [linkedProjectResearchMode, setLinkedProjectResearchMode] = useState<"real" | "simulated">("real");
  const autoOpenedRef = useRef(false);

  // "+ Create Campaign" from a project pre-fills the editor from that project
  // (the editor itself seeds topic/type/brand/agency); here we only capture the
  // research mode for the fallback return and open the drawer in create mode.
  useEffect(() => {
    if (!linkedProjectId || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    (async () => {
      const res = await fetch(`/api/research-projects/${linkedProjectId}`);
      if (res.ok) {
        const { data: proj } = await res.json();
        setLinkedProjectResearchMode(proj.research_mode === "simulated" ? "simulated" : "real");
      }
      setDrawerCampaign(null);
      setAutoLinkActive(true);
      setDrawerOpen(true);
    })();
  }, [linkedProjectId]);

  // "Edit" deep-link (?editCampaignId=) opens the same drawer once the campaign
  // is available (simulated campaigns aren't in the default list, so fall back
  // to fetching that one by id).
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const autoEditCampaignRef = useRef(false);
  useEffect(() => {
    if (!editCampaignId || autoEditCampaignRef.current) return;
    const found = campaigns.find(c => c.id === editCampaignId);
    if (found) { autoEditCampaignRef.current = true; openEdit(found); return; }
    if (loading) return;
    autoEditCampaignRef.current = true;
    fetch(`/api/campaigns/${editCampaignId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => { if (json?.data) openEdit(json.data); else autoEditCampaignRef.current = false; })
      .catch(() => { autoEditCampaignRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCampaignId, campaigns, loading]);

  // A campaign opened from a Research Project returns there on close *or* save.
  // returnTo may be a bare project id (legacy — returns to the project root,
  // which forwards the flag) OR a full workspace path (e.g. the Execution
  // Campaigns page), returned to directly.
  const [returnToProjectId, setReturnToProjectId] = useState<string | null>(null);
  const pushReturn = useCallback((flag: "returned" | "campaignAdded") => {
    if (!returnToProjectId) return false;
    const v = returnToProjectId;
    const url = v.startsWith("/") ? `${v}${v.includes("?") ? "&" : "?"}${flag}=1` : `/research-projects/${v}?${flag}=1`;
    router.push(url);
    return true;
  }, [returnToProjectId, router]);

  function closeDrawer() {
    if (pushReturn("returned")) return;
    setDrawerOpen(false);
  }

  function openCreate() {
    setDrawerCampaign(null);
    setAutoLinkActive(false);
    setDrawerOpen(true);
  }
  function openEdit(c: Campaign) {
    setDrawerCampaign(c);
    setAutoLinkActive(false);
    setDrawerOpen(true);
  }

  function handleSaved({ created }: { created: boolean }) {
    // Create-for-project (auto-linked): return to where it launched.
    if (autoLinkActive && linkedProjectId) {
      if (pushReturn("campaignAdded")) return;
      const workspaceHref = linkedProjectResearchMode === "simulated"
        ? `/product-walkthrough/${linkedProjectId}`
        : `/research-projects/${linkedProjectId}`;
      router.push(`${workspaceHref}?campaignAdded=1`);
      return;
    }
    // Opened from a Research Project (Edit) — return there.
    if (pushReturn("returned")) return;
    setDrawerOpen(false);
    showToast(created ? "Campaign created." : "Campaign updated.");
    load();
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [camRes, orgRes] = await Promise.all([fetch("/api/campaigns"), fetch("/api/organisations")]);
    setCampaigns((await camRes.json()).data ?? []);
    setOrgs((await orgRes.json()).data ?? []);
    setLoading(false);
  }, []);

  const loadDeleted = useCallback(async () => {
    setLoadingDeleted(true);
    const res = await fetch("/api/campaigns?view=deleted");
    setDeletedCampaigns((await res.json()).data ?? []);
    setLoadingDeleted(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onLoadDeletedRequested = useCallback(() => {
    if (deletedCampaigns.length === 0 && !loadingDeleted) loadDeleted();
  }, [deletedCampaigns.length, loadingDeleted, loadDeleted]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CampaignLinkReader
          onCreateForProject={(projectId, surveyId) => { setLinkedProjectId(projectId); setLinkedSurveyId(surveyId); }}
          onEditCampaignId={setEditCampaignId}
          onReturnTo={setReturnToProjectId}
        />
      </Suspense>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
              <p className="text-sm text-gray-400 mt-0.5">Every campaign across every research project.</p>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <button onClick={openCreate} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: "#D7B87A", color: "#0B1929" }}>
                + Create Campaign
              </button>
            </div>
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Each campaign connects a survey to a publisher, placement and date range.
                Campaign status determines whether responses are accepted.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: "#D7B87A" }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">Campaign lifecycle</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Draft</strong>: being set up, not yet deployed</li>
                  <li><strong>Scheduled</strong>: ready to go, waiting for its start date</li>
                  <li><strong>Live</strong>: actively collecting responses</li>
                  <li><strong>Paused</strong>: temporarily stopped, can be resumed</li>
                  <li><strong>Closed</strong>: permanently finished</li>
                  <li><strong>Archived</strong>: hidden from the default view, kept as a historical record</li>
                </ul>
                <p className="mt-1 text-gray-500">Fanometrix automatically moves a campaign from Scheduled to Live on its start date, and from Live to Closed when the end date passes or the target response count is reached.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">What you can do with a campaign</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Publish</strong>: from Draft, sets it to Scheduled and waiting for the start date</li>
                  <li><strong>Go live now</strong>: from Draft or Scheduled, makes it Live immediately</li>
                  <li><strong>Pause</strong>: from Live or Scheduled, temporarily stops it collecting responses</li>
                  <li><strong>Resume</strong>: from Paused, starts collecting responses again</li>
                  <li><strong>Close</strong>: from Live or Paused, ends it permanently</li>
                  <li><strong>Archive</strong>: from Closed, moves it out of the main list</li>
                  <li><strong>Duplicate</strong>: available any time, creates a Draft copy with dates cleared and responses reset to zero</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Deleting a campaign</p>
                <p>Campaigns can only be deleted while they&apos;re Draft or Scheduled and have zero responses. Once a campaign has any responses it can never be hard deleted, archive it instead. This keeps reporting and historical records intact.</p>
              </div>
              <a href="/fanometrix-guide" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#0B1929" }}>
                Read the full Fanometrix Guide
                <span className="text-[10px] opacity-60">↗</span>
              </a>
            </div>
          </details>
        </div>

        <CampaignsManager
          campaigns={campaigns}
          deletedCampaigns={deletedCampaigns}
          orgs={orgs}
          loading={loading}
          loadingDeleted={loadingDeleted}
          isLockedByAdminFor={isLockedByAdminFor}
          onLoadDeletedRequested={onLoadDeletedRequested}
          onReload={load}
          onEditCampaign={openEdit}
          showExportButton
        />
      </div>

      {/* ── Create / Edit Drawer — the shared CampaignEditor ───────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{drawerCampaign ? "Edit Campaign" : "Create Campaign"}</h2>
              <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <CampaignEditor
              campaign={drawerCampaign}
              presetProjectId={autoLinkActive ? linkedProjectId : null}
              presetSurveyId={autoLinkActive ? linkedSurveyId : null}
              presetResearchMode={linkedProjectResearchMode}
              variant="drawer"
              onCancel={closeDrawer}
              onSaved={handleSaved}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

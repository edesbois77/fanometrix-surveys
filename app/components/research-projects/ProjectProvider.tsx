"use client";

// The Research Project Workspace's shared data layer — extracted from
// WorkspaceBody.tsx with no behavioural change. It owns the server data
// every Workspace section reads (the project itself plus its organisations,
// campaigns, campaign groups and deleted campaigns), the loading/error
// state around fetching it, and the two lifecycle effects that keep that
// data current: the initial load and the "Run Research" polling loop.
//
// WorkspaceBody (and, going forward, any sibling that renders part of the
// same project) reads all of this through `useResearchProject()` rather
// than each owning its own copy — one fetch, one source of truth. UI state
// (modals, drafts, toasts, expand/collapse) and data mutations remain with
// the components that render them; this provider is deliberately read +
// reload only.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Campaign } from "@/app/components/campaigns/types";
import type { CampaignGroupSummary } from "@/app/components/research-projects/CampaignGroupsSection";
import type { SimulationInfo } from "@/app/components/simulation/SimulationInformationPanel";
import type { LangCode } from "@/lib/survey-locale";

export type ActivityRow = { id: string; event_type: string; description: string; actor: string | null; created_at: string };

export type ConversationSearchEvidence = {
  id: string; name: string; status: string; entity_type: string; research_goal: string;
  // Evidence Validation review lifecycle (docs/evidence-validation-blueprint.md).
  review_status: "draft" | "collecting" | "pending_approval" | "approved" | "archived";
  approved_at: string | null; approved_watermark: string | null;
  research_question: string; languages: string[];
  relevance_threshold: number;   // 0–100; conversations below this are hidden by default
  keywords: string[]; markets: string[]; platforms: string[];
  // Generic collection engine (latest snapshot from collection_runs).
  connectors: string[];
  latest_run_status: "running" | "completed" | "partial" | "failed" | null;
  last_collected_at: string | null;
  run_count: number;
  new_count: number;                 // conversations the most recent run added to the base
  video_count: number; comment_count: number;
  by_kind: Record<string, number>;   // generic per-content-kind counts (video/comment/article/…)
  mention_count: number;             // cumulative unique conversations in the base
  positive_pct: number; neutral_pct: number; negative_pct: number;
  summary_status: "draft" | "edited" | "approved" | "published" | null;
  generated_at: string | null;
};

export type EvidenceItem = {
  id: string;
  evidence_type: "survey" | "social_search" | "document";
  evidence_id: string;
  added_at: string;
  survey: {
    id: string; name: string; status: string;
    question_count: number; completed_languages: LangCode[];
    brand_name: string | null; agency_name: string | null; created_at: string;
    response_count: number;
    summary_status: "draft" | "edited" | "approved" | "published" | null;
    generated_at: string | null;
    target_responses: number | null;
    creative_design: string | null;
    target_reached_action: string | null;
  } | null;
  conversationSearch: ConversationSearchEvidence | null;
  // Document Intelligence's summary_status is keyed by this evidence row's
  // own id (migration 102), never evidence_id — see the GET route's own
  // comment on why that differs from survey/conversationSearch above.
  document: {
    id: string; name: string; author: string | null; document_type: string;
    /** library_documents.status (uploaded/extracting/.../approved) — the
     * Research Library's own review state, distinct from summary_status
     * below (Document Intelligence's own draft/edited/approved workflow
     * for THIS project's interpretation of the document). */
    library_status: string;
    page_count: number | null;
    uploaded_at: string;
    tags: string[];
    summary_status: "draft" | "edited" | "approved" | "published" | null;
    generated_at: string | null;
  } | null;
  // "Run Research" per-source state (migration 095) — "not_started" means
  // no evidence_simulations row exists yet for this evidence row. Documents
  // never have a real run (never simulated content), so this is always
  // "not_started" for document evidence and simply unused there.
  run_status: "not_started" | "generating" | "ready" | "failed";
  run_error: string | null;
};

export type ResearchProject = {
  id: string;
  project_id: string;
  project_name: string;
  research_mode: "real" | "simulated";
  simulation_info: SimulationInfo | null;
  research_question: string | null;
  objective: string | null;
  research_subject: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  study_type: string;
  topic: string | null;
  tags: string[];
  description: string | null;
  status: string;
  survey_id: string | null;
  publisher_org_ids: string[];
  country_codes: string[];
  target_responses: number | null;
  target_reached_action: "none" | "pause" | "close" | null;
  target_reached_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  start_date: string | null;
  end_date: string | null;
  archive_after_days: number | null;
  creative_design: string | null;
  confidentiality: string | null;
  version: string | null;
  created_at: string;
  updated_at: string;
  deployment_count: number;
  total_responses: number;
  completion_pct: number | null;
  last_response_at: string | null;
  owner_name: string | null;
  survey_intelligence_status: "draft" | "edited" | "approved" | "published" | null;
  report_status: "draft" | "edited" | "approved" | "published" | null;
  report_stale: boolean;
  key_findings_status: "ready" | null;
  key_findings_count: number | null;
  conclusion_status: "draft" | "edited" | "approved" | "published" | null;
  article_status: "draft" | "edited" | "approved" | "published" | null;
  full_research_report_status: "draft" | "edited" | "approved" | "published" | null;
  published_conclusion: Conclusion | null;
  activity: ActivityRow[];
  evidence: EvidenceItem[];
  survey: Survey | null;
};

export type Conclusion = {
  answer: string;
  rationale: string;
  research_question: string;
  generated_at: string;
  research_mode: "real" | "simulated";
  synthetic_notice: string | null;
};

export type Survey = {
  id: string;
  name: string;
  status: string;
  response_count: number;
  completed_languages: LangCode[];
};

export type Org = { id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" };

type ResearchProjectContextValue = {
  // The route param this Workspace was opened with — the id every fetch
  // below is keyed by. Note this is distinct from `project.id`: callers that
  // mutate a loaded project still address it by `project.id`, exactly as
  // they did before this extraction.
  projectId: string;
  project: ResearchProject | null;
  orgs: Org[];
  campaigns: Campaign[];
  campaignGroups: CampaignGroupSummary[];
  deletedCampaigns: Campaign[];
  loadingDeletedCampaigns: boolean;
  loading: boolean;
  error: string;
  load: () => Promise<void>;
  loadDeletedCampaigns: () => Promise<void>;
};

const ResearchProjectContext = createContext<ResearchProjectContextValue | null>(null);

export function useResearchProject(): ResearchProjectContextValue {
  const ctx = useContext(ResearchProjectContext);
  if (!ctx) throw new Error("useResearchProject must be used within a ProjectProvider");
  return ctx;
}

export function ProjectProvider({ projectId: id, children }: { projectId: string; children: ReactNode }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignGroups, setCampaignGroups] = useState<CampaignGroupSummary[]>([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState<Campaign[]>([]);
  const [loadingDeletedCampaigns, setLoadingDeletedCampaigns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [pRes, oRes, cRes, gRes] = await Promise.all([
      fetch(`/api/research-projects/${id}`),
      fetch("/api/organisations"),
      fetch(`/api/campaigns?research_project_id=${id}`),
      fetch(`/api/campaign-groups?research_project_id=${id}`),
    ]);
    if (!pRes.ok) { setError("Research project not found."); setLoading(false); return; }
    const [pJson, oJson, cJson, gJson] = await Promise.all([pRes.json(), oRes.json(), cRes.json(), gRes.json()]);
    setProject(pJson.data);
    setOrgs(oJson.data ?? []);
    setCampaigns(cJson.data ?? []);
    setCampaignGroups(gJson.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // "Run Research" (migration 095) is a single synchronous request/
  // response — but a page refresh mid-request orphans that response, so
  // this is what actually recovers correct state afterward: poll while any
  // attached source is still "generating" (mirrors the exact 4s interval
  // app/product-walkthrough/page.tsx's gallery already polls with), until
  // none remain. Never trusts a local "I started this" flag alone.
  useEffect(() => {
    const anyGenerating = (project?.evidence ?? []).some(e => e.run_status === "generating");
    if (!anyGenerating) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [project, load]);

  const loadDeletedCampaigns = useCallback(async () => {
    if (deletedCampaigns.length > 0 || loadingDeletedCampaigns) return;
    setLoadingDeletedCampaigns(true);
    const res = await fetch(`/api/campaigns?research_project_id=${id}&view=deleted`);
    setDeletedCampaigns((await res.json()).data ?? []);
    setLoadingDeletedCampaigns(false);
  }, [id, deletedCampaigns.length, loadingDeletedCampaigns]);

  const value: ResearchProjectContextValue = {
    projectId: id, project, orgs, campaigns, campaignGroups, deletedCampaigns,
    loadingDeletedCampaigns, loading, error, load, loadDeletedCampaigns,
  };

  return <ResearchProjectContext.Provider value={value}>{children}</ResearchProjectContext.Provider>;
}

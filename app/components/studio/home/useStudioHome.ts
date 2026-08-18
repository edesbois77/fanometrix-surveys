"use client";

// ── Survey Studio Home data ──────────────────────────────────────────────────
// Assembles the adaptive Home's view model from EXISTING read-only, org-scoped
// endpoints — the same ones the product already exposes — plus one additive
// read-only intelligence feed (/api/survey-studio/home). Nothing is mutated and
// nothing is manufactured: where a section has no genuine data it stays empty,
// and the Home omits it entirely.
//
// ORGANISATIONS INHERITANCE: the Current Organisation is the platform-owned
// session context. Every endpoint here resolves server-side for that Current
// Organisation, so switching organisation (which reloads the page) re-resolves
// all of Home. We additionally re-run when the resolved currentOrganisationId
// changes, so the Home is correct even if a future switch stops reloading.
//
// Role-aware fetching so we never fire a request a role can't make:
//   • admin / publisher — surveys + campaigns + research projects + intelligence.
//   • brand / agency     — research projects + intelligence only (no /api/surveys
//                          or /api/campaigns access; those would 403).
//
// Preview harness: ?preview=<state> returns representative SAMPLE data instead of
// fetching, so every adaptive state is reviewable before real data exists in
// each shape. See ./fixtures.

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth";
import { useSession } from "@/app/components/SessionProvider";
import type {
  StudioHomeData, CtaMode, ProjectCard, FindingCard, ReportItem, ActivityItem, AttentionItem, PerformanceRow,
} from "./types";
import { REPORT_LABELS } from "./types";
import { previewData, isPreviewState } from "./fixtures";
import type { HomeFinding, HomeReport } from "@/app/api/survey-studio/home/route";

type Row = Record<string, unknown>;

export type { ProjectCard, FindingCard, ReportItem, ActivityItem, AttentionItem, PerformanceRow, StudioHomeData };

const ACTIVE_STATUSES = new Set(["live", "scheduled", "paused"]);
const DISCOVER_RESEARCH = "/survey-studio/discover";

async function getJson(url: string): Promise<Row[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as Row[];
  } catch {
    return [];
  }
}

async function getIntelligence(): Promise<{ intelligence: HomeFinding[]; reports: HomeReport[] }> {
  try {
    const res = await fetch("/api/survey-studio/home");
    if (!res.ok) return { intelligence: [], reports: [] };
    const json = await res.json();
    return { intelligence: json.intelligence ?? [], reports: json.reports ?? [] };
  } catch {
    return { intelligence: [], reports: [] };
  }
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toProjectCard(p: Row): ProjectCard {
  const id = str(p.id);
  return {
    id,
    name: str(p.project_name) || str(p.topic) || "Untitled research",
    status: str(p.status) || "draft",
    totalResponses: num(p.total_responses),
    target: p.target_responses == null ? null : num(p.target_responses),
    completionPct: p.completion_pct == null ? null : num(p.completion_pct),
    publisherCount: num(p.publisher_count),
    countryCount: num(p.country_count),
    lastResponseAt: p.last_response_at == null ? null : str(p.last_response_at),
    href: `/research-projects/${id}`,
    discoverHref: `${DISCOVER_RESEARCH}?project=${id}`,
  };
}

function ctaModeFor(role: UserRole | null | undefined, as: string | null | undefined): CtaMode {
  if (as === "create" || as === "request") return as;
  return role === "admin" || role === "publisher" ? "create" : "request";
}

const EMPTY: StudioHomeData = {
  loading: true, hasActivity: false, ctaMode: "request",
  attention: [], liveResearch: [], performance: [],
  intelligence: [], research: [], reports: [], activity: [], preview: null,
};

export function useStudioHome(
  role: UserRole | null | undefined,
  opts?: { preview?: string | null; as?: string | null },
): StudioHomeData {
  const { organisationContext } = useSession();
  const orgId = organisationContext.currentOrganisationId;
  const preview = opts?.preview ?? null;
  const as = opts?.as ?? null;
  const [state, setState] = useState<StudioHomeData>(EMPTY);

  const load = useCallback(async () => {
    const ctaMode = ctaModeFor(role, as);

    // ── Preview harness — SAMPLE data, no fetching. ──────────────────────────
    if (isPreviewState(preview)) {
      setState(previewData(preview, ctaMode));
      return;
    }

    if (!role) return;
    const canSurveys = role === "admin" || role === "publisher";

    const [surveys, campaigns, projects, intel] = await Promise.all([
      canSurveys ? getJson("/api/surveys") : Promise.resolve([]),
      canSurveys ? getJson("/api/campaigns") : Promise.resolve([]),
      getJson("/api/research-projects?research_mode=real"),
      getIntelligence(),
    ]);

    const projectCards = projects.map(toProjectCard);
    const byRecency = (a: ProjectCard, b: ProjectCard) => (b.lastResponseAt ?? "").localeCompare(a.lastResponseAt ?? "");
    const responsesById = new Map(projectCards.map((p) => [p.id, p.totalResponses]));

    // ── Live Research — active, in-flight studies (operational). ─────────────
    const liveResearch = projectCards
      .filter((p) => ACTIVE_STATUSES.has(p.status))
      .sort(byRecency)
      .slice(0, 6);
    const liveIds = new Set(liveResearch.map((p) => p.id));

    // ── Your Research — everything else the org can access (editorial). ──────
    const research = projectCards
      .filter((p) => !liveIds.has(p.id))
      .sort(byRecency)
      .slice(0, 6);

    // ── Performance — meaningful LIVE performance, related to live research. ──
    const livePerf: PerformanceRow[] = liveResearch
      .filter((p) => p.totalResponses > 0)
      .map((p) => ({ name: p.name, value: p.totalResponses, live: true }));
    const contextPerf: PerformanceRow[] = projectCards
      .filter((p) => !liveIds.has(p.id) && p.totalResponses > 0)
      .sort((a, b) => b.totalResponses - a.totalResponses)
      .map((p) => ({ name: p.name, value: p.totalResponses, live: false }));
    // Only a section when there is genuine LIVE performance to relate.
    const performance: PerformanceRow[] = livePerf.length > 0
      ? [...livePerf, ...contextPerf].slice(0, 5)
      : [];

    // ── Latest Intelligence — approved published findings (org-scoped). ──────
    const intelligence: FindingCard[] = intel.intelligence.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      projectName: f.projectName,
      aspect: f.aspect,
      need: f.need,
      headline: f.headline,
      detail: f.detail,
      confidence: f.confidence,
      evidenceStrength: f.evidenceStrength,
      base: responsesById.get(f.projectId) ?? null,
      href: `${DISCOVER_RESEARCH}?project=${f.projectId}&finding=${f.id}`,
    }));

    // ── Recent Reports — recently published, accessible reports. ─────────────
    const reports: ReportItem[] = intel.reports.map((r) => ({
      id: r.id,
      projectName: r.projectName,
      label: REPORT_LABELS[r.outputType] ?? "Report",
      at: r.at,
      href: `${DISCOVER_RESEARCH}?project=${r.projectId}&report=${r.id}`,
    }));

    // ── Recent Activity — real creation events, newest first, latest 5. ──────
    const activity: ActivityItem[] = [
      ...projects.map((p) => ({
        key: `project-${str(p.id)}`, kind: "project" as const, label: "Research project created",
        title: str(p.project_name) || "Untitled research", at: str(p.created_at) || null,
        href: `/research-projects/${str(p.id)}`,
      })),
      ...surveys.map((s) => ({
        key: `survey-${str(s.id)}`, kind: "survey" as const, label: "Survey created",
        title: str(s.name) || "Untitled survey", at: str(s.created_at) || null,
        href: "/survey-templates",
      })),
      ...campaigns.map((c) => ({
        key: `campaign-${str(c.id) || str(c.campaign_id)}`, kind: "campaign" as const, label: "Campaign created",
        title: str(c.name) || str(c.campaign_id) || "Untitled campaign", at: str(c.created_at) || null,
        href: "/campaigns",
      })),
    ]
      .filter((a) => a.at)
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
      .slice(0, 5);

    // ── Needs Attention — only genuinely actionable items. ───────────────────
    const attention: AttentionItem[] = [];
    if (canSurveys) {
      const drafts = surveys.filter((s) => str(s.status) === "draft").length;
      if (drafts > 0) {
        attention.push({
          key: "draft-surveys",
          title: `${drafts} survey${drafts === 1 ? "" : "s"} in draft`,
          detail: "Finish and mark them ready to deploy.",
          href: "/survey-templates",
          action: drafts === 1 ? "Continue draft" : "Continue drafts",
        });
      }
    }
    const waiting = liveResearch.filter((p) => p.totalResponses === 0 && p.status !== "scheduled");
    if (waiting.length > 0) {
      // One study → open its operational workspace directly; several → the list.
      const single = waiting.length === 1 ? waiting[0] : null;
      attention.push({
        key: "awaiting-responses",
        title: single
          ? `${single.name} is live but has no responses yet`
          : `${waiting.length} active studies awaiting responses`,
        detail: "Live, but no responses collected yet — check deployment.",
        href: single ? single.href : "/research-projects",
        action: single ? "Open workspace" : "Review studies",
      });
    }

    const hasActivity =
      surveys.length > 0 || campaigns.length > 0 || projectCards.length > 0 ||
      intelligence.length > 0 || reports.length > 0;

    setState({
      loading: false, hasActivity, ctaMode,
      attention, liveResearch, performance, intelligence, research, reports, activity, preview: null,
    });
    // orgId is an intentional dependency: it re-resolves Home when the platform
    // Current Organisation changes, even though the fetches read it server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, as, preview, orgId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  return state;
}

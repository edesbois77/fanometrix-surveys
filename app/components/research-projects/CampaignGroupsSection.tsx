"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionCard, InfoContent, CollapsedSummary } from "@/app/components/research-projects/Shell";
import type { Campaign } from "@/app/components/campaigns/types";
import { PrimaryButton, SecondaryButton, StatusBadge, type BadgeTone } from "@/app/components/research-projects/ActionPrimitives";

export type CampaignGroupSummary = {
  id: string;
  name: string;
  status: "draft" | "live" | "paused" | "closed" | "archived";
  rotation: "equal" | "weighted" | "priority";
  member_count: number;
  survey_count: number;
  campaign_ids: string[];
};

// Shared by both the group's own status pill and each member campaign's
// effective_status pill — same lifecycle-state vocabulary either way.
const STATUS_TONE: Record<string, BadgeTone> = {
  draft:    "warning",
  live:     "success",
  paused:   "warning",
  closed:   "neutral",
  archived: "neutral",
};

const ROTATION_LABELS: Record<string, string> = {
  equal: "Equal", weighted: "Weighted", priority: "Priority",
};

// Deliberately read-only and project-level, never nested inside an
// individual Survey card — a Campaign Group can span campaigns from
// several of this project's Surveys (migration 096), so it belongs at the
// project level, with the standalone /campaign-groups page staying the
// one place membership, rotation, and the embed code are actually managed.
// Expanding a row here shows its members for context only — no editing
// controls, no Campaign Manager — same "look, don't touch" boundary as
// the rest of this section.
//
// returnTo is this Workspace's own URL (/research-projects/[id] or
// /product-walkthrough/[id]) — carried through every outbound link so the
// standalone page's Save/Cancel can send the admin back here instead of
// stranding them there.
export function CampaignGroupsSection({ projectId, groups, canManage, returnTo, campaigns, orgs, surveyNameById }: {
  projectId: string;
  groups: CampaignGroupSummary[];
  canManage: boolean;
  returnTo: string;
  // This project's own campaigns (already loaded for Research Sources /
  // the embedded Campaigns manager) — reused here purely for read-only
  // lookup, never refetched, so expanding a row costs nothing extra.
  campaigns: Campaign[];
  orgs: { id: string; name: string }[];
  // Survey name by evidence_id — covers campaigns whose own survey_id is
  // null and which inherit the project's legacy single survey pointer
  // instead (see campaign.effective_survey_id); campaigns.surveys?.name
  // alone would show blank for those.
  surveyNameById: Map<string, string>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const orgById = new Map(orgs.map(o => [o.id, o.name]));
  const orgName = (id: string | null) => (id ? orgById.get(id) ?? "—" : "—");
  const campaignById = new Map(campaigns.map(c => [c.id, c]));
  function surveyName(c: Campaign): string {
    return c.surveys?.name || (c.effective_survey_id ? surveyNameById.get(c.effective_survey_id) : undefined) || "—";
  }

  const qs = `project=${projectId}&returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <SectionCard
      id="campaign-groups"
      title="Campaign Groups"
      info={
        <InfoContent title="How Campaign Groups work">
          <p>Campaign Groups let you combine multiple Survey Campaigns behind a single embed code. Each campaign can use a different Survey, allowing Fanometrix to rotate different research questions through the same publisher placement.</p>
          <p className="mt-1.5">For example: one Campaign Group could rotate three campaigns, one measuring brand awareness, one exploring fan behaviour and one testing sponsorship sentiment, each using a different Survey.</p>
          <p className="mt-1.5">The publisher implements the embed code once. Fanometrix then controls which eligible campaign is shown, without requiring the publisher to update the code.</p>
          <p className="mt-1.5">Manage campaign membership, rotation and the embed code from the Campaign Groups page.</p>
        </InfoContent>
      }
      summary={
        <CollapsedSummary groups={[{ parts: [
          groups.length === 0 ? "No Campaign Groups yet" : `${groups.length} Campaign Group${groups.length !== 1 ? "s" : ""}`,
        ] }]} />
      }
      cta={canManage && (
        <PrimaryButton href={`/campaign-groups?${qs}&create=1`}>+ New Campaign Group</PrimaryButton>
      )}
    >
      {groups.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-gray-500">No Campaign Groups yet for this project.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {groups.map(g => {
              const expanded = expandedIds.has(g.id);
              const members = g.campaign_ids.map(id => campaignById.get(id) ?? null);
              return (
                <div key={g.id} className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                        <span>{ROTATION_LABELS[g.rotation]} rotation</span>
                        <span>{g.member_count} campaign{g.member_count !== 1 ? "s" : ""}</span>
                        <span>{g.survey_count} survey{g.survey_count !== 1 ? "s" : ""} represented</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <SecondaryButton compact onClick={() => toggle(g.id)} title={expanded ? "Collapse" : "Expand"}>
                        {expanded ? "▾ Collapse" : "▸ Expand"}
                      </SecondaryButton>
                      <div className="flex items-center gap-2">
                        <StatusBadge label={g.status.charAt(0).toUpperCase() + g.status.slice(1)} tone={STATUS_TONE[g.status] ?? "neutral"} />
                        {canManage && (
                          <SecondaryButton href={`/campaign-groups?${qs}&edit=${g.id}`}>Edit</SecondaryButton>
                        )}
                        <SecondaryButton href={`/campaign-groups?${qs}&search=${encodeURIComponent(g.name)}`} title="View this group's embed code">
                          Get Tags
                        </SecondaryButton>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-200 space-y-1.5">
                      {members.length === 0 ? (
                        <p className="text-xs text-gray-400">No campaigns in this group yet.</p>
                      ) : members.map((c, i) => (
                        <div key={c?.id ?? i} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-b-0">
                          {g.rotation === "priority" && (
                            <span className="text-[10px] font-semibold text-gray-400 w-4 flex-shrink-0 text-right pt-0.5">{i + 1}</span>
                          )}
                          {c ? (
                            <div className="min-w-0 flex-1">
                              <Link href={`/campaigns/${c.id}`}
                                className="text-xs font-semibold text-gray-800 hover:text-[#0B1929] hover:underline">
                                {c.campaign_name} →
                              </Link>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Survey:{" "}
                                {c.effective_survey_id ? (
                                  <Link href={`/survey-templates?openSurvey=${c.effective_survey_id}&returnTo=${projectId}`}
                                    className="text-gray-600 hover:text-[#0B1929] hover:underline">
                                    {surveyName(c)}
                                  </Link>
                                ) : (
                                  <span>{surveyName(c)}</span>
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 mt-1">
                                <span>{orgName(c.publisher_org_id)}</span>
                                <span>·</span>
                                <span>{c.market || c.country_code || "—"}</span>
                                <span>·</span>
                                <StatusBadge
                                  label={c.effective_status.charAt(0).toUpperCase() + c.effective_status.slice(1)}
                                  tone={STATUS_TONE[c.effective_status] ?? "neutral"}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Campaign details unavailable</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

"use client";

// ── Manage landing — Requests + Surveys (operational) ────────────────────────
// The Manage shell: Requests (research intake review) and Surveys (live
// operational monitoring) are live; Campaigns and Reports preview the coming IA.
// Surveys and Requests both reuse the org-scoped ownership authority server-side.

import { useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { StudioContainer } from "../StudioContainer";
import { WorkspaceHeader } from "@/app/components/workspace-ui";
import { ManageRequests } from "./ManageRequests";
import { ManageSurveysList } from "./ManageSurveysList";
import { ManageStudiesList } from "./ManageStudiesList";
import { ManageCampaignGroups } from "./ManageCampaignGroups";
import { ManageCampaignGroupDetail } from "./ManageCampaignGroupDetail";

type Tab = "studies" | "surveys" | "requests" | "campaigns";

export function ManageWorkspace({ initialView }: { initialView?: string }) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin"; // Studies curation is Fanometrix-only
  // Studies (admin), Surveys, Requests and Campaigns are live; Reports previews the IA.
  const TABS: Array<{ key: Tab | "campaigns" | "reports"; label: string; live: boolean }> = [
    ...(isAdmin ? [{ key: "studies" as const, label: "Studies", live: true }] : []),
    { key: "surveys", label: "Surveys", live: true },
    { key: "requests", label: "Requests", live: true },
    { key: "campaigns", label: "Campaigns", live: true },
    { key: "reports", label: "Reports", live: false },
  ];
  const initial: Tab = (initialView === "requests" || initialView === "surveys" || initialView === "campaigns" || (initialView === "studies" && isAdmin)) ? (initialView as Tab) : "surveys";
  const [tab, setTab] = useState<Tab>(initial);
  // Which Campaign Group is open, if any. Held here rather than in the URL so
  // switching tabs and coming back does not strand the operator inside a group.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  return (
    <StudioContainer>
      <WorkspaceHeader
        eyebrow="Survey Studio"
        title="Manage"
        description="Live surveys, research requests and deployments — status, progress and controls in one operational view."
      />

      <div className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--border-default)" }}>
        {TABS.map((t) => {
          const active = t.live && tab === (t.key as Tab);
          return (
            <button
              key={t.key}
              type="button"
              disabled={!t.live}
              onClick={() => t.live && setTab(t.key as Tab)}
              className="whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors disabled:cursor-default"
              style={active
                ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
                : t.live
                  ? { color: "var(--text-secondary)", borderColor: "transparent" }
                  : { color: "var(--text-disabled)", borderColor: "transparent" }}
            >
              {t.label}{t.live ? "" : <span className="ml-1 text-[10px] uppercase tracking-wide">soon</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "studies" ? <ManageStudiesList />
         : tab === "surveys" ? <ManageSurveysList />
         : tab === "campaigns"
           ? (openGroupId
               ? <ManageCampaignGroupDetail groupId={openGroupId} onBack={() => setOpenGroupId(null)} />
               : <ManageCampaignGroups onOpen={setOpenGroupId} />)
         : <ManageRequests />}
      </div>
    </StudioContainer>
  );
}

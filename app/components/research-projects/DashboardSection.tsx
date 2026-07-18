"use client";

import { SectionCard, InfoContent, CollapsedSummary } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { DashboardSourceTile } from "@/app/components/research-projects/DashboardSourceTile";
import { deriveCollectionStatus, type CollectionStatus } from "@/app/components/research-projects/SourceWorkspaceCard";
import type { Campaign } from "@/app/components/campaigns/types";

type RunStatus = "not_started" | "generating" | "ready" | "failed";

type SurveySource = {
  evidence_id: string;
  name: string;
  response_count: number;
  // target_responses is each survey's own (migration 094 — survey-scoped,
  // not a single project-wide target applied to every tile).
  target_responses: number | null;
  run_status: RunStatus;
};

type ConversationSource = {
  evidence_id: string;
  name: string;
  mention_count: number;
  run_status: RunStatus;
  markets: string[];
  platforms: string[];
  positive_pct: number; neutral_pct: number; negative_pct: number;
};

function statusFor(current: number | null, target: number | null, runStatus: RunStatus): CollectionStatus {
  // A completed run (run_status === "ready") is always "Target Reached" —
  // the run's own status is the completion authority, never re-derived
  // from counts against a target. Conversation Search in particular
  // usually has no configured target at all, which would otherwise make
  // deriveCollectionStatus report "Not Started" forever despite mentions
  // having genuinely landed (same fix as ResearchSourcesSection's
  // SurveyCard/ConversationSearchCard).
  if (runStatus === "generating") return "generating";
  if (runStatus === "failed") return "failed";
  if (runStatus === "ready") return "target_reached";
  return deriveCollectionStatus(current, target);
}

// Distinct, non-empty values — used for both the coverage line's
// market/publisher/platform counts and each Survey card's own
// campaign/publisher/market breakdown.
function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

export function DashboardSection({
  projectId, isSimulated, hasEvidence, onScrollToResearchSources,
  surveys, conversationSearches, mentionTarget, campaigns,
}: {
  projectId: string;
  isSimulated: boolean;
  hasEvidence: boolean;
  onScrollToResearchSources: () => void;
  surveys: SurveySource[];
  conversationSearches: ConversationSource[];
  mentionTarget: number | null;
  // This project's own campaigns (already loaded for Research Sources) —
  // reused here purely to compute each Survey's campaign/publisher/market
  // reach; never refetched.
  campaigns: Campaign[];
}) {
  type Tile = {
    key: string; badge: string; title: string; target: number | null; current: number | null;
    unitLabel: string; status: CollectionStatus; href: string; hrefLabel: string;
    breakdown?: { label: string; value: string }[];
    sentiment?: { positive_pct: number; neutral_pct: number; negative_pct: number };
    showProgressBar?: boolean;
  };

  const tiles: Tile[] = [];
  for (const s of surveys) {
    const status = statusFor(s.response_count, s.target_responses, s.run_status);
    const surveyCampaigns = campaigns.filter(c => c.effective_survey_id === s.evidence_id);
    const campaignCount = surveyCampaigns.length;
    const publisherCount = distinct(surveyCampaigns.map(c => c.publisher_org_id)).length;
    const marketCount = distinct(surveyCampaigns.map(c => c.market || c.country_code)).length;
    tiles.push({
      key: s.evidence_id, badge: "Survey", title: s.name, target: s.target_responses, current: s.response_count,
      unitLabel: "response", status,
      href: `/dashboard?research_project_id=${projectId}&survey_id=${s.evidence_id}`,
      hrefLabel: "Open Survey Dashboard",
      breakdown: campaignCount > 0 ? [
        { label: campaignCount === 1 ? "campaign" : "campaigns", value: String(campaignCount) },
        { label: publisherCount === 1 ? "publisher" : "publishers", value: String(publisherCount) },
        { label: marketCount === 1 ? "market" : "markets", value: String(marketCount) },
      ] : undefined,
      showProgressBar: true,
    });
  }
  for (const cs of conversationSearches) {
    const status = statusFor(cs.mention_count, mentionTarget, cs.run_status);
    tiles.push({
      key: cs.evidence_id, badge: "Conversation Search", title: cs.name, target: mentionTarget, current: cs.mention_count,
      unitLabel: "mention", status,
      href: `/research-projects/${projectId}/execution/conversation/${cs.evidence_id}`,
      hrefLabel: "Open",
      breakdown: [
        ...(cs.markets.length ? [{ label: "markets", value: distinct(cs.markets).slice(0, 3).join(", ") + (distinct(cs.markets).length > 3 ? "…" : "") }] : []),
        ...(cs.platforms.length ? [{ label: "platforms", value: distinct(cs.platforms).slice(0, 3).join(", ") + (distinct(cs.platforms).length > 3 ? "…" : "") }] : []),
      ],
      sentiment: { positive_pct: cs.positive_pct, neutral_pct: cs.neutral_pct, negative_pct: cs.negative_pct },
    });
  }
  const withTarget = tiles.filter(t => (t.target !== null && t.target > 0) || t.status === "target_reached");
  const atTarget = withTarget.filter(t => t.status === "target_reached");

  // ── Research Coverage ───────────────────────────────────────────────────
  const totalResponses = surveys.reduce((sum, s) => sum + s.response_count, 0);
  const totalMentions = conversationSearches.reduce((sum, cs) => sum + cs.mention_count, 0);
  const markets = distinct([
    ...campaigns.map(c => c.market || c.country_code),
    ...conversationSearches.flatMap(cs => cs.markets),
  ]);
  const publishers = distinct(campaigns.map(c => c.publisher_org_id));
  const platforms = distinct(conversationSearches.flatMap(cs => cs.platforms));

  return (
    <SectionCard
      id="dashboard"
      title="Dashboard"
      badge={isSimulated && <SimulatedBadge />}
      info={
        <InfoContent title="The project's overview: what's been collected and how each source is doing.">
          <p>Coverage shows how much evidence exists across every source. Each source card shows its own progress and reach, and evolves from a progress ring into research context once it&apos;s complete.</p>
          <p className="mt-1.5">Open Survey/Conversation Intelligence for the interpretation, synthesis, and recommendations behind each source.</p>
        </InfoContent>
      }
      summary={
        <CollapsedSummary groups={[{ parts: [
          !hasEvidence
            ? "No sources yet"
            : `${tiles.length} source${tiles.length !== 1 ? "s" : ""}, ${atTarget.length} complete`,
        ] }]} />
      }
    >
      {!hasEvidence ? (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-gray-500 mb-3">No Research Sources yet, add one to start collecting evidence.</p>
          <button onClick={onScrollToResearchSources} className="text-xs font-semibold text-[#0B1929] underline">
            Go to Research Sources →
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Research Coverage */}
          <div>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
              <div>
                <span className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>{tiles.length}</span>
                <span className="text-sm text-gray-500 ml-1.5">Research Source{tiles.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-gray-400 ml-1.5">({atTarget.length} complete{tiles.length > atTarget.length ? `, ${tiles.length - atTarget.length} in progress` : ""})</span>
              </div>
              {surveys.length > 0 && (
                <div>
                  <span className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>{totalResponses.toLocaleString()}</span>
                  <span className="text-sm text-gray-500 ml-1.5">Survey Response{totalResponses !== 1 ? "s" : ""}</span>
                </div>
              )}
              {conversationSearches.length > 0 && (
                <div>
                  <span className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>{totalMentions.toLocaleString()}</span>
                  <span className="text-sm text-gray-500 ml-1.5">Conversation Mention{totalMentions !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
            {(surveys.length > 0 && conversationSearches.length > 0) || markets.length > 0 || publishers.length > 0 || platforms.length > 0 ? (
              <p className="text-xs text-gray-400 mt-1.5">
                {[
                  surveys.length > 0 && conversationSearches.length > 0
                    ? `${surveys.length} Survey${surveys.length !== 1 ? "s" : ""} · ${conversationSearches.length} Conversation Search${conversationSearches.length !== 1 ? "es" : ""}`
                    : null,
                  markets.length > 0 ? `${markets.length} market${markets.length !== 1 ? "s" : ""}` : null,
                  publishers.length > 0 ? `${publishers.length} publisher${publishers.length !== 1 ? "s" : ""}` : null,
                  platforms.length > 0 ? `${platforms.length} platform${platforms.length !== 1 ? "s" : ""}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>

          {/* Source Performance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tiles.map(t => (
              <DashboardSourceTile key={t.key} badge={t.badge} title={t.title}
                status={t.status} target={t.target} current={t.current} unitLabel={t.unitLabel}
                href={t.href} hrefLabel={t.hrefLabel} breakdown={t.breakdown} sentiment={t.sentiment}
                showProgressBar={t.showProgressBar} />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

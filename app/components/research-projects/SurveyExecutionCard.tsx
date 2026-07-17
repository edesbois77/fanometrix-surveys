"use client";

// One survey as an operational card — shared by the Execution homepage (where
// each attached survey is surfaced individually) and the Surveys list page, so
// the two never drift. Surveys are the most operationally complex evidence
// source, so this card leads with deployment state: campaigns / live / draft
// and a clearly-labelled response-progress bar.
//
// No "SURVEY" eyebrow — the section heading and the glyph already say it, and
// keeping the card quiet matters when several stack on the homepage. The grey
// footer carries the two navigations: "Manage Campaigns →" (the primary
// workflow, left) and "Edit Survey" (a quiet jump back to Research, right);
// once live, a Dashboard hand-off joins the right side.
import Link from "next/link";
import { StatusBadge, ProgressBar, Icon, SOURCE_META, type Tone } from "@/app/components/workspace-ui";
import type { EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import type { Campaign } from "@/app/components/campaigns/types";

type SurveyEvidence = EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> };

export function surveyDeploymentStatus(live: number, paused: number, total: number): { label: string; tone: Tone } {
  if (live > 0) return { label: "Collecting", tone: "success" };
  if (paused > 0) return { label: "Paused", tone: "warning" };
  if (total > 0) return { label: "Not live", tone: "neutral" };
  return { label: "Not deployed", tone: "neutral" };
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="fx-tabular-nums text-lg font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

export function SurveyExecutionCard({ projectId, item, campaigns }: {
  projectId: string;
  item: SurveyEvidence;
  campaigns: Campaign[];
}) {
  const s = item.survey;
  const surveyCampaigns = campaigns.filter(c => c.effective_survey_id === item.evidence_id);
  const live = surveyCampaigns.filter(c => c.effective_status === "live").length;
  const draft = surveyCampaigns.filter(c => c.effective_status === "draft").length;
  const paused = surveyCampaigns.filter(c => c.effective_status === "paused").length;
  const status = surveyDeploymentStatus(live, paused, surveyCampaigns.length);

  // Response target: prefer the aggregate of this survey's campaign targets
  // (targets are set per-campaign in the field), exactly like the Research and
  // Analysis survey cards — the survey's own target_responses is only a fallback
  // when no campaign sets one, so the progress bar reflects the real goal.
  const campaignTargetSum = surveyCampaigns.reduce((sum, c) => sum + (c.effective_target_responses ?? c.target_responses ?? 0), 0);
  const target = campaignTargetSum > 0 ? campaignTargetSum : (s.target_responses ?? null);
  const pct = target && target > 0 ? Math.min(100, Math.round((s.response_count / target) * 100)) : null;

  const m = SOURCE_META.survey;
  const Glyph = Icon[m.icon];
  const campaignsHref = `/research-projects/${projectId}/execution/survey/${item.evidence_id}`;
  const researchHref = `/research-projects/${projectId}/research/survey/${item.evidence_id}`;

  return (
    <div
      className="overflow-hidden border flex flex-col"
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="p-4 md:p-5 flex-1">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: m.wash, color: m.ink }} aria-hidden>
            <Glyph size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 justify-between">
              <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{s.name}</h3>
              <StatusBadge label={status.label} tone={status.tone} dot />
            </div>
            {s.brand_name && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>{s.brand_name}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4">
          <Metric label="Campaigns" value={surveyCampaigns.length} />
          <Metric label="Live" value={live} />
          <Metric label="Draft" value={draft} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Response progress</span>
            <span className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {target ? `${s.response_count.toLocaleString()} of ${target.toLocaleString()} responses` : `${s.response_count.toLocaleString()} responses · no target`}
            </span>
          </div>
          {target && <ProgressBar value={pct ?? 0} tone={live > 0 ? "success" : "accent"} showValue={false} />}
        </div>
      </div>

      <div className="px-4 md:px-5 py-2.5 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
        <Link href={campaignsHref} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>
          Manage Campaigns
          <Icon.chevronRight size={14} />
        </Link>
        <div className="flex items-center gap-3">
          {live > 0 && (
            <Link href={`/research-projects/${projectId}/dashboard`} className="text-xs font-medium hover:underline" style={{ color: "var(--text-secondary)" }}>
              View Dashboard →
            </Link>
          )}
          <Link href={researchHref} className="text-xs font-medium hover:underline" style={{ color: "var(--text-tertiary)" }}>
            Edit Survey
          </Link>
        </div>
      </div>
    </div>
  );
}

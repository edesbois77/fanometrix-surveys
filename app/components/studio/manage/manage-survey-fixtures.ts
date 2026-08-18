// ── Manage → Survey detail — preview fixtures ────────────────────────────────
// Deterministic ManageData states for visual review. Lifecycle + actions are
// computed through the REAL pure functions (effectiveLifecycle / surveyActions),
// so the preview reflects the true rules, not hand-set flags.

import { effectiveLifecycle, surveyActions, EFFECTIVE_LABEL, EFFECTIVE_TONE } from "@/lib/studio/survey-lifecycle";
import { surveyLifecycleState } from "@/lib/studio/collection-health";
import type { CampaignStatus } from "@/lib/campaign-status";
import type { ManageData } from "./ManageSurveyDetail";

export type PreviewState =
  | "draft-empty" | "draft-config" | "ready" | "live" | "historical" | "archived" | "legacy" | "admin-cross-org";

export const PREVIEW_STATES: { key: PreviewState; label: string }[] = [
  { key: "draft-empty", label: "Draft · no campaigns" },
  { key: "draft-config", label: "Draft · unused campaigns" },
  { key: "ready", label: "Ready · no data" },
  { key: "live", label: "Live" },
  { key: "historical", label: "Historical · has data" },
  { key: "archived", label: "Archived" },
  { key: "legacy", label: "Legacy campaign" },
  { key: "admin-cross-org", label: "Admin cross-org" },
];

type Campaign = ManageData["campaigns"][number];
const camp = (name: string, status: CampaignStatus, publisher: string, market: string, isStudio: boolean, responses = 0): Campaign =>
  ({ name, slug: isStudio ? `studio_${name.toLowerCase().replace(/\s+/g, "_")}` : name.toLowerCase().replace(/\s+/g, "_"), status, publisher, market, language: "en", isStudio, hasData: responses > 0, responses });

const Q = (text: string, options: string[]) => ({ id: text, text: { en: text }, options: options.map((o, i) => ({ id: i + 1, text: { en: o } })) });

const FEDEX_QS = [
  Q("How do you rate FedEx as a Champions League sponsor?", ["Strong natural fit", "Relevant but unclear", "Mostly brand visibility", "Never noticed them"]),
  Q("What should sponsors offer fans?", ["Exclusive access", "Rewards and benefits", "Better fan experiences", "Investment in grassroots"]),
  Q("How could FedEx help fans most?", ["Access to experiences", "Connecting fans", "Exclusive content", "Supporting communities"]),
];

function build(o: {
  name: string; persistedStatus: string; hasLiveCampaign: boolean; hasEvidence: boolean;
  questions: unknown[]; campaigns: Campaign[]; responses: number; publishers: number; markets: number;
  study?: { id: string; name: string } | null; description?: string | null; topic?: string | null;
  languages?: string[]; createdBy?: string | null; isAdminView?: boolean; lastResponseAt?: string | null;
}): ManageData {
  const operational = o.campaigns.length === 0 && o.responses > 0
    ? ("closed" as const)
    : surveyLifecycleState({ effectiveStatuses: o.campaigns.map((c) => c.status as CampaignStatus), totalResponses: o.responses, targetReached: false });
  const effective = effectiveLifecycle({ persistedStatus: o.persistedStatus, operationalLifecycle: operational, hasLiveCampaign: o.hasLiveCampaign, hasEvidence: o.hasEvidence });
  const deletable = o.persistedStatus !== "archived" && !o.hasLiveCampaign && !o.hasEvidence;
  const actions = surveyActions({ effective, hasLiveCampaign: o.hasLiveCampaign, hasEvidence: o.hasEvidence, canManage: true, isAdmin: !!o.isAdminView, deletable });
  const legacyCampaigns = o.campaigns.filter((c) => !c.isStudio).length;
  return {
    survey: {
      id: "preview", name: o.name, persistedStatus: o.persistedStatus,
      description: o.description ?? null, topic: o.topic ?? null, about: null,
      questions: o.questions, enabledLanguages: o.languages ?? ["en"], createdAt: "2026-06-26T00:00:00Z",
      createdBy: o.createdBy ?? "you@brand.com", organisationId: "org", study: o.study ?? null,
    },
    lifecycle: { effective, label: EFFECTIVE_LABEL[effective], tone: EFFECTIVE_TONE[effective] },
    flags: { hasLiveCampaign: o.hasLiveCampaign, hasEvidence: o.hasEvidence, researchLocked: actions.researchLocked, lockReason: actions.lockReason },
    counts: {
      responses: o.responses, totalCampaigns: o.campaigns.length, studioCampaigns: o.campaigns.length - legacyCampaigns,
      legacyCampaigns, publishers: o.publishers, markets: o.markets, questions: o.questions.length, lastResponseAt: o.lastResponseAt ?? (o.responses > 0 ? "2026-07-26T00:00:00Z" : null),
    },
    campaigns: o.campaigns,
    actions,
    deletion: { deletable, reason: deletable ? null : o.hasLiveCampaign ? "live_campaign" : o.hasEvidence ? "collected_evidence" : null, campaignsToSoftDelete: deletable ? o.campaigns.length : 0 },
  };
}

export const PREVIEW_FIXTURES: Record<PreviewState, ManageData> = {
  "draft-empty": build({
    name: "New brand tracker", persistedStatus: "draft", hasLiveCampaign: false, hasEvidence: false,
    questions: [Q("What matters most to you?", ["Value", "Quality", "Service"])], campaigns: [], responses: 0, publishers: 0, markets: 0,
    description: "Early draft, not yet configured.", topic: "Brand", languages: ["en"],
  }),
  "draft-config": build({
    name: "Summer campaign concept", persistedStatus: "draft", hasLiveCampaign: false, hasEvidence: false,
    questions: FEDEX_QS.slice(0, 2),
    campaigns: [camp("UK LiveScore", "draft", "LiveScore", "United Kingdom", true), camp("DE FotMob", "draft", "FotMob", "Germany", true)],
    responses: 0, publishers: 2, markets: 2, description: "Configured but never deployed.", topic: "Sponsorship", languages: ["en", "de"],
  }),
  "ready": build({
    name: "Fan sentiment pilot", persistedStatus: "ready", hasLiveCampaign: false, hasEvidence: false,
    questions: FEDEX_QS, campaigns: [camp("UK pilot", "draft", "LiveScore", "United Kingdom", true)], responses: 0, publishers: 1, markets: 1,
    description: "Validated and ready to deploy.", topic: "Sponsorship", languages: ["en"],
  }),
  "live": build({
    name: "UEFA sponsorship live", persistedStatus: "ready", hasLiveCampaign: true, hasEvidence: true,
    questions: FEDEX_QS,
    campaigns: [camp("UK LiveScore", "live", "LiveScore", "United Kingdom", true, 142), camp("DE FotMob", "live", "FotMob", "Germany", true, 54)],
    responses: 196, publishers: 2, markets: 2, description: "Currently collecting responses.", topic: "Sponsorship", languages: ["en", "de"],
  }),
  "historical": build({
    name: "Beyond Visibility — UCL sponsorship", persistedStatus: "ready", hasLiveCampaign: false, hasEvidence: true,
    questions: FEDEX_QS,
    campaigns: [
      camp("UK v1 LiveScore", "closed", "LiveScore", "United Kingdom", true, 118),
      camp("DE v1 FotMob", "closed", "FotMob", "Germany", true, 78),
    ],
    responses: 196, publishers: 2, markets: 2, study: { id: "s1", name: "FedEx UCL Sponsorship 26/27" },
    description: "Completed research with collected responses.", topic: "Sponsorship", languages: ["en", "de"],
  }),
  "archived": build({
    name: "2025 brand tracker (archived)", persistedStatus: "archived", hasLiveCampaign: false, hasEvidence: true,
    questions: FEDEX_QS, campaigns: [camp("UK 2025", "closed", "LiveScore", "United Kingdom", true, 240)], responses: 240, publishers: 1, markets: 1,
    study: { id: "s2", name: "Annual brand study" }, description: "Preserved historical research.", topic: "Brand", languages: ["en"],
  }),
  "legacy": build({
    name: "Adidas - WWC - v1", persistedStatus: "draft", hasLiveCampaign: false, hasEvidence: false,
    questions: [Q("What should brands in football prioritise?", ["Better fan experiences", "Grassroots investment", "Exclusive fan access", "Brand visibility"])],
    campaigns: [camp("adidas test gb livescore 2026", "closed", "LiveScore", "United Kingdom", false)],
    responses: 0, publishers: 1, markets: 1, description: "A legacy campaign is attached but carries no data.", topic: "Brand", languages: ["en", "de", "sv", "zh-CN"],
  }),
  "admin-cross-org": build({
    name: "OMD commissioned study", persistedStatus: "ready", hasLiveCampaign: false, hasEvidence: true,
    questions: FEDEX_QS, campaigns: [camp("UK LiveScore", "closed", "LiveScore", "United Kingdom", true, 196)], responses: 196, publishers: 1, markets: 1,
    study: { id: "s3", name: "OMD × UCL" }, description: "Managed by a Fanometrix operator across organisations.", topic: "Sponsorship",
    languages: ["en"], createdBy: "operator@fanometrix.com", isAdminView: true,
  }),
};

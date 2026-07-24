// The evidence pipeline, per source — so the Findings Overview can ALWAYS say
// where a source's evidence is and why it hasn't reached Findings/Analysis, and
// never show a silent "no findings yet" when evidence exists.
//
// For each source family it reports the stage counts (collected → awaiting
// approval → awaiting extraction → awaiting review → approved), the single most
// important blocking reason, and the next recommended action. All read-only.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listSourceFindings, summariseSourceFindings } from "@/lib/analysis/source-findings/store";
import { projectDeploymentCampaigns } from "@/lib/analysis/source-findings/survey-population";
import { CONVERSATION_KINDS } from "@/lib/analysis/source-findings/types";
import { getProjectSearchStates } from "@/lib/research-sources/project-searches";

export type SourceStage = {
  key: "survey" | "conversation" | "document";
  label: string;
  evidenceCollected: number;
  evidenceUnit: string;
  awaitingApproval: number;
  awaitingExtraction: number;
  awaitingReview: number;
  approved: number;
  /** The single most important reason nothing has reached Findings/Analysis. */
  blockingReason: string | null;
  /** Where to go next to unblock. */
  nextAction: { label: string; href: string } | null;
  /** Searches awaiting approval, each directly approvable from the pipeline
   *  (conversation only). Empty/absent for other sources. */
  approvalItems?: { id: string; name: string; count: number }[];
};

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

async function count(table: string, build: (q: ReturnType<typeof sel>) => ReturnType<typeof sel>): Promise<number> {
  const { count } = await build(sel(table));
  return count ?? 0;
}
const sel = (table: string) => supabaseAdmin.from(table).select("id", { count: "exact", head: true });

function hasInformationNeeds(info: unknown): boolean {
  const themes = (info as { themes?: unknown })?.themes;
  if (!Array.isArray(themes)) return false;
  return themes.some((t: { aspect?: string; needs?: unknown }) =>
    Array.isArray(t?.needs) && (t.needs as { need?: string }[]).some(n => (n?.need ?? "").trim()) && (t?.aspect ?? "").trim());
}

export async function sourcePipeline(projectId: string): Promise<SourceStage[]> {
  const base = `/research-projects/${projectId}`;
  const findings = await listSourceFindings(projectId);
  const { byKind } = summariseSourceFindings(findings);
  const roll = (kinds: string[]) => kinds.reduce(
    (a, k) => ({ candidate: a.candidate + (byKind[k]?.candidate ?? 0), approved: a.approved + (byKind[k]?.approved ?? 0), total: a.total + (byKind[k]?.total ?? 0) }),
    { candidate: 0, approved: 0, total: 0 },
  );

  return [
    await surveyStage(projectId, base, roll(["survey"])),
    await conversationStage(projectId, base, roll(CONVERSATION_KINDS)),
    await documentStage(projectId, base, roll(["document"])),
  ];
}

type Roll = { candidate: number; approved: number; total: number };

async function surveyStage(projectId: string, base: string, k: Roll): Promise<SourceStage> {
  const hasEvidence = (await count("research_project_evidence", q => q.eq("research_project_id", projectId).eq("evidence_type", "survey"))) > 0;
  const slugs = await projectDeploymentCampaigns(projectId);
  const collected = slugs.length ? await count("responses", q => q.in("campaign_id", slugs)) : 0;

  let blockingReason: string | null = null;
  let nextAction: SourceStage["nextAction"] = null;
  let awaitingExtraction = 0;
  if (!hasEvidence) blockingReason = "No survey attached to this project.";
  else if (collected === 0) { blockingReason = "No completed responses collected yet."; nextAction = { label: "Open Execution", href: `${base}/execution` }; }
  else if (k.total === 0) { awaitingExtraction = 1; blockingReason = "Responses collected, findings not extracted yet."; nextAction = { label: "Extract findings", href: `${base}/findings` }; }
  else if (k.candidate > 0) nextAction = { label: "Review survey findings", href: `${base}/findings/survey` };

  return {
    key: "survey", label: "Survey Research",
    evidenceCollected: collected, evidenceUnit: "completed responses",
    awaitingApproval: 0, awaitingExtraction, awaitingReview: k.candidate, approved: k.approved,
    blockingReason, nextAction,
  };
}

async function conversationStage(projectId: string, base: string, k: Roll): Promise<SourceStage> {
  const states = await getProjectSearchStates(projectId);
  const eligibleIds = states.filter(s => s.eligible).map(s => s.id);
  const ineligibleIds = states.filter(s => !s.eligible).map(s => s.id);

  const awaitingApproval = ineligibleIds.length
    ? await count("social_mentions", q => q.in("search_id", ineligibleIds).eq("excluded", false)) : 0;

  // Each awaiting-approval search, with its evidence count, so it can be approved
  // directly from the pipeline (never "awaiting approval" with no way to act).
  const approvalItems = await Promise.all(
    states.filter(s => !s.eligible).map(async s => ({
      id: s.id, name: s.name,
      count: await count("social_mentions", q => q.eq("search_id", s.id).eq("excluded", false)),
    })),
  );
  const eligibleMentions = eligibleIds.length
    ? await count("social_mentions", q => q.in("search_id", eligibleIds).eq("excluded", false)) : 0;
  const collected = awaitingApproval + eligibleMentions;

  // Of the eligible searches, how many carry Information Needs?
  let eligibleWithNeeds = 0;
  if (eligibleIds.length) {
    const { data } = await supabaseAdmin.from("social_searches").select("id, information_needs").in("id", eligibleIds);
    eligibleWithNeeds = (data ?? []).filter(s => hasInformationNeeds(s.information_needs)).length;
  }
  const eligibleMissingNeeds = eligibleIds.length - eligibleWithNeeds;

  let blockingReason: string | null = null;
  let nextAction: SourceStage["nextAction"] = null;
  let awaitingExtraction = 0;

  if (states.length === 0) {
    blockingReason = "No conversation searches attached.";
    nextAction = { label: "Add searches in Research", href: `${base}/research` };
  } else if (k.total > 0) {
    if (k.candidate > 0) nextAction = { label: "Review conversation findings", href: `${base}/findings/conversation` };
  } else if (eligibleIds.length === 0 && ineligibleIds.length > 0) {
    blockingReason = `${plural(ineligibleIds.length, "search", "searches")} awaiting approval · ${plural(awaitingApproval, "mention")} withheld.`;
    // No nextAction link: approval happens inline via approvalItems, right here.
  } else if (eligibleWithNeeds === 0 && eligibleMissingNeeds > 0) {
    blockingReason = `${plural(eligibleMissingNeeds, "search", "searches")} missing Information Needs.`;
    nextAction = { label: "Add Information Needs in Research", href: `${base}/research` };
  } else if (eligibleWithNeeds > 0 && eligibleMentions === 0) {
    blockingReason = "Searches approved, but no relevant mentions collected yet.";
    nextAction = { label: "Open Execution", href: `${base}/execution` };
  } else if (eligibleWithNeeds > 0) {
    awaitingExtraction = eligibleWithNeeds;
    blockingReason = "Eligible searches, findings not extracted yet.";
    nextAction = { label: "Extract findings", href: `${base}/findings` };
  }

  return {
    key: "conversation", label: "Conversation Intelligence",
    evidenceCollected: collected, evidenceUnit: "mentions",
    awaitingApproval, awaitingExtraction, awaitingReview: k.candidate, approved: k.approved,
    blockingReason, nextAction, approvalItems,
  };
}

async function documentStage(projectId: string, base: string, k: Roll): Promise<SourceStage> {
  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id").eq("research_project_id", projectId).eq("evidence_type", "document");
  const docIds = (links ?? []).map(l => l.evidence_id as string);
  const collected = docIds.length;
  let awaitingApproval = 0;
  if (docIds.length) {
    const { data: docs } = await supabaseAdmin.from("library_documents").select("id, status").in("id", docIds);
    awaitingApproval = (docs ?? []).filter(d => (d.status as string | null) !== "approved").length;
  }

  let blockingReason: string | null = null;
  let nextAction: SourceStage["nextAction"] = null;
  let awaitingExtraction = 0;
  if (collected === 0) blockingReason = "No documents attached to this project.";
  else if (k.total === 0 && awaitingApproval > 0) {
    blockingReason = `${plural(awaitingApproval, "document")} awaiting Research Library approval.`;
    nextAction = { label: "Open Research Library", href: `/research-library` };
  } else if (k.total === 0) {
    awaitingExtraction = collected - awaitingApproval;
    blockingReason = "Documents approved, findings not extracted yet.";
    nextAction = { label: "Extract findings", href: `${base}/findings` };
  } else if (k.candidate > 0) nextAction = { label: "Review Research Library findings", href: `${base}/findings/document` };

  return {
    key: "document", label: "Research Library",
    evidenceCollected: collected, evidenceUnit: "documents",
    awaitingApproval, awaitingExtraction, awaitingReview: k.candidate, approved: k.approved,
    blockingReason, nextAction,
  };
}

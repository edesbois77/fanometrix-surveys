"use client";

// The Execution homepage — /research-projects/[id]/execution. A clean entry
// point into the operational areas, deliberately NOT a long dashboard. Surveys
// are the most operationally complex evidence source, so they get more room:
// each attached survey is surfaced as its own operational card. The other areas
// — Conversation Searches, Documents and the deployment-level Campaign Groups —
// stay as single summary cards that open their respective pages.
//
// Campaign Groups sits here as a DEPLOYMENT concept (a group can rotate
// campaigns from several surveys behind one publisher embed), not as a child of
// any single survey. Chromeless: the (workspace) shell provides the project
// header + navigation.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { SurveyExecutionCard } from "@/app/components/research-projects/SurveyExecutionCard";
import { isProcessing } from "@/app/components/research-projects/document-status";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, StatusBadge, ProgressBar, Icon, SOURCE_META, type IconName, type Tone,
} from "@/app/components/workspace-ui";

type Chip = { label: string; tone: Tone };
type Metric = { label: string; value: string };

// The operational heartbeat — one live counter, big and calm.
function Pulse({ label, value, live }: { label: string; value: number; live?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {live && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#5C8560" }} aria-hidden />}
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      </div>
      <p className="fx-tabular-nums text-2xl font-bold mt-0.5 tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{value.toLocaleString()}</p>
    </div>
  );
}
// A discrete "X of Y" progress — never an invented percentage where the
// platform has no genuine completion model.
type Progress = { label: string; numeric: string; value: number };

// A single summary entry-card for an operational area — glyph, a compact metric
// row, a labelled progress bar, status chips and a call-in. Used for
// Conversation Searches, Documents and Campaign Groups (surveys render as
// individual cards instead).
function SummaryCard({
  icon, ink, wash, title, description, metrics, progress, chips, ctaLabel, href,
}: {
  icon: IconName; ink: string; wash: string;
  title: string; description: string; metrics: Metric[]; progress?: Progress; chips: Chip[]; ctaLabel: string; href: string;
}) {
  const Glyph = Icon[icon];
  return (
    <Link href={href} className="group block h-full">
      <div className="h-full flex flex-col overflow-hidden border transition-shadow hover:shadow-[var(--shadow-md)]"
        style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}>
        <div className="p-4 md:p-5 flex-1">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 40, height: 40, background: wash, color: ink }} aria-hidden>
              <Glyph size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
            {metrics.map((mt, i) => (
              <div key={i}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{mt.label}</p>
                <p className="fx-tabular-nums text-lg font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{mt.value}</p>
              </div>
            ))}
          </div>
          {progress && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{progress.label}</span>
                <span className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>{progress.numeric}</span>
              </div>
              <ProgressBar value={progress.value} tone="accent" showValue={false} />
            </div>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {chips.map((c, i) => <StatusBadge key={i} label={c.label} tone={c.tone} dot />)}
            </div>
          )}
        </div>
        <div className="px-4 md:px-5 py-2.5 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
            {ctaLabel}
            <Icon.chevronRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ExecutionHomeBody() {
  const router = useRouter();
  const { projectId, project, campaigns, campaignGroups, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's execution workspace."} />
    </PageContainer>
  );

  const base = `/research-projects/${projectId}/execution`;

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } => e.evidence_type === "social_search" && !!e.conversationSearch
  );
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document
  );

  // ── Summary roll-ups ─────────────────────────────────────────────────────────
  const csCollecting = conversationEvidence.filter(e => e.conversationSearch.latest_run_status === "running").length;
  const csMentions = conversationEvidence.reduce((sum, e) => sum + e.conversationSearch.mention_count, 0);
  const conversationChips: Chip[] = conversationEvidence.length === 0
    ? [{ label: "No searches yet", tone: "neutral" }]
    : csCollecting > 0 ? [{ label: `${csCollecting} collecting`, tone: "success" }] : [{ label: "Idle", tone: "neutral" }];
  // Discrete collection progress — no invented percentage: how many searches
  // are collecting or have collected, out of the total configured.
  const csTotal = conversationEvidence.length;
  const csDone = conversationEvidence.filter(e => {
    const rc = e.conversationSearch.latest_run_status;
    return rc === "running" || rc === "completed" || rc === "partial" || e.conversationSearch.mention_count > 0;
  }).length;
  const conversationProgress: Progress | undefined = csTotal > 0
    ? { label: "Collection progress", numeric: `${csDone} of ${csTotal} search${csTotal === 1 ? "" : "es"} collecting or complete`, value: (csDone / csTotal) * 100 }
    : undefined;

  const docProcessing = documentEvidence.filter(e => isProcessing(e.document.library_status)).length;
  const docReady = documentEvidence.filter(e => e.document.library_status === "approved").length;
  const docFailed = documentEvidence.filter(e => e.document.library_status === "failed").length;
  const documentChips: Chip[] = [];
  if (documentEvidence.length === 0) documentChips.push({ label: "No documents yet", tone: "neutral" });
  if (docFailed > 0) documentChips.push({ label: `${docFailed} failed`, tone: "danger" });
  if (docProcessing > 0) documentChips.push({ label: `${docProcessing} processing`, tone: "info" });
  if (docReady > 0) documentChips.push({ label: `${docReady} ready`, tone: "success" });
  const docTotal = documentEvidence.length;
  const documentProgress: Progress | undefined = docTotal > 0
    ? { label: "Processing progress", numeric: `${docReady} of ${docTotal} document${docTotal === 1 ? "" : "s"} ready`, value: (docReady / docTotal) * 100 }
    : undefined;

  const activeGroups = campaignGroups.filter(g => g.status === "live").length;
  const groupCampaignIds = new Set(campaignGroups.flatMap(g => g.campaign_ids));
  const groupPublishers = new Set(campaigns.filter(c => groupCampaignIds.has(c.id) && c.publisher_org_id).map(c => c.publisher_org_id));
  const anyRotation = campaignGroups.some(g => g.rotation !== "equal");
  const groupChips: Chip[] = [];
  if (campaignGroups.length === 0) groupChips.push({ label: "No groups yet", tone: "neutral" });
  else groupChips.push(activeGroups > 0 ? { label: `${activeGroups} active`, tone: "success" } : { label: "Idle", tone: "neutral" });
  if (anyRotation) groupChips.push({ label: "Rotation configured", tone: "info" });

  const liveCampaigns = campaigns.filter(c => c.effective_status === "live").length;
  const totalResponses = surveyEvidence.reduce((s, e) => s + e.survey.response_count, 0);
  const anyActive = liveCampaigns > 0 || csCollecting > 0 || docProcessing > 0;

  // ── Operational heartbeat — "what's happening right now?" ────────────────────
  const heartbeat = [
    { label: "Live campaigns", value: liveCampaigns, live: liveCampaigns > 0 },
    { label: "Responses", value: totalResponses },
    { label: "Searches running", value: csCollecting, live: csCollecting > 0 },
    { label: "Conversations", value: csMentions },
    { label: "Documents processing", value: docProcessing, live: docProcessing > 0 },
  ];

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Execution"
        description="Deploy surveys, run collection and process documents — ready for Dashboard and Analysis."
        status={anyActive ? { label: "Collecting", tone: "success", dot: true } : { label: "Idle", tone: "neutral", dot: true }}
      />

      {/* ── Operational heartbeat ────────────────────────────────────────────── */}
      {project.evidence.length > 0 && (
        <Card padding="md">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {heartbeat.map(h => <Pulse key={h.label} label={h.label} value={h.value} live={h.live} />)}
          </div>
        </Card>
      )}

      {/* ── Surveys — surfaced individually ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>
          Surveys <span className="font-normal" style={{ color: "var(--text-disabled)" }}>({surveyEvidence.length})</span>
        </h2>
        {surveyEvidence.length === 0 ? (
          <div className="border rounded-xl px-4 py-6 text-center" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              No surveys attached yet.{" "}
              <button onClick={() => router.push(`/research-projects/${projectId}/research/survey`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Add one in Research →</button>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {surveyEvidence.map(item => (
              <SurveyExecutionCard key={item.id} projectId={projectId} item={item} campaigns={campaigns} />
            ))}
          </div>
        )}
      </div>

      {/* ── Other operational areas — summary entry cards ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          icon={SOURCE_META.conversation.icon} ink={SOURCE_META.conversation.ink} wash={SOURCE_META.conversation.wash}
          title="Conversation Searches"
          description="Run and monitor conversation collection across markets and platforms."
          metrics={[
            { label: "Searches", value: conversationEvidence.length.toLocaleString() },
            { label: "Collecting", value: csCollecting.toLocaleString() },
            { label: "Conversations", value: csMentions.toLocaleString() },
          ]}
          progress={conversationProgress}
          chips={conversationChips}
          ctaLabel="Manage Searches"
          href={`${base}/conversation`}
        />
        <SummaryCard
          icon={SOURCE_META.document.icon} ink={SOURCE_META.document.ink} wash={SOURCE_META.document.wash}
          title="Documents"
          description="Process uploaded documents so their content is ready for Analysis."
          metrics={[
            { label: "Documents", value: documentEvidence.length.toLocaleString() },
            { label: "Processing", value: docProcessing.toLocaleString() },
            { label: "Ready", value: docReady.toLocaleString() },
          ]}
          progress={documentProgress}
          chips={documentChips}
          ctaLabel="Manage Documents"
          href={`${base}/document`}
        />
        <SummaryCard
          icon="layers" ink="#7A5C42" wash="#F3ECE0"
          title="Campaign Groups"
          description="Deployment bundles that rotate campaigns from any survey behind one publisher embed."
          metrics={[
            { label: "Groups", value: campaignGroups.length.toLocaleString() },
            { label: "Active", value: activeGroups.toLocaleString() },
            { label: "Publishers", value: groupPublishers.size.toLocaleString() },
          ]}
          chips={groupChips}
          ctaLabel="Manage Groups"
          href={`${base}/campaign-groups`}
        />
      </div>

      {project.evidence.length === 0 && (
        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          No evidence attached yet. Choose research methods and sources in{" "}
          <button onClick={() => router.push(`/research-projects/${projectId}/research`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research →</button>
        </p>
      )}
    </PageContainer>
  );
}

"use client";

// The Evidence Strategy workspace — where the user approves the RESEARCH
// STRATEGY, never the search terms.
//
// This page deliberately does not show keywords, platforms or query syntax. It
// shows what we need to learn, whether that evidence plausibly exists, and how we
// propose to obtain it. Searches are an implementation detail of an approved
// strategy (Phase 3), so they are summarised as an outcome, not exposed for
// editing. Reviewing search terms is what produced keyword-led research; this
// screen exists to move the review up a level.
import { useCallback, useEffect, useState } from "react";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState,
  Card, Button, StatusBadge,
} from "@/app/components/workspace-ui";
import {
  type ResearchDesign, type EvidenceRequirement, type EvidenceAvailability,
  RESEARCH_METHOD_LABEL, EVIDENCE_AVAILABILITY_LABEL,
  proposedConversationSearches, isApproved,
} from "@/lib/research-design";
import { EVIDENCE_ROLE_LABEL, EVIDENCE_ROLE_DESCRIPTION, type EvidenceRole } from "@/lib/evidence-role";
import { METHOD_FIT_LABEL, METHOD_FIT_TONE } from "@/lib/information-needs";

const AVAILABILITY_TONE: Record<EvidenceAvailability, "success" | "info" | "warning" | "neutral"> = {
  high: "success", moderate: "info", low: "warning", none: "neutral",
};

const ROLE_ORDER: EvidenceRole[] = ["direct", "comparative", "strategic"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--text)" }}>{children}</div>
    </div>
  );
}

function RequirementCard({ req, searchCount }: { req: EvidenceRequirement; searchCount: number }) {
  const s = req.evidence_strategy;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>What we need to learn</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>{req.requirement}</p>
          {req.aspect && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>Research Aspect: {req.aspect}</p>
          )}
        </div>
        <StatusBadge tone={AVAILABILITY_TONE[req.expected_availability]}
          label={EVIDENCE_AVAILABILITY_LABEL[req.expected_availability]} />
      </div>

      <Field label="Why this matters">{req.why_it_matters}</Field>

      <Field label="Expected availability">
        <span style={{ color: "var(--text-muted)" }}>{req.availability_note}</span>
      </Field>

      {req.information_needs.length > 0 && (
        <Field label="Themes to investigate">
          <ul className="space-y-1">
            {req.information_needs.map((n, i) => (
              <li key={i} className="flex gap-2"><span style={{ color: "var(--accent)" }}>·</span><span>{n}</span></li>
            ))}
          </ul>
        </Field>
      )}

      {s.comparators.length > 0 && (
        <Field label="Comparator brands, and why these">
          <ul className="space-y-1.5">
            {s.comparators.map((c, i) => (
              <li key={i}>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{c.name}</span>
                <span style={{ color: "var(--text-muted)" }}> {c.why}</span>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {s.rationale && <Field label="Why this approach">{s.rationale}</Field>}

      <Field label="Recommended research methods">
        <ul className="space-y-2">
          {s.recommended_methods.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <StatusBadge tone={METHOD_FIT_TONE[m.fit]} label={METHOD_FIT_LABEL[m.fit]} />
              <span>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{RESEARCH_METHOD_LABEL[m.method]}</span>
                <span style={{ color: "var(--text-muted)" }}> {m.rationale}</span>
              </span>
            </li>
          ))}
        </ul>
      </Field>

      {/* Coverage expectation, stated as an outcome. Deliberately no keywords. */}
      {searchCount > 0 && (
        <p className="mt-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
          On approval this creates {searchCount} conversation search{searchCount === 1 ? "" : "es"}.
        </p>
      )}
    </Card>
  );
}

export function EvidenceStrategyWorkspace() {
  const { project, loading: projectLoading } = useResearchProject();
  const projectId = project?.id;
  const [design, setDesign] = useState<ResearchDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "approve" | "searches" | null>(null);
  const [genResult, setGenResult] = useState<{ generated: { name: string; action: string }[]; skipped: { name: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/research-design`);
      const json = await res.json().catch(() => ({}));
      setDesign(res.ok ? (json.data ?? null) : null);
      if (!res.ok) setError(json.error ?? null);
    } catch { setError("Couldn't load the research design."); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function generate(confirm = false) {
    if (!projectId) return;
    setBusy("generate"); setError(null);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/research-design`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        if (window.confirm("This strategy is already approved. Designing again will discard that approval. Continue?")) {
          setBusy(null); return generate(true);
        }
      } else if (!res.ok) setError(json.error ?? "Couldn't design the research.");
      else setDesign(json.data);
    } catch { setError("Couldn't design the research."); }
    setBusy(null);
  }

  async function approve() {
    if (!projectId || !design) return;
    setBusy("approve"); setError(null);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/research-design`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design, approve: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Couldn't approve the strategy.");
      else setDesign(json.data);
    } catch { setError("Couldn't approve the strategy."); }
    setBusy(null);
  }

  async function generateSearches() {
    if (!projectId) return;
    setBusy("searches"); setError(null);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/research-design/generate-searches`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Couldn't generate the searches.");
      else setGenResult(json.data);
    } catch { setError("Couldn't generate the searches."); }
    setBusy(null);
  }

  if (projectLoading || loading) return <PageLoadingState />;

  const searches = proposedConversationSearches(design);
  const approved = isApproved(design);

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Evidence Strategy"
        description="What we need to learn, whether that evidence exists, and how we propose to obtain it."
        primaryAction={design && !approved
          ? <Button onClick={approve} disabled={busy !== null}>{busy === "approve" ? "Approving…" : "Approve strategy"}</Button>
          : undefined}
        secondaryActions={
          <Button variant="secondary" onClick={() => generate(false)} disabled={busy !== null}>
            {busy === "generate" ? "Designing…" : design ? "Design again" : "Design the research"}
          </Button>
        }
      />

      {error && <ErrorState description={error} />}

      {!design && !error && (
        <EmptyState
          title="No research design yet"
          description="Fanometrix will decide what evidence is worth collecting from the commission, before any collection begins."
        />
      )}

      {design && (
        <div className="space-y-6">
          {approved && (
            <Card className="p-4">
              <StatusBadge tone="success" label="Strategy approved" />
              <span className="ml-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {design.approved_by ? `Approved by ${design.approved_by}` : "Approved"}
                {searches.length > 0 && `, ${searches.length} conversation search${searches.length === 1 ? "" : "es"} ready to create`}.
              </span>
              {searches.length > 0 && (
                <div className="mt-3">
                  <Button onClick={generateSearches} disabled={busy !== null}>
                    {busy === "searches" ? "Generating…" : "Generate conversation searches"}
                  </Button>
                </div>
              )}
              {genResult && (
                <div className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {genResult.generated.length > 0 && (
                    <p>{genResult.generated.filter(g => g.action === "created").length} created,{" "}
                      {genResult.generated.filter(g => g.action === "updated").length} updated:{" "}
                      {genResult.generated.map(g => g.name).join(", ")}.</p>
                  )}
                  {genResult.skipped.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {genResult.skipped.map((sk, i) => (
                        <li key={i}>Not created, {sk.name}: {sk.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <p className="text-[17px] leading-relaxed" style={{ color: "var(--text)" }}>{design.strategy_summary}</p>
            {design.research_question && <Field label="Research question">{design.research_question}</Field>}
            {design.research_objective && <Field label="Research objective">{design.research_objective}</Field>}
            {design.commercial_context && <Field label="Commercial context">{design.commercial_context}</Field>}
          </Card>

          {ROLE_ORDER.map(role => {
            // Keep each requirement's index in the design so searches attribute to
            // the exact requirement that asked for them.
            const reqs = (design.requirements ?? []).map((r, i) => ({ r, i })).filter(x => x.r.role === role);
            if (!reqs.length) return null;
            return (
              <section key={role}>
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  {EVIDENCE_ROLE_LABEL[role]} Evidence
                </h2>
                <p className="mt-0.5 mb-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {EVIDENCE_ROLE_DESCRIPTION[role]}
                </p>
                <div className="space-y-3">
                  {reqs.map(({ r, i }) => (
                    <RequirementCard key={i} req={r}
                      searchCount={searches.filter(s => s.requirement_index === i).length} />
                  ))}
                </div>
              </section>
            );
          })}

          {design.not_worth_attempting.length > 0 && (
            <Card className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                Deliberately not attempted
              </p>
              <ul className="mt-2 space-y-1.5">
                {design.not_worth_attempting.map((n, i) => (
                  <li key={i} className="text-[14px] leading-relaxed flex gap-2" style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--accent)" }}>·</span><span>{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}

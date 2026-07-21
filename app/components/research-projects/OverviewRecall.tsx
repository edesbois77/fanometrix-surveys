"use client";

// "What we already know" — the Overview Recall section (docs/overview-page.md §B.3,
// docs/existing-intelligence.md). Surfaces only grounded, attributed prior
// intelligence, tiered into House Intelligence and Project Intelligence. Every
// finding shows its provenance (Sources: …) and its evidence strength. Nothing is
// fabricated: a tier with no genuine provider is shown honestly as awaiting/empty.
//
// Slice 2 of the Overview redesign. Renders only once "Our Understanding" exists.
import { useEffect, useState } from "react";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { Card, SectionHeading, StatusBadge, Icon, Eyebrow } from "@/app/components/workspace-ui";
import { hasUnderstanding } from "@/lib/understanding";
import type { ExistingIntelligence, IntelligenceFinding, EvidenceStrength } from "@/lib/intelligence/existing/types";

const STRENGTH_LABEL: Record<EvidenceStrength, string> = { strong: "Strong evidence", moderate: "Moderate evidence", limited: "Limited evidence" };
const STRENGTH_TONE: Record<EvidenceStrength, "success" | "info" | "neutral"> = { strong: "success", moderate: "info", limited: "neutral" };

export function OverviewRecall() {
  const { projectId, project } = useResearchProject();
  const present = hasUnderstanding(project?.understanding ?? null);

  const [state, setState] = useState<{ loading: boolean; data?: ExistingIntelligence; error?: string }>({ loading: true });

  useEffect(() => {
    if (!present) return;
    let cancelled = false;
    setState({ loading: true });
    fetch(`/api/research-projects/${projectId}/existing-intelligence`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setState({ loading: false, data: j.intelligence, error: j.error }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: "Couldn't gather existing intelligence." }); });
    return () => { cancelled = true; };
  }, [projectId, present]);

  if (!present) return null;

  const data = state.data;
  const house = data?.categories.find(c => c.category === "house");
  const projectTier = data?.categories.find(c => c.category === "project");

  return (
    <section className="scroll-mt-6">
      <span className="block w-10 h-0.5 rounded-full mb-5" style={{ background: "var(--accent-gold)" }} aria-hidden />
      <Eyebrow tone="accent">Existing intelligence</Eyebrow>
      <h2 className="mt-3 text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>What we already know</h2>
      <p className="mt-2 text-[15px] leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
        Before proposing any research, here is what Fanometrix can already evidence about this problem — every point traceable to a real source.
      </p>

      {state.loading ? (
        <Card className="mt-6">
          <div className="flex items-center gap-3 py-4">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md" style={{ background: "#F2E6C8", color: "#8A6D2F" }}><Icon.search size={15} /></span>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Searching everything we already know about this problem…</p>
          </div>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {/* House Intelligence */}
          <Tier
            title="House Intelligence"
            subtitle="Fanometrix's own football, category and benchmark knowledge."
            providers={house?.providers ?? []}
            emptyNote="Awaiting its first provider. Fanometrix's own football and category intelligence will appear here as it comes online."
          />
          {/* Project Intelligence */}
          <Tier
            title="Project Intelligence"
            subtitle="Evidence from your organisation's own research — projects, library and prior findings."
            providers={projectTier?.providers ?? []}
            emptyNote="No prior evidence from your organisation bears on this problem yet. As you run research, this will grow."
          />
        </div>
      )}
    </section>
  );
}

function Tier({ title, subtitle, providers, emptyNote }: {
  title: string; subtitle: string; providers: { id: string; name: string; findings: IntelligenceFinding[] }[]; emptyNote: string;
}) {
  const findings = providers.flatMap(p => p.findings);
  return (
    <Card padding="lg">
      <SectionHeading title={title} description={subtitle} />
      {findings.length === 0 ? (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-lg" style={{ background: "var(--surface-sunken)" }}>
          <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-tertiary)" }}><Icon.info size={14} /></span>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{emptyNote}</p>
        </div>
      ) : (
        <div className="mt-4 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {findings.map((f, i) => <Finding key={i} finding={f} />)}
        </div>
      )}
    </Card>
  );
}

function Finding({ finding }: { finding: IntelligenceFinding }) {
  return (
    <div className="py-3.5 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{finding.statement}</p>
        <span className="flex-shrink-0"><StatusBadge label={STRENGTH_LABEL[finding.strength]} tone={STRENGTH_TONE[finding.strength]} size="sm" /></span>
      </div>
      {finding.detail && <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{finding.detail}</p>}
      <p className="text-[11px] mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" style={{ color: "var(--text-tertiary)" }}>
        <span className="font-semibold uppercase tracking-wide">Sources:</span>
        {finding.sources.map((s, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mr-1.5" aria-hidden>·</span>}
            {s.href
              ? <a href={s.href} className="hover:underline" style={{ color: "var(--accent-ink)" }}>{s.label}</a>
              : <span>{s.label}</span>}
          </span>
        ))}
      </p>
    </div>
  );
}

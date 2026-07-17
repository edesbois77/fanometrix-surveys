"use client";

// The Campaign Dashboard's Overview section — a calm operational summary in the
// project's own visual language (workspace-ui), NOT the legacy analytics screen.
// Headline KPIs + the key deployment facts, at a glance. The detailed charts,
// filters and response table live in the Performance section; the embed builder
// in Deployment.
import { useCreativeDesignNames } from "@/lib/creative-designs";
import { countryByCode } from "@/lib/countries";
import { Card, MetricTile } from "@/app/components/workspace-ui";
import type { Campaign } from "@/app/components/campaigns/types";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="text-sm font-semibold mt-0.5 truncate" style={{ color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

export function CampaignOverview({ campaign: c, orgName }: {
  campaign: Campaign;
  orgName: (id: string | null) => string;
}) {
  const designNames = useCreativeDesignNames();
  const target = c.effective_target_responses ?? c.target_responses;
  const count = c.response_count;
  const pct = target && target > 0 ? Math.min(100, Math.round((count / target) * 100)) : null;

  const endStr = c.effective_end_date ?? c.end_date;
  const end = endStr ? new Date(endStr) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;

  const country = c.market || (c.country_code ? countryByCode(c.country_code)?.name ?? c.country_code : null);
  const creative = designNames[(c.effective_creative_design ?? c.creative_design) ?? ""] ?? "Fanometrix Default";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Responses"
          value={count.toLocaleString()}
          caption={target ? `of ${target.toLocaleString()} target` : "No target set"}
          target={pct !== null ? { pct, label: "Progress" } : undefined}
        />
        <MetricTile label="Completion" value={pct !== null ? `${pct}%` : "—"} />
        <MetricTile
          label="Days remaining"
          value={daysLeft !== null ? Math.max(0, daysLeft) : "—"}
          caption={daysLeft !== null && daysLeft <= 0 ? "Ended" : undefined}
        />
        <MetricTile label="Started" value={c.start_date ? fmtDate(c.start_date) : "Not scheduled"} />
      </div>

      <Card padding="md">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <Fact label="Publisher">{orgName(c.publisher_org_id) || "—"}</Fact>
          <Fact label="Market">{country || "—"}</Fact>
          <Fact label="Survey">{c.surveys?.name || "—"}</Fact>
          <Fact label="Dates">{fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : "ongoing"}</Fact>
          <Fact label="Creative">{creative}</Fact>
          <Fact label="Campaign ID"><span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{c.campaign_id}</span></Fact>
        </div>
      </Card>
    </div>
  );
}

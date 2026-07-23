// The Audience Intelligence Report itself.
//
// Named sections, in a fixed narrative order, driven entirely by the computed
// model. It answers "what did we learn together from this campaign", not "how
// did this publisher perform" — which is why the language throughout is
// partnership-first and every comparison is against the campaign, never against
// another partner. No other publisher is named or measured anywhere in this
// file, by construction: the model it renders only ever contains the campaigns
// in this report's own scope.
//
// It is also a document that gets forwarded. Someone who opens it cold, three
// levels up from the person who commissioned it, should understand the value in
// the first screen and be able to read any single section on its own.

import { MetricInfo } from "@/app/components/metrics/MetricInfo";
import { CONFIDENCE_MEANING, MIN_REPORTABLE_SAMPLE } from "@/lib/reports/stats";
import { formatHour } from "@/lib/reports/engine";
import type { AudienceIntelligenceReport } from "@/lib/reports/types";
import { AnswerBars, FunnelStages, HourlyColumns, IndexBars, PairedBars } from "./Charts";
import { Band, Callout, Card, ConfidenceBadge, MetadataPanel, Prose, SectionHeader, StatTile, Table } from "./Document";
import { DownloadBar } from "./DownloadBar";
import { GOLD, INK, NAVY, SANS } from "../theme";

const int = (n: number) => Math.round(n).toLocaleString("en-GB");
const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "20 to 23 July 2026", collapsing the month and year when both ends share
 *  them. A date range that repeats "July 2026" twice reads as a form field. */
function formatRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  if (sameMonth) {
    return `${from.getUTCDate()} to ${to.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })}`;
  }
  return `${formatDate(fromIso)} to ${formatDate(toIso)}`;
}

function formatDateTime(iso: string): string {
  return `${new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })} at ${new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function ReportDocument({ model }: { model: AudienceIntelligenceReport }) {
  const { report, window: win, totals, markets, hourly, hourlyInsight, creative, questions } = model;

  const confirmed = model.findings.filter((f) => f.kind === "confirmed");
  const possible = model.findings.filter((f) => f.kind === "possible");
  const reportableMarkets = markets.filter((m) => m.sampleSize >= MIN_REPORTABLE_SAMPLE);

  // The provenance strip, shown on the cover and repeated at the close. Built
  // once so the two can never drift apart.
  const metadataItems = [
    { label: "Report status", value: win.statusLabel, emphasis: true },
    { label: "Reporting period", value: formatRange(win.firstEvent, win.lastEvent) },
    { label: "Data through", value: formatDateTime(win.dataThrough) },
    { label: "Report generated", value: formatDateTime(win.generatedAt) },
    { label: "Version", value: `v${report.version}.0` },
  ];

  // The contents list, and the same numbering the section headers carry. The
  // creative section only exists when a campaign actually ran more than one
  // creative, so the spine is built from what is in the report rather than
  // assumed, and the numbers stay contiguous either way.
  const contents = [
    { id: "highlights", label: "Highlights" },
    { id: "executive-summary", label: "Executive Summary" },
    { id: "audience-reach", label: "Audience Reach" },
    { id: "engagement-trends", label: "Engagement Trends" },
    { id: "country-performance", label: "Country Performance" },
    ...(creative ? [{ id: "creative-comparison", label: "Creative Comparison" }] : []),
    { id: "what-fans-told-us", label: "What Fans Told Us" },
    { id: "what-we-learned", label: "What We Learned" },
    { id: "value-delivered", label: "Value Delivered" },
    { id: "recommendations", label: "Recommendations" },
    { id: "downloads", label: "Downloads" },
    { id: "methodology", label: "Methodology and Limits" },
  ];
  const no = (id: string) => contents.findIndex((c) => c.id === id) + 1;

  return (
    <article style={{ font: SANS, color: INK.primary, background: INK.surface }}>
      {/* ── 1. Cover ────────────────────────────────────────────────────── */}
      <header style={{ background: NAVY, color: "#FFFFFF", borderBottom: `3px solid ${GOLD}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 40px 56px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 32,
              flexWrap: "wrap",
              paddingBottom: 30,
              marginBottom: 64,
              borderBottom: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <span
              style={{
                font: SANS,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Fanometrix
            </span>
            <span style={{ font: SANS, fontSize: 11.5, letterSpacing: "0.06em", color: "rgba(255,255,255,0.5)" }}>
              Confidential
            </span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 40,
              flexWrap: "wrap",
              marginBottom: 44,
            }}
          >
            <div style={{ minWidth: 280 }}>
              <div
                style={{
                  font: SANS,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 16,
                }}
              >
                Prepared for
              </div>
              {/* The partner's mark when one has been supplied; their name set in
                  display type when not. The second is a design, not a gap. */}
              {report.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.logoUrl}
                  alt={report.organisationName}
                  style={{ height: 52, width: "auto", display: "block", maxWidth: 320 }}
                />
              ) : (
                <div
                  style={{
                    font: SANS,
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: "-0.035em",
                    lineHeight: 1,
                  }}
                >
                  {report.organisationName}
                </div>
              )}
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                border: `1px solid ${win.interim ? GOLD : "rgba(255,255,255,0.4)"}`,
                borderRadius: 999,
                padding: "8px 18px",
                font: SANS,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: win.interim ? GOLD : "#FFFFFF",
                whiteSpace: "nowrap",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: win.interim ? GOLD : "#FFFFFF",
                  display: "inline-block",
                }}
              />
              {win.statusLabel} report
            </div>
          </div>

          <h1
            style={{
              font: SANS,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              color: "#FFFFFF",
              margin: "0 0 14px",
              maxWidth: 780,
            }}
          >
            {report.reportTitle}
          </h1>
          <div
            style={{
              font: SANS,
              fontSize: 18,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.66)",
              maxWidth: 780,
            }}
          >
            {report.campaignTitle}
          </div>
          {report.researchQuestion && (
            <div
              style={{
                font: SANS,
                fontSize: 15,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.5)",
                maxWidth: 700,
                marginTop: 20,
                paddingLeft: 18,
                borderLeft: `2px solid ${GOLD}`,
              }}
            >
              {report.researchQuestion}
            </div>
          )}

          <div style={{ marginTop: 52 }}>
            <MetadataPanel onDark items={metadataItems} />
          </div>

          <nav
            className="report-no-print"
            style={{
              marginTop: 44,
              paddingTop: 28,
              borderTop: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div
              style={{
                font: SANS,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                marginBottom: 18,
              }}
            >
              Contents
            </div>
            <ol
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "12px 32px",
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {contents.map((c, i) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    style={{
                      font: SANS,
                      fontSize: 13,
                      color: "rgba(255,255,255,0.72)",
                      textDecoration: "none",
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {c.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </header>

      {/* ── 2. Highlights ───────────────────────────────────────────────── */}
      <Band tone="surface" id="highlights">
        <SectionHeader
          number={no("highlights")}
          eyebrow="Highlights"
          title="What we learned together"
          standfirst={
            report.researchQuestion
              ? `${report.organisationName}'s audience answered a question ${report.brandName} could not answer any other way: ${lowerFirst(report.researchQuestion)}`
              : `${report.organisationName}'s audience answered a question ${report.brandName} could not answer any other way.`
          }
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            background: INK.surface,
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${INK.hairline}`,
          }}
        >
          {model.highlights.map((h) => (
            <div
              key={h.label}
              style={{
                background: INK.surface,
                padding: "28px 26px",
                breakInside: "avoid",
                borderRight: `1px solid ${INK.hairline}`,
                borderBottom: `1px solid ${INK.hairline}`,
                marginRight: -1,
                marginBottom: -1,
              }}
            >
              <div
                style={{
                  font: SANS,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: INK.tertiary,
                  marginBottom: 12,
                }}
              >
                {h.label}
              </div>
              <div
                style={{
                  font: SANS,
                  fontSize: 27,
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                  marginBottom: 10,
                }}
              >
                {h.value}
              </div>
              <div style={{ font: SANS, fontSize: 13, lineHeight: 1.6, color: INK.secondary }}>{h.detail}</div>
            </div>
          ))}
        </div>
      </Band>

      {/* ── 3. Executive Summary ────────────────────────────────────────── */}
      <Band tone="page" id="executive-summary">
        <SectionHeader
          number={no("executive-summary")}
          eyebrow="Executive Summary"
          title="The campaign in numbers"
          standfirst="Every figure below is computed from live campaign data at the moment this page was opened. Hover any metric name for its exact definition."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <StatTile
            label="Impressions delivered"
            value={int(totals.counts.loads)}
            sub="Times the survey was served into the reading experience."
          />
          <StatTile
            label="Survey starts"
            value={int(totals.counts.starts)}
            sub="Fans who answered the first question."
          />
          <StatTile
            label="Completed responses"
            value={int(totals.counts.completed)}
            sub="The usable research sample."
            emphasis
          />
          <StatTile label="Start rate" value={pct(totals.rates.startRate, 3)} sub="Starts as a share of impressions." />
          <StatTile
            label="Completion rate"
            value={pct(totals.rates.completionRate, 0)}
            sub="Of those who started, the share who finished."
          />
          <StatTile
            label="Typical completion time"
            value={`${totals.medianCompletionSeconds}s`}
            sub={`Half of fans finished faster. The average of ${totals.meanCompletionSeconds}s is pulled up by a handful of backgrounded tabs.`}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          <Card>
            <MetricLabel label="Research confidence" metricId="margin_of_error" />
            <div style={{ font: SANS, fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: "10px 0 8px" }}>
              ±{totals.marginOfError.toFixed(1)}%
            </div>
            <div style={{ font: SANS, fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
              At 95% confidence on {int(totals.counts.completed)} completed responses. Fanometrix rates this sample{" "}
              <strong style={{ color: INK.primary }}>{totals.sampleQuality}</strong>.
            </div>
          </Card>
          <Card>
            <MetricLabel label="Audience context" metricId="impressions_loads" />
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {totals.devices.map((d) => (
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", font: SANS, fontSize: 13.5 }}>
                  <span style={{ color: INK.secondary }}>{d.label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {d.share > 0 && d.share < 0.001 ? "<0.1%" : pct(d.share, 1)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Band>

      {/* ── 4. Audience Reach ───────────────────────────────────────────── */}
      <Band tone="surface" id="audience-reach">
        <SectionHeader
          number={no("audience-reach")}
          eyebrow="Audience Reach"
          title="From impression to insight"
          standfirst="How a served impression became a completed piece of research. Each stage is measured against the one above it, so nothing is flattered by a favourable denominator."
        />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: 48, alignItems: "start" }} className="report-two-col">
          <Card>
            <FunnelStages
              stages={[
                { label: "Impressions delivered", value: totals.counts.loads, ratio: null },
                ...(model.viewabilityWindow
                  ? [
                      {
                        label: "Entered the fan's viewport",
                        value: totals.counts.viewable,
                        ratio: model.viewabilityWindow.rate,
                        ratioLabel: "of measured impressions",
                      },
                    ]
                  : []),
                {
                  label: "Started the survey",
                  value: totals.counts.starts,
                  ratio: totals.rates.startRate,
                  ratioLabel: "of impressions",
                },
                {
                  label: "Reached the final question",
                  value: totals.counts.reachedFinalQuestion,
                  ratio:
                    totals.counts.starts > 0 ? totals.counts.reachedFinalQuestion / totals.counts.starts : 0,
                  ratioLabel: "of starts",
                },
                {
                  label: "Completed every question",
                  value: totals.counts.completed,
                  ratio: totals.rates.completionRate,
                  ratioLabel: "of starts",
                },
              ]}
            />
          </Card>
          <div style={{ display: "grid", gap: 20 }}>
            <Prose>
              {int(totals.counts.loads)} impressions across {totals.markets} markets produced{" "}
              {int(totals.counts.completed)} completed responses, which is {totals.rates.responsesPer10k.toFixed(1)} for every
              10,000 impressions delivered. That ratio is the single number worth carrying into the next campaign: it is
              what turns inventory into research.
            </Prose>
            {model.viewabilityWindow && (
              <Callout title="Delivery quality">
                {pct(model.viewabilityWindow.rate, 0)} of impressions entered the fan&apos;s viewport during the window in
                which viewability was measured. Volume is reaching real screens rather than loading out of view, which is
                what makes the engagement rates below meaningful rather than diluted.
              </Callout>
            )}
          </div>
        </div>
      </Band>

      {/* ── 5. Engagement Trends ────────────────────────────────────────── */}
      <Band tone="page" id="engagement-trends">
        <SectionHeader
          number={no("engagement-trends")}
          eyebrow="Engagement Trends"
          title="When this audience is reachable"
          standfirst="Every hour is expressed in the fan's own local time, so the pattern is a media-planning input rather than a server-log artefact."
        />
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 40 }}>
            <HourlyColumns data={hourly} valueKey="loads" label="Impressions by hour" />
            <HourlyColumns data={hourly} valueKey="starts" label="Survey starts by hour" />
            <HourlyColumns data={hourly} valueKey="completed" label="Completed responses by hour" />
            <HourlyColumns
              data={hourly}
              valueKey="startRate"
              label="Start rate by hour"
              format="percent"
              highlightHour={hourlyInsight.bestEngagementHour}
            />
          </div>
        </Card>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <StatTile
            label="Peak delivery hour"
            value={formatHour(hourlyInsight.peakHour)}
            sub={`${int(hourlyInsight.peakLoads)} impressions, the busiest hour of the campaign.`}
          />
          <StatTile
            label="Quietest hour"
            value={formatHour(hourlyInsight.quietHour)}
            sub={`${int(hourlyInsight.quietLoads)} impressions.`}
          />
          <StatTile
            label="Strongest engagement"
            value={formatHour(hourlyInsight.bestEngagementHour)}
            sub="Highest start rate among hours carrying enough starts to compare."
          />
        </div>

        {hourlyInsight.observations.length > 0 && (
          <div style={{ marginTop: 28, display: "grid", gap: 14 }}>
            {hourlyInsight.observations.map((o, i) => (
              <Callout key={i} tone="neutral">
                {o}
              </Callout>
            ))}
          </div>
        )}
      </Band>

      {/* ── 6. Country Performance ──────────────────────────────────────── */}
      <Band tone="surface" id="country-performance">
        <SectionHeader
          number={no("country-performance")}
          eyebrow="Country Performance"
          title="Where the audience answered"
          standfirst="Each market is indexed against this campaign's own average, set at 100. The comparison is a market against the campaign it belongs to, never against another publisher, whose delivery and commercial performance appear nowhere in this report."
        />

        <div style={{ marginBottom: 40 }}>
          <Card>
            <IndexBars
              label="Completed responses per impression, indexed"
              rows={markets.map((m) => ({ label: m.label, index: m.index.responseRate, note: m.note }))}
            />
          </Card>
        </div>

        <Table
          caption="Full market detail. Rates are stated against the stage above them."
          columns={[
            { key: "market", label: "Market" },
            { key: "loads", label: "Impressions", align: "right" },
            { key: "starts", label: "Starts", align: "right" },
            { key: "completed", label: "Completed", align: "right" },
            { key: "startRate", label: "Start rate", align: "right" },
            { key: "completionRate", label: "Completion rate", align: "right" },
            { key: "per10k", label: "Per 10k", align: "right" },
            { key: "index", label: "Index", align: "right" },
          ]}
          rows={markets.map((m) => ({
            market: (
              <span>
                {m.label}
                {m.note ? <sup style={{ color: INK.tertiary }}> *</sup> : null}
                {m.sampleSize < MIN_REPORTABLE_SAMPLE && (
                  <span style={{ color: INK.tertiary, fontSize: 12 }}> · small sample</span>
                )}
              </span>
            ),
            loads: int(m.counts.loads),
            starts: int(m.counts.starts),
            completed: int(m.counts.completed),
            startRate: pct(m.rates.startRate, 3),
            completionRate: pct(m.rates.completionRate, 0),
            per10k: m.rates.responsesPer10k.toFixed(1),
            index: <strong>{m.index.responseRate}</strong>,
          }))}
        />

        <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
          {markets
            .filter((m) => m.note)
            .map((m) => (
              <Callout key={m.key} title={`Note on ${m.label}`}>
                {m.note}
              </Callout>
            ))}
          {markets.some((m) => m.sampleSize < MIN_REPORTABLE_SAMPLE) && (
            <Callout title="On small samples">
              Markets returning fewer than {MIN_REPORTABLE_SAMPLE} completed responses are shown in full, but their
              differences from the campaign average cannot yet be separated from normal variation. They are reported,
              not concluded from.
            </Callout>
          )}
        </div>
      </Band>

      {/* ── 7. Creative Comparison ──────────────────────────────────────── */}
      {creative && (
        <Band tone="page" id="creative-comparison">
          <SectionHeader
            number={no("creative-comparison")}
            eyebrow="Creative Comparison"
            title={`${creative.variant.label} against ${creative.baseline.label}`}
            standfirst="Both creatives ran the same survey, on the same inventory, in the same market. Every measure is normalised, so a difference in delivery volume cannot flatter either one."
          />

          <Card>
            <PairedBars
              label="Normalised performance"
              seriesA={creative.baseline.label}
              seriesB={creative.variant.label}
              rows={creative.measures.map((m) => ({
                label: m.label,
                a: m.baseline,
                b: m.variant,
                format: m.format === "rate_per_10k" ? "rate_per_10k" : "percent",
                muted: m.inconclusive,
              }))}
            />
          </Card>

          <div style={{ marginTop: 28 }}>
            <Table
              columns={[
                { key: "measure", label: "Measure" },
                { key: "baseline", label: creative.baseline.label, align: "right" },
                { key: "variant", label: creative.variant.label, align: "right" },
                { key: "change", label: "Change", align: "right" },
                { key: "confidence", label: "Confidence" },
              ]}
              rows={creative.measures.map((m) => ({
                measure: (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {m.label}
                    <MetricInfo metricId={m.metricId} />
                  </span>
                ),
                baseline: m.format === "rate_per_10k" ? m.baseline.toFixed(1) : pct(m.baseline, m.baseline < 0.01 ? 3 : 1),
                variant: m.format === "rate_per_10k" ? m.variant.toFixed(1) : pct(m.variant, m.variant < 0.01 ? 3 : 1),
                change: m.inconclusive ? (
                  <span style={{ color: INK.tertiary }}>No clear difference</span>
                ) : (
                  <strong>{`${(m.change ?? 0) > 0 ? "+" : ""}${Math.round((m.change ?? 0) * 100)}%`}</strong>
                ),
                confidence: <ConfidenceBadge confidence={m.confidence} />,
              }))}
            />
          </div>

          <div style={{ marginTop: 28, display: "grid", gap: 16 }}>
            <Callout title="Volume delivered">
              {creative.baseline.label}: {int(creative.baseline.counts.loads)} impressions,{" "}
              {int(creative.baseline.counts.completed)} completed responses. {creative.variant.label}:{" "}
              {int(creative.variant.counts.loads)} impressions, {int(creative.variant.counts.completed)} completed
              responses. All comparisons above are per-impression, so the difference in volume does not affect them.
            </Callout>
            {creative.caveats.map((c, i) => (
              <Callout key={i} title={i === 0 ? "How to read this comparison" : `Also worth knowing (${i + 1})`} tone="neutral">
                {c}
              </Callout>
            ))}
          </div>
        </Band>
      )}

      {/* ── 8. What Fans Told Us ────────────────────────────────────────── */}
      <Band tone="surface" id="what-fans-told-us">
        <SectionHeader
          number={no("what-fans-told-us")}
          eyebrow="What Fans Told Us"
          title="The answers themselves"
          standfirst={`Every completed response, shown in full. Differences between markets appear only where the sample supports them; everything else is presented without commentary rather than over-read.`}
        />

        <div style={{ display: "grid", gap: 48 }}>
          {questions.map((q, qi) => (
            <div key={q.id} style={{ breakInside: "avoid" }}>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "baseline",
                  marginBottom: 22,
                  paddingBottom: 16,
                  borderBottom: `1px solid ${INK.hairline}`,
                }}
              >
                <span
                  style={{
                    font: SANS,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#8A6D2F",
                    letterSpacing: "0.06em",
                  }}
                >
                  Q{qi + 1}
                </span>
                <h3
                  style={{
                    font: SANS,
                    fontSize: 21,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {q.text}
                </h3>
                <span style={{ font: SANS, fontSize: 12.5, color: INK.tertiary, whiteSpace: "nowrap" }}>
                  n = {q.sampleSize}
                </span>
              </div>

              <div
                style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 40 }}
                className="report-two-col"
              >
                <div>
                  <div
                    style={{
                      font: SANS,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: INK.tertiary,
                      marginBottom: 14,
                    }}
                  >
                    All markets
                  </div>
                  <AnswerBars options={q.options} />
                </div>

                <div>
                  <div
                    style={{
                      font: SANS,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: INK.tertiary,
                      marginBottom: 14,
                    }}
                  >
                    By market
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 22 }}>
                    {q.byMarket.map((m) => (
                      <div key={m.market}>
                        <div
                          style={{
                            font: SANS,
                            fontSize: 12.5,
                            fontWeight: 600,
                            marginBottom: 8,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span style={{ color: m.belowThreshold ? INK.tertiary : INK.primary }}>{m.market}</span>
                          <span style={{ color: INK.tertiary, fontWeight: 500 }}>n={m.sampleSize}</span>
                        </div>
                        <AnswerBars options={m.options} compact />
                        {m.belowThreshold && (
                          <div style={{ font: SANS, fontSize: 11, color: INK.tertiary, marginTop: 6 }}>
                            Below the reporting threshold. Shown, not concluded from.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {q.notableDifferences.length > 0 && (
                <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
                  {q.notableDifferences.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 16,
                        alignItems: "flex-start",
                        background: INK.paper,
                        border: `1px solid ${INK.paperLine}`,
                        borderRadius: 10,
                        padding: "16px 20px",
                      }}
                    >
                      <div style={{ flex: 1, font: SANS, fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
                        {d.statement}
                      </div>
                      <ConfidenceBadge confidence={d.confidence} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Band>

      {/* ── 9. What We Learned ──────────────────────────────────────────── */}
      <Band tone="page" id="what-we-learned">
        <SectionHeader
          number={no("what-we-learned")}
          eyebrow="What We Learned"
          title="Confirmed findings, and the explanations still open"
          standfirst="These two lists are deliberately separate. The first is what the data establishes. The second is what the data is consistent with but has not yet proved, and is written as a question rather than an answer."
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32 }}>
          <div>
            <ListHeading
              title="Confirmed findings"
              subtitle="Tested and supported by the evidence collected."
              accent="#3F5D42"
            />
            <div style={{ display: "grid", gap: 14 }}>
              {confirmed.map((f, i) => (
                <Card key={i} pad={22}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 10 }}>
                    <h4
                      style={{
                        font: SANS,
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {f.title}
                    </h4>
                    <ConfidenceBadge confidence={f.confidence} />
                  </div>
                  <p style={{ font: SANS, fontSize: 13.5, lineHeight: 1.65, color: INK.secondary, margin: 0 }}>
                    {f.detail}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <ListHeading
              title="Possible explanations"
              subtitle="Consistent with the data. Not established by it."
              accent="#6B6459"
            />
            <div style={{ display: "grid", gap: 14 }}>
              {possible.map((f, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px dashed ${INK.hairline}`,
                    borderRadius: 12,
                    background: INK.surface,
                    padding: 22,
                    breakInside: "avoid",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 10 }}>
                    <h4
                      style={{
                        font: SANS,
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {f.title}
                    </h4>
                    <ConfidenceBadge confidence={f.confidence} />
                  </div>
                  <p style={{ font: SANS, fontSize: 13.5, lineHeight: 1.65, color: INK.secondary, margin: 0 }}>
                    {f.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 36 }}>
          <Callout title="How to read the confidence labels">
            <div style={{ display: "grid", gap: 8 }}>
              {(["high", "moderate", "early"] as const).map((c) => (
                <div key={c} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <ConfidenceBadge confidence={c} />
                  <span>{CONFIDENCE_MEANING[c]}</span>
                </div>
              ))}
            </div>
          </Callout>
        </div>
      </Band>

      {/* ── 10. Value Delivered ─────────────────────────────────────────── */}
      <Band tone="navy" id="value-delivered">
        <SectionHeader
          number={no("value-delivered")}
          eyebrow="Value Delivered"
          title={model.valueDelivered.headline}
          standfirst="Research on publisher inventory is not an interruption to the reading experience. Done well, it is a second product the same audience produces."
          onDark
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
          {model.valueDelivered.points.map((p) => (
            <div
              key={p.label}
              style={{ borderTop: `2px solid ${GOLD}`, paddingTop: 22, breakInside: "avoid" }}
            >
              <div
                style={{
                  font: SANS,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: GOLD,
                  marginBottom: 12,
                }}
              >
                {p.label}
              </div>
              <div
                style={{
                  font: SANS,
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#FFFFFF",
                  marginBottom: 12,
                  lineHeight: 1.2,
                }}
              >
                {p.value}
              </div>
              <div style={{ font: SANS, fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,0.72)" }}>
                {p.detail}
              </div>
            </div>
          ))}
        </div>
      </Band>

      {/* ── 11. Recommendations ─────────────────────────────────────────── */}
      <Band tone="surface" id="recommendations">
        <SectionHeader
          number={no("recommendations")}
          eyebrow="Recommendations"
          title="What to do next"
          standfirst="Each recommendation names the evidence it rests on. Where the evidence is thin, the recommendation is to test rather than to act."
        />
        <div style={{ display: "grid", gap: 18 }}>
          {model.recommendations.map((r, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                gap: 24,
                border: `1px solid ${INK.hairline}`,
                borderRadius: 12,
                padding: "26px 28px",
                breakInside: "avoid",
              }}
            >
              <div
                style={{
                  font: SANS,
                  fontSize: 26,
                  fontWeight: 700,
                  color: GOLD,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h4
                  style={{
                    font: SANS,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    margin: "0 0 10px",
                    lineHeight: 1.35,
                  }}
                >
                  {r.title}
                </h4>
                <p style={{ font: SANS, fontSize: 14.5, lineHeight: 1.7, color: INK.secondary, margin: "0 0 12px" }}>
                  {r.detail}
                </p>
                <div style={{ font: SANS, fontSize: 12.5, color: INK.tertiary }}>
                  <strong style={{ color: INK.secondary, fontWeight: 600 }}>Based on:</strong> {r.basis}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Band>

      {/* ── 12. Downloads ───────────────────────────────────────────────── */}
      <Band tone="page" id="downloads">
        <SectionHeader
          number={no("downloads")}
          eyebrow="Downloads"
          title="Take the data with you"
          standfirst="The full dataset behind every figure in this report, in the formats an analyst and a board deck each need."
        />
        <DownloadBar orgSlug={report.orgSlug} reportSlug={report.reportSlug} />
      </Band>

      {/* ── Methodology ─────────────────────────────────────────────────── */}
      <Band tone="surface" id="methodology">
        <SectionHeader
          number={no("methodology")}
          eyebrow="Methodology and limits"
          title="How these numbers were produced"
          standfirst="A report that cannot be checked is not research. This is what was measured, how, and where the limits are."
        />
        <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
          {model.methodology.map((m, i) => (
            <p key={i} style={{ font: SANS, fontSize: 14.5, lineHeight: 1.75, color: INK.secondary, margin: 0 }}>
              {m}
            </p>
          ))}
        </div>

        {reportableMarkets.length > 0 && (
          <div style={{ marginTop: 36, maxWidth: 760 }}>
            <Callout title="Precision by market">
              {markets
                .map((m) => `${m.label} n=${m.sampleSize}`)
                .join(" · ")}
              . Precision improves with the square root of the sample, so a market with a quarter of the responses
              carries roughly twice the margin of error.
            </Callout>
          </div>
        )}

        <div style={{ marginTop: 44, maxWidth: 760 }}>
          <MetadataPanel items={metadataItems} compact />
        </div>

        <footer
          style={{
            marginTop: 48,
            paddingTop: 28,
            borderTop: `1px solid ${INK.hairline}`,
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            font: SANS,
            fontSize: 12,
            color: INK.tertiary,
          }}
        >
          <span>
            {report.reportTitle} · prepared for {report.organisationName} · {report.campaignTitle}
          </span>
          <span>Generated {formatDateTime(new Date().toISOString())}</span>
        </footer>
      </Band>
    </article>
  );
}

function ListHeading({ title, subtitle, accent }: { title: string; subtitle: string; accent: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 2, background: accent, display: "inline-block" }}
        />
        <h3 style={{ font: SANS, fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", margin: 0 }}>{title}</h3>
      </div>
      <p style={{ font: SANS, fontSize: 13, color: INK.tertiary, margin: 0, paddingLeft: 18 }}>{subtitle}</p>
    </div>
  );
}

function MetricLabel({ label, metricId }: { label: string; metricId: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: SANS,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: INK.tertiary,
      }}
    >
      {label}
      <MetricInfo metricId={metricId} />
    </div>
  );
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

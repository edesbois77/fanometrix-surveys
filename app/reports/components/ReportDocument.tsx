// The Audience Intelligence Report itself.
//
// Section bodies are written once here and assembled in whatever order the
// report's narrative profile asks for (lib/reports/narrative.ts). That is what
// makes a brand or agency variant a profile rather than a second document: the
// measurement is identical, the emphasis is not.
//
// The bar this report is written to is not "here are the results". It is: if I
// were the Head of Commercial at this publisher, what would I do differently
// tomorrow because I read this? Every section has to earn its place against
// that question, which is why the decisions come before the delivery metrics,
// why what fans said comes before how it was collected, and why the method sits
// at the back where a reader who wants to check it can find it and a reader who
// does not is never detained by it.
//
// No other publisher is named or measured anywhere in this file, by
// construction: the model it renders only ever contains this report's own
// campaigns.

import { MetricInfo } from "@/app/components/metrics/MetricInfo";
import { CONFIDENCE_MEANING, MIN_REPORTABLE_SAMPLE } from "@/lib/reports/stats";
import { formatHour } from "@/lib/reports/engine";
import { profileFor, type SectionId } from "@/lib/reports/narrative";
import type { AudienceIntelligenceReport } from "@/lib/reports/types";
import { AnswerBars, FunnelStages, HourlyColumns, IndexBars, PairedBars } from "./Charts";
import {
  Band,
  Callout,
  Card,
  ConfidenceBadge,
  MetadataPanel,
  Prose,
  SectionHeader,
  StatTile,
  Table,
} from "./Document";
import { CreativeGallery } from "./CreativeGallery";
import { DownloadBar } from "./DownloadBar";
import { SectionNav } from "./SectionNav";
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
  const profile = profileFor(report.audience);

  const confirmed = model.findings.filter((f) => f.kind === "confirmed");
  const possible = model.findings.filter((f) => f.kind === "possible");

  const metadataItems = [
    { label: "Report status", value: win.statusLabel, emphasis: true },
    { label: "Reporting period", value: formatRange(win.firstEvent, win.lastEvent) },
    { label: "Data through", value: formatDateTime(win.dataThrough) },
    { label: "Report generated", value: formatDateTime(win.generatedAt) },
    { label: "Version", value: `v${report.version}.0` },
  ];

  // The gallery renders the real embed components, so it needs the survey in
  // the shape those components take. It is the same instrument fans answered.
  const galleryQuestions = questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options.map((o) => ({ id: o.id, text: o.label })),
  }));

  // ── Section bodies ─────────────────────────────────────────────────────────
  // Written once, ordered by the profile. A section with nothing to say is null
  // and drops out of the document, the contents and the numbering.

  const bodies: Partial<Record<SectionId, React.ReactNode>> = {
    "highlights": (
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
    ),

    "executive-summary": (
      <>
        <div style={{ display: "grid", gap: 18, marginBottom: 48 }}>
          {model.decisions.map((d, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr",
                gap: 24,
                border: `1px solid ${INK.hairline}`,
                borderLeft: `3px solid ${GOLD}`,
                borderRadius: 12,
                background: INK.surface,
                padding: "26px 30px",
                breakInside: "avoid",
              }}
            >
              <div
                style={{
                  font: SANS,
                  fontSize: 24,
                  fontWeight: 700,
                  color: GOLD,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                  <h3
                    style={{
                      font: SANS,
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {d.headline}
                  </h3>
                  <ConfidenceBadge confidence={d.confidence} />
                </div>
                <p style={{ font: SANS, fontSize: 15, lineHeight: 1.65, color: INK.secondary, margin: "0 0 16px" }}>
                  {d.action}
                </p>
                {d.worth && (
                  <div
                    style={{
                      font: SANS,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "#8A6D2F",
                      background: INK.paper,
                      border: `1px solid ${INK.paperLine}`,
                      borderRadius: 8,
                      padding: "12px 16px",
                      marginBottom: 14,
                    }}
                  >
                    <strong style={{ fontWeight: 700 }}>What it is worth: </strong>
                    {d.worth}
                  </div>
                )}
                <div style={{ font: SANS, fontSize: 12.5, color: INK.tertiary, lineHeight: 1.6 }}>
                  <strong style={{ color: INK.secondary, fontWeight: 600 }}>The evidence: </strong>
                  {d.evidence}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            font: SANS,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: INK.tertiary,
            marginBottom: 18,
          }}
        >
          The campaign in numbers
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
            marginBottom: 32,
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
          <StatTile
            label="Start rate"
            value={pct(totals.rates.startRate, 3)}
            sub="Starts as a share of impressions."
          />
          <StatTile
            label="Completion rate"
            value={pct(totals.rates.completionRate, 0)}
            sub="Of those who started, the share who finished."
          />
          <StatTile
            label="Typical completion time"
            value={`${totals.medianCompletionSeconds}s`}
            sub="Half of fans finished faster than this."
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          <Card>
            <MetricLabel label="Research confidence" metricId="margin_of_error" />
            <div
              style={{ font: SANS, fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", margin: "10px 0 8px" }}
            >
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
                <div
                  key={d.label}
                  style={{ display: "flex", justifyContent: "space-between", font: SANS, fontSize: 13.5 }}
                >
                  <span style={{ color: INK.secondary }}>{d.label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {d.share > 0 && d.share < 0.001 ? "<0.1%" : pct(d.share, 1)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </>
    ),

    "what-fans-told-us": (
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
                style={{ font: SANS, fontSize: 12, fontWeight: 700, color: "#8A6D2F", letterSpacing: "0.06em" }}
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
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 22 }}
                >
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
    ),

    "creative-gallery":
      model.creatives.length > 0 ? (
        <CreativeGallery creatives={model.creatives} questions={galleryQuestions} />
      ) : null,

    "creative-comparison": creative ? (
      <>
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
              baseline:
                m.format === "rate_per_10k" ? m.baseline.toFixed(1) : pct(m.baseline, m.baseline < 0.01 ? 3 : 1),
              variant:
                m.format === "rate_per_10k" ? m.variant.toFixed(1) : pct(m.variant, m.variant < 0.01 ? 3 : 1),
              change: m.inconclusive ? (
                <span style={{ color: INK.tertiary }}>No clear difference</span>
              ) : (
                <strong>{`${(m.change ?? 0) > 0 ? "+" : ""}${Math.round((m.change ?? 0) * 100)}%`}</strong>
              ),
              confidence: <ConfidenceBadge confidence={m.confidence} />,
            }))}
          />
        </div>

        <div style={{ marginTop: 28 }}>
          <Callout title="Volume delivered">
            {creative.baseline.label}: {int(creative.baseline.counts.loads)} impressions,{" "}
            {int(creative.baseline.counts.completed)} completed responses. {creative.variant.label}:{" "}
            {int(creative.variant.counts.loads)} impressions, {int(creative.variant.counts.completed)} completed
            responses. Every comparison above is per impression, so the difference in volume does not affect it.
            {creative.caveats.length > 0 &&
              " The conditions this test ran under are set out in the Methodology section."}
          </Callout>
        </div>
      </>
    ) : null,

    "country-performance": (
      <>
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

        {markets.some((m) => m.note || m.sampleSize < MIN_REPORTABLE_SAMPLE) && (
          <div
            style={{
              marginTop: 22,
              font: SANS,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: INK.tertiary,
              display: "grid",
              gap: 6,
            }}
          >
            {markets
              .filter((m) => m.note)
              .map((m) => (
                <div key={m.key}>
                  <strong style={{ color: INK.secondary }}>* {m.label}:</strong> {m.note}
                </div>
              ))}
            {markets.some((m) => m.sampleSize < MIN_REPORTABLE_SAMPLE) && (
              <div>
                Markets marked small sample returned fewer than {MIN_REPORTABLE_SAMPLE} completed responses. They are
                reported in full, but not concluded from.
              </div>
            )}
          </div>
        )}
      </>
    ),

    "engagement-trends": (
      <>
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
      </>
    ),

    "audience-reach": (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 28 }}>
          <Card>
            <FunnelHeading title="Delivery" denominator="Every stage as a share of impressions delivered" />
            <FunnelStages
              scale="log"
              stages={[
                { label: "Impressions delivered", value: totals.counts.loads, ratio: 1 },
                ...(model.viewabilityWindow
                  ? [
                      {
                        label: "Entered the fan's viewport",
                        value: totals.counts.viewable,
                        ratio: model.viewabilityWindow.rate,
                      },
                    ]
                  : []),
                { label: "Started the survey", value: totals.counts.starts, ratio: totals.rates.startRate },
              ]}
            />
          </Card>

          <Card>
            <FunnelHeading title="The survey" denominator="Every stage as a share of fans who started" />
            <FunnelStages
              stages={[
                { label: "Started the survey", value: totals.counts.starts, ratio: 1 },
                {
                  label: "Reached the final question",
                  value: totals.counts.reachedFinalQuestion,
                  ratio: totals.counts.starts > 0 ? totals.counts.reachedFinalQuestion / totals.counts.starts : 0,
                },
                {
                  label: "Completed every question",
                  value: totals.counts.completed,
                  ratio: totals.rates.completionRate,
                },
              ]}
            />
          </Card>
        </div>

        <div
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 28,
          }}
        >
          <Prose>
            {int(totals.counts.loads)} impressions across {totals.markets} markets produced{" "}
            {int(totals.counts.completed)} completed responses, which is {totals.rates.responsesPer10k.toFixed(1)} for
            every 10,000 impressions delivered. That ratio is the single number worth carrying into the next campaign:
            it is what turns inventory into research.
          </Prose>
          {model.viewabilityWindow && (
            <Callout title="Delivery quality">
              {/* One expression rather than a value beside a text node: JSX
                  adjacency drops the separating space here, and "81%of" is the
                  kind of typo a reader notices before they notice the number. */}
              {`${pct(model.viewabilityWindow.rate, 0)} of impressions entered the fan's viewport. Your volume is reaching real screens rather than loading out of view, which is what makes every engagement rate in this report a measure of the creative rather than of the placement.`}
            </Callout>
          )}
        </div>
      </>
    ),

    "what-we-learned": (
      <>
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
      </>
    ),

    "value-delivered": (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
        {model.valueDelivered.points.map((p) => (
          <div key={p.label} style={{ borderTop: `2px solid ${GOLD}`, paddingTop: 22, breakInside: "avoid" }}>
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
    ),

    "recommendations": (
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
    ),

    "downloads": <DownloadBar orgSlug={report.orgSlug} reportSlug={report.reportSlug} />,

    "methodology": (
      <>
        <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
          {model.methodology.map((m, i) => (
            <p key={i} style={{ font: SANS, fontSize: 14.5, lineHeight: 1.75, color: INK.secondary, margin: 0 }}>
              {m}
            </p>
          ))}
        </div>

        <div style={{ marginTop: 36, maxWidth: 760 }}>
          <Callout title="Precision by market">
            {markets.map((m) => `${m.label} n=${m.sampleSize}`).join(" · ")}. Precision improves with the square root
            of the sample, so a market with a quarter of the responses carries roughly twice the margin of error.
          </Callout>
        </div>

        <div style={{ marginTop: 32, maxWidth: 760 }}>
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
          <span>Generated {formatDateTime(win.generatedAt)}</span>
        </footer>
      </>
    ),
  };

  // Sections with no body drop out entirely and the numbering closes up behind
  // them, so a campaign that ran a single creative leaves no gap at 04.
  const present = profile.order.filter((id) => bodies[id] != null);
  const contents = present.map((id) => ({ id, label: profile.copy[id].eyebrow }));

  // Alternating surfaces give the document its rhythm. Value Delivered always
  // takes the navy band: it is the high point of the story and earns the change
  // of ground.
  const toneFor = (id: SectionId, i: number): "surface" | "page" | "navy" =>
    id === "value-delivered" ? "navy" : i % 2 === 0 ? "surface" : "page";

  return (
    <article style={{ font: SANS, color: INK.primary, background: INK.surface }}>
      <Cover report={report} win={win} metadataItems={metadataItems} marketCount={totals.markets} />

      <SectionNav
        sections={contents}
        reportTitle={report.reportTitle}
        organisationName={report.organisationName}
      />

      {present.map((id, i) => {
        const copy = profile.copy[id];
        const tone = toneFor(id, i);
        return (
          <Band key={id} id={id} tone={tone}>
            <SectionHeader
              number={i + 1}
              eyebrow={copy.eyebrow}
              title={copy.title}
              standfirst={copy.standfirst}
              onDark={tone === "navy"}
            />
            {bodies[id]}
          </Band>
        );
      })}
    </article>
  );
}

// ── Cover ────────────────────────────────────────────────────────────────────

/** Small counts read as words in running prose; past a dozen, digits are
 *  clearer than "seventeen". */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

/** The fallback standfirst: the same shape a hand-written one takes, built from
 *  what the report definitely knows. It deliberately claims nothing about the
 *  region or the respondents that the data cannot support. */
function coverSubtitle(report: AudienceIntelligenceReport["report"], markets: number): string {
  const count = markets < NUMBER_WORDS.length ? NUMBER_WORDS[markets] : String(markets);
  return `This study gathered feedback from fans across ${count} ${markets === 1 ? "market" : "markets"} to understand perceptions of ${report.brandName}'s sponsorship, while evaluating audience engagement across ${report.organisationName} inventory.`;
}

function Cover({
  report,
  win,
  metadataItems,
  marketCount,
}: {
  report: AudienceIntelligenceReport["report"];
  win: AudienceIntelligenceReport["window"];
  metadataItems: { label: string; value: string; emphasis?: boolean }[];
  marketCount: number;
}) {
  // The standfirst is editorial where one has been written, generated where one
  // has not. It describes the report from the publisher's side of the table:
  // the client's research question belongs in the client's report, and on this
  // cover it would make the document read as somebody else's brief rather than
  // as intelligence about this publisher's own audience.
  const subtitle = report.subtitle ?? coverSubtitle(report, marketCount);

  return (
    <header style={{ background: NAVY, color: "#FFFFFF", borderBottom: `3px solid ${GOLD}` }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 40px 60px" }}>
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
            {report.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.logoUrl}
                alt={report.organisationName}
                style={{ height: 52, width: "auto", display: "block", maxWidth: 320 }}
              />
            ) : (
              <div
                style={{ font: SANS, fontSize: 52, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1 }}
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
            margin: "0 0 16px",
            maxWidth: 780,
          }}
        >
          {report.reportTitle}
        </h1>
        <p
          style={{
            font: SANS,
            fontSize: 17,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.62)",
            maxWidth: 760,
            margin: 0,
          }}
        >
          {subtitle}
        </p>

        <div style={{ marginTop: 52 }}>
          <MetadataPanel onDark items={metadataItems} />
        </div>
      </div>
    </header>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function FunnelHeading({ title, denominator }: { title: string; denominator: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          font: SANS,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: INK.primary,
          marginBottom: 5,
        }}
      >
        {title}
      </div>
      <div style={{ font: SANS, fontSize: 12, color: INK.tertiary }}>{denominator}</div>
    </div>
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

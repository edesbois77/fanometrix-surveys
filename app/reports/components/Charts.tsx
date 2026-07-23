// Chart primitives for the Audience Intelligence Report.
//
// Hand-rolled SVG, rendered on the server, for three reasons that all matter
// here: the report must print to PDF without a chart library re-laying itself
// out in a headless browser; it must render identically for a partner who opens
// it with JavaScript blocked; and every mark needs to sit exactly where the
// document grid puts it.
//
// Conventions held across every chart in this file:
//   • One measure per plot. Never two y-scales — two units means two charts.
//   • One series → one colour. Ordered stages may use the ordinal ramp; nominal
//     categories never get a value ramp.
//   • Hairline, solid grid and axes, one shade off the surface. No dashes.
//   • Selective direct labels: the peak, the endpoint, the compared pair. Never
//     a number on every mark.
//   • A <title> on each mark, so hovering gives the exact value and a screen
//     reader can read it, with no JavaScript.
//   • Every chart is accompanied in the page by a real table of the same
//     numbers, which is the accessible fallback of record.

import { DATA, INK } from "../theme";

const FONT = "11px var(--font-geist), system-ui, sans-serif";

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].find((s) => max <= s * mag) ?? 10;
  return step * mag;
}

// ── Hourly column chart ──────────────────────────────────────────────────────

export function HourlyColumns({
  data,
  valueKey,
  label,
  format = "integer",
  height = 190,
  highlightHour,
}: {
  data: { hour: number; loads: number; starts: number; completed: number; startRate: number }[];
  valueKey: "loads" | "starts" | "completed" | "startRate";
  label: string;
  format?: "integer" | "percent";
  height?: number;
  highlightHour?: number;
}) {
  // Sized to the ~470px column the engagement grid lays these out in, so the
  // viewBox scale stays near 1 and the axis labels render at their real size.
  const W = 470;
  const H = height;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = data.map((d) => d[valueKey]);
  const max = niceCeiling(Math.max(...values, format === "percent" ? 0.0001 : 1));
  const barW = plotW / 24;
  const gap = 2; // surface gap between adjacent bars, not a border

  const ticks = [0, 0.5, 1].map((t) => max * t);
  const fmtValue = (v: number) => (format === "percent" ? `${(v * 100).toFixed(2)}%` : fmtInt(v));

  const peakIndex = values.indexOf(Math.max(...values));

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          font: FONT,
          fontWeight: 600,
          color: INK.primary,
          letterSpacing: "-0.005em",
          marginBottom: 6,
          fontSize: 12,
        }}
      >
        {label}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label} by hour of day, local time`}
        style={{ display: "block", overflow: "visible" }}
      >
        {ticks.map((t, i) => {
          const y = padT + plotH - (t / max) * plotH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={INK.grid} strokeWidth={1} />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                style={{ font: FONT, fill: INK.tertiary, fontVariantNumeric: "tabular-nums" }}
              >
                {format === "percent" ? `${(t * 100).toFixed(2)}%` : fmtInt(t)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const v = d[valueKey];
          const h = max > 0 ? (v / max) * plotH : 0;
          const x = padL + i * barW + gap / 2;
          const y = padT + plotH - h;
          const isPeak = i === peakIndex && v > 0;
          const isHighlight = highlightHour !== undefined && d.hour === highlightHour;
          return (
            <g key={d.hour}>
              <rect
                x={x}
                y={y}
                width={Math.max(barW - gap, 1)}
                height={Math.max(h, v > 0 ? 1.5 : 0)}
                rx={2}
                fill={isPeak || isHighlight ? DATA.series1 : DATA.series1}
                fillOpacity={isPeak || isHighlight ? 1 : 0.62}
              >
                <title>{`${String(d.hour).padStart(2, "0")}:00 · ${fmtValue(v)}`}</title>
              </rect>
              {isPeak && v > 0 && (
                <text
                  x={x + (barW - gap) / 2}
                  y={y - 5}
                  textAnchor="middle"
                  style={{ font: FONT, fill: INK.primary, fontWeight: 600 }}
                >
                  {fmtValue(v)}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={padL}
          x2={W - padR}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke={INK.axis}
          strokeWidth={1}
        />

        {[0, 6, 12, 18, 23].map((h) => (
          <text
            key={h}
            x={padL + h * barW + barW / 2}
            y={H - 8}
            textAnchor="middle"
            style={{ font: FONT, fill: INK.tertiary, fontVariantNumeric: "tabular-nums" }}
          >
            {String(h).padStart(2, "0")}:00
          </text>
        ))}
      </svg>
    </figure>
  );
}

// ── Indexed horizontal bars, against a base of 100 ───────────────────────────

export function IndexBars({
  rows,
  label,
  baseLabel = "Campaign average",
}: {
  rows: { label: string; index: number; note?: string }[];
  label: string;
  baseLabel?: string;
}) {
  // Sized to the full-width card these sit in, for the same reason as above.
  const W = 980;
  const rowH = 34;
  const padL = 172;
  const padR = 70;
  const padT = 22;
  const H = padT + rows.length * rowH + 16;
  const plotW = W - padL - padR;

  const max = Math.max(140, ...rows.map((r) => r.index)) * 1.02;
  const x = (v: number) => padL + (v / max) * plotW;

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{ font: FONT, fontWeight: 600, color: INK.primary, marginBottom: 6, fontSize: 12 }}
      >
        {label}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        style={{ display: "block", overflow: "visible" }}
      >
        <line x1={x(100)} x2={x(100)} y1={padT - 12} y2={H - 10} stroke={INK.axis} strokeWidth={1} />
        <text
          x={x(100)}
          y={padT - 18}
          textAnchor="middle"
          style={{ font: FONT, fill: INK.tertiary }}
        >
          {baseLabel} = 100
        </text>

        {rows.map((r, i) => {
          const y = padT + i * rowH;
          const w = Math.max(x(r.index) - padL, 1);
          return (
            <g key={r.label}>
              <text
                x={padL - 12}
                y={y + 16}
                textAnchor="end"
                style={{ font: FONT, fill: INK.secondary, fontSize: 12 }}
              >
                {r.label}
                {r.note ? " *" : ""}
              </text>
              <rect x={padL} y={y + 5} width={w} height={16} rx={3} fill={DATA.series1} fillOpacity={0.85}>
                <title>{`${r.label} · index ${r.index}`}</title>
              </rect>
              <text
                x={W - 12}
                y={y + 17}
                textAnchor="end"
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-geist), system-ui, sans-serif",
                  fill: INK.primary,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {r.index}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ── Two-series paired bars, for a creative comparison ────────────────────────

export function PairedBars({
  rows,
  seriesA,
  seriesB,
  label,
}: {
  rows: {
    label: string;
    a: number;
    b: number;
    format: "percent" | "rate_per_10k";
    /** True when the difference did not clear the confidence bar. The row is
     *  drawn recessive AND labelled, never one without the other. */
    muted?: boolean;
  }[];
  seriesA: string;
  seriesB: string;
  label: string;
}) {
  const W = 980;
  const groupH = 62;
  const padL = 260;
  const padR = 90;
  const padT = 8;
  const H = padT + rows.length * groupH + 8;
  const plotW = W - padL - padR;

  const fmt = (v: number, f: "percent" | "rate_per_10k") => {
    if (f !== "percent") return v.toFixed(1);
    const asPct = v * 100;
    // Enough decimals to keep two values distinguishable. Fixing this at one
    // decimal renders 0.153% and 0.125% as "0.2%" and "0.1%", which is a
    // different (and wrong) story from the one the numbers tell.
    const dp = asPct >= 10 ? 1 : asPct >= 1 ? 2 : 3;
    return `${asPct.toFixed(dp)}%`;
  };

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          font: FONT,
          fontWeight: 600,
          color: INK.primary,
          marginBottom: 10,
          fontSize: 12,
          display: "flex",
          gap: 18,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span>{label}</span>
        <span style={{ display: "inline-flex", gap: 14, fontWeight: 500, color: INK.secondary }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 2, background: DATA.series1, display: "inline-block" }}
            />
            {seriesA}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 2, background: DATA.series2, display: "inline-block" }}
            />
            {seriesB}
          </span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        style={{ display: "block", overflow: "visible" }}
      >
        {rows.map((r, i) => {
          const max = Math.max(r.a, r.b) * 1.15 || 1;
          const y = padT + i * groupH;
          const wA = Math.max((r.a / max) * plotW, 1);
          const wB = Math.max((r.b / max) * plotW, 1);
          const opacity = r.muted ? 0.45 : 1;
          return (
            <g key={r.label}>
              <text
                x={padL - 14}
                y={r.muted ? y + 20 : y + 26}
                textAnchor="end"
                style={{ font: FONT, fill: INK.secondary, fontSize: 12 }}
              >
                {r.label}
              </text>
              {r.muted && (
                <text
                  x={padL - 14}
                  y={y + 34}
                  textAnchor="end"
                  style={{ font: FONT, fill: INK.tertiary, fontSize: 11 }}
                >
                  no clear difference
                </text>
              )}
              <rect x={padL} y={y + 6} width={wA} height={16} rx={3} fill={DATA.series1} fillOpacity={opacity}>
                <title>{`${seriesA} · ${fmt(r.a, r.format)}`}</title>
              </rect>
              <text
                x={padL + wA + 8}
                y={y + 18}
                style={{ font: FONT, fill: INK.secondary, fontVariantNumeric: "tabular-nums" }}
              >
                {fmt(r.a, r.format)}
              </text>
              {/* 2px surface gap between the pair, not a stroke */}
              <rect x={padL} y={y + 26} width={wB} height={16} rx={3} fill={DATA.series2} fillOpacity={opacity}>
                <title>{`${seriesB} · ${fmt(r.b, r.format)}`}</title>
              </rect>
              <text
                x={padL + wB + 8}
                y={y + 38}
                style={{
                  font: FONT,
                  fill: INK.primary,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(r.b, r.format)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ── Single-series horizontal bars, for an answer distribution ────────────────

export function AnswerBars({
  options,
  compact = false,
}: {
  options: { label: string; count: number; share: number }[];
  compact?: boolean;
}) {
  const max = Math.max(...options.map((o) => o.share), 0.01);
  return (
    <div style={{ display: "grid", gap: compact ? 6 : 10 }}>
      {options.map((o) => (
        <div key={o.label} style={{ display: "grid", gap: compact ? 2 : 4 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              font: FONT,
              fontSize: compact ? 11 : 12.5,
              color: INK.secondary,
            }}
          >
            <span>{o.label}</span>
            <span
              style={{
                color: INK.primary,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {Math.round(o.share * 100)}%
              {!compact && (
                <span style={{ color: INK.tertiary, fontWeight: 400 }}> ({o.count})</span>
              )}
            </span>
          </div>
          <div
            style={{
              height: compact ? 5 : 8,
              background: INK.hairlineSoft,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(o.share / max) * 100}%`,
                height: "100%",
                background: DATA.series1,
                borderRadius: 3,
              }}
              title={`${o.label} · ${Math.round(o.share * 100)}% (${o.count})`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export function FunnelStages({
  stages,
  scale = "linear",
}: {
  /** `ratioLabel` names what the ratio is a share OF. Every stage in one funnel
   *  must share a denominator: a funnel whose rows are measured against
   *  different things is four facts stacked on top of each other, not a funnel.
   *  Where two denominators are genuinely needed, use two funnels. */
  stages: { label: string; value: number; ratio: number | null; ratioLabel?: string }[];
  /** Delivery spans several orders of magnitude, so a linear bar makes every
   *  stage after the first an invisible sliver. Survey stages are within one
   *  order of each other and read correctly linear, which is preferable
   *  wherever it is honest. */
  scale?: "linear" | "log";
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const width = (v: number) =>
    scale === "log"
      ? (Math.log10(Math.max(v, 1)) / Math.log10(Math.max(max, 10))) * 100
      : (v / max) * 100;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {stages.map((s, i) => (
        <div key={s.label} style={{ display: "grid", gap: 5 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              font: FONT,
              fontSize: 13,
              color: INK.secondary,
            }}
          >
            <span>{s.label}</span>
            <span style={{ display: "inline-flex", gap: 12, alignItems: "baseline" }}>
              {s.ratio !== null && (
                <span style={{ color: INK.tertiary, fontVariantNumeric: "tabular-nums" }}>
                  {(s.ratio * 100).toFixed(s.ratio < 0.01 ? 3 : 1)}%{s.ratioLabel ? ` ${s.ratioLabel}` : ""}
                </span>
              )}
              <span
                style={{ color: INK.primary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              >
                {fmtInt(s.value)}
              </span>
            </span>
          </div>
          <div style={{ height: 10, background: INK.hairlineSoft, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${width(s.value)}%`,
                height: "100%",
                background: DATA.funnel[Math.min(i, DATA.funnel.length - 1)],
                borderRadius: 3,
              }}
              title={`${s.label} · ${fmtInt(s.value)}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

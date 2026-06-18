"use client";

import { useState } from "react";
import { AdminShell } from "@/app/components/AdminShell";

// ─── Template data ────────────────────────────────────────────────────────────

const CALCULATED_FIELDS = `-- Fanometrix Pulse · Calculated Fields for Looker Studio
-- Add these in: Data source → Add a field → Custom formula

Total Responses       = COUNT(response_id)
Completion Rate (%)   = AVG(is_complete) * 100
Avg Response Time (s) = AVG(response_duration_seconds)
Response Share (%)    = COUNT(response_id) / COUNT_DISTINCT(response_id) * 100
Mobile Share (%)      = COUNTIF(device = "mobile") / COUNT(response_id) * 100`;

const FIELD_REFERENCE = `-- Fanometrix Pulse · vw_campaign_responses field reference

IDENTITY
  response_id             TEXT      Unique response UUID

CAMPAIGN
  campaign_slug           TEXT      Human-readable campaign ID (e.g. carlsberg_ucl_2026)
  campaign_id             TEXT      Campaign UUID
  campaign_name           TEXT      Campaign display name
  brand                   TEXT      Brand name

SURVEY
  survey_id               TEXT      Survey UUID
  survey_name             TEXT      Survey display name

PLACEMENT
  publisher               TEXT      Publisher (normalised)
  placement               TEXT      Placement position (normalised)

AUDIENCE
  club                    TEXT      Football club
  competition             TEXT      Competition / tournament
  country                 TEXT      Country (full name, normalised)
  fan_segment             TEXT      Audience segment label

DEVICE
  device                  TEXT      mobile / tablet / desktop
  browser                 TEXT      Chrome / Safari / Firefox / Edge

RESPONSES
  q1                      TEXT      Answer to Q1
  q2                      TEXT      Answer to Q2
  q3                      TEXT      Answer to Q3
  response_duration_seconds INTEGER Time to complete (seconds)
  is_complete             INTEGER   1 = all 3 answered, 0 = partial
  is_demo                 BOOLEAN   true = generated test data

DATE DIMENSIONS
  submitted_at            TIMESTAMP Full submission timestamp (UTC)
  response_date           DATE      YYYY-MM-DD
  response_week           DATE      Start of ISO week
  response_month          DATE      Start of month
  response_year           INTEGER   e.g. 2026
  response_month_num      INTEGER   1–12
  response_month_label    TEXT      e.g. 2026-06
  response_day_of_week    TEXT      e.g. Monday

TIME DIMENSIONS
  response_hour           INTEGER   0–23 (UTC)
  response_daypart        TEXT      Morning / Afternoon / Evening / Night`;

type Template = {
  id: string;
  icon: string;
  title: string;
  color: string;
  purpose: string;
  kpis: string[];
  charts: string[];
  dimensions: string[];
  measures: { name: string; formula: string }[];
  filters: string[];
  palette: { hex: string; name: string }[];
  lookerTip: string;
};

const TEMPLATES: Template[] = [
  {
    id: "executive",
    icon: "📊",
    title: "Executive Overview",
    color: "#6366f1",
    purpose: "A single-page summary for leadership. Shows total volume, trend and top-line completion across all campaigns. Designed for weekly or monthly business reviews.",
    kpis: ["Total Responses", "Completion Rate (%)", "Avg Response Time (s)", "Countries Represented", "Active Campaigns"],
    charts: [
      "Line chart — Responses over time (response_date)",
      "Bar chart — Responses by campaign (campaign_name)",
      "Donut chart — Device split (device)",
      "Horizontal bar — Top 10 countries (country)",
      "Scorecard — Completion rate vs target",
    ],
    dimensions: ["campaign_name", "brand", "response_month", "country", "device"],
    measures: [
      { name: "Total Responses",  formula: "COUNT(response_id)" },
      { name: "Completion Rate",  formula: "AVG(is_complete) * 100" },
      { name: "Avg Response Time",formula: "AVG(response_duration_seconds)" },
    ],
    filters: ["Date range", "Brand", "Campaign", "is_demo = false"],
    palette: [
      { hex: "#6366f1", name: "Indigo"  },
      { hex: "#8b5cf6", name: "Violet"  },
      { hex: "#64748b", name: "Slate"   },
      { hex: "#e0e7ff", name: "Indigo 100" },
    ],
    lookerTip: "Use a date range control linked to response_date as the primary filter. Add a campaign selector as a secondary control.",
  },
  {
    id: "audience",
    icon: "👥",
    title: "Audience Insights",
    color: "#06b6d4",
    purpose: "Understand who the fans are — where they come from, what device they use, and which fan segments dominate. Best used alongside a campaign filter.",
    kpis: ["Countries Represented", "Top Country Share (%)", "Mobile Share (%)", "Active Fan Segments"],
    charts: [
      "Geo map or horizontal bar — Responses by country",
      "Donut chart — Device breakdown (device)",
      "Bar chart — Fan segment distribution (fan_segment)",
      "Bar chart — Browser split (browser)",
      "Pie chart — Tablet vs mobile vs desktop over time",
    ],
    dimensions: ["country", "device", "browser", "fan_segment", "response_month"],
    measures: [
      { name: "Total Responses", formula: "COUNT(response_id)" },
      { name: "Mobile Share (%)", formula: "COUNTIF(device = \"mobile\") / COUNT(response_id) * 100" },
      { name: "Completion Rate", formula: "AVG(is_complete) * 100" },
    ],
    filters: ["Campaign", "Date range", "Device", "Country", "Fan Segment"],
    palette: [
      { hex: "#06b6d4", name: "Cyan"     },
      { hex: "#0e7490", name: "Dark Cyan" },
      { hex: "#10b981", name: "Emerald"  },
      { hex: "#cffafe", name: "Cyan 100" },
    ],
    lookerTip: "Add country as a dimension to the geo map widget. Use fan_segment as a filter control so stakeholders can drill into specific audience types.",
  },
  {
    id: "publisher",
    icon: "📡",
    title: "Publisher Performance",
    color: "#f59e0b",
    purpose: "Compare publisher and placement effectiveness. Identify which media partners drive the most volume and best quality. Share this view directly with commercial teams.",
    kpis: ["Publishers Active", "Best Completion Rate", "Top Placement", "Avg Response Time by Publisher"],
    charts: [
      "Bar chart — Responses by publisher",
      "Bar chart — Completion rate by publisher",
      "Bar chart — Responses by placement",
      "Multi-line chart — Publisher trend over time (response_month)",
      "Scatter chart — Volume vs completion rate by publisher",
    ],
    dimensions: ["publisher", "placement", "response_month", "response_date"],
    measures: [
      { name: "Total Responses", formula: "COUNT(response_id)" },
      { name: "Completion Rate", formula: "AVG(is_complete) * 100" },
      { name: "Avg Response Time", formula: "AVG(response_duration_seconds)" },
    ],
    filters: ["Campaign", "Publisher", "Placement", "Date range"],
    palette: [
      { hex: "#f59e0b", name: "Amber"  },
      { hex: "#f97316", name: "Orange" },
      { hex: "#fde68a", name: "Amber 200" },
      { hex: "#7c3aed", name: "Violet" },
    ],
    lookerTip: "Sort the completion rate bar chart descending to immediately surface the best-performing publisher. Use a publisher filter control so sales teams can view their own data.",
  },
  {
    id: "campaign",
    icon: "🎯",
    title: "Campaign Performance",
    color: "#7c3aed",
    purpose: "Track a specific campaign's performance over its full duration. Compare against other campaigns. Ideal for campaign wrap reports and brand decks.",
    kpis: ["Total Responses (this campaign)", "Completion Rate", "Growth vs Prior Period", "Top Publisher"],
    charts: [
      "Line chart — Daily responses over campaign duration",
      "Grouped bar — Q1 / Q2 / Q3 answer distributions",
      "Bar chart — Campaign vs campaign comparison",
      "Horizontal bar — Club and competition breakdown",
      "Scorecard — Responses vs target (if set)",
    ],
    dimensions: ["campaign_name", "brand", "club", "competition", "response_date", "q1", "q2", "q3"],
    measures: [
      { name: "Total Responses", formula: "COUNT(response_id)" },
      { name: "Completion Rate", formula: "AVG(is_complete) * 100" },
      { name: "Avg Response Time", formula: "AVG(response_duration_seconds)" },
    ],
    filters: ["Campaign slug", "Brand", "Date range", "Club", "Competition", "is_demo = false"],
    palette: [
      { hex: "#7c3aed", name: "Purple"   },
      { hex: "#6366f1", name: "Indigo"   },
      { hex: "#ec4899", name: "Pink"     },
      { hex: "#ede9fe", name: "Violet 100" },
    ],
    lookerTip: "Pin campaign_slug as a fixed filter for single-campaign decks. Add a comparison date range to show period-over-period growth.",
  },
  {
    id: "behaviour",
    icon: "⚡",
    title: "Fan Behaviour",
    color: "#10b981",
    purpose: "Understand WHEN and HOW fans engage. Reveals peak response hours, day-of-week patterns and daypart trends. Useful for scheduling campaign activations.",
    kpis: ["Peak Response Hour", "Top Daypart", "Avg Response Time", "Mobile Share (%)", "Completion Rate"],
    charts: [
      "Bar chart — Responses by hour (0–23) (response_hour)",
      "Donut chart — Daypart breakdown (response_daypart)",
      "Bar chart — Responses by day of week (response_day_of_week)",
      "Heat-map table — Hour × Day of week response volume",
      "Bar chart — Avg response time by daypart",
    ],
    dimensions: ["response_hour", "response_daypart", "response_day_of_week", "device"],
    measures: [
      { name: "Total Responses",    formula: "COUNT(response_id)" },
      { name: "Avg Response Time",  formula: "AVG(response_duration_seconds)" },
      { name: "Completion Rate",    formula: "AVG(is_complete) * 100" },
    ],
    filters: ["Campaign", "Date range", "Daypart", "Device"],
    palette: [
      { hex: "#10b981", name: "Emerald" },
      { hex: "#84cc16", name: "Lime"    },
      { hex: "#06b6d4", name: "Cyan"    },
      { hex: "#d1fae5", name: "Green 100" },
    ],
    lookerTip: "Sort response_day_of_week by day number (Monday=1) using a custom sort. For the hour chart, use response_hour as a numeric dimension on the X axis (0–23).",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LookerTemplatesPage() {
  const [active, setActive]   = useState("executive");
  const [copied, setCopied]   = useState<string | null>(null);

  const t = TEMPLATES.find(t => t.id === active)!;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function printInstructions() {
    window.print();
  }

  const copyBtn = (text: string, key: string, label: string) => (
    <button
      onClick={() => copy(text, key)}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
        copied === key ? "bg-green-100 text-green-700" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
      }`}
    >
      {copied === key ? "Copied!" : label}
    </button>
  );

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Looker Studio Templates</h1>
            <p className="text-sm text-gray-400">
              Five recommended dashboards for <code className="bg-gray-100 px-1 rounded text-xs">vw_campaign_responses</code>.
              Connect via PostgreSQL or the JSON reporting API.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {copyBtn(CALCULATED_FIELDS, "fields",    "Copy Calculated Fields")}
            {copyBtn(FIELD_REFERENCE,   "fieldref",  "Copy Field Reference")}
            <button
              onClick={printInstructions}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Download PDF
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-8">
          <h1 className="text-2xl font-bold">Fanometrix Pulse · Looker Studio Template Library</h1>
          <p className="text-sm text-gray-500 mt-1">vw_campaign_responses · {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
        </div>

        {/* Layout */}
        <div className="flex gap-6 print:block">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0 print:hidden">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Templates</p>
            <div className="space-y-1">
              {TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => setActive(tmpl.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active === tmpl.id
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span>{tmpl.icon}</span>
                  <span className="truncate">{tmpl.title}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resources</p>
              {copyBtn(CALCULATED_FIELDS, "fields2",   "Copy Calc Fields")}
              <div className="mt-1">
                {copyBtn(FIELD_REFERENCE, "fieldref2", "Copy Field Ref")}
              </div>
              <div className="mt-1">
                <button onClick={printInstructions}
                  className="w-full text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  Download PDF
                </button>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-w-0 space-y-4 print:space-y-8">
            {TEMPLATES.map(tmpl => (
              <div key={tmpl.id} className={`${tmpl.id !== active ? "hidden print:block" : ""}`}>
                {/* Template header */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm"
                  style={{ borderLeftWidth: 4, borderLeftColor: tmpl.color }}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{tmpl.icon}</span>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{tmpl.title}</h2>
                      <p className="text-xs text-gray-400">Looker Studio Dashboard Template</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{tmpl.purpose}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* KPIs */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">KPI Scorecards</p>
                    <ul className="space-y-1.5">
                      {tmpl.kpis.map(k => (
                        <li key={k} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tmpl.color }} />
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended charts */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recommended Charts</p>
                    <ul className="space-y-1.5">
                      {tmpl.charts.map(c => (
                        <li key={c} className="text-xs text-gray-600 leading-relaxed">{c}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Dimensions */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Dimensions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tmpl.dimensions.map(d => (
                        <span key={d} className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{d}</span>
                      ))}
                    </div>
                  </div>

                  {/* Measures */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Calculated Measures</p>
                    <div className="space-y-2">
                      {tmpl.measures.map(m => (
                        <div key={m.name}>
                          <p className="text-xs font-semibold text-gray-700">{m.name}</p>
                          <code className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded block mt-0.5">{m.formula}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recommended Filters</p>
                    <ul className="space-y-1.5">
                      {tmpl.filters.map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="text-gray-300">▸</span>{f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Colour palette */}
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Suggested Colour Palette</p>
                    <div className="space-y-2">
                      {tmpl.palette.map(p => (
                        <div key={p.hex} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded flex-shrink-0 shadow-sm border border-black/5"
                            style={{ background: p.hex }} />
                          <span className="text-xs text-gray-700">{p.name}</span>
                          <code className="text-xs text-gray-400 ml-auto">{p.hex}</code>
                          <button
                            onClick={() => copy(p.hex, `color-${p.hex}`)}
                            className="text-xs text-gray-300 hover:text-indigo-500 transition-colors"
                          >
                            {copied === `color-${p.hex}` ? "✓" : "copy"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Looker Studio tip */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-start gap-3">
                  <span className="text-indigo-400 flex-shrink-0 mt-0.5">💡</span>
                  <p className="text-xs text-indigo-700">{tmpl.lookerTip}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

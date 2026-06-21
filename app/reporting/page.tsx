"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/app/components/AdminShell";

const BASE = typeof window !== "undefined"
  ? window.location.origin
  : "https://fanometrix-surveys.vercel.app";

const ENDPOINT   = `${BASE}/api/reporting`;
const STATS_URL  = `${BASE}/api/reporting/stats`;

const FIELDS = [
  { name: "response_id",          type: "TEXT",      note: "Unique response UUID" },
  { name: "campaign_slug",        type: "TEXT",      note: "Human-readable campaign ID, e.g. carlsberg_ucl_2026" },
  { name: "campaign_id",          type: "TEXT",      note: "Campaign UUID" },
  { name: "campaign_name",        type: "TEXT",      note: "Campaign display name" },
  { name: "brand",                type: "TEXT",      note: "Brand name" },
  { name: "survey_id",            type: "TEXT",      note: "Survey UUID" },
  { name: "survey_name",          type: "TEXT",      note: "Survey display name" },
  { name: "publisher",            type: "TEXT",      note: "Normalised publisher name" },
  { name: "placement",            type: "TEXT",      note: "Normalised placement name" },
  { name: "club",                 type: "TEXT",      note: "Football club" },
  { name: "competition",          type: "TEXT",      note: "Competition / tournament" },
  { name: "country",              type: "TEXT",      note: "Normalised country (full name)" },
  { name: "fan_segment",          type: "TEXT",      note: "Audience segment label" },
  { name: "device",               type: "TEXT",      note: "mobile / tablet / desktop" },
  { name: "browser",              type: "TEXT",      note: "Chrome / Safari / Firefox / Edge" },
  { name: "q1",                   type: "TEXT",      note: "Answer to question 1" },
  { name: "q2",                   type: "TEXT",      note: "Answer to question 2" },
  { name: "q3",                   type: "TEXT",      note: "Answer to question 3" },
  { name: "response_duration_seconds", type: "INTEGER", note: "Time taken to complete survey" },
  { name: "is_complete",          type: "INTEGER",   note: "1 if all 3 questions answered, else 0" },
  { name: "submitted_at",         type: "TIMESTAMP", note: "Full submission timestamp (UTC)" },
  { name: "response_date",        type: "DATE",      note: "Submission date (YYYY-MM-DD)" },
  { name: "response_week",        type: "DATE",      note: "Start of ISO week" },
  { name: "response_month",       type: "DATE",      note: "Start of month" },
  { name: "response_year",        type: "INTEGER",   note: "Year (e.g. 2026)" },
  { name: "response_month_num",   type: "INTEGER",   note: "Month number 1–12" },
  { name: "response_month_label", type: "TEXT",      note: "e.g. 2026-06" },
  { name: "response_day_of_week", type: "TEXT",      note: "e.g. Monday" },
  { name: "response_hour",        type: "INTEGER",   note: "Hour of submission 0–23 (UTC)" },
  { name: "response_daypart",     type: "TEXT",      note: "Morning (05–11) · Afternoon (12–16) · Evening (17–21) · Night (22–04) — UTC" },
];

const MEASURES = [
  { name: "total_responses",  formula: "COUNT(response_id)",                desc: "Total number of survey responses" },
  { name: "completion_rate",  formula: "AVG(is_complete) × 100",             desc: "Percentage of responses with all 3 answers" },
  { name: "avg_response_time",formula: "AVG(response_duration_seconds)",     desc: "Average time in seconds to complete the survey" },
];

type Stats = {
  total_rows: number;
  last_response_at: string | null;
  api_key_configured: boolean;
  endpoint: string;
};

export default function ReportingPage() {
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [copied,   setCopied]   = useState<string | null>(null);

  useEffect(() => {
    fetch(STATS_URL)
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const copyBtn = (text: string, key: string) => (
    <button
      onClick={() => copy(text, key)}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0 ${
        copied === key ? "bg-green-100 text-green-700" : "bg-gray-100 text-[#0B1929] hover:bg-gray-200"
      }`}
    >
      {copied === key ? "Copied!" : "Copy"}
    </button>
  );

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reporting</h1>
        <p className="text-sm text-gray-400 mb-6">
          Connect Fanometrix data to Google Looker Studio or any BI tool.
        </p>

        {/* Status cards — horizontal scroll on mobile, 3-column grid on md+ */}
        <div className="overflow-x-auto mb-6">
          <div className="flex gap-4 md:grid md:grid-cols-3 w-max md:w-auto">
            <div className="flex-shrink-0 min-w-[200px] md:min-w-0 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Rows</p>
              <p className="text-3xl font-bold mt-1 text-[#0B1929]">
                {loading ? "—" : (stats?.total_rows ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">in vw_campaign_responses</p>
            </div>
            <div className="flex-shrink-0 min-w-[200px] md:min-w-0 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Last Response</p>
              <p className="text-sm font-semibold text-gray-800 mt-1">
                {loading ? "—" : stats?.last_response_at
                  ? new Date(stats.last_response_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                  : "No responses yet"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">most recent submission</p>
            </div>
            <div className={`flex-shrink-0 min-w-[200px] md:min-w-0 border rounded-xl p-5 shadow-sm ${stats?.api_key_configured ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">API Key</p>
              <p className={`text-sm font-semibold mt-1 ${stats?.api_key_configured ? "text-green-700" : "text-amber-700"}`}>
                {loading ? "—" : stats?.api_key_configured ? "Configured ✓" : "Not set"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats?.api_key_configured ? "REPORTING_API_KEY is active" : "Set REPORTING_API_KEY in Vercel"}
              </p>
            </div>
          </div>
        </div>

        {/* API endpoint */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">JSON API Endpoint</p>
          <div className="flex items-center gap-3 mb-3">
            <code className="flex-1 text-xs bg-gray-900 text-green-400 px-3 py-2 rounded-lg font-mono truncate">
              {ENDPOINT}
            </code>
            {copyBtn(ENDPOINT, "endpoint")}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <p className="font-semibold text-gray-700 mb-1">Query parameters</p>
              <ul className="space-y-0.5">
                <li><code className="text-[#0B1929]">limit</code> — rows per page (max 10,000, default 1,000)</li>
                <li><code className="text-[#0B1929]">offset</code> — pagination offset</li>
                <li><code className="text-[#0B1929]">campaign_id</code> — filter by campaign slug</li>
                <li><code className="text-[#0B1929]">publisher</code> — filter by publisher</li>
                <li><code className="text-[#0B1929]">country</code> — filter by country</li>
                <li><code className="text-[#0B1929]">date_from</code> / <code className="text-[#0B1929]">date_to</code> — YYYY-MM-DD</li>
                <li><code className="text-[#0B1929]">api_key</code> — auth key (or use Authorization header)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Authentication</p>
              <p className="mb-2">Pass your API key as a header or query param:</p>
              <code className="block bg-gray-100 text-gray-800 px-2 py-1.5 rounded text-xs mb-1">
                Authorization: Bearer YOUR_API_KEY
              </code>
              <code className="block bg-gray-100 text-gray-800 px-2 py-1.5 rounded text-xs">
                ?api_key=YOUR_API_KEY
              </code>
            </div>
          </div>
        </div>

        {/* Connection guide */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Connect to Google Looker Studio
          </p>

          <div className="space-y-6">
            {/* Method 1 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 text-[#0B1929] text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#D7B87A" }}>1</span>
                <p className="text-sm font-semibold text-gray-800">PostgreSQL direct connection (recommended)</p>
              </div>
              <p className="text-xs text-gray-500 mb-3 ml-7">
                Looker Studio connects directly to the Supabase database and queries <code className="bg-gray-100 px-1 rounded">vw_campaign_responses</code> in real time. No data export needed.
              </p>
              <div className="ml-7 space-y-2 text-xs">
                <p className="font-medium text-gray-700">Steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                  <li>In Supabase SQL Editor, create a read-only user (see the commented SQL at the bottom of <code>supabase-migration-004.sql</code>)</li>
                  <li>Go to Supabase → Settings → Database → Connection Pooling → copy the host and port</li>
                  <li>In Looker Studio → Add Data Source → PostgreSQL</li>
                  <li>Enter: host, port 6543 (pooler), database <code>postgres</code>, username <code>looker_reader</code></li>
                  <li>Select table: <code>vw_campaign_responses</code></li>
                </ol>
              </div>
            </div>

            {/* Method 2 */}
            <div className="border-t border-gray-50 pt-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 bg-gray-200 text-gray-600 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">2</span>
                <p className="text-sm font-semibold text-gray-800">Google Sheets intermediary</p>
              </div>
              <p className="text-xs text-gray-500 mb-3 ml-7">
                Use Google Apps Script to pull data from the JSON API into a Google Sheet, then connect Looker Studio to the Sheet. Best for scheduled refreshes.
              </p>
              <div className="ml-7">
                <p className="text-xs font-medium text-gray-700 mb-2">Apps Script snippet:</p>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre">{`function syncFanometrix() {
  const API_KEY = "YOUR_API_KEY";
  const url = "${ENDPOINT}?limit=10000&api_key=" + API_KEY;
  const res = UrlFetchApp.fetch(url);
  const json = JSON.parse(res.getContentText());
  const rows = json.data;
  if (!rows || !rows.length) return;

  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clearContents();
  sheet.appendRow(Object.keys(rows[0]));
  rows.forEach(r => sheet.appendRow(Object.values(r)));
}`}</pre>
                  {copyBtn(`function syncFanometrix() {
  const API_KEY = "YOUR_API_KEY";
  const url = "${ENDPOINT}?limit=10000&api_key=" + API_KEY;
  const res = UrlFetchApp.fetch(url);
  const json = JSON.parse(res.getContentText());
  const rows = json.data;
  if (!rows || !rows.length) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clearContents();
  sheet.appendRow(Object.keys(rows[0]));
  rows.forEach(r => sheet.appendRow(Object.values(r)));
}`, "appscript")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Measures */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Calculated Measures (create in Looker Studio)
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-semibold text-gray-600">Measure</th>
                <th className="text-left py-2 font-semibold text-gray-600">Formula</th>
                <th className="text-left py-2 font-semibold text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {MEASURES.map(m => (
                <tr key={m.name}>
                  <td className="py-2 font-mono text-[#0B1929]">{m.name}</td>
                  <td className="py-2 font-mono text-gray-700">{m.formula}</td>
                  <td className="py-2 text-gray-500">{m.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fields */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            View Fields — vw_campaign_responses ({FIELDS.length} columns)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-semibold text-gray-600">Field</th>
                  <th className="text-left py-2 font-semibold text-gray-600">Type</th>
                  <th className="text-left py-2 font-semibold text-gray-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {FIELDS.map(f => (
                  <tr key={f.name}>
                    <td className="py-1.5 font-mono text-[#0B1929] whitespace-nowrap">{f.name}</td>
                    <td className="py-1.5 text-gray-400 whitespace-nowrap pl-4">{f.type}</td>
                    <td className="py-1.5 text-gray-500 pl-4">{f.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Env var instruction */}
        {!stats?.api_key_configured && !loading && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Set your API key</p>
            <p className="text-xs text-amber-700 mb-2">
              Add <code className="bg-amber-100 px-1 rounded">REPORTING_API_KEY</code> to your Vercel environment variables to protect the endpoint:
            </p>
            <ol className="text-xs text-amber-700 list-decimal list-inside space-y-0.5">
              <li>Go to Vercel → your project → Settings → Environment Variables</li>
              <li>Add <code className="bg-amber-100 px-1 rounded">REPORTING_API_KEY</code> with a strong random value</li>
              <li>Redeploy (or trigger a new deploy) for the change to take effect</li>
            </ol>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

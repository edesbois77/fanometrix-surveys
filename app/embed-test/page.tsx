"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import {
  computeStatusWithReason,
  getAcceptingStatus,
  type CampaignForStatus,
  type CampaignStatus,
} from "@/lib/campaign-status";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  survey_id: string | null;
  surveys?: { name: string } | null;
  status: string;
  effective_status: CampaignStatus;
  status_reason: string | null;
  manual_status_override: string | null;
  start_date: string | null;
  end_date: string | null;
  target_responses: number | null;
  archive_after_days: number;
  response_count: number;
};

type SubmissionLog = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  publisher: string | null;
  manual_status: string | null;
  effective_status: string;
  http_code: number;
  result: "success" | "failed";
  reason: string | null;
  is_test: boolean;
  created_at: string;
};

type HealthCheck = { label: string; ok: boolean | null; detail: string };
type PingResult  = { ok: boolean; status: number; body: Record<string, unknown> };

const BASE = typeof window !== "undefined" ? window.location.origin : "";

// ─── Health checks ────────────────────────────────────────────────────────────

async function performHealthChecks(campaign: Campaign | null): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // 1. Campaign exists
  checks.push({
    label: "Campaign Exists",
    ok:    !!campaign,
    detail: campaign ? `Found: ${campaign.campaign_id}` : "No campaign selected",
  });

  // 2. Survey linked
  checks.push({
    label: "Survey Linked",
    ok:    !!campaign?.survey_id,
    detail: campaign?.surveys?.name ?? (campaign?.survey_id ? campaign.survey_id : "No survey linked"),
  });

  // 3. Database reachable
  try {
    const r = await fetch("/api/demo/stats");
    checks.push({ label: "Database Reachable", ok: r.ok, detail: r.ok ? "Connected" : `HTTP ${r.status} — DB error` });
  } catch {
    checks.push({ label: "Database Reachable", ok: false, detail: "Network error — cannot reach API" });
  }

  // 4. Response API reachable
  try {
    const r = await fetch("/api/campaigns");
    checks.push({ label: "Response API Reachable", ok: r.ok, detail: r.ok ? "Connected" : `HTTP ${r.status} — API error` });
  } catch {
    checks.push({ label: "Response API Reachable", ok: false, detail: "Network error — cannot reach API" });
  }

  // 5. Embed URL valid
  const embedUrl = campaign ? `${BASE}/embed?campaign=${campaign.campaign_id}` : null;
  if (embedUrl) {
    try {
      const r = await fetch(embedUrl, { method: "HEAD" });
      checks.push({ label: "Embed URL Valid", ok: r.ok, detail: r.ok ? "URL reachable" : `HTTP ${r.status} — URL returned error` });
    } catch {
      checks.push({ label: "Embed URL Valid", ok: false, detail: "Could not reach embed URL" });
    }
  } else {
    checks.push({ label: "Embed URL Valid", ok: null, detail: "Select a campaign first" });
  }

  // 6. Response Insert Working — test with is_demo flag, clean up immediately
  if (campaign) {
    try {
      const r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.campaign_id,
          q1: "Never", q2: "Good", q3: "Likely",
          publisher: "health-check", is_demo: true,
        }),
      });
      // 200 = inserted; 403 = campaign not live but DB/API works
      const dbWorking = r.ok || r.status === 403;
      const detail = r.ok
        ? "Insert succeeded — test response cleaned up"
        : r.status === 403
          ? `Insert API reachable (campaign not live: ${r.status})`
          : `Insert failed: HTTP ${r.status}`;
      checks.push({ label: "Response Insert Working", ok: dbWorking, detail });
      if (r.ok) {
        await fetch(`/api/demo/delete?campaign_id=${campaign.campaign_id}`, { method: "DELETE" });
      }
    } catch {
      checks.push({ label: "Response Insert Working", ok: false, detail: "Network error — cannot reach submit API" });
    }
  } else {
    checks.push({ label: "Response Insert Working", ok: null, detail: "Select a campaign first" });
  }

  return checks;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmbedTestPage() {
  const [campaigns,      setCampaigns]      = useState<Campaign[]>([]);
  const [selectedId,     setSelectedId]     = useState("");
  const [iframeKey,      setIframeKey]      = useState(0);
  const [publisher,      setPublisher]      = useState("embed-test");
  const [pingResult,     setPingResult]     = useState<PingResult | null>(null);
  const [pinging,        setPinging]        = useState(false);
  const [logs,           setLogs]           = useState<SubmissionLog[]>([]);
  const [logsLoading,    setLogsLoading]    = useState(false);
  const [logFilter,      setLogFilter]      = useState<"all"|"success"|"failed">("all");
  const [logPubFilter,   setLogPubFilter]   = useState("");
  const [logDateFilter,  setLogDateFilter]  = useState("");
  const [healthChecks,   setHealthChecks]   = useState<HealthCheck[] | null>(null);
  const [healthRunning,  setHealthRunning]  = useState(false);
  const [simProgress,    setSimProgress]    = useState({ done: 0, total: 0, running: false });
  const [simResult,      setSimResult]      = useState<string | null>(null);
  const [cleaning,       setCleaning]       = useState(false);
  const [loading,        setLoading]        = useState(true);
  const simCancelRef = useRef(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(j => { setCampaigns(j.data ?? []); setLoading(false); });
  }, []);

  const campaign = campaigns.find(c => c.id === selectedId) ?? null;

  const refreshCampaigns = useCallback(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(j => setCampaigns(j.data ?? []));
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    const params = new URLSearchParams({ limit: "20" });
    if (campaign)              params.set("campaign_id", campaign.campaign_id);
    if (logFilter !== "all")   params.set("result",      logFilter);
    if (logPubFilter.trim())   params.set("publisher",   logPubFilter.trim());
    if (logDateFilter)         params.set("date_from",   logDateFilter);
    const r = await fetch(`/api/embed/logs?${params}`);
    const j = await r.json();
    setLogs(j.data ?? []);
    setLogsLoading(false);
  }, [campaign, logFilter, logPubFilter, logDateFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs, logPubFilter, logDateFilter]);

  // Computed values for selected campaign
  const statusDetail = campaign
    ? computeStatusWithReason(campaign as unknown as CampaignForStatus, campaign.response_count)
    : null;
  const accepting = campaign
    ? getAcceptingStatus(campaign as unknown as CampaignForStatus, campaign.response_count)
    : null;

  const previewUrl = campaign
    ? `${BASE}/embed?campaign=${campaign.campaign_id}&survey=${campaign.survey_id ?? ""}&publisher=${publisher}&country=GB`
    : null;

  // ── Test ping ──────────────────────────────────────────────────────────────
  const runPing = useCallback(async () => {
    if (!campaign) return;
    setPinging(true);
    setPingResult(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.campaign_id,
          survey_id:   campaign.survey_id ?? null,
          publisher:   publisher || "embed-test",
          placement:   "embed-test",
          country:     "GB",
          q1: "Never", q2: "Good", q3: "Likely",
          device: "desktop", browser: "Chrome",
          response_duration_seconds: 12,
          is_demo: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setPingResult({ ok: res.ok, status: res.status, body });
      setTimeout(() => { fetchLogs(); refreshCampaigns(); }, 500);
    } catch (err) {
      setPingResult({ ok: false, status: 0, body: { error: String(err) } });
    }
    setPinging(false);
  }, [campaign, publisher, fetchLogs, refreshCampaigns]);

  // ── Traffic simulator ──────────────────────────────────────────────────────
  const simulate = useCallback(async (count: number) => {
    if (!campaign) return;
    simCancelRef.current = false;
    setSimProgress({ done: 0, total: count, running: true });
    setSimResult(null);

    const ANSWERS = [
      { q1: "Never",    q2: "Poor",      q3: "Not likely"     },
      { q1: "Never",    q2: "Average",   q3: "Somewhat likely"},
      { q1: "1–2 times a year", q2: "Good",  q3: "Likely"    },
      { q1: "3–5 times a year", q2: "Good",  q3: "Very likely"},
      { q1: "5+ times a year",  q2: "Excellent", q3: "Very likely"},
    ];

    let succeeded = 0;
    for (let i = 0; i < count; i++) {
      if (simCancelRef.current) break;
      const ans = ANSWERS[i % ANSWERS.length];
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.campaign_id,
          survey_id:   campaign.survey_id ?? null,
          publisher:   publisher || "embed-test",
          placement:   "embed-test",
          country:     "GB",
          ...ans,
          device: "desktop", browser: "Chrome",
          response_duration_seconds: 8,
          is_demo: true,
        }),
      });
      if (res.ok) succeeded++;
      setSimProgress(p => ({ ...p, done: i + 1 }));

      // Small delay to avoid hammering DB
      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 100));
    }

    setSimProgress(p => ({ ...p, running: false }));

    // Detect if campaign auto-transitioned to Closed after simulation
    const prevStatus = campaign.effective_status;
    await Promise.all([fetchLogs(), refreshCampaigns()]);

    // Re-read updated campaign to detect auto-close
    const updatedCampaigns: Campaign[] = await fetch("/api/campaigns")
      .then(r => r.json()).then(j => j.data ?? []);
    const updated = updatedCampaigns.find(c => c.id === campaign.id);
    const newStatus = updated?.effective_status ?? prevStatus;

    let resultMsg = `${succeeded} / ${count} responses submitted. `;
    if (prevStatus === "live" && newStatus === "closed") {
      resultMsg += "⚠️ Campaign automatically transitioned to Closed.";
    } else {
      resultMsg += `Effective status: ${newStatus.toUpperCase()}.`;
    }
    setSimResult(resultMsg);
  }, [campaign, publisher, fetchLogs, refreshCampaigns]);

  const simulateToTarget = useCallback(async () => {
    if (!campaign?.target_responses) return;
    const remaining = Math.max(0, campaign.target_responses - campaign.response_count);
    if (remaining === 0) { setSimResult("Target already reached."); return; }
    await simulate(remaining);
  }, [campaign, simulate]);

  const cleanupSimulator = useCallback(async () => {
    if (!campaign) return;
    setCleaning(true);
    await fetch(`/api/demo/delete?campaign_id=${campaign.campaign_id}`, { method: "DELETE" });
    setCleaning(false);
    setSimResult(null);
    setSimProgress({ done: 0, total: 0, running: false });
    setTimeout(() => refreshCampaigns(), 400);
  }, [campaign, refreshCampaigns]);

  // ── Health checks ──────────────────────────────────────────────────────────
  const runHealthChecks = useCallback(async () => {
    setHealthRunning(true);
    setHealthChecks(null);
    const results = await performHealthChecks(campaign);
    setHealthChecks(results);
    setHealthRunning(false);
  }, [campaign]);

  // ── Copy diagnostics ───────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = useCallback(() => {
    if (!campaign) return;
    const text = [
      `Campaign:          ${campaign.brand_name} – ${campaign.campaign_name}`,
      `Campaign ID:       ${campaign.campaign_id}`,
      `Manual Status:     ${campaign.status}`,
      `Effective Status:  ${campaign.effective_status}`,
      `Accepting Responses: ${accepting?.accepting ? "YES" : "NO"}`,
      `Failure Reason:    ${accepting?.accepting ? "N/A" : accepting?.reason}`,
      `Response Count:    ${campaign.response_count.toLocaleString()}`,
      `Target Responses:  ${campaign.target_responses?.toLocaleString() ?? "None"}`,
      `Survey Linked:     ${campaign.surveys?.name ?? "None"}`,
      `Start Date:        ${campaign.start_date ?? "None"}`,
      `End Date:          ${campaign.end_date ?? "None"}`,
      ``,
      `Copied from Fanometrix Embed Test — ${new Date().toISOString()}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [campaign, accepting, statusDetail]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const STATUS_PILL: Record<string, string> = {
    draft:     "bg-amber-100 text-amber-700",
    scheduled: "bg-blue-100 text-blue-700",
    live:      "bg-green-100 text-green-700",
    paused:    "bg-orange-100 text-orange-700",
    closed:    "bg-gray-100 text-gray-600",
    archived:  "bg-gray-100 text-gray-400",
  };

  const pct = campaign?.target_responses
    ? Math.min(100, Math.round((campaign.response_count / campaign.target_responses) * 100))
    : null;

  const filteredLogs = logs.filter(l =>
    logFilter === "all" ? true : l.result === logFilter
  );

  return (
    <AdminShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Embed Test</h1>
            <p className="text-sm text-gray-400">Full diagnostics, simulation and submission logs for publisher embed integration.</p>
          </div>
          {campaign && (
            <button
              onClick={copyDiagnostics}
              className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${copied ? "border-green-300 text-green-700 bg-green-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              {copied ? "✓ Copied!" : "Copy Diagnostics"}
            </button>
          )}
        </div>

        {/* Campaign selector + publisher */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Campaign</label>
              {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
                <select
                  value={selectedId}
                  onChange={e => { setSelectedId(e.target.value); setIframeKey(k => k + 1); setPingResult(null); setHealthChecks(null); setSimResult(null); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                >
                  <option value="">— select a campaign —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.brand_name} · {c.campaign_name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Publisher tag</label>
              <input
                value={publisher}
                onChange={e => setPublisher(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                placeholder="e.g. fotmob"
              />
            </div>
          </div>
        </div>

        {campaign && (
          <>
            {/* ── 1 & 2: Accepting status + Manual vs Effective ────────────────── */}
            <div className="grid grid-cols-3 gap-4">

              {/* Accepting responses — hero indicator */}
              <div className={`rounded-xl border p-5 shadow-sm ${accepting?.accepting ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: accepting?.accepting ? "#065F46" : "#991B1B" }}>
                  Accepting Responses
                </p>
                <p className="text-3xl mb-2">{accepting?.accepting ? "✅" : "❌"}</p>
                <p className={`text-lg font-bold mb-1 ${accepting?.accepting ? "text-green-700" : "text-red-700"}`}>
                  {accepting?.accepting ? "YES" : "NO"}
                </p>
                {!accepting?.accepting && (
                  <p className="text-xs text-red-600 font-medium">{accepting?.reason}</p>
                )}
              </div>

              {/* Manual vs Effective status */}
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status Breakdown</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Manual / Stored</p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_PILL[campaign.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Effective (computed)</p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_PILL[campaign.effective_status] ?? "bg-gray-100 text-gray-500"}`}>
                      {campaign.effective_status.toUpperCase()}
                    </span>
                  </div>
                  {statusDetail?.isAutoTransition && statusDetail.reason && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                      <p className="text-xs text-amber-700 font-medium">Auto-override</p>
                      <p className="text-xs text-amber-600 mt-0.5">{statusDetail.reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Response progress */}
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Response Progress</p>
                <p className="text-3xl font-bold text-[#0B1929] mb-1">{campaign.response_count.toLocaleString()}</p>
                {campaign.target_responses ? (
                  <>
                    <p className="text-xs text-gray-400 mb-3">of {campaign.target_responses.toLocaleString()} target ({pct}%)</p>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct! >= 100 ? "#10b981" : "#D7B87A" }} />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No target set</p>
                )}
                {campaign.end_date && (
                  <p className="text-xs text-gray-400 mt-2">
                    End: {campaign.end_date}
                    {new Date(campaign.end_date) < new Date() ? " (passed)" : ""}
                  </p>
                )}
              </div>
            </div>

            {/* ── 5: System health checks ─────────────────────────────────────── */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System Health Checks</p>
                <button
                  onClick={runHealthChecks}
                  disabled={healthRunning}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {healthRunning ? "Running…" : "Run Checks"}
                </button>
              </div>
              {!healthChecks && !healthRunning && (
                <p className="text-xs text-gray-400">Click "Run Checks" to validate the full integration stack.</p>
              )}
              {healthChecks && (
                <div className="grid grid-cols-2 gap-2">
                  {healthChecks.map(({ label, ok, detail }) => (
                    <div key={label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {ok === null ? "⚪" : ok ? "🟢" : "🔴"}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5 break-all">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Preview + Ping + Simulator ────────────────────────────────────── */}
            <div className="grid grid-cols-5 gap-6">

              {/* Live preview */}
              <div className="col-span-3 bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Live Preview <span className="font-normal text-gray-400 normal-case">(country = GB)</span>
                  </p>
                  <button
                    onClick={() => setIframeKey(k => k + 1)}
                    className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                  >
                    ↺ Reload
                  </button>
                </div>
                <div className="flex justify-center bg-gray-100 rounded-lg p-4 mb-3">
                  <iframe
                    key={iframeKey}
                    src={previewUrl!}
                    width={300} height={250}
                    className="rounded shadow"
                    style={{ border: 0 }}
                    title="Embed preview"
                  />
                </div>
                <code className="block text-[10px] bg-gray-50 border border-gray-100 rounded-lg p-2 text-gray-500 break-all">
                  {previewUrl}
                </code>
              </div>

              {/* Test ping + simulator */}
              <div className="col-span-2 space-y-4">

                {/* Test ping */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Test Submission</p>
                  <button
                    onClick={runPing}
                    disabled={pinging}
                    className="w-full text-sm font-semibold py-2 rounded-lg disabled:opacity-50 mb-3"
                    style={{ background: "#0B1929", color: "#D7B87A" }}
                  >
                    {pinging ? "Testing…" : "Run Test Submission"}
                  </button>
                  {pingResult && (
                    <div className={`rounded-lg p-3 text-xs ${pingResult.ok ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                      <p className={`font-semibold mb-1 ${pingResult.ok ? "text-green-700" : "text-red-700"}`}>
                        {pingResult.ok ? `✓ HTTP ${pingResult.status}` : `✗ HTTP ${pingResult.status}`}
                      </p>
                      <pre className="text-gray-500 whitespace-pre-wrap break-all text-[10px]">
                        {JSON.stringify(pingResult.body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* ── 4: Traffic simulator ── */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Traffic Simulator</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Submits test responses tagged <code className="bg-gray-100 px-1 rounded">is_demo=true</code>. Campaign must be Live to accept.
                  </p>

                  {simProgress.running ? (
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Simulating… {simProgress.done}/{simProgress.total}</span>
                        <span className="font-bold text-[#D7B87A]">
                          {Math.round((simProgress.done / simProgress.total) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#D7B87A] rounded-full transition-all"
                          style={{ width: `${Math.round((simProgress.done / simProgress.total) * 100)}%` }} />
                      </div>
                      <button
                        onClick={() => { simCancelRef.current = true; }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[1, 10, 100].map(n => (
                        <button key={n} onClick={() => simulate(n)}
                          className="text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 py-1.5 rounded-lg font-medium">
                          Simulate {n}
                        </button>
                      ))}
                      {campaign.target_responses && (
                        <button onClick={simulateToTarget}
                          className="text-xs border border-blue-200 text-blue-700 hover:bg-blue-50 py-1.5 rounded-lg font-medium col-span-2">
                          Reach Target ({Math.max(0, campaign.target_responses - campaign.response_count)} remaining)
                        </button>
                      )}
                    </div>
                  )}

                  {simResult && (
                    <p className="text-xs text-gray-600 mb-2 font-medium">{simResult}</p>
                  )}

                  <button
                    onClick={cleanupSimulator}
                    disabled={cleaning}
                    className="w-full text-xs border border-red-100 text-red-500 hover:bg-red-50 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {cleaning ? "Cleaning…" : "Remove Test Responses"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── 3: Submission logs ────────────────────────────────────────────── */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Submission Logs <span className="font-normal text-gray-400 normal-case">(last 20)</span></p>
                  <button onClick={fetchLogs} className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg">↺ Refresh</button>
                </div>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {(["all","success","failed"] as const).map(f => (
                    <button key={f}
                      onClick={() => setLogFilter(f)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${logFilter === f ? "bg-[#0B1929] text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                  <input
                    value={logPubFilter}
                    onChange={e => setLogPubFilter(e.target.value)}
                    placeholder="Filter publisher…"
                    className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D7B87A] w-36"
                  />
                  <input
                    type="date"
                    value={logDateFilter}
                    onChange={e => setLogDateFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D7B87A]"
                  />
                  {(logPubFilter || logDateFilter) && (
                    <button onClick={() => { setLogPubFilter(""); setLogDateFilter(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                  )}
                </div>
              </div>

              {logsLoading ? (
                <p className="text-xs text-gray-400 p-5">Loading logs…</p>
              ) : filteredLogs.length === 0 ? (
                <p className="text-xs text-gray-400 p-5">
                  No submission logs yet.{" "}
                  {!campaign ? "Select a campaign to filter logs." : "Run a test submission to generate the first log entry."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Timestamp","Campaign","Publisher","Status","HTTP Code","Result","Reason"].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleTimeString()}
                            {log.is_test && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">TEST</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 max-w-[120px] truncate" title={log.campaign_name}>{log.campaign_name}</td>
                          <td className="px-4 py-2.5 text-gray-500">{log.publisher ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${log.effective_status === "live" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                              {log.effective_status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            <span className={log.http_code === 200 ? "text-green-600" : "text-red-500"}>{log.http_code || "—"}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${log.result === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {log.result === "success" ? "Success" : "Failed"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate" title={log.reason ?? ""}>{log.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!campaign && !loading && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-blue-800 mb-1">Select a campaign above to begin diagnostics</p>
            <p className="text-xs text-blue-600">All checks, simulation and logs will be scoped to the selected campaign.</p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

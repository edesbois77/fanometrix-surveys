"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://fanometrix-surveys.vercel.app";

type Campaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  survey_id: string | null;
  surveys?: { name: string } | null;
  status: string;
  effective_status: string;
  start_date: string | null;
  end_date: string | null;
  target_responses: number | null;
  response_count: number;
};

type DiagResult = {
  ok: boolean;
  label: string;
  detail: string;
};

type PingResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

const STATUS_PILL: Record<string, string> = {
  draft:     "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  live:      "bg-green-100 text-green-700",
  paused:    "bg-orange-100 text-orange-700",
  closed:    "bg-gray-100 text-gray-600",
  archived:  "bg-gray-100 text-gray-400",
};

export default function EmbedTestPage() {
  const [campaigns,       setCampaigns]       = useState<Campaign[]>([]);
  const [selectedId,      setSelectedId]      = useState("");
  const [iframeKey,       setIframeKey]       = useState(0);
  const [publisher,       setPublisher]       = useState("test-publisher");
  const [pingResult,      setPingResult]      = useState<PingResult | null>(null);
  const [pinging,         setPinging]         = useState(false);
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(j => { setCampaigns(j.data ?? []); setLoading(false); });
  }, []);

  const campaign = campaigns.find(c => c.id === selectedId) ?? null;

  // Build diagnostics for the selected campaign
  const diags: DiagResult[] = campaign ? [
    {
      ok:     !!campaign.campaign_id,
      label:  "Campaign ID",
      detail: campaign.campaign_id || "Missing",
    },
    {
      ok:     campaign.effective_status === "live",
      label:  "Effective status",
      detail: campaign.effective_status
        ? `${campaign.effective_status.toUpperCase()} — ${
            campaign.effective_status === "live"
              ? "✓ will accept responses"
              : "✗ will reject responses"
          }`
        : "Unknown",
    },
    {
      ok:     !!campaign.survey_id,
      label:  "Survey linked",
      detail: campaign.surveys?.name ?? (campaign.survey_id ? campaign.survey_id : "No survey linked — using default questions"),
    },
    {
      ok:     true,
      label:  "Response count",
      detail: `${(campaign.response_count ?? 0).toLocaleString()} responses${
        campaign.target_responses ? ` / ${campaign.target_responses.toLocaleString()} target` : ""
      }`,
    },
    {
      ok:     !campaign.end_date || new Date(campaign.end_date) > new Date(),
      label:  "End date",
      detail: campaign.end_date
        ? `${campaign.end_date} — ${new Date(campaign.end_date) > new Date() ? "not yet reached" : "PASSED"}`
        : "No end date set",
    },
  ] : [];

  const previewUrl = campaign
    ? `${BASE}/embed?campaign=${campaign.campaign_id}&survey=${campaign.survey_id ?? ""}&publisher=${publisher}&country=GB`
    : null;

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
          q1:          "Never",
          q2:          "Good",
          q3:          "Likely",
          device:      "desktop",
          browser:     "Chrome",
          response_duration_seconds: 12,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setPingResult({ ok: res.ok, status: res.status, body });
    } catch (err) {
      setPingResult({ ok: false, status: 0, body: { error: String(err) } });
    }
    setPinging(false);
  }, [campaign, publisher]);

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Embed Test</h1>
          <p className="text-sm text-gray-400">
            Verify that a campaign embed is loading and accepting responses correctly.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-6">

          {/* ── Left: selector + diagnostics ── */}
          <div className="col-span-2 space-y-4">

            {/* Campaign selector */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select Campaign</p>
              {loading ? (
                <p className="text-xs text-gray-400">Loading campaigns…</p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => { setSelectedId(e.target.value); setIframeKey(k => k + 1); setPingResult(null); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                >
                  <option value="">— select a campaign —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.brand_name} · {c.campaign_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Diagnostics */}
            {campaign && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Diagnostics</p>
                {diags.map(({ ok, label, detail }) => (
                  <div key={label} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 text-xs font-bold w-4 ${ok ? "text-green-500" : "text-red-500"}`}>
                      {ok ? "✓" : "✗"}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}

                {/* Status pill */}
                <div className="pt-1">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_PILL[campaign.effective_status] ?? "bg-gray-100 text-gray-500"}`}>
                    {campaign.effective_status?.toUpperCase()}
                  </span>
                  {campaign.effective_status !== "live" && (
                    <p className="text-xs text-red-500 mt-2 font-medium">
                      Submissions will be rejected. Set campaign to Live to accept responses.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Test submission */}
            {campaign && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Test Submission</p>
                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">Publisher tag</label>
                  <input
                    value={publisher}
                    onChange={e => setPublisher(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                    placeholder="e.g. fotmob"
                  />
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Sends a test submission to <code className="bg-gray-100 px-1 rounded">/api/submit</code> with hardcoded answers (q1: Never, q2: Good, q3: Likely). No actual response is recorded if the campaign is not Live.
                </p>
                <button
                  onClick={runPing}
                  disabled={pinging}
                  className="w-full text-sm font-semibold py-2 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  {pinging ? "Testing…" : "Run Test Submission"}
                </button>

                {pingResult && (
                  <div className={`mt-3 rounded-lg p-3 text-xs ${pingResult.ok ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                    <p className={`font-semibold mb-1 ${pingResult.ok ? "text-green-700" : "text-red-700"}`}>
                      {pingResult.ok ? `✓ HTTP ${pingResult.status} — Submission accepted` : `✗ HTTP ${pingResult.status} — Submission rejected`}
                    </p>
                    <pre className="text-gray-500 whitespace-pre-wrap break-all text-[10px]">
                      {JSON.stringify(pingResult.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: embed preview ── */}
          <div className="col-span-3 space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Live Preview <span className="font-normal text-gray-400 normal-case">(country = GB)</span>
                </p>
                {previewUrl && (
                  <button
                    onClick={() => setIframeKey(k => k + 1)}
                    className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                  >
                    ↺ Reload
                  </button>
                )}
              </div>

              <div className="flex justify-center bg-gray-100 rounded-lg p-4">
                {previewUrl ? (
                  <iframe
                    key={iframeKey}
                    src={previewUrl}
                    width={300}
                    height={250}
                    className="rounded shadow"
                    style={{ border: 0 }}
                    title="Embed test preview"
                  />
                ) : (
                  <div className="w-[300px] h-[250px] bg-gray-100 rounded flex items-center justify-center border border-dashed border-gray-300">
                    <p className="text-xs text-gray-400 text-center px-6">Select a campaign to preview the embed</p>
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Embed URL</p>
                  <code className="block text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 text-gray-600 break-all">
                    {previewUrl}
                  </code>
                </div>
              )}
            </div>

            {/* Quick help */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-blue-700 mb-2">Common issues</p>
              <ul className="space-y-1.5 text-xs text-blue-600">
                <li>• <strong>Submission rejected:</strong> Campaign must be set to <strong>Live</strong> status</li>
                <li>• <strong>Wrong questions showing:</strong> Ensure a survey is linked to the campaign in the Campaigns page</li>
                <li>• <strong>All answers null:</strong> Survey question IDs must map correctly — reload the embed to re-fetch</li>
                <li>• <strong>Campaign not found:</strong> Verify the campaign_id in the URL matches an existing campaign</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

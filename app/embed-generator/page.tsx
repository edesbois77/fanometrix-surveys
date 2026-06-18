"use client";

import { useState, useEffect, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Campaign = { id: string; campaign_id: string; brand_name: string; campaign_name: string; survey_id: string | null };

const BASE = "https://fanometrix-surveys.vercel.app";

const GEO_MACROS: Record<string, string> = {
  "Google Ad Manager / DV360": "%%COUNTRY%%",
  "Xandr (AppNexus)":          "${GEO_COUNTRY}",
  "Freewheel":                 "[country]",
  "The Trade Desk":            "##COUNTRY##",
  "Direct / Hardcoded":        "GB",
};

export default function EmbedGeneratorPage() {
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([]);
  const [campaignId,  setCampaignId]  = useState("");
  const [publisher,   setPublisher]   = useState("");
  const [placement,   setPlacement]   = useState("");
  const [club,        setClub]        = useState("");
  const [competition, setCompetition] = useState("");
  const [segment,     setSegment]     = useState("");
  const [adServer,    setAdServer]    = useState("Google Ad Manager / DV360");
  const [copied,      setCopied]      = useState<"iframe" | "script" | null>(null);

  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(j => {
      setCampaigns(j.data ?? []);
      if (j.data?.length) setCampaignId(j.data[0].campaign_id);
    });
  }, []);

  const selectedCampaign = campaigns.find(c => c.campaign_id === campaignId);
  const countryMacro = GEO_MACROS[adServer] ?? "%%COUNTRY%%";

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (campaignId)  p.set("campaign",  campaignId);
    if (selectedCampaign?.survey_id) p.set("survey", selectedCampaign.survey_id);
    if (publisher)   p.set("publisher",   publisher);
    if (placement)   p.set("placement",   placement);
    if (club)        p.set("club",        club);
    if (competition) p.set("competition", competition);
    if (segment)     p.set("segment",     segment);
    p.set("country", countryMacro);
    return p.toString();
  }, [campaignId, selectedCampaign, publisher, placement, club, competition, segment, countryMacro]);

  const iframeCode = `<iframe\n  src="${BASE}/embed?${params}"\n  width="300" height="250"\n  frameborder="0" scrolling="no"\n  style="border:0;overflow:hidden;display:block;"\n  title="Fanometrix Pulse Fan Survey"\n></iframe>`;

  const scriptCode = `<script\n  src="${BASE}/embed.js"\n  data-campaign="${campaignId}"${selectedCampaign?.survey_id ? `\n  data-survey="${selectedCampaign.survey_id}"` : ""}${publisher   ? `\n  data-publisher="${publisher}"`     : ""}${placement   ? `\n  data-placement="${placement}"`     : ""}${club        ? `\n  data-club="${club}"`               : ""}${competition ? `\n  data-competition="${competition}"` : ""}${segment     ? `\n  data-segment="${segment}"`         : ""}\n  data-country="${countryMacro}"\n><\/script>`;

  const previewUrl = `${BASE}/embed?${params.replace(encodeURIComponent(countryMacro), "GB")}`;

  function copy(code: string, type: "iframe" | "script") {
    navigator.clipboard.writeText(code);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Embed Generator</h1>
        <p className="text-sm text-gray-400 mb-6">Configure your embed parameters and copy the tag to your ad server.</p>

        <div className="grid grid-cols-5 gap-6">
          {/* Config panel */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</p>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Select Campaign</label>
                <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">— custom —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.campaign_id}>{c.brand_name} · {c.campaign_name}</option>
                  ))}
                </select>
                {!campaigns.length && (
                  <p className="text-xs text-amber-500 mt-1">No campaigns yet. <a href="/campaigns" className="underline">Create one.</a></p>
                )}
              </div>

              {!selectedCampaign && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Campaign ID</label>
                  <input value={campaignId} onChange={e => setCampaignId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400" placeholder="e.g. carlsberg_ucl_2026" />
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Placement</p>
              {[
                ["Publisher",   publisher,   setPublisher,   "e.g. sky-sports"],
                ["Placement",   placement,   setPlacement,   "e.g. homepage-mpu"],
                ["Club",        club,        setClub,        "e.g. Arsenal"],
                ["Competition", competition, setCompetition, "e.g. Premier League"],
                ["Fan Segment", segment,     setSegment,     "e.g. season-ticket-holder"],
              ].map(([label, val, setter, ph]) => (
                <div key={label as string}>
                  <label className="text-xs text-gray-500 block mb-1">{label as string}</label>
                  <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" placeholder={ph as string} />
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ad Server</p>
              <select value={adServer} onChange={e => setAdServer(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                {Object.keys(GEO_MACROS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-2">Country macro: <code className="bg-gray-100 px-1 rounded text-indigo-600">{countryMacro}</code></p>
            </div>
          </div>

          {/* Output panel */}
          <div className="col-span-3 space-y-4">
            {/* Preview */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview (country = GB)</p>
              <div className="flex justify-center bg-gray-100 rounded-lg p-4">
                <iframe src={previewUrl} width={300} height={250}
                  className="rounded overflow-hidden shadow"
                  style={{ border: 0 }} title="Preview" />
              </div>
            </div>

            {/* Iframe tag */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Iframe tag</p>
                <button onClick={() => copy(iframeCode, "iframe")}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${copied === "iframe" ? "bg-green-100 text-green-700" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                  {copied === "iframe" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{iframeCode}</pre>
            </div>

            {/* Script tag */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Script tag</p>
                <button onClick={() => copy(scriptCode, "script")}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${copied === "script" ? "bg-green-100 text-green-700" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                  {copied === "script" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{scriptCode}</pre>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

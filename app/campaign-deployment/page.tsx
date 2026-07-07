"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Campaign = {
  id: string;
  campaign_id: string;
  brand_org_id: string | null;
  campaign_name: string;
  survey_id: string | null;
  surveys?: { name: string } | null;
  publisher_org_id: string | null;
  survey_language: string | null;
  country_code: string | null;
};

const BASE = process.env.NEXT_PUBLIC_SURVEYS_URL ?? "https://fanometrix-surveys.vercel.app";

const GEO_MACROS: Record<string, string> = {
  "Google Ad Manager / DV360": "%%COUNTRY%%",
  "Xandr (AppNexus)":          "${GEO_COUNTRY}",
  "Freewheel":                 "[country]",
  "The Trade Desk":            "##COUNTRY##",
  "Direct / Hardcoded":        "GB",
};

const PLACEMENT_OPTIONS = [
  "run-of-network",
  "homepage-mpu",
  "match-centre-mpu",
  "lineups-mpu",
  "article-inline",
  "article-footer",
  "team-page-mpu",
  "league-page-mpu",
  "Custom…",
];

const INSTRUCTIONS = `1. Place the iframe inside a 300x250 MPU creative slot.
2. Replace the country macro with your ad server macro (e.g. %%COUNTRY%% for GAM).
3. Populate publisher and placement values before trafficking.
4. Do not pass personal identifiers in any URL parameter.
5. Test the preview URL before going live.`;

export default function EmbedGeneratorPage() {
  const [campaigns,       setCampaigns]       = useState<Campaign[]>([]);
  const [orgs,            setOrgs]            = useState<{ id: string; name: string }[]>([]);
  const [selectedId,      setSelectedId]      = useState("");          // campaign UUID
  const [publisher,       setPublisher]       = useState("");
  const [placementPreset, setPlacementPreset] = useState("");
  const [placementCustom, setPlacementCustom] = useState("");
  const [club,            setClub]            = useState("");
  const [competition,     setCompetition]     = useState("");
  const [segment,         setSegment]         = useState("");
  const [adServer,        setAdServer]        = useState("Google Ad Manager / DV360");
  const [copied,          setCopied]          = useState<"iframe" | "script" | "instructions" | null>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then(j => {
        const data: Campaign[] = j.data ?? [];
        setCampaigns(data);
        // Pre-select campaign from URL param (e.g. from Campaign Detail page)
        const preselect = new URLSearchParams(window.location.search).get("campaign");
        if (preselect) {
          const match = data.find(c => c.id === preselect);
          if (match) setSelectedId(match.id);
        }
      });
    fetch("/api/organisations")
      .then(r => r.json())
      .then(j => setOrgs(j.data ?? []));
  }, []);

  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  const campaign = campaigns.find(c => c.id === selectedId) ?? null;

  // When campaign changes, auto-fill publisher from the campaign record
  useEffect(() => {
    setPublisher(orgName(campaigns.find(c => c.id === selectedId)?.publisher_org_id ?? null));
  }, [selectedId, campaigns, orgName]);

  const placement = placementPreset === "Custom…" ? placementCustom : placementPreset;
  const countryMacro = GEO_MACROS[adServer] ?? "%%COUNTRY%%";

  const campaignIdValue = campaign?.campaign_id ?? "";
  const surveyName      = campaign?.surveys?.name ?? null;

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (campaignIdValue) p.set("campaign",   campaignIdValue);
    // survey= intentionally omitted — campaign= takes priority in the embed
    if (publisher)       p.set("publisher",  publisher);
    if (placement)       p.set("placement",  placement);
    if (club)            p.set("club",       club);
    if (competition)     p.set("competition", competition);
    if (segment)         p.set("segment",    segment);
    p.set("country", countryMacro);
    return p.toString();
  }, [campaignIdValue, publisher, placement, club, competition, segment, countryMacro]);

  const previewParams = useMemo(() => {
    const p = new URLSearchParams();
    if (campaignIdValue)             p.set("campaign",    campaignIdValue);
    // survey= omitted — embed resolves via campaign slug
    if (campaign?.survey_language)   p.set("lang",        campaign.survey_language);
    if (publisher)                   p.set("publisher",   publisher);
    if (placement)                   p.set("placement",   placement);
    if (club)                        p.set("club",        club);
    if (competition)                 p.set("competition", competition);
    if (segment)                     p.set("segment",     segment);
    if (campaign?.country_code) p.set("country", campaign.country_code);
    p.set("preview", "1");
    return p.toString();
  }, [campaignIdValue, campaign, publisher, placement, club, competition, segment]);

  const iframeCode = [
    `<iframe`,
    `  src="${BASE}/embed?${params}"`,
    `  width="300" height="250"`,
    `  frameborder="0" scrolling="no"`,
    `  style="border:0;overflow:hidden;display:block;"`,
    `  title="Fanometrix Fan Survey"`,
    `></iframe>`,
  ].join("\n");

  const scriptCode = [
    `<script`,
    `  src="${BASE}/embed.js"`,
    campaignIdValue         ? `  data-campaign="${campaignIdValue}"` : null,
    // data-survey intentionally omitted — embed resolves survey via campaign= slug
    publisher               ? `  data-publisher="${publisher}"` : null,
    placement               ? `  data-placement="${placement}"` : null,
    club                    ? `  data-club="${club}"` : null,
    competition             ? `  data-competition="${competition}"` : null,
    segment                 ? `  data-segment="${segment}"` : null,
    `  data-country="${countryMacro}"`,
    `><\/script>`,
  ].filter(Boolean).join("\n");

  function copy(text: string, type: typeof copied) {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  const btn = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-[#0B1929] hover:bg-gray-200"}`;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Deployment</h1>
        <p className="text-sm text-gray-400 mb-6">Configure your embed and copy the tag to your ad server.</p>

        {/*
          Mobile:  flex-col — sections stack vertically, full width
          Desktop: 5-column grid — 2 cols config / 3 cols output
        */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-6">

          {/* ── Left config panel ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Campaign */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign</p>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Select Campaign</label>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                >
                  <option value="">— select a campaign —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{orgName(c.brand_org_id)} · {c.campaign_name}</option>
                  ))}
                </select>
                {!campaigns.length && (
                  <p className="text-xs text-amber-500 mt-1">
                    No campaigns yet. <a href="/campaigns" className="underline">Create one.</a>
                  </p>
                )}
              </div>

              {campaign && (
                <div className="space-y-2 pt-1 border-t border-gray-50">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Campaign ID</span>
                    <span className="font-mono text-[#0B1929]">{campaign.campaign_id}</span>
                  </div>
                  {surveyName && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Survey</span>
                      <span className="text-gray-700">{surveyName}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Placement */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Placement</p>

              {/* Publisher — pre-filled from campaign, editable for overrides */}
              <div>
                <label className="text-xs text-gray-500 block mb-2">Publisher</label>
                <input
                  value={publisher}
                  onChange={e => setPublisher(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="e.g. FotMob"
                />
              </div>

              {/* Placement dropdown */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Placement</label>
                <select
                  value={placementPreset}
                  onChange={e => { setPlacementPreset(e.target.value); if (e.target.value !== "Custom…") setPlacementCustom(""); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                >
                  <option value="">— select placement —</option>
                  {PLACEMENT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {placementPreset === "Custom…" && (
                  <input
                    value={placementCustom}
                    onChange={e => setPlacementCustom(e.target.value)}
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                    placeholder="Enter custom placement name"
                    autoFocus
                  />
                )}
              </div>

              {/* Club */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Club</label>
                <input
                  value={club}
                  onChange={e => setClub(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="e.g. Arsenal"
                />
              </div>

              {/* Competition */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Competition</label>
                <input
                  value={competition}
                  onChange={e => setCompetition(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="e.g. Premier League"
                />
              </div>

              {/* Fan Segment */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fan Segment</label>
                <input
                  value={segment}
                  onChange={e => setSegment(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="e.g. season-ticket-holder"
                />
              </div>
            </div>

            {/* Ad server */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ad Server</p>
              <select
                value={adServer}
                onChange={e => setAdServer(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
              >
                {Object.keys(GEO_MACROS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-2">
                Country macro: <code className="bg-gray-100 px-1 rounded text-[#0B1929]">{countryMacro}</code>
              </p>
            </div>

            {/* Response Metadata Preview */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Response Metadata Preview</p>
              <div className="space-y-2">
                {[
                  ["Campaign",    campaignIdValue   || <span className="text-gray-300 italic">not set</span>],
                  ["Survey",      surveyName        || <span className="text-gray-300 italic">not linked</span>],
                  ["Publisher",   publisher         || <span className="text-gray-300 italic">not set</span>],
                  ["Placement",   placement         || <span className="text-gray-300 italic">not set</span>],
                  ["Club",        club              || <span className="text-gray-300 italic">not set</span>],
                  ["Competition", competition       || <span className="text-gray-300 italic">not set</span>],
                  ["Fan Segment", segment           || <span className="text-gray-300 italic">not set</span>],
                  ["Country",     <span key="c" className="font-mono text-[#0B1929]">{countryMacro}</span>],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400 flex-shrink-0">{label as string}</span>
                    <span className="text-xs text-gray-800 text-right truncate">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right output panel ── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Preview */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 md:p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Preview{campaign && (
                <span className="text-gray-400 font-normal normal-case ml-1">
                  ({campaign.country_code ? `country = ${campaign.country_code}` : "no country set"}{campaign.survey_language && campaign.survey_language !== "en" ? ` · ${campaign.survey_language}` : ""})
                </span>
              )}
              </p>
              {/*
                overflow-x-auto allows the 300px iframe to scroll on screens
                narrower than 300px + card padding (e.g. iPhone SE at 375px is fine;
                extreme narrow viewports gracefully scroll rather than clipping).
              */}
              <div className="overflow-x-auto">
                <div className="flex justify-center bg-gray-100 rounded-lg p-3 md:p-4 min-w-[300px]">
                  {campaignIdValue ? (
                    <iframe
                      key={previewParams}
                      src={`${BASE}/embed?${previewParams}`}
                      width={300}
                      height={250}
                      className="rounded overflow-hidden shadow flex-shrink-0"
                      style={{ border: 0 }}
                      title="Preview"
                    />
                  ) : (
                    <div className="w-[300px] h-[250px] bg-gray-100 rounded flex items-center justify-center text-center px-6 border border-[#E0E1DD] flex-shrink-0">
                      <p className="text-gray-400 text-xs">Select a campaign to preview the creative</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Shareable preview URL for adops */}
              {campaignIdValue && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1.5">
                    <span className="font-semibold">Preview URL</span>
                    <span className="text-gray-400 ml-1">— share with adops to review the creative before going live</span>
                  </p>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate">
                      {`${BASE}/embed?${previewParams}`}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${BASE}/embed?${previewParams}`);
                        setCopied("iframe");
                        setTimeout(() => setCopied(null), 2000);
                      }}
                      className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
                    >
                      {copied === "iframe" ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-amber-600 mt-1.5">
                    ⚠ Preview URLs bypass validation — for review only, not for production use.
                  </p>
                </div>
              )}
            </div>

            {/* Iframe tag */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 md:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Iframe tag</p>
                <button onClick={() => copy(iframeCode, "iframe")}
                  className={`${btn(copied === "iframe")} flex-shrink-0`}>
                  {copied === "iframe" ? "Copied!" : "Copy"}
                </button>
              </div>
              {/* overflow-x-auto on pre only — page never scrolls horizontally */}
              <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre leading-relaxed max-w-full">{iframeCode}</pre>
            </div>

            {/* Script tag */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 md:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Script tag</p>
                <button onClick={() => copy(scriptCode, "script")}
                  className={`${btn(copied === "script")} flex-shrink-0`}>
                  {copied === "script" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre leading-relaxed max-w-full">{scriptCode}</pre>
            </div>

            {/* Integration instructions */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 md:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Integration Instructions</p>
                <button onClick={() => copy(INSTRUCTIONS, "instructions")}
                  className={`${btn(copied === "instructions")} flex-shrink-0`}>
                  {copied === "instructions" ? "Copied!" : "Copy Instructions"}
                </button>
              </div>
              <ol className="space-y-1.5 list-decimal list-inside">
                {INSTRUCTIONS.split("\n").map((line, i) => (
                  <li key={i} className="text-xs text-gray-600">{line.replace(/^\d+\.\s/, "")}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// The two data exports every partner report ships with.
//
// These are designed to be the standard outputs of the reporting framework, not
// one campaign's attachments: the column sets are derived from the report
// definition and the survey instrument, so a different partner, brand or
// question set produces the same shaped file with different contents.
//
// Columns that are constant for a campaign (publisher, placement) are still
// emitted. A partner loading this into a spreadsheet alongside another export
// needs the join keys present even when they only take one value here.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchCampaigns, fetchEventBuckets, fetchResponses, fetchSurveyQuestions } from "./data";
import type { PartnerReport } from "./types";

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // A UTF-8 BOM so Excel opens accented market and answer labels correctly
  // rather than mojibake, which is the single most common complaint about a
  // research export.
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

function localisedText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const obj = value as Record<string, string>;
  return obj.en ?? Object.values(obj)[0] ?? "";
}

/** Every completed response, one row each, with the answer text rather than the
 *  stored option id — a client should not need a codebook to read the export. */
export async function buildResponsesCsv(report: PartnerReport): Promise<string> {
  const [campaigns, responses] = await Promise.all([
    fetchCampaigns(report.campaignIds),
    fetchResponses(report.campaignIds, report.dataFrom),
  ]);

  const byCampaign = new Map(campaigns.map((c) => [c.campaign_id, c]));

  const designSlugs = [...new Set(campaigns.map((c) => c.creative_design ?? "classic"))];
  const { data: designRows } = await supabaseAdmin
    .from("creative_designs")
    .select("slug, name")
    .in("slug", designSlugs);
  const designNames = new Map(
    ((designRows ?? []) as { slug: string; name: string }[]).map((d) => [d.slug, d.name]),
  );

  const surveyIds = [...new Set(campaigns.map((c) => c.survey_id).filter((x): x is string => !!x))];
  const questionSets = await fetchSurveyQuestions(surveyIds);
  const canonical = [...questionSets.values()].sort((a, b) => b.length - a.length)[0] ?? [];

  const answerLabel = (index: number, optionId: string | null): string => {
    if (!optionId) return "";
    const q = canonical[index];
    if (!q) return optionId;
    const opt = q.options.find((o) => String(o.id) === optionId);
    return opt ? localisedText(opt.text) : optionId;
  };

  const headers = [
    "response_id",
    "submitted_at_utc",
    "campaign",
    "market",
    "country_code",
    "publisher",
    "placement",
    "creative",
    "survey_language",
    "device",
    "browser",
    ...canonical.slice(0, 3).flatMap((q, i) => [`q${i + 1}_question`, `q${i + 1}_answer`]),
    "completed",
    "duration_seconds",
  ];

  const rows = responses.map((r) => {
    const c = byCampaign.get(r.campaign_id);
    const slug = c?.creative_design ?? "classic";
    const answers = canonical.slice(0, 3).flatMap((q, i) => {
      const key = (["q1", "q2", "q3"] as const)[i];
      return [localisedText(q.text), answerLabel(i, r[key])];
    });
    return [
      r.id,
      r.created_at,
      c?.campaign_name ?? r.campaign_id,
      c?.market ?? r.country ?? "",
      r.country_code ?? c?.country_code ?? "",
      r.publisher ?? report.organisationName,
      r.placement ?? "",
      designNames.get(slug) ?? slug,
      r.survey_language ?? "",
      r.device ?? "",
      r.browser ?? "",
      ...answers,
      // Every row in `responses` is a submitted survey; the column exists so the
      // file joins cleanly against a funnel export that also carries partials.
      "yes",
      r.response_duration_seconds ?? "",
    ];
  });

  return toCsv(headers, rows);
}

/** Hourly campaign metrics: one row per hour × market × creative, with the
 *  funnel counts and the rates derived from them. */
export async function buildMetricsCsv(report: PartnerReport): Promise<string> {
  const [campaigns, eventData] = await Promise.all([
    fetchCampaigns(report.campaignIds),
    fetchEventBuckets(report.campaignIds, report.dataFrom),
  ]);

  const byCampaign = new Map(campaigns.map((c) => [c.campaign_id, c]));
  const designSlugs = [...new Set(campaigns.map((c) => c.creative_design ?? "classic"))];
  const { data: designRows } = await supabaseAdmin
    .from("creative_designs")
    .select("slug, name")
    .in("slug", designSlugs);
  const designNames = new Map(
    ((designRows ?? []) as { slug: string; name: string }[]).map((d) => [d.slug, d.name]),
  );

  type Cell = {
    hour: string;
    campaign: string;
    market: string;
    placement: string;
    creative: string;
    loads: number;
    viewable: number;
    starts: number;
    completed: number;
  };

  const cells = new Map<string, Cell>();
  for (const b of eventData.buckets) {
    const c = byCampaign.get(b.campaignId);
    const slug = c?.creative_design ?? "classic";
    const market = c?.market ?? b.country ?? "";
    const key = `${b.hour}|${b.campaignId}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        hour: b.hour,
        campaign: c?.campaign_name ?? b.campaignId,
        market,
        placement: "run-of-network",
        creative: designNames.get(slug) ?? slug,
        loads: 0,
        viewable: 0,
        starts: 0,
        completed: 0,
      };
      cells.set(key, cell);
    }
    if (b.eventType === "SURVEY_RENDER") cell.loads += b.count;
    else if (b.eventType === "SURVEY_VISIBLE") cell.viewable += b.count;
    else if (b.eventType === "SURVEY_START") cell.starts += b.count;
    else if (b.eventType === "SURVEY_COMPLETED") cell.completed += b.count;
  }

  const headers = [
    "hour_utc",
    "campaign",
    "market",
    "publisher",
    "placement",
    "creative",
    "impressions_loads",
    "impressions_viewable",
    "survey_starts",
    "completed_responses",
    "start_rate",
    "completion_rate",
    "response_rate",
    "responses_per_10000_impressions",
  ];

  const pct = (n: number, d: number) => (d > 0 ? (n / d).toFixed(6) : "");

  const rows = [...cells.values()]
    .sort((a, b) => (a.hour === b.hour ? a.campaign.localeCompare(b.campaign) : a.hour.localeCompare(b.hour)))
    .map((c) => [
      c.hour,
      c.campaign,
      c.market,
      report.organisationName,
      c.placement,
      c.creative,
      c.loads,
      c.viewable,
      c.starts,
      c.completed,
      pct(c.starts, c.loads),
      pct(c.completed, c.starts),
      pct(c.completed, c.loads),
      c.loads > 0 ? ((c.completed / c.loads) * 10000).toFixed(2) : "",
    ]);

  return toCsv(headers, rows);
}

/** A filename a partner can drop into a folder of many and still identify. */
export function exportFilename(report: PartnerReport, kind: string, ext: string): string {
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safe(report.organisationName)}-${safe(report.campaignTitle)}-${kind}.${ext}`;
}

// The Audience Intelligence Report engine.
//
// Takes a partner_reports definition and returns a fully computed report from
// live production data. Every figure the page renders is produced here, on
// request — nothing is stored, nothing is hardcoded, and no campaign, publisher
// or brand is named in this file. Point it at a different definition and it
// produces that partner's report.
//
// Two rules run through the whole module:
//
//   1. The statistics decide what may be said. A difference that does not clear
//      the 95% bar is reported as "no difference we can stand behind", never as
//      a smaller result. See stats.ts.
//   2. Confirmed findings and possible explanations are separate types and are
//      never merged. A hypothesis is never phrased as a fact.

import {
  compareProportions,
  index100,
  marginOfError,
  sampleQuality,
  MIN_REPORTABLE_SAMPLE,
} from "./stats";
import {
  fetchCampaigns,
  fetchCreativeDesigns,
  fetchEffectiveCreatives,
  fetchEventBuckets,
  fetchFirstEventAt,
  fetchLastEventAt,
  fetchResponses,
  fetchSurveyQuestions,
  firstViewableHour,
  type CampaignRow,
  type EventBucket,
  type ResponseRow,
  type CreativeDesignRow,
  type SurveyQuestion,
} from "./data";
import { localHour, zoneForCountryCode } from "./timezones";
import { getVisitCounts } from "./visits";
import type {
  AudienceIntelligenceReport,
  CreativeComparison,
  CreativeUsed,
  Decision,
  Finding,
  FunnelCounts,
  FunnelRates,
  Highlight,
  HourPoint,
  NotableDifference,
  PartnerReport,
  QuestionDistribution,
  Recommendation,
  Segment,
} from "./types";

// ── Funnel vocabulary ────────────────────────────────────────────────────────
// QUESTION_2_REACHED is deliberately absent. It fires within a second of
// SURVEY_START and is numerically equal to it, so treating it as a funnel step
// would invent a stage that does not exist. SURVEY_EXIT is absent for the
// opposite reason: its emission was removed from the embed, so surviving rows
// are historical residue and inconsistent between campaigns.
const LOAD = "SURVEY_RENDER";
const VISIBLE = "SURVEY_VISIBLE";
const START = "SURVEY_START";
const COMPLETE = "SURVEY_COMPLETED";
const QUESTION_REACHED = /^QUESTION_(\d+)_REACHED$/;

const QUESTION_KEYS = ["q1", "q2", "q3"] as const;

type CampaignMeta = CampaignRow & {
  market: string;
  creativeLabel: string;
  creativeSlug: string;
};

function emptyCounts(): FunnelCounts {
  return { loads: 0, viewable: 0, starts: 0, reachedFinalQuestion: 0, completed: 0 };
}

function rates(c: FunnelCounts, viewabilityMeasurable: boolean): FunnelRates {
  return {
    viewabilityRate: viewabilityMeasurable && c.loads > 0 ? c.viewable / c.loads : null,
    startRate: c.loads > 0 ? c.starts / c.loads : 0,
    completionRate: c.starts > 0 ? c.completed / c.starts : 0,
    responseRate: c.loads > 0 ? c.completed / c.loads : 0,
    responsesPer10k: c.loads > 0 ? (c.completed / c.loads) * 10000 : 0,
  };
}

/** Pick English from a localised text blob, falling back to the first value so
 *  a survey authored without English still renders. */
function text(value: string | Record<string, string> | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value.en ?? Object.values(value)[0] ?? "";
}

/** "a", "a and b", "a, b and c" — the Oxford-free list a reader expects in
 *  running prose. Naively joining with " and " produces "a and b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

// ── Campaign metadata ────────────────────────────────────────────────────────

/** A campaign's market, preferring what the campaign record says and falling
 *  back to what its events actually reported. Campaigns created outside the
 *  deployment generator can have a null market while every one of their events
 *  carries a country, so the fallback is the difference between a labelled
 *  market and a blank one. */
function resolveMarket(c: CampaignRow, buckets: EventBucket[]): string {
  if (c.market) return c.market;
  const counts = new Map<string, number>();
  for (const b of buckets) {
    if (b.campaignId !== c.campaign_id || !b.country) continue;
    counts.set(b.country, (counts.get(b.country) ?? 0) + b.count);
  }
  let best = "";
  let bestN = 0;
  for (const [country, n] of counts) if (n > bestN) [best, bestN] = [country, n];
  return best || "Unattributed";
}

function buildCampaignMeta(
  campaigns: CampaignRow[],
  buckets: EventBucket[],
  designNames: Map<string, string>,
  effectiveCreatives: Map<string, string | null>,
): CampaignMeta[] {
  return campaigns.map((c) => {
    // The design the embed resolved, not the column on the campaign: a blank
    // column means "inherit", not "default". See fetchEffectiveCreatives.
    const slug = effectiveCreatives.get(c.campaign_id) ?? "classic";
    return {
      ...c,
      market: resolveMarket(c, buckets),
      creativeSlug: slug,
      creativeLabel: designNames.get(slug) ?? "Standard Creative",
    };
  });
}

// ── Counting ─────────────────────────────────────────────────────────────────

/** The highest QUESTION_n_REACHED present. On a three-question survey that is
 *  the last question before submission, which is the only mid-funnel stage that
 *  carries information. */
function finalQuestionEvent(buckets: EventBucket[]): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const b of buckets) {
    const m = QUESTION_REACHED.exec(b.eventType);
    if (!m) continue;
    const n = Number(m[1]);
    if (n > bestN) [best, bestN] = [b.eventType, n];
  }
  return best;
}

function countFunnel(
  buckets: EventBucket[],
  finalQuestion: string | null,
  predicate: (b: EventBucket) => boolean,
): FunnelCounts {
  const c = emptyCounts();
  for (const b of buckets) {
    if (!predicate(b)) continue;
    switch (b.eventType) {
      case LOAD:
        c.loads += b.count;
        break;
      case VISIBLE:
        c.viewable += b.count;
        break;
      case START:
        c.starts += b.count;
        break;
      case COMPLETE:
        c.completed += b.count;
        break;
      default:
        if (finalQuestion && b.eventType === finalQuestion) c.reachedFinalQuestion += b.count;
    }
  }
  return c;
}

/** Loads matching a predicate. `from` narrows to the window in which
 *  viewability was actually being measured — the only honest denominator for a
 *  viewability rate. Pass null for every load in scope. */
function countLoads(
  buckets: EventBucket[],
  from: string | null,
  predicate: (b: EventBucket) => boolean,
): number {
  let n = 0;
  for (const b of buckets) {
    if (b.eventType !== LOAD) continue;
    if (from !== null && b.hour < from) continue;
    if (!predicate(b)) continue;
    n += b.count;
  }
  return n;
}

// ── The report ───────────────────────────────────────────────────────────────

export async function buildAudienceIntelligenceReport(
  report: PartnerReport,
): Promise<AudienceIntelligenceReport> {
  const ids = report.campaignIds;
  const from = report.dataFrom;

  const [campaigns, designs, eventData, responses, firstEvent, lastEvent, visits] = await Promise.all([
    fetchCampaigns(ids),
    fetchCreativeDesigns(),
    fetchEventBuckets(ids, from),
    fetchResponses(ids, from),
    fetchFirstEventAt(ids, from),
    fetchLastEventAt(ids, from),
    getVisitCounts(report.id),
  ]);

  const buckets = eventData.buckets;
  const designNames = new Map(designs.map((d) => [d.slug, d.name]));
  const effectiveCreatives = await fetchEffectiveCreatives(campaigns);
  const meta = buildCampaignMeta(campaigns, buckets, designNames, effectiveCreatives);
  const byCampaign = new Map(meta.map((m) => [m.campaign_id, m]));
  const finalQuestion = finalQuestionEvent(buckets);

  const viewableFrom = firstViewableHour(buckets);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCounts = countFunnel(buckets, finalQuestion, () => true);
  const totalRates = rates(totalCounts, false);

  const viewabilityWindow =
    viewableFrom !== null
      ? (() => {
          const denom = countLoads(buckets, viewableFrom, () => true);
          return denom > 0
            ? { from: viewableFrom, rate: totalCounts.viewable / denom, measuredLoads: denom }
            : null;
        })()
      : null;

  const durations = responses
    .map((r) => r.response_duration_seconds)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const medianCompletion = median(durations);
  const meanCompletion =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const moe = marginOfError(responses.length);

  const deviceTotals = new Map<string, number>();
  for (const b of buckets) {
    if (b.eventType !== LOAD || !b.device) continue;
    deviceTotals.set(b.device, (deviceTotals.get(b.device) ?? 0) + b.count);
  }
  const deviceSum = [...deviceTotals.values()].reduce((a, b) => a + b, 0);
  const devices = [...deviceTotals.entries()]
    .map(([label, count]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      count,
      share: deviceSum > 0 ? count / deviceSum : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Markets ───────────────────────────────────────────────────────────────
  const marketNames = [...new Set(meta.map((m) => m.market))].sort();
  const marketCreatives = new Map<string, Set<string>>();
  for (const m of meta) {
    if (!marketCreatives.has(m.market)) marketCreatives.set(m.market, new Set());
    marketCreatives.get(m.market)!.add(m.creativeLabel);
  }
  const markets: Segment[] = marketNames.map((market) => {
    const inMarket = (b: EventBucket) => byCampaign.get(b.campaignId)?.market === market;
    const counts = countFunnel(buckets, finalQuestion, inMarket);
    const r = rates(counts, false);
    const sampleSize = responses.filter((x) => byCampaign.get(x.campaign_id)?.market === market).length;
    // Only a genuine creative MIX is disclosed here. A single market whose
    // creative_design differs from the campaign norm is not evidence that a
    // different unit was served: that field can be set during campaign
    // creation without the deployment changing, so treating it as a served
    // difference produces a confident note about something that never
    // happened. A market that ran two campaigns with two designs, both of
    // which delivered impressions, is a different matter: the mix is in the
    // delivery data, and it does affect how the index reads.
    const runCreatives = [...(marketCreatives.get(market) ?? [])];
    const note =
      runCreatives.length > 1
        ? `Ran ${joinList(runCreatives)}. Its index reflects that mix as well as the audience, so it is not directly comparable with markets that ran a single format.`
        : undefined;

    return {
      key: market,
      label: market,
      counts,
      rates: r,
      index: {
        startRate: index100(r.startRate, totalRates.startRate),
        completionRate: index100(r.completionRate, totalRates.completionRate),
        responseRate: index100(r.responseRate, totalRates.responseRate),
      },
      sampleSize,
      note,
    };
  });

  // ── The creatives that actually ran ───────────────────────────────────────
  const creatives = buildCreativeGallery(meta, buckets, designs, finalQuestion);

  // ── Creative comparison ───────────────────────────────────────────────────
  const creative = buildCreativeComparison(
    meta,
    buckets,
    responses,
    finalQuestion,
    viewableFrom,
    totalRates,
    designs,
  );

  // ── Hourly, in the audience's local time ──────────────────────────────────
  const hourly = buildHourly(buckets, byCampaign);
  const hourlyInsight = describeHours(hourly);

  // ── Survey answers ────────────────────────────────────────────────────────
  const surveyIds = [...new Set(meta.map((m) => m.survey_id).filter((x): x is string => !!x))];
  const questionSets = await fetchSurveyQuestions(surveyIds);
  const questions = buildQuestions(questionSets, responses, byCampaign);

  // ── Narrative ─────────────────────────────────────────────────────────────
  const stillLive = meta.some((m) => m.status === "live");
  const campaignEndDate = meta
    .map((m) => m.end_date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0] ?? null;

  const findings = buildFindings(markets, creative, questions, devices, hourlyInsight, viewabilityWindow);
  const recommendations = buildRecommendations(markets, creative, questions, hourlyInsight, devices);
  const highlights = buildHighlights(
    totalCounts,
    totalRates,
    markets,
    medianCompletion,
    devices,
    creative,
    questions,
  );

  return {
    report,
    window: {
      firstEvent: firstEvent ?? new Date().toISOString(),
      lastEvent: lastEvent ?? new Date().toISOString(),
      dataThrough: lastEvent ?? new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      interim: stillLive,
      statusLabel: stillLive ? "Interim" : "Final",
      campaignEndDate,
    },
    totals: {
      counts: totalCounts,
      rates: totalRates,
      medianCompletionSeconds: medianCompletion,
      meanCompletionSeconds: meanCompletion,
      marginOfError: moe,
      sampleQuality: sampleQuality(moe),
      markets: marketNames.length,
      devices,
    },
    viewabilityWindow,
    visits,
    highlights,
    decisions: buildDecisions(markets, creative, questions, hourlyInsight, devices, totalCounts),
    creatives,
    markets,
    hourly,
    hourlyInsight,
    creative,
    questions,
    findings,
    recommendations,
    valueDelivered: buildValueDelivered(report, totalCounts, markets, questions, creative, moe),
    methodology: buildMethodology(report, meta, viewabilityWindow, creative, stillLive),
  };
}

// ── Creative ─────────────────────────────────────────────────────────────────

/** One sentence on what a format is for, keyed by the layout the embed resolves
 *  rather than by a slug, so a new design inherits the right description
 *  without anyone remembering to add it. */
/** A clause that can be dropped into a sentence, for the places a creative is
 *  named before the reader has reached the gallery. "Fan Invitation +107%" in a
 *  highlight tile means nothing to someone who does not yet know it is a survey
 *  format, and the highlights are the first thing anyone reads. */
const LAYOUT_SHORTHAND: Record<string, string> = {
  classic: "the standard survey format, which shows the first question straight away",
  timer: "the branded survey format with a countdown",
  invitation: "the survey format that invites fans to opt in before they see a question",
};

const LAYOUT_PURPOSE: Record<string, string> = {
  classic:
    "The standard unit. The first question is visible immediately, so a reader can answer without committing to anything first.",
  timer:
    "A branded unit with a countdown, designed to draw attention in the feed before the reader has decided whether to engage.",
  invitation:
    "Opens with an invitation rather than a question. A reader chooses to take part before they see anything to answer.",
};

/** The formats that actually ran, with the volume each carried. This is what
 *  the gallery renders, and it is derived from delivery rather than from what
 *  was configured: a design attached to a campaign that never served does not
 *  belong in a report about what fans saw. */
function buildCreativeGallery(
  meta: CampaignMeta[],
  buckets: EventBucket[],
  designs: CreativeDesignRow[],
  finalQuestion: string | null,
): CreativeUsed[] {
  const byslug = new Map(designs.map((d) => [d.slug, d]));
  const grouped = new Map<string, CampaignMeta[]>();
  for (const m of meta) {
    if (!grouped.has(m.creativeSlug)) grouped.set(m.creativeSlug, []);
    grouped.get(m.creativeSlug)!.push(m);
  }

  const out: CreativeUsed[] = [];
  for (const [slug, group] of grouped) {
    const ids = new Set(group.map((g) => g.campaign_id));
    const counts = countFunnel(buckets, finalQuestion, (b) => ids.has(b.campaignId));
    if (counts.loads === 0) continue;
    const design = byslug.get(slug);
    const layout = design?.layout ?? "classic";
    out.push({
      slug,
      name: group[0].creativeLabel,
      layout,
      markets: [...new Set(group.map((g) => g.market))].sort(),
      loads: counts.loads,
      completed: counts.completed,
      purpose: LAYOUT_PURPOSE[layout] ?? "A survey unit served within the reading experience.",
      builderState: design?.builder_state ?? null,
    });
  }
  return out.sort((a, b) => b.loads - a.loads);
}

function buildCreativeComparison(
  meta: CampaignMeta[],
  buckets: EventBucket[],
  responses: ResponseRow[],
  finalQuestion: string | null,
  viewableFrom: string | null,
  campaignRates: FunnelRates,
  designs: CreativeDesignRow[],
): CreativeComparison | null {
  // A creative comparison is only honest within one market — audiences differ
  // more than creatives do. Find a market that ran more than one creative.
  const byMarket = new Map<string, CampaignMeta[]>();
  for (const m of meta) {
    if (!byMarket.has(m.market)) byMarket.set(m.market, []);
    byMarket.get(m.market)!.push(m);
  }

  let target: CampaignMeta[] | null = null;
  for (const group of byMarket.values()) {
    const creatives = new Set(group.map((g) => g.creativeLabel));
    if (creatives.size >= 2) {
      target = group;
      break;
    }
  }
  if (!target) return null;

  const creativeGroups = new Map<string, CampaignMeta[]>();
  for (const c of target) {
    if (!creativeGroups.has(c.creativeLabel)) creativeGroups.set(c.creativeLabel, []);
    creativeGroups.get(c.creativeLabel)!.push(c);
  }

  // Baseline is whichever creative went live first; the other is the
  // challenger. "First" is judged by observed delivery, not by the campaign's
  // start_date: a planned start date can be edited after the fact, can predate
  // the campaign record's own creation, and in general says what someone
  // intended rather than what ran. The first hour that actually served an
  // impression cannot be wrong.
  const firstDelivery = (group: CampaignMeta[]): string => {
    const ids = new Set(group.map((c) => c.campaign_id));
    let earliest: string | null = null;
    for (const b of buckets) {
      if (b.eventType !== LOAD || !ids.has(b.campaignId)) continue;
      if (earliest === null || b.hour < earliest) earliest = b.hour;
    }
    return earliest ?? "9999";
  };
  const ordered = [...creativeGroups.entries()].sort(
    (a, b) => firstDelivery(a[1]).localeCompare(firstDelivery(b[1])),
  );
  if (ordered.length < 2) return null;

  const layouts = new Map(designs.map((d) => [d.slug, d.layout ?? "classic"]));
  const describe = (group: CampaignMeta[]): string | undefined =>
    LAYOUT_SHORTHAND[layouts.get(group[0]?.creativeSlug ?? "") ?? "classic"];

  const segmentFor = (label: string, group: CampaignMeta[]): Segment => {
    const idsInGroup = new Set(group.map((g) => g.campaign_id));
    const counts = countFunnel(buckets, finalQuestion, (b) => idsInGroup.has(b.campaignId));
    const r = rates(counts, false);
    return {
      key: label,
      label,
      counts,
      rates: r,
      index: {
        startRate: index100(r.startRate, campaignRates.startRate),
        completionRate: index100(r.completionRate, campaignRates.completionRate),
        responseRate: index100(r.responseRate, campaignRates.responseRate),
      },
      sampleSize: responses.filter((x) => idsInGroup.has(x.campaign_id)).length,
      description: describe(group),
    };
  };

  const baseline = segmentFor(ordered[0][0], ordered[0][1]);
  const variant = segmentFor(ordered[1][0], ordered[1][1]);

  const startTest = compareProportions(
    baseline.counts.starts,
    baseline.counts.loads,
    variant.counts.starts,
    variant.counts.loads,
  );
  const completionTest = compareProportions(
    baseline.counts.completed,
    baseline.counts.starts,
    variant.counts.completed,
    variant.counts.starts,
  );
  const finalQuestionTest = compareProportions(
    baseline.counts.reachedFinalQuestion,
    baseline.counts.starts,
    variant.counts.reachedFinalQuestion,
    variant.counts.starts,
  );
  const yieldTest = compareProportions(
    baseline.counts.completed,
    baseline.counts.loads,
    variant.counts.completed,
    variant.counts.loads,
  );

  const measures: CreativeComparison["measures"] = [
    {
      label: "Start Rate",
      metricId: "q1_answer_rate",
      baseline: baseline.rates.startRate,
      variant: variant.rates.startRate,
      format: "percent",
      change: startTest.change,
      confidence: startTest.confidence,
      inconclusive: startTest.inconclusive,
    },
    {
      label: "Completion Rate",
      metricId: "completion_rate",
      baseline: baseline.rates.completionRate,
      variant: variant.rates.completionRate,
      format: "percent",
      change: completionTest.change,
      confidence: completionTest.confidence,
      inconclusive: completionTest.inconclusive,
    },
    {
      label: "Reached the Final Question",
      metricId: "completion_rate",
      baseline: baseline.counts.starts > 0 ? baseline.counts.reachedFinalQuestion / baseline.counts.starts : 0,
      variant: variant.counts.starts > 0 ? variant.counts.reachedFinalQuestion / variant.counts.starts : 0,
      format: "percent",
      change: finalQuestionTest.change,
      confidence: finalQuestionTest.confidence,
      inconclusive: finalQuestionTest.inconclusive,
    },
    {
      label: "Responses per 10,000 Impressions",
      metricId: "overall_conversion_rate",
      baseline: baseline.rates.responsesPer10k,
      variant: variant.rates.responsesPer10k,
      format: "rate_per_10k",
      change: yieldTest.change,
      confidence: yieldTest.confidence,
      inconclusive: yieldTest.inconclusive,
    },
  ];

  // Caveats are computed, not written: they appear because the data says so.
  const caveats: string[] = [];
  const overlap = overlapHours(buckets, ordered[0][1], ordered[1][1]);
  if (overlap.sharedHours <= 2) {
    caveats.push(
      `The two creatives ran in sequence rather than side by side. They shared only ${overlap.sharedHours} ${overlap.sharedHours === 1 ? "hour" : "hours"} of live delivery, so day-of-week and time-of-day differences are mixed into the comparison. Treat the direction as reliable and the exact size as indicative.`,
    );
  }
  if (viewableFrom) {
    const baselineIds = new Set(ordered[0][1].map((c) => c.campaign_id));
    const before = countLoads(buckets, null, (b) => baselineIds.has(b.campaignId));
    const after = countLoads(buckets, viewableFrom, (b) => baselineIds.has(b.campaignId));
    if (before > 0 && after / before < 0.2) {
      caveats.push(
        "Viewable-impression measurement began part way through the campaign, after most of the first creative's delivery. Viewability is therefore compared only across the window in which both were measured and is not used to adjust any other figure.",
      );
    }
  }

  return { baseline, variant, measures, caveats };
}

/** How many hours both creatives were delivering at the same time. A sequential
 *  read and a true side-by-side test deserve different language. */
function overlapHours(
  buckets: EventBucket[],
  groupA: CampaignMeta[],
  groupB: CampaignMeta[],
): { sharedHours: number } {
  const idsA = new Set(groupA.map((c) => c.campaign_id));
  const idsB = new Set(groupB.map((c) => c.campaign_id));
  const hoursA = new Set<string>();
  const hoursB = new Set<string>();
  for (const b of buckets) {
    if (b.eventType !== LOAD || b.count < 50) continue; // ignore trickle traffic
    if (idsA.has(b.campaignId)) hoursA.add(b.hour);
    if (idsB.has(b.campaignId)) hoursB.add(b.hour);
  }
  let shared = 0;
  for (const h of hoursA) if (hoursB.has(h)) shared++;
  return { sharedHours: shared };
}

// ── Hours ────────────────────────────────────────────────────────────────────

function buildHourly(buckets: EventBucket[], byCampaign: Map<string, CampaignMeta>): HourPoint[] {
  const rows: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    loads: 0,
    starts: 0,
    completed: 0,
    startRate: 0,
  }));

  for (const b of buckets) {
    const campaign = byCampaign.get(b.campaignId);
    const zone = zoneForCountryCode(campaign?.country_code ?? null);
    const h = localHour(b.hour, zone);
    if (b.eventType === LOAD) rows[h].loads += b.count;
    else if (b.eventType === START) rows[h].starts += b.count;
    else if (b.eventType === COMPLETE) rows[h].completed += b.count;
  }

  for (const r of rows) r.startRate = r.loads > 0 ? r.starts / r.loads : 0;
  return rows;
}

function describeHours(hourly: HourPoint[]): AudienceIntelligenceReport["hourlyInsight"] {
  const withLoads = hourly.filter((h) => h.loads > 0);
  const peak = withLoads.reduce((a, b) => (b.loads > a.loads ? b : a), withLoads[0] ?? hourly[0]);
  const quiet = withLoads.reduce((a, b) => (b.loads < a.loads ? b : a), withLoads[0] ?? hourly[0]);

  // The best engagement hour is judged only among hours carrying enough starts
  // to mean anything. An hour with three starts can show a spectacular rate and
  // tell you nothing.
  const engagementCandidates = hourly.filter((h) => h.starts >= 10);
  const best = engagementCandidates.length
    ? engagementCandidates.reduce((a, b) => (b.startRate > a.startRate ? b : a))
    : peak;

  const totalLoads = hourly.reduce((a, b) => a + b.loads, 0);
  const observations: string[] = [];

  if (peak && totalLoads > 0) {
    const share = peak.loads / totalLoads;
    // Never name the part of the day in the copy — the peak is wherever the
    // data puts it, and a report that says "evening" while pointing at 04:00
    // has stopped describing the campaign.
    observations.push(
      `Delivery is concentrated rather than spread: ${formatHour(peak.hour)} alone carries ${Math.round(share * 100)}% of all impressions and the busiest six hours carry ${Math.round(
        (hourly
          .slice()
          .sort((a, b) => b.loads - a.loads)
          .slice(0, 6)
          .reduce((a, b) => a + b.loads, 0) /
          totalLoads) *
          100,
      )}%.`,
    );
  }

  const evening = hourly.filter((h) => h.hour >= 17 && h.hour <= 21);
  const morning = hourly.filter((h) => h.hour >= 8 && h.hour <= 12);
  const eveningLoads = evening.reduce((a, b) => a + b.loads, 0);
  const morningLoads = morning.reduce((a, b) => a + b.loads, 0);
  const eveningStarts = evening.reduce((a, b) => a + b.starts, 0);
  const morningStarts = morning.reduce((a, b) => a + b.starts, 0);
  if (eveningLoads > 0 && morningLoads > 0) {
    const eveningRate = eveningStarts / eveningLoads;
    const morningRate = morningStarts / morningLoads;
    const test = compareProportions(eveningStarts, eveningLoads, morningStarts, morningLoads);
    if (!test.inconclusive && morningRate > eveningRate) {
      observations.push(
        `Volume and willingness to engage peak at different times. The evening delivers the impressions; late morning converts them at a higher rate.`,
      );
    } else if (!test.inconclusive) {
      observations.push(
        `Engagement rate holds up through the evening peak rather than diluting, so the highest-volume hours are also productive hours.`,
      );
    }
  }

  const overnight = hourly.filter((h) => h.hour >= 1 && h.hour <= 5);
  const overnightLoads = overnight.reduce((a, b) => a + b.loads, 0);
  if (totalLoads > 0 && overnightLoads / totalLoads > 0.02) {
    observations.push(
      `A measurable overnight audience is present: ${Math.round((overnightLoads / totalLoads) * 100)}% of impressions land between 01:00 and 05:00 local time, which is inventory a daytime-only schedule would miss.`,
    );
  }

  return {
    peakHour: peak?.hour ?? 0,
    peakLoads: peak?.loads ?? 0,
    quietHour: quiet?.hour ?? 0,
    quietLoads: quiet?.loads ?? 0,
    bestEngagementHour: best?.hour ?? 0,
    observations,
  };
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// ── Survey answers ───────────────────────────────────────────────────────────

function buildQuestions(
  questionSets: Map<string, SurveyQuestion[]>,
  responses: ResponseRow[],
  byCampaign: Map<string, CampaignMeta>,
): QuestionDistribution[] {
  // Surveys in one report are expected to be question-identical (a v2 copy of
  // the same instrument is still the same instrument). Take the longest set as
  // the canonical labelling; if the sets genuinely disagree, the answers are
  // still counted by position, which is how they are stored.
  const sets = [...questionSets.values()];
  const canonical = sets.sort((a, b) => b.length - a.length)[0] ?? [];
  if (canonical.length === 0) return [];

  const markets = [...new Set([...byCampaign.values()].map((m) => m.market))].sort();

  return canonical.slice(0, QUESTION_KEYS.length).map((q, qi) => {
    const key = QUESTION_KEYS[qi];
    const optionLabels = q.options.map((o) => ({ id: o.id, label: text(o.text) }));

    const tally = (rows: ResponseRow[]) => {
      const total = rows.length;
      return optionLabels.map((o) => {
        const count = rows.filter((r) => r[key] === String(o.id)).length;
        return { id: o.id, label: o.label, count, share: total > 0 ? count / total : 0 };
      });
    };

    const overall = tally(responses);

    const byMarket = markets.map((market) => {
      const rows = responses.filter((r) => byCampaign.get(r.campaign_id)?.market === market);
      return {
        market,
        sampleSize: rows.length,
        belowThreshold: rows.length < MIN_REPORTABLE_SAMPLE,
        options: tally(rows),
      };
    });

    // A market's answer is compared against every other market pooled, so the
    // comparison is "this market versus the campaign", not one partner versus
    // another.
    const notableDifferences: NotableDifference[] = [];
    for (const m of byMarket) {
      if (m.belowThreshold) continue;
      const inMarket = responses.filter((r) => byCampaign.get(r.campaign_id)?.market === m.market);
      const rest = responses.filter((r) => byCampaign.get(r.campaign_id)?.market !== m.market);
      if (rest.length < MIN_REPORTABLE_SAMPLE) continue;

      for (const o of optionLabels) {
        const xIn = inMarket.filter((r) => r[key] === String(o.id)).length;
        const xOut = rest.filter((r) => r[key] === String(o.id)).length;
        const test = compareProportions(xOut, rest.length, xIn, inMarket.length);
        if (test.inconclusive) continue;
        const direction = test.p2 > test.p1 ? "more likely" : "less likely";
        notableDifferences.push({
          market: m.market,
          optionLabel: o.label,
          share: test.p2,
          comparisonShare: test.p1,
          sampleSize: inMarket.length,
          confidence: test.confidence,
          statement: `Fans in ${m.market} were ${direction} to choose "${o.label}" than fans elsewhere in the campaign (${Math.round(test.p2 * 100)}% against ${Math.round(test.p1 * 100)}%).`,
        });
      }
    }

    return {
      id: q.id,
      text: text(q.text),
      sampleSize: responses.length,
      options: overall,
      byMarket,
      notableDifferences,
    };
  });
}

// ── Narrative generation ─────────────────────────────────────────────────────

function buildHighlights(
  counts: FunnelCounts,
  rates: FunnelRates,
  markets: Segment[],
  medianSeconds: number,
  devices: { label: string; share: number }[],
  creative: CreativeComparison | null,
  questions: QuestionDistribution[],
): Highlight[] {
  const out: Highlight[] = [
    {
      label: "Survey opportunities delivered",
      value: counts.loads.toLocaleString("en-GB"),
      detail: `Times the survey was served to a fan across ${markets.length} ${markets.length === 1 ? "market" : "markets"}.`,
    },
    {
      label: "Completed responses",
      value: counts.completed.toLocaleString("en-GB"),
      detail: "Fans who answered every question. This is the usable research sample.",
    },
    {
      label: "Markets covered",
      value: String(markets.length),
      detail: markets.map((m) => m.label).join(", "),
    },
  ];

  const topDevice = devices[0];
  if (topDevice) {
    out.push({
      label: "Audience profile",
      value: `${Math.round(topDevice.share * 100)}% ${topDevice.label.toLowerCase()}`,
      detail: "How this audience met the survey, which shapes what future creative should be built for.",
    });
  }

  out.push({
    label: "Typical time to complete",
    value: `${medianSeconds}s`,
    detail: "Median time from first answer to submission. A short, respectful ask of the audience.",
  });

  if (creative) {
    const decisive = creative.measures.find((m) => !m.inconclusive && m.change !== null && m.change > 0);
    if (decisive) {
      out.push({
        label: "Biggest creative learning",
        value: `${creative.variant.label} +${Math.round((decisive.change ?? 0) * 100)}%`,
        detail: `${creative.variant.label} is ${creative.variant.description ?? "an alternative survey format"}. Tested against ${creative.baseline.label}, it improved ${decisive.label.toLowerCase()}. How the survey asked changed the outcome more than who it asked.`,
      });
    }
  }

  const strongest = questions
    .flatMap((q) => q.notableDifferences.map((d) => ({ q, d })))
    .sort((a, b) => Math.abs(b.d.share - b.d.comparisonShare) - Math.abs(a.d.share - a.d.comparisonShare))[0];
  if (strongest) {
    out.push({
      label: "Biggest audience insight",
      value: strongest.d.market,
      detail: strongest.d.statement,
    });
  } else {
    const topAnswer = questions[0]?.options.slice().sort((a, b) => b.count - a.count)[0];
    if (topAnswer) {
      out.push({
        label: "Biggest audience insight",
        value: `${Math.round(topAnswer.share * 100)}%`,
        detail: `chose "${topAnswer.label}" as their view of the sponsorship, the clearest single signal in the study.`,
      });
    }
  }

  // Rates are the operating detail, not the headline, so they close the list.
  out.push({
    label: "Engagement quality",
    value: `${(rates.completionRate * 100).toFixed(0)}% completion`,
    detail: "Share of fans who, having started, went on to finish every question.",
  });

  return out;
}

// ── Decisions ────────────────────────────────────────────────────────────────

/** The three or four things a reader could do differently because they read
 *  this, each with the number behind it and what acting on it is worth.
 *
 *  `worth` is only ever populated when it can be computed from measured data.
 *  A decision whose value cannot be quantified honestly says so and is framed
 *  as a test rather than a move, which is the difference between a report that
 *  helps someone act and one that just sounds confident. */
function buildDecisions(
  markets: Segment[],
  creative: CreativeComparison | null,
  questions: QuestionDistribution[],
  hours: AudienceIntelligenceReport["hourlyInsight"],
  devices: { label: string; share: number }[],
  totals: FunnelCounts,
): Decision[] {
  const out: Decision[] = [];

  // 1. Adopt the format that produced more research from the same inventory.
  if (creative) {
    const yieldMeasure = creative.measures.find((m) => m.label === "Responses per 10,000 Impressions");
    if (yieldMeasure && !yieldMeasure.inconclusive && (yieldMeasure.change ?? 0) > 0) {
      const gainPer10k = yieldMeasure.variant - yieldMeasure.baseline;
      const extra = Math.round((gainPer10k * totals.loads) / 10000);
      out.push({
        headline: `Run ${creative.variant.label} everywhere`,
        action: `${creative.variant.label} is ${creative.variant.description ?? "an alternative survey format"}. Make it the default on the next campaign rather than a variant tested in one market.`,
        evidence: `${yieldMeasure.variant.toFixed(1)} completed responses per 10,000 impressions against ${yieldMeasure.baseline.toFixed(1)}.`,
        worth: `Applied across the ${totals.loads.toLocaleString("en-GB")} impressions this campaign has already delivered, roughly ${extra.toLocaleString("en-GB")} additional completed responses from the same inventory. No extra delivery, no extra cost.`,
        confidence: yieldMeasure.confidence,
      });
    }
  }

  // 2. Move volume toward the market that converts it best — or, where that
  //    market's advantage is entangled with a creative difference, settle that
  //    first. Recommending a budget shift on a confounded number is exactly the
  //    kind of confident-sounding advice that loses a client's trust later.
  const reportable = markets.filter((m) => m.sampleSize >= MIN_REPORTABLE_SAMPLE);
  if (reportable.length >= 2) {
    const best = reportable.reduce((a, b) => (b.rates.responseRate > a.rates.responseRate ? b : a));
    const worst = reportable.reduce((a, b) => (b.rates.responseRate < a.rates.responseRate ? b : a));
    if (best.key !== worst.key) {
      if (best.note) {
        out.push({
          headline: `Settle whether ${best.label}'s lead is the audience or the format`,
          action: `Run one format across every market on the next campaign. That separates the two effects in a single flight and tells you where the budget should actually go.`,
          evidence: `${best.label} returned ${best.rates.responsesPer10k.toFixed(1)} responses per 10,000 impressions against ${worst.rates.responsesPer10k.toFixed(1)} in ${worst.label}, but it also ran more than one format.`,
          worth: null,
          confidence: "moderate",
        });
      } else {
        const shift = Math.round(worst.counts.loads * 0.25);
        const delta = Math.round(((best.rates.responsesPer10k - worst.rates.responsesPer10k) * shift) / 10000);
        out.push({
          headline: `Weight the next buy toward ${best.label}`,
          action: `Move a quarter of ${worst.label}'s volume across.`,
          evidence: `${best.rates.responsesPer10k.toFixed(1)} responses per 10,000 impressions against ${worst.rates.responsesPer10k.toFixed(1)}.`,
          worth: `About ${delta.toLocaleString("en-GB")} additional completed responses from the same total delivery.`,
          confidence: "moderate",
        });
      }
    }
  }

  // 3. Buy the sample the thin markets need. Quantified in impressions, because
  //    that is the unit the decision is actually taken in.
  const thin = markets.filter((m) => m.sampleSize > 0 && m.sampleSize < MIN_REPORTABLE_SAMPLE);
  if (thin.length > 0) {
    const needed = thin.map((m) => {
      const shortfall = MIN_REPORTABLE_SAMPLE - m.sampleSize;
      const impressions = m.rates.responsesPer10k > 0
        ? Math.round((shortfall / m.rates.responsesPer10k) * 10000)
        : 0;
      return { market: m.label, shortfall, impressions };
    });
    const totalImpressions = needed.reduce((a, b) => a + b.impressions, 0);
    out.push({
      headline: `Extend ${joinList(thin.map((m) => m.label))} to a reportable sample`,
      action: `Extend delivery rather than adding a market. A market that cannot be reported on is inventory spent without a finding attached.`,
      evidence: needed.map((n) => `${n.market} is ${n.shortfall} responses short`).join(", ") + ".",
      worth: totalImpressions > 0
        ? `About ${totalImpressions.toLocaleString("en-GB")} additional impressions at the current conversion rate, after which that market can be quoted rather than caveated.`
        : null,
      confidence: "moderate",
    });
  }

  // There is deliberately no decision here telling the publisher to take the
  // research to market themselves. It reads as generous and it is the opposite:
  // turning a sponsorship read into a commercial asset is the service this
  // report is evidence for, and inviting the partner to do it without us argues
  // against the next campaign. Every decision in this section has to be
  // something the publisher does with their inventory, not with our work.

  // Daypart and device shape the next brief rather than the next decision, so
  // they live in Recommendations. Four is already the limit of what a reader
  // will actually act on.
  void hours;
  void devices;
  void questions;

  return out.slice(0, 4);
}

function buildFindings(
  markets: Segment[],
  creative: CreativeComparison | null,
  questions: QuestionDistribution[],
  devices: { label: string; share: number }[],
  hours: AudienceIntelligenceReport["hourlyInsight"],
  viewability: { from: string; rate: number } | null,
): Finding[] {
  const confirmed: Finding[] = [];
  const possible: Finding[] = [];

  if (creative) {
    const cc = creative;
    // Each measure gets its own sentence, and each states both values rather
    // than only the relative change. A generic "X% higher <metric name>"
    // template produces English like "44% lower reached the final question";
    // and "107% more" on its own is ambiguous about what doubled, where
    // "86% against 41%" is not, and is the form a reader can check.
    const asPct = (v: number) => `${Math.round(v * 100)}%`;
    type Measure = CreativeComparison["measures"][number];
    const phrasing: Record<string, (m: Measure, up: boolean) => string> = {
      "Start Rate": (m, up) =>
        `${cc.variant.label} started ${up ? "more" : "fewer"} fans per impression (${(m.variant * 100).toFixed(3)}% against ${(m.baseline * 100).toFixed(3)}%)`,
      "Completion Rate": (m, up) =>
        `${cc.variant.label} ${up ? "raised" : "reduced"} the share of starters who finished to ${asPct(m.variant)}, from ${asPct(m.baseline)}`,
      "Reached the Final Question": (m) =>
        `${asPct(m.variant)} of fans who started ${cc.variant.label} reached the final question, against ${asPct(m.baseline)} on ${cc.baseline.label}`,
      "Responses per 10,000 Impressions": (m, up) =>
        `${cc.variant.label} produced ${m.variant.toFixed(1)} completed responses per 10,000 impressions against ${m.baseline.toFixed(1)}, which is ${up ? "more" : "less"} research from the same inventory`,
    };

    for (const m of creative.measures) {
      if (m.inconclusive || m.change === null) continue;
      const pct = Math.round(Math.abs(m.change) * 100);
      const up = m.change > 0;
      const title =
        phrasing[m.label]?.(m, up) ??
        `${creative.variant.label} delivered ${pct}% ${up ? "higher" : "lower"} ${m.label.toLowerCase()}`;
      confirmed.push({
        title,
        detail: `A ${pct}% ${up ? "increase" : "decrease"} against ${creative.baseline.label}, running the same survey on the same inventory in the same market.`,
        confidence: m.confidence,
        kind: "confirmed",
      });
    }

    const inconclusiveStart = creative.measures.find((m) => m.label === "Start Rate" && m.inconclusive);
    if (inconclusiveStart) {
      confirmed.push({
        title: "The two creatives started fans at a comparable rate",
        detail:
          "The observed gap in start rate is within the range normal variation would produce, so neither creative can be said to open better than the other. The difference between them appears after the fan begins, not before.",
        confidence: "moderate",
        kind: "confirmed",
      });
    }

    const completion = creative.measures.find((m) => m.label === "Completion Rate");
    if (completion && !completion.inconclusive) {
      possible.push({
        title: `${creative.variant.label} may be selecting for intent rather than improving the experience`,
        detail:
          "A creative that asks fans to opt in before the first question filters out the merely curious. That would raise completion without the survey itself having become easier. The two explanations predict different things and can be separated by measuring engagement from the invitation onward in the next campaign.",
        confidence: "early",
        kind: "possible",
      });
    }
  }

  const topDevice = devices[0];
  if (topDevice && topDevice.share > 0.85) {
    confirmed.push({
      title: `${Math.round(topDevice.share * 100)}% of the audience met the survey on ${topDevice.label.toLowerCase()}`,
      detail:
        "This is a decisive skew. Creative, question length and answer layout should be designed for this context first and adapted elsewhere, not the other way round.",
      confidence: "high",
      kind: "confirmed",
    });
  }

  if (viewability && viewability.rate > 0) {
    confirmed.push({
      title: `${Math.round(viewability.rate * 100)}% of impressions entered the fan's viewport`,
      detail:
        "Measured over the window in which viewable impressions were recorded. Delivered volume is reaching real screens rather than loading out of view.",
      confidence: "high",
      kind: "confirmed",
    });
  }

  const reportable = markets.filter((m) => m.sampleSize >= MIN_REPORTABLE_SAMPLE);
  if (reportable.length >= 2) {
    const best = reportable.reduce((a, b) => (b.rates.responseRate > a.rates.responseRate ? b : a));
    const rest = reportable.filter((m) => m.key !== best.key);
    const restCompleted = rest.reduce((a, b) => a + b.counts.completed, 0);
    const restLoads = rest.reduce((a, b) => a + b.counts.loads, 0);
    const test = compareProportions(restCompleted, restLoads, best.counts.completed, best.counts.loads);
    if (!test.inconclusive) {
      const restPer10k = (restCompleted / Math.max(restLoads, 1)) * 10000;
      confirmed.push({
        title: `${best.label} converted impressions into responses more efficiently than the rest of the campaign`,
        detail:
          `${best.label} returned ${best.rates.responsesPer10k.toFixed(1)} completed responses per 10,000 impressions against ${restPer10k.toFixed(1)} across the other markets.` +
          (best.note ? ` Part of that gap belongs to the creative rather than the audience. ${best.note}` : ""),
        confidence: test.confidence,
        kind: "confirmed",
      });
    }
  }

  for (const q of questions) {
    for (const d of q.notableDifferences.slice(0, 2)) {
      confirmed.push({
        title: d.statement,
        detail: `Based on ${d.sampleSize} completed responses in ${d.market}, compared with the rest of the campaign.`,
        confidence: d.confidence,
        kind: "confirmed",
      });
    }
  }

  const belowThreshold = markets.filter((m) => m.sampleSize > 0 && m.sampleSize < MIN_REPORTABLE_SAMPLE);
  if (belowThreshold.length > 0) {
    const one = belowThreshold.length === 1;
    possible.push({
      title: `Market-level differences in ${belowThreshold.map((m) => m.label).join(" and ")} are not yet separable from normal variation`,
      detail: `${one ? "This market" : "These markets"} returned fewer than ${MIN_REPORTABLE_SAMPLE} completed responses${one ? "" : " each"}. ${one ? "Its" : "Their"} answers are shown in full and are directionally interesting, but ${one ? "it" : "they"} should not be planned against until the sample grows.`,
      confidence: "early",
      kind: "possible",
    });
  }

  if (hours.observations.length > 0) {
    possible.push({
      title: "Time of day appears to shape engagement as well as volume",
      detail: `${hours.observations[hours.observations.length - 1]} Hour-level start counts are small, so this is a pattern worth testing with a deliberate daypart split rather than a settled conclusion.`,
      confidence: "early",
      kind: "possible",
    });
  }

  return [...confirmed, ...possible];
}

function buildRecommendations(
  markets: Segment[],
  creative: CreativeComparison | null,
  questions: QuestionDistribution[],
  hours: AudienceIntelligenceReport["hourlyInsight"],
  devices: { label: string; share: number }[],
): Recommendation[] {
  const out: Recommendation[] = [];

  if (creative) {
    const decisive = creative.measures.filter((m) => !m.inconclusive && (m.change ?? 0) > 0);
    if (decisive.length > 0) {
      out.push({
        title: `Make ${creative.variant.label} the default creative for the next campaign`,
        detail: `It produced more completed responses from the same volume of inventory. Rolling it out across every market is the single highest-value change available and costs nothing in delivery.`,
        basis: `${joinList(decisive.map((d) => d.label))} improved against ${creative.baseline.label}.`,
      });
      out.push({
        title: "Run the next creative test side by side, not back to back",
        detail:
          "Splitting the same inventory between two creatives at the same time removes day and daypart from the comparison and turns a strong indication into a settled number. It needs no extra impressions, only a split.",
        basis: "The creatives in this campaign ran in sequence, which mixes timing into the result.",
      });
    }
  }

  const reportable = markets.filter((m) => m.sampleSize >= MIN_REPORTABLE_SAMPLE);
  if (reportable.length >= 2) {
    const best = reportable.reduce((a, b) => (b.rates.responseRate > a.rates.responseRate ? b : a));
    // If the leading market's advantage is partly a creative effect, say so in
    // the recommendation itself. A recommendation that quietly rests on a
    // confounded number is worse than no recommendation.
    const confounded = Boolean(best.note);
    out.push({
      title: confounded
        ? `Weight the next buy toward ${best.label}, once the creative effect is separated out`
        : `Weight the next buy toward ${best.label}`,
      detail: confounded
        ? `${best.label} returned the most completed responses per impression in this study, but it also ran a different creative mix from the other markets, so part of that advantage belongs to the creative rather than the audience. Running one creative across every market in the next campaign settles which and is worth doing before the budget moves.`
        : `${best.label} returned the most completed responses per impression in this study. Shifting share toward it raises total sample without raising delivery.`,
      basis: `${best.rates.responsesPer10k.toFixed(1)} responses per 10,000 impressions, index ${best.index.responseRate} against the campaign average.`,
    });
  }

  const thin = markets.filter((m) => m.sampleSize > 0 && m.sampleSize < MIN_REPORTABLE_SAMPLE);
  if (thin.length > 0) {
    const one = thin.length === 1;
    out.push({
      title: `Extend delivery in ${thin.map((m) => m.label).join(" and ")} to reach a reportable sample`,
      detail: `${one ? "It needs" : "Each needs"} roughly ${MIN_REPORTABLE_SAMPLE} completed responses before ${one ? "its" : "their"} answers can be separated from the campaign average. On current conversion that is a small amount of additional inventory for a disproportionate gain in what can be said.`,
      basis: `Currently ${thin.map((m) => `${m.label} ${m.sampleSize}`).join(", ")} completed responses.`,
    });
  }

  if (hours.peakLoads > 0) {
    out.push({
      title: `Protect the ${formatHour(hours.peakHour)} window and test a second placement around ${formatHour(hours.bestEngagementHour)}`,
      detail:
        "The peak is where the volume is and should be defended. The higher-converting hours outside it are currently under-used and are the cheapest place to find additional sample without bidding against yourself for the busiest inventory.",
      basis: `Peak delivery at ${formatHour(hours.peakHour)}; strongest engagement rate at ${formatHour(hours.bestEngagementHour)} among hours with enough starts to compare.`,
    });
  }

  const topDevice = devices[0];
  if (topDevice && topDevice.share > 0.85) {
    out.push({
      title: `Design the next survey ${topDevice.label.toLowerCase()}-first`,
      detail:
        "Question length, answer count and tap target should be set by the dominant context rather than adapted down to it. Anything that adds a scroll on this device costs completions.",
      basis: `${Math.round(topDevice.share * 100)}% of impressions were ${topDevice.label.toLowerCase()}.`,
    });
  }

  const anyDifferences = questions.some((q) => q.notableDifferences.length > 0);
  if (anyDifferences) {
    out.push({
      title: "Localise the sponsorship message rather than translating it",
      detail:
        "Markets in this study did not simply answer at different volumes, they prioritised different things. A single creative message translated five ways leaves that difference on the table.",
      basis: "Statistically supported differences between markets on the same question.",
    });
  }

  return out;
}

function buildValueDelivered(
  report: PartnerReport,
  counts: FunnelCounts,
  markets: Segment[],
  questions: QuestionDistribution[],
  creative: CreativeComparison | null,
  moe: number,
): AudienceIntelligenceReport["valueDelivered"] {
  const points: { label: string; value: string; detail: string }[] = [
    {
      label: "Audience contribution",
      value: `${counts.loads.toLocaleString("en-GB")} opportunities`,
      detail: `${report.organisationName}'s audience carried this study across ${markets.length} ${markets.length === 1 ? "market" : "markets"} and produced ${counts.completed.toLocaleString("en-GB")} completed responses, entirely within the reading experience and without sending a single fan away from the site.`,
    },
    {
      label: "Insight generated",
      value: `${questions.length} questions, ±${moe.toFixed(1)}% precision`,
      detail: `A first-party read on how football fans see this sponsorship, at a precision that supports planning decisions rather than anecdote. ${report.brandName} receives evidence; ${report.organisationName} receives proof its audience is worth asking.`,
    },
  ];

  if (creative) {
    points.push({
      label: "Creative learning",
      value: `${creative.variant.label} vs ${creative.baseline.label}`,
      detail:
        "The campaign did not only collect answers, it tested how to ask. That learning carries forward into every future study on this inventory and raises the yield of the same impressions.",
    });
  }

  points.push({
    label: "Future optimisation",
    value: "Compounding",
    detail:
      "Every campaign narrows what still needs testing: which creative, which markets, which hours. The next study starts from this position rather than from zero, so the same inventory returns more each time.",
  });

  return {
    headline: `What this partnership produced for ${report.organisationName} and ${report.brandName}`,
    points,
  };
}

function buildMethodology(
  report: PartnerReport,
  meta: CampaignMeta[],
  viewability: { from: string; rate: number } | null,
  creative: CreativeComparison | null,
  stillLive: boolean,
): string[] {
  const out: string[] = [];

  out.push(
    `Every figure in this report is computed directly from live campaign data at the moment the page is opened, across ${meta.length} ${meta.length === 1 ? "campaign" : "campaigns"} run on ${report.organisationName} inventory. Nothing is estimated, modelled or carried over from a previous study.`,
  );

  if (stillLive) {
    out.push(
      "Collection was still open when this report was generated, so figures will continue to move until the campaign closes. The date stamp at the top of the report is the point these numbers were true.",
    );
  }

  out.push(
    "An impression is one load of the survey unit. A start is a fan answering the first question. A completed response is a fan answering every question. Rates are always stated against the stage above them, so a completion rate is a share of the fans who started, not of everyone who saw the unit.",
  );

  out.push(
    `Differences are tested before they are described. Anything labelled High Confidence or Moderate Confidence has cleared a 95% statistical bar; anything labelled Early Observation has not and is shown because it is interesting rather than because it is settled. Markets with fewer than ${MIN_REPORTABLE_SAMPLE} completed responses are reported in full but never described as different from the campaign.`,
  );

  // The creative comparison raises its own viewability caveat when the two
  // creatives straddle the instrumentation boundary, and it is more specific
  // than the general one. Emitting both puts two near-identical paragraphs next
  // to each other, which reads as a copy-paste error rather than as care.
  const creativeCaveats = creative?.caveats ?? [];
  const creativeCoversViewability = creativeCaveats.some((c) => c.includes("Viewable-impression"));

  if (viewability && !creativeCoversViewability) {
    out.push(
      "Viewable-impression measurement began part way through the campaign. Viewability is quoted only across the window in which it was recorded and is never used to restate an earlier figure.",
    );
  }

  out.push(...creativeCaveats);

  out.push(
    "The reader count on the cover counts browsers, not people: the same person opening the report on a laptop and a phone counts twice and two colleagues sharing a machine count once. It is recorded from a random identifier that carries no personal information.",
  );

  out.push(
    "Pre-launch test traffic is excluded. No other publisher's delivery, response or commercial data appears anywhere in this report and no comparison in it is drawn against a named partner.",
  );

  return out;
}

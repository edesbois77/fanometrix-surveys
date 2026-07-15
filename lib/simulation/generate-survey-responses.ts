// Survey response generator for the Simulation engine. Extends the
// weighted-random logic in app/api/demo/generate/route.ts — reused
// unchanged for demographics (country/publisher/placement/club/
// competition/fan_segment/device/browser), with two additions specific
// to Simulation: q1/q2/q3 are picked from the TARGET SURVEY's own real
// question options (tone-weighted), not a generic hardcoded pool, and
// the country pool is filtered to the scenario's configured markets
// when provided. Every row is written directly here — this is never
// reachable through /api/submit (Phase 3 closed that path).
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { LocalisedQuestion } from "@/lib/survey-locale";
import { pickTonedIndex, type TonePreset } from "@/lib/simulation/tone-presets";

function pick<T>(weighted: [T, number][]): T {
  let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of weighted) { r -= w; if (r <= 0) return item; }
  return weighted[weighted.length - 1][0];
}

// ── Demographic pools — unchanged from app/api/demo/generate/route.ts ────────

const COUNTRIES: [string, number][] = [
  ["United Kingdom", 40], ["Germany", 20], ["Spain", 15],
  ["Italy", 10], ["France", 10],
  ["Netherlands", 1], ["Belgium", 1], ["Portugal", 1], ["Ireland", 1], ["Brazil", 1],
];

// Market ISO code → country name, for filtering COUNTRIES to a
// scenario's configured markets. Only needs to cover markets the
// Demo Projects UX actually offers (§01 of the UX review); an
// unrecognised code falls back to the unfiltered pool below.
const MARKET_COUNTRY: Record<string, string> = {
  GB: "United Kingdom", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy",
  NL: "Netherlands", BE: "Belgium", PT: "Portugal", IE: "Ireland", BR: "Brazil",
  US: "United States", SE: "Sweden", IN: "India", CN: "China", MX: "Mexico",
};

const PUBLISHERS: [string, number][] = [
  ["FotMob", 35], ["LiveScore", 35], ["Forza Football", 20], ["Football365", 10],
];

const PLACEMENTS: [string, number][] = [
  ["homepage-mpu", 40], ["match-centre-mpu", 30], ["article-inline", 15],
  ["team-page-mpu", 10], ["league-page-mpu", 5],
];

const CLUBS: [string, number][] = [
  ["Arsenal", 10], ["Liverpool", 10], ["Chelsea", 7], ["Manchester City", 8],
  ["Manchester United", 7], ["Tottenham", 6], ["Newcastle", 4],
  ["Barcelona", 8], ["Real Madrid", 8], ["Atletico Madrid", 3],
  ["Bayern Munich", 6], ["Dortmund", 4],
  ["Juventus", 5], ["AC Milan", 4], ["Inter Milan", 4],
  ["PSG", 5], ["Aston Villa", 2], ["West Ham", 2],
];

const COMPETITIONS: [string, number][] = [
  ["Premier League", 35], ["UEFA Champions League", 25],
  ["La Liga", 15], ["Bundesliga", 10], ["Serie A", 10],
  ["UEFA Europa League", 5],
];

const FAN_SEGMENTS: [string, number][] = [
  ["season-ticket-holder", 30], ["casual-viewer", 30], ["digital-fan", 20],
  ["vip-member", 10], ["matchday-fan", 10],
];

const DEVICES: [string, number][] = [
  ["mobile", 75], ["desktop", 20], ["tablet", 5],
];

const BROWSERS: Record<string, [string, number][]> = {
  mobile:  [["Safari", 55], ["Chrome", 40], ["Firefox", 5]],
  desktop: [["Chrome", 60], ["Edge", 20], ["Firefox", 15], ["Safari", 5]],
  tablet:  [["Safari", 50], ["Chrome", 45], ["Firefox", 5]],
};

function randomRecentDate(): string {
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.8) * 90);
  const msAgo   = daysAgo * 86_400_000 + Math.random() * 86_400_000;
  return new Date(Date.now() - msAgo).toISOString();
}

function countryPool(markets: string[] | undefined): [string, number][] {
  if (!markets?.length) return COUNTRIES;
  const names = new Set(markets.map(m => MARKET_COUNTRY[m.toUpperCase()]).filter(Boolean));
  const filtered = COUNTRIES.filter(([name]) => names.has(name));
  return filtered.length ? filtered : COUNTRIES;
}

/**
 * Picks a tone-weighted option for one survey question, returning its
 * stable numeric id (the shape responses.q1/q2/q3 actually store —
 * see lib/intelligence/analysts/analyseSurvey.ts's resolveLabel).
 * Assumes options are authored in negative→positive order, the same
 * convention the legacy generic Q1/Q2/Q3 pools already use.
 */
function pickToneWeightedOptionId(question: LocalisedQuestion | undefined, tonePreset: TonePreset): string | null {
  if (!question?.options?.length) return null;
  const index = pickTonedIndex(tonePreset, question.options.length);
  return String(question.options[index].id);
}

export type GenerateSurveyResponsesInput = {
  campaignId: string;        // campaigns.campaign_id (text slug) — must already exist, is_simulated=true
  surveyId: string;          // surveys.id
  evidenceSimulationId: string;
  count: number;
  tonePreset: TonePreset;
  markets?: string[];
};

export async function generateSurveyResponses(input: GenerateSurveyResponsesInput): Promise<{ inserted: number }> {
  const { data: survey, error: surveyErr } = await supabaseAdmin
    .from("surveys")
    .select("questions")
    .eq("id", input.surveyId)
    .single();
  if (surveyErr || !survey) throw new Error(`Survey ${input.surveyId} not found`);

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const pool = countryPool(input.markets);

  const rows = Array.from({ length: input.count }, () => {
    const device = pick(DEVICES);
    return {
      campaign_id:               input.campaignId,
      survey_id:                 input.surveyId,
      evidence_simulation_id:    input.evidenceSimulationId,
      publisher:                 pick(PUBLISHERS),
      placement:                 pick(PLACEMENTS),
      club:                      pick(CLUBS),
      competition:               pick(COMPETITIONS),
      country:                   pick(pool),
      fan_segment:               pick(FAN_SEGMENTS),
      device,
      browser:                   pick(BROWSERS[device] ?? BROWSERS.mobile),
      q1:                        pickToneWeightedOptionId(questions[0], input.tonePreset),
      q2:                        pickToneWeightedOptionId(questions[1], input.tonePreset),
      q3:                        pickToneWeightedOptionId(questions[2], input.tonePreset),
      response_duration_seconds: Math.floor(Math.random() * 90) + 15,
      created_at:                randomRecentDate(),
      is_demo:                   true,
    };
  });

  const { error } = await supabaseAdmin.from("responses").insert(rows);
  if (error) throw new Error(`Failed to insert simulated responses: ${error.message}`);

  return { inserted: rows.length };
}

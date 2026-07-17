// Canonical value normalisation — applied at API insert time.
// All keys are lowercase for case-insensitive matching.

const COUNTRY_MAP: Record<string, string> = {
  gb: "United Kingdom", uk: "United Kingdom", "g.b.": "United Kingdom",
  gbr: "United Kingdom", "united kingdom": "United Kingdom",
  us: "United States", usa: "United States", "u.s.": "United States",
  "u.s.a.": "United States", "united states": "United States",
  "united states of america": "United States",
  fr: "France", fra: "France", france: "France",
  de: "Germany", deu: "Germany", germany: "Germany", deutschland: "Germany",
  es: "Spain", esp: "Spain", spain: "Spain", "españa": "Spain",
  it: "Italy", ita: "Italy", italy: "Italy", italia: "Italy",
  br: "Brazil", bra: "Brazil", brazil: "Brazil", brasil: "Brazil",
  ar: "Argentina", arg: "Argentina", argentina: "Argentina",
  au: "Australia", aus: "Australia", australia: "Australia",
  jp: "Japan", jpn: "Japan", japan: "Japan",
  nl: "Netherlands", ned: "Netherlands", netherlands: "Netherlands", holland: "Netherlands",
  be: "Belgium", bel: "Belgium", belgium: "Belgium",
  pt: "Portugal", por: "Portugal", portugal: "Portugal",
  mx: "Mexico", mex: "Mexico", mexico: "Mexico", "méxico": "Mexico",
  za: "South Africa", rsa: "South Africa", "south africa": "South Africa",
  ng: "Nigeria", nga: "Nigeria", nigeria: "Nigeria",
  "in": "India", ind: "India", india: "India",
  ca: "Canada", can: "Canada", canada: "Canada",
  ie: "Ireland", irl: "Ireland", ireland: "Ireland",
  sa: "Saudi Arabia", ksa: "Saudi Arabia", "saudi arabia": "Saudi Arabia",
  ae: "United Arab Emirates", uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
};

const Q_VALUE_MAP: Record<string, string> = {
  // Q1 — attendance
  "never": "Never",
  "1–2 times a year": "1-2 times a year",
  "1-2 times a year": "1-2 times a year",
  "3–5 times a year": "3-5 times a year",
  "3-5 times a year": "3-5 times a year",
  "more than 5 times a year": "5+ times a year",
  "5+ times a year": "5+ times a year",
  // Q2 — experience
  "poor": "Poor",
  "average": "Average",
  "good": "Good",
  "excellent": "Excellent",
  // Q3 — recommendation
  "not likely": "Not likely",
  "somewhat likely": "Somewhat likely",
  "likely": "Likely",
  "very likely": "Very likely",
};

const CLUB_MAP: Record<string, string> = {
  "arsenal fc": "Arsenal", "arsenal": "Arsenal", "afc": "Arsenal",
  "liverpool fc": "Liverpool", "liverpool": "Liverpool", "lfc": "Liverpool",
  "chelsea fc": "Chelsea", "chelsea": "Chelsea", "cfc": "Chelsea",
  "manchester city": "Manchester City", "man city": "Manchester City", "mcfc": "Manchester City",
  "manchester united": "Manchester United", "man united": "Manchester United",
  "man utd": "Manchester United", "mufc": "Manchester United",
  "tottenham hotspur": "Tottenham", "spurs": "Tottenham",
  "tottenham": "Tottenham", "thfc": "Tottenham",
  "newcastle united": "Newcastle", "newcastle": "Newcastle", "nufc": "Newcastle",
  "west ham united": "West Ham", "west ham": "West Ham", "whufc": "West Ham",
  "aston villa": "Aston Villa", "avfc": "Aston Villa",
  "everton": "Everton", "efc": "Everton",
  "barcelona": "Barcelona", "fc barcelona": "Barcelona", "barça": "Barcelona", "barca": "Barcelona",
  "real madrid": "Real Madrid", "real madrid cf": "Real Madrid",
  "atletico madrid": "Atlético Madrid", "atlético madrid": "Atlético Madrid",
  "bayer munich": "Bayern Munich", "fc bayern": "Bayern Munich", "fcb": "Bayern Munich",
  "borussia dortmund": "Dortmund", "bvb": "Dortmund", "dortmund": "Dortmund",
  "juventus": "Juventus", "juve": "Juventus",
  "ac milan": "AC Milan", "milan": "AC Milan",
  "inter milan": "Inter Milan", "inter": "Inter Milan",
  "psg": "PSG", "paris saint-germain": "PSG", "paris sg": "PSG",
};

const COMPETITION_MAP: Record<string, string> = {
  "ucl": "UEFA Champions League", "champions league": "UEFA Champions League",
  "cl": "UEFA Champions League", "uefa champions league": "UEFA Champions League",
  "uel": "UEFA Europa League", "europa league": "UEFA Europa League",
  "el": "UEFA Europa League", "uefa europa league": "UEFA Europa League",
  "uecl": "UEFA Conference League", "conference league": "UEFA Conference League",
  "pl": "Premier League", "premier league": "Premier League", "epl": "Premier League",
  "la liga": "La Liga", "laliga": "La Liga", "liga": "La Liga",
  "bundesliga": "Bundesliga", "bund": "Bundesliga",
  "serie a": "Serie A",
  "ligue 1": "Ligue 1",
  "world cup": "FIFA World Cup", "wc": "FIFA World Cup", "fifa world cup": "FIFA World Cup",
  "euros": "UEFA Euros", "euro": "UEFA Euros", "european championship": "UEFA Euros",
};

function normalise(map: Record<string, string>, val: string | number | null | undefined): string | null {
  if (val === null || val === undefined || val === "") return null;
  // q1/q2/q3 are now submitted as integer option IDs — convert safely before map lookup
  const str = String(val);
  const canonical = map[str.toLowerCase().trim()];
  return canonical ?? str.trim();
}

function normaliseFanSegment(val: string | null | undefined): string | null {
  if (!val) return null;
  // Convert snake_case / kebab-case → Title Case
  return val
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// Ad-server macros (%%COUNTRY%%, ${SITE}, {{cb}}, [ZONE], __POS__, %country% …)
// that a publisher's ad server failed to substitute arrive as literal tokens in
// the embed URL, and would otherwise be stored as a bogus country / publisher /
// placement etc. Treat any value that is WHOLLY such a placeholder as "no value"
// so it never enters the data, the dimension charts or exports.
const AD_MACRO_RE = /^\s*(?:%%.*%%|%[a-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$/i;
export function stripAdMacro(val: string | number | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === "" || AD_MACRO_RE.test(str)) return null;
  return str;
}

export function normalisePayload(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    // Strip unreplaced ad macros from every free-text dimension. Mapped fields
    // strip first, then normalise; passthrough fields strip only.
    publisher:    stripAdMacro(body.publisher    as string),
    placement:    stripAdMacro(body.placement    as string),
    placement_id: stripAdMacro(body.placement_id as string),
    creative_id:  stripAdMacro(body.creative_id  as string),
    device:       stripAdMacro(body.device       as string),
    browser:      stripAdMacro(body.browser      as string),
    market:       stripAdMacro(body.market       as string),
    country_code: stripAdMacro(body.country_code as string),
    country:     normalise(COUNTRY_MAP,     stripAdMacro(body.country     as string)),
    club:        normalise(CLUB_MAP,        stripAdMacro(body.club        as string)),
    competition: normalise(COMPETITION_MAP, stripAdMacro(body.competition as string)),
    fan_segment: normaliseFanSegment(stripAdMacro(body.fan_segment as string)),
    q1:          normalise(Q_VALUE_MAP,     body.q1          as string),
    q2:          normalise(Q_VALUE_MAP,     body.q2          as string),
    q3:          normalise(Q_VALUE_MAP,     body.q3          as string),
  };
}

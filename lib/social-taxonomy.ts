/**
 * Football conversation taxonomy — V2 AI classification reference.
 * Mirrors the social_taxonomy DB table. Used in AI prompts and UI dropdowns.
 */

export const FOOTBALL_TOPICS = [
  "Transfers", "Ticketing", "Matchday Experience", "Streaming",
  "Merchandise", "Sponsorship", "Food & Drink", "Travel", "Players",
  "Managers", "Ownership", "Women's Football", "Community", "Grassroots",
  "Competitions", "Facilities", "Accessibility", "Broadcasting", "Fan Rewards",
] as const;

export type FootballTopic = typeof FOOTBALL_TOPICS[number];

export const FOOTBALL_SUBTOPICS: Partial<Record<FootballTopic, string[]>> = {
  "Ticketing":          ["Pricing", "Availability", "Membership", "Hospitality"],
  "Matchday Experience":["Atmosphere", "Food", "Safety", "Transport"],
  "Sponsorship":        ["Activations", "Rewards", "Brand Perception", "Advertising"],
  "Streaming":          ["Cost", "Quality", "Availability", "Accessibility"],
  "Women's Football":   ["Participation", "Accessibility", "Visibility", "Investment"],
};

export type Sentiment = "Positive" | "Neutral" | "Negative" | "Unknown";
export const SENTIMENTS: Sentiment[] = ["Positive", "Neutral", "Negative", "Unknown"];

export const ENTITY_TYPES    = ["Brand", "Club", "Competition", "Topic"] as const;
export const RESEARCH_GOALS  = ["Fan Sentiment", "Emerging Topics", "Sponsorship Perception", "Market Comparison", "Custom"] as const;
export const FREQUENCIES     = ["Manual", "Daily", "Every 12 Hours", "Every 6 Hours"] as const;
export const SEARCH_STATUSES = ["Draft", "Active", "Paused", "Archived"] as const;
export const KEYWORD_TYPES   = ["Brand", "Club", "Player", "Hashtag", "Topic", "Competition", "Campaign"] as const;

// Researcher-facing display labels for the stored research_goal values — the
// stored value is unchanged; only what the user reads changes.
export const RESEARCH_GOAL_LABELS: Record<string, string> = {
  "Fan Sentiment": "Understand Fan Opinion",
  "Emerging Topics": "Identify Emerging Themes",
  "Sponsorship Perception": "Evaluate Sponsorship Impact",
  "Market Comparison": "Compare Markets",
  "Custom": "Custom Analysis",
};

// A one-line description of what each source contributes.
export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  "YouTube": "Video conversations",
  "Reddit": "Community discussions",
  "News": "Editorial coverage",
  "Google Trends": "Search behaviour",
  "X": "Real-time posts",
  "Instagram": "Visual posts",
  "TikTok": "Short-form video",
};

export const PLATFORMS = [
  { id: "Reddit",        label: "Reddit",         defaultOn: true  },
  { id: "YouTube",       label: "YouTube",         defaultOn: true  },
  { id: "News",          label: "News",            defaultOn: true  },
  { id: "Google Trends", label: "Google Trends",  defaultOn: true  },
  { id: "X",             label: "X (Twitter)",    defaultOn: true  },
  { id: "Instagram",     label: "Instagram",      defaultOn: false },
  { id: "TikTok",        label: "TikTok",         defaultOn: false },
] as const;

export const MARKETS = [
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany"        },
  { code: "FR", label: "France"         },
  { code: "ES", label: "Spain"          },
  { code: "SE", label: "Sweden"         },
  { code: "US", label: "United States"  },
  { code: "IN", label: "India"          },
  { code: "CN", label: "China"          },
  { code: "BR", label: "Brazil"         },
  { code: "MX", label: "Mexico"         },
] as const;

// Best-effort auto-detection of a keyword's type, so users don't classify every
// term by hand — they only override when it's wrong. Unambiguous cases only
// (hashtags, well-known clubs/competitions); everything else defaults to Topic.
const KNOWN_CLUBS = ["liverpool", "arsenal", "chelsea", "tottenham", "spurs", "everton", "newcastle", "west ham", "aston villa", "barcelona", "real madrid", "atletico", "atlético", "bayern", "dortmund", "juventus", "juve", "ac milan", "inter milan", "psg", "manchester city", "man city", "manchester united", "man united", "man utd"];
const KNOWN_COMPETITIONS = ["champions league", "ucl", "europa league", "uel", "premier league", "epl", "la liga", "bundesliga", "serie a", "ligue 1", "world cup", "euros", "uefa"];
export function detectKeywordType(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (!k) return "Topic";
  if (k.startsWith("#")) return "Hashtag";
  if (KNOWN_CLUBS.some(c => k === c || k.includes(c))) return "Club";
  if (KNOWN_COMPETITIONS.some(c => k === c || k.includes(c))) return "Competition";
  return "Topic";
}

/** Optional research context that sharpens relevance + entity classification.
 *  When `researchQuestion` is present it becomes the RELEVANCE ANCHOR: relevance
 *  is judged against whether the content helps answer that question, not against
 *  keyword matching. */
export type ClassificationContext = {
  keywords?: string[];
  entityType?: string;    // Brand | Club | Competition | Topic
  researchGoal?: string;
  researchQuestion?: string;
};

/** Build the AI classification prompt for a single mention. Context is optional;
 *  callers that pass none keep the original general-football behaviour. When a
 *  `researchQuestion` is supplied, the prompt performs Stage 2 of collection:
 *  judging whether this conversation GENUINELY helps answer that question rather
 *  than whether it merely contains a matching keyword. */
export function buildClassificationPrompt(content: string, context?: ClassificationContext): string {
  const q = context?.researchQuestion?.trim();
  const subjectBits = [
    context?.keywords?.length ? `Research subject / keywords: ${context.keywords.join(", ")}.` : "",
    context?.entityType ? `Subject type: ${context.entityType}.` : "",
    context?.researchGoal ? `Research goal: ${context.researchGoal}.` : "",
  ].filter(Boolean).join(" ");

  // The relevance anchor and its rules differ when a research question is given:
  // question-relevance is the whole point of Stage 2, and it must not be fooled
  // by keyword matches.
  const relevanceAnchor = q
    ? `RESEARCH QUESTION (judge relevance against THIS): "${q}"`
    : "";

  const relevanceRule = q
    ? `- relevance: how much this conversation genuinely helps ANSWER the research question above — an opinion, reaction, experience or fact that bears on it (1.0 = directly and substantively helps answer it; 0.0 = no meaningful bearing).
- Keyword presence is NOT relevance. A conversation can name the subject and still be irrelevant. Example: for "How do football fans perceive FedEx's UEFA Champions League sponsorship?", a video titled "FedEx driver falls into a swimming pool" mentions FedEx but says nothing about football, sponsorship or fan opinion — it is NOT relevant (relevance near 0.0).
- Coincidental keyword matches, spam, unrelated news, and off-topic content are NOT relevant, however many keywords they contain.
- why_this_matters: 1–2 sentences explaining WHY this conversation is (or isn't) useful to the research question and what it lets the researcher learn — e.g. "This directly discusses fan perceptions of FedEx's UCL sponsorship, making it strong evidence for overall sponsorship sentiment." Do NOT merely restate the sentiment.
- research_aspect: the single facet of the research this conversation most contributes to — a short 1–3 word Title Case label you generate to fit THIS research question (e.g. Brand Perception, Sponsorship Awareness, Fan Benefits, Brand Fit, Purchase Intent, Activation Recall). Pick the most fitting; invent an apt one if none of these fit. If the conversation is not relevant, use "Off-topic".`
    : `- relevance: how relevant this mention is to the research subject above (1.0 = directly about it, 0.0 = unrelated). If no subject was given, judge general football relevance.
- why_this_matters: 1–2 sentences on why this conversation is or isn't useful evidence.
- research_aspect: a short 1–3 word Title Case label for the facet it contributes to (e.g. Brand Perception, Fan Benefits), or "Off-topic" if not relevant.`;

  return `You are a football fan intelligence analyst assessing a single collected conversation as research evidence.
${[relevanceAnchor, subjectBits].filter(Boolean).join("\n")}
Content: "${content}"

Respond with valid JSON only, no markdown, no explanation:
{
  "sentiment": "Positive" | "Neutral" | "Negative" | "Unknown",
  "topic": one of [${FOOTBALL_TOPICS.map(t => `"${t}"`).join(", ")}],
  "subtopic": most specific subtopic or null if none applies,
  "research_aspect": "1–3 word facet of the research this contributes to",
  "why_this_matters": "1–2 sentences on why this conversation matters (or doesn't) to the research question",
  "ai_summary": "One concise sentence summarising the fan sentiment and subject.",
  "entities": [ { "name": "string", "type": "Brand" | "Club" | "Competition" | "Player" | "Topic" } ],
  "relevance": 0.0 to 1.0,
  "confidence": 0.0 to 1.0
}

Rules:
- sentiment must be one of: Positive, Neutral, Negative, Unknown
- topic must be one of the listed topics
- subtopic should be a specific aspect within the topic, or null
- entities: named entities explicitly referenced (clubs, brands, competitions, players); [] if none
${relevanceRule}
- confidence: your overall certainty in the relevance judgement (0.0–1.0)
- ai_summary should be written from a third-person analyst perspective, e.g. "Fans express frustration about..."
- If the content is not clearly football-related, set topic to the closest match, sentiment to Unknown and relevance low`;
}

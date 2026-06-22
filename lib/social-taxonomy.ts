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
export const KEYWORD_TYPES   = ["Brand", "Club", "Player", "Hashtag", "Topic", "Competition"] as const;

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

/** Build the AI classification prompt for a single mention */
export function buildClassificationPrompt(content: string): string {
  return `You are a football fan intelligence analyst. Classify the following mention from a football fan.

Content: "${content}"

Respond with valid JSON only — no markdown, no explanation:
{
  "sentiment": "Positive" | "Neutral" | "Negative" | "Unknown",
  "topic": one of [${FOOTBALL_TOPICS.map(t => `"${t}"`).join(", ")}],
  "subtopic": most specific subtopic or null if none applies,
  "ai_summary": "One concise sentence summarising the fan sentiment and subject."
}

Rules:
- sentiment must be one of: Positive, Neutral, Negative, Unknown
- topic must be one of the listed topics
- subtopic should be a specific aspect within the topic, or null
- ai_summary should be written from a third-person analyst perspective, e.g. "Fans express frustration about..."
- If the content is not clearly football-related, set topic to the closest match and sentiment to Unknown`;
}

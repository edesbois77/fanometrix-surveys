/**
 * Football conversation taxonomy — V2 AI classification reference.
 * Mirrors the social_taxonomy DB table. Used in AI prompts and UI dropdowns.
 */
import {
  type EvidenceRole, DEFAULT_EVIDENCE_ROLE,
  EVIDENCE_ROLE_LABEL, EVIDENCE_ROLE_DESCRIPTION, EVIDENCE_ROLE_RELEVANCE_RULE,
} from "@/lib/evidence-role";

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
  /** WHY this search collects: direct | comparative | strategic. Each role has its
   *  own relevance test (lib/evidence-role.ts). This is what makes "the subject
   *  need not be named" correct for comparative/strategic evidence and forbidden
   *  for direct evidence, where it would license speculative bridging. */
  evidenceRole?: EvidenceRole;
  /** The primary subject the conversation must ENGAGE to be relevant — distinct
   *  from the surrounding context. Sharing the context alone is not relevance.
   *  When informationNeeds are supplied this becomes SOFT context: a conversation
   *  need not name the subject to be relevant if it answers a need. */
  primarySubject?: string;
  /** The Conversation Advisor's Information Needs — the durable unit of research
   *  (docs/conversation-advisor.md). When present, relevance is judged against
   *  these needs (does this help answer one?), and research_aspect is assigned
   *  from their aspects, so evidence lands on the SAME aspects Analysis
   *  synthesises against. This is what makes collection research-led, not
   *  keyword- or subject-led. */
  informationNeeds?: { aspect: string; need: string }[];
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

  // The relevance anchor and its rules have three modes, best first:
  //  1. Information Needs present → judge against the NEEDS (research-led).
  //  2. Only a research question → judge against the question + primary subject.
  //  3. Neither → general football relevance (legacy).
  const primary = context?.primarySubject?.trim();
  const needs = (context?.informationNeeds ?? []).filter(n => n?.need?.trim());
  const definedAspects = Array.from(new Set(needs.map(n => n.aspect.trim()).filter(Boolean)));

  // THE EVIDENCE ROLE governs the relevance test. It is stated first and it
  // OVERRIDES any general guidance below, because "the subject need not be
  // named" is correct for comparative/strategic evidence and is precisely the
  // loophole that admits junk when the search is direct.
  const role: EvidenceRole = context?.evidenceRole ?? DEFAULT_EVIDENCE_ROLE;
  const roleBlock = `EVIDENCE ROLE: ${EVIDENCE_ROLE_LABEL[role].toUpperCase()}. ${EVIDENCE_ROLE_DESCRIPTION[role]}
${EVIDENCE_ROLE_RELEVANCE_RULE[role]}
This role's test OVERRIDES any general guidance below wherever they disagree.`;

  // The single most common failure: awarding relevance for a speculative chain
  // ("could influence", "may indirectly affect", "if fans associate"). Genuine
  // evidence engages the subject of its role; it does not need a bridge built.
  const antiBridging = `- NO SPECULATIVE BRIDGING. Relevance must come from what the conversation ACTUALLY discusses, not from a chain of inference about what it might imply. If justifying relevance requires words like "could influence", "may affect", "indirectly", "if fans associate" or "this might suggest", then it is NOT relevant: score ~0.0 and mark it Off-topic. A conversation that merely shares a brand name, a sport, a competition or a mood with the research is not evidence.`;

  const relevanceAnchor = needs.length
    ? `INFORMATION NEEDS — the evidence this research must obtain. Judge relevance against THESE:
${needs.map(n => `- [${n.aspect}] ${n.need}`).join("\n")}
${q ? `\nOVERALL RESEARCH QUESTION these needs serve: "${q}"` : ""}${primary ? `\nThe research ultimately applies to: ${primary}. A conversation does NOT have to mention it — answering an information need is what makes evidence relevant.` : ""}`
    : q
    ? `RESEARCH QUESTION (judge relevance against THIS): "${q}"${primary ? `\nPRIMARY SUBJECT of the question — the conversation MUST engage THIS, not merely the surrounding context: ${primary}` : ""}`
    : "";

  const relevanceRule = needs.length
    ? `- relevance: how much this conversation MATERIALLY HELPS ANSWER one or more of the INFORMATION NEEDS above (1.0 = directly and substantively answers a need; 0.0 = answers none).
${role === "direct"
      ? `- Because this is a DIRECT search, answering a need is NOT sufficient on its own: the conversation must also genuinely engage the research subject itself. Do not accept a conversation that answers a need only in the abstract, or that names the subject in an unrelated sense.`
      : `- A conversation is RELEVANT if it gives fan opinion, reaction, experience, an example, or a fact that bears on a need, EVEN IF it never mentions the primary subject. Worked example for the need "What makes a sponsorship activation memorable?": a fan enthusing about a RIVAL brand's brilliant activation IS strong evidence, because it answers that need. This relaxation applies because the role is ${EVIDENCE_ROLE_LABEL[role]}; it would NOT apply to a direct search.`}
- It is NOT relevant if it only shares a topic, competition or entity with the research but answers none of the needs. Sharing the competition named in the research — or even naming the subject — is NOT enough on its own.
    • NOT RELEVANT (topic only, no need answered): "For me, it has to be Eze's goal" — a Champions League moment that answers none of the needs. Score ~0.0 even though it is clearly about football.
    • NOT RELEVANT (wrong meaning of the subject): "My FedEx parcel is stuck in transit, terrible service" — this is about the courier business, NOT the sponsorship. It answers no need. Score ~0.0 / Off-topic even though it names FedEx.
- DISAMBIGUATION: some needs name the subject (e.g. "how is the sponsorship perceived?"). Those needs are about the subject's SPONSORSHIP / football role — NOT the company's unrelated business. A conversation that mentions the subject in an unrelated sense (a courier/logistics/delivery/parcel complaint, a same-name person or place) does NOT answer such a need. Do not map it to that need; score it ~0.0 / Off-topic.
- research_aspect: the ASPECT of the need this conversation best serves. Use EXACTLY one of these defined aspects, verbatim: ${definedAspects.map(a => `"${a}"`).join(", ")}. If it serves none of the needs, use "Off-topic".
- information_need: the single information need (copied VERBATIM from the bracketed list above) this conversation best answers, or null if Off-topic.
- why_this_matters: 1–2 sentences naming which need this informs and what it lets the researcher learn. Do NOT merely restate the sentiment.`
    : q
    ? `- relevance: how much this conversation MATERIALLY HELPS ANSWER the research question — a fan opinion, reaction, experience or fact that actually bears on it (1.0 = directly and substantively helps answer it; 0.0 = no meaningful bearing).
- The test is "does this help ANSWER the question?", NOT "does this share an entity, competition or topic with the question?". Sharing the competition, event, club or topic named in the question is NOT enough on its own.
${role === "direct"
    ? `- The conversation must engage the PRIMARY SUBJECT of the question AND the specific thing it asks about. Worked example for "How do football fans perceive FedEx's UEFA Champions League sponsorship?":
    • RELEVANT: fans reacting to, praising, criticising or opining on FedEx's sponsorship, its presence around the Champions League, its brand fit, or their perception of it.
    • NOT RELEVANT (context only, subject absent): "For me, it has to be Eze's goal" — this is about a Champions League moment but says nothing about FedEx or the sponsorship, so it does not help answer the question. Score ~0.0 even though it is clearly about football.
    • NOT RELEVANT (wrong meaning of the subject): a FedEx logistics, delivery, parcel or driver story — mentions FedEx but not the sponsorship. Score ~0.0.
- Do NOT inflate relevance for detailed, on-topic-for-football content that never touches the subject of the question. Topic or competition overlap is not evidence. When the subject is absent or only incidental, relevance is low regardless of how football-relevant the content otherwise is.`
    : `- IMPORTANT: because the evidence role is ${EVIDENCE_ROLE_LABEL[role].toUpperCase()}, the research subject of the question is NOT required to appear, and its absence must NOT reduce the score. Judge the item against the role's test above: a strong ${role === "comparative" ? "comparable brand, sponsor or campaign" : "insight into the market, audience or their behaviour"} scores HIGH (0.7+) even though the subject is never mentioned. Score low only when the item fails the role's own test, e.g. general match banter or reaction that engages ${role === "comparative" ? "no comparable brand or campaign" : "no attitude or behaviour relevant to the research"}.`}
- why_this_matters: 1–2 sentences explaining WHY this conversation is (or isn't) useful to the research question and what it lets the researcher learn. Do NOT merely restate the sentiment.
- research_aspect: the single facet of the research this conversation most contributes to — a short 1–3 word Title Case label you generate to fit THIS research question (e.g. Brand Perception, Sponsorship Awareness, Fan Benefits, Brand Fit, Purchase Intent, Activation Recall). Pick the most fitting; invent an apt one if none of these fit. If the conversation is not relevant, use "Off-topic".`
    : `- relevance: how relevant this mention is to the research subject above (1.0 = directly about it, 0.0 = unrelated). If no subject was given, judge general football relevance.
- why_this_matters: 1–2 sentences on why this conversation is or isn't useful evidence.
- research_aspect: a short 1–3 word Title Case label for the facet it contributes to (e.g. Brand Perception, Fan Benefits), or "Off-topic" if not relevant.`;

  return `You are a research analyst assessing a single collected conversation as research evidence. The domain is set by the research context below; do not assume one.

${roleBlock}
${[relevanceAnchor, subjectBits].filter(Boolean).join("\n")}
Content: "${content}"

Respond with valid JSON only, no markdown, no explanation:
{
  "sentiment": "Positive" | "Neutral" | "Negative" | "Unknown",
  "topic": one of [${FOOTBALL_TOPICS.map(t => `"${t}"`).join(", ")}] or null,
  "subtopic": most specific subtopic or null if none applies,
  "research_aspect": "the aspect of the research this contributes to",
  "information_need": "verbatim information need it best answers, or null",
  "why_this_matters": "1–2 sentences on why this conversation matters (or doesn't) to the research question",
  "ai_summary": "One concise sentence summarising the fan sentiment and subject.",
  "entities": [ { "name": "string", "type": "Brand" | "Club" | "Competition" | "Player" | "Topic" } ],
  "relevance": 0.0 to 1.0,
  "confidence": 0.0 to 1.0
}

Rules:
- sentiment must be one of: Positive, Neutral, Negative, Unknown
- topic: this is a LEGACY football vocabulary. Use one of the listed topics ONLY if the conversation genuinely fits it; otherwise use null. NEVER force a fit, and never pick a "closest match". The meaningful taxonomy is research_aspect, which you generate from the research itself.
- subtopic should be a specific aspect within the topic, or null
- entities: named entities explicitly referenced (clubs, brands, competitions, players); [] if none
${relevanceRule}
${antiBridging}
- confidence: your overall certainty in the relevance judgement (0.0–1.0)
- ai_summary should be written from a third-person analyst perspective, e.g. "Fans express frustration about..."
- If the content does not fit the listed topics, set topic to null. If it is unintelligible or has no bearing on the research, set sentiment to Unknown and relevance low.`;
}

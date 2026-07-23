// News Coverage classification — the research safeguards that stop editorial
// coverage being read as fan opinion.
//
// THE PROBLEM THIS EXISTS TO PREVENT. Conversation Intelligence judges what
// PEOPLE say. News judges what PUBLICATIONS print, and the two are not the same
// evidence. A press release saying an activation "delighted fans" is a brand
// claiming success, not fans valuing it. A trade title reporting a deal is a
// journalist describing a transaction, not an audience reacting to one. If both
// land in the same undifferentiated stream, synthesis will quietly convert
// coverage volume and coverage tone into "fans think…", which is the single
// worst failure this platform can make.
//
// So every article carries:
//   source_type   what KIND of statement this is (reporting / announcement / …)
//   attribution   WHO is making the central claim
//   claim_basis   whether the claim is independently established or merely relayed
//   fan_evidence  whether the article contains actual evidence of fan reaction
//
// and the prompt below forbids inferring fan opinion from an article's existence
// or tone. Client- and server-safe: pure types + prompt building, no I/O.
import {
  type EvidenceRole, DEFAULT_EVIDENCE_ROLE, EVIDENCE_ROLE_LABEL,
} from "@/lib/evidence-role";

// ── What kind of statement an article is ─────────────────────────────────────
export const NEWS_SOURCE_TYPES = [
  "independent_reporting",
  "brand_announcement",
  "rights_holder_announcement",
  "press_release",
  "expert_commentary",
  "opinion",
  "trade_analysis",
  "research_or_data",
  "reported_fan_reaction",
  "sponsored_content",
  "unclear",
] as const;

export type NewsSourceType = (typeof NEWS_SOURCE_TYPES)[number];

export const NEWS_SOURCE_TYPE_LABEL: Record<NewsSourceType, string> = {
  independent_reporting: "Independent reporting",
  brand_announcement: "Brand announcement",
  rights_holder_announcement: "Rights holder announcement",
  press_release: "Press release",
  expert_commentary: "Named expert commentary",
  opinion: "Opinion or column",
  trade_analysis: "Trade analysis",
  research_or_data: "Research or data",
  reported_fan_reaction: "Reported fan reaction",
  sponsored_content: "Sponsored or paid content",
  unclear: "Unclear",
};

/** What Analysis is permitted to do with each kind of article. This is the news
 *  equivalent of EVIDENCE_ROLE_ATTRIBUTION_RULE, and it exists for the same
 *  reason: to stop a claim being promoted into a fact on its way to a finding. */
export const NEWS_SOURCE_TYPE_ATTRIBUTION_RULE: Record<NewsSourceType, string> = {
  independent_reporting: "A journalist's own reporting. May be cited as what was reported, naming the publisher.",
  brand_announcement: "The brand's own account of its activity. Cite ONLY as what the brand said about itself, never as an established outcome.",
  rights_holder_announcement: "The competition or rights holder's own account. Cite ONLY as what the rights holder said, never as an independent assessment.",
  press_release: "A supplied statement. Cite ONLY as a claim by whoever issued it. Its appearance in several outlets is distribution, not corroboration.",
  expert_commentary: "A named person's view. Cite with the name and their interest, never as consensus or as audience opinion.",
  opinion: "A columnist's argument. Cite as one commentator's view, never as reporting or as fan sentiment.",
  trade_analysis: "A trade title's analysis. Cite as informed industry assessment, distinguishing its evidence from its interpretation.",
  research_or_data: "Reported research or data. Cite the underlying source and its method where stated; do not treat a summary of a study as the study.",
  reported_fan_reaction: "Reported fan reaction. Cite as fan reaction AS REPORTED, naming the publisher; it is second-hand and is not a substitute for collected conversation.",
  sponsored_content: "Paid placement. Cite only as advertising, never as reporting or as evidence of effect.",
  unclear: "The kind of statement could not be established. Cite with that uncertainty stated, and never as an established fact.",
};

/** True where the article is the interested party speaking about itself. */
export const NEWS_SOURCE_TYPE_IS_SELF_REPORTED: Record<NewsSourceType, boolean> = {
  independent_reporting: false, brand_announcement: true, rights_holder_announcement: true,
  press_release: true, expert_commentary: false, opinion: false, trade_analysis: false,
  research_or_data: false, reported_fan_reaction: false, sponsored_content: true, unclear: false,
};

export function asNewsSourceType(v: unknown): NewsSourceType {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return (NEWS_SOURCE_TYPES as readonly string[]).includes(s) ? (s as NewsSourceType) : "unclear";
}

// ── Whether the central claim stands up ──────────────────────────────────────
export const NEWS_CLAIM_BASES = ["independently_reported", "attributed_claim", "unsupported", "not_applicable"] as const;
export type NewsClaimBasis = (typeof NEWS_CLAIM_BASES)[number];

export const NEWS_CLAIM_BASIS_LABEL: Record<NewsClaimBasis, string> = {
  independently_reported: "Independently reported",
  attributed_claim: "Claim, attributed",
  unsupported: "Claim, unsupported",
  not_applicable: "No outcome claimed",
};

export function asClaimBasis(v: unknown): NewsClaimBasis {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return (NEWS_CLAIM_BASES as readonly string[]).includes(s) ? (s as NewsClaimBasis) : "not_applicable";
}

// ── The relevance test each Evidence Role applies to NEWS ─────────────────────
// Deliberately stricter and more concrete than the conversation tests: an
// article is long-form and will nearly always touch the right topic, so "is it
// about football sponsorship" is far too weak a bar.
export const NEWS_ROLE_RELEVANCE_RULE: Record<EvidenceRole, string> = {
  direct:
    `DIRECT news must MATERIALLY CONCERN the research subject's own sponsorship, partnership or activation. The subject appearing in a list of sponsors, in a fixture report, in a share-price or logistics story, or as a passing mention, is NOT material. If the article would still say substantially the same thing with the subject removed, it is not direct evidence: score ~0.0 and mark it Off-topic.`,
  comparative:
    `COMPARATIVE news must concern a NAMED COMPARATOR and that comparator's sponsorship, partnership or activation. The research subject need not appear and its absence must not reduce the score. An article about the comparator's unrelated business, or about the competition generally, is NOT comparative evidence: score ~0.0.`,
  strategic:
    `STRATEGIC news must MATERIALLY ADDRESS football (or comparable) sponsorship practice, the value an audience gets from it, or what makes activation effective. Reporting a deal, a fixture or a result is not strategic evidence. The article must say something about HOW sponsorship works, what audiences value, or what worked and why: otherwise score ~0.0.`,
};

export type NewsClassificationContext = {
  /** The research question the coverage is judged against. */
  researchQuestion?: string;
  /** The Evidence Requirement this task serves, stated in full. */
  requirement?: string;
  informationNeeds?: { aspect: string; need: string }[];
  evidenceRole?: EvidenceRole;
  /** The anchor the role's test judges against — the client for direct, the
   *  named comparator for comparative. Absent for strategic. */
  primarySubject?: string;
  /** Provenance the classifier should reason WITH rather than guess at. */
  publisher?: string;
  publisherTier?: string;
  author?: string;
  publishedAt?: string;
};

/** Build the classification prompt for one article. */
export function buildNewsClassificationPrompt(content: string, context?: NewsClassificationContext): string {
  const role: EvidenceRole = context?.evidenceRole ?? DEFAULT_EVIDENCE_ROLE;
  const needs = (context?.informationNeeds ?? []).filter(n => n?.need?.trim());
  const definedAspects = Array.from(new Set(needs.map(n => n.aspect.trim()).filter(Boolean)));
  const primary = context?.primarySubject?.trim();

  const provenance = [
    context?.publisher ? `Publisher: ${context.publisher}.` : "",
    context?.publisherTier ? `Publisher kind: ${context.publisherTier}.` : "",
    context?.author ? `Byline: ${context.author}.` : "",
    context?.publishedAt ? `Published: ${context.publishedAt}.` : "",
  ].filter(Boolean).join(" ");

  // THE FAILURE THIS GUARD EXISTS TO PREVENT, found in live validation.
  // A comparative requirement reads "Benchmark <client>'s sponsorship against
  // other successful sponsors", and its information needs name the client too
  // ("How does <client>'s sponsorship compare?"). Read literally, that made the
  // classifier demand that each ARTICLE draw the comparison itself, and it
  // rejected every piece of genuine comparator coverage — sixteen out of
  // sixteen on the Heineken task, including a Heineken Champions League
  // activation reported first-hand. The requirement describes what the RESEARCH
  // is for. Fanometrix draws the comparison at synthesis; the article only has
  // to supply the comparator's side of it.
  const notTheArticlesJob =
    role === "comparative"
      ? `\nHOW TO READ THE REQUIREMENT ABOVE. It names the client because that is what the RESEARCH is for. THIS ARTICLE DOES NOT HAVE TO MENTION THE CLIENT, draw a comparison, or discuss the client at all, and rejecting it for failing to do so is WRONG. Its job is to supply the COMPARATOR's side of the benchmark; the comparison itself is drawn later, at synthesis.
  • RELEVANT: a report of ${primary ? primary : "the comparator"}'s own Champions League activation, campaign, fan experience or renewal, even though the client is never named. This is exactly what comparative evidence is.
  • RELEVANT: what ${primary ? primary : "the comparator"} claims about its own activation, or what an outlet reports about how it landed.
  • NOT RELEVANT: ${primary ? primary : "the comparator"}'s unrelated business, or general coverage of the competition that engages no comparator sponsorship.
Where an information need names the client, an article answers it by giving the comparator's side. Do not require the article to answer it about the client.`
      : role === "strategic"
      ? `\nHOW TO READ THE REQUIREMENT ABOVE. It names the client because that is what the RESEARCH is for. THIS ARTICLE DOES NOT HAVE TO MENTION THE CLIENT OR ANY BRAND, and its absence must not reduce the score. Judge it only on whether it materially addresses sponsorship practice, audience value or activation effectiveness.`
      : "";

  const anchorBlock = [
    context?.requirement ? `EVIDENCE REQUIREMENT this coverage serves: "${context.requirement}"` : "",
    context?.researchQuestion ? `OVERALL RESEARCH QUESTION: "${context.researchQuestion}"` : "",
    primary ? `THE ANCHOR the role's test judges against: ${primary}` : "",
    needs.length ? `INFORMATION NEEDS this research must obtain:\n${needs.map(n => `- [${n.aspect}] ${n.need}`).join("\n")}` : "",
    notTheArticlesJob,
  ].filter(Boolean).join("\n");

  return `You are a media analyst assessing ONE NEWS ARTICLE as research evidence. You are NOT assessing a social media post, and you must never treat this article as if it were somebody's opinion of the subject.

EVIDENCE ROLE: ${EVIDENCE_ROLE_LABEL[role].toUpperCase()}.
${NEWS_ROLE_RELEVANCE_RULE[role]}
This role's test OVERRIDES any general guidance below wherever they disagree.

${anchorBlock}
${provenance}

ARTICLE (headline, then the publisher's own summary where the feed provided one):
"""
${content}
"""

THE RULES THAT MATTER MOST, in order:

1. NEVER INFER FAN OPINION. The existence of an article, the number of outlets carrying it, and the warmth of its language say NOTHING about what fans think. Do not report audience sentiment, enthusiasm, backlash or indifference unless the article contains actual evidence of fan reaction — quoted supporters, reported polling, described crowd or online response. If it does not, fan_evidence is "none" and you must not describe fan feeling anywhere in your answer.

2. SEPARATE THE CLAIM FROM THE CLAIMANT. Decide what KIND of statement this is and WHO is making it. A brand or rights holder describing its own activation as a success is making a claim about itself; that is "brand_announcement" or "rights_holder_announcement" with claim_basis "attributed_claim", never independent proof of effect. Copy supplied by a company and reprinted is "press_release". A journalist's own reporting, with the outlet's own facts or interviews, is "independent_reporting". A named individual's view is "expert_commentary" or "opinion".

3. NO SPECULATIVE BRIDGING. Relevance comes from what the article ACTUALLY concerns, not from a chain of inference about what it might imply. If justifying relevance needs "could influence", "may indirectly", "if fans associate" or "this might suggest", it is NOT relevant: score ~0.0 and use "Off-topic". Sharing a brand, a sport or a competition with the research is not evidence.

4. SENTIMENT HERE MEANS THE TONE OF THE COVERAGE ITSELF — favourable, neutral or critical toward its subject. It is NOT audience sentiment and must never be read as such.

5. THE DECIDING TEST, which overrides everything above where they disagree:
${NEWS_ROLE_RELEVANCE_RULE[role]}

Respond with valid JSON only, no markdown:
{
  "source_type": one of [${NEWS_SOURCE_TYPES.map(t => `"${t}"`).join(", ")}],
  "attribution": "who is making the central claim — a named person, the brand, the rights holder, the publication's own reporting, or 'unclear'",
  "claim_basis": "independently_reported" | "attributed_claim" | "unsupported" | "not_applicable",
  "fan_evidence": "none" | "reported" | "quoted",
  "fan_evidence_note": "if not none, what actual fan evidence the article contains, in one sentence; otherwise null",
  "outcome_claimed": "any reported result or effect of an activation, stated as the article states it, or null",
  "sentiment": "Positive" | "Neutral" | "Negative" | "Unknown",
  "entities": [ { "name": "string", "type": "Brand" | "Club" | "Competition" | "Person" | "Topic" } ],
  "research_aspect": ${definedAspects.length ? `EXACTLY one of ${definedAspects.map(a => `"${a}"`).join(", ")} verbatim, or "Off-topic"` : `"a short 1-3 word Title Case label for the facet of the research this serves, or \\"Off-topic\\""`},
  "information_need": ${needs.length ? `"the information need it best answers, copied VERBATIM from the list above, or null"` : `null`},
  "why_this_matters": "1-2 sentences: what this article lets the researcher learn, and what it does NOT establish",
  "ai_summary": "one sentence, written as a media analyst: WHO reported or claimed WHAT. Start with the publisher or the claimant, never with 'Fans...'",
  "relevance": 0.0 to 1.0,
  "confidence": 0.0 to 1.0
}

Further rules:
- relevance: how much this article MATERIALLY SERVES the evidence requirement under the role's test above. 1.0 = squarely on it; 0.0 = fails the role's test. Judge against THE ROLE'S TEST, not against whether the article mentions the client.
- A press release that is entirely promotional can still be RELEVANT (it evidences what the brand claims and how it positions the activation). Score its relevance on the role's test, and let source_type and claim_basis carry the caveat. Do not silently downgrade relevance as a substitute for flagging the source type.
- sponsored_content: mark it when the article is labelled as paid, sponsored, promoted or "in partnership with".
- ai_summary and why_this_matters must NEVER assert what fans think unless fan_evidence is "reported" or "quoted", and then only as reported by that publisher.
- entities: named entities the article actually discusses; [] if none.
- confidence: your certainty in the relevance and source_type judgements.`;
}

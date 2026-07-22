// Evidence Role — a core part of Fanometrix's research methodology.
//
// Most listening tools treat every mention as one undifferentiated stream.
// Fanometrix reasons over DIFFERENT TYPES of evidence, each collected for a
// different purpose and each judged by its own relevance test, then brings them
// together to answer the client's challenge:
//
//   Direct       evidence specifically about the client, brand or sponsorship
//   Comparative  evidence about comparable brands, sponsors or campaigns
//   Strategic    wider evidence about the market, audience or behaviour
//
// Two rules make this work, and both matter:
//  1. Each role has its OWN relevance rules. "Does not have to mention the
//     client" is correct for Comparative and Strategic evidence, and dangerous
//     for Direct evidence, where it licenses speculative bridging.
//  2. The role TRAVELS WITH THE EVIDENCE all the way into synthesis, so Analysis
//     always knows what kind of evidence it is reasoning from and never
//     attributes a competitor's conversation to the client.
//
// Client- and server-safe: pure types + helpers, no I/O.

export type EvidenceRole = "direct" | "comparative" | "strategic";

export const EVIDENCE_ROLES: EvidenceRole[] = ["direct", "comparative", "strategic"];

// Collection defaults to Direct: the strictest test, so an unconfigured search can
// never silently admit competitor or market chatter as evidence about the client.
export const DEFAULT_EVIDENCE_ROLE: EvidenceRole = "direct";

export const EVIDENCE_ROLE_LABEL: Record<EvidenceRole, string> = {
  direct: "Direct", comparative: "Comparative", strategic: "Strategic",
};

export const EVIDENCE_ROLE_DESCRIPTION: Record<EvidenceRole, string> = {
  direct: "Evidence specifically about the client, their brand or the sponsorship under study.",
  comparative: "Evidence about comparable brands, sponsors or campaigns, used to benchmark what good looks like.",
  strategic: "Wider evidence about the market, the audience or their behaviour that helps answer the research question.",
};

// The relevance test the classifier applies for each role. Written as prompt
// instructions because this is where the role does its most important work.
export const EVIDENCE_ROLE_RELEVANCE_RULE: Record<EvidenceRole, string> = {
  direct:
    `This is a DIRECT evidence search. The conversation MUST genuinely engage the research subject itself, its sponsorship, brand or activity. The subject being NAMED is not sufficient: a mention of the company in an unrelated sense (a courier, delivery, parcel or driver complaint; a share price or redundancy story; a same-name person or place) does NOT engage the subject's sponsorship and scores ~0.0 / Off-topic. Content that is merely about the same sport, competition or event, without engaging the subject, also scores ~0.0.`,
  comparative:
    `This is a COMPARATIVE evidence search. The conversation must genuinely engage a COMPARABLE brand, sponsor or campaign, how it is perceived, what it did, or how fans responded. The research subject itself does NOT need to appear, and its absence is not a reason to score low. What does score ~0.0 is general chatter about the sport, competition or event that engages no comparable brand or campaign.`,
  strategic:
    `This is a STRATEGIC evidence search. The conversation must genuinely inform the wider market, audience or behavioural question, how this audience thinks, what they value, how they respond to sponsorship or marketing in general. No brand needs to appear. What scores ~0.0 is banter, match commentary or reaction that reveals nothing about the audience's attitudes or behaviour relevant to the research.`,
};

// How Analysis is permitted to attribute each role. This is what stops a
// competitor's conversation becoming "fans think the client is...".
export const EVIDENCE_ROLE_ATTRIBUTION_RULE: Record<EvidenceRole, string> = {
  direct: `may be attributed to the client and their sponsorship directly.`,
  comparative: `describes ANOTHER brand or campaign. NEVER attribute it to the client. Use it only to benchmark, contrast, or show what the client is being measured against.`,
  strategic: `describes the market, audience or general behaviour. NEVER present it as an opinion about the client or about a competitor; use it to explain context, expectations or why a pattern occurs.`,
};

export function asEvidenceRole(v: unknown): EvidenceRole {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (EVIDENCE_ROLES as string[]).includes(s) ? (s as EvidenceRole) : DEFAULT_EVIDENCE_ROLE;
}

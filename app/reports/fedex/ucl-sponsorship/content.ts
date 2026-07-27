// FedEx UEFA Champions League Sponsorship — "Beyond Visibility".
//
// This file is the web rendering of the APPROVED consultancy report
// ("Beyond Visibility", prepared by Fanometrix for M&C Saatchi Sport &
// Entertainment). It is the source of truth: section titles, order, arguments,
// conclusions and recommendations are reproduced from the approved document.
// The framework improves presentation only — it does not reinterpret the
// strategy. Survey chart figures are the combined 274-response aggregate;
// summary figures in the narrative are quoted exactly as the report states them.

import type { ReportConfig } from "@/lib/reports/framework/types";

export const fedexUclReport: ReportConfig = {
  slug: "fedex/ucl-sponsorship",
  documentTitle: "FedEx UEFA Champions League Sponsorship",
  access: {
    id: "fedex-ucl-sponsorship",
    passwordEnv: "REPORT_PW_FEDEX_UCL",
    viewSeed: 127,
  },
  sections: [
    /* ── Hero ─────────────────────────────────────────────────────────────── */
    {
      type: "hero",
      id: "top",
      eyebrow: "Fanometrix · Independent Football Fan Intelligence",
      title: "Beyond Visibility",
      subtitle:
        "Strengthening FedEx's UEFA Champions League sponsorship strategy through evidence-led fan insight.",
      meta: {
        preparedFor: "M&C Saatchi Sport & Entertainment",
        preparedBy: "Fanometrix",
        date: "July 2026",
        classification: "Confidential",
        version: "1.0",
        status: "complete",
        statusLabel: "Complete",
        lastUpdated: "27 July 2026, 09:15 BST",
        readingTime: "11 min read",
        evidenceSources: 4,
      },
    },

    /* ── Why Fanometrix? ──────────────────────────────────────────────────── */
    {
      type: "prose",
      id: "why-fanometrix",
      navLabel: "Why Fanometrix",
      tone: "grey",
      kicker: "Why Fanometrix?",
      paragraphs: [
        "Fanometrix was created around a simple belief: football supporters invest more in the game than anyone else, yet their voices are rarely heard when sponsorship decisions are made. By combining fan research, conversation intelligence and strategic analysis, we help brands create sponsorships that improve the experience of football while delivering stronger commercial outcomes.",
      ],
    },

    /* ── The Opportunity ──────────────────────────────────────────────────── */
    {
      type: "prose",
      id: "the-opportunity",
      navLabel: "The Opportunity",
      tone: "white",
      kicker: "The Opportunity",
      paragraphs: [
        "FedEx has established one of the most recognisable and credible brand partnerships in European football. The opportunity is no longer to establish its place within the UEFA Champions League, but to create greater value for football fans in ways that strengthen long-term brand and commercial impact.",
        "M&C Saatchi S&E has developed a compelling strategic direction centred on the role FedEx plays in making football possible. This research was undertaken to complement that work by bringing together proprietary fan research from across the football industry, conversation intelligence and independent sponsorship evidence, validating the strongest elements of the strategy whilst identifying opportunities to strengthen it further.",
      ],
    },

    /* ── Headline Conclusion (navy statement band) ────────────────────────── */
    {
      type: "image",
      id: "headline-conclusion",
      src: "/reports/fedex/RealMadrid.webp",
      alt: "Real Madrid supporters at a UEFA Champions League match",
      scrim: 0.9,
      overline: "Headline Conclusion",
      headline:
        "Across multiple evidence sources, the strongest opportunity is not for FedEx to tell football fans what it does, but to demonstrate its role by creating experiences and value that fans genuinely care about.",
      height: "tall",
    },

    /* ── Research at a Glance ─────────────────────────────────────────────── */
    {
      type: "stat-wall",
      id: "research-at-a-glance",
      navLabel: "Research at a Glance",
      tone: "grey",
      kicker: "Research at a Glance",
      paragraphs: [
        "To complement M&C Saatchi S&E's strategic work, Fanometrix conducted a rapid proprietary research study across The Football Collective's connected network of premium football publishers, including LiveScore, Football365, TeamTalk and PlanetFootball.",
        "Over a three-day period, supporters across the United Kingdom, Germany, France, Spain and Italy were invited to complete a three-question survey exploring perceptions of FedEx sponsorship and the role brands should play in football.",
        "The campaign generated 757,566 survey impressions, resulting in 1,243 questions answered and 274 completed surveys, providing proprietary fan evidence that complements our conversation intelligence and wider sponsorship research.",
      ],
      stats: [
        { value: "757,566", label: "Survey impressions" },
        { value: "1,243", label: "Questions answered" },
        { value: "274", countTo: 274, label: "Completed surveys" },
        { value: "5", countTo: 5, label: "Markets", detail: "United Kingdom, Germany, France, Spain, Italy" },
        { value: "57", countTo: 57, label: "Approved research findings" },
        { value: "4", countTo: 4, label: "Evidence sources" },
      ],
      callout: {
        label: "Why this matters",
        paragraphs: [
          "This was intentionally a limited pilot designed to validate Fanometrix's research methodology rather than maximise sample size.",
          "Even within just three days, the study generated meaningful directional insight across five European markets.",
          "The same methodology can now be scaled across The Football Collective's wider publisher network, enabling future studies to gather several thousand responses, ask more detailed questions and provide even greater strategic confidence for brands and agencies.",
          "The purpose of this section is not to sell Fanometrix. It is to demonstrate that the proprietary research we've included in this report is credible, scalable and a meaningful complement to the wider evidence base.",
        ],
      },
    },

    /* ── Executive Dashboard ──────────────────────────────────────────────── */
    {
      type: "insight",
      id: "executive-dashboard",
      navLabel: "Executive Dashboard",
      tone: "white",
      chapter: "01",
      kicker: "Executive Dashboard",
      heading: "The most significant findings",
      lede: "The most significant findings from Fanometrix's proprietary research, conversation intelligence and wider sponsorship evidence.",
      callouts: [
        {
          metric: "65%",
          title: "FedEx already has permission to play",
          body: "Almost two-thirds of football fans see FedEx as either a natural fit or a relevant UEFA Champions League sponsor across Europe, suggesting the opportunity is no longer establishing credibility, but increasing the value the sponsorship creates.",
        },
        {
          metric: "36%",
          title: "Fans value experiences over exposure",
          body: "More fans want sponsors to provide tangible value through rewards, benefits and memorable experiences than simply increase their visibility. Rewards and benefits were the single most requested sponsorship benefit (37%), while one-third of supporters (33%) said FedEx could help them most by providing access to football experiences.",
        },
        {
          overline: "Multiple Evidence Sources",
          title: "Independent evidence increases confidence",
          body: "Our proprietary survey, conversation intelligence and wider sponsorship research consistently reinforce M&C Saatchi S&E's strategic direction, increasing confidence that it is aligned with both fan expectations and established sponsorship best practice.",
        },
        {
          overline: "An Opportunity to Broaden Participation",
          title: "Football fans are business decision-makers too",
          body: "Whilst M&C Saatchi S&E rightly identifies SME decision-makers as a priority audience, the evidence suggests an opportunity to engage the wider football fan community, recognising that business audiences are not separate from football audiences, they are part of them.",
        },
        {
          overline: "Opportunity to Build Throughout the Season",
          title: "The evidence supports a more sustained approach to fan engagement",
          body: "The wider sponsorship literature consistently shows that repeated positive experiences strengthen long-term brand associations. This suggests there may be an opportunity to apply M&C Saatchi S&E's strategic platform across more of the UEFA Champions League season, rather than concentrating activity around individual moments.",
        },
        {
          overline: "Opportunity for Greater Fan Reach",
          title: "Make fan experiences accessible to more supporters",
          body: "FedEx has already demonstrated its ability to create engaging fan activations. The opportunity is to make those experiences accessible to more supporters across the UEFA Champions League season, increasing both their impact and recognition.",
        },
      ],
      takeaway: {
        label: "Overall Assessment",
        text: "Taken together, the evidence strengthens confidence in M&C Saatchi S&E's strategic direction. Rather than indicating a need for a different approach, it highlights opportunities to broaden participation, extend fan reach and maximise the value FedEx creates throughout the UEFA Champions League season.",
      },
    },

    /* ── Our Evidence Base ────────────────────────────────────────────────── */
    {
      type: "methodology",
      id: "evidence-base",
      navLabel: "Evidence Base",
      tone: "grey",
      chapter: "02",
      kicker: "Our Evidence Base",
      heading: "Our Evidence Base",
      lede: "This review combines proprietary fan research with independent evidence to provide a balanced assessment of FedEx's UEFA Champions League sponsorship opportunity.",
      sources: [
        {
          title: "Proprietary Fan Research",
          body: "274 football fans completed the survey (1,243 questions answered in total) across 5 European markets, sharing their views on sponsorship, brand relevance and the value they expect from UEFA Champions League partners.",
        },
        {
          title: "Conversation Intelligence",
          body: "Analysis of football fan conversations across digital communities identified recurring themes, emerging behaviours and real-world reactions to sponsorship.",
        },
        {
          title: "Industry & Sponsorship Research",
          body: "Independent reports, news articles, academic studies and published case studies were reviewed to benchmark best practice and identify the drivers of long-term sponsorship effectiveness.",
        },
        {
          title: "M&C Saatchi S&E Strategic Review",
          body: "M&C Saatchi S&E's proposed strategic direction was reviewed alongside the evidence to assess where the research validates, strengthens or extends the existing recommendations.",
        },
      ],
      confidenceHeading: "Evidence confidence",
      rows: [
        {
          source: "Proprietary Fan Survey",
          confidence: "High",
          tone: "high",
          basis: "Direct primary research across five European markets with consistent findings.",
        },
        {
          source: "Industry & Sponsorship Research",
          confidence: "High",
          tone: "high",
          basis: "Multiple independent studies reached broadly consistent conclusions.",
        },
        {
          source: "M&C Saatchi S&E Strategic Review",
          confidence: "High",
          tone: "high",
          basis: "Direct review of the proposed strategy and supporting materials.",
        },
        {
          source: "Conversation Intelligence",
          confidence: "Medium",
          tone: "medium",
          basis: "Valuable qualitative insight, but based on a smaller, less representative sample and therefore used to complement rather than validate the primary findings.",
        },
      ],
      confidenceNote:
        "Confidence reflects the consistency, quality and relevance of each evidence source to the research question, rather than the volume of data alone.",
    },

    /* ── Editorial image band — proprietary research ──────────────────────── */
    {
      type: "image",
      id: "band-fans",
      src: "/reports/fedex/Map.webp",
      alt: "European map showing the five markets where the proprietary fan research was conducted",
      scrim: 0.9,
      overline: "Proprietary Fan Research",
      headline: "274 supporters. Five European markets.",
      caption: "Surveyed in their own languages across the UK, FR, DE, ES and IT.",
      height: "band",
    },

    /* ── What Football Fans Told Us ───────────────────────────────────────── */
    {
      type: "survey-evidence",
      id: "fans-told-us",
      navLabel: "Fan Evidence",
      tone: "white",
      chapter: "03",
      kicker: "Proprietary Research",
      heading: "What football fans told us",
      lede: "Proprietary research with football fans across five European markets provides the strongest evidence base for understanding how supporters want brands to show up in football.",
      sampleNote: "Combined results across the completed surveys (n = 274). Percentages are rounded and may not total 100.",
      questions: [
        {
          id: "q1",
          number: "Q1",
          displayTitle: "1. FedEx has earned credibility",
          title: "FedEx as a Champions League sponsor?",
          n: 274,
          options: [
            { label: "Strong natural fit", count: 92, pct: 34, highlight: true },
            { label: "Relevant but unclear", count: 85, pct: 31 },
            { label: "Mostly brand visibility", count: 29, pct: 11 },
            { label: "Never noticed them", count: 68, pct: 25 },
          ],
          note: "Results were broadly consistent across all five markets, with the UK and France showing the strongest perceived fit for FedEx.",
          keyInsight:
            "65% of fans consider FedEx a natural or relevant UEFA Champions League sponsor. The challenge is no longer establishing legitimacy, it is increasing the value the partnership creates for supporters.",
          strategicImplication:
            "This reinforces M&C Saatchi S&E's direction. The opportunity is to build on an established foundation rather than explain why FedEx belongs in football.",
        },
        {
          id: "q2",
          number: "Q2",
          displayTitle: "2. Fans want sponsors to give something back",
          title: "What should sponsors offer fans?",
          n: 274,
          options: [
            { label: "Exclusive access", count: 59, pct: 22 },
            { label: "Rewards and benefits", count: 100, pct: 37, highlight: true },
            { label: "Better fan experiences", count: 60, pct: 22 },
            { label: "Investment in grassroots", count: 55, pct: 20 },
          ],
          note: "Preferences were remarkably consistent across all five markets, with rewards and benefits ranking as the top priority in every market except Spain, where investment in grassroots football emerged as the strongest preference.",
          keyInsight:
            "37% of football fans want sponsors to provide rewards and benefits, making it the single most important expectation of sponsorship. Exclusive access, improved fan experiences and investment in grassroots football all ranked highly, reinforcing a consistent desire for brands to create tangible value rather than simply increase visibility.",
          strategicImplication:
            "This strongly supports M&C Saatchi S&E's recommendation to move beyond passive sponsorship. The evidence suggests fans reward brands that actively enhance their experience of football, rather than simply associating themselves with it.",
        },
        {
          id: "q3",
          number: "Q3",
          displayTitle: "3. Fans want FedEx to unlock football",
          title: "How could FedEx help fans most?",
          n: 274,
          options: [
            { label: "Access to experiences", count: 90, pct: 33, highlight: true },
            { label: "Connecting football fans", count: 67, pct: 24 },
            { label: "Exclusive football content", count: 58, pct: 21 },
            { label: "Supporting local communities", count: 59, pct: 22 },
          ],
          note: "Access to football experiences ranked as the number one opportunity in every market, suggesting a clear and consistent expectation that FedEx should enable memorable fan experiences rather than simply communicate its brand.",
          keyInsight:
            "One in three fans (33%) believe FedEx could create the greatest value by providing access to exclusive football experiences. Connecting fans, supporting local communities and exclusive content all received similar levels of support, indicating that fans want FedEx to act as an enabler of football rather than simply a sponsor of it.",
          strategicImplication:
            "The findings reinforce M&C Saatchi S&E's strategic platform by suggesting FedEx's role is strongest when it enables memorable football experiences. Rather than focusing on explaining what FedEx does, the opportunity is to demonstrate its purpose by unlocking experiences that only the brand can make possible.",
        },
      ],
    },

    /* ── The Wider Evidence Reinforces the Direction ──────────────────────── */
    {
      type: "findings-ladder",
      id: "wider-evidence",
      navLabel: "Wider Evidence",
      tone: "grey",
      chapter: "04",
      kicker: "Independent Evidence",
      heading: "The wider evidence reinforces the direction",
      lede: "Proprietary fan research provides a direct understanding of what football supporters value today. The next question was whether those preferences align with the wider evidence on sponsorship effectiveness and long-term brand growth.",
      paragraphs: [
        "Across academic research, commercial effectiveness studies and industry best practice, the findings were remarkably consistent. Although each source examined sponsorship from a different perspective, they repeatedly pointed towards the same strategic conclusion: brands create greater commercial value when they create meaningful value for fans.",
      ],
      findings: [
        {
          index: "1",
          title: "Emotion creates stronger commercial outcomes than messaging alone",
          body: "Independent research consistently shows that sponsorship is most effective when it creates positive emotional associations rather than relying solely on explicit brand communication. Experiences that supporters genuinely value are more likely to strengthen long-term memory structures, brand preference and future purchase consideration.",
          supportedBy: [
            { label: "IPA · The Long and the Short of It", url: "https://ipa.co.uk/knowledge/publications-reports/the-long-and-the-short-of-it-balancing-short-and-long-term-marketing-strategies" },
            { label: "LinkedIn/Ehrenberg-Bass · How B2B Brands Grow", url: "https://business.linkedin.com/advertise/resources/b2b-institute/how-b2b-brands-grow" },
            { label: "System1 · Advertising with Feeling", url: "https://system1group.com/methodology" },
          ],
          implication: "FedEx's capabilities should be experienced through fan value, not simply explained through sponsorship messaging.",
        },
        {
          index: "2",
          title: "Fan value drives stronger sponsorship effectiveness",
          body: "Studies across the sponsorship industry consistently demonstrate that supporters respond most positively to brands that make football more enjoyable, accessible or rewarding. The most effective sponsorships create reciprocal value, giving something back to fans rather than simply borrowing attention from the sport.",
          supportedBy: [
            { label: "Nielsen · Global Sports Report 2025", url: "https://www.nielsen.com/insights/2025/global-sports-report-2025/" },
            { label: "MKTG/dentsu · Decoding 360", url: "https://sponsorship.org/unlocking-sponsorship-success-new-study-reveals-new-ways-of-transforming-sports-sponsorships-for-maximum-impact/" },
            { label: "Channel 4 · Sponsorship Rocks", url: "https://www.channel4.com/press/news/sponsorship-rocks-fifteen-year-study-reveals-effectiveness-broadcast-sponsorship" },
          ],
          implication: "The sponsorship itself becomes more valuable when fans perceive that the brand is contributing to their experience of football.",
        },
        {
          index: "3",
          title: "Fan-first sponsorship supports long-term B2B growth",
          body: "Commercial decision-makers do not stop being football fans when they leave work. Independent evidence suggests that long-term brand preference is built well before purchase decisions are actively being considered. Sponsorship therefore has the opportunity to influence future commercial relationships by strengthening positive emotional associations among football audiences today, so fan-first activation and commercial objectives reinforce one another rather than compete for investment.",
          supportedBy: [
            { label: "LinkedIn/Ehrenberg-Bass · How B2B Brands Grow", url: "https://business.linkedin.com/advertise/resources/b2b-institute/how-b2b-brands-grow" },
            { label: "LinkedIn B2B Institute · The 95–5 Rule", url: "https://business.linkedin.com/advertise/resources/b2b-institute/b2b-research/trends/95-5-rule" },
            { label: "IPA · Five Principles of Growth in B2B Marketing" },
          ],
          implication: "Creating value for football fans can also strengthen future commercial consideration among business audiences.",
        },
        {
          index: "4",
          title: "Brand fit is only the starting point",
          body: "Category fit helps establish credibility, but rarely creates lasting differentiation on its own. Long-term commercial advantage comes from demonstrating a meaningful role within the sponsorship rather than simply occupying it. FedEx already possesses strong category credibility through logistics, movement and global connectivity; the opportunity now is to translate those strengths into experiences that supporters can recognise and remember.",
          supportedBy: [
            { label: "Kantar · Blueprint for Brand Growth", url: "https://www.kantar.com/campaigns/blueprint-for-brand-growth" },
            { label: "Channel 4 · Sponsorship Rocks", url: "https://www.channel4.com/press/news/sponsorship-rocks-fifteen-year-study-reveals-effectiveness-broadcast-sponsorship" },
            { label: "FedEx activation review" },
          ],
          implication: "Being a credible sponsor creates permission. Creating value builds preference.",
        },
      ],
    },

    /* ── Strengthening M&C Saatchi S&E's Strategic Direction ──────────────── */
    {
      type: "strategy-framework",
      id: "strategic-direction",
      navLabel: "Strategic Direction",
      tone: "navy",
      chapter: "05",
      kicker: "Strategic Direction",
      heading: "Strengthening M&C Saatchi S&E's strategic direction",
      lede: "Our research does not suggest a different strategy. Instead, it increases confidence in M&C Saatchi S&E's core recommendations whilst identifying opportunities to strengthen and broaden their application.",
      principles: [
        {
          index: "01",
          title: "Validate the Audience, Broaden the Opportunity",
          body: "M&C Saatchi S&E rightly identifies SME decision-makers as a priority audience. Our evidence suggests the opportunity is not to narrow sponsorship around this audience, but to recognise that business leaders are already part of the wider football community. By creating meaningful value for football fans at scale, FedEx can simultaneously strengthen relationships with the commercial audiences it ultimately wants to influence.",
        },
        {
          index: "02",
          title: "Move From Sponsorship to Fan Value",
          body: "The research consistently suggests supporters value brands that improve their experience of football. Rather than viewing sponsorship primarily as a communications platform, there is an opportunity to position FedEx as a brand that actively contributes to the game through access, rewards, participation and memorable experiences.",
        },
        {
          index: "03",
          title: "Build Distinctive Ownership of the Category",
          body: "FedEx already possesses strong category credibility through logistics, movement and global connectivity. The opportunity is not simply to sponsor football, but to become the brand most closely associated with making football possible. Consistently expressing that role through fan experiences could create a level of category ownership that is difficult for competitors to replicate.",
        },
        {
          index: "04",
          title: "Think Platform, Not Campaign",
          body: "The evidence consistently favours repeated, meaningful interactions over isolated moments of visibility. Rather than concentrating activity around key fixtures or finals, there is an opportunity to develop a season-long platform that continually reinforces FedEx's role through experiences that supporters recognise and anticipate.",
        },
      ],
      takeaway: {
        label: "Overall Assessment",
        text: "Taken together, the evidence does not suggest a different strategic direction, it suggests a broader ambition. M&C Saatchi S&E's strategy is strongly supported, with the greatest opportunity lying in extending its reach beyond a defined commercial audience to create meaningful value for football supporters at scale. By improving the experience of millions of fans, FedEx can strengthen its relevance with the business leaders it ultimately wants to influence, while establishing a distinctive and enduring role within European football.",
      },
    },

    /* ── Strategic Inspiration ────────────────────────────────────────────── */
    {
      type: "recommendations",
      id: "strategic-inspiration",
      navLabel: "Strategic Territories",
      tone: "white",
      chapter: "06",
      kicker: "Concept Territories for Future Exploration",
      heading: "Illustrative Strategic Territories",
      lede: "DHL's Delivering Dreams campaign shows how a logistics brand can embrace emotion whilst remaining authentic to its core purpose, translating operational strength into something emotionally meaningful for football fans.",
      paragraphs: [
        "The evidence points to a clear set of strategic principles. How those principles might best translate into creative activation is a separate question that this research is not yet able to answer with confidence.",
      ],
      caveat: "The following territories are illustrative examples of how the strategic principles identified in this research might be translated into creative activation. They should not be interpreted as recommendations. Whilst they are informed by the evidence presented in this report, they have not been tested with football supporters and therefore remain hypotheses rather than validated strategic directions.",
      recommendations: [
        {
          index: "1",
          title: "Connect Fans to Football",
          horizon: "Illustrative Territory",
          hypothesis: "A platform built on removing barriers between fans and the game, through access, participation and moments that would otherwise be impossible, is consistent with the evidence and could be explored.",
          supports: "Fans' stated desire for exclusive experiences, participation and rewards.",
        },
        {
          index: "2",
          title: "Make Every Delivery Matter",
          horizon: "Illustrative Territory",
          hypothesis: "Expressing FedEx's role in moving the game through stories about the people, places and moments that make football possible may warrant testing as an emotional-storytelling route.",
          supports: "Evidence that emotion drives stronger commercial outcomes than messaging alone.",
        },
        {
          index: "3",
          title: "Reward Football Loyalty",
          horizon: "Illustrative Territory",
          hypothesis: "A season-long platform that rewards supporters for their passion, through access, upgrades and unexpected experiences, may represent a route worth validating.",
          supports: "The survey finding that rewards and benefits were the single strongest expectation of sponsors.",
        },
        {
          index: "4",
          title: "The Unexpected Matchday",
          horizon: "Illustrative Territory",
          hypothesis: "Using FedEx's precision and speed to create spontaneous, memorable moments across the season could be explored and should be validated with supporters before any creative development.",
          supports: "Evidence that memorable sponsorships are built through experiences rather than exposure.",
        },
      ],
      phase2: {
        label: "Phase 2 Research Recommendation",
        intro: "Before selecting a creative platform, Fanometrix recommends testing multiple strategic territories with football supporters across key European markets, combining quantitative concept testing with qualitative research.",
        dimensions: [
          "Emotional appeal",
          "Perceived fan value",
          "Brand attribution",
          "Commercial relevance",
          "Differentiation",
          "Likelihood to strengthen consideration of FedEx",
        ],
        objective: "The objective is to identify which territory has the strongest evidence behind it before creative development begins.",
      },
    },

    /* ── What This Means for Football Sponsorship ─────────────────────────── */
    {
      type: "prose",
      id: "what-this-means",
      navLabel: "What This Means",
      tone: "grey",
      kicker: "What This Means for Football Sponsorship",
      paragraphs: [
        "This research reinforces a belief that sits at the heart of Fanometrix.",
        "Football supporters invest extraordinary amounts of time, emotion and money into the game, yet they are rarely asked what they value most from the brands that sponsor it.",
        "Our research suggests the strongest sponsorships are those that improve the experience of football rather than simply interrupt it. When brands create genuine value for supporters, they also create stronger emotional connections, greater commercial effectiveness and more distinctive long-term brand associations.",
        "For FedEx, this represents an opportunity to move beyond being recognised as the logistics partner of the UEFA Champions League and become a brand that actively makes football better for the people who love it.",
      ],
    },

    /* ── Closing philosophy ───────────────────────────────────────────────── */
    {
      type: "closing",
      id: "closing",
      opener: "Our research reinforces a simple belief.",
      belief: "The strongest sponsorships are those that leave football better than they found it.",
      signature: "Fanometrix",
      signatureLine: "Independent Football Intelligence",
    },
  ],
};

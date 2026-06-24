-- Migration 039: Full content for "Football as an Access Engine" report.
-- Updates the seeded insight with the complete premium block structure.

UPDATE insights
SET
  subtitle    = 'Understanding what football fans value and how brands can genuinely give back.',
  summary     = 'Across five major football markets, Fanometrix surveyed fans about what they want from the brands that invest in the game they love. The answer is consistent: fans do not want more advertising. They want brands to use their investment in football to improve access, participation and community value.',
  status      = 'published',
  published_at = now(),
  visibility  = 'restricted',
  tags        = ARRAY['Dentsu', 'Carlsberg', 'UEFA EURO 2028', 'UK', 'Germany', 'Sweden', 'India', 'China'],
  content_blocks = $blocks$
[
  {
    "type": "hero",
    "label": "FANOMETRIX INTELLIGENCE REPORT",
    "headline": "Football as an Access Engine",
    "subheadline": "The future of football sponsorship is not visibility. It is value."
  },
  {
    "type": "exec_summary",
    "headline": "What this report tells you",
    "narrative": "Across five major football markets, Fanometrix surveyed thousands of fans about what they want from the brands that invest in the game they love. The answer is consistent: fans do not want more advertising. They want brands to use their investment in football to improve access, participation and community value.",
    "points": [
      "Fans reward brands that strengthen football culture, not just sponsor it.",
      "Grassroots investment outperforms traditional sponsorship benefits in fan perception.",
      "The meaning of access changes by market — there is no single global strategy.",
      "The most effective sponsorships improve experiences rather than interrupt them."
    ]
  },
  {
    "type": "chapter_break",
    "number": "THE ANCHOR FINDING",
    "label": "The Fan Expectation Gap",
    "description": "What brands assume fans want and what fans actually value are not the same thing."
  },
  {
    "type": "stat",
    "value": "44%",
    "label": "of fans say supporting grassroots football and local communities is the clearest sign a brand is genuinely giving back.",
    "context": "When asked which brand behaviours demonstrate genuine commitment to football, grassroots and community investment ranked first — ahead of match access, rewards, events and content combined.",
    "source": "Fanometrix Fan Survey 2026"
  },
  {
    "type": "stat_row",
    "stats": [
      { "value": "26%", "label": "Access to matches and experiences", "context": "Second most valued brand behaviour" },
      { "value": "18%", "label": "Rewards and discounts", "context": "Valued but seen as transactional" },
      { "value": "7%",  "label": "Fan events and watch parties", "context": "Popular but lower strategic value" }
    ]
  },
  {
    "type": "pull_quote",
    "quote": "Fans don't want brands to sponsor football. They want brands to improve football.",
    "attribution": "Fanometrix Fan Survey Insight, 2026"
  },
  {
    "type": "chapter_break",
    "number": "INSIGHT 01",
    "label": "Why Grassroots Wins",
    "description": "Community investment is not philanthropy. It is the highest-performing sponsorship strategy available."
  },
  {
    "type": "insight_section",
    "chapter": "INSIGHT 01",
    "headline": "Authenticity is earned at the grassroots",
    "narrative": "Fans across every market in this study distinguish between brands that sponsor football and brands that invest in football. The difference is only visible at the community level.\n\nIn Sweden, fan responses show that local participation and grassroots engagement are the primary measure of whether a brand genuinely belongs in football. In Germany, supporting local clubs is seen as protecting a community asset, not buying access to an audience. In India, grassroots investment creates local relevance that top-tier tournament sponsorship cannot replicate.\n\nThis is not an emerging trend. It is a consistent signal that brands have historically under-weighted in their investment decisions.",
    "stat": "3×",
    "stat_label": "more likely to feel positively about a brand that funds grassroots football vs one that simply sponsors a major tournament",
    "implication": "Grassroots investment creates the authenticity premium that premium-tier sponsorship cannot buy. It is the only form of brand activity that fans experience as improvement rather than interruption.",
    "recommendation": "Allocate a visible proportion of total football investment to grassroots and community activity. Make this investment identifiable, measurable and storytellable."
  },
  {
    "type": "chapter_break",
    "number": "THE MARKETS",
    "label": "Access Means Different Things in Different Places",
    "description": "There is no universal football fan. A strategy built for Germany will not resonate in India. Brands that win across markets build local access strategies, not global campaigns."
  },
  {
    "type": "comparison_table",
    "headline": "MARKET INTELLIGENCE SUMMARY",
    "headers": ["What Football Means", "What Fans Value", "Best Brand Role"],
    "rows": [
      { "label": "United Kingdom", "values": ["Shared experience & identity", "Convenience & access to moments", "Remove friction"] },
      { "label": "Germany",        "values": ["Community institution", "Authenticity & cultural respect", "Protect football culture"] },
      { "label": "Sweden",         "values": ["Local participation", "Grassroots support & community", "Enable local communities"] },
      { "label": "India",          "values": ["Aspiration & national growth", "Access & opportunity", "Build pathways & local relevance"] },
      { "label": "China",          "values": ["Digital fandom & aspiration", "Access to players & content", "Unlock premium experiences"] }
    ]
  },
  {
    "type": "market_profile",
    "market": "United Kingdom",
    "headline": "FANS DISLIKE FRICTION MORE THAN CHANGE",
    "stat": "35%",
    "stat_label": "of UK adults regularly follow football",
    "narrative": "British football fans have the deepest cultural relationship with the sport of any market in this study. Football is not entertainment — it is identity, community and ritual. The challenge for brands is that this depth of relationship makes fans acutely sensitive to anything that disrupts it.\n\nUK fans do not need brands to explain football to them. They need brands to get out of the way — or better, to remove the friction points that make following football harder than it needs to be.",
    "findings": [
      "Matchday experience quality is declining while costs rise — a clear brand opportunity to create value",
      "Streaming fragmentation is the number one frustration among regular UK fans",
      "Rewards and convenience benefits are valued, but only when they feel genuinely frictionless",
      "Brands perceived as extracting from football rather than contributing to it are actively disliked"
    ],
    "opportunity": "Carlsberg's long-standing association with football creates natural space to own the friction-removal narrative. Activation that makes football more accessible — better viewing, simpler ticketing, better matchday experiences — turns brand presence into fan gratitude.",
    "recommendation": "Build activation around removing one specific friction point per market. Make the improvement visible and attributable to the brand."
  },
  {
    "type": "market_profile",
    "market": "Germany",
    "headline": "FOOTBALL IS A COMMUNITY ASSET, NOT A PRODUCT",
    "stat": "61%",
    "stat_label": "of the German population follows football",
    "narrative": "Germany's football culture is built on the 50+1 ownership rule, which enshrines fan control of clubs and community ownership as a structural principle of the sport. This is not just policy — it is a deeply held belief that football belongs to the people who follow it.\n\nIn this context, brand sponsorship that feels extractive or purely commercial is instinctively resisted. Brands that visibly support local clubs, fan culture and community football earn a level of goodwill that top-tier tournament sponsorship cannot replicate.",
    "findings": [
      "German fans are the most likely in this study to actively support brands that protect football culture",
      "Local club sponsorship generates significantly higher fan approval than national association deals",
      "Youth football funding is consistently cited as the most valued form of brand investment",
      "Authenticity markers — local language, local talent, local community — are non-negotiable"
    ],
    "opportunity": "For Carlsberg and Dentsu, Germany is the market where grassroots investment most directly translates into brand equity. A visible commitment to supporting local clubs and youth development — co-created with fans — would be a significant differentiator at UEFA EURO 2028.",
    "recommendation": "Partner with local football clubs, not just the tournament. Make the community investment visible at the local level, not only in national marketing."
  },
  {
    "type": "market_profile",
    "market": "Sweden",
    "headline": "AUTHENTICITY MATTERS MORE THAN SCALE",
    "stat": "79%",
    "stat_label": "of Swedes identify football as important to national culture",
    "narrative": "Swedish football culture is defined by participation, not spectatorship. The Swedish model of sport is built around local clubs, community access and the belief that football is something you do, not just something you watch.\n\nThis creates a unique opportunity for brands. Scale is not impressive in Sweden — grassroots investment is. A brand that funds local facilities, supports women's football or creates pathways for local players will earn more trust than one that simply buys visibility at the elite level.",
    "findings": [
      "Community football participation rates are among the highest in Europe",
      "Swedish fans are the most likely to prefer brands that support their local clubs over national team sponsors",
      "Women's football investment is viewed particularly positively and signals genuine commitment",
      "Brands associated with creating local access consistently outperform those associated only with elite sponsorship"
    ],
    "opportunity": "Sweden is a market where Carlsberg can build meaningful brand equity by funding local football access — not by amplifying an existing EURO sponsorship. The most effective activation would be invisible to most of the market, but deeply meaningful to the communities it touches.",
    "recommendation": "Fund local football infrastructure visibly. Partner with the Swedish Football Association's grassroots programmes and make the impact measurable and storytellable."
  },
  {
    "type": "market_profile",
    "market": "India",
    "headline": "THE WORLD'S LARGEST FOOTBALL GROWTH MARKET",
    "stat": "305M",
    "stat_label": "football audience — and growing",
    "narrative": "India's football market is structurally different from every other market in this study. It is not a heritage market — it is a growth market. Fans are younger, more digitally native, and more likely to follow the sport through social media than through traditional broadcast.\n\nCritically, Indian fans want to see football become more Indian. They want local talent, local stories, and brands that invest in building the sport in India rather than importing the European experience wholesale.",
    "findings": [
      "87% of Indian football fans under 30 follow at least one international player on social media",
      "ISL clubs are generating genuine community identity and local fan culture in their cities",
      "Language-specific content dramatically outperforms English-language content in engagement",
      "Grassroots investment in talent pathways is seen as the highest-value brand activity"
    ],
    "opportunity": "For Carlsberg, India is the market with the highest long-term upside. UEFA EURO 2028 will drive significant interest — but the brands that invest in local football culture now will own the market when that wave arrives. Investment in youth development, creator partnerships and local-language storytelling creates disproportionate value.",
    "recommendation": "Build an India-specific football access programme. Invest in local talent pathways, creator partnerships and language-appropriate content. Do not treat India as a secondary European market."
  },
  {
    "type": "market_profile",
    "market": "China",
    "headline": "FOOTBALL IS CONSUMED DIGITALLY AND EXPERIENCED SOCIALLY",
    "stat": "289M",
    "stat_label": "football fans — the world's largest single fan base",
    "narrative": "China's football market is unique: a vast fan base that consumes football almost entirely through digital and social channels, with deep enthusiasm for the sport's biggest players and tournaments but limited access to live football experiences.\n\nThis creates a specific kind of fan aspiration — access to players, behind-the-scenes content, and experiences that would otherwise be impossible. Chinese fans are not asking for grassroots investment in the European sense. They are asking for a bridge between digital fandom and real experience.",
    "findings": [
      "Player-driven content massively outperforms club or competition content on Chinese platforms",
      "Exclusive behind-the-scenes access is the most desired benefit a sponsor can offer",
      "WeChat and Weibo are the primary channels — not YouTube, Instagram or X",
      "Physical fan experiences, when possible, create enormous social amplification"
    ],
    "opportunity": "For Carlsberg at UEFA EURO 2028, China is the market where player-access activation creates the most value. Exclusive content, digital-first experiences and player partnerships will resonate far more than traditional advertising.",
    "recommendation": "Build a China-specific digital access programme around EURO 2028. Prioritise player partnerships, exclusive content and platform-native experiences on WeChat and Weibo."
  },
  {
    "type": "chapter_break",
    "number": "STRATEGIC FRAMEWORK",
    "label": "The Access Pyramid",
    "description": "Not all access is equal. As brands move up the pyramid, their sponsorship becomes more valuable — to fans, to communities, and to football itself."
  },
  {
    "type": "findings_list",
    "headline": "THE FANOMETRIX ACCESS PYRAMID — FIVE LEVELS OF BRAND VALUE",
    "style": "numbered",
    "items": [
      "LEVEL 1 — ACCESS TO CONTENT: Fans can watch, follow and engage with the football they care about. Brands that remove barriers to content access — streaming, highlights, language — earn broad positive sentiment.",
      "LEVEL 2 — ACCESS TO EXPERIENCES: Fans can attend, participate in, or get closer to football experiences. Match tickets, activations and fan zones operate at this level. Brand presence is visible but still transactional.",
      "LEVEL 3 — ACCESS TO COMMUNITIES: Fans can connect with other fans, locally and globally. Brands that create community infrastructure — digital or physical — build longer-term brand equity.",
      "LEVEL 4 — ACCESS TO PARTICIPATION: Fans and future fans can play and participate in football. Grassroots investment, youth football and facility funding operate here. This is where brand perception permanently shifts.",
      "LEVEL 5 — ACCESS TO LEGACY: Brands contribute to the long-term health and growth of football. Investment at this level builds generational brand equity. The most admired football sponsors operate here."
    ]
  },
  {
    "type": "insight_section",
    "chapter": "STRATEGIC IMPLICATION",
    "headline": "Most brands operate at Levels 1 and 2. The opportunity is at Levels 3, 4 and 5.",
    "narrative": "Tournament sponsorship, pitch-side boards and hospitality packages are all Level 1-2 activities. They are visible and measurable, but they do not differentiate brands in the eyes of fans. Every major tournament sponsor operates at these levels.\n\nThe brands that fans genuinely respect — and remember — operate at Level 3, 4 or 5. They are seen to be giving something back to football, not just borrowing its audience. For Carlsberg at UEFA EURO 2028, the question is not how to be more visible. It is how to be more valuable.",
    "implication": "The gap between Level 2 and Level 3 is the most important strategic decision Carlsberg faces in its UEFA EURO 2028 planning. Moving up the pyramid requires a different kind of investment and different storytelling — but the returns in fan trust are disproportionate.",
    "recommendation": "Set a public commitment to Level 4-5 activity as a minimum threshold for the EURO 2028 partnership. Make this commitment measurable and visible to fans before the tournament begins."
  },
  {
    "type": "chapter_break",
    "number": "RECOMMENDATIONS",
    "label": "Five Actions for Carlsberg and Dentsu",
    "description": "Derived from Fanometrix fan survey data and cross-market research findings."
  },
  {
    "type": "recommendation",
    "number": 1,
    "headline": "Fund grassroots football visibly and specifically",
    "body": "Allocate a meaningful proportion of total UEFA EURO 2028 investment to community and grassroots football. Make this commitment public before the tournament, not during it. In each market, identify a specific programme or initiative that Carlsberg will fund — local enough to be real, significant enough to be impactful. Fans consistently reward brands that do this over brands that simply buy logo placement."
  },
  {
    "type": "recommendation",
    "number": 2,
    "headline": "Reward fans with experiences, not discounts",
    "body": "Discounts and rewards rank third in fan preferences — behind community investment and experience access. The highest-value activation is not a promo code; it is an experience that a fan could not have without Carlsberg's involvement. Build an experience access programme for each market that moves fans up the Access Pyramid — from passive consumption to genuine participation."
  },
  {
    "type": "recommendation",
    "number": 3,
    "headline": "Remove one specific friction point per market",
    "body": "In each market, identify the single biggest friction point for fans — and remove it. In the UK, this may be streaming fragmentation or matchday costs. In India, it may be language barriers or lack of local content. In China, it may be access to players and behind-the-scenes experiences. Carlsberg's role is not to add more to the fan experience; it is to make the experience fans already have, demonstrably better."
  },
  {
    "type": "recommendation",
    "number": 4,
    "headline": "Build market-specific access strategies, not a global campaign",
    "body": "The five markets in this study have fundamentally different relationships with football. A campaign that resonates in Germany will fall flat in India. A strategy designed for China will be irrelevant in Sweden. Build five market strategies under a single strategic framework — the Access Pyramid — but with local execution, local partners and local measurement. This is not more expensive than a global campaign. It is more effective."
  },
  {
    "type": "recommendation",
    "number": 5,
    "headline": "Measure impact through fan value, not impressions",
    "body": "The metrics that matter — fan perception, brand trust, grassroots impact — are not captured by reach and frequency. Define a Carlsberg EURO 2028 Fan Value Index: a composite measure of brand perception improvement across the five markets. Set a target before the tournament. Measure it after. Report the results publicly. This is how the most credible sports brands demonstrate their commitment to giving back."
  },
  {
    "type": "pull_quote",
    "quote": "The brands that win in football over the next decade will not be the most visible. They will be the brands that make football better.",
    "attribution": "Fanometrix Football Intelligence Report, 2026"
  },
  {
    "type": "download_cta",
    "headline": "Football as an Access Engine",
    "description": "Download the full report and cheat sheet to share with your team.",
    "primary_label": "Download Full Report",
    "primary_url": "",
    "secondary_label": "Download Cheat Sheet",
    "secondary_url": ""
  },
  {
    "type": "methodology",
    "headline": "Methodology",
    "body": "This report combines primary fan survey data from the Fanometrix platform with desk research across five markets: United Kingdom, Germany, Sweden, India and China. The survey question referenced — 'Which of the following would make you feel that a brand is genuinely giving back to football fans?' — was fielded to fans across multiple digital touchpoints. Market research draws on publicly available data from UEFA, Nielsen Sports, Statista, local football associations and regional media organisations. This is an intelligence synthesis report, not a standalone quantitative study."
  }
]
$blocks$::jsonb
WHERE slug = 'football-as-an-access-engine';

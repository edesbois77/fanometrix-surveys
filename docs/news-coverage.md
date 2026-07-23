# News Coverage

News Coverage is an evidence acquisition connector, not a new methodology. It
plugs into the existing lifecycle as the **News Coverage research method** the
Research Design already knew how to recommend:

```
Evidence Strategy → News task → Collection → Normalisation → Classification
                  → Evidence Review → Analysis
```

Nothing about the Evidence Strategy architecture changed to accommodate it. A
News task is a `social_searches` row like a Conversation Search, so it inherits
the append-only base, the observation ledger, the approval watermark and the
delta-review loop without any of them being rebuilt. What distinguishes it is the
**medium** marker in `search_strategy` (`lib/news-task.ts`).

---

## 1. Acquisition, and why these sources

The constraints were: no new paid subscription, no unauthorised scraping, public
feeds or legitimate public endpoints, a recorded original publisher and URL, and
operational within days. Four routes were assessed against live traffic.

### Publisher feeds — PRIMARY

Sixteen publisher RSS/Atom feeds, verified live and listed in
`lib/news-sources.ts` with their tier and country. A feed is published *by* the
outlet *for* machine consumption, which settles both the licensing and the
scraping question, and it carries what provenance needs: canonical article URL,
publisher, byline (`dc:creator`), publication date, a permitted summary, and
often a category list and an image.

**Nothing fetches an article body.** The excerpt stored is the one the publisher
chose to syndicate in its own feed.

Feeds are grouped into packs so a task selects a purpose, not a list of URLs:

| Pack | Publishers | Default |
|---|---|---|
| `sponsorship_business` | SportsPro, SportBusiness, Sportcal, Sportico, Front Office Sports, Sport Industry Group, iSportConnect, European Sponsorship Association, Sponsorship.com, SportsMint | on |
| `marketing_trade` | Campaign, Marketing Dive, Adweek, Digiday | on |
| `football_media` | The Guardian, BBC Sport | off |

Football desks are off by default: they are mostly match coverage, and admitting
them would bury sponsorship evidence under fixtures.

**The structural limitation.** A feed is the latest N items and cannot be
queried. This route therefore builds a corpus **forwards from today** and cannot
reach back. Because feeds cannot be searched, the connector does the searching
locally: every item is matched against the task's Search Strategy
(`matchesStrategy`) before it is admitted. That pre-filter is deterministic and
cheap; it decides what is worth judging, never what is relevant.

### Search index (GDELT) — SECONDARY, BEST EFFORT

The one keyless route that can be queried **retrospectively**, which is the one
thing feeds cannot do. Its limitations are declared per item rather than
discovered later:

- it returns article metadata only, so `content` is a headline with no summary
  and no byline (`metadata.headline_only`);
- it identifies a domain, not a masthead;
- it is rate limited to one request per five seconds and, under load, simply
  fails to connect.

Measured over 16 consecutive calls during development, 15 returned HTTP 429 or a
connect timeout. A News run therefore treats it as best effort: it retries with
pacing, and on failure warns and continues on the feeds it already has, rather
than failing the run.

Two bugs were found and fixed here by measurement:

1. **Under-anchored queries.** OR-ing every context term together turned
   `FedEx (… OR "sponsorship" OR "football")` into "FedEx and any sport", which
   returned FedEx Cup golf coverage. Only specific terms — multi-word phrases and
   named competitions/clubs/organisations — now anchor the query.
2. **Short phrases void the whole query.** A three-letter alias (`"UCL"`) made the
   index return *"The specified phrase is too short."* and reject the entire
   request. Terms under five characters are now dropped from the index query
   (they are still used for local matching, where they are perfectly good).

### Google News RSS — REJECTED

By far the best retrospective recall of any keyless route (46 on-topic results
for a FedEx/UCL query, with publisher attribution in `<source url=…>`), and it is
**not used at any setting**: `https://news.google.com/robots.txt` disallows
`/rss/search` for `User-agent: *`. Reading it programmatically is exactly the
unauthorised access this connector is required to avoid. A second, independent
problem confirmed live: its `<link>` is a Google-encoded redirect that does not
resolve server-side, so it could not satisfy "record the original URL" either.

### Paid news APIs — REJECTED

NewsAPI, Bing News, GNews and Meltwater are excluded by the no-new-paid-
subscription constraint.

---

## 2. Research safeguards

**News is not fan conversation.** An article tells you what a publication
printed. It never tells you what an audience feels. The connector, the
classifier, the evidence card and the synthesis prompt all enforce that
separately, because a single point of enforcement would eventually be bypassed.

Every article is classified by `lib/news-classify.ts` (prompt in
`lib/news-taxonomy.ts`) and carries:

| Field | What it records |
|---|---|
| `source_type` | independent reporting · brand announcement · rights holder announcement · press release · expert commentary · opinion · trade analysis · research or data · reported fan reaction · sponsored content · unclear |
| `attribution` | who is making the central claim |
| `claim_basis` | independently reported · attributed claim · unsupported · no outcome claimed |
| `fan_evidence` | none · reported · quoted |
| `outcome_claimed` | any reported effect, as the article states it |

`NEWS_SOURCE_TYPE_ATTRIBUTION_RULE` states what Analysis may do with each kind,
and those rules are injected into the aspect-synthesis prompt for exactly the
source types present. The rules that matter most:

- A press release saying an activation was successful is a **claim**, not proof.
  Write "X said its activation…", never "X's activation succeeded."
- The same story across eight outlets is **distribution, not corroboration**.
- Where no article carries fan evidence, synthesis is told in as many words that
  it **cannot say anything about what fans think** on the strength of it.

Three further guards sit outside the prompt:

- **Sentiment is coverage tone.** Articles are excluded from the collection run's
  sentiment roll-up, which the workspace renders as "% positive" — counting
  favourable press there would present it as fan approval. The evidence card
  labels it "Positive coverage", and synthesis receives `sentiment: null` for
  articles entirely.
- **No fallback guessing.** Where the conversation classifier degrades to keyword
  heuristics, the news classifier stores the article **unjudged**: relevance
  `null` (nothing hidden on a guess) and source type `unclear` (nothing asserted
  on a guess). There is no rule-based way to tell a press release from reporting.
- **The card does not look like a quote.** An article renders as masthead,
  headline and standfirst with no quotation mark, with its source type on the
  face of the card and an explicit "No fan evidence" chip where that applies.

---

## 3. Relevance

The same no-speculative-bridging principle as Conversation Intelligence, with
role tests written for news (`NEWS_ROLE_RELEVANCE_RULE`):

- **Direct** must materially concern the subject's own sponsorship or activation.
  A sponsor-list mention or a fixture report is not material: *if the article
  would say substantially the same thing with the subject removed, it is not
  direct evidence.*
- **Comparative** must concern a **named comparator** and that comparator's
  sponsorship. The subject need not appear.
- **Strategic** must materially address sponsorship practice, audience value or
  activation effectiveness. **Reporting a deal is not strategic evidence** — the
  article has to say something about how sponsorship works or what worked and why.

A promotional press release can still be *relevant*: it evidences what the brand
claims. Relevance is scored on the role's test, and `source_type` carries the
caveat. Relevance is never quietly downgraded as a substitute for flagging the
source.

---

## 4. Syndication deduplication

`lib/news-syndication.ts`. Announcements are distributed, not discovered: one
brand statement is reprinted across trade titles within hours, and counting each
copy would manufacture corroboration out of a single claim.

Articles are clustered on a **title fingerprint** (publisher suffix stripped,
punctuation and stopwords removed, tokens sorted and deduped) within a five-day
publication window. One representative is kept, chosen deliberately:

1. full publisher metadata beats a search-index stub;
2. the more independent publisher tier wins;
3. the **earliest** publication wins — the first outlet is nearest the source;
4. then the URL, so the outcome is stable across runs.

The copies are recorded on the representative as `syndicated_copies`, so pickup
is preserved as a fact about reach without becoming a second piece of evidence.

Cross-run, `syndication_key` is passed back into the connector via
`CollectContext.knownSyndicationKeys`, so another outlet's copy of a story
already held is not re-imported weeks later as fresh evidence. URL
canonicalisation (`canonicaliseUrl`) strips tracking parameters, so the same
article reached three ways is one article and one stable `external_id`.

---

## 5. Generation from the Evidence Strategy

`lib/research-sources/generate-news-tasks-from-design.ts`, the sibling of the
conversation generator, reusing the same plan / skip / upsert contract. Anchors
are **grounded, never invented**:

- **direct** → the project's own brand organisation. A recorded fact, not a name
  parsed out of prose. No brand recorded → skipped, with that reason.
- **comparative** → a comparator the design **declared and justified**. An
  undeclared comparator cannot be researched.
- **strategic** → no entity anchor.

The Search Strategist compiles the retrieval terms from the requirement's own
words, and the anchor is then **overwritten** with the grounded value, so the
strategist can enrich a task but can never change what it is about.

Generation is idempotent: each task records a `design_origin` with a `news:`-
namespaced `origin_key`, so re-running after a strategy update reconciles and
updates rather than duplicating, and a News task can never reconcile onto a
Conversation Search born of the same requirement.

---

## 5a. Historical backfill (assessed 2026-07-23, NOT built)

RSS remains the **ongoing, append-only monitoring route**. A one-off backfill
needs different endpoints, and which ones a publisher offers *and permits* is
recorded per provider in `NEWS_FEEDS[].historical` (`lib/news-sources.ts`), with
the measured response and the robots.txt verdict alongside each.

Three routes were measured. All are published endpoints; none scrapes an article
body.

| Route | Template | Reach | Notes |
|---|---|---|---|
| **Search feed** | `/?s={q}&feed=rss2` | months to years | Query-driven, so the only route that can be aimed at a research topic. Permitted on 9 providers. |
| **Tag / category feed** | `/tag/{term}/feed/` | **years** | Highest precision. SportsPro's brand tags reach 2021. **Does not paginate** — `?paged=2` returns the same items — so each tag yields a fixed 8–20 articles. |
| **Paged main feed** | `/feed/?paged={n}` | weeks | Cheap but undirected; walked back to 2026-03-11 on SportBusiness. |

**Blocked, and must not be used:** `sportcal` (`Disallow: /?s=*`) and `sportico`
(`Disallow: /?s=`) both disallow the search feed for `User-agent: *`, even though
both return results. They are listed with `permitted: false` so the route is
never re-proposed. `campaign-uk` and `marketing-dive` return HTTP 403 to any
non-browser client and have no historical route at all.

**Measured yield** over 1 April – 23 July 2026: 2,015 raw items from 151
requests, 1,238 in window, 1,016 unique after canonicalisation, 0 merged as
syndicated. Date coverage was continuous across the whole window.

## 6. Known limitations

1. **Retrospective, entity-specific coverage is not reliably obtainable.** Feeds
   cannot reach back; the search index can but is unreliable. A brand-new News
   task on a historical sponsorship may legitimately return nothing on its first
   run and fill in over subsequent weeks.
2. **Feeds are not incremental.** A task running less often than a busy feed
   rolls over can miss items. Declared as `incremental: false`.
3. **Market is the publisher's country, not the story's market.** It is the only
   market fact a feed establishes. `supportsRegionFilter` is `false` for that
   reason.
4. **Search-index items are headline-only** — no summary, no byline, a domain
   rather than a masthead. Flagged per item as `headline_only`.
5. **`vw_conversation_search_stats` still aggregates article sentiment** into its
   positive/neutral/negative columns. The run ledger and the News surfaces avoid
   it, but a view change (and therefore a migration) would be needed to remove it
   at source.
6. **The medium marker lives in `search_strategy` jsonb**, not a column. That is a
   deliberate trade to avoid a migration against a hand-migrated production
   database; a first-class column is the right move if News is ever queried at
   scale.

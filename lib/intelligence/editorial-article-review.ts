// Deterministic, read-only Review Prompt layer for the Editorial Article —
// the same philosophy and the same detectors as the Executive Report and
// Full Research Report review aids, applied to the Article's independently
// generated editorial prose. It ONLY surfaces passages a human may want to
// inspect: it never rewrites, blocks, regenerates or stores anything, and
// the Article is completely unchanged by it. A flag means "look at this."
//
// This matters specifically for the Article because it is the one output
// that writes ORIGINAL prose (re-narrating the approved reports as
// journalism) rather than copying validated atoms — so it is the one place a
// corrected upstream framing (e.g. a false brand-vs-sponsorship "dichotomy"
// the Executive Report and Full Research Report reviews already resolved as
// different constructs) can quietly reappear in new wording. These prompts
// let a reviewer catch and hand-correct that before approval.
//
// All the sentence-level detectors are the shared, report-agnostic engine in
// review-detectors.ts — reused, not duplicated. This file adds only what is
// SPECIFIC to the Article: which fields to scan, and a section-level
// construct-mismatch check (a section FRAMED as a contradiction across its
// heading and body, which the sentence-level scan misses when the cues are
// split between the subheading and separate body sentences).
//
// Pure and framework-free so it runs at render time from the Article object
// the page already holds. The evidence pool for the "claim may exceed
// evidence" percentage check is passed in by the page (built from the
// approved Executive Report's own claims plus the Article's charts), since —
// unlike the Full Research Report — the Article does not itself carry the
// evidence text its statistics trace to; when no pool is supplied that one
// check is simply skipped rather than flagging every figure.
import { scanProse, framesConstructContradiction, REVIEW_FLAG_CATEGORY_LABEL } from "@/lib/intelligence/review-detectors";
import type { ReviewFlag, ReviewFlagCategory } from "@/lib/intelligence/review-detectors";
import type { EditorialArticle } from "@/lib/intelligence/analysts/analyseEditorialArticle";

export { REVIEW_FLAG_CATEGORY_LABEL };
export type { ReviewFlag, ReviewFlagCategory };

export function flagArticleReviewConcerns(article: EditorialArticle, evidencePool = ""): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  const pool = evidencePool.toLowerCase();

  scanProse("Headline", article.headline, undefined, pool, out);
  scanProse("Standfirst", article.standfirst, undefined, pool, out);
  if (article.introduction) scanProse("Introduction", article.introduction, undefined, pool, out);
  (article.key_takeaways ?? []).forEach((t, i) => scanProse(`Key takeaway ${i + 1}`, t, undefined, pool, out));

  article.sections.forEach((s, i) => {
    const label = `Section ${i + 1}: ${s.subheading}`;
    // Scan the subheading and body for every sentence-level concern.
    scanProse(label, `${s.subheading}. ${s.body}`, undefined, pool, out);
    // Section-level construct-mismatch: catch a section FRAMED as a
    // contradiction across its heading and body (e.g. a "Dichotomy of Brand
    // Sentiment…" subheading over a body contrasting brand dislike with
    // sponsorship sentiment) that the sentence-level scan misses when the
    // three cues are split across separate sentences. Only added when the
    // sentence-level scan didn't already flag this section, so it never
    // double-reports.
    const already = out.some(f => f.section === label && f.category === "false_contradiction");
    if (!already && framesConstructContradiction(`${s.subheading}. ${s.body}`)) {
      out.push({
        section: label,
        category: "false_contradiction",
        passage: s.subheading,
        why: "This section frames a measure of attitude toward the brand (e.g. liking/disliking it) and a measure of sentiment about an activity (e.g. its sponsorship) as a contradiction, dichotomy or divergence. Confirm both really measure the same construct and population before presenting them as opposing — different constructs can both hold at once and should be framed as coexisting, not conflicting.",
      });
    }
  });

  if (article.conclusion) scanProse("Conclusion", article.conclusion, undefined, pool, out);

  return out;
}

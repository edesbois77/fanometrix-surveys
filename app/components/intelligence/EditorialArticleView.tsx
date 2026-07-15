// The polished, read-only Editorial Article renderer — deliberately a
// separate component from the admin page (../../[id]/reports/article/page.tsx)
// so it has no knowledge of edit state, review status or workspace chrome.
// It takes a validated EditorialArticle and renders it the way a genuine
// published research article reads: flowing typography, no cards, charts
// and images embedded inline. Kept standalone specifically so a future
// public route (e.g. a Fanometrix Insights page) can reuse this exact
// renderer unchanged — the admin page is chrome wrapped around it, not the
// article itself. Also what Export PDF (see the page's own "Export PDF"
// button) prints via window.print() — nothing in this component is
// specific to on-screen viewing, print:* variants throughout are this
// same markup adapting for paper, not a second render path.
import { ArticleChart } from "@/app/components/intelligence/ArticleChart";
import { GOLD } from "@/lib/intelligence/theme";
import type { EditorialArticle } from "@/lib/intelligence/analysts/analyseEditorialArticle";
import type { ReportImage } from "@/app/components/intelligence/ReportImageAsset";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ~225 wpm is the commonly-cited average adult silent reading speed —
// good enough for a byline estimate, not a precision claim.
function estimateReadingTime(article: EditorialArticle): number {
  const parts = [
    article.standfirst,
    article.introduction ?? "",
    ...(article.key_takeaways ?? []),
    ...article.sections.flatMap(s => [s.subheading, s.body]),
    article.conclusion ?? "",
  ];
  const words = parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

/** Caption + credit, editorial figure style — shared by the hero image and
 * every section image, so the two never drift into different treatments. */
function ImageFigure({ image, className = "" }: { image: ReportImage; className?: string }) {
  return (
    <figure className={`print:break-inside-avoid ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a static local asset */}
      <img src={image.url} alt={image.caption ?? ""} className="w-full rounded-lg" />
      {(image.caption || image.credit) && (
        <figcaption className="text-xs text-gray-400 mt-2 italic">
          {image.caption}
          {image.caption && image.credit && ", "}
          {image.credit}
        </figcaption>
      )}
    </figure>
  );
}

export function EditorialArticleView({ article, publishedAt }: {
  article: EditorialArticle;
  /** The row's actual publish timestamp, if published — falls back to
   * generation time for a draft/approved article being previewed, so the
   * byline always has a real date rather than showing nothing. */
  publishedAt?: string | null;
}) {
  const displayDate = publishedAt ?? article.generated_at;

  return (
    <article className="max-w-2xl mx-auto">
      <div className="print:break-inside-avoid">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight" style={{ textWrap: "balance" }}>
          {article.headline}
        </h1>
        <p className="text-xl text-gray-600 leading-relaxed mt-4" style={{ textWrap: "balance" }}>
          {article.standfirst}
        </p>

        {/* Metadata line, with the simulated-research disclosure folded in
            as a clearly-marked tag rather than a separate floating notice
            above the headline — still unmissable, just part of the
            article's own byline rather than sitting outside it. */}
        <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide mt-5 flex-wrap">
          <span className="font-semibold text-gray-500">Fanometrix Research</span>
          <span aria-hidden>·</span>
          <span>{formatDate(displayDate)}</span>
          <span aria-hidden>·</span>
          <span>{estimateReadingTime(article)} min read</span>
          {article.synthetic_notice && (
            <>
              <span aria-hidden>·</span>
              <span className="px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal"
                style={{ background: "rgba(215,184,122,0.18)", color: "#8A6D2F" }}>
                Simulated Research
              </span>
            </>
          )}
        </div>
        {article.synthetic_notice && (
          <p className="text-xs text-gray-400 italic mt-2 normal-case tracking-normal">{article.synthetic_notice}</p>
        )}
      </div>

      {article.hero_image && <ImageFigure image={article.hero_image} className="mt-8" />}

      {article.key_takeaways && article.key_takeaways.length > 0 && (
        <div className="mt-8 print:break-inside-avoid">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">At a Glance</p>
          <ul className="space-y-1.5 border-l-2 pl-4" style={{ borderColor: GOLD }}>
            {article.key_takeaways.map((k, i) => (
              <li key={i} className="text-sm text-gray-700 leading-snug">{k}</li>
            ))}
          </ul>
        </div>
      )}

      {article.introduction && (
        <p className="text-lg text-gray-800 leading-relaxed mt-8">{article.introduction}</p>
      )}

      <div className="mt-8">
        {article.sections.map((s, i) => {
          const chart = article.charts.find(c => c.id === s.chart_id);
          return (
            <div key={i} className="mb-8 last:mb-0">
              {s.subheading && (
                <h2 className="text-xl font-bold text-gray-900 mb-3 print:break-after-avoid">{s.subheading}</h2>
              )}
              {s.body.split(/\n\s*\n/).map((para, pi) => (
                <p key={pi} className="text-base text-gray-800 leading-relaxed mb-4 last:mb-0">{para}</p>
              ))}
              {s.image && <ImageFigure image={s.image} className="my-6" />}
              {chart && <ArticleChart spec={chart} />}
            </div>
          );
        })}
      </div>

      {article.conclusion && (
        <div className="print:break-inside-avoid">
          <div className="h-px bg-gray-100 my-8" />
          <p className="text-base text-gray-800 leading-relaxed">{article.conclusion}</p>
        </div>
      )}

      <div className="border-t border-gray-100 mt-12 pt-5 print:mt-6 print:break-inside-avoid">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sources &amp; Methodology</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          {article.research_basis.sources.map(s => s.label).join(", ")}
          {article.research_basis.date_range && (
            <> · {formatDate(article.research_basis.date_range.from)}–{formatDate(article.research_basis.date_range.to)}</>
          )}
          {" · "}{article.research_basis.methodology_note}
        </p>
      </div>

      {/* Print-only footer — a reliable, always-rendered piece of content
          rather than a CSS @page margin-box, since Chrome's print-to-PDF
          doesn't support @page margin-box page numbers/running footers
          without the browser's own "Headers and footers" print-dialog
          toggle (which the user controls, outside this page's reach). */}
      <div className="hidden print:block border-t border-gray-100 mt-8 pt-3 text-center">
        <p className="text-[10px] text-gray-300 tracking-wide">Fanometrix Research</p>
      </div>
    </article>
  );
}

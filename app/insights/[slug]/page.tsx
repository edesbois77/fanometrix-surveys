"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import type { Insight, InsightBlock, InsightContentType } from "@/lib/types";

const TYPE_LABELS: Record<InsightContentType, string> = {
  report:              "Report",
  market_analysis:     "Market Analysis",
  survey_results:      "Survey Results",
  social_intelligence: "Social Intelligence",
  cheat_sheet:         "Cheat Sheet",
  dashboard:           "Dashboard",
  download:            "Download",
};

function ContentBlock({ block }: { block: InsightBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">{block.content}</h2>;
    case "subheading":
      return <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">{block.content}</h3>;
    case "paragraph":
      return <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-wrap">{block.content}</p>;
    case "quote":
      return (
        <blockquote className="border-l-4 border-[#D7B87A] pl-4 py-1 my-5 bg-amber-50 rounded-r-lg">
          <p className="text-sm text-gray-700 italic leading-relaxed">{block.content}</p>
        </blockquote>
      );
    case "divider":
      return <hr className="border-gray-200 my-6" />;
    case "image":
      return (
        <div className="my-5 rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url ?? ""} alt={block.alt ?? ""} className="w-full" />
          {block.alt && <p className="text-xs text-gray-400 mt-1.5">{block.alt}</p>}
        </div>
      );
    default:
      return null;
  }
}

export default function InsightDetailPage() {
  const params     = useParams<{ slug: string }>();
  const router     = useRouter();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!params?.slug) return;
    fetch(`/api/insights/${params.slug}`)
      .then(r => {
        if (r.status === 404) { setError(true); return null; }
        return r.json();
      })
      .then(d => {
        if (d) setInsight(d.data ?? null);
      })
      .finally(() => setLoading(false));
  }, [params?.slug]);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">

        {/* Back link */}
        <Link href="/insights" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
          ← Back to Insights
        </Link>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/4" />
            <div className="h-8 bg-gray-100 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
            <div className="h-40 bg-gray-100 rounded mt-8" />
          </div>
        ) : error || !insight ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="text-4xl mb-4">◎</div>
            <p className="text-base font-semibold text-gray-700 mb-1">Insight not found</p>
            <p className="text-sm text-gray-400 mb-5">This insight may have been removed or you may not have access to it.</p>
            <button onClick={() => router.push("/insights")}
              className="text-sm font-semibold px-5 py-2.5 rounded-lg"
              style={{ background: "#0B1929", color: "#D7B87A" }}>
              Back to Insights
            </button>
          </div>
        ) : (
          <>
            {/* Featured image */}
            {insight.featured_image_url && (
              <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={insight.featured_image_url} alt={insight.title} className="w-full max-h-72 object-cover" />
              </div>
            )}

            {/* Meta bar */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-[#D7B87A]">
                {TYPE_LABELS[insight.content_type]}
              </span>
              {insight.published_at && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">
                    {new Date(insight.published_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </span>
                </>
              )}
            </div>

            {/* Title + subtitle */}
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-2">
              {insight.title}
            </h1>
            {insight.subtitle && (
              <p className="text-base text-gray-500 leading-relaxed mb-6">{insight.subtitle}</p>
            )}

            {/* Summary callout */}
            {insight.summary && (
              <div className="bg-[#0B1929]/4 border border-[#0B1929]/10 rounded-xl px-5 py-4 mb-8">
                <p className="text-sm text-gray-700 leading-relaxed font-medium">{insight.summary}</p>
              </div>
            )}

            {/* Download CTA */}
            {insight.download_url && (
              <a href={insight.download_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg mb-8 transition-opacity hover:opacity-80"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                ⬇ Download {TYPE_LABELS[insight.content_type]}
              </a>
            )}

            {/* Content blocks */}
            {(insight.content_blocks ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 md:p-8">
                {insight.content_blocks.map((block, idx) => (
                  <ContentBlock key={idx} block={block} />
                ))}
              </div>
            )}

            {/* Footer tags (for admin reference) */}
            {insight.tags && insight.tags.length > 0 && (
              <div className="mt-8 pt-5 border-t border-gray-100 flex flex-wrap gap-2">
                {insight.tags.map(t => (
                  <span key={t} className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

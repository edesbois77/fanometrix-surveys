"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import type { InsightReport } from "@/app/api/social/insights/route";

type Search = { id: string; name: string; entity_type: string; research_goal: string };

// ── PowerPoint export (client-side via pptxgenjs) ────────────────────────────
async function exportPowerPoint(search: Search, report: InsightReport) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE";
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.33, height: 7.5 });

  const NAVY = "0B1929", GOLD = "D7B87A", WHITE = "FFFFFF", GREY = "6B7280", LGREY = "F3F4F6";
  const addSlide = () => pptx.addSlide();

  // ── Slide 1: Cover ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.2, w: "100%", h: 0.04, fill: { color: GOLD } });
    s.addText("FANOMETRIX", { x: 0.5, y: 0.5, w: 12, fontSize: 11, color: GOLD, bold: true, charSpacing: 4 });
    s.addText("Fan Conversation Intelligence", { x: 0.5, y: 0.85, w: 12, fontSize: 10, color: WHITE, transparency: 40 });
    s.addText(report.headline, { x: 0.5, y: 2.2, w: 12, fontSize: 32, color: WHITE, bold: true, breakLine: true });
    s.addText(`${search.name}  ·  ${search.entity_type}  ·  ${search.research_goal}`, { x: 0.5, y: 5.5, w: 12, fontSize: 12, color: GOLD });
    s.addText(`Based on ${report.mention_count.toLocaleString()} classified mentions  ·  Generated ${new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      { x: 0.5, y: 6.8, w: 12, fontSize: 9, color: WHITE, transparency: 50 });
  }

  // ── Slide 2: Executive Summary ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: NAVY } });
    s.addText("Executive Summary", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 0.04, h: 4.5, fill: { color: GOLD } });
    s.addText(report.executive_summary, { x: 0.75, y: 1.4, w: 11.5, fontSize: 16, color: NAVY, breakLine: true, valign: "top" });
  }

  // ── Slide 3: Positive Drivers ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "22C55E" } });
    s.addText("What's Working — Key Positive Drivers", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
    report.positive_drivers.forEach((d, i) => {
      const y = 1.4 + i * 1.0;
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: y + 0.1, w: 0.3, h: 0.3, fill: { color: "22C55E" } });
      s.addText(String(i + 1), { x: 0.5, y: y + 0.05, w: 0.3, h: 0.35, fontSize: 11, color: WHITE, bold: true, align: "center" });
      s.addText(d, { x: 1.0, y, w: 11.5, fontSize: 13, color: NAVY, breakLine: true });
    });
  }

  // ── Slide 4: Key Concerns ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "EF4444" } });
    s.addText("Key Concerns — Risks to Monitor", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
    report.key_concerns.forEach((c, i) => {
      const y = 1.4 + i * 1.0;
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: y + 0.1, w: 0.3, h: 0.3, fill: { color: "EF4444" } });
      s.addText(String(i + 1), { x: 0.5, y: y + 0.05, w: 0.3, h: 0.35, fontSize: 11, color: WHITE, bold: true, align: "center" });
      s.addText(c, { x: 1.0, y, w: 11.5, fontSize: 13, color: NAVY, breakLine: true });
    });
  }

  // ── Slide 5: Market Differences ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "5B6CFA" } });
    s.addText("Market Intelligence — Key Differences", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
    report.market_differences.forEach((md, i) => {
      const y = 1.4 + i * 1.2;
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 11.5, h: 1.0, fill: { color: LGREY }, line: { color: "E5E7EB", width: 0.5 } });
      s.addText(md.markets.join(" vs "), { x: 0.7, y: y + 0.1, w: 3, fontSize: 10, color: "5B6CFA", bold: true });
      s.addText(md.finding, { x: 0.7, y: y + 0.35, w: 11, fontSize: 12, color: NAVY, breakLine: true });
    });
  }

  // ── Slide 6: Recommended Actions ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: GOLD } });
    s.addText("Recommended Actions", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: NAVY, bold: true });
    report.recommended_actions.forEach((a, i) => {
      const y = 1.4 + i * 1.3;
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 11.5, h: 1.15, fill: { color: LGREY } });
      s.addText(a.action, { x: 0.7, y: y + 0.1, w: 11, fontSize: 13, color: NAVY, bold: true, breakLine: true });
      s.addText(a.rationale, { x: 0.7, y: y + 0.6, w: 11, fontSize: 11, color: GREY, breakLine: true });
    });
  }

  // ── Slide 7: Footer ──
  {
    const s = addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addText("Fanometrix", { x: 0.5, y: 2.5, w: 12.3, fontSize: 48, color: WHITE, bold: true, align: "center" });
    s.addText("Football Conversation Intelligence Platform", { x: 0.5, y: 3.8, w: 12.3, fontSize: 16, color: GOLD, align: "center", charSpacing: 2 });
    s.addText("fanometrix.com", { x: 0.5, y: 5.5, w: 12.3, fontSize: 12, color: WHITE, transparency: 50, align: "center" });
  }

  await pptx.writeFile({ fileName: `Fanometrix-Insights-${search.name.replace(/\s+/g, "-")}.pptx` });
}

// ── Utility ───────────────────────────────────────────────────────────────────
function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-3 flex items-center gap-3" style={{ background: accent }}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [search,    setSearch]    = useState<Search | null>(null);
  const [report,    setReport]    = useState<InsightReport | null>(null);
  const [generating,setGenerating]= useState(false);
  const [error,     setError]     = useState("");
  const [exporting, setExporting] = useState<"pdf" | "pptx" | "csv" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/social/searches").then(r => r.json()).then(j => {
      const found = (j.data ?? []).find((s: Search) => s.id === id);
      setSearch(found ?? null);
    });
  }, [id]);

  const generate = useCallback(async () => {
    if (!id) return;
    setGenerating(true); setError("");
    const res  = await fetch("/api/social/insights", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search_id: id }),
    });
    const json = await res.json();
    setGenerating(false);
    if (res.ok) setReport(json);
    else setError(json.error ?? "Failed to generate insights.");
  }, [id]);

  async function handleExport(format: "csv" | "pptx" | "pdf") {
    if (!report || !search) return;
    setExporting(format);

    if (format === "csv") {
      const res  = await fetch(`/api/social/export?search_id=${id}&format=csv`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href = url; a.download = `fanometrix-${search.name.replace(/\s+/g,"-")}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else if (format === "pdf") {
      window.print();
    } else if (format === "pptx") {
      await exportPowerPoint(search, report);
    }

    setExporting(null);
  }

  const SENT_COLOUR = { positive: "#22C55E", neutral: "#9CA3AF", negative: "#EF4444" };

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto" ref={printRef}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 print:hidden">
          <div>
            <Link href={`/social-listening/searches/${id}`} className="text-xs text-gray-400 hover:text-gray-600">← Search Detail</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">
              {search?.name ?? "…"} — Insights
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">Client-ready intelligence report</p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <>
                <button onClick={() => handleExport("csv")} disabled={!!exporting}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {exporting === "csv" ? "…" : "Export CSV"}
                </button>
                <button onClick={() => handleExport("pdf")} disabled={!!exporting}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {exporting === "pdf" ? "…" : "Export PDF"}
                </button>
                <button onClick={() => handleExport("pptx")} disabled={!!exporting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: "#D7B87A", color: "#0B1929" }}>
                  {exporting === "pptx" ? "Generating…" : "Export PPTX"}
                </button>
              </>
            )}
            <button onClick={generate} disabled={generating}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              style={{ background: "#0B1929", color: "#D7B87A" }}>
              {generating ? "Generating…" : report ? "Regenerate" : "Generate Insights"}
            </button>
          </div>
        </div>

        {/* State messages */}
        {!report && !generating && !error && (
          <div className="bg-[#0B1929] rounded-2xl p-10 text-center">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#D7B87A" }}>
              Insight Validation Dashboard
            </p>
            <h2 className="text-xl font-bold text-white mb-3">
              Generate client-ready intelligence from classified mentions
            </h2>
            <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-6">
              Fanometrix analyses every classified mention and produces structured insights:
              positive drivers, concerns, market differences and recommended actions — written for brands, clubs and agencies.
            </p>
            <button onClick={generate}
              className="text-sm font-semibold px-6 py-3 rounded-xl"
              style={{ background: "#D7B87A", color: "#0B1929" }}>
              Generate Insights →
            </button>
          </div>
        )}

        {generating && (
          <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-700">Analysing {search?.name} mentions…</p>
            <p className="text-xs text-gray-400 mt-1">Using GPT-4o to generate client-ready insights</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {report && (
          <div className="space-y-5 print:space-y-4">

            {/* Print header */}
            <div className="hidden print:block mb-6">
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#D7B87A" }}>Fanometrix — Football Conversation Intelligence</p>
              <h1 className="text-3xl font-bold mt-1" style={{ color: "#0B1929" }}>{search?.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{search?.entity_type} · {search?.research_goal} · {report.mention_count.toLocaleString()} mentions analysed</p>
            </div>

            {/* Headline */}
            <div className="rounded-2xl p-6 text-center" style={{ background: "#0B1929" }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#D7B87A" }}>
                {report.mention_count.toLocaleString()} mentions · {new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <h2 className="text-2xl font-bold text-white leading-tight">{report.headline}</h2>
            </div>

            {/* Executive Summary */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
              <p className="text-base text-gray-800 leading-relaxed">{report.executive_summary}</p>
            </div>

            {/* Positive Drivers */}
            <Section title="Key Positive Drivers" accent="#22C55E">
              <div className="space-y-3">
                {report.positive_drivers.map((d, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{d}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Key Concerns */}
            <Section title="Key Concerns" accent="#EF4444">
              <div className="space-y-3">
                {report.key_concerns.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{c}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Fastest Growing Topics */}
            <Section title="Fastest Growing Topics" accent="#D7B87A">
              <div className="flex flex-wrap gap-2">
                {report.fastest_growing_topics.map((t, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 leading-relaxed max-w-sm">
                    {t}
                  </div>
                ))}
              </div>
            </Section>

            {/* Market Differences */}
            <Section title="Market Intelligence" accent="#5B6CFA">
              <div className="space-y-4">
                {report.market_differences.map((md, i) => (
                  <div key={i} className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/30">
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {md.markets.map(m => (
                        <span key={m} className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{m}</span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{md.finding}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Recommended Actions */}
            <Section title="Recommended Actions" accent="#D7B87A">
              <div className="space-y-4">
                {report.recommended_actions.map((a, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5"
                        style={{ background: "#D7B87A", color: "#0B1929" }}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">{a.action}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{a.rationale}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Footer */}
            <div className="text-center py-4 text-xs text-gray-300 print:block">
              Generated by Fanometrix · Football Conversation Intelligence Platform · fanometrix.com
            </div>

          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          aside, nav, [data-print-hidden] { display: none !important; }
          body { background: white; }
          .shadow-sm { box-shadow: none !important; }
        }
      `}</style>
    </AdminShell>
  );
}

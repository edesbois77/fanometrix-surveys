"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import { normalizeInsightRow } from "@/lib/intelligence/reportCompat";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import { DualTracedRecommendationsField, FindingReferenceChips } from "@/app/components/intelligence/ReviewFields";

type Search = { id: string; name: string; entity_type: string; research_goal: string };
type Status = "draft" | "edited" | "approved" | "published";

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
    s.addText("What's Working, Key Positive Drivers", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
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
    s.addText("Key Concerns, Risks to Monitor", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
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
    s.addText("Market Intelligence, Key Differences", { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: WHITE, bold: true });
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

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string; style?: React.CSSProperties }> = {
    draft:     { label: "Draft",     className: "bg-gray-100 text-gray-600" },
    edited:    { label: "Edited",    className: "bg-amber-100 text-amber-700" },
    approved:  { label: "Approved",  className: "bg-green-100 text-green-700" },
    published: { label: "Published", className: "", style: { background: "#D7B87A", color: "#0B1929" } },
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`} style={s.style}>{s.label}</span>;
}

// ── Edit-mode field widgets ──────────────────────────────────────────────────
function ListField({ items, onChange, addLabel }: { items: string[]; onChange: (items: string[]) => void; addLabel: string }) {
  return (
    <div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea value={item} rows={2}
              onChange={e => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, ""])} className="mt-2 text-xs font-semibold text-[#0B1929] hover:underline">
        + Add {addLabel}
      </button>
    </div>
  );
}

function MarketDifferencesField({ items, onChange }: {
  items: InsightReport["market_differences"];
  onChange: (items: InsightReport["market_differences"]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((md, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={md.markets.join(", ")} placeholder="Markets, e.g. IN, GB"
              onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, markets: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : it)))}
              className="w-40 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 ml-auto">×</button>
          </div>
          <textarea value={md.finding} rows={2} placeholder="Finding"
            onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, finding: e.target.value } : it)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ))}
      <button onClick={() => onChange([...items, { finding: "", markets: [] }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add market difference
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Search context — independent of the review workflow, so it's loaded
  // separately rather than through the shared hook.
  const [search,        setSearch]        = useState<Search | null>(null);
  const [searchLoading, setSearchLoading] = useState(true);
  const [exporting,     setExporting]     = useState<"pdf" | "pptx" | "csv" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setSearchLoading(true);
    fetch("/api/social/searches").then(r => r.json()).then(json => {
      setSearch((json.data ?? []).find((s: Search) => s.id === id) ?? null);
      setSearchLoading(false);
    });
  }, [id]);

  const adapter: IntelligenceReviewAdapter<InsightReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/social/insights?search_id=${id}`);
      const json = await res.json();
      return json.data ? normalizeInsightRow(json.data) : null;
    },
    generate: async confirm => {
      const res  = await fetch("/api/social/insights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: id, confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate insights." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    saveEdit: async editedContent => {
      const res  = await fetch("/api/social/insights/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: id, edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    approve: async () => {
      const res  = await fetch("/api/social/insights/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: id }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
    publish: async () => {
      const res  = await fetch("/api/social/insights/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: id }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: normalizeInsightRow(json.data) };
    },
  }), [id]);

  const {
    row, draft, editing, loading: reviewLoading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
  } = useIntelligenceReview<InsightReport>(adapter, [id]);

  const loading = reviewLoading || searchLoading;

  async function handleExport(format: "csv" | "pptx" | "pdf") {
    if (!current || !search) return;
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
      await exportPowerPoint(search, current);
    }

    setExporting(null);
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto" ref={printRef}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 print:hidden flex-wrap gap-3">
          <div>
            <Link href={`/social-listening/searches/${id}`} className="text-xs text-gray-400 hover:text-gray-600">← Search Detail</Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{search?.name ?? "…"}, Insights</h1>
              {row && <StatusBadge status={row.status} />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Client-ready intelligence report</p>
          </div>

          {!editing ? (
            <div className="flex items-center gap-2 flex-wrap">
              {current && (
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
              {row && (
                <button onClick={startEditing} disabled={busy}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Edit
                </button>
              )}
              {row && row.status !== "published" && (
                <button onClick={approveSummary} disabled={busy || row.status === "approved"}
                  className="text-xs font-semibold border-2 border-green-600 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40">
                  {approving ? "Approving…" : row.status === "approved" ? "Approved ✓" : "Approve"}
                </button>
              )}
              {row && (
                <button onClick={publishSummary} disabled={busy || row.status !== "approved"}
                  title={row.status !== "approved" && row.status !== "published" ? "Approve this summary first" : undefined}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: "#0B1929", color: "#D7B87A" }}>
                  {publishing ? "Publishing…" : row.status === "published" ? "Published ✓" : "Publish"}
                </button>
              )}
              <button onClick={() => generate(false)} disabled={busy}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {generating ? "Generating…" : row ? "Regenerate" : "Generate Insights"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={cancelEditing} disabled={saving}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={saveEdits} disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        {/* State messages */}
        {loading && (
          <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && !row && !generating && (
          <div className="bg-[#0B1929] rounded-2xl p-10 text-center">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#D7B87A" }}>
              Insight Validation Dashboard
            </p>
            <h2 className="text-xl font-bold text-white mb-3">
              Generate client-ready intelligence from classified mentions
            </h2>
            <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-6">
              Fanometrix analyses every classified mention and produces structured insights:
              positive drivers, concerns, market differences and recommended actions, written for brands, clubs and agencies.
            </p>
            <button onClick={() => generate(false)}
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
            <p className="text-xs text-gray-400 mt-1">Reviewing the captured mentions to generate client-ready insights</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!generating && row && current && (
          <div className="space-y-5 print:space-y-4">

            {/* Print header */}
            <div className="hidden print:block mb-6">
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#D7B87A" }}>Fanometrix, Football Conversation Intelligence</p>
              <h1 className="text-3xl font-bold mt-1" style={{ color: "#0B1929" }}>{search?.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{search?.entity_type} · {search?.research_goal} · {current.mention_count.toLocaleString()} mentions analysed</p>
            </div>

            {/* Headline */}
            <div className="rounded-2xl p-6 text-center" style={{ background: "#0B1929" }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#D7B87A" }}>
                {current.mention_count.toLocaleString()} mentions · {new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              {editing && draft ? (
                <input value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xl font-bold text-white text-center placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <h2 className="text-2xl font-bold text-white leading-tight">{current.headline}</h2>
              )}
            </div>

            {/* Executive Summary */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={3}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
              )}
            </div>

            {/* Positive Drivers */}
            <Section title="Key Positive Drivers" accent="#22C55E">
              {editing && draft ? (
                <ListField items={draft.positive_drivers} addLabel="driver" onChange={items => setDraft({ ...draft, positive_drivers: items })} />
              ) : (
                <div className="space-y-3">
                  {current.positive_drivers.map((d, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{d}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Key Concerns */}
            <Section title="Key Concerns" accent="#EF4444">
              {editing && draft ? (
                <ListField items={draft.key_concerns} addLabel="concern" onChange={items => setDraft({ ...draft, key_concerns: items })} />
              ) : (
                <div className="space-y-3">
                  {current.key_concerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{c}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Notable Topics */}
            <Section title="Notable Topics" accent="#D7B87A">
              {editing && draft ? (
                <ListField items={draft.notable_topics} addLabel="topic" onChange={items => setDraft({ ...draft, notable_topics: items })} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {current.notable_topics.map((t, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 leading-relaxed max-w-sm">
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Market Differences */}
            <Section title="Market Intelligence" accent="#5B6CFA">
              {editing && draft ? (
                <MarketDifferencesField items={draft.market_differences} onChange={items => setDraft({ ...draft, market_differences: items })} />
              ) : (
                <div className="space-y-4">
                  {current.market_differences.map((md, i) => (
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
              )}
            </Section>

            {/* Recommended Actions */}
            <Section title="Recommended Actions" accent="#D7B87A">
              {editing && draft ? (
                <DualTracedRecommendationsField
                  items={draft.recommended_actions}
                  positiveDriverCount={draft.positive_drivers.length}
                  keyConcernCount={draft.key_concerns.length}
                  onChange={items => setDraft({ ...draft, recommended_actions: items })}
                />
              ) : (
                <div className="space-y-4">
                  {current.recommended_actions.map((a, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                          style={{ background: "#D7B87A", color: "#0B1929" }}>
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 mb-1">{a.action}</p>
                          <p className="text-xs text-gray-500 leading-relaxed mb-2">{a.rationale}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <FindingReferenceChips indices={a.based_on_positive_drivers} label="Driver" />
                            <FindingReferenceChips indices={a.based_on_key_concerns} label="Concern" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Review trail */}
            {!editing && (row.reviewed_by || row.published_at) && (
              <div className="text-xs text-gray-400 text-center">
                {row.reviewed_by && row.reviewed_at && (
                  <span>Approved by {row.reviewed_by} on {new Date(row.reviewed_at).toLocaleDateString("en-GB")}</span>
                )}
                {row.reviewed_by && row.published_at && <span> · </span>}
                {row.published_at && <span>Published {new Date(row.published_at).toLocaleDateString("en-GB")}</span>}
              </div>
            )}

            {/* Footer */}
            <div className="text-center py-4 text-xs text-gray-300 print:block">
              Generated by Fanometrix · Football Conversation Intelligence Platform · fanometrix.com
            </div>

          </div>
        )}
      </div>

      {/* Regenerate confirmation */}
      {confirmRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate summary?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This search already has a {row?.status} summary. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRegen(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button onClick={() => { setConfirmRegen(false); generate(true); }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: "#0B1929", color: "#D7B87A" }}>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

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

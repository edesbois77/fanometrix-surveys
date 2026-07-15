"use client";

// Shared primitives for every source-specific Intelligence review modal
// (SurveyIntelligenceModal, ConversationIntelligenceModal, and future
// Industry/Document equivalents). Extracted from what used to be two
// near-identical copies (SurveyIntelligenceModal.tsx and the standalone
// app/social-listening/searches/[id]/insights/page.tsx) — the review
// *shell* (status, section chrome, list/tag/action editors) is identical
// across source types; only each report's own field shapes differ, and
// those stay defined alongside their own ReportBody.
import { NAVY, GOLD, REPORT_TONES, type ReportTone } from "@/lib/intelligence/theme";
import type { ProvenanceRef, EvidenceStrength, DocumentQuote } from "@/lib/library-documents/analysis-schema";

export type ReviewStatus = "draft" | "edited" | "approved" | "published";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; style: React.CSSProperties }> = {
    draft:     { label: "Draft",     style: { background: REPORT_TONES.neutral.wash, color: REPORT_TONES.neutral.ink } },
    edited:    { label: "Edited",    style: { background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink } },
    approved:  { label: "Approved",  style: { background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink } },
    published: { label: "Published", style: { background: GOLD, color: NAVY } },
  };
  const s = map[status];
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={s.style}>{s.label}</span>;
}

/** Restrained section header — a small-caps eyebrow label and a thin rule
 * in the section's tone colour, on a plain white card whose border carries
 * a faint tint of that same tone. Replaces the previous full-width
 * saturated colour band; every section across Survey, Conversation and
 * Executive now resolves its colour through the shared REPORT_TONES table
 * instead of a bespoke hex per call site. */
export function Section({ title, tone, children }: { title: string; tone: ReportTone; children: React.ReactNode }) {
  const t = REPORT_TONES[tone];
  return (
    <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${t.line}` }}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: t.ink }} />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: t.ink }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function ListField({ items, onChange, addLabel }: { items: string[]; onChange: (items: string[]) => void; addLabel: string }) {
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

/** Executive Report's "Areas of Difference" — {finding, explanation}, no
 * tags (unlike TaggedFindingsField below): the explanation of *why* sources
 * diverge is the point, not a segment/market label. */
export function AreasOfDifferenceField({ items, onChange }: {
  items: { finding: string; explanation: string }[];
  onChange: (items: { finding: string; explanation: string }[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <textarea value={it.finding} rows={2} placeholder="Finding"
              onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, finding: e.target.value } : x)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
          </div>
          <textarea value={it.explanation} rows={2} placeholder="Why does this difference exist? (methodology, market, timing, audience)"
            onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ))}
      <button onClick={() => onChange([...items, { finding: "", explanation: "" }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add area of difference
      </button>
    </div>
  );
}

/** Recommended Actions with a based_on_findings index-picker — the
 * evidence-to-action trace every recommendation must carry, shared by
 * Executive Report and Survey Intelligence (both have a single findings
 * list to reference). findingsCount drives how many "Finding N" toggles
 * are offered. Conversation Intelligence uses DualTracedRecommendationsField
 * below instead, since it has two source arrays, not one. */
export function TracedRecommendationsField({ items, findingsCount, onChange }: {
  items: { action: string; rationale: string; based_on_findings: number[] }[];
  findingsCount: number;
  onChange: (items: { action: string; rationale: string; based_on_findings: number[] }[]) => void;
}) {
  function toggleFinding(i: number, findingIndex: number) {
    onChange(items.map((it, j) => {
      if (j !== i) return it;
      const has = it.based_on_findings.includes(findingIndex);
      const based_on_findings = has
        ? it.based_on_findings.filter(f => f !== findingIndex)
        : [...it.based_on_findings, findingIndex].sort((a, b) => a - b);
      return { ...it, based_on_findings };
    }));
  }

  return (
    <div className="space-y-3">
      {items.map((a, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={a.action} placeholder="Recommended action"
              onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, action: e.target.value } : it)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1">×</button>
          </div>
          <textarea value={a.rationale} rows={2} placeholder="Rationale"
            onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, rationale: e.target.value } : it)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs mb-2 focus:outline-none focus:border-[#D7B87A]" />
          {findingsCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: findingsCount }, (_, findingIndex) => (
                <button key={findingIndex} type="button" onClick={() => toggleFinding(i, findingIndex)}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    a.based_on_findings.includes(findingIndex)
                      ? "bg-[#D7B87A] text-[#0B1929] border-[#D7B87A]"
                      : "bg-white text-gray-400 border-gray-200"
                  }`}
                >
                  Finding {findingIndex + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button onClick={() => onChange([...items, { action: "", rationale: "", based_on_findings: [] }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add recommended action
      </button>
    </div>
  );
}

/** Conversation Intelligence's Recommended Actions — the evidence-to-action
 * trace split across two source arrays (positive_drivers / key_concerns)
 * since Conversation Intelligence has no single findings list the way
 * Survey and Executive do. Otherwise identical in shape and behaviour to
 * TracedRecommendationsField above. */
export function DualTracedRecommendationsField({
  items, positiveDriverCount, keyConcernCount, onChange,
}: {
  items: { action: string; rationale: string; based_on_positive_drivers: number[]; based_on_key_concerns: number[] }[];
  positiveDriverCount: number;
  keyConcernCount: number;
  onChange: (items: { action: string; rationale: string; based_on_positive_drivers: number[]; based_on_key_concerns: number[] }[]) => void;
}) {
  function toggle(i: number, field: "based_on_positive_drivers" | "based_on_key_concerns", index: number) {
    onChange(items.map((it, j) => {
      if (j !== i) return it;
      const has = it[field].includes(index);
      const next = has ? it[field].filter(f => f !== index) : [...it[field], index].sort((a, b) => a - b);
      return { ...it, [field]: next };
    }));
  }

  function toggleGroup(i: number, field: "based_on_positive_drivers" | "based_on_key_concerns", count: number, groupLabel: string) {
    if (count === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {Array.from({ length: count }, (_, index) => (
          <button key={index} type="button" onClick={() => toggle(i, field, index)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              items[i][field].includes(index)
                ? "bg-[#D7B87A] text-[#0B1929] border-[#D7B87A]"
                : "bg-white text-gray-400 border-gray-200"
            }`}
          >
            {groupLabel} {index + 1}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((a, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={a.action} placeholder="Recommended action"
              onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, action: e.target.value } : it)))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1">×</button>
          </div>
          <textarea value={a.rationale} rows={2} placeholder="Rationale"
            onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, rationale: e.target.value } : it)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs mb-2 focus:outline-none focus:border-[#D7B87A]" />
          {toggleGroup(i, "based_on_positive_drivers", positiveDriverCount, "Driver")}
          {toggleGroup(i, "based_on_key_concerns", keyConcernCount, "Concern")}
        </div>
      ))}
      <button onClick={() => onChange([...items, { action: "", rationale: "", based_on_positive_drivers: [], based_on_key_concerns: [] }])} className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add recommended action
      </button>
    </div>
  );
}

/** Read-only source ticks (✓ Survey / ✓ Conversation Search) — the one
 * evidence device used everywhere a finding appears, on the Executive
 * Report and (later) any other report type. Never restated as prose. */
export function EvidenceTicks({ sources }: { sources: ("survey" | "conversation_search" | "document")[] }) {
  const labels: Record<"survey" | "conversation_search" | "document", string> = { survey: "Survey", conversation_search: "Conversation Search", document: "Document" };
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map(s => (
        <span key={s} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
          <span style={{ color: REPORT_TONES.positive.ink }}>✓</span> {labels[s]}
        </span>
      ))}
    </div>
  );
}

/** Read-only "→ Finding N" reference chips — the evidence-to-action trace
 * on a recommendation, distinct from EvidenceTicks (which marks a
 * finding's own source support). `label` lets Survey ("Finding") and
 * Conversation Intelligence (two calls: "Driver" / "Concern") reuse the
 * same chip for their own reference arrays. onJump lets the caller
 * scroll/highlight the referenced item; omitted, chips render as inert
 * labels rather than fake-interactive buttons. */
export function FindingReferenceChips({ indices, label = "Finding", onJump }: { indices: number[]; label?: string; onJump?: (index: number) => void }) {
  if (!indices.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {indices.map(i => {
        const style: React.CSSProperties = { color: NAVY, background: `${GOLD}33` };
        const text = `→ ${label} ${i + 1}`;
        return onJump ? (
          <button key={i} type="button" onClick={() => onJump(i)}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full hover:opacity-80" style={style}>
            {text}
          </button>
        ) : (
          <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={style}>{text}</span>
        );
      })}
    </div>
  );
}

/** Covers both Survey's "Notable Differences" ({finding, segments}) and
 * Conversation Search's "Market Differences" ({finding, markets}) — same
 * shape, different tag-array key name, so the key is a parameter. */
export function TaggedFindingsField<K extends string>({
  items, tagKey, tagPlaceholder, addLabel, onChange,
}: {
  items: ({ finding: string } & Record<K, string[]>)[];
  tagKey: K;
  tagPlaceholder: string;
  addLabel: string;
  onChange: (items: ({ finding: string } & Record<K, string[]>)[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <div className="flex gap-2 mb-2 items-center">
            <input value={it[tagKey].join(", ")} placeholder={tagPlaceholder}
              onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, [tagKey]: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : x)))}
              className="w-40 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#D7B87A]" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 ml-auto">×</button>
          </div>
          <textarea value={it.finding} rows={2} placeholder="Finding"
            onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, finding: e.target.value } : x)))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { finding: "", [tagKey]: [] } as unknown as ({ finding: string } & Record<K, string[]>)])}
        className="text-xs font-semibold text-[#0B1929] hover:underline"
      >
        + Add {addLabel}
      </button>
    </div>
  );
}

/** Printed page label (human-readable folio, e.g. "4–5") is preferred
 * whenever the visual pipeline detected one; PDF page is the documented
 * fallback; section label wins for DOCX, which has no page concept at
 * all. A visual-evidence citation (a chart/quote/callout the vision pass
 * described, not extracted text) gets a distinct tint so a reviewer can
 * tell the two evidence kinds apart at a glance. Shared by the Research
 * Library's global document review page and the project-specific Document
 * Intelligence review page — same provenance shape, same display rule. */
export function ProvenanceBadges({ provenance }: { provenance: ProvenanceRef[] }) {
  if (!provenance.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {provenance.map((p, i) => {
        const pageLabel = p.printed_page_label
          ?? (p.page_start !== null ? (p.page_start === p.page_end ? `Page ${p.page_start}` : `Pages ${p.page_start}-${p.page_end}`) : null);
        const label = p.section_label ?? pageLabel ?? "Source unclear";
        const isVisual = p.evidence_kind === "visual";
        return (
          <span key={i} title={p.quote ?? undefined} className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: isVisual ? "#8A4B33" : NAVY, background: isVisual ? "#F7ECE6" : `${GOLD}33` }}>
            {isVisual ? `Chart/image — ${label}` : label}
          </span>
        );
      })}
    </div>
  );
}

/** Read-only evidence-strength pill — code-derived (never AI-judged), see
 * computeEvidenceStrength in analysis-schema.ts. Shared the same way
 * ProvenanceBadges is above. */
export function EvidenceStrengthBadge({ strength }: { strength: EvidenceStrength }) {
  const meta: Record<EvidenceStrength, { label: string; bg: string; fg: string }> = {
    robust:      { label: "Robust",      bg: "#EEF3EC", fg: "#3F5D42" },
    directional: { label: "Directional", bg: "#FBF3E1", fg: "#8A6D2F" },
    limited:     { label: "Limited",     bg: "#F4F2EE", fg: "#6B6459" },
  };
  const m = meta[strength];
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label} evidence</span>;
}

/** Editable list of {id, text, provenance} items — ListField's own shape
 * is string[], not quite this; a thin variant that preserves id/provenance
 * across edits and only lets the text itself be changed. Shared by the
 * Research Library's global document review page and the project-specific
 * Document Intelligence review page. */
export function TextWithProvenanceField<T extends { id: string; text: string }>({
  items, addLabel, onChange, emptyItem, renderProvenance,
}: {
  items: T[];
  addLabel: string;
  onChange: (items: T[]) => void;
  /** Omit to make this list display-and-remove only (no "+ Add") — used
   * for carried-through, selection-only content like Document
   * Intelligence's relevant_findings, where a reviewer may trim what was
   * selected but authoring a brand-new finding with no provenance at all
   * would misrepresent it as grounded evidence. */
  emptyItem?: T;
  renderProvenance?: (item: T) => React.ReactNode;
}) {
  return (
    <div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-start gap-2">
            <div className="flex-1">
              <textarea value={item.text} rows={2}
                onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
              {renderProvenance?.(item)}
            </div>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
          </div>
        ))}
      </div>
      {emptyItem && (
        <button onClick={() => onChange([...items, emptyItem])} className="mt-2 text-xs font-semibold text-[#0B1929] hover:underline">
          + Add {addLabel}
        </button>
      )}
    </div>
  );
}

/** Verbatim-quote editor (text + attribution + theme) — Document
 * Intelligence-shaped, not generic, since a quote's extra fields don't fit
 * TextWithProvenanceField's plain {id, text} shape. Shared the same way. */
export function QuotesField({ items, onChange, allowAdd = true }: { items: DocumentQuote[]; onChange: (items: DocumentQuote[]) => void; allowAdd?: boolean }) {
  return (
    <div>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={q.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
            <div className="flex items-start gap-2 mb-2">
              <textarea value={q.text} rows={2} placeholder="Verbatim quote"
                onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm italic focus:outline-none focus:border-[#D7B87A]" />
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={q.attribution ?? ""} placeholder="Attribution (optional)"
                onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, attribution: e.target.value || null } : it)))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#D7B87A]" />
              <input value={q.theme ?? ""} placeholder="Theme (optional)"
                onChange={e => onChange(items.map((it, j) => (j === i ? { ...it, theme: e.target.value || null } : it)))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#D7B87A]" />
            </div>
          </div>
        ))}
      </div>
      {allowAdd && (
        <button onClick={() => onChange([...items, { id: crypto.randomUUID(), text: "", attribution: null, theme: null, provenance: [] }])}
          className="mt-2 text-xs font-semibold text-[#0B1929] hover:underline">
          + Add quote
        </button>
      )}
    </div>
  );
}

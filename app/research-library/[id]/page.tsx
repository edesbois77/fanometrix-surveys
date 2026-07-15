"use client";

// A single Library Document's own page — status while the automatic
// upload → extract → analyse pipeline runs, then the global analysis
// review screen once it reaches pending_review. Structural sibling of
// app/research-projects/[id]/reports/survey/[evidenceId]/page.tsx (same
// AdminShell + Section + StatusBadge + useIntelligenceReview shell), but
// reviewing library_document_analysis (Option B — see
// supabase-migration-101.sql) rather than research_summaries, and with no
// Publish step (this table has no published state at all — the hook's
// `publish` adapter field is optional for exactly this case, see
// lib/intelligence/useIntelligenceReview.ts).
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useIntelligenceReview, type IntelligenceReviewAdapter, type SummaryRow } from "@/lib/intelligence/useIntelligenceReview";
import { Section, StatusBadge, ListField, ProvenanceBadges, EvidenceStrengthBadge, TextWithProvenanceField, QuotesField } from "@/app/components/intelligence/ReviewFields";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { NAVY, GOLD, PAPER, PAPER_LINE } from "@/lib/intelligence/theme";
import { DOCUMENT_TYPES } from "@/lib/library-documents/constants";
import {
  computeEvidenceStrength,
  type DocumentAnalysisContent, type DocumentFinding, type DocumentStatistic,
  type DocumentRecommendation,
  type ResearchQualitySignals,
} from "@/lib/library-documents/analysis-schema";
import type { LibraryDocumentAnalysisRow, AnalysisStatus } from "@/lib/library-documents/analysis-store";

type DocumentStatus = "uploaded" | "extracting" | "analysing" | "pending_review" | "approved" | "failed";

type LibraryDocumentRow = {
  id: string;
  title: string;
  document_type: string;
  status: DocumentStatus;
  error_message: string | null;
  original_filename: string;
  page_count: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  approved_at: string | null;
  confidentiality: string;
  preview_url: string | null;
};

function toSummaryRow(row: LibraryDocumentAnalysisRow): SummaryRow<DocumentAnalysisContent> {
  return {
    id: row.id,
    content: row.content,
    edited_content: row.edited_content,
    status: row.status,
    generated_at: row.generated_at,
    updated_at: row.updated_at,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    // This table has no published state at all — never true, never shown.
    published_at: null,
    is_simulated: false,
  };
}

const PIPELINE_LABEL: Record<string, { label: string; sublabel: string }> = {
  uploaded:   { label: "Preparing to extract text…", sublabel: "Waiting for the upload to be confirmed" },
  extracting: { label: "Extracting text from the document…", sublabel: "Reading pages and sections" },
  analysing:  { label: "Analysing the document…", sublabel: "Extracting findings, statistics and metadata" },
};

/** Comma-separated tag editor for the markets/sports/audiences/brands/
 * topics/tags arrays — same interaction as TaggedFindingsField's own tag
 * input in ReviewFields.tsx, standalone here since these fields have no
 * accompanying "finding" text, just the tag list itself. */
function TagListField({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <input
      defaultValue={items.join(", ")}
      placeholder={placeholder}
      onBlur={e => onChange(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]"
    />
  );
}

function ReportFrameworkField({ value, onChange }: { value: DocumentAnalysisContent["report_framework"]; onChange: (v: DocumentAnalysisContent["report_framework"]) => void }) {
  if (!value) {
    return (
      <button onClick={() => onChange({ name: "", components: [{ label: "", description: "" }, { label: "", description: "" }] })}
        className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add a named framework
      </button>
    );
  }
  return (
    <div>
      <input value={value.name} placeholder="Framework name" onChange={e => onChange({ ...value, name: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold mb-3 focus:outline-none focus:border-[#D7B87A]" />
      <div className="space-y-2">
        {value.components.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={c.label} placeholder="Component label" onChange={e => onChange({ ...value, components: value.components.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
              <input value={c.description} placeholder="Description" onChange={e => onChange({ ...value, components: value.components.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
            </div>
            <button onClick={() => onChange({ ...value, components: value.components.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-400 px-1 pt-1.5">×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        <button onClick={() => onChange({ ...value, components: [...value.components, { label: "", description: "" }] })} className="text-xs font-semibold text-[#0B1929] hover:underline">
          + Add component
        </button>
        <button onClick={() => onChange(null)} className="text-xs font-semibold text-red-400 hover:underline">
          Remove framework
        </button>
      </div>
    </div>
  );
}

/** Categorical, not a numeric score — see analysis-schema.ts's
 * ResearchQualityAssessment doc comment for why. Three plain tones, no
 * false precision. */
/** Booleans/source_type stay editable (a reviewer may know the document
 * discloses something the model missed) — evidence_strength and rationale
 * are always recomputed from them via computeEvidenceStrength, never
 * directly editable, so the classification can never drift out of sync
 * with the facts it's derived from. */
function ResearchQualityField({ value, onChange }: { value: DocumentAnalysisContent["research_quality"]; onChange: (v: DocumentAnalysisContent["research_quality"]) => void }) {
  function update(signals: Partial<ResearchQualitySignals>) {
    const nextSignals: ResearchQualitySignals = { ...value, ...signals };
    onChange({ ...nextSignals, ...computeEvidenceStrength(nextSignals) });
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <EvidenceStrengthBadge strength={value.evidence_strength} />
        <span className="text-xs text-gray-400">(computed automatically from the signals below)</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {(([
          ["methodology_disclosed", "Methodology disclosed"],
          ["sample_size_disclosed", "Sample size disclosed"],
          ["geography_disclosed", "Geography disclosed"],
          ["fieldwork_dates_disclosed", "Fieldwork dates disclosed"],
          ["demographic_definitions_disclosed", "Demographic definitions disclosed"],
        ] as const)).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={value[key]} onChange={e => update({ [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <label className="block text-xs text-gray-400 mb-1">Source type</label>
      <select value={value.source_type} onChange={e => update({ source_type: e.target.value as ResearchQualitySignals["source_type"] })}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]">
        <option value="primary">Primary</option>
        <option value="secondary">Secondary</option>
        <option value="mixed">Mixed</option>
        <option value="unclear">Unclear</option>
      </select>
    </div>
  );
}

function AuthorPerspectiveField({ value, onChange }: { value: DocumentAnalysisContent["author_perspective"]; onChange: (v: DocumentAnalysisContent["author_perspective"]) => void }) {
  if (!value) {
    return (
      <button onClick={() => onChange({ publisher_description: "", commercial_interest_note: null, independence_note: "" })}
        className="text-xs font-semibold text-[#0B1929] hover:underline">
        + Add author perspective
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <textarea value={value.publisher_description ?? ""} rows={2} placeholder="What the document says about its own publisher"
        onChange={e => onChange({ ...value, publisher_description: e.target.value || null })}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
      <textarea value={value.commercial_interest_note ?? ""} rows={2} placeholder="Commercial interest note (optional)"
        onChange={e => onChange({ ...value, commercial_interest_note: e.target.value || null })}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
      <textarea value={value.independence_note} rows={2} placeholder="Independence note — carefully neutral, context not accusation"
        onChange={e => onChange({ ...value, independence_note: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
      <button onClick={() => onChange(null)} className="text-xs font-semibold text-red-400 hover:underline">
        Remove author perspective
      </button>
    </div>
  );
}

function TagListDisplay({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(t => (
        <span key={t} className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
      ))}
    </div>
  );
}

export default function LibraryDocumentPage() {
  const params = useParams();
  const id = params.id as string;

  const [doc, setDoc] = useState<LibraryDocumentRow | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const res = await fetch(`/api/library-documents/${id}`);
      const json = await res.json();
      if (cancelled) return;
      setDoc(json.data ?? null);
      setLoadingDoc(false);
      const status = json.data?.status as DocumentStatus | undefined;
      if (status && ["uploaded", "extracting", "analysing"].includes(status)) {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id]);

  if (loadingDoc) {
    return (
      <AdminShell>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </AdminShell>
    );
  }

  if (!doc) {
    return (
      <AdminShell>
        <div className="p-6 max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-400 mb-4">This document couldn&apos;t be found.</p>
          <Link href="/research-library" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Library</Link>
        </div>
      </AdminShell>
    );
  }

  return <LibraryDocumentBody doc={doc} />;
}

function LibraryDocumentBody({ doc }: { doc: LibraryDocumentRow }) {
  const inPipeline = ["uploaded", "extracting", "analysing"].includes(doc.status);

  const adapter: IntelligenceReviewAdapter<DocumentAnalysisContent> = useMemo(() => ({
    fetchCurrent: async () => {
      const res = await fetch(`/api/library-documents/${doc.id}/analysis`);
      const json = await res.json();
      return json.data ? toSummaryRow(json.data) : null;
    },
    generate: async confirm => {
      const res = await fetch(`/api/library-documents/${doc.id}/analysis`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: !!json.requiresConfirm };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to analyse this document." };
      return { ok: true, data: toSummaryRow(json.data) };
    },
    saveEdit: async editedContent => {
      const res = await fetch(`/api/library-documents/${doc.id}/analysis/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: toSummaryRow(json.data) };
    },
    approve: async () => {
      const res = await fetch(`/api/library-documents/${doc.id}/analysis/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: toSummaryRow(json.data) };
    },
    // No publish — see this file's header comment.
  }), [doc.id]);

  const {
    row, draft, editing, loading, generating, saving, approving, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary,
  } = useIntelligenceReview<DocumentAnalysisContent>(adapter, [doc.id, doc.status]);

  const docTypeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label ?? doc.document_type;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div className="min-w-0">
            <Link href="/research-library" className="text-xs text-gray-400 hover:text-gray-600">← Back to Research Library</Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{doc.title}</h1>
              {row && <StatusBadge status={row.status as AnalysisStatus} />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {docTypeLabel} · {doc.original_filename}{doc.page_count ? ` · ${doc.page_count} page${doc.page_count !== 1 ? "s" : ""}` : ""}
              {doc.preview_url && <> · <a href={doc.preview_url} target="_blank" rel="noreferrer" className="text-[#D7B87A] hover:underline">View file</a></>}
            </p>
          </div>

          {!inPipeline && doc.status !== "failed" && (
            <ReportActionRow
              editing={editing}
              hasRow={!!row}
              status={row?.status}
              busy={busy}
              saving={saving}
              approving={approving}
              publishing={false}
              generating={generating}
              showRegenerate
              onEdit={startEditing}
              onApprove={approveSummary}
              onRegenerate={() => generate(false)}
              onCancel={cancelEditing}
              onSave={saveEdits}
            />
          )}
        </div>

        {inPipeline && (
          <GeneratingProgress
            label={PIPELINE_LABEL[doc.status]?.label ?? "Processing…"}
            sublabel={PIPELINE_LABEL[doc.status]?.sublabel ?? ""}
            estimatedSeconds={doc.status === "analysing" ? 25 : doc.status === "extracting" ? 25 : 10}
          />
        )}

        {doc.status === "failed" && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center">
            <p className="text-sm font-medium text-red-700 mb-1">Processing failed</p>
            <p className="text-sm text-red-600">{doc.error_message ?? "An unknown error occurred."}</p>
          </div>
        )}

        {!inPipeline && doc.status !== "failed" && loading && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4 mt-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!generating && !loading && row && current && (
          <div className="space-y-6 mt-4">
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={3}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
              )}
            </div>

            <div className="rounded-2xl p-6" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Metadata</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Source / Publisher</p>
                  {editing && draft ? (
                    <input value={draft.source_publisher ?? ""} onChange={e => setDraft({ ...draft, source_publisher: e.target.value || null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
                  ) : (
                    <p className="text-sm text-gray-700">{current.source_publisher ?? "—"}</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Publication Date</p>
                  {editing && draft ? (
                    <input type="date" value={draft.publication_date ?? ""} onChange={e => setDraft({ ...draft, publication_date: e.target.value || null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
                  ) : (
                    <p className="text-sm text-gray-700">{current.publication_date ?? "—"}</p>
                  )}
                </div>
                {(([
                  ["markets", "Markets"],
                  ["sports_competitions", "Sports / Competitions"],
                  ["audience_segments", "Audience Segments"],
                  ["brands_mentioned", "Brands Mentioned"],
                  ["topics", "Topics"],
                  ["tags", "Tags"],
                ] as const)).map(([key, label]) => (
                  <div key={key}>
                    <p className="text-[11px] text-gray-400 mb-1">{label}</p>
                    {editing && draft ? (
                      <TagListField items={draft[key]} placeholder={`Comma-separated ${label.toLowerCase()}`}
                        onChange={items => setDraft({ ...draft, [key]: items })} />
                    ) : (
                      <TagListDisplay items={current[key]} />
                    )}
                  </div>
                ))}
              </div>
              {current.suggested_document_type && (
                <p className="text-xs text-gray-400 mt-4">
                  AI-suggested document type: <span className="font-medium text-gray-600">{DOCUMENT_TYPES.find(t => t.value === current.suggested_document_type)?.label ?? current.suggested_document_type}</span>
                </p>
              )}
            </div>

            {(current.report_framework || editing) && (
              <Section title="Report Framework" tone="navy">
                {editing && draft ? (
                  <ReportFrameworkField value={draft.report_framework} onChange={v => setDraft({ ...draft, report_framework: v })} />
                ) : current.report_framework ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-3">{current.report_framework.name}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {current.report_framework.components.map((c, i) => (
                        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                          <p className="text-sm font-semibold text-gray-800">{c.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No named framework detected.</p>
                )}
              </Section>
            )}

            <Section title="Key Findings" tone="gold">
              {editing && draft ? (
                <TextWithProvenanceField<DocumentFinding>
                  items={draft.key_findings}
                  addLabel="finding"
                  emptyItem={{ id: crypto.randomUUID(), text: "", provenance: [] }}
                  onChange={items => setDraft({ ...draft, key_findings: items })}
                  renderProvenance={item => <ProvenanceBadges provenance={item.provenance} />}
                />
              ) : (
                <div className="space-y-3">
                  {current.key_findings.map((f, i) => (
                    <div key={f.id} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background: GOLD, color: NAVY }}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{f.text}</p>
                        <ProvenanceBadges provenance={f.provenance} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Statistics & Claims" tone="positive">
              {editing && draft ? (
                <TextWithProvenanceField<DocumentStatistic>
                  items={draft.statistics}
                  addLabel="statistic"
                  emptyItem={{ id: crypto.randomUUID(), text: "", value: null, provenance: [] }}
                  onChange={items => setDraft({ ...draft, statistics: items })}
                  renderProvenance={item => <ProvenanceBadges provenance={item.provenance} />}
                />
              ) : (
                <div className="space-y-3">
                  {current.statistics.length === 0 && <p className="text-sm text-gray-400">None extracted.</p>}
                  {current.statistics.map(s => (
                    <div key={s.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <div className="flex items-baseline gap-2">
                        {s.value && <span className="text-sm font-bold" style={{ color: NAVY }}>{s.value}</span>}
                        <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
                      </div>
                      <ProvenanceBadges provenance={s.provenance} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Recommendations" tone="positive">
              {editing && draft ? (
                <TextWithProvenanceField<DocumentRecommendation>
                  items={draft.document_recommendations}
                  addLabel="recommendation"
                  emptyItem={{ id: crypto.randomUUID(), text: "", provenance: [] }}
                  onChange={items => setDraft({ ...draft, document_recommendations: items })}
                  renderProvenance={item => <ProvenanceBadges provenance={item.provenance} />}
                />
              ) : (
                <div className="space-y-3">
                  {current.document_recommendations.length === 0 && <p className="text-sm text-gray-400">None extracted — the document makes no explicit recommendations of its own.</p>}
                  {current.document_recommendations.map(r => (
                    <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                      <ProvenanceBadges provenance={r.provenance} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Quotes" tone="difference">
              {editing && draft ? (
                <QuotesField items={draft.quotes} onChange={items => setDraft({ ...draft, quotes: items })} />
              ) : (
                <div className="space-y-3">
                  {current.quotes.length === 0 && <p className="text-sm text-gray-400">None selected.</p>}
                  {current.quotes.map(q => (
                    <div key={q.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <p className="text-sm text-gray-700 italic leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {q.attribution && <span>{q.attribution}</span>}
                        {q.attribution && q.theme && <span> · </span>}
                        {q.theme && <span>Theme: {q.theme}</span>}
                      </p>
                      <ProvenanceBadges provenance={q.provenance} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Methodology" tone="neutral">
              {editing && draft ? (
                <ListField items={draft.methodology_notes.map(m => m.text)} addLabel="methodology note"
                  onChange={texts => setDraft({ ...draft, methodology_notes: texts.map((text, i) => ({ id: draft.methodology_notes[i]?.id ?? crypto.randomUUID(), text })) })} />
              ) : (
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                  {current.methodology_notes.length === 0 && <p className="text-sm text-gray-400 list-none">Not disclosed.</p>}
                  {current.methodology_notes.map(m => <li key={m.id}>{m.text}</li>)}
                </ul>
              )}
            </Section>

            <Section title="Author-Disclosed Limitations" tone="difference">
              <p className="text-xs text-gray-400 mb-3">Limitations the document itself admits to — see Research Quality Assessment below for gaps Fanometrix identified independently, whether or not the author disclosed them.</p>
              {editing && draft ? (
                <ListField items={draft.limitations.map(l => l.text)} addLabel="limitation"
                  onChange={texts => setDraft({ ...draft, limitations: texts.map((text, i) => ({ id: draft.limitations[i]?.id ?? crypto.randomUUID(), text })) })} />
              ) : (
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                  {current.limitations.length === 0 && <p className="text-sm text-gray-400 list-none">The document discloses no limitations of its own.</p>}
                  {current.limitations.map(l => <li key={l.id}>{l.text}</li>)}
                </ul>
              )}
            </Section>

            <Section title="Fanometrix Quality Assessment" tone="neutral">
              <p className="text-xs text-gray-400 mb-3">Fanometrix&rsquo;s own independent assessment of methodology, sample, geography and dates — regardless of what the author disclosed above.</p>
              {editing && draft ? (
                <ResearchQualityField
                  value={draft.research_quality}
                  onChange={v => setDraft({ ...draft, research_quality: v })}
                />
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <EvidenceStrengthBadge strength={current.research_quality.evidence_strength} />
                    <span className="text-xs text-gray-400">Source type: {current.research_quality.source_type}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">{current.research_quality.rationale}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {(([
                      ["methodology_disclosed", "Methodology"],
                      ["sample_size_disclosed", "Sample size"],
                      ["geography_disclosed", "Geography"],
                      ["fieldwork_dates_disclosed", "Fieldwork dates"],
                      ["demographic_definitions_disclosed", "Demographic definitions"],
                    ] as const)).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs">
                        <span className={current.research_quality[key] ? "text-green-600" : "text-gray-300"}>{current.research_quality[key] ? "✓" : "✗"}</span>
                        <span className="text-gray-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {(current.author_perspective || editing) && (
              <Section title="Author Perspective" tone="navy">
                <p className="text-xs text-gray-400 mb-3">Context on who produced this research and how it relates to their own business — not an assessment of validity.</p>
                {editing && draft ? (
                  <AuthorPerspectiveField value={draft.author_perspective} onChange={v => setDraft({ ...draft, author_perspective: v })} />
                ) : current.author_perspective ? (
                  <div className="rounded-xl p-4" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                    {current.author_perspective.publisher_description && (
                      <p className="text-sm text-gray-700 leading-relaxed mb-2">{current.author_perspective.publisher_description}</p>
                    )}
                    {current.author_perspective.commercial_interest_note && (
                      <p className="text-sm text-gray-700 leading-relaxed mb-2">{current.author_perspective.commercial_interest_note}</p>
                    )}
                    <p className="text-sm text-gray-600 leading-relaxed italic">{current.author_perspective.independence_note}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No publisher context available for this document.</p>
                )}
              </Section>
            )}

            {!editing && row.reviewed_by && (
              <div className="text-xs text-gray-400 text-center">
                {row.status === "approved" ? "Approved" : "Reviewed"} by {row.reviewed_by} on {new Date(row.reviewed_at!).toLocaleDateString("en-GB")}
              </div>
            )}
          </div>
        )}

        {confirmRegen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Re-analyse this document?</h2>
              <p className="text-sm text-gray-500 mb-5">
                This document already has a {row?.status} analysis. Re-analysing replaces it with a new draft version, any edits or approval will be lost — the previous version is kept for audit, not shown here.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmRegen(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                  Cancel
                </button>
                <button onClick={() => { setConfirmRegen(false); generate(true); }}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: NAVY, color: GOLD }}>
                  Re-analyse
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

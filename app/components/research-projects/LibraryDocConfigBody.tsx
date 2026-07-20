"use client";

// The Research Library document view mounted inside a Research Project
// (Research context). Following "Research configures / organises, Analysis
// interprets": a document isn't collected or run, it's an artifact already in
// the Library, so Research shows its DETAILS and how it's organised in this
// project (identity, classification, file), and points to Analysis for the
// Document Intelligence (findings, statistics, quality assessment). The rich
// AI-interpretation review stays in Analysis / the standalone Library page.
//
// Same record, no duplication: reads/writes the same /api/library-documents/[id]
// the standalone page reads. A library_document is ONE global record shared by
// every project that attaches it, so metadata edits here apply everywhere; the
// UI says so (usage notice + a confirm on confidentiality) and the API audits
// each change. Editing is limited to admins + publishers (the research
// curators); everyone else sees a read-only view.
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { useSession } from "@/app/components/SessionProvider";
import { DOCUMENT_TYPES, CONFIDENTIALITY_LEVELS, COMMON_DOCUMENT_TAGS, normaliseTag } from "@/lib/library-documents/constants";
import {
  OWNER_LABEL, OWNERS, VISIBILITY_LABEL, VISIBILITIES, LEARNING_LABEL, LEARNING_PERMISSIONS,
  AI_ACCESS_LABEL, AI_ACCESSES, CONFIDENTIALITY_LABEL, type DocumentOwner, type DocumentConfidentiality,
} from "@/lib/library-documents/governance";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, SectionHeading, Button, Icon, BackLink,
} from "@/app/components/workspace-ui";
import { documentStatusMeta, isProcessing, DocumentProcessing } from "@/app/components/research-projects/document-status";

type Doc = {
  id: string; title: string; author: string | null; document_type: string; status: string;
  original_filename: string; page_count: number | null; pages_done: number | null; tags: string[];
  uploaded_by: string | null; uploaded_at: string; approved_at: string | null;
  confidentiality: string; description: string | null; preview_url: string | null;
  error_message: string | null; project_usage_count: number;
  owner: string; owner_org_id: string | null; visibility: string; learning_permission: string; ai_access: string;
};

// ── Small form primitives (shared UI v2 language) ────────────────────────────
const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="text-sm mt-1 leading-snug break-words" style={{ color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB");

type EditForm = {
  title: string; author: string; document_type: string; confidentiality: string; description: string; tags: string[];
  owner: string; owner_org_id: string; visibility: string; learning_permission: string; ai_access: string;
};

export function LibraryDocConfigBody({ documentId, backHref, backLabel }: {
  documentId: string;
  backHref: string;
  backLabel: string;
}) {
  const { projectId, project } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type: string }[]>([]);
  const orgName = (id: string | null) => (id ? orgs.find(o => o.id === id)?.name ?? "Unknown organisation" : null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({ title: "", author: "", document_type: "other", confidentiality: "internal", description: "", tags: [], owner: "fanometrix", owner_org_id: "", visibility: "internal", learning_permission: "no_learning", ai_access: "internal" });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); }

  const load = useCallback(async () => {
    try {
      const json = await fetch(`/api/library-documents/${documentId}`).then(r => r.json());
      if (!json.data) { setNotFound(true); return; }
      setDoc(json.data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  // Organisations — for the owner-organisation selector (governance).
  useEffect(() => {
    fetch("/api/organisations").then(r => (r.ok ? r.json() : null)).then(j => {
      const list = Array.isArray(j) ? j : (j?.data ?? j?.organisations ?? []);
      setOrgs((list ?? []).map((o: { id: string; name: string; type?: string }) => ({ id: o.id, name: o.name, type: o.type ?? "" })));
    }).catch(() => {});
  }, []);

  // Poll while the document is still processing so the loader advances live and
  // flips to Ready on its own. Stops as soon as it's Ready or Failed.
  useEffect(() => {
    if (!doc || !isProcessing(doc.status)) return;
    const t = setInterval(() => { load(); }, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  useEffect(() => {
    setRecordLabel(doc?.title ?? null);
    return () => setRecordLabel(null);
  }, [doc?.title, setRecordLabel]);

  function startEdit() {
    if (!doc) return;
    setForm({
      title: doc.title,
      author: doc.author ?? "",
      document_type: doc.document_type,
      confidentiality: doc.confidentiality || "internal",
      description: doc.description ?? "",
      tags: doc.tags ?? [],
      owner: doc.owner || "fanometrix",
      owner_org_id: doc.owner_org_id ?? "",
      visibility: doc.visibility || "internal",
      learning_permission: doc.learning_permission || "no_learning",
      ai_access: doc.ai_access || "internal",
    });
    setTagInput("");
    setEditing(true);
  }

  function addTag(raw: string) {
    const t = normaliseTag(raw);
    setTagInput("");
    if (!t) return;
    setForm(f => f.tags.some(x => x.toLowerCase() === t.toLowerCase()) ? f : { ...f, tags: [...f.tags, t] });
  }
  function removeTag(t: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }));
  }

  const governanceChanged = (d: Doc, f: EditForm) =>
    f.confidentiality !== d.confidentiality || f.owner !== d.owner ||
    (f.owner_org_id || null) !== (d.owner_org_id ?? null) || f.visibility !== d.visibility ||
    f.learning_permission !== d.learning_permission || f.ai_access !== d.ai_access;

  function onSaveClick() {
    if (!doc) return;
    if (!form.title.trim()) { showToast("Title cannot be empty.", false); return; }
    if (form.owner !== "fanometrix" && form.owner !== "public" && !form.owner_org_id) {
      showToast("Select the owning organisation for this owner type.", false); return;
    }
    // A governance change alters the document's access posture for every project
    // using it — confirm before saving.
    if (governanceChanged(doc, form)) { setConfirmOpen(true); return; }
    doSave();
  }

  async function doSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/library-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          author: form.author.trim() || null,
          document_type: form.document_type,
          confidentiality: form.confidentiality,
          description: form.description.trim() || null,
          tags: form.tags,
          owner: form.owner,
          owner_org_id: (form.owner === "fanometrix" || form.owner === "public") ? null : (form.owner_org_id || null),
          visibility: form.visibility,
          learning_permission: form.learning_permission,
          ai_access: form.ai_access,
          project_context: projectId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(json.error ?? "Couldn't save changes.", false); setSaving(false); return; }
      await load();
      setEditing(false);
      setConfirmOpen(false);
      showToast("Document details saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageContainer><PageLoadingState lines={2} /></PageContainer>;
  if (notFound || !doc) return (
    <PageContainer>
      <ErrorState title="Document not found" description="This document couldn't be loaded." backHref={backHref} backLabel={backLabel.replace(/^←\s*/, "")} />
    </PageContainer>
  );

  const typeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label ?? doc.document_type;
  const status = documentStatusMeta(doc.status);
  // AI metadata (summary, author-if-derived, tags) only exists once processing
  // finishes; while processing we show a "generating" hint instead of a blank
  // or a premature "unknown", and only hide it once a completed document
  // genuinely has none. Manual fields (type, pages, uploaded, file) are shown
  // immediately regardless.
  const processing = isProcessing(doc.status);
  const usage = doc.project_usage_count ?? 0;
  const usageProjects = `${usage} Research ${usage === 1 ? "Project" : "Projects"}`;
  // The document's Intelligence lives in Analysis (per-evidence report). Find
  // this document's evidence row to deep-link there; fall back to Analysis.
  const evidenceRow = project?.evidence.find(e => e.evidence_type === "document" && e.evidence_id === documentId);
  const analysisHref = evidenceRow
    ? `/research-projects/${projectId}/analysis/document/${evidenceRow.id}`
    : `/research-projects/${projectId}/analysis`;

  return (
    <PageContainer>
      {/* Centred between the breadcrumb and the title: equal space above and
          below (pt-6 above from the container + this pb below). */}
      <BackLink href={backHref} label={backLabel} className="mb-2" />

      <WorkspaceHeader
        title={doc.title}
        status={{ label: status.label, tone: status.tone, dot: true }}
        description="How this document is organised in the project. Its findings are interpreted in Analysis."
        primaryAction={doc.preview_url
          ? <a href={doc.preview_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2 font-semibold transition-colors flex-shrink-0"
              style={{ background: "var(--brand-navy)", color: "var(--accent-gold)", borderRadius: "var(--radius-control)" }}>
              View file →
            </a>
          : undefined}
      />

      {/* Research shows only the current state as a header badge. The
          operational processing pipeline lives in Execution; a failure is
          the one thing worth calling out here. */}
      {doc.status === "failed" ? (
        <div className="rounded-xl border p-4" style={{ background: "#F9EFEA", borderColor: "#E8D2C4" }}>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ background: "var(--surface)", color: "#B4694C", border: "1px solid #E8D2C4" }} aria-hidden><Icon.info size={16} /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Processing failed</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{doc.error_message || "The document couldn't be read or analysed."}</p>
            </div>
          </div>
        </div>
      ) : isProcessing(doc.status) ? (
        <Card>
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Preparing this document…</p>
          <DocumentProcessing status={doc.status} pageCount={doc.page_count} pagesDone={doc.pages_done} />
          <p className="text-xs mt-3.5" style={{ color: "var(--text-tertiary)" }}>
            Reading the document and extracting its findings automatically — this usually takes under a minute. The summary appears here when it&apos;s ready.
          </p>
        </Card>
      ) : null}

      {/* Details — read-only for most; admins + publishers can edit metadata. */}
      <Card>
        <SectionHeading
          title={editing ? "Edit details" : "Details"}
          action={canManage && !editing ? <Button variant="secondary" size="sm" onClick={startEdit}>Edit</Button> : undefined}
        />

        {!editing ? (
          <>
            {/* Summary — the abstract at the top of the document: what it is,
                its key findings, why it matters. Auto-generated (a concise AI
                overview, not extracted text); editable by hand. Rendered as
                short paragraphs when it spans more than one. */}
            {doc.description ? (
              <div className="mt-4 space-y-2.5">
                {doc.description.split(/\n{2,}/).map((para, i) => para.trim() && (
                  <p key={i} className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{para.trim()}</p>
                ))}
              </div>
            ) : processing ? (
              <p className="text-sm mt-4 italic leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Your summary will appear here once processing completes.</p>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-4 mt-5">
              <Detail label="Author">{doc.author ? doc.author : <span className="italic" style={{ color: "var(--text-tertiary)" }}>{processing ? "Generating…" : "Author unknown"}</span>}</Detail>
              <Detail label="Type">{typeLabel}</Detail>
              <Detail label="Pages">{doc.page_count ?? "—"}</Detail>
              <Detail label="File">{doc.original_filename || "—"}</Detail>
              <Detail label="Uploaded by">{doc.uploaded_by || "—"}</Detail>
              <Detail label="Uploaded">{fmtDate(doc.uploaded_at)}</Detail>
            </div>

            {/* Governance — how this document is owned and permissioned. */}
            <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span aria-hidden style={{ color: "var(--text-tertiary)" }}><Icon.info size={13} /></span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Governance</p>
                {doc.confidentiality === "nda_restricted" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: "#8A4B33", background: "#F9EFEA", border: "1px solid #E8D2C4" }}>NDA Restricted</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-4">
                <Detail label="Owner">{OWNER_LABEL[(doc.owner || "fanometrix") as DocumentOwner] ?? doc.owner}</Detail>
                {doc.owner_org_id && <Detail label="Organisation">{orgName(doc.owner_org_id) ?? "—"}</Detail>}
                <Detail label="Confidentiality">{CONFIDENTIALITY_LABEL[(doc.confidentiality || "internal") as DocumentConfidentiality] ?? doc.confidentiality}</Detail>
                <Detail label="Visibility">{VISIBILITY_LABEL[doc.visibility as keyof typeof VISIBILITY_LABEL] ?? doc.visibility}</Detail>
                <Detail label="Learning">{LEARNING_LABEL[doc.learning_permission as keyof typeof LEARNING_LABEL] ?? doc.learning_permission}</Detail>
                <Detail label="AI access">{AI_ACCESS_LABEL[doc.ai_access as keyof typeof AI_ACCESS_LABEL] ?? doc.ai_access}</Detail>
              </div>
            </div>
            {doc.tags.length > 0 ? (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Tags</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {doc.tags.map(t => (
                    <span key={t} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{t}</span>
                  ))}
                </div>
              </div>
            ) : processing ? (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Tags</p>
                <p className="text-sm mt-2 italic" style={{ color: "var(--text-tertiary)" }}>Generating…</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Shared-object notice — edits apply everywhere this doc is used. */}
            <div className="rounded-lg p-3 flex items-start gap-2.5" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
              <span className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} aria-hidden><Icon.info size={15} /></span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                This document is used in <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{usageProjects}</span>. It&apos;s a shared Library asset, so changes apply everywhere it&apos;s used, not just this project.
              </p>
            </div>

            <Field label="Display title">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="Document title" />
            </Field>

            <Field label="Author">
              <input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="Author or byline (leave blank if unknown)" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Document type">
                <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                  onFocus={focusGold} onBlur={blurGold}
                  className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                  {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Confidentiality">
                <select value={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: e.target.value }))}
                  onFocus={focusGold} onBlur={blurGold}
                  className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                  {CONFIDENTIALITY_LEVELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>

            {/* Governance — ownership / visibility / learning / AI access. */}
            <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Governance</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Owner">
                  <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold} className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                    {OWNERS.map(o => <option key={o} value={o}>{OWNER_LABEL[o]}</option>)}
                  </select>
                </Field>
                {form.owner !== "fanometrix" && form.owner !== "public" && (
                  <Field label="Owning organisation">
                    <select value={form.owner_org_id} onChange={e => setForm(f => ({ ...f, owner_org_id: e.target.value }))}
                      onFocus={focusGold} onBlur={blurGold} className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                      <option value="">Select organisation…</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}{o.type ? ` · ${o.type}` : ""}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Visibility">
                  <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold} className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                    {VISIBILITIES.map(v => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                  </select>
                </Field>
                <Field label="Learning permission">
                  <select value={form.learning_permission} onChange={e => setForm(f => ({ ...f, learning_permission: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold} className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                    {LEARNING_PERMISSIONS.map(l => <option key={l} value={l}>{LEARNING_LABEL[l]}</option>)}
                  </select>
                </Field>
                <Field label="AI access">
                  <select value={form.ai_access} onChange={e => setForm(f => ({ ...f, ai_access: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold} className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}>
                    {AI_ACCESSES.map(a => <option key={a} value={a}>{AI_ACCESS_LABEL[a]}</option>)}
                  </select>
                </Field>
              </div>
              {form.confidentiality === "nda_restricted" && (
                <p className="text-xs leading-relaxed" style={{ color: "#8A4B33" }}>
                  NDA Restricted: this document can only be attached to the owning organisation&apos;s projects, never appears elsewhere, and never contributes to platform intelligence or benchmarks.
                </p>
              )}
            </div>

            <Field label="Description">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold} rows={3}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="Optional. What this document contains, or why it was added to the project." />
            </Field>

            <Field label="Tags">
              <div className="flex flex-wrap gap-2">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
                  onFocus={focusGold} onBlur={blurGold}
                  list="doc-tag-suggestions"
                  className="flex-1 min-w-[180px] px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                  placeholder="Add a tag and press Enter" />
                <Button variant="secondary" onClick={() => addTag(tagInput)}>Add</Button>
              </div>
              <datalist id="doc-tag-suggestions">
                {COMMON_DOCUMENT_TAGS.map(t => <option key={t} value={t} />)}
              </datalist>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {form.tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                      {t}
                      <button onClick={() => removeTag(t)} className="hover:opacity-70" style={{ color: "var(--text-tertiary)" }} aria-label={`Remove ${t}`}><Icon.close size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>Suggested automatically when a document is processed. Edit freely, your tags won&apos;t be overwritten.</p>
            </Field>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Original filename (read-only)</p>
              <p className="text-sm mt-1 break-words" style={{ color: "var(--text-tertiary)" }}>{doc.original_filename || "—"}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={onSaveClick} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Research manages and organises evidence only. A document's
          intelligence (findings, statistics, quality) is produced in
          Execution and interpreted in Analysis — a quiet pointer, not a
          presentation of AI output here. */}
      <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        This document&apos;s findings are interpreted in{" "}
        <Link href={analysisHref} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</Link>
      </p>

      {/* Governance change confirmation — edits that alter the document's access
          posture apply across every project using it. */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => !saving && setConfirmOpen(false)}>
          <div className="w-full max-w-md p-5 shadow-2xl" style={{ background: "var(--surface)", borderRadius: "var(--radius-panel)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Change access &amp; governance?</h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              You&apos;re changing this document&apos;s ownership or permissions. This alters where it can be used and who can access it —
              it&apos;s a shared Library asset used in <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{usageProjects}</span>, and the change applies to all of them.
              {form.confidentiality === "nda_restricted" && " Marking it NDA Restricted will detach it from any project outside its owning organisation on future re-checks."}
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={doSave} disabled={saving}>{saving ? "Saving…" : "Confirm & save"}</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ borderRadius: "var(--radius-panel)" }}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </PageContainer>
  );
}

"use client";

// ── Manage → Study → Findings ────────────────────────────────────────────────
// Durable, human-owned research conclusions. Draft / Published. Evidence is frozen
// at creation and shown as faithful provenance (never raw refs/JSON). Analysts edit
// prose and publish; publishing never changes the numbers beneath a conclusion.

import { useCallback, useEffect, useState } from "react";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";

type EvidenceView = { position: number; ref: string; evidenceClass: "base" | "derived" | "segment"; question: string; label: string; optionLabel: string | null; count: number | null; base: number | null; percentage: number | null; scope: string | null; surveyId: string | null; surveyName: string | null; resultMode: string | null; dimension: string | null };
type Source = { id: string; name: string };
type Card0 = { id: string; headline: string; status: string; originType: string; evidenceCount: number; createdBy: string | null; createdAt: string; publishedBy: string | null; publishedAt: string | null; sources: Source[]; headEvidence: EvidenceView | null };
type Detail = { finding: { id: string; headline: string; commentary: string | null; status: string; origin_type: string; created_by: string | null; created_at: string; published_by: string | null; published_at: string | null }; evidence: EvidenceView[]; sources: Source[] };

const num = (n: number) => n.toLocaleString();
const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

export function StudyFindings({ studyId }: { studyId: string }) {
  const [cards, setCards] = useState<Card0[] | null | "error">(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/findings`);
      if (!r.ok) { setCards("error"); return; }
      const j = await r.json();
      setCards(j.findings as Card0[]);
    } catch { setCards("error"); }
  }, [studyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(); }, [load]);

  if (cards == null) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (cards === "error") return <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Findings are unavailable for this study.</p></Card>;

  const drafts = cards.filter((c) => c.status === "draft");
  const published = cards.filter((c) => c.status === "published");

  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Findings are human-owned research conclusions backed by frozen evidence. <strong style={{ color: "var(--text-secondary)" }}>Drafts</strong> are still in review and can be edited. <strong style={{ color: "var(--text-secondary)" }}>Published</strong> findings are approved as this study&apos;s governed intelligence. Add them from an analysis proposal, or from a result in Results. Publishing never changes the evidence.
      </p>
      {cards.length === 0 && <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No findings yet. In Analysis, add a proposal to your findings — or use &ldquo;＋ Finding&rdquo; on a result in Results.</p></Card>}

      {drafts.length > 0 && <Section title={`Drafts (${drafts.length}) · in review`} cards={drafts} onOpen={setOpenId} />}
      {published.length > 0 && <Section title={`Published (${published.length}) · approved intelligence`} cards={published} onOpen={setOpenId} />}

      {openId && <FindingDetail studyId={studyId} findingId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function Section({ title, cards, onOpen }: { title: string; cards: Card0[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
      <div className="space-y-2">
        {cards.map((c) => (
          <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
            <Card interactive padding="lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <StatusBadge label={c.status === "published" ? "Published" : "Draft"} tone={c.status === "published" ? "success" : "neutral"} dot />
                  <h4 className="text-[15px] font-bold tracking-[-0.01em] mt-1.5" style={{ color: "var(--text-primary)" }}>{c.headline}</h4>
                  {/* Evidence PROVES the finding. Base = a big number + option; derived/segment
                      = the governed computed fact (a clean sentence, no refs). */}
                  {c.headEvidence && c.headEvidence.evidenceClass === "base" ? (
                    <>
                      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                        {c.headEvidence.percentage != null && <span className="text-[26px] font-bold tracking-[-0.03em] leading-none tabular-nums" style={{ color: "var(--accent-gold)" }}>{pct(c.headEvidence.percentage)}</span>}
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{c.headEvidence.optionLabel}</span>
                      </div>
                      <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        {num(c.headEvidence.count ?? 0)} of {num(c.headEvidence.base ?? 0)} · {c.headEvidence.scope === "combined" ? `combined across ${c.sources.length || 2} surveys` : c.headEvidence.surveyName}{c.evidenceCount > 1 ? ` · +${c.evidenceCount - 1} more piece${c.evidenceCount - 1 === 1 ? "" : "s"} of evidence` : ""}
                      </p>
                    </>
                  ) : c.headEvidence ? (
                    <>
                      <p className="text-sm mt-2 leading-snug" style={{ color: "var(--text-secondary)" }}>{c.headEvidence.label}</p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        {c.headEvidence.evidenceClass === "segment" ? "Audience comparison" : "Computed from survey results"}{c.evidenceCount > 1 ? ` · +${c.evidenceCount - 1} more piece${c.evidenceCount - 1 === 1 ? "" : "s"} of evidence` : ""}
                      </p>
                    </>
                  ) : null}
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                    {[c.originType === "manual" ? "Manual" : "From analysis", `Created ${when(c.createdAt)}`, c.publishedAt ? `Published ${when(c.publishedAt)}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{c.status === "published" ? "View" : "Review"}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function FindingDetail({ studyId, findingId, onClose, onChanged }: { studyId: string; findingId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState("");
  const [commentary, setCommentary] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/studio/studies/${studyId}/findings/${findingId}`);
    if (r.ok) { const j = (await r.json()) as Detail; setD(j); setHeadline(j.finding.headline); setCommentary(j.finding.commentary ?? ""); }
  }, [studyId, findingId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    if (busy) return; setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/findings/${findingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || "Action failed."); return; }
      setEditing(false); await load(); onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        {!d ? <Skeleton className="h-64" /> : (
          <>
            <div className="flex items-center justify-between gap-2">
              <StatusBadge label={d.finding.status === "published" ? "Published" : "Draft"} tone={d.finding.status === "published" ? "success" : "neutral"} dot />
              <button type="button" onClick={onClose} className="text-sm" style={{ color: "var(--text-tertiary)" }} aria-label="Close">✕</button>
            </div>

            {editing ? (
              <div className="mt-3 space-y-2">
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full px-3 py-2 text-sm font-semibold rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} rows={4} placeholder="Commentary / narrative" className="w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Only the wording is editable. Evidence stays fixed.</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold tracking-[-0.01em] mt-2" style={{ color: "var(--text-primary)" }}>{d.finding.headline}</h3>
                {d.finding.commentary && <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.finding.commentary}</p>}
              </>
            )}

            {/* Lead evidence — prominent, proves the finding (base = stat; derived/segment = fact) */}
            {d.evidence[0] && d.evidence[0].evidenceClass !== "base" && (
              <div className="mt-4 rounded-[var(--radius-panel)] p-3" style={{ background: "var(--surface-muted, rgba(0,0,0,0.03))" }}>
                <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{d.evidence[0].label}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{d.evidence[0].evidenceClass === "segment" ? "Audience comparison across markets" : "Computed deterministically from survey results"} · {d.evidence[0].question}</p>
              </div>
            )}
            {d.evidence[0] && d.evidence[0].evidenceClass === "base" && (
              <div className="mt-4 rounded-[var(--radius-control)] p-3" style={{ background: "var(--accent-wash)" }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  {d.evidence[0].percentage != null && <span className="text-[34px] font-bold tracking-[-0.03em] leading-none tabular-nums" style={{ color: "var(--accent-gold)" }}>{pct(d.evidence[0].percentage)}</span>}
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{d.evidence[0].optionLabel}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{num(d.evidence[0].count ?? 0)} of {num(d.evidence[0].base ?? 0)} completed responses · {d.evidence[0].scope === "combined" ? "combined across surveys" : d.evidence[0].surveyName}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{d.evidence[0].question}</p>
              </div>
            )}

            {/* Full provenance — faithful, no raw refs. Base = the statistic; derived/segment
                = the governed computed fact sentence. */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: "var(--text-tertiary)" }}>Supported by {d.evidence.length} piece{d.evidence.length === 1 ? "" : "s"} of evidence</p>
              <ol className="space-y-2">
                {d.evidence.map((e) => (
                  <li key={e.position} className="text-sm">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{e.position + 1}. {e.question}</span>
                    {e.evidenceClass === "base" ? (
                      <>
                        <div style={{ color: "var(--text-secondary)" }}>{e.optionLabel} — <span className="tabular-nums">{pct(e.percentage)} · {num(e.count ?? 0)} of {num(e.base ?? 0)} completed responses</span></div>
                        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{e.scope === "combined" ? "Combined across surveys" : e.surveyName}{e.resultMode === "historical" ? " · historical" : ""}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ color: "var(--text-secondary)" }}>{e.label}</div>
                        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{e.evidenceClass === "segment" ? "Audience comparison across markets" : "Computed deterministically from survey results"}</div>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>
                {d.sources.length ? `Sources: ${d.sources.map((s) => s.name).join(", ")} · ` : ""}Evidence captured {when(d.finding.created_at)}
                {d.finding.published_at ? ` · Published ${when(d.finding.published_at)}${d.finding.published_by ? ` by ${d.finding.published_by}` : ""}` : ""}
              </p>
            </div>

            {note && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{note}</p>}

            {!editing && d.finding.status === "draft" && (
              <p className="text-[11px] mt-4" style={{ color: "var(--text-tertiary)" }}>Publishing approves this as governed study intelligence. The frozen evidence above stays exactly as shown.</p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              {editing ? (
                <>
                  <Button onClick={() => { setEditing(false); setHeadline(d.finding.headline); setCommentary(d.finding.commentary ?? ""); }} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
                  <Button onClick={() => patch({ action: "edit", headline, commentary })} variant="primary" size="sm" disabled={busy || !headline.trim()}>Save</Button>
                </>
              ) : (
                <>
                  <Button onClick={() => setEditing(true)} variant="ghost" size="sm" disabled={busy}>Edit</Button>
                  {d.finding.status === "draft" && <Button onClick={() => patch({ action: "publish" })} variant="primary" size="sm" disabled={busy}>Publish finding</Button>}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

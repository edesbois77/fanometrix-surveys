"use client";

// ── Manage → Study → Results ─────────────────────────────────────────────────
// Cross-Survey evidence review: an analyst reads 1..N Surveys' results without
// opening each Survey. Comparability is server-proven; this surface only renders
// combined / side-by-side / separate groups and never combines anything itself.

import { useEffect, useState } from "react";
import { Card, StatusBadge, Skeleton, Button } from "@/app/components/workspace-ui";
import { evidenceRef } from "@/lib/studio/study-analysis";

type Pick = { ref: string; label: string };

type OptionResult = { optionId: string; label: string; count: number; percentage: number | null };
type Source = {
  surveyId: string; surveyName: string; questionIndex: number; questionId: string; label: string;
  resultMode: "historical" | "studio_native"; completedResponses: number; base: number; shown: number | null;
  displayLanguage: string; options: OptionResult[];
};
type Combined = { base: number; options: OptionResult[]; sourceCount: number };
type Group = { canonicalQuestionKey: string; label: string; comparability: "combined" | "side_by_side" | "separate"; combined: Combined | null; sources: Source[] };
type Payload = {
  study: { id: string; name: string; objective: string | null; status: string; surveyCount: number; completedResponses: number };
  resultGroups: Group[];
  surveys: { surveyId: string; surveyName: string; resultMode: string; completedResponses: number; questionCount: number }[];
};

const num = (n: number) => n.toLocaleString();
const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

export function StudyResults({ studyId }: { studyId: string }) {
  const [data, setData] = useState<Payload | null | "error">(null);
  const [pick, setPick] = useState<Pick | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/studies/${studyId}/results`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (!cancelled) setData(j as Payload); }).catch(() => { if (!cancelled) setData("error"); });
    return () => { cancelled = true; };
  }, [studyId]);

  if (data == null) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (data === "error") return <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Results are unavailable for this study.</p></Card>;

  const anyResults = data.resultGroups.some((g) => g.sources.some((s) => s.base > 0));
  const sid = data.study.id; // ref identity uses the resolved study id (matches the server)
  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {num(data.study.completedResponses)} completed responses across {data.study.surveyCount} survey{data.study.surveyCount === 1 ? "" : "s"}. Each question&apos;s base is its own answered count, not the study total. Combined figures pool answer counts only where the questions are directly comparable. Use &ldquo;＋ Finding&rdquo; to capture a result as a manual finding.
      </p>
      {!anyResults ? (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No answered results yet in this study&apos;s surveys.</p></Card>
      ) : data.resultGroups.map((g) => <GroupCard key={g.canonicalQuestionKey} group={g} studyId={sid} onPick={setPick} />)}

      {pick && <CreateFindingModal studyId={studyId} pick={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function GroupCard({ group, studyId, onPick }: { group: Group; studyId: string; onPick: (p: Pick) => void }) {
  const [view, setView] = useState<"combined" | "by_survey">("combined");
  const badge =
    group.comparability === "combined" ? { label: `Combined from ${group.combined?.sourceCount ?? group.sources.length} surveys`, tone: "success" as const }
    : group.comparability === "side_by_side" ? { label: `Compare ${group.sources.length} surveys`, tone: "neutral" as const }
    : { label: "Survey-specific", tone: "neutral" as const };

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{group.label || "Untitled question"}</h3>
        <StatusBadge label={badge.label} tone={badge.tone} dot />
      </div>

      {/* COMBINED — pooled distribution is the primary view; source breakdown on demand */}
      {group.comparability === "combined" && group.combined && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{num(group.combined.base)} answered across {group.combined.sourceCount} surveys</p>
            <div className="inline-flex rounded-[var(--radius-control)] overflow-hidden border" style={{ borderColor: "var(--border-default)" }}>
              {(["combined", "by_survey"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className="px-2.5 py-1 text-xs font-medium transition-colors"
                  style={view === v ? { background: "var(--accent-wash)", color: "var(--text-primary)" } : { color: "var(--text-secondary)" }}>
                  {v === "combined" ? "Combined" : "By survey"}
                </button>
              ))}
            </div>
          </div>
          {view === "combined" ? (
            <Distribution options={group.combined.options}
              refFor={(oid) => evidenceRef(studyId, group.canonicalQuestionKey, oid, "combined")}
              onPick={onPick} groupLabel={group.label} scopeLabel="combined across surveys" />
          ) : (
            <div className="mt-2 space-y-3">
              {group.sources.map((s) => <SourceBlock key={s.surveyId} source={s} group={group} studyId={studyId} onPick={onPick} />)}
            </div>
          )}
        </div>
      )}

      {/* SIDE BY SIDE — comparable concept, kept separated (never pooled) */}
      {group.comparability === "side_by_side" && (
        <div className="mt-3">
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>These questions share an identity but use different answer options, so results are shown separately.</p>
          <div className="space-y-3">{group.sources.map((s) => <SourceBlock key={s.surveyId} source={s} group={group} studyId={studyId} onPick={onPick} />)}</div>
        </div>
      )}

      {/* SEPARATE — a single Survey's own result */}
      {group.comparability === "separate" && (
        <div className="mt-3">{group.sources.map((s) => <SourceBlock key={s.surveyId} source={s} group={group} studyId={studyId} onPick={onPick} single />)}</div>
      )}
    </Card>
  );
}

function SourceBlock({ source, group, studyId, onPick, single }: { source: Source; group: Group; studyId: string; onPick: (p: Pick) => void; single?: boolean }) {
  return (
    <div>
      {!single && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: "var(--text-tertiary)" }}>
          {source.surveyName} · n={num(source.base)}{source.resultMode === "historical" ? " · historical" : ""}
        </p>
      )}
      {single && (
        <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>{num(source.base)} answered{source.resultMode === "historical" ? " · historical" : ""}</p>
      )}
      <Distribution options={source.options}
        refFor={(oid) => evidenceRef(studyId, group.canonicalQuestionKey, oid, "survey", source.surveyId)}
        onPick={onPick} groupLabel={group.label} scopeLabel={source.surveyName} />
    </div>
  );
}

function Distribution({ options, refFor, onPick, groupLabel, scopeLabel }: { options: OptionResult[]; refFor: (optionId: string) => string; onPick: (p: Pick) => void; groupLabel: string; scopeLabel: string }) {
  const max = Math.max(1, ...options.map((o) => o.count));
  return (
    <div className="mt-2 space-y-1.5">
      {options.map((o) => (
        <div key={o.optionId} className="group flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{o.label || `Option ${o.optionId}`}</span>
              <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{pct(o.percentage)} · {num(o.count)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle, rgba(0,0,0,0.06))" }}>
              <div className="h-full rounded-full" style={{ width: `${(o.count / max) * 100}%`, background: "var(--accent-gold)" }} />
            </div>
          </div>
          <button type="button"
            onClick={() => onPick({ ref: refFor(o.optionId), label: `${groupLabel} — ${o.label || `Option ${o.optionId}`} (${pct(o.percentage)} · ${num(o.count)}, ${scopeLabel})` })}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] px-1.5 py-0.5 rounded transition-opacity flex-shrink-0"
            style={{ color: "var(--accent-gold)" }} title="Create a manual finding from this result">＋ Finding</button>
        </div>
      ))}
    </div>
  );
}

function CreateFindingModal({ studyId, pick, onClose }: { studyId: string; pick: Pick; onClose: () => void }) {
  const [headline, setHeadline] = useState("");
  const [commentary, setCommentary] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !headline.trim()) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/findings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: "manual", evidenceRef: pick.ref, headline, commentary }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || "Could not create finding."); return; }
      setNote("done");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Create finding from a result</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{pick.label}</p>
        {note === "done" ? (
          <div className="mt-4"><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Draft finding created — see the Findings tab.</p>
            <div className="mt-4 flex justify-end"><Button onClick={onClose} variant="primary" size="sm">Done</Button></div></div>
        ) : (
          <>
            <div className="mt-3">
              <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Headline</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} autoFocus className="mt-1 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Commentary <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span></label>
              <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>The exact result numbers are captured by the server and frozen with this finding.</p>
            {note && note !== "done" && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{note}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={onClose} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
              <Button onClick={submit} variant="primary" size="sm" disabled={busy || !headline.trim()}>Create draft</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

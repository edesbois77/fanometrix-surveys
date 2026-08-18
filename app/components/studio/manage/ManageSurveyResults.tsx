"use client";

// ── Manage → Survey → Results (descriptive, question-based) ──────────────────
// "What are respondents telling us?" One result section per Survey question, in
// order: distribution (horizontal bars), n, shown, answered, question completion.
// Full-survey completion is shown separately in the summary. Limited, trustworthy
// filters (Publisher / Market / Campaign / Language) that reduce to a permitted
// campaign subset server-side. No chart-type choice, no AI, no significance.
// Result identities (survey → question → option → filters → n) are deterministic,
// ready to carry provenance into a future Finding.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { Card, Skeleton, Button } from "@/app/components/workspace-ui";
import { MetricInfo } from "@/app/components/metrics/MetricInfo";
import { StudioIcon } from "../studio-icons";

type OptionResult = { optionId: string; label: string; count: number; percentage: number | null };
type QuestionResult = {
  questionIndex: number; questionId: string; text: string;
  shown: number | null; answered: number; completionRate: number | null; base: number; options: OptionResult[];
};
type FilterOpt = { id: string; label: string };
type Results = {
  survey: { id: string; name: string; questionCount: number; displayLanguage: string; languages: string[] };
  summary: { completedResponses: number; totalValidAnswers: number };
  resultMode: "studio_native" | "historical";
  filters: { publishers: FilterOpt[]; markets: FilterOpt[]; campaigns: FilterOpt[]; languages: FilterOpt[] };
  questions: QuestionResult[];
};
const numOrDash = (n: number | null) => (n == null ? "—" : n.toLocaleString());
type ActiveFilters = { publisher: string; market: string; campaign: string; language: string };

const EMPTY: ActiveFilters = { publisher: "", market: "", campaign: "", language: "" };
const num = (n: number) => n.toLocaleString();
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Select({ label, value, options, onChange, allLabel }: {
  label: string; value: string; options: FilterOpt[]; onChange: (v: string) => void; allLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm px-2.5 py-1.5 rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
        style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

// The source identity an admin selects to curate a Finding (all IDs canonical).
type FindingSource = {
  questionIndex: number; questionText: string; optionId: string; optionLabel: string;
  percentage: number | null; base: number; filters: ActiveFilters; displayLanguage: string;
};

export function ManageSurveyResults({ surveyId }: { surveyId: string }) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin"; // Findings curation is Fanometrix-only
  const [data, setData] = useState<Results | null | "error">(null);
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY);
  const [displayLang, setDisplayLang] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [findingSource, setFindingSource] = useState<FindingSource | null>(null);

  const load = useCallback(async (f: ActiveFilters, lang: string) => {
    setBusy(true);
    const qs = new URLSearchParams();
    if (f.publisher) qs.set("publisher", f.publisher);
    if (f.market) qs.set("market", f.market);
    if (f.campaign) qs.set("campaign", f.campaign);
    if (f.language) qs.set("language", f.language);
    if (lang) qs.set("lang", lang);
    try {
      const res = await fetch(`/api/studio/surveys/${surveyId}/results?${qs.toString()}`);
      if (!res.ok) { setData("error"); return; }
      setData((await res.json()) as Results);
    } catch { setData("error"); }
    finally { setBusy(false); }
  }, [surveyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(filters, displayLang); }, [load, filters, displayLang]);

  if (data == null) return <div className="space-y-3 mt-6"><Skeleton className="h-16 w-64" /><Skeleton className="h-40 w-full max-w-2xl" /></div>;
  if (data === "error") return <Card className="mt-6"><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Could not load results.</p></Card>;

  const set = (patch: Partial<ActiveFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="mt-6 max-w-3xl">
      {/* Summary */}
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>Completed responses</span>
            <MetricInfo metricId="completed_responses" />
          </div>
          <p className="text-[26px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{num(data.summary.completedResponses)}</p>
        </div>
        <div>
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>Questions</span>
          <p className="text-[26px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{data.survey.questionCount}</p>
        </div>
      </div>

      {/* Limited filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3 pb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <Select label="Publisher" value={filters.publisher} options={data.filters.publishers} onChange={(v) => set({ publisher: v })} allLabel="All publishers" />
        <Select label="Market" value={filters.market} options={data.filters.markets} onChange={(v) => set({ market: v })} allLabel="All markets" />
        <Select label="Campaign" value={filters.campaign} options={data.filters.campaigns} onChange={(v) => set({ campaign: v })} allLabel="All campaigns" />
        <Select label="Language" value={filters.language} options={data.filters.languages} onChange={(v) => set({ language: v })} allLabel="All languages" />
        {data.survey.languages.length > 1 && (
          <Select label="Show labels in" value={displayLang || data.survey.displayLanguage} options={data.survey.languages.map((l) => ({ id: l, label: l.toUpperCase() }))} onChange={setDisplayLang} allLabel={data.survey.displayLanguage.toUpperCase()} />
        )}
        {busy && <span className="text-xs pb-1.5" style={{ color: "var(--text-tertiary)" }}>Updating…</span>}
      </div>

      {data.resultMode === "historical" && (
        <p className="text-xs mt-3 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Historical survey — question-level tracking (shown / question completion) wasn&apos;t available for this collection, so those read &ldquo;—&rdquo;, and filters aren&apos;t available for historical data. Answer distributions and n reflect the completed responses.
        </p>
      )}

      {/* One section per question, in survey order */}
      <div className="mt-5 space-y-4">
        {data.questions.length === 0 ? (
          <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>This survey has no questions.</p></Card>
        ) : data.questions.map((q) => (
          <Card key={q.questionIndex}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Q{q.questionIndex + 1}.</span> {q.text || "Untitled question"}
              </h3>
            </div>

            <div className="mt-3 space-y-2">
              {q.options.map((o) => (
                <div key={o.optionId} className="group">
                  <div className="flex items-center justify-between text-sm mb-1 gap-2">
                    <span className="min-w-0 truncate pr-3" style={{ color: "var(--text-primary)" }}>{o.label || "—"}</span>
                    <span className="whitespace-nowrap inline-flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                      {isAdmin && q.base > 0 && o.percentage != null && (
                        <button
                          type="button"
                          onClick={() => setFindingSource({ questionIndex: q.questionIndex, questionText: q.text, optionId: o.optionId, optionLabel: o.label, percentage: o.percentage, base: q.base, filters, displayLanguage: displayLang || data.survey.displayLanguage })}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity"
                          style={{ background: "var(--accent-wash)", borderColor: "var(--accent-gold)", color: "var(--accent-ink)" }}
                          title="Create a Finding from this result"
                        >
                          + Finding
                        </button>
                      )}
                      {num(o.count)} <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>· {pct(o.percentage)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((o.percentage ?? 0) * 100)}%`, background: "var(--accent-gold)" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Question-level facts — kept distinct from full-survey completion. For
                historical surveys, shown/completion are unavailable ("—"), not zero. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span>n = {num(q.base)}</span>
              <span className="inline-flex items-center gap-1">shown {numOrDash(q.shown)}</span>
              <span>answered {num(q.answered)}</span>
              <span>question completion {pct(q.completionRate)}</span>
            </div>
          </Card>
        ))}
      </div>

      {findingSource && (
        <CreateFindingModal surveyId={surveyId} source={findingSource} onClose={() => setFindingSource(null)} />
      )}
    </div>
  );
}

// ── Create Finding modal — read-only source result + editable editorial ──────
function CreateFindingModal({ surveyId, source, onClose }: { surveyId: string; source: FindingSource; onClose: () => void }) {
  const [headline, setHeadline] = useState("");
  const [commentary, setCommentary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const activeFilterChips = Object.entries(source.filters).filter(([, v]) => v).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`);

  const submit = async () => {
    if (saving || !headline.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/studio/surveys/${surveyId}/findings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIndex: source.questionIndex, optionId: source.optionId,
          filters: source.filters, displayLanguage: source.displayLanguage,
          headline, commentary,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || "Could not create the Finding."); return; }
      setDone(true);
    } catch { setError("Could not create the Finding."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Create Finding" className="w-full max-w-md rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Create Finding</h3>

        {/* SOURCE RESULT — read-only (the numbers come from the result, not typed) */}
        <div className="mt-3 rounded-[var(--radius-control)] border p-3" style={{ background: "var(--surface-sunken)", borderColor: "var(--border-default)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Source result</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Q{source.questionIndex + 1} · {source.questionText}</p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{source.optionLabel}</span>
            <span className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: "var(--accent-ink)" }}>{source.percentage == null ? "—" : `${Math.round(source.percentage * 100)}%`}</span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>n = {source.base.toLocaleString()}</span>
          </div>
          {activeFilterChips.length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{activeFilterChips.join(" · ")}</p>
          )}
        </div>

        {done ? (
          <div className="mt-4">
            <p className="text-sm inline-flex items-center gap-1.5" style={{ color: "var(--accent-ink)" }}>
              <StudioIcon.check size={15} strokeWidth={2.5} /> Finding saved as a draft. Publish it from the Findings tab.
            </p>
            <div className="mt-4 flex justify-end"><Button onClick={onClose} variant="primary" size="sm">Done</Button></div>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Headline</label>
              <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} autoFocus placeholder="e.g. Nearly three quarters of UK fans choose Nike" className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Commentary <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span></label>
              <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} rows={3} placeholder="Context an analyst would add — what this means, why it matters." className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
            </div>
            {error && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{error}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={onClose} variant="ghost" size="sm" disabled={saving}>Cancel</Button>
              <Button onClick={submit} variant="primary" size="sm" disabled={saving || !headline.trim()}>{saving ? "Saving…" : "Save draft"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

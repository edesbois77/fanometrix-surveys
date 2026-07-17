"use client";

// Lightweight "Add Conversation Search" slide-over — a Conversation Search is an
// evidence source, so creating one stays in the Research page (like Add Survey /
// Add Document) rather than a full config page. It asks only the few things that
// define the research: what you want to understand, what to search for, and
// where. Everything else (time window, languages, connector limits, status) is
// sensibly defaulted and refined later under Edit Search.
import { useState } from "react";
import { PLATFORMS, MARKETS } from "@/lib/social-taxonomy";
import { connectorForPlatformId } from "@/lib/connectors/catalog";
import { inferLanguagesForMarkets } from "@/lib/locales";
import { Button, FilterChip, Icon } from "@/app/components/workspace-ui";

// Only offer sources that have a live connector today (YouTube, Reddit). Others
// (News, …) appear here automatically once their connector ships.
const SOURCE_OPTIONS = PLATFORMS.filter(p => connectorForPlatformId(p.id));

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };

function StepLabel({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        <span className="fx-tabular-nums" style={{ color: "var(--accent-ink)" }}>{n}.</span> {title}
      </p>
      {hint && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{hint}</p>}
    </div>
  );
}

export function CreateConversationSearchPanel({ isSimulated, onClose, onCreated }: {
  isSimulated: boolean;
  onClose: () => void;
  onCreated: (searchId: string) => void;
}) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [markets, setMarkets] = useState<string[]>(["GB"]);
  const [sources, setSources] = useState<string[]>(SOURCE_OPTIONS.some(s => s.id === "YouTube") ? ["YouTube"] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addTerm() {
    const t = termInput.trim();
    if (!t || terms.some(x => x.toLowerCase() === t.toLowerCase())) { setTermInput(""); return; }
    setTerms(prev => [...prev, t]);
    setTermInput("");
  }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function handleCreate() {
    if (!name.trim()) { setError("Give your search a name."); return; }
    if (!terms.length) { setError("Add at least one search term."); return; }
    if (!markets.length) { setError("Choose at least one market."); return; }
    if (!sources.length) { setError("Choose at least one source."); return; }
    setError(""); setSaving(true);

    const res = await fetch("/api/social/searches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: question.trim() || null,
        markets, platforms: sources,
        keywords: terms.map(t => ({ keyword: t, keyword_type: "Topic" })),
        // Sensible defaults — refined later under Edit Search.
        research_goal: "Fan Sentiment",
        entity_type: "Brand",
        status: "Active",
        frequency: "Manual",
        collect_window: "90d",
        languages: inferLanguagesForMarkets(markets),
        connector_config: {},
        is_simulated: isSimulated,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.data?.id) {
      setSaving(false);
      setError(json.error ?? "Couldn't create the search. Please try again.");
      return;
    }
    onCreated(json.data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0" style={{ background: "rgba(11,25,41,0.45)" }} aria-hidden />
      <div className="relative h-full w-full max-w-md flex flex-col shadow-2xl" style={{ background: "var(--surface)" }} role="dialog" aria-label="Add conversation search">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Add Conversation Search</h2>
          <button onClick={onClose} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--text-tertiary)" }} aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* What happens next — confidence about what you're creating */}
          <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>What happens next</p>
            <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
              <li>· Fanometrix collects conversations from the sources you pick</li>
              <li>· AI identifies the relevant content</li>
              <li>· Sentiment, topics and entities are analysed</li>
              <li>· Results appear in Execution, Dashboard and Analysis</li>
            </ul>
          </div>

          {/* 1 — Understand */}
          <div>
            <StepLabel n={1} title="What do you want to understand?" />
            <input value={name} onChange={e => setName(e.target.value)} onFocus={focusGold} onBlur={blurGold}
              className="w-full px-3 py-2 text-sm outline-none transition-colors mb-2" style={inputStyle}
              placeholder="Name — e.g. FedEx UCL Sponsorship" />
            <textarea value={question} onChange={e => setQuestion(e.target.value)} onFocus={focusGold} onBlur={blurGold} rows={2}
              className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
              placeholder="Your research question — e.g. How do fans perceive FedEx's UCL sponsorship?" />
          </div>

          {/* 2 — Search terms */}
          <div>
            <StepLabel n={2} title="What should Fanometrix search for?" hint="The words we'll search for across every selected source." />
            <div className="flex gap-2">
              <input value={termInput} onChange={e => setTermInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }}
                onFocus={focusGold} onBlur={blurGold}
                className="flex-1 px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. FedEx, Champions League sponsor" />
              <Button variant="secondary" onClick={addTerm}>Add</Button>
            </div>
            {terms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {terms.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                    {t}
                    <button onClick={() => setTerms(prev => prev.filter((_, j) => j !== i))} className="hover:opacity-70" style={{ color: "var(--text-tertiary)" }} aria-label={`Remove ${t}`}><Icon.close size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 3 — Where */}
          <div>
            <StepLabel n={3} title="Where should we search?" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Markets</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {MARKETS.map(m => (
                <FilterChip key={m.code} label={`${m.code} · ${m.label}`} selected={markets.includes(m.code)} onClick={() => setMarkets(prev => toggle(prev, m.code))} />
              ))}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_OPTIONS.map(s => (
                <FilterChip key={s.id} label={s.label} selected={sources.includes(s.id)} onClick={() => setSources(prev => toggle(prev, s.id))} />
              ))}
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: "#B4694C" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Time window, languages &amp; source limits are set for you — edit any time.</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Conversation Search"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

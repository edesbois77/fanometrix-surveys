"use client";

// The focused "New Conversation Search" PAGE — a Conversation Search is an
// evidence source, and creating one is deliberately lightweight: it asks only
// what defines the research (what you want to understand, what to search for,
// and where). Everything else — the 90-day rolling window, languages inferred
// from markets, connector limits, status/frequency — is defaulted here and
// refined later under Edit Search (SearchConfigForm). This is NOT the old
// heavyweight config page; it's a clean create page in the standard Research
// Project workspace layout (breadcrumb, header, cards, footer actions).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, MARKETS, detectKeywordType } from "@/lib/social-taxonomy";
import { connectorForPlatformId } from "@/lib/connectors/catalog";
import { inferLanguagesForMarkets } from "@/lib/locales";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import {
  PageContainer, WorkspaceHeader, BackLink, Card, SectionHeading, Button, FilterChip, Icon,
} from "@/app/components/workspace-ui";

// Only offer sources that have a live connector today (YouTube, Reddit). Others
// (News, …) appear here automatically once their connector ships.
const SOURCE_OPTIONS = PLATFORMS.filter(p => connectorForPlatformId(p.id));

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };
const FIELD_LABEL = "text-xs font-semibold block mb-1.5";

export function CreateConversationSearchBody({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const router = useRouter();
  const { projectId, project, load } = useResearchProject();

  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [markets, setMarkets] = useState<string[]>(["GB"]);
  const [sources, setSources] = useState<string[]>(SOURCE_OPTIONS.some(s => s.id === "YouTube") ? ["YouTube"] : []);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); }

  function addTerm() {
    const t = termInput.trim();
    if (!t || terms.some(x => x.toLowerCase() === t.toLowerCase())) { setTermInput(""); return; }
    setTerms(prev => [...prev, t]);
    setTermInput("");
  }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function handleCreate() {
    if (!name.trim()) { showToast("Give your search a name.", false); return; }
    if (!terms.length) { showToast("Add at least one search term.", false); return; }
    if (!markets.length) { showToast("Choose at least one market.", false); return; }
    if (!sources.length) { showToast("Choose at least one source.", false); return; }
    setSaving(true);

    const res = await fetch("/api/social/searches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: question.trim() || null,
        markets, platforms: sources,
        keywords: terms.map(t => ({ keyword: t, keyword_type: detectKeywordType(t) })),
        // Sensible defaults — refined later under Edit Search.
        research_goal: "Fan Sentiment",
        entity_type: "Brand",
        status: "Active",
        frequency: "Manual",
        collect_window: "90d",
        languages: inferLanguagesForMarkets(markets),
        connector_config: {},
        is_simulated: project?.research_mode === "simulated",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.data?.id) {
      setSaving(false);
      showToast(json.error ?? "Couldn't create the search. Please try again.", false);
      return;
    }

    // Associate the new search with THIS project, then return to the
    // Conversation Intelligence Research page.
    const attach = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "social_search", evidence_id: json.data.id }),
    });
    if (!attach.ok) {
      const aj = await attach.json().catch(() => ({}));
      setSaving(false);
      showToast(aj.error ?? "Search created, but couldn't be attached to the project.", false);
      return;
    }
    load();
    router.push(backHref);
  }

  return (
    <>
      <PageContainer>
        <BackLink href={backHref} label={backLabel} className="mb-2" />
        <WorkspaceHeader
          title="New conversation search"
          description="Tell us what you want to understand and where to look — Fanometrix sets the rest up for you."
        />

        {/* How it works — confidence about what you're creating */}
        <Card padding="md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>How it works</p>
          <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
            <li>· Fanometrix collects conversations from your selected sources.</li>
            <li>· AI identifies the conversations relevant to your research.</li>
            <li>· Sentiment, topics and key entities are analysed.</li>
            <li>· Findings appear automatically in Execution, Dashboard and Analysis.</li>
          </ul>
        </Card>

        {/* 1 — Understand */}
        <Card>
          <SectionHeading title="What do you want to understand?" />
          <div className="mt-5 space-y-4">
            <div>
              <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>Conversation search name *</label>
              <input value={name} onChange={e => setName(e.target.value)} onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. FedEx UCL Sponsorship" />
            </div>
            <div>
              <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>Research Question</label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} onFocus={focusGold} onBlur={blurGold} rows={2}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. How do fans perceive FedEx's UEFA Champions League sponsorship?" />
            </div>
          </div>
        </Card>

        {/* 2 — Search keywords */}
        <Card>
          <SectionHeading title="Search Keywords" description="The keywords Fanometrix will search for across every selected source." />
          <div className="mt-5">
            <div className="flex gap-2">
              <input value={termInput} onChange={e => setTermInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }}
                onFocus={focusGold} onBlur={blurGold}
                className="flex-1 px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. FedEx, Champions League sponsor, UCL" />
              <Button variant="secondary" onClick={addTerm}>Add</Button>
            </div>
            {terms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {terms.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                    {t}
                    <button onClick={() => setTerms(prev => prev.filter((_, j) => j !== i))} className="hover:opacity-70" style={{ color: "var(--text-tertiary)" }} aria-label={`Remove ${t}`}><Icon.close size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 3 — Where */}
        <Card>
          <SectionHeading title="Where should we search?" />
          <div className="mt-5 space-y-5">
            <div>
              <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>Sources</label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_OPTIONS.map(s => (
                  <FilterChip key={s.id} label={s.label} selected={sources.includes(s.id)} onClick={() => setSources(prev => toggle(prev, s.id))} />
                ))}
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>Markets</label>
              <div className="flex flex-wrap gap-1.5">
                {MARKETS.map(m => (
                  <FilterChip key={m.code} label={`${m.code} · ${m.label}`} selected={markets.includes(m.code)} onClick={() => setMarkets(prev => toggle(prev, m.code))} />
                ))}
              </div>
            </div>
          </div>
        </Card>

        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          Time window, languages and per-source limits are set for you — adjust any time under Edit Search after creating.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" href={backHref}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Conversation Search"}</Button>
        </div>
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ borderRadius: "var(--radius-panel)" }}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}

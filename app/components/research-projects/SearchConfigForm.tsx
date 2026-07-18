"use client";

// The Conversation Search CONFIGURATION editor, mounted inside a Research
// Project (Research context). Research is where a source is selected, created
// and *configured* — so this page edits the search DEFINITION (name,
// description, status, frequency, entity type, research goal, keywords,
// markets, platforms) and nothing operational. Running/collecting mentions,
// Reddit fetch, sentiment and results dashboards belong to Execution / Dashboard
// / Analysis and are deliberately absent here.
//
// Same record, no duplication: this reuses the exact social taxonomy and the
// same /api/social/searches endpoints (POST create, PUT edit) as the standalone
// Social Listening drawer — only the presentation is re-done in the Research
// Projects UI v2 language. The standalone module keeps its full operational
// experience; this is the configuration-focused view of the same search.
//
// Create mode saves the global search, associates it with the current project
// (POST /evidence social_search), and returns to the Conversation Intelligence
// mini-workspace — it never sends the user into Execution.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ENTITY_TYPES, RESEARCH_GOALS, FREQUENCIES, SEARCH_STATUSES,
  KEYWORD_TYPES, PLATFORMS, MARKETS, detectKeywordType,
} from "@/lib/social-taxonomy";

// What each research goal focuses the AI on — shown beneath the selector so its
// purpose is clear (may later be recommended automatically from Project Type).
const RESEARCH_GOAL_HELP: Record<string, string> = {
  "Fan Sentiment": "Focuses the analysis on how fans feel — the balance of positive, neutral and negative opinion across the conversation.",
  "Emerging Topics": "Directs the analysis to surface new and rising themes fans are talking about, beyond overall mood.",
  "Sponsorship Perception": "Tunes the analysis to how fans perceive brands, sponsors and commercial partnerships.",
  "Market Comparison": "Guides the analysis to compare how opinion differs across your selected markets.",
  "Custom": "No specific lens — the conversation is analysed broadly against your research question.",
};
import { CONNECTOR_CATALOG, COLLECTION_LANGUAGES, COLLECTION_WINDOWS, connectorForPlatformId, type ConnectorField } from "@/lib/connectors/catalog";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, SectionHeading, Button, FilterChip, Icon, BackLink,
} from "@/app/components/workspace-ui";

type Keyword = { keyword: string; keyword_type: string };
type ConnectorConfig = Record<string, Record<string, unknown>>;
type SearchForm = {
  name: string; description: string; entity_type: string; research_goal: string;
  markets: string[]; platforms: string[]; frequency: string; status: string;
  languages: string[]; collect_window: string; collect_from: string; collect_to: string;
  connector_config: ConnectorConfig;
};

const BLANK: SearchForm = {
  name: "", description: "", entity_type: "Brand", research_goal: "Fan Sentiment",
  markets: ["GB"], platforms: PLATFORMS.filter(p => p.defaultOn).map(p => p.id),
  frequency: "Manual", status: "Draft",
  languages: ["en"], collect_window: "90d", collect_from: "", collect_to: "", connector_config: {},
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };
const FIELD_LABEL = "text-xs font-semibold block mb-1.5";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>{children}</label>;
}

export function SearchConfigForm({ mode, searchId, backHref, backLabel }: {
  mode: "create" | "edit";
  searchId?: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { projectId, project, load } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const [form, setForm] = useState<SearchForm>(BLANK);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); }

  function toggleLanguage(code: string) {
    setForm(f => ({ ...f, languages: f.languages.includes(code) ? f.languages.filter(l => l !== code) : [...f.languages, code] }));
  }
  function setConnectorConfig(connectorId: string, key: string, value: unknown) {
    setForm(f => ({ ...f, connector_config: { ...f.connector_config, [connectorId]: { ...(f.connector_config[connectorId] ?? {}), [key]: value } } }));
  }

  // Edit mode: load the existing search and prefill (same list endpoint the
  // standalone detail page reads, found by id).
  const loadSearch = useCallback(async () => {
    if (mode !== "edit" || !searchId) return;
    try {
      const json = await fetch("/api/social/searches").then(r => r.json());
      const s = (json.data ?? []).find((x: { id: string }) => x.id === searchId);
      if (!s) { setNotFound(true); return; }
      setForm({
        name: s.name, description: s.description ?? "", entity_type: s.entity_type,
        research_goal: s.research_goal, markets: s.markets, platforms: s.platforms,
        frequency: s.frequency, status: s.status,
        languages: s.languages?.length ? s.languages : ["en"],
        collect_window: s.collect_window ?? "90d",
        collect_from: s.collect_from ?? "", collect_to: s.collect_to ?? "",
        connector_config: (s.connector_config ?? {}) as ConnectorConfig,
      });
      setKeywords(s.social_keywords ?? []);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [mode, searchId]);

  useEffect(() => { loadSearch(); }, [loadSearch]);

  // Surface the record name into the project breadcrumb.
  useEffect(() => {
    setRecordLabel(mode === "create" ? "New search" : (form.name || null));
    return () => setRecordLabel(null);
  }, [mode, form.name, setRecordLabel]);

  function toggleMarket(code: string) {
    setForm(f => ({ ...f, markets: f.markets.includes(code) ? f.markets.filter(m => m !== code) : [...f.markets, code] }));
  }
  function togglePlatform(id: string) {
    setForm(f => ({ ...f, platforms: f.platforms.includes(id) ? f.platforms.filter(p => p !== id) : [...f.platforms, id] }));
  }
  function addKeyword() {
    const k = kwInput.trim();
    if (!k || keywords.some(kw => kw.keyword.toLowerCase() === k.toLowerCase())) return;
    // Auto-detect the type; the user overrides by clicking the chip if it's wrong.
    setKeywords(prev => [...prev, { keyword: k, keyword_type: detectKeywordType(k) }]);
    setKwInput("");
  }
  // Cycle a keyword's type on click — override without a dropdown.
  function cycleKeywordType(idx: number) {
    setKeywords(prev => prev.map((k, i) => {
      if (i !== idx) return k;
      const next = KEYWORD_TYPES[(Math.max(0, KEYWORD_TYPES.indexOf(k.keyword_type as typeof KEYWORD_TYPES[number])) + 1) % KEYWORD_TYPES.length];
      return { ...k, keyword_type: next };
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast("Search name is required.", false); return; }
    setSaving(true);
    const isCreate = mode === "create";
    const url = isCreate ? "/api/social/searches" : `/api/social/searches/${searchId}`;
    const method = isCreate ? "POST" : "PUT";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        collect_from: form.collect_from || null,   // date columns reject ""
        collect_to: form.collect_to || null,
        keywords,
        // A brand-new search created for a project must inherit that project's
        // research_mode or the evidence-attach below is rejected by the
        // provenance trigger. Editing never touches provenance.
        ...(isCreate ? { is_simulated: project?.research_mode === "simulated" } : {}),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSaving(false);
      showToast(j.error ?? "Failed to save.", false);
      return;
    }

    if (isCreate) {
      // Save the global record, then associate it with THIS project — and go
      // back to the mini-workspace. Never into Execution.
      const json = await res.json().catch(() => ({}));
      const newId = json.data?.id;
      if (newId) {
        const attach = await fetch(`/api/research-projects/${projectId}/evidence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evidence_type: "social_search", evidence_id: newId }),
        });
        if (!attach.ok) {
          const aj = await attach.json().catch(() => ({}));
          setSaving(false);
          showToast(aj.error ?? "Search created, but couldn't be attached to the project.", false);
          return;
        }
      }
      load();
      router.push(`/research-projects/${projectId}/research/conversation`);
      return;
    }

    setSaving(false);
    showToast("Search updated.");
    load();
  }

  // Advanced options only for enabled sources that have a connector with them.
  const advancedConnectors = Array.from(new Set(
    form.platforms.map(p => connectorForPlatformId(p)?.id).filter((x): x is string => !!x)
  )).map(id => CONNECTOR_CATALOG.find(c => c.id === id)!).filter(c => c.advanced.length > 0);

  function renderConnectorField(connectorId: string, field: ConnectorField) {
    const cc = form.connector_config[connectorId] ?? {};
    if (field.type === "number") {
      const val = cc[field.key] ?? field.default;
      return (
        <div key={field.key}>
          <FieldLabel>{field.label}</FieldLabel>
          <input type="number" min={0} value={val == null ? "" : String(val)}
            onChange={e => setConnectorConfig(connectorId, field.key, e.target.value === "" ? null : Number(e.target.value))}
            onFocus={focusGold} onBlur={blurGold}
            className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle} />
          {field.help && <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{field.help}</p>}
        </div>
      );
    }
    const arr = Array.isArray(cc[field.key]) ? (cc[field.key] as string[]) : [];
    return (
      <div key={field.key} className="sm:col-span-2">
        <FieldLabel>{field.label}</FieldLabel>
        <input value={arr.join(", ")}
          onChange={e => setConnectorConfig(connectorId, field.key, e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
          onFocus={focusGold} onBlur={blurGold}
          className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
          placeholder="soccer, football" />
        {field.help && <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{field.help}</p>}
      </div>
    );
  }

  if (loading) return <PageContainer><PageLoadingState lines={2} /></PageContainer>;
  if (notFound) return (
    <PageContainer>
      <ErrorState title="Search not found" description="This conversation search couldn't be loaded." backHref={backHref} backLabel={backLabel.replace(/^←\s*/, "")} />
    </PageContainer>
  );

  const titleText = mode === "create" ? "New conversation search" : (form.name || "Conversation search");

  return (
    <>
      <PageContainer>
        {/* Centred between the breadcrumb and the title: equal space above and
            below (pt-6 above from the container + this pb below). */}
        <BackLink href={backHref} label={backLabel} className="mb-2" />

        {/* Header introduces; the action row at the foot of the form saves —
            one Save placement, consistent across all Research source editors. */}
        <WorkspaceHeader
          title={titleText}
          description="Refine how this conversation search understands fan opinion. Collecting and reviewing results happens in Execution, Dashboard and Analysis."
        />

        {/* 1 — What do you want to understand? */}
        <Card>
          <SectionHeading title="What do you want to understand?" />
          <div className="mt-5 space-y-4">
            <div>
              <FieldLabel>Conversation Search Name</FieldLabel>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. FedEx UCL Sponsorship" />
            </div>
            <div>
              <FieldLabel>Research Question</FieldLabel>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold} rows={2}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. How do fans perceive FedEx's UEFA Champions League sponsorship?" />
            </div>
            <div>
              <FieldLabel>Research Goal</FieldLabel>
              <select value={form.research_goal} onChange={e => setForm(f => ({ ...f, research_goal: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors sm:max-w-sm" style={inputStyle}>
                {RESEARCH_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{RESEARCH_GOAL_HELP[form.research_goal] ?? ""}</p>
            </div>
          </div>
        </Card>

        {/* 2 — What should Fanometrix search for? */}
        <Card>
          <SectionHeading title="What should Fanometrix search for?" />
          <div className="mt-5">
            <FieldLabel>Search Keywords</FieldLabel>
            <div className="flex gap-2">
              <input value={kwInput} onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                onFocus={focusGold} onBlur={blurGold}
                className="flex-1 min-w-[180px] px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. FedEx, Champions League sponsor, #UCL" />
              <Button variant="secondary" onClick={addKeyword}>Add</Button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>The words and phrases Fanometrix looks for across your sources. We detect each keyword&apos;s type automatically — click a type to change it.</p>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {keywords.map((k, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full"
                    style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                    {k.keyword}
                    <button type="button" onClick={() => cycleKeywordType(i)} title="Click to change type"
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded hover:opacity-80" style={{ color: "var(--accent-ink)", background: "var(--accent-wash)" }}>
                      {k.keyword_type}
                    </button>
                    <button onClick={() => setKeywords(prev => prev.filter((_, j) => j !== i))}
                      className="hover:opacity-70" style={{ color: "var(--text-tertiary)" }} aria-label={`Remove ${k.keyword}`}>
                      <Icon.close size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 3 — Where should Fanometrix search? */}
        <Card>
          <SectionHeading title="Where should Fanometrix search?" />
          <div className="mt-5 space-y-5">
            <div>
              <FieldLabel>Sources</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => {
                  const on = form.platforms.includes(p.id);
                  const disabled = !p.defaultOn;
                  return (
                    <button key={p.id} type="button" disabled={disabled}
                      onClick={() => !disabled && togglePlatform(p.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={on
                        ? { background: "var(--accent-wash)", color: "var(--accent-ink)", border: "1px solid #ECDCB8" }
                        : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
                      {on && <Icon.check size={12} strokeWidth={2.5} />}
                      {p.label}
                      {disabled && <span style={{ color: "var(--text-disabled)" }}>· soon</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <FieldLabel>Markets</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {MARKETS.map(m => (
                  <FilterChip key={m.code} label={`${m.code} · ${m.label}`} selected={form.markets.includes(m.code)} onClick={() => toggleMarket(m.code)} />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Languages</FieldLabel>
              <p className="text-[11px] mb-2 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Fanometrix automatically infers the most appropriate languages from your selected markets. Override only if required.</p>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_LANGUAGES.map(l => (
                  <FilterChip key={l.code} label={`${l.code} · ${l.label}`} selected={form.languages.includes(l.code)} onClick={() => toggleLanguage(l.code)} />
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* 4 — Collection Settings */}
        <Card>
          <SectionHeading title="Collection Settings" description="How and how often Fanometrix collects." />
          <div className="mt-5 space-y-5">
            {/* Time period */}
            <div>
              <FieldLabel>Time period</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_WINDOWS.map(w => (
                  <FilterChip key={w.value} label={w.label} selected={form.collect_window === w.value} onClick={() => setForm(f => ({ ...f, collect_window: w.value }))} />
                ))}
              </div>
              {form.collect_window !== "custom" && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>Relative to each run — a re-run next month still collects that period.</p>
              )}
            </div>
            {form.collect_window === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>From</FieldLabel>
                  <input type="date" value={form.collect_from} max={form.collect_to || undefined}
                    onChange={e => setForm(f => ({ ...f, collect_from: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold}
                    className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle} />
                </div>
                <div>
                  <FieldLabel>To</FieldLabel>
                  <input type="date" value={form.collect_to} min={form.collect_from || undefined}
                    onChange={e => setForm(f => ({ ...f, collect_to: e.target.value }))}
                    onFocus={focusGold} onBlur={blurGold}
                    className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle} />
                </div>
              </div>
            )}

            {/* Collection frequency */}
            <div>
              <FieldLabel>Collection frequency</FieldLabel>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors sm:max-w-xs" style={inputStyle}>
                {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr === "Manual" ? "Manual (recommended)" : fr}</option>)}
              </select>
              {form.frequency === "Manual" ? (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>Manual is the default — you run each collection yourself from Execution.</p>
              ) : (
                <div className="mt-2 flex items-start gap-2 px-3 py-2" style={{ borderRadius: "var(--radius-control)", background: "#FBF3E1", border: "1px solid #ECDCB8" }}>
                  <span aria-hidden className="text-xs leading-none mt-0.5" style={{ color: "#8A6A2F" }}>⚠</span>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#8A6A2F" }}>
                    This search will collect automatically ({form.frequency.toLowerCase()}) and keep running until you pause or archive it.
                  </p>
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <FieldLabel>Status</FieldLabel>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                onFocus={focusGold} onBlur={blurGold}
                className="w-full px-3 py-2 text-sm outline-none transition-colors sm:max-w-xs" style={inputStyle}>
                {SEARCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Advanced source settings — connector-specific + subject type */}
            <div className="pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="button" onClick={() => setAdvancedOpen(o => !o)} className="w-full flex items-center justify-between text-left py-0.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Advanced source settings</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{advancedOpen ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {advancedOpen && (
                <div className="mt-4 space-y-6">
                  {advancedConnectors.map(conn => (
                    <div key={conn.id}>
                      <p className="text-xs font-semibold mb-3 uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{conn.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {conn.advanced.map(field => renderConnectorField(conn.id, field))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <FieldLabel>Subject type</FieldLabel>
                    <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))}
                      onFocus={focusGold} onBlur={blurGold}
                      className="w-full px-3 py-2 text-sm outline-none transition-colors sm:max-w-xs" style={inputStyle}>
                      {ENTITY_TYPES.map(en => <option key={en} value={en}>{en}</option>)}
                    </select>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>What this search is mainly about — helps the AI classify entities in the conversation.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Where operational controls live — keeps the separation explicit. */}
        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          Running collection, deployment and monitoring for this source live in{" "}
          <button onClick={() => router.push(`/research-projects/${projectId}/execution`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Execution →</button>
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" href={backHref}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : mode === "create" ? "Create search" : "Save changes"}</Button>
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

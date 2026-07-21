"use client";

// The Conversation Advisor — the ENTRY POINT for Conversation Intelligence
// inside a Research Project (docs/conversation-advisor.md). It replaces the old
// "Research Question + Keywords + Sources" search-builder. The researcher
// commissions research: they read a consultant briefing (recommendation →
// themes → recommended platforms → limitations) and approve an evidence-
// collection approach. Keywords, the search strategy and platform specifics are
// demoted to a collapsed "Advanced implementation" disclosure.
//
// The engine reasons in recommendation STATES; this UI only ever shows
// consultancy language (recommendationLabel). Information Needs are the internal
// unit; Research Themes (= Research Aspects) are the primary UX.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, MARKETS, detectKeywordType } from "@/lib/social-taxonomy";
import { inferLanguagesForMarkets } from "@/lib/locales";
import { SourceLogo } from "@/app/components/research-projects/SourceLogo";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import {
  PageContainer, WorkspaceHeader, BackLink, Card, SectionHeading, Button, FilterChip, Icon,
  StatusBadge,
} from "@/app/components/workspace-ui";
import { describeStrategy, strategyKeywords } from "@/lib/search-strategy";
import {
  type ConversationAdvisorBriefing, type AdvisorChallenge,
  recommendationLabel, recommendationTone, recommendsProceeding,
  METHOD_FIT_LABEL, METHOD_FIT_TONE, METHOD_LABEL,
} from "@/lib/conversation-advisor";

// Tone palette for the recommendation hero (aligned with the InsightPanel rails).
const REC_TONE: Record<"positive" | "opportunity" | "concern", { rail: string; ink: string; wash: string; line: string }> = {
  positive:    { rail: "#5C8560", ink: "#3F5D42", wash: "#EEF3EC", line: "#D3E0D0" },
  opportunity: { rail: "#C7A75E", ink: "#8A6D2F", wash: "#FBF3E1", line: "#ECDCB8" },
  concern:     { rail: "#B4694C", ink: "#8A4B33", wash: "#F7ECE6", line: "#E8D2C4" },
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border-default)",
  color: "var(--text-primary)", borderRadius: "var(--radius-control)",
};
const focusGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; };
const blurGold = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border-default)"; };
const FIELD_LABEL = "text-xs font-semibold block mb-1.5";

const PLATFORM_AVAILABLE: Record<string, boolean> = Object.fromEntries(PLATFORMS.map(p => [p.id, p.defaultOn]));
const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(PLATFORMS.map(p => [p.id, p.label]));

const needKey = (themeIdx: number, needIdx: number) => `${themeIdx}:${needIdx}`;

export function ConversationAdvisorBody({
  backHref, backLabel, initialQuestion, initialName,
}: {
  backHref: string; backLabel: string;
  initialQuestion?: string; initialName?: string;
}) {
  const router = useRouter();
  const { projectId, project, load } = useResearchProject();

  const [question, setQuestion] = useState(initialQuestion ?? project?.research_question ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [markets, setMarkets] = useState<string[]>(["GB"]);

  const [briefing, setBriefing] = useState<ConversationAdvisorBriefing | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);

  // Researcher overrides on the generated briefing (light human-confirmed).
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [excludedNeeds, setExcludedNeeds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [saving, setSaving] = useState(false);
  const [proceedAnyway, setProceedAnyway] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function generate() {
    if (!question.trim()) { showToast("Add a research question so the advisor can recommend an approach.", false); return; }
    setGenerating(true);
    setEditingQuestion(false);
    try {
      const res = await fetch("/api/social/conversation-advisor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_question: question.trim(),
          objective: project?.objective ?? null,
          project_name: project?.project_name ?? null,
          markets,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.briefing) { showToast(json.error ?? "Couldn't reach the Conversation Advisor. Please try again.", false); return; }

      const b = json.briefing as ConversationAdvisorBriefing;
      setBriefing(b);
      // Pre-select the recommended, available platforms.
      setSelectedPlatforms(b.recommendation.platforms.filter(p => p.recommended && PLATFORM_AVAILABLE[p.platform]).map(p => p.platform));
      setExcludedNeeds(new Set());
      setExpanded(new Set(b.information_needs.themes.length ? [0] : []));
      setProceedAnyway(false);
      if (!name.trim() && b.strategy.primary_entity?.term) setName(`${b.strategy.primary_entity.term} — conversation research`);
    } finally {
      setGenerating(false);
    }
  }

  function handleChallenge(ch: AdvisorChallenge) {
    if (ch.action === "refine_question" || ch.action === "split_studies") {
      setEditingQuestion(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // add_survey / switch_method → hand off to the relevant method surface.
    const method = ch.target_method === "document" ? "library" : "survey";
    router.push(`/research-projects/${projectId}/research/${method}`);
  }

  async function handleApprove() {
    if (!briefing) return;
    if (!name.trim()) { showToast("Give this conversation research a name.", false); return; }
    if (!selectedPlatforms.length) { showToast("Choose at least one platform to collect from.", false); return; }

    // Filter the research design to the needs the researcher kept.
    const themes = briefing.information_needs.themes
      .map((t, ti) => ({ ...t, needs: t.needs.filter((_, ni) => !excludedNeeds.has(needKey(ti, ni))) }))
      .filter(t => t.needs.length > 0);
    if (!themes.length) { showToast("Keep at least one information need to collect against.", false); return; }

    const keywords = strategyKeywords(briefing.strategy).map(t => ({ keyword: t, keyword_type: detectKeywordType(t) }));
    if (!keywords.length) { showToast("The strategy produced no search terms — regenerate or add terms under Advanced.", false); return; }

    setSaving(true);
    const res = await fetch("/api/social/searches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: question.trim() || null,
        markets, platforms: selectedPlatforms,
        keywords,
        // The research design of record — what makes this a commissioned study.
        information_needs: { themes },
        recommendation: briefing.recommendation,
        search_strategy: briefing.strategy,
        // Implementation defaults — refined later under Edit Search.
        research_goal: "Fan Sentiment",
        entity_type: briefing.strategy.primary_entity?.type ?? "Brand",
        status: "Active",
        frequency: "Manual",
        collect_window: "90d",
        languages: inferLanguagesForMarkets(markets),
        connector_config: {},
        is_simulated: project?.research_mode === "simulated",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.data?.id) { setSaving(false); showToast(json.error ?? "Couldn't create the conversation research. Please try again.", false); return; }

    const attach = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "social_search", evidence_id: json.data.id }),
    });
    if (!attach.ok) {
      const aj = await attach.json().catch(() => ({}));
      setSaving(false);
      showToast(aj.error ?? "Created, but couldn't be attached to the project.", false);
      return;
    }
    load();
    router.push(backHref);
  }

  const rec = briefing?.recommendation;
  const canProceed = rec ? (recommendsProceeding(rec.state) || proceedAnyway) : false;

  return (
    <>
      <PageContainer>
        <BackLink href={backHref} label={backLabel} className="mb-2" />
        <WorkspaceHeader
          title="Commission conversation research"
          description="Tell the Conversation Advisor what you want to understand. It recommends an approach — you approve it."
        />

        {/* The brief — the one thing we ask for up front */}
        {(!briefing || editingQuestion) && (
          <Card>
            <SectionHeading
              title="What do you want to understand?"
              description="Your research question — the advisor works out the evidence needed to answer it."
            />
            <div className="mt-5">
              <textarea
                value={question} onChange={e => setQuestion(e.target.value)} onFocus={focusGold} onBlur={blurGold} rows={3}
                className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle}
                placeholder="e.g. How can FedEx create greater value for football fans through its UEFA Champions League sponsorship?"
              />
              <div className="flex items-center justify-end gap-2 mt-4">
                {briefing && <Button variant="ghost" onClick={() => setEditingQuestion(false)}>Cancel</Button>}
                <Button variant="primary" onClick={generate} disabled={generating}>
                  {generating ? "Consulting…" : briefing ? "Re-consult the advisor" : "Ask the Conversation Advisor"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {generating && !briefing && (
          <Card>
            <div className="flex items-center gap-3 py-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md" style={{ background: "#F2E6C8", color: "#8A6D2F" }}><Icon.sparkles size={15} /></span>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>The Conversation Advisor is reviewing your question and deciding the right approach…</p>
            </div>
          </Card>
        )}

        {briefing && rec && (
          <>
            {/* 1 — Our recommendation (the consultant's verdict, leading the page) */}
            {(() => {
              const tone = recommendationTone(rec.state);
              const c = REC_TONE[tone];
              return (
                <div className="border p-5 md:p-6" style={{ borderRadius: "var(--radius-panel)", background: c.wash, borderColor: c.line, borderLeft: `3px solid ${c.rail}`, boxShadow: "var(--shadow-sm)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: c.ink }}>Our recommendation</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: c.ink, border: `1px solid ${c.line}` }}>{recommendationLabel(rec)}</span>
                  </div>
                  {rec.headline && <h3 className="text-lg md:text-xl font-bold tracking-[-0.015em] leading-snug mt-2.5" style={{ color: "var(--text-primary)" }}>{rec.headline}</h3>}
                  {rec.rationale && <p className="text-sm md:text-[15px] leading-relaxed mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{rec.rationale}</p>}
                </div>
              );
            })()}

            {/* what it can / cannot answer */}
            {(rec.can_answer || rec.cannot_answer) && (
              <Card padding="md">
                <div className="grid sm:grid-cols-2 gap-4">
                  {rec.can_answer && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1 flex items-center gap-1.5" style={{ color: "#3F5D42" }}><Icon.check size={13} /> What it can answer</p>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{rec.can_answer}</p>
                    </div>
                  )}
                  {rec.cannot_answer && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1 flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}><Icon.alert size={13} /> What it can&apos;t</p>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{rec.cannot_answer}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Challenges — the specialist pushing back, actionably */}
            {rec.challenges.map((ch, i) => (
              <div key={i} className="border p-4 flex items-start gap-3" style={{ borderRadius: "var(--radius-panel)", background: "#F7ECE6", borderColor: "#E8D2C4" }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={16} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed" style={{ color: "#5F3826" }}>{ch.message}</p>
                  <div className="mt-2.5"><Button variant="secondary" onClick={() => handleChallenge(ch)}>{ch.action_label}</Button></div>
                </div>
              </div>
            ))}

            {/* 2 — What we'll investigate (themes primary; needs nested/internal) */}
            <Card>
              <SectionHeading title="What we'll investigate" description="The research themes we'll build evidence around. Expand a theme to see the specific questions beneath it." />
              <div className="mt-5 space-y-2.5">
                {briefing.information_needs.themes.map((t, ti) => {
                  const open = expanded.has(ti);
                  const keptCount = t.needs.filter((_, ni) => !excludedNeeds.has(needKey(ti, ni))).length;
                  return (
                    <div key={ti} className="border" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
                      <button
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(ti) ? n.delete(ti) : n.add(ti); return n; })}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <span style={{ color: "var(--text-tertiary)" }}>{open ? <Icon.chevronDown size={16} /> : <Icon.chevronRight size={16} />}</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-bold block" style={{ color: "var(--text-primary)" }}>{t.aspect}</span>
                          {t.description && <span className="text-xs block mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>{t.description}</span>}
                        </span>
                        <span className="fx-tabular-nums text-[11px] font-semibold flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                          {keptCount} {keptCount === 1 ? "need" : "needs"}
                        </span>
                      </button>
                      {open && (
                        <div className="px-4 pb-3 pt-1 space-y-2.5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                          {t.needs.map((need, ni) => {
                            const key = needKey(ti, ni);
                            const kept = !excludedNeeds.has(key);
                            return (
                              <div key={ni} className="flex items-start gap-3 pt-2.5" style={{ opacity: kept ? 1 : 0.45 }}>
                                <input type="checkbox" checked={kept} onChange={() => setExcludedNeeds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })} className="mt-1 flex-shrink-0" aria-label={`Include: ${need.need}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{need.need}</p>
                                    <StatusBadge label={METHOD_FIT_LABEL[need.method_fit]} tone={METHOD_FIT_TONE[need.method_fit]} size="sm" />
                                  </div>
                                  {need.rationale && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{need.rationale}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 3 — Recommended platforms */}
            <Card>
              <SectionHeading title="Recommended platforms" description="Where the evidence lives — and where it doesn't. Recommended sources are selected; adjust if you like." />
              <div className="mt-5 space-y-2">
                {rec.platforms.map((p, i) => {
                  const available = PLATFORM_AVAILABLE[p.platform] ?? false;
                  const on = selectedPlatforms.includes(p.platform);
                  return (
                    <button
                      key={i} type="button" disabled={!available}
                      onClick={() => available && setSelectedPlatforms(prev => toggle(prev, p.platform))}
                      className="w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors disabled:cursor-not-allowed"
                      style={{
                        borderRadius: "var(--radius-tile)",
                        border: on ? "1px solid #ECDCB8" : "1px solid var(--border-default)",
                        background: on ? "var(--accent-wash)" : "var(--surface)",
                        opacity: available ? 1 : 0.6,
                      }}
                    >
                      <span className="mt-0.5"><SourceLogo id={p.platform} size={18} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: on ? "var(--accent-ink)" : "var(--text-primary)" }}>{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                          <StatusBadge label={p.recommended ? "Recommended" : "Not recommended"} tone={p.recommended ? "success" : "neutral"} size="sm" />
                          {!available && <span className="text-[10px] font-medium" style={{ color: "var(--text-disabled)" }}>· soon</span>}
                        </span>
                        <span className="block text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{p.rationale}</span>
                      </span>
                      {on && <Icon.check size={15} strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* 4 — Research limitations */}
            {(rec.limitations.length > 0 || rec.complementary_method) && (
              <Card padding="md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Research limitations</p>
                <ul className="text-sm space-y-1.5" style={{ color: "var(--text-secondary)" }}>
                  {rec.limitations.map((l, i) => <li key={i} className="flex gap-2"><span style={{ color: "var(--text-tertiary)" }}>·</span><span>{l}</span></li>)}
                </ul>
                {rec.complementary_method && (
                  <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                    Where this method falls short, we&apos;d complement it with{" "}
                    <a href={`/research-projects/${projectId}/research/${rec.complementary_method === "document" ? "library" : "survey"}`} className="font-semibold" style={{ color: "var(--accent-ink)" }}>
                      {METHOD_LABEL[rec.complementary_method]}
                    </a>.
                  </p>
                )}
              </Card>
            )}

            {/* 5 — Approve */}
            <Card>
              <SectionHeading title="Approve conversation research" description="You're approving an evidence-collection approach, not running a search." />
              <div className="mt-5 space-y-4">
                <div>
                  <label className={FIELD_LABEL} style={{ color: "var(--text-secondary)" }}>Name this study *</label>
                  <input value={name} onChange={e => setName(e.target.value)} onFocus={focusGold} onBlur={blurGold}
                    className="w-full px-3 py-2 text-sm outline-none transition-colors" style={inputStyle} placeholder="e.g. FedEx UCL — Fan Value" />
                </div>
                {!recommendsProceeding(rec.state) && (
                  <label className="flex items-start gap-2.5 text-sm p-3 rounded-lg" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                    <input type="checkbox" checked={proceedAnyway} onChange={e => setProceedAnyway(e.target.checked)} className="mt-0.5" />
                    <span>We recommended a different approach above. Proceed with conversation research anyway.</span>
                  </label>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" href={backHref}>Cancel</Button>
                  <Button variant="primary" onClick={handleApprove} disabled={saving || !canProceed}>
                    {saving ? "Setting up…" : "Approve & begin collecting"}
                  </Button>
                </div>
              </div>
            </Card>

            {/* 6 — Advanced implementation (collapsed) */}
            <div className="border" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
              <button onClick={() => setShowAdvanced(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
                <span style={{ color: "var(--text-tertiary)" }}>{showAdvanced ? <Icon.chevronDown size={16} /> : <Icon.chevronRight size={16} />}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Advanced implementation</span>
                <span className="text-[11px]" style={{ color: "var(--text-disabled)" }}>· search strategy, keywords, markets</span>
              </button>
              {showAdvanced && (
                <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Search preview</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{describeStrategy(briefing.strategy)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Derived search terms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {strategyKeywords(briefing.strategy).map((t, i) => (
                        <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{t}</span>
                      ))}
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: "var(--text-disabled)" }}>Keywords are derived from the strategy — refine them any time under Edit Search after approval.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Markets</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MARKETS.map(m => (
                        <FilterChip key={m.code} label={`${m.code} · ${m.label}`} selected={markets.includes(m.code)} onClick={() => setMarkets(prev => toggle(prev, m.code))} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ borderRadius: "var(--radius-panel)" }}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}

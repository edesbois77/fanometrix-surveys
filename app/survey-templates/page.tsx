"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { validateSurvey, SURVEY_LIMITS } from "@/lib/survey-validation";
import {
  SUPPORTED_LANGUAGES, resolveQuestion,
  type LangCode, type LocalisedQuestion, type LocalisedOption,
} from "@/lib/survey-locale";
import { generateSurveyName } from "@/lib/naming";

// ─── MPU colours ─────────────────────────────────────────────────────────────
const NAVY = "#071B2F";
const GOLD = "#D7B87A";

// ─── MPU content limits (from shared lib/survey-validation.ts) ───────────────
const { MAX_QUESTIONS, MAX_OPTIONS, MAX_Q_CHARS, MAX_OPT_CHARS, MAX_TY_TITLE, MAX_TY_BODY } = SURVEY_LIMITS;

// Live character counter — turns amber near limit, red when over
function CharCount({ len, max }: { len: number; max: number }) {
  const over = len > max;
  const near = len > max * 0.85;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-red-500 font-semibold" : near ? "text-amber-500" : "text-gray-400"}`}>
      {len} / {max}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Question = LocalisedQuestion;   // re-export alias used throughout this file

type Survey = {
  id: string;
  name: string;
  description: string | null;
  brand_name: string | null;
  research_theme: string | null;
  version_number: number;
  questions: Question[];
  thank_you_title: string;
  thank_you_body: string;
  status: "draft" | "ready" | "archived" | "deleted";
  is_template: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  campaign_count: number;
  live_campaign_count: number;
  response_count: number;
  last_used_at: string | null;
  last_response_at: string | null;
};

// Content-only fields for the edit drawer
type EditFields = {
  name:           string;
  description:    string | null;
  brand_name:     string;
  research_theme: string;
  version_number: number;
  questions:      Question[];
  thank_you_title: string;
  thank_you_body:  string;
  status:          "draft" | "ready";
  is_template:     boolean;
};

// Campaigns linked to a survey (for the usage modal)
type ModalCampaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  publisher: string | null;
  response_count: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelativeTime(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const diffMs = Date.now() - d.getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins} min${mins  !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days  <  7) return `${days} day${days  !== 1 ? "s" : ""} ago`;
  return formatDate(isoStr);
}

function formatDatetime(isoStr: string): string {
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

const STATUS_COLOURS: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-600",
  ready:       "bg-green-100 text-green-700",
  "needs-fix": "bg-orange-100 text-orange-700",
  archived:    "bg-amber-100 text-amber-700",
  deleted:     "bg-red-100 text-red-600",
};

// A survey stored as "ready" but failing MPU validation shows as "Needs Fix".
function effectiveSurveyStatus(s: Survey): string {
  if (s.status === "ready" && validateSurvey(s).length > 0) return "needs-fix";
  return s.status;
}

function statusLabel(eff: string): string {
  if (eff === "needs-fix") return "Needs Fix";
  return eff.charAt(0).toUpperCase() + eff.slice(1);
}

const CAMPAIGN_STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  live:      "bg-green-100 text-green-700",
  paused:    "bg-yellow-100 text-yellow-700",
  closed:    "bg-gray-100 text-gray-500",
  archived:  "bg-amber-100 text-amber-700",
};

// ─── MPU Preview Modal ────────────────────────────────────────────────────────
function MPUPreviewModal({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const [step,        setStep]        = useState(0);
  const [answers,     setAnswers]     = useState<Record<string, number>>({});
  const [done,        setDone]        = useState(false);
  const [previewLang, setPreviewLang] = useState<LangCode>("en");

  // Which languages have at least some content (for the language switcher)
  const availableLangs = SUPPORTED_LANGUAGES.filter(l =>
    l.code === "en" ||
    (survey.questions ?? []).some(q =>
      (q.text as Record<string, string>)[l.code]?.trim()
    )
  );

  const questions   = (survey.questions ?? []).map(lq => resolveQuestion(lq, previewLang));
  const q           = questions[step];
  const selected    = q ? (answers[q.id] ?? -1) : -1;
  const isLast      = step === questions.length - 1;
  const isFirst     = step === 0;
  const progressPct = done ? 100 : ((step + 1) / Math.max(questions.length, 1)) * 100;

  function restart() { setStep(0); setAnswers({}); setDone(false); }

  function handleSelect(optId: number) {
    if (!q) return;
    const newAnswers = { ...answers, [q.id]: optId };
    setAnswers(newAnswers);
    setTimeout(() => {
      if (isLast) { setDone(true); return; }
      setStep(s => s + 1);
    }, 350);
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const frame: React.CSSProperties = {
    width: 300, height: 250, overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex", flexDirection: "column",
    boxSizing: "border-box", position: "relative",
    boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onBackdrop}>
      <div className="flex flex-col items-center gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center shadow">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">◆ Preview Mode</p>
          <p className="text-xs text-amber-600 mt-0.5">No responses are recorded.</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">{survey.name}</p>
        </div>

        {done ? (
          <div style={frame}>
            <div style={{ height: 46, minHeight: 46, background: NAVY, display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Fanometrix_Logo.png" alt="Fanometrix" style={{ height: 15, objectFit: "contain" }} />
            </div>
            <div style={{ height: 3, minHeight: 3, background: `rgba(215,184,122,0.2)`, flexShrink: 0 }}>
              <div style={{ height: "100%", width: "100%", background: GOLD }} />
            </div>
            <div style={{ flex: 1, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 20px", textAlign: "center", gap: 8, minHeight: 0 }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>🎉</div>
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>{survey.thank_you_title || "Thank you!"}</p>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 10.5, margin: 0, lineHeight: 1.4 }}>{survey.thank_you_body || "Your anonymous feedback helps improve the football experience for fans everywhere."}</p>
            </div>
            <div style={{ height: 22, minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, borderTop: "1px solid rgba(255,255,255,0.10)", flexShrink: 0 }}>
              <span style={{ color: "#8C9DB5", fontSize: 9 }}>Powered by Fanometrix • <span style={{ color: GOLD }}>Privacy</span></span>
            </div>
          </div>
        ) : (
          <div style={frame}>
            <div style={{ height: 46, minHeight: 46, background: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0, boxSizing: "border-box" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Fanometrix_Logo.png" alt="Fanometrix" style={{ height: 15, objectFit: "contain" }} />
              <span style={{ color: GOLD, fontSize: 10, fontWeight: 600, letterSpacing: "0.03em", flexShrink: 0 }}>{step + 1} of {questions.length}</span>
            </div>
            <div style={{ height: 3, minHeight: 3, background: `rgba(215,184,122,0.2)`, flexShrink: 0 }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: GOLD, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ flex: 1, background: "#fff", padding: "10px 12px 0", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>
              <div style={{ height: 33, minHeight: 33, overflow: "hidden", flexShrink: 0, marginBottom: 8 }}>
                <p style={{ color: NAVY, fontSize: 11.5, fontWeight: 700, lineHeight: 1.35, margin: 0 }}>{q?.text}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(q?.options ?? []).map(opt => {
                  const sel = selected === opt.id;
                  return (
                    <div
                      key={opt.id} role="radio" aria-checked={sel} tabIndex={0}
                      onClick={() => handleSelect(opt.id)} onKeyDown={e => e.key === " " && handleSelect(opt.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 10px", borderRadius: 8, flexShrink: 0,
                        background: sel ? "rgba(215,184,122,0.10)" : "#FAFAFA",
                        boxShadow: sel ? `0 0 0 1.5px ${GOLD}, 0 2px 6px rgba(215,184,122,0.18)` : "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)",
                        cursor: "pointer", boxSizing: "border-box",
                        transition: "box-shadow 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, border: `2px solid ${sel ? GOLD : "#9CA3AF"}`, background: sel ? GOLD : "transparent", boxSizing: "border-box", transition: "background 0.15s, border-color 0.15s" }} />
                      <span style={{ color: NAVY, fontSize: 10.5, fontWeight: 500, lineHeight: 1 }}>{opt.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ height: 22, minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "#EDEEF0", borderTop: "1.5px solid #C9CDD6", flexShrink: 0 }}>
              <span style={{ color: "#374151", fontSize: 9.5, fontWeight: 500 }}>🛡 Anonymous insights • No personal data collected</span>
            </div>
          </div>
        )}

        {/* Language switcher */}
        {availableLangs.length > 1 && (
          <div className="flex gap-1 flex-wrap justify-center">
            {availableLangs.map(l => (
              <button
                key={l.code}
                onClick={() => { setPreviewLang(l.code); setStep(0); setAnswers({}); setDone(false); }}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                  previewLang === l.code
                    ? "bg-[#D7B87A] text-[#0B1929] border-[#D7B87A]"
                    : "border-white/30 text-white hover:bg-white/15"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!done && !isFirst && (
            <button onClick={() => setStep(s => s - 1)} className="text-xs border border-white/30 text-white hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors">← Previous</button>
          )}
          <button onClick={restart} className="text-xs border border-white/30 text-white hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors">↺ Restart</button>
          <button onClick={onClose} className="text-xs bg-white/20 hover:bg-white/30 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors ml-2">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Survey Usage Modal ───────────────────────────────────────────────────────
function SurveyUsageModal({ survey, campaigns, loading, onClose }: {
  survey: Survey;
  campaigns: ModalCampaign[] | null;
  loading: boolean;
  onClose: () => void;
}) {
  const liveCount = (campaigns ?? []).filter(c => c.status === "live").length;

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onBackdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-900 text-lg">Campaign Usage</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{survey.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4 flex-shrink-0">×</button>
        </div>

        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
          {loading && (
            <p className="text-gray-400 text-sm text-center py-10">Loading campaigns…</p>
          )}

          {!loading && campaigns?.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">◫</p>
              <p className="text-sm">No campaigns are using this survey yet.</p>
            </div>
          )}

          {!loading && campaigns && campaigns.length > 0 && (
            <>
              <p className="text-xs text-gray-400 mb-4">
                {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
                {liveCount > 0 && (
                  <> · <span className="text-green-600 font-medium">{liveCount} live</span></>
                )}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Campaign</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Brand</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Publisher</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Status</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Date Range</th>
                      <th className="text-right pb-2.5 font-semibold text-gray-500">Responses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="py-3 pr-4 font-medium text-gray-900">{c.campaign_name}</td>
                        <td className="py-3 pr-4 text-gray-600">{c.brand_name}</td>
                        <td className="py-3 pr-4 text-gray-500">
                          {c.publisher || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`font-semibold px-2 py-0.5 rounded-full capitalize ${CAMPAIGN_STATUS_COLOURS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {c.start_date ? `${c.start_date} → ${c.end_date ?? "ongoing"}` : "—"}
                        </td>
                        <td className="py-3 text-right font-medium text-gray-900">
                          {(c.response_count ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Blank state ──────────────────────────────────────────────────────────────
const BLANK_Q = (): Question => ({
  id:      `q${Date.now()}`,
  text:    { en: "" },
  options: [
    { id: 1, text: { en: "" } },
    { id: 2, text: { en: "" } },
  ],
});

const BLANK_FIELDS: EditFields = {
  name: "", description: "", brand_name: "", research_theme: "", version_number: 1,
  questions: [BLANK_Q()],
  thank_you_title: "Thank you!",
  thank_you_body: "Your response has been recorded.",
  status: "draft", is_template: false,
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function SurveysPage() {
  // Data
  const [surveys,  setSurveys]  = useState<Survey[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Toolbar
  const [activeTab,     setActiveTab]     = useState<"active" | "archived" | "deleted">("active");
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<"all" | "draft" | "ready">("all");
  const [usageFilter,   setUsageFilter]   = useState<"all" | "unused" | "used" | "live">("all");
  const [createdFilter, setCreatedFilter] = useState<"all" | "today" | "7days" | "30days">("all");

  // Preview modal
  const [previewSurvey, setPreviewSurvey] = useState<Survey | null>(null);

  // Usage modal
  const [usageSurvey,    setUsageSurvey]    = useState<Survey | null>(null);
  const [modalCampaigns, setModalCampaigns] = useState<ModalCampaign[] | null>(null);
  const [loadingModal,   setLoadingModal]   = useState(false);

  // Edit drawer
  const [drawerOpen,           setDrawerOpen]           = useState(false);
  const [editingId,            setEditingId]            = useState<string | null>(null);
  const [editingOriginalStatus, setEditingOriginalStatus] = useState<Survey["status"] | null>(null);
  const [fields,               setFields]               = useState<EditFields>(BLANK_FIELDS);
  const [saving,               setSaving]               = useState(false);
  const [formError,            setFormError]            = useState("");
  const [editorLang,           setEditorLang]           = useState<LangCode>("en");
  const [translating,          setTranslating]          = useState(false);
  const [toast,                setToast]                = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Auto-translate all questions from English into editorLang ──────────────
  async function handleTranslate() {
    if (editorLang === "en" || translating) return;
    setTranslating(true);

    // Build a flat list of all EN texts to translate, tracking the structure
    // so we can reassemble: [q0_text, q0_opt0, q0_opt1, ..., q1_text, q1_opt0, ...]
    const structure: { qIdx: number; type: "question" | "option"; oIdx?: number }[] = [];
    const texts: string[] = [];

    fields.questions.forEach((q, qi) => {
      const enText = q.text.en ?? "";
      if (enText.trim()) {
        structure.push({ qIdx: qi, type: "question" });
        texts.push(enText);
      }
      q.options.forEach((o, oi) => {
        const enOpt = o.text.en ?? "";
        if (enOpt.trim()) {
          structure.push({ qIdx: qi, type: "option", oIdx: oi });
          texts.push(enOpt);
        }
      });
    });

    if (!texts.length) {
      showToast("No English text to translate. Fill in the EN tab first.", false);
      setTranslating(false);
      return;
    }

    const res  = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang: editorLang }),
    });
    const json = await res.json();

    if (!res.ok) {
      showToast(json.error ?? "Translation failed.", false);
      setTranslating(false);
      return;
    }

    const translations: string[] = json.translations;

    // Apply translations back to the correct fields
    setFields(f => {
      const qs = f.questions.map(q => ({
        ...q,
        text:    { ...q.text },
        options: q.options.map(o => ({ ...o, text: { ...o.text } })),
      }));
      structure.forEach((s, i) => {
        const translated = translations[i];
        if (!translated) return;
        if (s.type === "question") {
          qs[s.qIdx].text[editorLang] = translated;
        } else if (s.type === "option" && s.oIdx !== undefined) {
          qs[s.qIdx].options[s.oIdx].text[editorLang] = translated;
        }
      });
      return { ...f, questions: qs };
    });

    // Warn about any translated fields that exceed MPU character limits
    let overLimit = 0;
    structure.forEach((s, i) => {
      const t = translations[i] ?? "";
      if (s.type === "question" && t.length > MAX_Q_CHARS)  overLimit++;
      if (s.type === "option"   && t.length > MAX_OPT_CHARS) overLimit++;
    });

    const langLabel = SUPPORTED_LANGUAGES.find(l => l.code === editorLang)?.label ?? editorLang;
    if (overLimit > 0) {
      showToast(
        `Translated into ${langLabel} — but ${overLimit} field${overLimit !== 1 ? "s" : ""} exceed the character limit. Review fields highlighted in red before saving.`,
        false
      );
    } else {
      showToast(`Translated ${texts.length} field${texts.length !== 1 ? "s" : ""} into ${langLabel}.`);
    }
    setTranslating(false);
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/surveys");
    const json = await res.json();
    setSurveys(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const activeSurveys   = useMemo(() => surveys.filter(s => s.status === "draft" || s.status === "ready"), [surveys]);
  const archivedSurveys = useMemo(() => surveys.filter(s => s.status === "archived"), [surveys]);
  const deletedSurveys  = useMemo(() => surveys.filter(s => s.status === "deleted"),  [surveys]);

  const displayed = useMemo(() => {
    let list: Survey[];
    if (activeTab === "active")        list = activeSurveys;
    else if (activeTab === "archived") list = archivedSurveys;
    else                               list = deletedSurveys;

    if (activeTab === "active" && statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (usageFilter === "unused") list = list.filter(s => s.campaign_count === 0);
    if (usageFilter === "used")   list = list.filter(s => s.campaign_count > 0);
    if (usageFilter === "live")   list = list.filter(s => s.live_campaign_count > 0);

    const now = new Date();
    if (createdFilter === "today") {
      list = list.filter(s => new Date(s.created_at).toDateString() === now.toDateString());
    } else if (createdFilter === "7days") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      list = list.filter(s => new Date(s.created_at) >= cutoff);
    } else if (createdFilter === "30days") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
      list = list.filter(s => new Date(s.created_at) >= cutoff);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.created_by ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [surveys, activeTab, statusFilter, usageFilter, createdFilter, search, activeSurveys, archivedSurveys, deletedSurveys]);

  // ── Usage modal ───────────────────────────────────────────────────────────
  async function openUsageModal(s: Survey) {
    setUsageSurvey(s);
    setModalCampaigns(null);
    setLoadingModal(true);
    const res = await fetch(`/api/surveys/${s.id}/campaigns`);
    const json = await res.json();
    setModalCampaigns(json.data ?? []);
    setLoadingModal(false);
  }

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setFields({ ...BLANK_FIELDS, questions: [BLANK_Q()] });
    setEditingId(null);
    setEditingOriginalStatus(null);
    setFormError("");
    setEditorLang("en");
    setDrawerOpen(true);
  }

  function openEdit(s: Survey) {
    setEditingOriginalStatus(s.status);
    setFields({
      name:           s.name,
      description:    s.description,
      brand_name:     s.brand_name ?? "",
      research_theme: s.research_theme ?? "",
      version_number: s.version_number ?? 1,
      questions:      s.questions,
      thank_you_title: s.thank_you_title,
      thank_you_body:  s.thank_you_body,
      status: (s.status === "draft" || s.status === "ready") ? s.status : "draft",
      is_template: s.is_template,
    });
    setEditingId(s.id);
    setFormError("");
    setDrawerOpen(true);
  }

  async function handleSave() {
    if (!fields.name?.trim()) { setFormError("Survey name is required."); return; }
    const qs = fields.questions ?? [];
    if (!qs.length) { setFormError("At least one question is required."); return; }
    for (const q of qs) {
      if (!(q.text.en ?? "").trim()) { setFormError("All questions need English text."); return; }
      if (q.options.filter(o => (o.text.en ?? "").trim()).length < 2) {
        setFormError("Each question needs at least 2 English answers."); return;
      }
    }

    // Run full MPU validation — validator handles localised shape
    const cleanedQs = qs.map(q => ({
      ...q,
      options: q.options
        .filter(o => (o.text.en ?? "").trim())
        .map((o, i) => ({ ...o, id: i + 1 })),  // reindex IDs after any deletions
    }));
    const validationErrors = validateSurvey({
      name:            fields.name,
      questions:       cleanedQs,
      thank_you_title: fields.thank_you_title,
      thank_you_body:  fields.thank_you_body,
    });

    const wantsReady = fields.status === "ready";
    const wasReady   = editingOriginalStatus === "ready";

    if (validationErrors.length > 0) {
      if (wantsReady && !wasReady) {
        // User is trying to set status to Ready — block until fixed
        setFormError(
          `This survey cannot be marked Ready until all MPU validation errors are fixed.\n${validationErrors[0]}`
        );
        return;
      }
      // If the survey WAS ready (editing an existing one) but is now invalid →
      // auto-downgrade to Draft and continue saving with a warning toast.
      // If it was draft/other and isn't trying to be Ready → just save as-is.
    }

    setFormError(""); setSaving(true);

    // Determine effective save status
    let saveStatus: "draft" | "ready" | "archived" = fields.status as "draft" | "ready";
    const autoDowngraded = wasReady && validationErrors.length > 0;
    if (editingOriginalStatus === "archived") {
      saveStatus = "archived";                         // preserve archived
    } else if (autoDowngraded || (wantsReady && validationErrors.length > 0)) {
      saveStatus = "draft";                            // auto-downgrade
    }

    const payload = {
      ...fields,
      status:    saveStatus,
      questions: cleanedQs,
    };

    const res = await fetch(
      editingId ? `/api/surveys/${editingId}` : "/api/surveys",
      { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );

    setSaving(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setFormError(json.error ?? "Failed to save survey. Please try again.");
      return; // keep drawer open so the user sees the error
    }

    setDrawerOpen(false);

    if (autoDowngraded) {
      setToast({ msg: "Survey has validation issues and was moved back to Draft.", ok: false });
      setTimeout(() => setToast(null), 6000);
    } else {
      showToast(editingId ? "Survey updated." : "Survey created.");
    }
    load();
  }

  // ── Question editing ───────────────────────────────────────────────────────
  function setQText(idx: number, lang: LangCode, text: string) {
    setFields(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === idx ? { ...q, text: { ...q.text, [lang]: text } } : q
      ),
    }));
  }
  function addQuestion() {
    if (fields.questions.length >= MAX_QUESTIONS) return;
    setFields(f => ({ ...f, questions: [...f.questions, BLANK_Q()] }));
  }
  function removeQuestion(idx: number) {
    setFields(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));
  }
  function setOptionText(qIdx: number, oIdx: number, lang: LangCode, val: string) {
    setFields(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.map((o, j) => j === oIdx ? { ...o, text: { ...o.text, [lang]: val } } : o) }
          : q
      ),
    }));
  }
  function addOption(qIdx: number) {
    setFields(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx
          ? { ...q, options: [...q.options, { id: q.options.length + 1, text: { en: "" } } as LocalisedOption] }
          : q
      ),
    }));
  }
  function removeOption(qIdx: number, oIdx: number) {
    setFields(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.filter((_, j) => j !== oIdx).map((o, k) => ({ ...o, id: k + 1 })) }
          : q
      ),
    }));
  }

  // ── Survey actions ─────────────────────────────────────────────────────────
  async function openDuplicate(s: Survey) {
    const payload: EditFields = {
      name:           `${s.name} (Copy)`,
      description:    s.description,
      brand_name:     s.brand_name ?? "",
      research_theme: s.research_theme ?? "",
      version_number: s.version_number ?? 1,
      questions:      s.questions,
      thank_you_title: s.thank_you_title,
      thank_you_body:  s.thank_you_body,
      status:          "draft",
      is_template:     s.is_template,
    };
    await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    load();
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this survey? It will be hidden from the active list but can be restored at any time.")) return;
    await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "archive" }),
    });
    load();
  }

  async function handleRestore(id: string) {
    await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "restore" }),
    });
    load();
  }

  async function handleSoftDelete(s: Survey) {
    const msg = s.response_count > 0
      ? `⚠️ "${s.name}" has ${s.response_count.toLocaleString()} response${s.response_count !== 1 ? "s" : ""} collected.\n\nThe response data will be preserved in the database, but this survey will no longer appear in your active view.\n\nMove to deleted items?`
      : `Move "${s.name}" to deleted items? It can be restored later.`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/surveys/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not delete survey.");
    }
    load();
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const d = (s: string | null | undefined) => s ? new Date(s).toISOString().slice(0, 10) : "";
    const rows = displayed.map(s => ({
      "Name":             s.name,
      "Brand":            s.brand_name ?? "",
      "Research Theme":   s.research_theme ?? "",
      "Version":          s.version_number ?? 1,
      "Description":      s.description ?? "",
      "Status":           effectiveSurveyStatus(s),
      "Questions":        s.questions.length,
      "Created By":       s.created_by ?? "",
      "Created":          d(s.created_at),
      "Updated":          d(s.updated_at),
      "Campaigns":        s.campaign_count,
      "Live Campaigns":   s.live_campaign_count,
      "Responses":        s.response_count,
      "Last Used":        d(s.last_used_at),
      "Last Response":    d(s.last_response_at),
      "Archived Date":    d(s.archived_at),
      "Deleted Date":     d(s.deleted_at),
    }));
    const csv  = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `fanometrix-surveys-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* ── Page header ── */}
        <div className="mb-5">
          {/* Title + counts + buttons — stacks on mobile, row on sm+ */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {activeSurveys.length} Active · {archivedSurveys.length} Archived · {deletedSurveys.length} Deleted
              </p>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                onClick={exportCSV}
                disabled={displayed.length === 0}
                className="text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
              <button
                onClick={openCreate}
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{ background: GOLD, color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = GOLD; }}
              >
                + Create Survey
              </button>
            </div>
          </div>
          {/* Info card — compact, full-width, replaces the inline paragraph */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-gray-400 flex-shrink-0 text-sm mt-0.5">ℹ</span>
            <p className="text-sm text-gray-500 leading-relaxed">
              Reusable questionnaires containing questions and a thank-you screen shown inside the
              300×250 MPU. Surveys must be attached to a campaign before going live.
            </p>
          </div>
        </div>

        {/* ── Search + Filters ── */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-5">
          <div className="sm:flex-1 sm:min-w-[200px] relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search surveys…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>

          {activeTab === "active" && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          )}

          <select
            value={usageFilter}
            onChange={e => setUsageFilter(e.target.value as typeof usageFilter)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
          >
            <option value="all">All Usage</option>
            <option value="unused">Unused</option>
            <option value="used">Used by campaigns</option>
            <option value="live">Serving live campaigns</option>
          </select>

          <select
            value={createdFilter}
            onChange={e => setCreatedFilter(e.target.value as typeof createdFilter)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
          >
            <option value="all">Any time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
          </select>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {(
            [
              { key: "active",   label: `Active (${activeSurveys.length})`    },
              { key: "archived", label: `Archived (${archivedSurveys.length})` },
              { key: "deleted",  label: `Deleted (${deletedSurveys.length})`   },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setStatusFilter("all"); setUsageFilter("all"); setCreatedFilter("all"); setSearch(""); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-[#D7B87A] text-[#0B1929]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── List ── */}
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◫</p>
            <p className="font-medium">
              {activeTab === "active"   ? "No active surveys"   :
               activeTab === "archived" ? "No archived surveys" :
                                          "No deleted surveys"}
            </p>
            {activeTab === "active" && <p className="text-sm mt-1">Create your first survey to get started.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(s => (
            <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">

              {/* ── Active / Archived card ── */}
              {s.status !== "deleted" && (
                <>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        {s.is_template && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Template</span>
                        )}
                      </div>
                      {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                      {s.created_by && (
                        <p className="text-xs text-gray-400 mt-0.5">Created by {s.created_by}</p>
                      )}
                    </div>
                    {/* Lifecycle badge — top-right, subtle. Shows "Needs Fix" if stored
                        as Ready but failing MPU validation. */}
                    {(() => {
                      const eff = effectiveSurveyStatus(s);
                      return (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${STATUS_COLOURS[eff] ?? STATUS_COLOURS.draft}`}>
                          {statusLabel(eff)}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Row 1: structure + dates */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                    <span>{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                    <span className="text-gray-200">·</span>
                    <span>Created: {formatDate(s.created_at)}</span>
                    <span className="text-gray-200">·</span>
                    <span>Updated: {formatDate(s.updated_at)}</span>
                    {s.status === "archived" && s.archived_at && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-amber-600">Archived: {formatDate(s.archived_at)}</span>
                      </>
                    )}
                  </div>

                  {/* Row 2: usage stats */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                    {s.campaign_count > 0 ? (
                      <button
                        onClick={() => openUsageModal(s)}
                        className="text-[#0B1929] font-medium hover:text-[#D7B87A] hover:underline transition-colors"
                      >
                        Used by: {s.campaign_count} campaign{s.campaign_count !== 1 ? "s" : ""}
                      </button>
                    ) : (
                      <span>Not yet used</span>
                    )}

                    {s.live_campaign_count > 0 && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-green-600 font-medium">
                          Serving in: {s.live_campaign_count} live campaign{s.live_campaign_count !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}

                    {s.last_used_at && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span>Last used: {formatDate(s.last_used_at)}</span>
                      </>
                    )}

                    {s.last_response_at && formatRelativeTime(s.last_response_at) && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span title={formatDatetime(s.last_response_at)}>
                          Last response: {formatRelativeTime(s.last_response_at)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Language coverage badges */}
                  {(() => {
                    const qs = s.questions as LocalisedQuestion[];
                    return (
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {SUPPORTED_LANGUAGES.map(lang => {
                          const isEN    = lang.code === "en";
                          const complete = qs.length > 0 && (
                            isEN
                              ? qs.every(q => (q.text as Record<string, string>)["en"]?.trim())
                              : qs.every(q =>
                                  (q.text as Record<string, string>)[lang.code]?.trim() &&
                                  q.options.every(o => (o.text as Record<string, string>)[lang.code]?.trim())
                                )
                          );
                          const partial = !isEN && !complete && qs.some(q =>
                            (q.text as Record<string, string>)[lang.code]?.trim()
                          );
                          if (!complete && !partial) return null;
                          return (
                            <span key={lang.code} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                              complete
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${complete ? "bg-green-500" : "bg-amber-400"}`} />
                              {lang.label}
                              {!complete && <span className="text-[10px]">partial</span>}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => setPreviewSurvey(s)}
                      disabled={s.questions.length === 0}
                      className="text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      Preview
                    </button>

                    <button
                      onClick={() => openEdit(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => openDuplicate(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Duplicate
                    </button>

                    {s.status !== "archived" ? (
                      <>
                        <button
                          onClick={() => handleArchive(s.id)}
                          className="text-xs border border-amber-200 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => handleSoftDelete(s)}
                          disabled={s.campaign_count > 0}
                          title={
                            s.campaign_count > 0
                              ? "This survey is still linked to active campaigns. Remove it from all campaigns first."
                              : "Move to deleted items"
                          }
                          className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleRestore(s.id)}
                        className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ── Deleted card ── */}
              {s.status === "deleted" && (
                <>
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-0.5">
                      <p className="font-semibold text-gray-400 line-through">{s.name}</p>
                      <span className="text-xs font-medium bg-red-100 text-red-600 px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap">Deleted</span>
                    </div>
                    {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
                      {s.deleted_by && <span>Deleted by: <span className="font-medium text-gray-500">{s.deleted_by}</span></span>}
                      {s.deleted_at && <><span className="text-gray-200">·</span><span>Deleted: {formatDate(s.deleted_at)}</span></>}
                      {s.delete_reason && <><span className="text-gray-200">·</span><span>Reason: {s.delete_reason}</span></>}
                      <span className="text-gray-200">·</span>
                      <span>{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => setPreviewSurvey(s)}
                      disabled={s.questions.length === 0}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => openDuplicate(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleRestore(s.id)}
                      className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                </>
              )}

            </div>
          ))}
        </div>

      </div>

      {/* ── MPU Preview Modal ── */}
      {previewSurvey && (
        <MPUPreviewModal survey={previewSurvey} onClose={() => setPreviewSurvey(null)} />
      )}

      {/* ── Survey Usage Modal ── */}
      {usageSurvey && (
        <SurveyUsageModal
          survey={usageSurvey}
          campaigns={modalCampaigns}
          loading={loadingModal}
          onClose={() => { setUsageSurvey(null); setModalCampaigns(null); }}
        />
      )}

      {/* ── Edit / Create Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full sm:w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingId ? "Edit Survey" : "Create Survey"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Info banner for archived surveys */}
              {editingOriginalStatus === "archived" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800">Editing an archived survey</p>
                  <p className="text-xs text-amber-700 mt-0.5">Content changes will be saved. The survey will remain archived — use Restore to make it active again.</p>
                </div>
              )}

              {/* ── Name Builder ── */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name Builder</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Brand</label>
                    <input value={fields.brand_name}
                      onChange={e => setFields(f => ({ ...f, brand_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]"
                      placeholder="Carlsberg" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Research Theme</label>
                    <input value={fields.research_theme}
                      onChange={e => setFields(f => ({ ...f, research_theme: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]"
                      placeholder="Fan Understanding" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Version</label>
                    <input type="number" min={1} max={99}
                      value={fields.version_number}
                      onChange={e => setFields(f => ({ ...f, version_number: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
                  </div>
                  <div className="flex items-end">
                    <button type="button"
                      onClick={() => {
                        const n = generateSurveyName(fields.brand_name, fields.research_theme, fields.version_number);
                        if (n) setFields(f => ({ ...f, name: n }));
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors">
                      Auto Generate Name
                    </button>
                  </div>
                </div>
                {/* Live preview */}
                {(fields.brand_name || fields.research_theme) && (() => {
                  const preview = generateSurveyName(fields.brand_name, fields.research_theme, fields.version_number);
                  return preview ? (
                    <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono">
                      {preview}
                    </p>
                  ) : null;
                })()}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Survey Name *</label>
                <input
                  value={fields.name}
                  onChange={e => setFields(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="e.g. Carlsberg - Fan Understanding - v1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                <input
                  value={fields.description ?? ""}
                  onChange={e => setFields(f => ({ ...f, description: e.target.value || null }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="Optional description"
                />
              </div>

              {/* Status select — hidden when editing an archived survey (status is preserved automatically) */}
              {editingOriginalStatus !== "archived" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                    <select
                      value={fields.status}
                      onChange={e => setFields(f => ({ ...f, status: e.target.value as "draft" | "ready" }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                    >
                      <option value="draft">Draft — still being edited</option>
                      <option value="ready">Ready — can be attached to campaigns</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fields.is_template}
                        onChange={e => setFields(f => ({ ...f, is_template: e.target.checked }))}
                        className="accent-[#D7B87A] w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">Mark as template</span>
                    </label>
                  </div>
                </div>
              )}

              {editingOriginalStatus === "archived" && (
                <div className="flex items-center pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fields.is_template}
                      onChange={e => setFields(f => ({ ...f, is_template: e.target.checked }))}
                      className="accent-[#D7B87A] w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Mark as template</span>
                  </label>
                </div>
              )}

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">
                    Questions ({fields.questions.length}/{MAX_QUESTIONS})
                  </label>
                  <button
                    onClick={addQuestion}
                    disabled={fields.questions.length >= MAX_QUESTIONS}
                    className="text-xs text-[#D7B87A] hover:text-[#C9A766] disabled:opacity-30"
                  >
                    + Add question
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Maximum {MAX_QUESTIONS} questions · {MAX_OPTIONS} answers each.
                  English is required. Translations are optional — the embed falls back to English if a translation is blank.
                </p>

                {/* Language selector tabs */}
                <div className="flex gap-1 mb-3 flex-wrap items-center">
                  {SUPPORTED_LANGUAGES.map(lang => {
                    const isActive   = editorLang === lang.code;
                    const isEN       = lang.code === "en";
                    const isComplete = !isEN && fields.questions.length > 0 &&
                      fields.questions.every(q =>
                        (q.text[lang.code] ?? "").trim() &&
                        q.options.every(o => (o.text[lang.code] ?? "").trim())
                      );
                    const hasAny = !isEN && fields.questions.some(q =>
                      (q.text[lang.code] ?? "").trim()
                    );
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setEditorLang(lang.code)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                          isActive
                            ? "bg-[#0B1929] text-[#D7B87A] border-[#0B1929]"
                            : "bg-white text-gray-500 border-gray-200 hover:border-[#D7B87A]"
                        }`}
                      >
                        {lang.label}{isEN ? " *" : ""}
                        {isComplete && <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                        {hasAny && !isComplete && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                  {editorLang !== "en" && (
                    <button
                      type="button"
                      onClick={handleTranslate}
                      disabled={translating}
                      className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] disabled:opacity-50 transition-colors"
                    >
                      {translating ? "Translating…" : "✦ Translate from English"}
                    </button>
                  )}
                </div>
                {editorLang !== "en" && !translating && (
                  <p className="text-xs text-gray-400 mb-3">
                    Optional — leave blank to show English as fallback. Click "Translate from English" to auto-fill.
                  </p>
                )}

                <div className="space-y-4">
                  {fields.questions.map((q, qi) => {
                    const qVal  = (q.text[editorLang] ?? "");
                    const qOver = qVal.length > MAX_Q_CHARS;
                    return (
                      <div key={q.id} className={`border rounded-xl p-4 space-y-3 ${qOver ? "border-red-200" : "border-gray-200"}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-[#0B1929] w-6 mt-1.5">Q{qi + 1}</span>
                          <div className="flex-1 min-w-0">
                            <input
                              value={qVal}
                              maxLength={MAX_Q_CHARS + 10}
                              onChange={e => setQText(qi, editorLang, e.target.value)}
                              className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none ${
                                qOver
                                  ? "border-red-300 focus:border-red-400"
                                  : "border-gray-200 focus:border-[#D7B87A]"
                              }`}
                              placeholder={
                                editorLang === "en"
                                  ? "Question text…"
                                  : (q.text.en ? `"${q.text.en}"` : "Question text…")
                              }
                            />
                            <div className="flex justify-end mt-0.5">
                              <CharCount len={qVal.length} max={MAX_Q_CHARS} />
                            </div>
                          </div>
                          {fields.questions.length > 1 && (
                            <button onClick={() => removeQuestion(qi)} className="text-red-400 hover:text-red-600 text-xs mt-1.5 flex-shrink-0">✕</button>
                          )}
                        </div>
                        <div className="space-y-2 pl-8">
                          {q.options.map((opt, oi) => {
                            const oVal  = (opt.text[editorLang] ?? "");
                            const oOver = oVal.length > MAX_OPT_CHARS;
                            return (
                              <div key={opt.id}>
                                <div className="flex items-center gap-2">
                                  <input
                                    value={oVal}
                                    maxLength={MAX_OPT_CHARS + 5}
                                    onChange={e => setOptionText(qi, oi, editorLang, e.target.value)}
                                    className={`flex-1 border rounded-lg px-2 py-1 text-xs focus:outline-none ${
                                      oOver
                                        ? "border-red-300 focus:border-red-400"
                                        : "border-gray-100 focus:border-[#D7B87A]"
                                    }`}
                                    placeholder={
                                      editorLang === "en"
                                        ? `Option ${oi + 1}`
                                        : (opt.text.en ? `"${opt.text.en}"` : `Option ${oi + 1}`)
                                    }
                                  />
                                  {q.options.length > 2 && (
                                    <button onClick={() => removeOption(qi, oi)} className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                                  )}
                                </div>
                                {oVal.length > 0 && (
                                  <div className="flex justify-end">
                                    <CharCount len={oVal.length} max={MAX_OPT_CHARS} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {q.options.length < MAX_OPTIONS && editorLang === "en" && (
                            <button onClick={() => addOption(qi)} className="text-xs text-[#D7B87A] hover:text-[#C9A766]">+ Add option</button>
                          )}
                          {q.options.length >= MAX_OPTIONS && (
                            <p className="text-xs text-gray-400">Maximum {MAX_OPTIONS} answers per question.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Thank you screen */}
              <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600">Thank You Screen</p>
                <div>
                  <input
                    value={fields.thank_you_title}
                    maxLength={MAX_TY_TITLE + 5}
                    onChange={e => setFields(f => ({ ...f, thank_you_title: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white ${
                      fields.thank_you_title.length > MAX_TY_TITLE
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-200 focus:border-[#D7B87A]"
                    }`}
                    placeholder="Thank you title"
                  />
                  <div className="flex justify-end mt-0.5">
                    <CharCount len={fields.thank_you_title.length} max={MAX_TY_TITLE} />
                  </div>
                </div>
                <div>
                  <input
                    value={fields.thank_you_body}
                    maxLength={MAX_TY_BODY + 10}
                    onChange={e => setFields(f => ({ ...f, thank_you_body: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white ${
                      fields.thank_you_body.length > MAX_TY_BODY
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-200 focus:border-[#D7B87A]"
                    }`}
                    placeholder="Thank you message"
                  />
                  <div className="flex justify-end mt-0.5">
                    <CharCount len={fields.thank_you_body.length} max={MAX_TY_BODY} />
                  </div>
                </div>
              </div>

              {formError && <p className="text-red-500 text-xs">{formError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: GOLD, color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = GOLD; }}
              >
                {saving ? "Saving…" : "Save Survey"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-orange-500 text-white"
        }`}>
          {toast.ok ? "✓" : "⚠"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

// ─── MPU inline styles (mirrors /embed page exactly) ────────────────────────

const M = {
  wrap: {
    width: 300, height: 250, overflow: "hidden" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "linear-gradient(160deg, #312e81 0%, #1e1b4b 100%)",
    display: "flex", flexDirection: "column" as const,
    boxSizing: "border-box" as const, borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 12px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0,
  },
  logo: {
    color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
    display: "flex", alignItems: "center", gap: 4,
  },
  dot:  { width: 7, height: 7, borderRadius: "50%", background: "#818cf8", display: "inline-block", flexShrink: 0 },
  step: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 600, flexShrink: 0 },
  body: {
    flex: 1, padding: "8px 12px 8px",
    display: "flex", flexDirection: "column" as const, gap: 7, minHeight: 0,
  },
  question: { color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.35, margin: 0, flexShrink: 0 },
  options:  { display: "flex", flexDirection: "column" as const, gap: 4, flex: 1 },
  option: (sel: boolean) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "5px 9px",
    borderRadius: 6, flexShrink: 0, cursor: "pointer" as const,
    border:      `1px solid ${sel ? "rgba(165,180,252,0.8)" : "rgba(255,255,255,0.15)"}`,
    background:  sel ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.06)",
    transition: "background 0.1s, border-color 0.1s",
  }),
  radio: (sel: boolean) => ({
    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
    border: `2px solid ${sel ? "#a5b4fc" : "rgba(255,255,255,0.4)"}`,
    background: sel ? "#a5b4fc" : "transparent",
    boxSizing: "border-box" as const,
  }),
  label: { color: "#e0e7ff", fontSize: 10.5, fontWeight: 500, lineHeight: 1 },
  btn: (dis: boolean) => ({
    background: dis ? "rgba(255,255,255,0.15)" : "#fff",
    color:      dis ? "rgba(255,255,255,0.35)" : "#312e81",
    border: "none", borderRadius: 7, padding: "7px 0", fontSize: 11,
    fontWeight: 700, letterSpacing: "0.03em",
    cursor: dis ? "not-allowed" as const : "pointer" as const,
    width: "100%", flexShrink: 0,
  }),
  success: {
    width: 300, height: 250, overflow: "hidden" as const, borderRadius: 10,
    background: "linear-gradient(160deg, #312e81 0%, #1e1b4b 100%)",
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif",
    gap: 8, textAlign: "center" as const, padding: 20,
    boxSizing: "border-box" as const, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
};

// ─── MPU Preview Modal ────────────────────────────────────────────────────────

type PreviewSurvey = {
  name: string;
  questions: { id: string; text: string; options: string[] }[];
  thank_you_title: string;
  thank_you_body: string;
};

function MPUPreviewModal({ survey, onClose }: { survey: PreviewSurvey; onClose: () => void }) {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done,    setDone]    = useState(false);

  const questions = survey.questions ?? [];
  const q         = questions[step];
  const selected  = q ? (answers[q.id] ?? "") : "";
  const isLast    = step === questions.length - 1;
  const isFirst   = step === 0;

  function restart() { setStep(0); setAnswers({}); setDone(false); }

  function handleNext() {
    if (!selected) return;
    if (isLast) { setDone(true); return; }
    setStep(s => s + 1);
  }

  // Close on backdrop click
  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onBackdrop}
    >
      <div className="flex flex-col items-center gap-4">

        {/* PREVIEW MODE badge */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center shadow">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">◆ Preview Mode</p>
          <p className="text-xs text-amber-600 mt-0.5">No responses are recorded.</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">{survey.name}</p>
        </div>

        {/* 300 × 250 MPU */}
        {done ? (
          <div style={M.success}>
            <div style={{ fontSize: 34, lineHeight: 1 }}>🎉</div>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>
              {survey.thank_you_title || "Thank you!"}
            </p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, lineHeight: 1.4 }}>
              {survey.thank_you_body || "Your response has been recorded."}
            </p>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, marginTop: 6, letterSpacing: "0.06em" }}>
              PREVIEW MODE · NOT RECORDED
            </p>
          </div>
        ) : (
          <div style={M.wrap}>
            {/* Header */}
            <div style={M.header}>
              <div style={M.logo}>
                <span style={M.dot} />
                Fanometrix Pulse
              </div>
              <span style={M.step}>{step + 1} of {questions.length}</span>
            </div>

            {/* Body */}
            <div style={M.body}>
              <p style={M.question}>{q?.text}</p>

              <div style={M.options}>
                {(q?.options ?? []).map(opt => {
                  const sel = selected === opt;
                  return (
                    <div
                      key={opt}
                      style={M.option(sel)}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                      role="radio"
                      aria-checked={sel}
                      tabIndex={0}
                      onKeyDown={e => e.key === " " && setAnswers(a => ({ ...a, [q.id]: opt }))}
                    >
                      <div style={M.radio(sel)} />
                      <span style={M.label}>{opt}</span>
                    </div>
                  );
                })}
              </div>

              <button style={M.btn(!selected)} onClick={handleNext} disabled={!selected}>
                {isLast ? "Submit ✓" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* Controls below the frame */}
        <div className="flex items-center gap-2">
          {!done && !isFirst && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-xs border border-white/30 text-white hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors"
            >
              ← Previous
            </button>
          )}
          <button
            onClick={restart}
            className="text-xs border border-white/30 text-white hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors"
          >
            ↺ Restart
          </button>
          {!done && !isLast && (
            <button
              onClick={() => setStep(s => s + 1)}
              className="text-xs border border-white/30 text-white hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors"
            >
              Next →
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs bg-white/20 hover:bg-white/30 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors ml-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type Question = { id: string; text: string; options: string[] };
type Survey = {
  id: string;
  name: string;
  description: string | null;
  questions: Question[];
  thank_you_title: string;
  thank_you_body: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "live" | "completed" | "archived";
  is_template: boolean;
  created_at: string;
};

const STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  live:      "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived:  "bg-amber-100 text-amber-700",
};

const BLANK_Q = (): Question => ({
  id: `q${Date.now()}`,
  text: "",
  options: ["", ""],
});

const BLANK_SURVEY: Omit<Survey, "id" | "created_at"> = {
  name: "", description: "", questions: [BLANK_Q()],
  thank_you_title: "Thank you!",
  thank_you_body: "Your response has been recorded.",
  start_date: null, end_date: null,
  status: "draft", is_template: false,
};

export default function SurveysPage() {
  const [surveys,  setSurveys]  = useState<Survey[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [previewSurvey, setPreviewSurvey] = useState<Survey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,  setEditing]  = useState<Partial<Survey>>(BLANK_SURVEY);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/surveys");
    const json = await res.json();
    setSurveys(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing({ ...BLANK_SURVEY, questions: [BLANK_Q()] });
    setDrawerOpen(true);
  }

  function openEdit(s: Survey) {
    setEditing({ ...s });
    setDrawerOpen(true);
  }

  async function openDuplicate(s: Survey) {
    const payload = { ...s, name: `${s.name} (copy)`, status: "draft", id: undefined, created_at: undefined };
    delete payload.id; delete payload.created_at;
    await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this survey? This cannot be undone.")) return;
    await fetch(`/api/surveys/${id}`, { method: "DELETE" });
    load();
  }

  async function handleSave() {
    if (!editing.name?.trim()) { setError("Survey name is required."); return; }
    const qs = editing.questions ?? [];
    if (!qs.length) { setError("At least one question is required."); return; }
    for (const q of qs) {
      if (!q.text.trim()) { setError("All questions need text."); return; }
      if (q.options.filter(o => o.trim()).length < 2) { setError("Each question needs at least 2 options."); return; }
    }
    setError(""); setSaving(true);

    const payload = {
      ...editing,
      questions: qs.map(q => ({ ...q, options: q.options.filter(o => o.trim()) })),
    };

    if (editing.id) {
      await fetch(`/api/surveys/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setDrawerOpen(false);
    load();
  }

  function setQ(idx: number, patch: Partial<Question>) {
    setEditing(e => ({
      ...e,
      questions: (e.questions ?? []).map((q, i) => i === idx ? { ...q, ...patch } : q),
    }));
  }

  function addQuestion() {
    if ((editing.questions?.length ?? 0) >= 3) return;
    setEditing(e => ({ ...e, questions: [...(e.questions ?? []), BLANK_Q()] }));
  }

  function removeQuestion(idx: number) {
    setEditing(e => ({ ...e, questions: (e.questions ?? []).filter((_, i) => i !== idx) }));
  }

  function setOption(qIdx: number, oIdx: number, val: string) {
    setEditing(e => ({
      ...e,
      questions: (e.questions ?? []).map((q, i) => i === qIdx
        ? { ...q, options: q.options.map((o, j) => j === oIdx ? val : o) }
        : q),
    }));
  }

  function addOption(qIdx: number) {
    setEditing(e => ({
      ...e,
      questions: (e.questions ?? []).map((q, i) => i === qIdx
        ? { ...q, options: [...q.options, ""] }
        : q),
    }));
  }

  function removeOption(qIdx: number, oIdx: number) {
    setEditing(e => ({
      ...e,
      questions: (e.questions ?? []).map((q, i) => i === qIdx
        ? { ...q, options: q.options.filter((_, j) => j !== oIdx) }
        : q),
    }));
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
            <p className="text-sm text-gray-400 mt-0.5">{surveys.length} survey{surveys.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Create Survey
          </button>
        </div>

        {loading && <p className="text-gray-400">Loading…</p>}

        {!loading && surveys.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◫</p>
            <p className="font-medium">No surveys yet</p>
            <p className="text-sm mt-1">Create your first survey to get started.</p>
          </div>
        )}

        <div className="space-y-3">
          {surveys.map(s => (
            <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                  {s.is_template && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Template</span>
                  )}
                </div>
                {s.description && <p className="text-xs text-gray-400 truncate">{s.description}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {s.questions.length} question{s.questions.length !== 1 ? "s" : ""}
                  {s.start_date && <> · from {s.start_date}</>}
                  {s.end_date   && <> to {s.end_date}</>}
                </p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${STATUS_COLOURS[s.status]}`}>
                {s.status}
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setPreviewSurvey(s)}
                  disabled={s.questions.length === 0}
                  className="text-xs border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Preview MPU
                </button>
                <button onClick={() => openEdit(s)}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">Edit</button>
                <button onClick={() => openDuplicate(s)}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">Duplicate</button>
                <button onClick={() => handleDelete(s.id)}
                  className="text-xs border border-red-100 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MPU Preview Modal */}
      {previewSurvey && (
        <MPUPreviewModal
          survey={previewSurvey}
          onClose={() => setPreviewSurvey(null)}
        />
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Survey" : "Create Survey"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Basic fields */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Survey Name *</label>
                <input value={editing.name ?? ""} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" placeholder="e.g. Premier League Fan Pulse" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                <input value={editing.description ?? ""} onChange={e => setEditing(x => ({ ...x, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" placeholder="Optional description" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
                  <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                  <input type="date" value={editing.end_date ?? ""} onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                  <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value as Survey["status"] }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                    {["draft","live","completed","archived"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editing.is_template ?? false} onChange={e => setEditing(x => ({ ...x, is_template: e.target.checked }))}
                      className="accent-indigo-600 w-4 h-4" />
                    <span className="text-sm text-gray-700">Save as template</span>
                  </label>
                </div>
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">Questions ({editing.questions?.length ?? 0}/3)</label>
                  <button onClick={addQuestion} disabled={(editing.questions?.length ?? 0) >= 3}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-30">+ Add question</button>
                </div>

                <div className="space-y-4">
                  {(editing.questions ?? []).map((q, qi) => (
                    <div key={q.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-500 w-6">Q{qi + 1}</span>
                        <input value={q.text} onChange={e => setQ(qi, { text: e.target.value })}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400" placeholder="Question text…" />
                        {(editing.questions?.length ?? 0) > 1 && (
                          <button onClick={() => removeQuestion(qi)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        )}
                      </div>
                      <div className="space-y-2 pl-8">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input value={opt} onChange={e => setOption(qi, oi, e.target.value)}
                              className="flex-1 border border-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-300" placeholder={`Option ${oi + 1}`} />
                            {q.options.length > 2 && (
                              <button onClick={() => removeOption(qi, oi)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                            )}
                          </div>
                        ))}
                        {q.options.length < 6 && (
                          <button onClick={() => addOption(qi)} className="text-xs text-indigo-500 hover:text-indigo-700">+ Add option</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thank you screen */}
              <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600">Thank You Screen</p>
                <input value={editing.thank_you_title ?? ""} onChange={e => setEditing(x => ({ ...x, thank_you_title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" placeholder="Thank you title" />
                <input value={editing.thank_you_body ?? ""} onChange={e => setEditing(x => ({ ...x, thank_you_body: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" placeholder="Thank you message" />
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60">
                {saving ? "Saving…" : "Save Survey"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

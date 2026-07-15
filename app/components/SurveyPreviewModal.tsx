"use client";

// A simulated 300×250 MPU ad-unit walkthrough of a survey — shared by the
// Surveys page and the Research Project Workspace's "Attach Existing
// Survey" picker, so previewing a survey looks identical no matter where
// it's opened from.
import { useState } from "react";
import {
  SUPPORTED_LANGUAGES, resolveQuestion, resolveText,
  type LangCode, type LocalisedQuestion, type LocalisedText,
} from "@/lib/survey-locale";

const NAVY = "#071B2F";
const GOLD = "#D7B87A";

export type PreviewableSurvey = {
  name: string;
  questions: LocalisedQuestion[];
  thank_you_title: LocalisedText;
  thank_you_body: LocalisedText;
  enabled_languages: string[];
};

export function SurveyPreviewModal({ survey, onClose }: { survey: PreviewableSurvey; onClose: () => void }) {
  const [step,        setStep]        = useState(0);
  const [answers,     setAnswers]     = useState<Record<string, number>>({});
  const [done,        setDone]        = useState(false);
  const [previewLang, setPreviewLang] = useState<LangCode>("en");

  // Which of the survey's enabled languages have at least some content (for the language switcher)
  const availableLangs = SUPPORTED_LANGUAGES.filter(l =>
    (survey.enabled_languages ?? ["en"]).includes(l.code) && (
      l.code === "en" ||
      (survey.questions ?? []).some(q => (q.text as Record<string, string>)[l.code]?.trim()) ||
      !!(survey.thank_you_title as Record<string, string> | undefined)?.[l.code]?.trim()
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
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>{resolveText(survey.thank_you_title ?? {}, previewLang) || "Thank you!"}</p>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 10.5, margin: 0, lineHeight: 1.4 }}>{resolveText(survey.thank_you_body ?? {}, previewLang) || "Your anonymous feedback helps improve the football experience for fans everywhere."}</p>
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

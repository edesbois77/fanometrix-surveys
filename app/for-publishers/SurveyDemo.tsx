"use client";

import { useState } from "react";

// A self-contained, interactive demonstration of the Fanometrix survey
// experience: invitation → questions with answer selection and progress →
// thank you. Illustrative sample questions only — no real research data.
const NAVY = "#0B1929";
const GOLD = "#D7B87A";
const GOLD_INK = "#8A6D2F";
const INK = "#181B20";
const GREY = "#4B5563";
const BORDER = "#E5E7EB";
const WASH = "#FBF3E1";

const QUESTIONS = [
  { q: "How often do you watch live football?", options: ["Every day", "A few times a week", "Most weeks", "Occasionally"] },
  { q: "What matters most in your matchday experience?", options: ["Atmosphere", "Value for money", "Food & drink", "Getting there"] },
];

type Screen = "invite" | 0 | 1 | "done";

export function SurveyDemo({ brand }: { brand?: string }) {
  const [screen, setScreen] = useState<Screen>("invite");
  const [picked, setPicked] = useState<number | null>(null);

  function choose(qIndex: 0 | 1, optIndex: number) {
    if (picked !== null) return;
    setPicked(optIndex);
    // Brief pause so the selection is visible before advancing.
    setTimeout(() => {
      setPicked(null);
      setScreen(qIndex === 0 ? 1 : "done");
    }, 380);
  }
  function reset() { setPicked(null); setScreen("invite"); }

  const isQ = screen === 0 || screen === 1;
  const qIndex = (screen === 1 ? 1 : 0) as 0 | 1;

  return (
    <div className="w-full max-w-[340px]">
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "#fff", boxShadow: "0 22px 48px -18px rgba(11,25,41,0.30)" }}>
        {/* creative header */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY }}>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.72)" }}>{brand ? `${brand} · Sponsored research` : "Sponsored research"}</span>
          </span>
          <span aria-hidden className="text-[15px] leading-none" style={{ color: "rgba(255,255,255,0.4)" }}>×</span>
        </div>

        {/* body — fixed height keeps the frame steady across screens */}
        <div className="p-6 min-h-[256px] flex flex-col">
          {screen === "invite" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="relative mb-5" style={{ width: 74, height: 74 }}>
                <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden>
                  <circle cx="37" cy="37" r="33" fill="none" stroke={BORDER} strokeWidth="4" />
                  <circle cx="37" cy="37" r="33" fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeDasharray="207" strokeDashoffset="52" transform="rotate(-90 37 37)" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-bold" style={{ fontSize: 18, color: NAVY }}>20s</span>
              </div>
              <p className="font-bold mb-1.5" style={{ fontSize: 18, color: INK }}>A quick question for football fans</p>
              <p className="mb-6" style={{ fontSize: 13, color: GREY }}>Anonymous · takes about 20 seconds</p>
              <button onClick={() => setScreen(0)} className="w-full rounded-xl py-3 font-bold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ background: GOLD, color: NAVY, fontSize: 15, ["--tw-ring-color" as string]: GOLD }}>
                Start survey
              </button>
            </div>
          )}

          {isQ && (
            <>
              <div className="mb-5">
                <span className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: GOLD_INK }}>Question {qIndex + 1} of 2</span>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((qIndex + 1) / 2) * 100}%`, background: GOLD }} />
                </div>
              </div>
              <p className="font-bold mb-4" style={{ fontSize: 16, color: INK, lineHeight: 1.35 }}>{QUESTIONS[qIndex].q}</p>
              <div className="space-y-2.5 mt-auto">
                {QUESTIONS[qIndex].options.map((opt, oi) => {
                  const sel = picked === oi;
                  return (
                    <button key={opt} onClick={() => choose(qIndex, oi)} className="w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors duration-150" style={{ border: `1.5px solid ${sel ? GOLD : BORDER}`, background: sel ? WASH : "#fff" }}>
                      <span className="h-4 w-4 rounded-full shrink-0" style={{ border: `1.5px solid ${sel ? GOLD_INK : "#C7CCD4"}`, background: sel ? GOLD : "transparent" }} />
                      <span style={{ fontSize: 14, color: INK }}>{opt}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {screen === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full mb-4" style={{ background: WASH }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <p className="font-bold mb-1.5" style={{ fontSize: 18, color: INK }}>Thank you</p>
              <p className="mb-6" style={{ fontSize: 13, color: GREY, maxWidth: 240 }}>Your response helps publishers better understand their supporters.</p>
              <button onClick={reset} className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD_INK }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GOLD_INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12a8 8 0 018-8 8 8 0 016.9 4M20 4v4h-4" /></svg>
                Replay demo
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "#9CA3AF" }}>Interactive demo · click through the survey experience</p>
    </div>
  );
}

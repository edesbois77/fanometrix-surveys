"use client";

// New Engagement — the commissioning landing (Slices 1–2).
// Slice 1: the opening — Fanometrix speaks first, one open space (type / paste /
// drop a brief), no fields.
// Slice 2: on "Begin", Fanometrix reads the material and comes back with its FIRST
// READ — the reframe (a point of view, not a summary). Where its confidence is low
// it asks sharp clarifying questions; answering them sharpens the read. The
// supporting structure sits quietly behind "show my working". No Overview, no
// project yet — that's Slices 3–4.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import type { Reframe } from "@/lib/intelligence/analysts/analyseReframe";
import { UNDERSTANDING_FIELDS, type ProjectUnderstanding } from "@/lib/understanding";

const GOLD = "#D7B87A";
const GOLD_INK = "#B8935A";
const INK = "#0B1929";

const READING_LINES = ["Reading it…", "Sitting with the detail…", "Where's the real tension…", "Forming a view…"];

type Result = { reframe: Reframe; understanding: ProjectUnderstanding; source_text: string; source_label: string | null };

const fieldValue = (u: ProjectUnderstanding, key: string) => {
  const f = (u as unknown as Record<string, { value?: string; values?: string[]; provenance: string }>)[key];
  const isList = UNDERSTANDING_FIELDS.find(x => x.key === key)?.kind === "list";
  return { text: isList ? (f.values ?? []).join(" · ") : (f.value ?? ""), inferred: f.provenance === "inferred" };
};

export default function NewEngagementPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"ask" | "reading" | "reframe">("ask");
  const [result, setResult] = useState<Result | null>(null);
  const [clarify, setClarify] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [readingIdx, setReadingIdx] = useState(0);
  const [showWorking, setShowWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasSomething = text.trim().length > 0 || !!file;

  useEffect(() => {
    if (phase !== "reading") return;
    setReadingIdx(0);
    const t = setInterval(() => setReadingIdx(i => (i + 1) % READING_LINES.length), 1300);
    return () => clearInterval(t);
  }, [phase]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) setFile(f);
  }

  async function analyse(body: FormData | string) {
    setError(null); setPhase("reading");
    try {
      const res = await fetch("/api/commission", typeof body === "string"
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body }
        : { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Something went wrong. Try again."); setPhase(result ? "reframe" : "ask"); return; }
      setResult(json); setClarify(""); setShowWorking(false); setPhase("reframe");
    } catch { setError("Something went wrong. Try again."); setPhase(result ? "reframe" : "ask"); }
  }

  function begin() {
    if (!hasSomething) return;
    if (file) { const fd = new FormData(); fd.append("file", file); analyse(fd); }
    else analyse(JSON.stringify({ text: text.trim(), source_label: "Described challenge" }));
  }

  function sharpen() {
    if (!result || !clarify.trim()) return;
    analyse(JSON.stringify({ text: `${result.source_text}\n\nMore context I can add:\n${clarify.trim()}`, source_label: result.source_label ?? "Described challenge" }));
  }

  return (
    <AdminShell>
      <div className="min-h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-6 pt-5">
          <Link href="/research-projects" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Research Projects</Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-2xl">

            {phase === "ask" && (
              <>
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] mb-5" style={{ color: GOLD_INK }}>New engagement</p>
                <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: INK }}>Talk me through it.</h1>
                <p className="mt-4 text-lg leading-relaxed text-gray-500 max-w-xl">What are you working on? Tell me the situation in your own words — I&apos;ll take it from there.</p>

                <div className="mt-8 rounded-2xl border transition-colors"
                  style={{ borderColor: dragging ? GOLD : "#E5E7EB", background: dragging ? "#FCF8EF" : "#FFFFFF", boxShadow: "0 1px 2px rgba(11,25,41,0.04)" }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} autoFocus
                    placeholder="Paste the brief, forward the email, or just describe the challenge…"
                    className="w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-relaxed outline-none placeholder:text-gray-400" style={{ color: INK }} />
                  {file && (
                    <div className="px-5 -mt-1 pb-2">
                      <span className="inline-flex items-center gap-2 text-[13px] font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                        {file.name}<button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600" aria-label="Remove file">✕</button>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-t" style={{ borderColor: "#F1F3F5" }}>
                    <button onClick={() => fileRef.current?.click()} className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1.5"><span aria-hidden>↥</span> or drop a brief in</button>
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.pptx,.ppt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                    <button onClick={begin} disabled={!hasSomething} className="text-sm font-semibold px-5 py-2 rounded-lg transition-opacity disabled:opacity-40" style={{ background: GOLD, color: INK }}>Begin →</button>
                  </div>
                </div>
                {error && <p className="mt-4 text-[13px]" style={{ color: "#8A4B33" }}>{error}</p>}
                <p className="mt-4 text-[13px] text-gray-400">No forms. No fields. Fanometrix reads what you share and comes back with how it sees the problem.</p>
              </>
            )}

            {phase === "reading" && (
              <div className="text-center py-10">
                <div className="inline-flex items-center gap-2 mb-6" aria-hidden>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "300ms" }} />
                </div>
                <p className="text-xl font-medium transition-opacity" style={{ color: INK }}>{READING_LINES[readingIdx]}</p>
              </div>
            )}

            {phase === "reframe" && result && (
              <>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: GOLD_INK }}>{result.reframe.engagement_name}</p>

                {/* The reframe — the moment. */}
                <p className="text-[22px] md:text-[26px] font-medium tracking-[-0.01em] leading-[1.45]" style={{ color: INK }}>
                  {result.reframe.reframe}
                </p>

                {/* Clarifying questions — the senior move when confidence is short. */}
                {result.reframe.clarifying_questions.length > 0 && (
                  <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "#ECDCB8", background: "#FCF8EF" }}>
                    <p className="text-sm font-semibold" style={{ color: GOLD_INK }}>A couple of things would sharpen this for me:</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {result.reframe.clarifying_questions.map((q, i) => (
                        <li key={i} className="text-[15px] leading-relaxed flex gap-2" style={{ color: INK }}><span style={{ color: GOLD }}>·</span><span>{q}</span></li>
                      ))}
                    </ul>
                    <textarea value={clarify} onChange={(e) => setClarify(e.target.value)} rows={3}
                      placeholder="Fill me in — a line or two is plenty…"
                      className="w-full mt-4 resize-none rounded-lg border px-3 py-2 text-[15px] outline-none bg-white placeholder:text-gray-400"
                      style={{ borderColor: "#E5E7EB", color: INK }} />
                    <div className="flex justify-end mt-3">
                      <button onClick={sharpen} disabled={!clarify.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-40" style={{ background: GOLD, color: INK }}>Sharpen my read →</button>
                    </div>
                  </div>
                )}

                {/* The supporting structure — evidence behind the thinking, kept quiet. */}
                <div className="mt-8 border-t pt-5" style={{ borderColor: "#F1F3F5" }}>
                  <button onClick={() => setShowWorking(v => !v)} className="text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                    {showWorking ? "Hide my working" : "Show my working"} {showWorking ? "▲" : "▾"}
                  </button>
                  {showWorking && (
                    <dl className="mt-4 space-y-3">
                      {UNDERSTANDING_FIELDS.map(({ key, label }) => {
                        const v = fieldValue(result.understanding, key);
                        if (!v.text) return null;
                        return (
                          <div key={key} className="grid md:grid-cols-[170px_1fr] gap-1 md:gap-3">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400 pt-0.5">{label}</dt>
                            <dd className="text-sm text-gray-600 leading-relaxed">{v.text}{v.inferred && <span className="text-gray-300"> · inferred</span>}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>

                {error && <p className="mt-4 text-[13px]" style={{ color: "#8A4B33" }}>{error}</p>}
                <p className="mt-8 text-[13px] text-gray-400">(Slice 2 ends here. Reacting to this read — and beginning the engagement — is the next slice.)</p>
                <button onClick={() => { setPhase("ask"); setResult(null); }} className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors">← start over</button>
              </>
            )}

          </div>
        </div>
      </div>
    </AdminShell>
  );
}

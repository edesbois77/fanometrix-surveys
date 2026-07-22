"use client";

// New Engagement, the Commissioning Workspace (Slices 1-3, redesigned).
// Not a form and not a single blank box. The primary interaction stays
// conversational ("Tell me about this engagement"), but Fanometrix actively helps
// the user surface the fragments a real engagement begins with, an email, notes, a
// deadline, an aside the client mentioned, a brief or prior research, through
// OPTIONAL prompts, never mandatory fields. It reads everything together, and
// reasons from the COMMISSION (who, what decision, what outcome, the actual
// assignment) before forming a view. On agreement the Research Project is created
// silently and the page hands into the Overview with no reload.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import type { Reframe } from "@/lib/intelligence/analysts/analyseReframe";
import { UNDERSTANDING_FIELDS, type ProjectUnderstanding } from "@/lib/understanding";
import { stashCommissioned } from "@/lib/commissioning-handoff";
import type { ResearchProject } from "@/app/components/research-projects/ProjectProvider";

const GOLD = "#D7B87A";
const GOLD_INK = "#B8935A";
const INK = "#0B1929";

const READING_LINES = ["Reading everything you've given me…", "Working out who's really asking, and to decide what…", "Sitting with the detail…", "Where's the real assignment…", "Forming a view…"];

type FragKind = "email" | "notes" | "deadline" | "aside";
const PROMPTS: { kind: FragKind; chip: string; label: string; material: string; placeholder: string }[] = [
  { kind: "email", chip: "An email from the client", label: "Client email", material: "CLIENT EMAIL", placeholder: "Paste the email…" },
  { kind: "notes", chip: "Notes from a meeting", label: "Meeting notes", material: "MEETING NOTES", placeholder: "What was said…" },
  { kind: "deadline", chip: "A deadline", label: "Deadline", material: "DEADLINE", placeholder: "e.g. board budget review in 6 weeks" },
  { kind: "aside", chip: "Something they said off the brief", label: "Off the brief", material: "OFF-BRIEF, WHAT THE CLIENT TOLD ME", placeholder: "The thing that isn't written down anywhere…" },
];

type Result = { reframe: Reframe; understanding: ProjectUnderstanding; source_text: string; source_label: string | null };

const fieldValue = (u: ProjectUnderstanding, key: string) => {
  const f = (u as unknown as Record<string, { value?: string; values?: string[]; provenance: string }>)[key];
  const isList = UNDERSTANDING_FIELDS.find(x => x.key === key)?.kind === "list";
  return { text: isList ? (f.values ?? []).join(" · ") : (f.value ?? ""), inferred: f.provenance === "inferred" };
};

function seedFromCreated(created: Record<string, unknown>): ResearchProject {
  return {
    ...created,
    deployment_count: 0, total_responses: 0, completion_pct: null, last_response_at: null, owner_name: null,
    survey_intelligence_status: null, report_status: null, report_stale: false,
    key_findings_status: null, key_findings_count: null, conclusion_status: null,
    article_status: null, full_research_report_status: null,
    published_conclusion: null, activity: [], evidence: [], survey: null,
  } as unknown as ResearchProject;
}

export default function NewEngagementPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [frags, setFrags] = useState<Record<FragKind, string>>({ email: "", notes: "", deadline: "", aside: "" });
  const [openFrags, setOpenFrags] = useState<FragKind[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"ask" | "reading" | "reframe" | "creating">("ask");
  const [result, setResult] = useState<Result | null>(null);
  const [clarify, setClarify] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [readingIdx, setReadingIdx] = useState(0);
  const [showWorking, setShowWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasSomething = text.trim().length > 0 || files.length > 0 || PROMPTS.some(p => frags[p.kind].trim());

  useEffect(() => {
    if (phase !== "reading") return;
    setReadingIdx(0);
    const t = setInterval(() => setReadingIdx(i => (i + 1) % READING_LINES.length), 1400);
    return () => clearInterval(t);
  }, [phase]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  }
  function onDrop(e: React.DragEvent) { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }
  function openFrag(kind: FragKind) { setOpenFrags(prev => prev.includes(kind) ? prev : [...prev, kind]); }

  function assembleMaterial(): string {
    const parts = [text.trim()];
    for (const p of PROMPTS) { const v = frags[p.kind].trim(); if (v) parts.push(`${p.material}:\n${v}`); }
    return parts.filter(Boolean).join("\n\n");
  }

  async function analyse(payload: FormData | { material: string; correction?: string }) {
    setError(null); setCorrecting(false); setPhase("reading");
    try {
      const res = payload instanceof FormData
        ? await fetch("/api/commission", { method: "POST", body: payload })
        : await fetch("/api/commission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ material: payload.material, correction: payload.correction ?? null, source_label: "Described challenge" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Something went wrong. Try again."); setPhase(result ? "reframe" : "ask"); return; }
      setResult(json); setClarify(""); setCorrection(""); setShowWorking(false); setPhase("reframe");
    } catch { setError("Something went wrong. Try again."); setPhase(result ? "reframe" : "ask"); }
  }

  function begin() {
    if (!hasSomething) return;
    const material = assembleMaterial();
    if (files.length) { const fd = new FormData(); fd.append("material", material); files.forEach(f => fd.append("file", f)); analyse(fd); }
    else analyse({ material });
  }

  function reconsider(note: string) {
    if (!result || !note.trim()) return;
    analyse({ material: result.source_text, correction: note.trim() });
  }

  async function beginEngagement() {
    if (!result) return;
    setError(null); setPhase("creating");
    const u = result.understanding;
    const slug = (result.reframe.engagement_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)) || "engagement";
    const body = {
      research_mode: "real",
      project_id: `${slug}-${Date.now().toString(36).slice(-4)}`,
      project_name: result.reframe.engagement_name,
      research_question: u.research_question.value?.trim() || result.reframe.engagement_name,
      objective: u.business_challenge.value || null,
      study_type: "fan_understanding",
      topic: result.reframe.engagement_name,
      tags: [],
      research_subject: null,
      understanding: { ...u, reflection: result.reframe.reframe, confirmed: true, confirmed_at: new Date().toISOString() },
    };
    try {
      const res = await fetch("/api/research-projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.id) { setError(json.error ?? "Couldn't begin the engagement. Try again."); setPhase("reframe"); return; }
      stashCommissioned(seedFromCreated(json.data));
      router.push(`/research-projects/${json.data.id}/overview`);
    } catch { setError("Couldn't begin the engagement. Try again."); setPhase("reframe"); }
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
                <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: INK }}>Tell me about this engagement.</h1>
                <p className="mt-4 text-lg leading-relaxed text-gray-500 max-w-xl">Whatever you&apos;ve got, the brief, an email, the situation in your own words. The more you give me, the sharper I&apos;ll be.</p>

                <div className="mt-8 rounded-2xl border transition-colors"
                  style={{ borderColor: dragging ? GOLD : "#E5E7EB", background: dragging ? "#FCF8EF" : "#FFFFFF", boxShadow: "0 1px 2px rgba(11,25,41,0.04)" }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} autoFocus
                    placeholder="What&apos;s the situation? Who's the client, what are they wrestling with, what have they asked for…"
                    className="w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-relaxed outline-none placeholder:text-gray-400" style={{ color: INK }} />

                  {files.length > 0 && (
                    <div className="px-5 -mt-1 pb-2 flex flex-wrap gap-1.5">
                      {files.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-2 text-[13px] font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                          {f.name}<button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600" aria-label={`Remove ${f.name}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-t" style={{ borderColor: "#F1F3F5" }}>
                    <button onClick={() => fileRef.current?.click()} className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1.5"><span aria-hidden>↥</span> attach a brief or documents</button>
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.pptx,.ppt" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                    <button onClick={begin} disabled={!hasSomething} className="text-sm font-semibold px-5 py-2 rounded-lg transition-opacity disabled:opacity-40" style={{ background: GOLD, color: INK }}>Begin →</button>
                  </div>
                </div>

                {/* The consultant's prompts, optional, never required. */}
                <div className="mt-6">
                  <p className="text-[13px] text-gray-400 mb-2.5">A few things that would help me read this properly:</p>
                  <div className="flex flex-wrap gap-2">
                    {PROMPTS.filter(p => !openFrags.includes(p.kind)).map(p => (
                      <button key={p.kind} onClick={() => openFrag(p.kind)} className="text-[13px] px-3 py-1.5 rounded-full border transition-colors hover:bg-gray-50" style={{ borderColor: "#E5E7EB", color: "#4B5563" }}>+ {p.chip}</button>
                    ))}
                  </div>
                  {openFrags.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {PROMPTS.filter(p => openFrags.includes(p.kind)).map(p => (
                        <div key={p.kind}>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">{p.label}</label>
                          <textarea value={frags[p.kind]} onChange={(e) => setFrags(prev => ({ ...prev, [p.kind]: e.target.value }))} rows={p.kind === "deadline" ? 1 : 2} placeholder={p.placeholder}
                            className="w-full mt-1 resize-none rounded-lg border px-3 py-2 text-[14px] outline-none bg-white placeholder:text-gray-400" style={{ borderColor: "#E5E7EB", color: INK }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p className="mt-4 text-[13px]" style={{ color: "#8A4B33" }}>{error}</p>}
              </>
            )}

            {(phase === "reading" || phase === "creating") && (
              <div className="text-center py-10">
                <div className="inline-flex items-center gap-2 mb-6" aria-hidden>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "300ms" }} />
                </div>
                <p className="text-xl font-medium" style={{ color: INK }}>{phase === "creating" ? "Good, let's get to work." : READING_LINES[readingIdx]}</p>
              </div>
            )}

            {phase === "reframe" && result && (
              <>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] mb-4" style={{ color: GOLD_INK }}>{result.reframe.engagement_name}</p>
                <p className="text-[22px] md:text-[26px] font-medium tracking-[-0.01em] leading-[1.45]" style={{ color: INK }}>{result.reframe.reframe}</p>

                {result.reframe.clarifying_questions.length > 0 && (
                  <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "#ECDCB8", background: "#FCF8EF" }}>
                    <p className="text-sm font-semibold" style={{ color: GOLD_INK }}>A couple of things would sharpen this for me:</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {result.reframe.clarifying_questions.map((q, i) => (
                        <li key={i} className="text-[15px] leading-relaxed flex gap-2" style={{ color: INK }}><span style={{ color: GOLD }}>·</span><span>{q}</span></li>
                      ))}
                    </ul>
                    <textarea value={clarify} onChange={(e) => setClarify(e.target.value)} rows={3} placeholder="Fill me in, a line or two is plenty…"
                      className="w-full mt-4 resize-none rounded-lg border px-3 py-2 text-[15px] outline-none bg-white placeholder:text-gray-400" style={{ borderColor: "#E5E7EB", color: INK }} />
                    <div className="flex justify-end mt-3">
                      <button onClick={() => reconsider(clarify)} disabled={!clarify.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-40" style={{ background: GOLD, color: INK }}>Sharpen my read →</button>
                    </div>
                  </div>
                )}

                <div className="mt-8 border-t pt-5" style={{ borderColor: "#F1F3F5" }}>
                  <button onClick={() => setShowWorking(v => !v)} className="text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                    {showWorking ? "Hide the reasoning" : "Why I've come to this view"} {showWorking ? "▲" : "▾"}
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

                <div className="mt-8">
                  {!correcting ? (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button onClick={beginEngagement} className="text-sm font-semibold px-5 py-2.5 rounded-lg" style={{ background: GOLD, color: INK }}>Yes, that&apos;s it. Let&apos;s begin →</button>
                      <button onClick={() => setCorrecting(true)} className="text-sm font-medium px-4 py-2.5 rounded-lg border" style={{ borderColor: "#E5E7EB", color: INK }}>Almost, I&apos;d change something</button>
                      <button onClick={() => setCorrecting(true)} className="text-sm font-medium px-4 py-2.5 text-gray-400 hover:text-gray-600 transition-colors">No, you&apos;ve misunderstood</button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border p-5" style={{ borderColor: "#E5E7EB", background: "#FFFFFF" }}>
                      <p className="text-sm font-semibold" style={{ color: INK }}>Tell me where I&apos;ve got it wrong, I&apos;ll think again.</p>
                      <textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} autoFocus placeholder="What&apos;s off, or what am I missing…"
                        className="w-full mt-3 resize-none rounded-lg border px-3 py-2 text-[15px] outline-none placeholder:text-gray-400" style={{ borderColor: "#E5E7EB", color: INK }} />
                      <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => { setCorrecting(false); setCorrection(""); }} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2">Cancel</button>
                        <button onClick={() => reconsider(correction)} disabled={!correction.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-40" style={{ background: GOLD, color: INK }}>Rethink this →</button>
                      </div>
                    </div>
                  )}
                </div>

                {error && <p className="mt-4 text-[13px]" style={{ color: "#8A4B33" }}>{error}</p>}
                <button onClick={() => { setPhase("ask"); setResult(null); setCorrecting(false); }} className="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors">← start over</button>
              </>
            )}

          </div>
        </div>
      </div>
    </AdminShell>
  );
}

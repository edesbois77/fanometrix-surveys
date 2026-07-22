"use client";

// New Engagement — the commissioning landing (Slice 1).
// The front door to a Research Project. This is NOT a create form: it is the
// opening of a consultancy conversation. Fanometrix speaks first, with curiosity
// and judgement, and invites the user to talk — not to fill in fields. The user
// can type, paste an email/notes, or drop a brief into the same open space; the
// mechanics of input recede behind the invitation to tell the story.
//
// Slice 1 is the landing only. On "Begin" it plays the handoff beat ("Let me read
// this properly…") and stops — the reading + first reframe are the next slice.
import { useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";

const GOLD = "#D7B87A";
const GOLD_INK = "#B8935A";
const INK = "#0B1929";

export default function NewEngagementPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"ask" | "handoff">("ask");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasSomething = text.trim().length > 0 || !!file;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function begin() {
    if (!hasSomething) return;
    setPhase("handoff");
  }

  return (
    <AdminShell>
      <div className="min-h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-6 pt-5">
          <Link href="/research-projects" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Research Projects
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-24">
          <div className="w-full max-w-2xl">
            {phase === "ask" ? (
              <>
                {/* Fanometrix speaks first — a question, not a request for information. */}
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] mb-5" style={{ color: GOLD_INK }}>
                  New engagement
                </p>
                <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] leading-[1.05]" style={{ color: INK }}>
                  Talk me through it.
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-gray-500 max-w-xl">
                  What are you working on? Tell me the situation in your own words — I&apos;ll take it
                  from there.
                </p>

                {/* One open space. Type, paste an email, or drop a brief in — all the same box. */}
                <div
                  className="mt-8 rounded-2xl border transition-colors"
                  style={{
                    borderColor: dragging ? GOLD : "#E5E7EB",
                    background: dragging ? "#FCF8EF" : "#FFFFFF",
                    boxShadow: "0 1px 2px rgba(11,25,41,0.04)",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    autoFocus
                    placeholder="Paste the brief, forward the email, or just describe the challenge…"
                    className="w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-relaxed outline-none placeholder:text-gray-400"
                    style={{ color: INK }}
                  />

                  {file && (
                    <div className="px-5 -mt-1 pb-2">
                      <span className="inline-flex items-center gap-2 text-[13px] font-medium px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                        {file.name}
                        <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600" aria-label="Remove file">✕</button>
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-t" style={{ borderColor: "#F1F3F5" }}>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span aria-hidden>↥</span> or drop a brief in
                    </button>
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.pptx,.ppt" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />

                    <button
                      onClick={begin}
                      disabled={!hasSomething}
                      className="text-sm font-semibold px-5 py-2 rounded-lg transition-opacity disabled:opacity-40"
                      style={{ background: GOLD, color: INK }}
                    >
                      Begin →
                    </button>
                  </div>
                </div>

                <p className="mt-4 text-[13px] text-gray-400">
                  No forms. No fields. Fanometrix reads what you share and comes back with how it
                  sees the problem.
                </p>
              </>
            ) : (
              /* The handoff beat — the burden of explaining transfers to Fanometrix. */
              <div className="text-center">
                <div className="inline-flex items-center gap-2 mb-6" aria-hidden>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GOLD, animationDelay: "300ms" }} />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.02em]" style={{ color: INK }}>
                  Let me read this properly.
                </h2>
                <p className="mt-3 text-gray-500 max-w-md mx-auto leading-relaxed">
                  I&apos;ll come back with how I see the problem — not a summary, a point of view.
                </p>
                <p className="mt-8 text-[13px] text-gray-400">
                  (Slice 1 ends here. The reading and the first reframe are the next slice.)
                </p>
                <button
                  onClick={() => setPhase("ask")}
                  className="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

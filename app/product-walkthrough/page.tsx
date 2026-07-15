"use client";

// Product Walkthrough (renamed from "Showroom") — a guided, step-by-step
// demonstration of how Fanometrix works, built for teaching a prospective
// client the workflow rather than for managing real research. Deliberately
// built as a gallery ("the Product Walkthrough Library"), not an admin
// table: the primary user isn't managing hundreds of rows, they're finding
// the right story to walk a prospect through in the next five minutes.
// Featured cards, category/status filters, search, one prominent CTA —
// never a spreadsheet.
//
// Phase A note: this still reuses the exact same underlying
// research_projects/evidence_simulations API and instant-generation
// creation flow the old Showroom used — Phase A is the architectural
// split and rename only. Phase B replaces the creation flow with a
// Research-Brief-style form that starts a walkthrough empty; Phase C adds
// the guided live-build steps. Card links now point at
// /product-walkthrough/[id] (its own dedicated detail page), not
// /research-projects/[id] — Present Mode moved here with the rename too,
// see app/product-walkthrough/[id]/page.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { CreateProductWalkthroughDrawer } from "@/app/components/product-walkthrough/CreateProductWalkthroughDrawer";
import { formatRelativeTime } from "@/lib/format-relative-time";

const NAVY = "#0B1929", GOLD = "#D7B87A";

type WalkthroughProject = {
  id: string;
  project_name: string;
  // The Research Name field alone (e.g. "Coca-Cola Euro 2028 Research
  // Project") — project_name is the classification-suffixed "Final
  // Research Name" (topic | study type | brand | subject | agency), useful
  // in the DB/API but redundant clutter as a card title. Not to be
  // confused with simulation_info.topic below, which is the scenario's
  // category (e.g. "Sponsorship") used for the gallery's topic filter/icon.
  topic: string | null;
  research_question: string | null;
  // From the creation drawer's "Client / Prospect" and "Internal Note"
  // fields — sales/organisational metadata, surfaced here so a walkthrough
  // is findable by who it's for, not just its name.
  client_label: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  // Every attached Survey/Conversation Search with its live current count
  // — independent of simulation_info below, which only ever reflects the
  // old one-shot scenario-template flow. This is what makes a walkthrough
  // built the newer way (add a source, run it inside the workspace) show
  // real content on its card instead of nothing at all.
  research_sources: { type: "survey" | "social_search"; name: string; current: number; target: number | null }[];
  simulation_info: {
    status: string;
    presentedCount: number;
    topic: string | null;
    tonePreset: string | null;
    sources: string[];
    templateName: string | null;
    label: string | null;
    generatedAt: string | null;
    ownerName: string | null;
    responseCount: number | null;
    mentionCount: number | null;
    responseTarget: number | null;
    mentionTarget: number | null;
  } | null;
};

type StatusFilter = "all" | "not_started" | "generating" | "ready" | "presented" | "failed";
type SortOption = "recent" | "az";

// `!info` (no evidence_simulations row at all) means this walkthrough was
// created empty and nothing has been built inside it yet — genuinely
// different from "generating" (a row exists, mid-run). Conflating the two
// would show every brand-new walkthrough as permanently stuck generating,
// and would make the gallery's poll loop below wait forever for something
// that was never started.
function cardStatus(info: WalkthroughProject["simulation_info"]): { key: Exclude<StatusFilter, "all">; label: string; bg: string; text: string } {
  if (!info) return { key: "not_started", label: "Not Started", bg: "bg-gray-100", text: "text-gray-500" };
  if (info.status === "generating") return { key: "generating", label: "Generating", bg: "bg-amber-50", text: "text-amber-700" };
  if (info.status === "failed") return { key: "failed", label: "Failed", bg: "bg-red-50", text: "text-red-600" };
  if (info.presentedCount > 0) return { key: "presented", label: "Presented", bg: "bg-blue-50", text: "text-blue-700" };
  return { key: "ready", label: "Ready to Present", bg: "bg-green-50", text: "text-green-700" };
}

// Real progress, not an estimate — sums whichever targets this walkthrough's
// source_config actually requested against the live row counts already
// being polled every 4s, so the bar only moves when rows genuinely land
// in the database (see generate-conversation-mentions.ts's per-chunk
// insert, which is what makes this move smoothly instead of sitting at
// 0% for the whole run and jumping to 100%).
function generationProgress(info: WalkthroughProject["simulation_info"]): { pct: number; doneLabel: string } | null {
  if (!info) return null;
  let done = 0, target = 0;
  if (info.responseCount !== null && info.responseTarget) { done += info.responseCount; target += info.responseTarget; }
  if (info.mentionCount !== null && info.mentionTarget) { done += info.mentionCount; target += info.mentionTarget; }
  if (!target) return null;
  return { pct: Math.min(100, Math.round((done / target) * 100)), doneLabel: `${done.toLocaleString()} / ${target.toLocaleString()}` };
}

const SOURCE_ICON: Record<string, string> = { survey: "📋", conversation_search: "💬" };

// A small visual anchor per topic so cards read as a curated library
// rather than identical tiles — not real imagery (logged as a future
// enhancement), just enough variety to browse by eye. Falls back to the
// Product Walkthrough's own mark for any topic not in this list (new
// taxonomy entries never break, they just render generically).
const TOPIC_ICON: Record<string, string> = {
  "Transfers": "🔄", "Ticketing": "🎟️", "Matchday Experience": "🏟️", "Streaming": "📺",
  "Merchandise": "🛍️", "Sponsorship": "🤝", "Food & Drink": "🍔", "Travel": "✈️",
  "Players": "⚽", "Managers": "📋", "Ownership": "🏛️", "Women's Football": "🏆",
  "Community": "🤲", "Grassroots": "🌱", "Competitions": "🏅", "Facilities": "🏗️",
  "Accessibility": "♿", "Broadcasting": "📡", "Fan Rewards": "🎁",
};
function topicIcon(topic: string | null): string {
  return (topic && TOPIC_ICON[topic]) || "✦";
}

// The short Research Name — falls back to the full project_name for any
// project created before the `topic` column existed.
function displayName(p: WalkthroughProject): string {
  return p.topic?.trim() || p.project_name;
}

export default function ProductWalkthroughPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";
  const hasAccess = isAdmin || !!user?.canPresentSimulations;

  const [projects, setProjects] = useState<WalkthroughProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalkthroughProject | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    const res = await fetch("/api/research-projects?research_mode=simulated");
    const json = await res.json();
    setProjects(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // Nothing to load when access is denied — that render branch never
    // reads `loading`, so there's no setState needed on this path.
    // Deferred a tick so the fetch-then-setState chain isn't invoked
    // synchronously from the effect body itself.
    if (!hasAccess) return;
    const raf = requestAnimationFrame(load);
    return () => cancelAnimationFrame(raf);
  }, [hasAccess]);

  // Poll while anything is actively generating — an instant-generation
  // engine means this is normally a handful of seconds, never a
  // long-lived interval. Deliberately excludes "not started" (no
  // evidence_simulations row at all, i.e. an empty walkthrough) — nothing
  // is running for those, so polling would just wait forever.
  useEffect(() => {
    const anyGenerating = projects.some(p => p.simulation_info?.status === "generating");
    if (anyGenerating && !pollRef.current) {
      pollRef.current = setInterval(load, 4000);
    } else if (!anyGenerating && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [projects]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) if (p.simulation_info?.topic) set.add(p.simulation_info.topic);
    return Array.from(set).sort();
  }, [projects]);

  const displayed = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter !== "all" && cardStatus(p.simulation_info).key !== statusFilter) return false;
      if (categoryFilter !== "all" && p.simulation_info?.topic !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [p.project_name, p.client_label, p.simulation_info?.label, p.simulation_info?.topic, p.simulation_info?.templateName]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => sortBy === "az"
      ? displayName(a).localeCompare(displayName(b))
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [projects, search, categoryFilter, statusFilter, sortBy]);

  function handleCreated(id: string) {
    setAddOpen(false);
    // Straight into the empty workspace — the whole point of the new
    // creation flow is that the Library only ever creates the container,
    // never stays behind showing it "generating" (there's nothing to
    // generate yet).
    router.push(`/product-walkthrough/${id}`);
  }

  function handleOpen(p: WalkthroughProject) {
    router.push(`/product-walkthrough/${p.id}`);
  }

  async function handleDuplicate(p: WalkthroughProject) {
    setBusyId(p.id);
    const res = await fetch(`/api/research-projects/${p.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const json = await res.json();
    setBusyId(null);
    if (!res.ok) { showToast(json.error ?? "Failed to duplicate.", false); return; }
    showToast("Duplicated.");
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmText.trim() !== displayName(deleteTarget).trim()) return;
    setBusyId(deleteTarget.id);
    const res = await fetch(`/api/research-projects/${deleteTarget.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusyId(null);
    setDeleteTarget(null);
    setDeleteConfirmText("");
    if (!res.ok) { showToast(json.error ?? "Failed to delete.", false); return; }
    showToast("Deleted.");
    load();
  }

  if (sessionLoading) {
    return (
      <AdminShell>
        <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
      </AdminShell>
    );
  }

  if (!hasAccess) {
    return (
      <AdminShell>
        <div className="p-4 md:p-6 max-w-2xl mx-auto text-center py-20">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5" style={{ background: "#FEF2F2" }}>✕</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: NAVY }}>You don&apos;t have access to Product Walkthrough</h1>
          <p className="text-sm text-gray-500">Ask an administrator to grant you access if you need to walk prospects through demos.</p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Walkthrough Library</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {projects.length} walkthrough{projects.length !== 1 ? "s" : ""} ready to present · clearly labelled synthetic evidence, never real client data
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="text-sm font-semibold px-4 py-2.5 rounded-lg flex-shrink-0"
            style={{ background: GOLD, color: NAVY }}
          >
            + New Product Walkthrough
          </button>
        </div>

        <details className="group bg-gray-50 w-full mb-5">
          <summary className="cursor-pointer select-none list-none py-3">
            <p className="text-sm text-gray-500 leading-relaxed">
              A walkthrough here is the real Fanometrix product, backed by clearly labelled synthetic evidence.{" "}
              <span className="font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>
                Expand to find out more
                <span className="inline-block transition-transform group-open:rotate-90">›</span>
              </span>
            </p>
          </summary>
          <div className="pb-4 pt-1 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-3">
            <p><strong className="text-gray-700">Creating a walkthrough</strong>, pick a curated Template for instant generation, or Build Custom to choose your own sources, topic and tone. Either way, a real (synthetic) survey and/or conversation search is generated in seconds.</p>
            <p><strong className="text-gray-700">Start Walkthrough</strong> opens the same Fanometrix screens real research uses, never a special &quot;demo mode&quot; UI, with a permanent banner marking it as simulated throughout. Browse it normally; there&apos;s no separate guided or presentation mode.</p>
            <p><strong className="text-gray-700">Duplicate, Delete</strong>, Duplicate creates a new, empty walkthrough with the same name, research question, client and note, ready to build inside its own workspace; Delete removes it permanently. Click a card itself, outside the buttons, to open it too.</p>
          </div>
        </details>

        <div className="mb-6 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search Product Walkthrough…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="generating">Generating</option>
              <option value="ready">Ready to Present</option>
              <option value="presented">Presented</option>
              <option value="failed">Failed</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="recent">Most recent</option>
              <option value="az">A–Z</option>
            </select>
          </div>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">✦</p>
            {projects.length === 0 ? (
              <>
                <p className="font-medium">Nothing in the Product Walkthrough Library yet</p>
                <p className="text-sm mt-1">Create your first walkthrough to get a ready-to-present story in seconds.</p>
              </>
            ) : (
              <p className="font-medium">No walkthroughs match your filters</p>
            )}
          </div>
        )}

        {!loading && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(p => {
              const status = cardStatus(p.simulation_info);
              const isBusy = busyId === p.id;
              return (
                <div key={p.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  {/* Card body (not the action row) opens the same
                      workspace page as "▶ Start Walkthrough" below, either
                      is just a normal navigation, no separate presentation
                      mode. */}
                  <button
                    onClick={() => router.push(`/product-walkthrough/${p.id}`)}
                    className="text-left w-full"
                  >
                    <div className="p-4 pb-3 transition-opacity hover:opacity-95" style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #060D16 100%)` }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className="text-base leading-none flex-shrink-0 mt-0.5">{topicIcon(p.simulation_info?.topic ?? null)}</span>
                          <div className="min-w-0">
                            <h3 className="text-white font-bold text-sm leading-snug line-clamp-2">{displayName(p)}</h3>
                            {p.simulation_info?.label && <p className="text-white/50 text-xs mt-0.5">{p.simulation_info.label}</p>}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}` }}>
                          Simulated
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="p-4 flex-1 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.client_label && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">For {p.client_label}</span>
                      )}
                      {p.simulation_info?.topic && (
                        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{p.simulation_info.topic}</span>
                      )}
                      {p.simulation_info?.templateName && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: GOLD, background: "rgba(11,25,41,0.06)" }}>
                          Template: {p.simulation_info.templateName}
                        </span>
                      )}
                      {(p.simulation_info?.sources ?? []).map(s => (
                        <span key={s} title={s === "survey" ? "Survey Responses" : "Conversation Mentions"} className="text-xs">{SOURCE_ICON[s]}</span>
                      ))}
                    </div>

                    {p.research_question && (
                      <p className="text-[11px] text-gray-600 leading-snug line-clamp-2">
                        <span className="text-gray-400 font-semibold">Research Question: </span>{p.research_question}
                      </p>
                    )}

                    {status.key === "failed" ? (
                      <p className="text-[11px] text-red-500">Something went wrong generating this walkthrough.</p>
                    ) : status.key === "generating" ? (
                      (() => {
                        const progress = generationProgress(p.simulation_info);
                        return progress ? (
                          <div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${progress.pct}%`, background: GOLD }}
                              />
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {progress.doneLabel} generated · {progress.pct}%
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400">Starting…</p>
                        );
                      })()
                    ) : p.research_sources.length > 0 ? (
                      <div className="space-y-0.5">
                        {p.research_sources.map((src, i) => (
                          <p key={i} className="text-[11px] text-gray-500 truncate">
                            <span>{src.type === "survey" ? "📋" : "💬"}</span>{" "}
                            <span className="text-gray-700 font-medium">{src.name}</span>{" "}
                            <span className="text-gray-400">
                             , {src.current.toLocaleString()}{src.target ? ` / ${src.target.toLocaleString()}` : ""} {src.type === "survey" ? "response" : "mention"}{src.current === 1 ? "" : "s"}
                            </span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-400">No Research Sources added yet.</p>
                    )}

                    {p.internal_notes && (
                      <p className="text-[11px] text-gray-400 italic leading-snug line-clamp-2">📝 {p.internal_notes}</p>
                    )}

                    <p className="text-[11px] text-gray-400">
                      Created by {p.simulation_info?.ownerName ?? p.created_by ?? "—"} · {formatRelativeTime(p.created_at)}
                    </p>

                    <div className="mt-auto pt-2 flex flex-col gap-1.5">
                      <button
                        onClick={() => handleOpen(p)}
                        disabled={isBusy}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40"
                        style={{ background: NAVY, color: GOLD }}
                      >
                        ▶ Start Walkthrough
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDuplicate(p)}
                          disabled={isBusy}
                          className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          ⧉ Duplicate
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(p); setDeleteConfirmText(""); }}
                          disabled={isBusy}
                          className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addOpen && <CreateProductWalkthroughDrawer onClose={() => setAddOpen(false)} onCreated={handleCreated} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete this Product Walkthrough?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This permanently deletes <strong>{displayName(deleteTarget)}</strong> and everything generated for it. This can&apos;t be undone. Type the name to confirm.
            </p>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type the walkthrough name to confirm"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-red-400"
            />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmText.trim() !== displayName(deleteTarget).trim()}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-red-600 text-white disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

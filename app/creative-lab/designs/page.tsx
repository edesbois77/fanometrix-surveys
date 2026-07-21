"use client";

// Creative Gallery — browsing only. A visual, Theme → Sub-theme card gallery
// over the same creative_designs data the Studio editor (./[id]/page.tsx)
// and Research Project/Campaign pickers all share. Editing colours/gradients
// happens on the dedicated Studio page — this page is deliberately just
// browse + Edit/Duplicate/Archive/Delete, no configuration UI.

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { DESIGN_CATEGORIES, type DesignCategory } from "@/lib/creative-designs";
import { buildEmbedThemeFromState, type BuilderState } from "@/lib/creative-theme-builder";

type Design = {
  id: string;
  slug: string;
  name: string;
  theme: DesignCategory;
  sub_theme: string | null;
  publisher_org_id: string | null;
  publisher_name: string | null;
  layout: "timer" | "classic" | "invitation";
  status: "active" | "archived";
  is_system: boolean;
  usage_count: number;
  updated_at: string;
  builder_state: BuilderState;
};

const GOLD = "#D7B87A";
const NAVY = "#0B1929";
const GOLD_TINT = "#FBF5E8";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Poster-style format icons ────────────────────────────────────────────────
// Small inline SVGs — no external assets, colour is passed in so they read
// clearly against any design's background.

function StopwatchIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="26" y="3" width="12" height="6" rx="2" fill={color} />
      <circle cx="32" cy="36" r="23" stroke={color} strokeWidth="3" fill="none" />
      <line x1="32" y1="15" x2="32" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="53" y1="36" x2="49" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="11" y1="36" x2="15" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="32" y1="36" x2="32" y2="23" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32" y1="36" x2="41" y2="36" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="36" r="2.5" fill={color} />
    </svg>
  );
}

function EnvelopeIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="8" y="14" width="48" height="36" rx="4" stroke={color} strokeWidth="3" fill="none" />
      <path d="M10 18 L32 36 L54 18" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ListIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      {[13, 30, 47].map((y, i) => (
        <g key={y}>
          <circle cx="10" cy={y} r="5" stroke={color} strokeWidth="2.5" fill={i === 0 ? color : "none"} />
          <rect x="24" y={y - 3} width="30" height="6" rx="3" fill={color} opacity={i === 0 ? 1 : 0.5} />
        </g>
      ))}
    </svg>
  );
}

// ── Poster-style, non-interactive thumbnails ─────────────────────────────────
// Deliberately not a live ThemedSurvey instance — rendering dozens of
// interactive timer components (each with its own interval) on one page
// would be slow, and generic placeholder question/answer text on every card
// doesn't communicate anything either. Instead each layout gets a poster
// template (colour-graded with the design's own palette) that signals the
// creative's *format* at a glance, closer to a template-library thumbnail
// than a literal screenshot. One live preview lives on the Studio page.
function DesignSwatch({ d }: { d: Design }) {
  const badgeStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
    padding: "12px 18px", borderRadius: 10,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
  };

  if (d.layout === "classic") {
    return (
      <div style={{ width: "100%", aspectRatio: "300 / 250", borderRadius: 8, overflow: "hidden", position: "relative", background: "#071B2F" }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 90, height: 90, borderRadius: "50%", background: "radial-gradient(circle, rgba(215,184,122,0.18), transparent 70%)",
        }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={badgeStyle}>
            <ListIcon color={GOLD} size={34} />
            <span style={{ ...labelStyle, color: GOLD }}>Classic List</span>
          </div>
        </div>
      </div>
    );
  }

  let theme;
  try { theme = buildEmbedThemeFromState(d.builder_state); } catch { theme = null; }
  if (!theme) {
    return <div style={{ width: "100%", aspectRatio: "300 / 250", borderRadius: 8, background: NAVY }} />;
  }

  return (
    <div style={{ width: "100%", aspectRatio: "300 / 250", borderRadius: 8, overflow: "hidden", position: "relative", background: theme.canvas }}>
      {/* Full-bleed colour wash, fading into the design's canvas — poster key art, not a literal MPU screenshot */}
      <div style={{ position: "absolute", inset: 0, background: theme.gradient }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 0%, ${theme.canvas} 88%)` }} />
      {/* Faint quadrant motif — hints at the real 2x2 layout without literal answer buttons */}
      <div style={{
        position: "absolute", inset: 0, display: "grid",
        gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, padding: 12, opacity: 0.1,
      }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={{ background: "#fff", borderRadius: 6 }} />)}
      </div>
      {/* Format badge — dark scrim behind it so it reads over any gradient.
          The invitation layout is the same timer creative fronted by an intro
          screen, so it shares this poster art but reads its own format label. */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...badgeStyle, background: "rgba(0,0,0,0.3)" }}>
          {d.layout === "invitation"
            ? <EnvelopeIcon color="#fff" size={34} />
            : <StopwatchIcon color="#fff" size={34} />}
          <span style={{ ...labelStyle, color: "#fff" }}>
            {d.layout === "invitation" ? "Fan Invitation" : "Countdown Timer"}
          </span>
        </div>
      </div>
    </div>
  );
}

function OverflowMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]">
          <button
            onClick={onDelete}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function CreativeDesignsGalleryPage() {
  const router = useRouter();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [themeFilter, setThemeFilter] = useState<DesignCategory | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/creative-designs?status=all")
      .then(r => r.ok ? r.json() : null)
      .then(json => setDesigns(json?.data ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => designs.filter(d => showArchived || d.status === "active"),
    [designs, showArchived]
  );
  const filtered = useMemo(
    () => themeFilter === "all" ? visible : visible.filter(d => d.theme === themeFilter),
    [visible, themeFilter]
  );

  const grouped = useMemo(() => {
    const byTheme = new Map<DesignCategory, Map<string, Design[]>>();
    for (const d of filtered) {
      const label = d.theme === "publisher" ? (d.publisher_name ?? "Unknown publisher") : (d.sub_theme ?? "General");
      if (!byTheme.has(d.theme)) byTheme.set(d.theme, new Map());
      const subMap = byTheme.get(d.theme)!;
      if (!subMap.has(label)) subMap.set(label, []);
      subMap.get(label)!.push(d);
    }
    return byTheme;
  }, [filtered]);

  const archivedCount = designs.filter(d => d.status === "archived").length;

  async function duplicate(d: Design) {
    setBusyId(d.id);
    const res = await fetch("/api/creative-designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${d.name} (copy)`,
        theme: d.theme,
        sub_theme: d.theme === "publisher" ? null : d.sub_theme,
        publisher_org_id: d.theme === "publisher" ? d.publisher_org_id : null,
        // Carry the creative format over — else a Fan Invitation copy would
        // silently drop to the DB default ("timer") and lose its intro screen.
        layout: d.layout,
        builder_state: d.builder_state,
      }),
    });
    const json = await res.json();
    setBusyId(null);
    if (res.ok) router.push(`/creative-lab/designs/${json.data.id}`);
  }

  async function toggleArchive(d: Design) {
    setBusyId(d.id);
    await fetch(`/api/creative-designs/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: d.status === "archived" ? "active" : "archived" }),
    });
    setBusyId(null);
    load();
  }

  async function del(d: Design) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    setBusyId(d.id);
    const res = await fetch(`/api/creative-designs/${d.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 409 && confirm(`${json.error} Delete anyway?`)) {
        await fetch(`/api/creative-designs/${d.id}?force=true`, { method: "DELETE" });
      }
    }
    setBusyId(null);
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Creative Designs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Every survey creative, built-in and custom, organised by Theme and Sub-theme.
            </p>
          </div>
        </div>

        {/* Theme filter chips */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            {(["all", ...DESIGN_CATEGORIES.map(c => c.id)] as (DesignCategory | "all")[]).map(id => {
              const label = id === "all" ? "All" : DESIGN_CATEGORIES.find(c => c.id === id)!.label;
              const active = themeFilter === id;
              return (
                <button
                  key={id}
                  onClick={() => setThemeFilter(id)}
                  className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={active
                    ? { background: GOLD, color: NAVY }
                    : { background: "#F3F4F6", color: "#4B5563" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowArchived(s => !s)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            {showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No designs in this view.</p>
        ) : (
          <div className="space-y-8">
            {DESIGN_CATEGORIES.map(cat => {
              const subMap = grouped.get(cat.id);
              if (!subMap || subMap.size === 0) return null;
              return (
                <div key={cat.id}>
                  <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: NAVY }}>
                    {cat.label}
                  </h2>
                  <div className="space-y-6">
                    {Array.from(subMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => (
                      <div key={label}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                          {label} <span className="text-gray-300 font-normal">({list.length})</span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {list.map(d => (
                            <div
                              key={d.id}
                              className="bg-white border border-gray-100 rounded-xl shadow-sm p-3 flex flex-col gap-2.5"
                              style={d.status === "archived" ? { opacity: 0.55 } : undefined}
                            >
                              <Link href={`/creative-lab/designs/${d.id}`} className="block transition-opacity hover:opacity-90">
                                <DesignSwatch d={d} />
                              </Link>
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    Used by {d.usage_count} {d.usage_count === 1 ? "campaign" : "campaigns"}
                                  </p>
                                  <p className="text-[11px] text-gray-400">Updated {formatDate(d.updated_at)}</p>
                                </div>
                                {d.status === "archived" && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <Link
                                  href={`/creative-lab/designs/${d.id}`}
                                  className="flex-1 text-center text-xs font-semibold rounded-lg py-1.5"
                                  style={{ background: GOLD_TINT, color: NAVY }}
                                >
                                  Edit
                                </Link>
                                <button
                                  disabled={busyId === d.id}
                                  onClick={() => duplicate(d)}
                                  className="flex-1 text-xs font-medium rounded-lg py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Duplicate
                                </button>
                                <button
                                  disabled={busyId === d.id}
                                  onClick={() => toggleArchive(d)}
                                  className="flex-shrink-0 text-xs font-medium rounded-lg py-1.5 px-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {d.status === "archived" ? "Unarchive" : "Archive"}
                                </button>
                                <OverflowMenu onDelete={() => del(d)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

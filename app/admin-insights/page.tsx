"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import type { Insight, InsightContentType, InsightStatus, InsightVisibility } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { value: InsightContentType; label: string }[] = [
  { value: "report",             label: "Report"             },
  { value: "market_analysis",    label: "Market Analysis"    },
  { value: "survey_results",     label: "Survey Results"     },
  { value: "social_intelligence",label: "Social Intelligence"},
  { value: "cheat_sheet",        label: "Cheat Sheet"        },
  { value: "dashboard",          label: "Dashboard"          },
  { value: "download",           label: "Download"           },
];

const STATUSES: { value: InsightStatus; label: string }[] = [
  { value: "draft",     label: "Draft"     },
  { value: "published", label: "Published" },
  { value: "archived",  label: "Archived"  },
];

const VISIBILITIES: { value: InsightVisibility; label: string; desc: string }[] = [
  { value: "public",     label: "Public",     desc: "All logged-in users"  },
  { value: "admin_only", label: "Admin only", desc: "Admins only"          },
  { value: "restricted", label: "Restricted", desc: "Audience tags apply"  },
];

const TYPE_LABELS: Record<InsightContentType, string> = {
  report:              "Report",
  market_analysis:     "Market Analysis",
  survey_results:      "Survey Results",
  social_intelligence: "Social Intelligence",
  cheat_sheet:         "Cheat Sheet",
  dashboard:           "Dashboard",
  download:            "Download",
};

const STATUS_COLOURS: Record<InsightStatus, string> = {
  draft:     "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  archived:  "bg-gray-100  text-gray-500",
};

const VIS_COLOURS: Record<InsightVisibility, string> = {
  public:     "bg-blue-100  text-blue-800",
  admin_only: "bg-[#0B1929] text-white",
  restricted: "bg-purple-100 text-purple-800",
};

// Suggested audience tags for the multi-select (admin can also type free text)
const SUGGESTED_TAGS = [
  // Visibility helpers (shown as presets — visibility is actually set separately)
  // Organisation types
  "Agencies", "Brands", "Publishers",
  // Example agencies
  "Dentsu", "WPP", "Publicis", "IPG", "Omnicom", "Havas",
  // Example brands
  "Carlsberg", "Heineken", "Adidas", "Nike", "Mastercard", "Visa",
  // Example publishers
  "Football365", "FotMob", "Flashscore", "LiveScore", "OneFootball", "SofaScore", "WhoScored",
  // Example projects
  "UEFA EURO 2028", "FIFA World Cup 2026", "Premier League 2024/25",
  // Markets
  "UK", "Germany", "Sweden", "India", "China", "USA", "France", "Spain", "Italy",
  "Brazil", "Argentina", "Japan", "South Korea", "Netherlands", "Belgium",
  "Portugal", "Denmark", "Norway", "Finland", "Poland",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Tag multi-select component ───────────────────────────────────────────────

function TagSelect({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);

  const suggestions = SUGGESTED_TAGS.filter(
    t => !tags.includes(t) && t.toLowerCase().includes(search.toLowerCase())
  );

  function add(tag: string) {
    const t = tag.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setSearch("");
  }

  function remove(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (search.trim()) add(search);
      else if (suggestions.length > 0) add(suggestions[0]);
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
    if (e.key === "Backspace" && !search && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-full">
              {t}
              <button type="button" onClick={() => remove(t)} className="text-purple-400 hover:text-purple-700 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Search or type to add tags…" : "Add another tag…"}
          className={INPUT}
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {search.trim() && !SUGGESTED_TAGS.some(t => t.toLowerCase() === search.toLowerCase()) && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); add(search); }}
                className="w-full text-left px-3 py-2 text-sm text-[#0B1929] font-medium hover:bg-gray-50 border-b border-gray-100"
              >
                + Add &ldquo;{search}&rdquo;
              </button>
            )}
            {suggestions.length > 0 ? (
              suggestions.map(t => (
                <button
                  key={t} type="button"
                  onMouseDown={e => { e.preventDefault(); add(t); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t}
                </button>
              ))
            ) : (
              !search.trim() && <p className="px-3 py-2.5 text-xs text-gray-400">Type to search or add a custom tag</p>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Tags control who can see this insight when visibility is Restricted.
        Use organisation, agency, brand, publisher, project or market names.
      </p>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = {
  title:              string;
  subtitle:           string;
  slug:               string;
  content_type:       InsightContentType;
  status:             InsightStatus;
  published_at:       string;
  summary:            string;
  content_blocks_raw: string;
  download_url:       string;
  featured_image_url: string;
  tags:               string[];
  visibility:         InsightVisibility;
};

const EMPTY_FORM: FormState = {
  title:              "",
  subtitle:           "",
  slug:               "",
  content_type:       "report",
  status:             "draft",
  published_at:       "",
  summary:            "",
  content_blocks_raw: "",
  download_url:       "",
  featured_image_url: "",
  tags:               [],
  visibility:         "restricted",
};

function insightToForm(i: Insight): FormState {
  return {
    title:              i.title,
    subtitle:           i.subtitle ?? "",
    slug:               i.slug,
    content_type:       i.content_type,
    status:             i.status,
    published_at:       i.published_at ? i.published_at.slice(0, 10) : "",
    summary:            i.summary ?? "",
    content_blocks_raw: (i.content_blocks ?? [])
      .map(b => {
        if (b.type === "heading")    return `# ${b.content}`;
        if (b.type === "subheading") return `## ${b.content}`;
        if (b.type === "quote")      return `> ${b.content}`;
        if (b.type === "divider")    return "---";
        if (b.type === "image")      return `![${b.alt ?? ""}](${b.url ?? ""})`;
        return b.content ?? "";
      })
      .join("\n\n"),
    download_url:       i.download_url ?? "",
    featured_image_url: i.featured_image_url ?? "",
    tags:               i.tags ?? [],
    visibility:         i.visibility,
  };
}

function parseContentBlocks(raw: string) {
  return raw.split(/\n\n+/).filter(Boolean).map(line => {
    if (line.startsWith("# "))   return { type: "heading"    as const, content: line.slice(2).trim() };
    if (line.startsWith("## "))  return { type: "subheading" as const, content: line.slice(3).trim() };
    if (line.startsWith("> "))   return { type: "quote"      as const, content: line.slice(2).trim() };
    if (line.trim() === "---")   return { type: "divider"    as const };
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
    if (imgMatch) return { type: "image" as const, alt: imgMatch[1], url: imgMatch[2] };
    return { type: "paragraph" as const, content: line.trim() };
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminInsightsPage() {
  const [insights,    setInsights]    = useState<Insight[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editInsight, setEditInsight] = useState<Insight | null>(null);
  const [form,        setForm]        = useState<FormState>({ ...EMPTY_FORM });
  const [formError,   setFormError]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [slugManual,  setSlugManual]  = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<Insight | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVis,    setFilterVis]    = useState<string>("all");

  const loadInsights = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/insights");
    if (res.ok) setInsights((await res.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function openCreate() {
    setEditInsight(null);
    setForm({ ...EMPTY_FORM });
    setSlugManual(false);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(i: Insight) {
    setEditInsight(i);
    setForm(insightToForm(i));
    setSlugManual(true);
    setFormError("");
    setShowModal(true);
  }

  function handleTitleChange(title: string) {
    setForm(f => ({
      ...f,
      title,
      slug: slugManual ? f.slug : slugify(title),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.slug.trim())  { setFormError("Slug is required."); return; }
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      setFormError("Slug may only contain lowercase letters, numbers and hyphens.");
      return;
    }

    let blocksJson;
    try {
      blocksJson = parseContentBlocks(form.content_blocks_raw);
    } catch {
      setFormError("Content blocks could not be parsed.");
      return;
    }

    setSaving(true);

    const payload = {
      title:              form.title.trim(),
      subtitle:           form.subtitle.trim() || null,
      slug:               form.slug.trim(),
      content_type:       form.content_type,
      status:             form.status,
      published_at:       form.published_at ? new Date(form.published_at).toISOString() : null,
      summary:            form.summary.trim() || null,
      content_blocks:     blocksJson,
      download_url:       form.download_url.trim() || null,
      featured_image_url: form.featured_image_url.trim() || null,
      tags:               form.tags,
      visibility:         form.visibility,
    };

    const url    = editInsight ? `/api/insights/${editInsight.slug}` : "/api/insights";
    const method = editInsight ? "PUT" : "POST";

    const res  = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFormError(json.error ?? "Failed to save. Please try again.");
      return;
    }

    showToast(editInsight ? "Insight updated." : "Insight created.");
    setShowModal(false);
    loadInsights();
  }

  async function handleDelete(i: Insight) {
    const res = await fetch(`/api/insights/${i.slug}`, { method: "DELETE" });
    const json = await res.json();
    setConfirmDel(null);
    if (!res.ok) { showToast(json.error ?? "Failed to delete.", false); return; }
    showToast("Insight deleted.");
    loadInsights();
  }

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = insights.filter(i => {
    if (filterType   !== "all" && i.content_type !== filterType)   return false;
    if (filterStatus !== "all" && i.status       !== filterStatus) return false;
    if (filterVis    !== "all" && i.visibility   !== filterVis)    return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.title.toLowerCase().includes(q) ||
        (i.subtitle ?? "").toLowerCase().includes(q) ||
        (i.summary  ?? "").toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── CSV export ────────────────────────────────────────────────────────────────
  function exportCsv() {
    const cols = ["title","subtitle","slug","content_type","status","visibility","published_at","tags","created_at"];
    const rows = filtered.map(i => cols.map(c => {
      const v = i[c as keyof Insight];
      const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    }).join(","));
    const csv  = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "insights.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
            <p className="text-sm text-gray-400 mt-0.5">Admin-managed knowledge library with audience access control.</p>
          </div>
          <button onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            + New Insight
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="search"
            placeholder="Search title, tags, summary…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] bg-white min-w-[220px]"
          />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All types</option>
            {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterVis} onChange={e => setFilterVis(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All visibility</option>
            {VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          {filtered.length > 0 && (
            <button onClick={exportCsv}
              className="ml-auto px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              ↓ CSV
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {insights.length === 0 ? "No insights yet. Create the first one above." : "No insights match the current filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Title</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Visibility</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Published</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[240px]">{i.title}</p>
                      {i.subtitle && <p className="text-xs text-gray-400 truncate max-w-[240px]">{i.subtitle}</p>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{TYPE_LABELS[i.content_type]}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOURS[i.status]}`}>
                        {i.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${VIS_COLOURS[i.visibility]}`}>
                        {i.visibility === "admin_only" ? "Admin only" : i.visibility === "restricted" ? "Restricted" : "Public"}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {i.tags.slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-full">{t}</span>
                        ))}
                        {i.tags.length > 3 && (
                          <span className="text-[10px] text-gray-400">+{i.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {i.published_at
                        ? new Date(i.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <a href={`/insights/${i.slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          Preview ↗
                        </a>
                        <button onClick={() => openEdit(i)}
                          className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setConfirmDel(i)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">{filtered.length} insight{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-2xl w-full mx-4 max-h-[94vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editInsight ? `Edit: ${editInsight.title}` : "New Insight"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="Title *">
                    <input type="text" value={form.title} required
                      onChange={e => handleTitleChange(e.target.value)}
                      placeholder="e.g. Football as an Access Engine"
                      className={INPUT} />
                  </Field>
                </div>

                <div className="col-span-2">
                  <Field label="Subtitle">
                    <input type="text" value={form.subtitle}
                      onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                      placeholder="One-line description shown under the title"
                      className={INPUT} />
                  </Field>
                </div>

                <div className="col-span-2">
                  <Field label="Slug *">
                    <input type="text" value={form.slug} required
                      onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                      placeholder="e.g. football-as-an-access-engine"
                      className={INPUT}
                      spellCheck={false}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Auto-generated from the title. Lowercase letters, numbers and hyphens only.
                    </p>
                  </Field>
                </div>

                <Field label="Content Type *">
                  <select value={form.content_type}
                    onChange={e => setForm(f => ({ ...f, content_type: e.target.value as InsightContentType }))}
                    className={INPUT}>
                    {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>

                <Field label="Status *">
                  <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as InsightStatus }))}
                    className={INPUT}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>

                <div className="col-span-2">
                  <Field label="Date Published">
                    <input type="date" value={form.published_at}
                      onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                      className={INPUT} />
                  </Field>
                </div>
              </div>

              <hr className="border-gray-100" />

              <Field label="Summary">
                <textarea value={form.summary} rows={3}
                  onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                  placeholder="A short description shown on cards and in search results."
                  className={`${INPUT} resize-none`} />
              </Field>

              <Field label="Content">
                <textarea value={form.content_blocks_raw} rows={10}
                  onChange={e => setForm(f => ({ ...f, content_blocks_raw: e.target.value }))}
                  placeholder={"Use blank lines between blocks.\n# Heading\n## Subheading\n> Quote\n--- (divider)\n![alt](url) for image\nOr plain paragraphs."}
                  className={`${INPUT} font-mono text-xs resize-y`} />
                <p className="text-xs text-gray-400 mt-1">
                  Separate blocks with a blank line. Start with <code className="bg-gray-100 px-1 rounded">#</code> for heading, <code className="bg-gray-100 px-1 rounded">##</code> for subheading, <code className="bg-gray-100 px-1 rounded">&gt;</code> for quote.
                </p>
              </Field>

              <hr className="border-gray-100" />

              <Field label="Download File URL">
                <input type="url" value={form.download_url}
                  onChange={e => setForm(f => ({ ...f, download_url: e.target.value }))}
                  placeholder="https://… (PDF, PPTX, etc.)"
                  className={INPUT} />
              </Field>

              <Field label="Featured Image URL">
                <input type="url" value={form.featured_image_url}
                  onChange={e => setForm(f => ({ ...f, featured_image_url: e.target.value }))}
                  placeholder="https://… (JPG, PNG, WebP)"
                  className={INPUT} />
              </Field>

              <hr className="border-gray-100" />

              <Field label="Visibility *">
                <div className="grid grid-cols-3 gap-2">
                  {VISIBILITIES.map(v => (
                    <button key={v.value} type="button"
                      onClick={() => setForm(f => ({ ...f, visibility: v.value }))}
                      className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                        form.visibility === v.value
                          ? "border-[#0B1929] bg-[#0B1929] text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <p className="text-xs font-semibold">{v.label}</p>
                      <p className={`text-[10px] mt-0.5 ${form.visibility === v.value ? "text-white/70" : "text-gray-400"}`}>{v.desc}</p>
                    </button>
                  ))}
                </div>
              </Field>

              {form.visibility === "restricted" && (
                <Field label="Audience Tags">
                  <TagSelect
                    tags={form.tags}
                    onChange={tags => setForm(f => ({ ...f, tags }))}
                  />
                </Field>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: "#0B1929", color: "#D7B87A" }}>
                  {saving ? "Saving…" : editInsight ? "Save Changes" : "Create Insight"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete insight?</h2>
            <p className="text-sm text-gray-500 mb-5">
              &ldquo;{confirmDel.title}&rdquo; will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDel)}
                className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const INPUT = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

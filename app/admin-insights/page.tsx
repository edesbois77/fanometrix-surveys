"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import type { Insight, InsightBlock, InsightContentType, InsightStatus, InsightVisibility } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { value: InsightContentType; label: string }[] = [
  { value: "report",              label: "Report"              },
  { value: "market_analysis",     label: "Market Analysis"     },
  { value: "survey_results",      label: "Survey Results"      },
  { value: "social_intelligence", label: "Social Intelligence" },
  { value: "cheat_sheet",         label: "Cheat Sheet"         },
  { value: "dashboard",           label: "Dashboard"           },
  { value: "download",            label: "Download"            },
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

const BLOCK_TYPES: { value: string; label: string; group: string }[] = [
  // Structure
  { value: "hero",            label: "Hero",             group: "Structure"  },
  { value: "exec_summary",    label: "Executive Summary",group: "Structure"  },
  { value: "chapter_break",   label: "Chapter Break",    group: "Structure"  },
  // Data
  { value: "stat",            label: "Single Stat",      group: "Data"       },
  { value: "stat_row",        label: "Stat Row (3-up)",  group: "Data"       },
  { value: "insight_section", label: "Insight Section",  group: "Data"       },
  { value: "findings_list",   label: "Findings List",    group: "Data"       },
  { value: "comparison_table",label: "Comparison Table", group: "Data"       },
  // Narrative
  { value: "pull_quote",      label: "Pull Quote",       group: "Narrative"  },
  { value: "market_profile",  label: "Market Profile",   group: "Narrative"  },
  { value: "recommendation",  label: "Recommendation",   group: "Narrative"  },
  { value: "methodology",     label: "Methodology",      group: "Narrative"  },
  { value: "download_cta",    label: "Download CTA",     group: "Narrative"  },
  // Basic
  { value: "paragraph",       label: "Paragraph",        group: "Basic"      },
  { value: "heading",         label: "Heading",          group: "Basic"      },
  { value: "subheading",      label: "Subheading",       group: "Basic"      },
  { value: "quote",           label: "Quote",            group: "Basic"      },
  { value: "image",           label: "Image",            group: "Basic"      },
  { value: "divider",         label: "Divider",          group: "Basic"      },
];

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

const TYPE_LABELS: Record<InsightContentType, string> = {
  report:              "Report",
  market_analysis:     "Market Analysis",
  survey_results:      "Survey Results",
  social_intelligence: "Social Intelligence",
  cheat_sheet:         "Cheat Sheet",
  dashboard:           "Dashboard",
  download:            "Download",
};

const SUGGESTED_TAGS = [
  "Agencies","Brands","Publishers",
  "Dentsu","WPP","Publicis","IPG","Omnicom","Havas",
  "Carlsberg","Heineken","Adidas","Nike","Mastercard","Visa",
  "Football365","FotMob","Flashscore","LiveScore","OneFootball","SofaScore","WhoScored",
  "UEFA EURO 2028","FIFA World Cup 2026","Premier League 2024/25",
  "UK","Germany","Sweden","India","China","USA","France","Spain","Italy",
  "Brazil","Argentina","Japan","South Korea","Netherlands","Belgium",
  "Portugal","Denmark","Norway","Finland","Poland",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-");
}

function emptyBlock(type: string): InsightBlock {
  switch (type) {
    case "hero":            return { type:"hero", headline:"", subheadline:"", label:"FANOMETRIX RESEARCH" };
    case "exec_summary":    return { type:"exec_summary", headline:"", narrative:"", points:[] };
    case "chapter_break":   return { type:"chapter_break", number:"01", label:"", description:"" };
    case "stat":            return { type:"stat", value:"", label:"", context:"", source:"" };
    case "stat_row":        return { type:"stat_row", stats:[{value:"",label:"",context:""},{value:"",label:"",context:""},{value:"",label:"",context:""}] };
    case "insight_section": return { type:"insight_section", chapter:"", headline:"", narrative:"", stat:"", stat_label:"", implication:"", recommendation:"" };
    case "pull_quote":      return { type:"pull_quote", quote:"", attribution:"" };
    case "findings_list":   return { type:"findings_list", headline:"", items:[""], style:"arrow" };
    case "comparison_table":return { type:"comparison_table", headline:"", headers:["",""], rows:[{label:"",values:["",""]}] };
    case "market_profile":  return { type:"market_profile", market:"", headline:"", stat:"", stat_label:"", narrative:"", findings:[], opportunity:"", recommendation:"" };
    case "recommendation":  return { type:"recommendation", number:1, headline:"", body:"" };
    case "methodology":     return { type:"methodology", headline:"Methodology", body:"" };
    case "download_cta":    return { type:"download_cta", headline:"", description:"", primary_label:"Download Full Report", primary_url:"", secondary_label:"Download Cheat Sheet", secondary_url:"" };
    case "paragraph":       return { type:"paragraph", content:"" };
    case "heading":         return { type:"heading", content:"" };
    case "subheading":      return { type:"subheading", content:"" };
    case "quote":           return { type:"quote", content:"" };
    case "image":           return { type:"image", url:"", alt:"" };
    case "divider":         return { type:"divider" };
    default:                return { type:"paragraph", content:"" };
  }
}

// ─── Block editor sub-forms ───────────────────────────────────────────────────

function BlockEditor({ block, onChange }: { block: InsightBlock; onChange: (b: InsightBlock) => void }) {
  function set(key: string, value: unknown) {
    onChange({ ...block, [key]: value } as InsightBlock);
  }

  switch (block.type) {
    case "hero":
      return <div className="space-y-3">
        <Field label="Label"><input className={IN} value={block.label??""} onChange={e=>set("label",e.target.value)} placeholder="e.g. FANOMETRIX RESEARCH" /></Field>
        <Field label="Headline *"><textarea className={`${IN} resize-none`} rows={2} value={block.headline} onChange={e=>set("headline",e.target.value)} placeholder="e.g. FOOTBALL IS AN ACCESS ENGINE" /></Field>
        <Field label="Subheadline"><textarea className={`${IN} resize-none`} rows={2} value={block.subheadline??""} onChange={e=>set("subheadline",e.target.value)} /></Field>
      </div>;

    case "exec_summary":
      return <div className="space-y-3">
        <Field label="Headline"><input className={IN} value={block.headline??""} onChange={e=>set("headline",e.target.value)} /></Field>
        <Field label="Narrative *"><textarea className={`${IN} resize-none`} rows={3} value={block.narrative} onChange={e=>set("narrative",e.target.value)} /></Field>
        <Field label="Key Points (one per line)">
          <textarea className={`${IN} resize-none font-mono text-xs`} rows={4}
            value={(block.points??[]).join("\n")}
            onChange={e=>set("points", e.target.value.split("\n"))}
            placeholder={"01 point\n02 another point"} />
        </Field>
      </div>;

    case "chapter_break":
      return <div className="space-y-3">
        <Field label="Number / Label"><input className={IN} value={block.number} onChange={e=>set("number",e.target.value)} placeholder="e.g. 01 or PART ONE" /></Field>
        <Field label="Chapter Title *"><input className={IN} value={block.label} onChange={e=>set("label",e.target.value)} placeholder="ACCESS IS THE NEW PREMIUM" /></Field>
        <Field label="Description"><input className={IN} value={block.description??""} onChange={e=>set("description",e.target.value)} /></Field>
      </div>;

    case "stat":
      return <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value *"><input className={IN} value={block.value} onChange={e=>set("value",e.target.value)} placeholder="87%" /></Field>
          <Field label="Label *"><input className={IN} value={block.label} onChange={e=>set("label",e.target.value)} placeholder="of fans said..." /></Field>
        </div>
        <Field label="Context"><input className={IN} value={block.context??""} onChange={e=>set("context",e.target.value)} /></Field>
        <Field label="Source"><input className={IN} value={block.source??""} onChange={e=>set("source",e.target.value)} placeholder="Fanometrix Fan Survey 2025" /></Field>
      </div>;

    case "stat_row": {
      const stats = block.stats;
      return <div className="space-y-3">
        {stats.map((s,i) => (
          <div key={i} className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg">
            <Field label={`Stat ${i+1} Value`}><input className={IN} value={s.value} onChange={e=>{const ns=[...stats];ns[i]={...ns[i],value:e.target.value};set("stats",ns);}} /></Field>
            <Field label="Label"><input className={IN} value={s.label} onChange={e=>{const ns=[...stats];ns[i]={...ns[i],label:e.target.value};set("stats",ns);}} /></Field>
            <Field label="Context"><input className={IN} value={s.context??""} onChange={e=>{const ns=[...stats];ns[i]={...ns[i],context:e.target.value};set("stats",ns);}} /></Field>
          </div>
        ))}
        <button type="button" className="text-xs text-[#0B1929] border border-dashed border-gray-300 px-3 py-1.5 rounded-lg hover:border-[#D7B87A]"
          onClick={()=>set("stats",[...stats,{value:"",label:"",context:""}])}>+ Add Stat</button>
      </div>;
    }

    case "insight_section":
      return <div className="space-y-3">
        <Field label="Chapter Label"><input className={IN} value={block.chapter??""} onChange={e=>set("chapter",e.target.value)} placeholder="e.g. INSIGHT 01" /></Field>
        <Field label="Headline *"><input className={IN} value={block.headline} onChange={e=>set("headline",e.target.value)} placeholder="FOOTBALL IS COMMUNITY" /></Field>
        <Field label="Narrative *"><textarea className={`${IN} resize-none`} rows={4} value={block.narrative} onChange={e=>set("narrative",e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stat"><input className={IN} value={block.stat??""} onChange={e=>set("stat",e.target.value)} placeholder="87%" /></Field>
          <Field label="Stat Label"><input className={IN} value={block.stat_label??""} onChange={e=>set("stat_label",e.target.value)} /></Field>
        </div>
        <Field label="Strategic Implication"><textarea className={`${IN} resize-none`} rows={2} value={block.implication??""} onChange={e=>set("implication",e.target.value)} /></Field>
        <Field label="Recommendation"><textarea className={`${IN} resize-none`} rows={2} value={block.recommendation??""} onChange={e=>set("recommendation",e.target.value)} /></Field>
      </div>;

    case "pull_quote":
      return <div className="space-y-3">
        <Field label="Quote *"><textarea className={`${IN} resize-none`} rows={3} value={block.quote} onChange={e=>set("quote",e.target.value)} /></Field>
        <Field label="Attribution"><input className={IN} value={block.attribution??""} onChange={e=>set("attribution",e.target.value)} /></Field>
      </div>;

    case "findings_list": {
      const items = block.items;
      return <div className="space-y-3">
        <Field label="Headline"><input className={IN} value={block.headline??""} onChange={e=>set("headline",e.target.value)} /></Field>
        <Field label="Style">
          <select className={IN} value={block.style??"arrow"} onChange={e=>set("style",e.target.value)}>
            <option value="arrow">Arrow →</option>
            <option value="check">Check ✓</option>
            <option value="numbered">Numbered</option>
          </select>
        </Field>
        <Field label="Items (one per line)">
          <textarea className={`${IN} resize-none font-mono text-xs`} rows={5}
            value={items.join("\n")}
            onChange={e=>set("items",e.target.value.split("\n"))} />
        </Field>
      </div>;
    }

    case "comparison_table": {
      const headers = block.headers;
      const rows = block.rows;
      return <div className="space-y-3">
        <Field label="Headline"><input className={IN} value={block.headline??""} onChange={e=>set("headline",e.target.value)} /></Field>
        <Field label="Column Headers (comma-separated)">
          <input className={IN} value={headers.join(",")} onChange={e=>set("headers",e.target.value.split(","))} placeholder="UK,Germany,Sweden" />
        </Field>
        <div className="space-y-2">
          {rows.map((row,i)=>(
            <div key={i} className="flex gap-2 items-start">
              <input className={`${IN} w-28 flex-shrink-0`} value={row.label} placeholder="Row label"
                onChange={e=>{const nr=[...rows];nr[i]={...nr[i],label:e.target.value};set("rows",nr);}} />
              <input className={IN} value={row.values.join(",")} placeholder="value1,value2,..."
                onChange={e=>{const nr=[...rows];nr[i]={...nr[i],values:e.target.value.split(",")};set("rows",nr);}} />
              <button type="button" onClick={()=>set("rows",rows.filter((_,j)=>j!==i))} className="text-red-400 text-xs hover:text-red-600 mt-2.5">✕</button>
            </div>
          ))}
          <button type="button" className="text-xs text-[#0B1929] border border-dashed border-gray-300 px-3 py-1.5 rounded-lg hover:border-[#D7B87A]"
            onClick={()=>set("rows",[...rows,{label:"",values:headers.map(()=>"")}])}>+ Add Row</button>
        </div>
      </div>;
    }

    case "market_profile": {
      const findings = block.findings ?? [];
      return <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Market *"><input className={IN} value={block.market} onChange={e=>set("market",e.target.value)} placeholder="United Kingdom" /></Field>
          <Field label="Headline *"><input className={IN} value={block.headline} onChange={e=>set("headline",e.target.value)} placeholder="FOOTBALL IS COMMUNITY" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stat"><input className={IN} value={block.stat??""} onChange={e=>set("stat",e.target.value)} placeholder="74%" /></Field>
          <Field label="Stat Label"><input className={IN} value={block.stat_label??""} onChange={e=>set("stat_label",e.target.value)} /></Field>
        </div>
        <Field label="Narrative *"><textarea className={`${IN} resize-none`} rows={3} value={block.narrative} onChange={e=>set("narrative",e.target.value)} /></Field>
        <Field label="Key Findings (one per line)">
          <textarea className={`${IN} resize-none font-mono text-xs`} rows={3}
            value={findings.join("\n")}
            onChange={e=>set("findings",e.target.value.split("\n").filter(Boolean))} />
        </Field>
        <Field label="Brand Opportunity"><textarea className={`${IN} resize-none`} rows={2} value={block.opportunity??""} onChange={e=>set("opportunity",e.target.value)} /></Field>
        <Field label="Recommendation"><textarea className={`${IN} resize-none`} rows={2} value={block.recommendation??""} onChange={e=>set("recommendation",e.target.value)} /></Field>
      </div>;
    }

    case "recommendation":
      return <div className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Number"><input className={IN} type="number" value={block.number??1} onChange={e=>set("number",Number(e.target.value))} /></Field>
          <div className="col-span-3">
            <Field label="Headline *"><input className={IN} value={block.headline} onChange={e=>set("headline",e.target.value)} /></Field>
          </div>
        </div>
        <Field label="Body *"><textarea className={`${IN} resize-none`} rows={3} value={block.body} onChange={e=>set("body",e.target.value)} /></Field>
      </div>;

    case "methodology":
      return <div className="space-y-3">
        <Field label="Section Title"><input className={IN} value={block.headline??""} onChange={e=>set("headline",e.target.value)} placeholder="Methodology" /></Field>
        <Field label="Body *"><textarea className={`${IN} resize-none`} rows={4} value={block.body} onChange={e=>set("body",e.target.value)} /></Field>
      </div>;

    case "download_cta":
      return <div className="space-y-3">
        <Field label="Headline"><input className={IN} value={block.headline??""} onChange={e=>set("headline",e.target.value)} /></Field>
        <Field label="Description"><textarea className={`${IN} resize-none`} rows={2} value={block.description??""} onChange={e=>set("description",e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary Button Label"><input className={IN} value={block.primary_label??""} onChange={e=>set("primary_label",e.target.value)} /></Field>
          <Field label="Primary Button URL"><input className={IN} type="url" value={block.primary_url??""} onChange={e=>set("primary_url",e.target.value)} /></Field>
          <Field label="Secondary Button Label"><input className={IN} value={block.secondary_label??""} onChange={e=>set("secondary_label",e.target.value)} /></Field>
          <Field label="Secondary Button URL"><input className={IN} type="url" value={block.secondary_url??""} onChange={e=>set("secondary_url",e.target.value)} /></Field>
        </div>
      </div>;

    case "paragraph":
    case "quote":
      return <Field label={block.type === "quote" ? "Quote text" : "Content"}>
        <textarea className={`${IN} resize-none`} rows={4} value={block.content} onChange={e=>set("content",e.target.value)} />
      </Field>;

    case "heading":
    case "subheading":
      return <Field label="Text"><input className={IN} value={block.content} onChange={e=>set("content",e.target.value)} /></Field>;

    case "image":
      return <div className="space-y-3">
        <Field label="Image URL *"><input className={IN} type="url" value={block.url} onChange={e=>set("url",e.target.value)} /></Field>
        <Field label="Alt text / Caption"><input className={IN} value={block.alt??""} onChange={e=>set("alt",e.target.value)} /></Field>
      </div>;

    case "divider":
      return <p className="text-xs text-gray-400">Visual divider line — no fields needed.</p>;

    default:
      return null;
  }
}

// ─── Tag selector ─────────────────────────────────────────────────────────────

function TagSelect({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);
  const suggestions = SUGGESTED_TAGS.filter(t => !tags.includes(t) && t.toLowerCase().includes(search.toLowerCase()));

  function add(tag: string) {
    const t = tag.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setSearch("");
  }
  function remove(tag: string) { onChange(tags.filter(t => t !== tag)); }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-full">
              {t}<button type="button" onClick={()=>remove(t)} className="text-purple-400 hover:text-purple-700">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setOpen(true);}}
          onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(search.trim())add(search);else if(suggestions[0])add(suggestions[0]);}}}
          placeholder="Search or type to add…" className={IN} autoComplete="off" />
        {open && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {search.trim() && !SUGGESTED_TAGS.some(t=>t.toLowerCase()===search.toLowerCase()) && (
              <button type="button" onMouseDown={e=>{e.preventDefault();add(search);}}
                className="w-full text-left px-3 py-2 text-sm text-[#0B1929] font-medium hover:bg-gray-50 border-b border-gray-100">
                + Add &ldquo;{search}&rdquo;
              </button>
            )}
            {suggestions.map(t=>(
              <button key={t} type="button" onMouseDown={e=>{e.preventDefault();add(t);}}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{t}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">Match audience by org, agency, brand, publisher, project or market name.</p>
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
  blocks:             InsightBlock[];
  download_url:       string;
  featured_image_url: string;
  tags:               string[];
  visibility:         InsightVisibility;
};

const EMPTY_FORM: FormState = {
  title:"", subtitle:"", slug:"", content_type:"report", status:"draft",
  published_at:"", summary:"", blocks:[], download_url:"", featured_image_url:"",
  tags:[], visibility:"restricted",
};

function insightToForm(i: Insight): FormState {
  return {
    title:              i.title,
    subtitle:           i.subtitle ?? "",
    slug:               i.slug,
    content_type:       i.content_type,
    status:             i.status,
    published_at:       i.published_at ? i.published_at.slice(0,10) : "",
    summary:            i.summary ?? "",
    blocks:             (i.content_blocks ?? []) as InsightBlock[],
    download_url:       i.download_url ?? "",
    featured_image_url: i.featured_image_url ?? "",
    tags:               i.tags ?? [],
    visibility:         i.visibility,
  };
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
  const [addBlockType,setAddBlockType] = useState("");
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

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); }

  function openCreate() {
    setEditInsight(null); setForm({ ...EMPTY_FORM }); setSlugManual(false); setFormError(""); setShowModal(true);
  }
  function openEdit(i: Insight) {
    setEditInsight(i); setForm(insightToForm(i)); setSlugManual(true); setFormError(""); setShowModal(true);
  }
  function handleTitleChange(title: string) {
    setForm(f => ({ ...f, title, slug: slugManual ? f.slug : slugify(title) }));
  }

  // Block management
  function addBlock() {
    if (!addBlockType) return;
    setForm(f => ({ ...f, blocks: [...f.blocks, emptyBlock(addBlockType)] }));
    setAddBlockType("");
  }
  function updateBlock(i: number, b: InsightBlock) {
    setForm(f => { const bs = [...f.blocks]; bs[i] = b; return { ...f, blocks: bs }; });
  }
  function removeBlock(i: number) {
    setForm(f => ({ ...f, blocks: f.blocks.filter((_, j) => j !== i) }));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    setForm(f => {
      const bs = [...f.blocks];
      const j = i + dir;
      if (j < 0 || j >= bs.length) return f;
      [bs[i], bs[j]] = [bs[j], bs[i]];
      return { ...f, blocks: bs };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.slug.trim() || !/^[a-z0-9-]+$/.test(form.slug)) {
      setFormError("Slug is required and may only contain lowercase letters, numbers and hyphens.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(), subtitle: form.subtitle.trim() || null,
      slug: form.slug.trim(), content_type: form.content_type,
      status: form.status, published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      summary: form.summary.trim() || null, content_blocks: form.blocks,
      download_url: form.download_url.trim() || null,
      featured_image_url: form.featured_image_url.trim() || null,
      tags: form.tags, visibility: form.visibility,
    };
    const url    = editInsight ? `/api/insights/${editInsight.slug}` : "/api/insights";
    const method = editInsight ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json   = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(json.error ?? "Failed to save."); return; }
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

  const filtered = insights.filter(i => {
    if (filterType   !== "all" && i.content_type !== filterType)   return false;
    if (filterStatus !== "all" && i.status       !== filterStatus) return false;
    if (filterVis    !== "all" && i.visibility   !== filterVis)    return false;
    if (search) {
      const q = search.toLowerCase();
      return i.title.toLowerCase().includes(q) || (i.subtitle??"").toLowerCase().includes(q) || i.tags.some(t=>t.toLowerCase().includes(q));
    }
    return true;
  });

  function exportCsv() {
    const cols = ["title","subtitle","slug","content_type","status","visibility","published_at","tags","created_at"];
    const rows = filtered.map(i => cols.map(c => { const v = i[c as keyof Insight]; const s = Array.isArray(v) ? v.join("; ") : String(v??""); return `"${s.replace(/"/g,'""')}"`;}).join(","));
    const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "insights.csv"; a.click();
  }

  // Group block types for the add-block selector
  const blockGroups = BLOCK_TYPES.reduce<Record<string, typeof BLOCK_TYPES>>((acc, bt) => {
    if (!acc[bt.group]) acc[bt.group] = [];
    acc[bt.group].push(bt);
    return acc;
  }, {});

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
            <p className="text-sm text-gray-400 mt-0.5">Admin-managed knowledge library with audience access control.</p>
          </div>
          <button onClick={openCreate} className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors" style={{ background:"#0B1929", color:"#D7B87A" }}>
            + New Insight
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input type="search" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] bg-white min-w-[200px]" />
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All types</option>
            {CONTENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All statuses</option>
            {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterVis} onChange={e=>setFilterVis(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#D7B87A]">
            <option value="all">All visibility</option>
            {VISIBILITIES.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          {filtered.length > 0 && (
            <button onClick={exportCsv} className="ml-auto px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">↓ CSV</button>
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
                  {["Title","Type","Status","Visibility","Tags","Published",""].map(h=>(
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i=>(
                  <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">{i.title}</p>
                      {i.subtitle && <p className="text-xs text-gray-400 truncate max-w-[200px]">{i.subtitle}</p>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{TYPE_LABELS[i.content_type]}</td>
                    <td className="px-5 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOURS[i.status]}`}>{i.status}</span></td>
                    <td className="px-5 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${VIS_COLOURS[i.visibility]}`}>{i.visibility==="admin_only"?"Admin only":i.visibility==="restricted"?"Restricted":"Public"}</span></td>
                    <td className="px-5 py-3 max-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {i.tags.slice(0,3).map(t=><span key={t} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-full">{t}</span>)}
                        {i.tags.length>3&&<span className="text-[10px] text-gray-400">+{i.tags.length-3}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {i.published_at ? new Date(i.published_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <a href={`/insights/${i.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">Preview ↗</a>
                        <button onClick={()=>openEdit(i)} className="text-xs text-gray-500 hover:text-gray-800">Edit</button>
                        <button onClick={()=>setConfirmDel(i)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">{filtered.length} insight{filtered.length!==1?"s":""}</p>
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[96vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">{editInsight ? `Edit: ${editInsight.title}` : "New Insight"}</h2>
              <button type="button" onClick={()=>setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto flex-1 px-7 py-6 space-y-5">

              {/* Metadata */}
              <section>
                <SectionHeading>Details</SectionHeading>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Field label="Title *">
                        <input type="text" value={form.title} required onChange={e=>handleTitleChange(e.target.value)} placeholder="e.g. Football as an Access Engine" className={IN} />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Subtitle">
                        <input type="text" value={form.subtitle} onChange={e=>setForm(f=>({...f,subtitle:e.target.value}))} placeholder="One-line supporting headline" className={IN} />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Slug *">
                        <input type="text" value={form.slug} required onChange={e=>{setSlugManual(true);setForm(f=>({...f,slug:e.target.value}));}} placeholder="auto-generated" className={IN} spellCheck={false} />
                      </Field>
                    </div>
                    <Field label="Type *">
                      <select value={form.content_type} onChange={e=>setForm(f=>({...f,content_type:e.target.value as InsightContentType}))} className={IN}>
                        {CONTENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Status *">
                      <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as InsightStatus}))} className={IN}>
                        {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </Field>
                    <div className="col-span-2">
                      <Field label="Date Published">
                        <input type="date" value={form.published_at} onChange={e=>setForm(f=>({...f,published_at:e.target.value}))} className={IN} />
                      </Field>
                    </div>
                  </div>
                  <Field label="Summary">
                    <textarea value={form.summary} rows={2} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Short description shown on cards." className={`${IN} resize-none`} />
                  </Field>
                  <Field label="Featured Image URL">
                    <input type="url" value={form.featured_image_url} onChange={e=>setForm(f=>({...f,featured_image_url:e.target.value}))} placeholder="https://…" className={IN} />
                  </Field>
                  <Field label="Download File URL">
                    <input type="url" value={form.download_url} onChange={e=>setForm(f=>({...f,download_url:e.target.value}))} placeholder="https://…" className={IN} />
                  </Field>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Visibility & Tags */}
              <section>
                <SectionHeading>Visibility & Audience</SectionHeading>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {VISIBILITIES.map(v=>(
                      <button key={v.value} type="button" onClick={()=>setForm(f=>({...f,visibility:v.value}))}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors ${form.visibility===v.value?"border-[#0B1929] bg-[#0B1929] text-white":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                        <p className="text-xs font-semibold">{v.label}</p>
                        <p className={`text-[10px] mt-0.5 ${form.visibility===v.value?"text-white/70":"text-gray-400"}`}>{v.desc}</p>
                      </button>
                    ))}
                  </div>
                  {form.visibility==="restricted" && (
                    <Field label="Audience Tags">
                      <TagSelect tags={form.tags} onChange={tags=>setForm(f=>({...f,tags}))} />
                    </Field>
                  )}
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Content Blocks */}
              <section>
                <SectionHeading>Content Blocks <span className="font-normal text-gray-400 normal-case">({form.blocks.length})</span></SectionHeading>

                {form.blocks.length === 0 && (
                  <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center mb-4">
                    <p className="text-sm text-gray-400">No blocks yet. Add your first block below.</p>
                  </div>
                )}

                {form.blocks.map((block, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl mb-3 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <span className="text-xs font-semibold text-[#0B1929] uppercase tracking-wide">
                        {BLOCK_TYPES.find(bt=>bt.value===block.type)?.label ?? block.type}
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={()=>moveBlock(i,-1)} disabled={i===0} className="text-xs text-gray-400 disabled:opacity-30 hover:text-gray-700 px-1">↑</button>
                        <button type="button" onClick={()=>moveBlock(i,1)} disabled={i===form.blocks.length-1} className="text-xs text-gray-400 disabled:opacity-30 hover:text-gray-700 px-1">↓</button>
                        <button type="button" onClick={()=>removeBlock(i)} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>
                      </div>
                    </div>
                    <div className="px-4 py-4">
                      <BlockEditor block={block} onChange={b=>updateBlock(i,b)} />
                    </div>
                  </div>
                ))}

                {/* Add block */}
                <div className="flex gap-2 mt-1">
                  <select value={addBlockType} onChange={e=>setAddBlockType(e.target.value)} className={`${IN} flex-1`}>
                    <option value="">Select block type…</option>
                    {Object.entries(blockGroups).map(([group,types])=>(
                      <optgroup key={group} label={group}>
                        {types.map(bt=><option key={bt.value} value={bt.value}>{bt.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" onClick={addBlock} disabled={!addBlockType}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#0B1929] text-[#0B1929] hover:bg-[#0B1929] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap">
                    + Add Block
                  </button>
                </div>
              </section>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={()=>setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
                  style={{background:"#0B1929",color:"#D7B87A"}}>
                  {saving?"Saving…":editInsight?"Save Changes":"Create Insight"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete insight?</h2>
            <p className="text-sm text-gray-500 mb-5">&ldquo;{confirmDel.title}&rdquo; will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirmDel(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg">Cancel</button>
              <button onClick={()=>handleDelete(confirmDel)} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok?"bg-green-600 text-white":"bg-red-600 text-white"}`}>
          {toast.ok?"✓":"✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const IN = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">{children}</h3>;
}

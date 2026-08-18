"use client";

// ── FilterBar & filter controls ──────────────────────────────────────────────
// The analyst's control strip: search, segmented views, and dimension selects
// in one row above the evidence/chart it filters. Composable — FilterBar lays
// out whatever controls you drop in and owns the result count + clear affordance
// on the right. The individual controls are styled to the foundation so a filter
// row reads as one instrument, not a pile of form fields.

import { Icon } from "./icons";

export function FilterBar({
  children, resultCount, onClear, className = "",
}: {
  children: React.ReactNode;
  /** Shown on the right, e.g. 42 → "42 results". */
  resultCount?: { value: number; noun?: string };
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 flex-wrap px-3 py-2.5 border ${className}`}
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}
      role="search"
    >
      <span style={{ color: "var(--text-tertiary)" }} className="flex-shrink-0 pl-1"><Icon.filter size={15} /></span>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">{children}</div>
      {resultCount && (
        <span className="fx-tabular-nums text-xs font-medium flex-shrink-0 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
          {resultCount.value.toLocaleString()} {resultCount.noun ?? "results"}
        </span>
      )}
      {onClear && (
        <button onClick={onClear} className="text-xs font-semibold px-2 py-1 rounded-md transition-colors hover:bg-[var(--surface-sunken)] flex-shrink-0" style={{ color: "var(--accent-ink)" }}>
          Clear
        </button>
      )}
    </div>
  );
}

// ── FilterSearch ─────────────────────────────────────────────────────────────
export function FilterSearch({
  value, onChange, placeholder = "Search…", width = 220,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  return (
    <div className="relative" style={{ width }}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }}><Icon.search size={14} /></span>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm rounded-lg pl-8 pr-2.5 py-1.5 outline-none transition-colors"
        style={{ background: "var(--surface-sunken)", border: "1px solid transparent", color: "var(--text-primary)" }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-gold)"; e.currentTarget.style.background = "var(--surface)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--surface-sunken)"; }}
      />
    </div>
  );
}

// ── FilterSelect ─────────────────────────────────────────────────────────────
// A styled native <select> — keeps keyboard/mobile behaviour, loses the default
// chrome. `label` prefixes the current value ("Source: All").
export function FilterSelect({
  label, value, onChange, options, dense = false, fullWidth = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Compact variant — smaller height/padding for dense one-row filter strips. */
  dense?: boolean;
  /** Fill the parent's width (truncating the selected label) instead of sizing to
   *  content — for equal-width filter rows that span the content boundary. */
  fullWidth?: boolean;
}) {
  return (
    <label className={`relative items-center ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none font-medium rounded-md outline-none cursor-pointer transition-colors truncate ${fullWidth ? "w-full" : ""} ${dense ? "text-xs pl-2 pr-6 py-1" : "text-sm pl-3 pr-7 py-1.5 rounded-lg"}`}
        style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{label ? `${label}: ${o.label}` : o.label}</option>
        ))}
      </select>
      <span className={`absolute pointer-events-none ${dense ? "right-1.5" : "right-2"}`} style={{ color: "var(--text-tertiary)" }}><Icon.chevronDown size={dense ? 12 : 14} /></span>
    </label>
  );
}

// ── SegmentedControl ─────────────────────────────────────────────────────────
// A small pill of mutually-exclusive views (e.g. Surveys · Conversations ·
// Documents, or Chart · Table). The selected segment gets a raised white chip.
export function SegmentedControl<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }} role="tablist">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
            style={active
              ? { background: "var(--surface)", color: "var(--text-primary)", boxShadow: "var(--shadow-xs)" }
              : { background: "transparent", color: "var(--text-tertiary)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── FilterChip ───────────────────────────────────────────────────────────────
// A single toggleable filter facet. Selected = gold-tinted; unselected =
// neutral outline. Use several for multi-select facets (markets, platforms).
export function FilterChip({
  label, selected = false, onClick, count,
}: {
  label: React.ReactNode; selected?: boolean; onClick?: () => void; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
      style={selected
        ? { background: "var(--accent-wash)", color: "var(--accent-ink)", border: "1px solid #ECDCB8" }
        : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
    >
      {selected && <Icon.check size={12} strokeWidth={2.5} />}
      {label}
      {count != null && <span className="fx-tabular-nums opacity-70">{count}</span>}
    </button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type MultiSelectOption = { value: string; label: string; keywords?: string };

const INPUT =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#D7B87A] transition-colors bg-white";

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search…",
  helperText,
  strict = false,
  onUnmatchedText,
  unmatchedMessage,
  allowCreate = false,
  createLabel,
  disabled = false,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  helperText?: string;
  /** When true, typing an unrecognised value is flagged as an error */
  strict?: boolean;
  /** Called with true when there is unmatched text, false when cleared */
  onUnmatchedText?: (hasUnmatched: boolean) => void;
  /** Customise the strict-mode error message shown under the input */
  unmatchedMessage?: (search: string) => string;
  /** When true, typed text with no exact match can be added as a brand-new value (e.g. freeform tags) */
  allowCreate?: boolean;
  /** Customise the "create new" button label — defaults to a generic tag-creation label */
  createLabel?: (text: string) => string;
  /** When true, shows the selected pills read-only and hides the search input entirely */
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const remaining = options.filter(o => {
    if (selected.includes(o.value)) return false;
    const q = search.toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.keywords ?? "").toLowerCase().includes(q);
  });

  const trimmed = search.trim();
  const alreadyExists =
    options.some(o => o.value.toLowerCase() === trimmed.toLowerCase()) ||
    selected.some(v => v.toLowerCase() === trimmed.toLowerCase());
  const canCreate = allowCreate && trimmed.length > 0 && !alreadyExists;

  // Notify parent whether there is unmatched text pending (strict mode only —
  // allowCreate mode treats unmatched text as a valid pending creation, not an error)
  const hasUnmatched = strict && !allowCreate && trimmed.length > 0 && remaining.length === 0;
  useEffect(() => {
    onUnmatchedText?.(hasUnmatched);
  }, [hasUnmatched, onUnmatchedText]);

  function add(value: string) {
    onChange([...selected, value]);
    setSearch("");
    onUnmatchedText?.(false);
    inputRef.current?.focus();
  }

  function remove(value: string) {
    onChange(selected.filter(v => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // always stop outer form submitting
      if (remaining.length > 0) add(remaining[0].value); // select first match
      else if (canCreate) add(trimmed); // no match — create the typed value
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); onUnmatchedText?.(false); }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setOpen(true);
    if (!e.target.value.trim()) onUnmatchedText?.(false);
  }

  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v;

  if (disabled) {
    return (
      <div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(v => (
              <span key={v} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
                {labelFor(v)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">None selected.</p>
        )}
        {helperText && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{helperText}</p>}
      </div>
    );
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-xs bg-[#0B1929]/8 text-[#0B1929] border border-[#0B1929]/15 px-2.5 py-1 rounded-full">
              {labelFor(v)}
              <button type="button" onClick={() => remove(v)} className="text-gray-400 hover:text-gray-700 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : "Add another…"}
          className={[INPUT, hasUnmatched ? "border-red-400 focus:border-red-400" : ""].join(" ").trim()}
          autoComplete="off"
        />
        {hasUnmatched && (
          <p className="text-xs text-red-500 mt-1">
            {unmatchedMessage
              ? unmatchedMessage(search)
              : `"${search}" is not a recognised option — select from the list.`}
          </p>
        )}
        {open && !hasUnmatched && (
          <div ref={dropRef} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {remaining.length === 0 && !canCreate && (
              <p className="px-3 py-2.5 text-xs text-gray-400">
                {search ? "No matches found" : "All selected"}
              </p>
            )}
            {remaining.map(o => (
              <button
                key={o.value} type="button"
                onMouseDown={e => { e.preventDefault(); add(o.value); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {o.label}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); add(trimmed); }}
                className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors border-t border-gray-100"
                style={{ color: "#0B1929" }}
              >
                {createLabel ? createLabel(trimmed) : `+ Create "${trimmed}"`}
              </button>
            )}
          </div>
        )}
      </div>
      {helperText && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{helperText}</p>}
    </div>
  );
}

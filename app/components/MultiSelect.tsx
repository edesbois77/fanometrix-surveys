"use client";

import { useEffect, useRef, useState } from "react";

export type MultiSelectOption = { value: string; label: string };

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

  const remaining = options.filter(
    o => !selected.includes(o.value) &&
         o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Notify parent whether there is unmatched text pending
  const hasUnmatched = strict && search.trim().length > 0 && remaining.length === 0;
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
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); onUnmatchedText?.(false); }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setOpen(true);
    if (!e.target.value.trim()) onUnmatchedText?.(false);
  }

  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v;

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
            {remaining.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">
                {search ? "No matches found" : "All selected"}
              </p>
            ) : (
              remaining.map(o => (
                <button
                  key={o.value} type="button"
                  onMouseDown={e => { e.preventDefault(); add(o.value); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {helperText && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{helperText}</p>}
    </div>
  );
}

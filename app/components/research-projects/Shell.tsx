"use client";

// The three UI primitives every Workspace section is built from — moved
// out of WorkspaceBody.tsx so the extracted section components (Dashboard,
// Intelligence, Reports, Conclusion, Knowledge) can use the exact same
// shell without importing from the orchestrator itself.
import { useState } from "react";
import { InfoTooltip } from "@/app/components/InfoTooltip";

// Every major Workspace section is collapsible (expanded by default) — one
// shared implementation rather than six copies. `info`, when given, renders
// an (i) next to the title explaining what the section is for — kept as a
// sibling of the collapse toggle (not nested inside it) so hovering/tapping
// it never also collapses the card.
export function SectionCard({ id, title, badge, info, cta, summary, children }: {
  id: string; title: string; badge?: React.ReactNode; info?: React.ReactNode; cta?: React.ReactNode; summary?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden scroll-mt-4">
      {/* Navy header band — gives every section a distinct visual anchor
          instead of every card blending into the same white block, and
          doubles as this Workspace's own page nav. */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ background: "#0B1929" }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2.5 text-left min-w-0 -m-2 p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span
              className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white/80 text-sm font-bold transition-transform ${open ? "rotate-90" : ""}`}
            >
              ›
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide truncate">{title}</h2>
          </button>
          {badge}
          {info && <InfoTooltip text={info} dark />}
        </div>
        {cta}
      </div>
      <div className="p-5">
        {!open && summary && <div>{summary}</div>}
        {open && <div>{children}</div>}
      </div>
    </div>
  );
}

// A titled explanation inside a SectionCard's (i) popover — a bold one-line
// title (what the card is), then one or two short paragraphs (how to use
// it). Every SectionCard's `info` uses this so every card's tooltip reads
// with the same structure instead of one long unbroken sentence.
export function InfoContent({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <p className="font-semibold text-gray-900">{title}</p>
      {children}
    </>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>;
}

// A collapsed SectionCard still communicates useful information — a small
// horizontal row of facts (counts, statuses), grouped by category where
// there's more than one kind of thing to summarize, styled like the
// Research Brief hero's own summary line rather than a vertical stack.
export function CollapsedSummary({ groups }: { groups: { label?: string; parts: string[] }[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
      {groups.map((g, i) => (
        <p key={i} className="text-xs text-gray-500">
          {g.label && <span className="text-gray-400 font-semibold">{g.label}: </span>}
          {g.parts.join(", ")}
        </p>
      ))}
    </div>
  );
}

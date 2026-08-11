"use client";

// ── OrganisationSwitcher — the platform-owned Current Organisation control ─────
// ORG-006 WP-01 (IS-01). One shell-level mechanism for the governed 0/1/many
// Organisation Context experience. It reuses the EXISTING session context
// (useSession) and the EXISTING governed switch endpoint (via switchOrganisation)
// — it never introduces a second Current-Organisation state or a per-product
// selector. Behaviour by authoritative Accessible Organisation Set:
//   • 0 accessible            → a quiet "no organisation" indicator (no affordance).
//   • exactly 1 accessible    → static Organisation name, NO switcher affordance.
//   • many, one is Current    → a switcher listing the set; current is marked.
//   • selection_required      → a prominent "Select organisation" prompt.
// Selecting/switching only ever changes Current Organisation; it cannot change the
// Accessible Organisation Set.

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";

function OrgGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
    </svg>
  );
}

export function OrganisationSwitcher({
  variant = "light",
  fullWidth = false,
}: {
  variant?: "light" | "dark";
  /** Always-visible, full-width rendering for a sidebar/column context (drops the
   *  header-only `hidden md:flex` responsive hiding of the static chip). */
  fullWidth?: boolean;
}) {
  const { organisationContext: ctx, user, loading, switchOrganisation } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (loading && ctx.status === "no_access") return null;

  const dark = variant === "dark";
  const accessible = ctx.accessibleOrganisations;
  const currentName =
    user?.organisationName ??
    accessible.find((o) => o.id === ctx.currentOrganisationId)?.name ??
    (accessible.length === 1 ? accessible[0].name : null);

  const show = fullWidth ? "flex" : "hidden md:flex";
  const chipBase = `${fullWidth ? "w-full" : "max-w-[240px]"} flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium`;
  const chipStatic = dark
    ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }
    : { background: "var(--surface-sunken)", color: "var(--text-secondary)" };
  const accent = dark ? "#D7B87A" : "var(--text-tertiary)";

  async function choose(id: string) {
    if (busy) return;
    setBusy(true);
    const r = await switchOrganisation(id);
    if (!r.ok) { setBusy(false); setOpen(false); }
    // On success the page reloads (switchOrganisation), so no further state needed.
  }

  // ── No valid Organisation context (0 accessible / indeterminate) ──────────────
  if (ctx.status === "no_access" || ctx.status === "indeterminate" || accessible.length === 0) {
    return (
      <span className={`${show} ${chipBase}`} style={chipStatic} title="No organisation access">
        <span style={{ color: accent }}><OrgGlyph /></span>
        <span className="truncate opacity-80">No organisation</span>
      </span>
    );
  }

  // ── Exactly one accessible Organisation → static, no switcher affordance ───────
  if (accessible.length === 1 && ctx.status !== "selection_required") {
    return (
      <span className={`${show} ${chipBase}`} style={chipStatic} title={currentName ?? undefined}>
        <span style={{ color: accent }}><OrgGlyph /></span>
        <span className="truncate">{currentName ?? "Organisation"}</span>
      </span>
    );
  }

  // ── Many accessible, or selection required → interactive control ──────────────
  const selectionRequired = ctx.status === "selection_required";
  const label = selectionRequired ? "Select organisation" : currentName ?? "Organisation";

  const menuPanel = dark
    ? { background: "#FFFFFF", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }
    : { background: "#FFFFFF", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" };

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        disabled={busy}
        className={`${chipBase} transition-colors ${selectionRequired ? "font-semibold" : ""}`}
        style={
          selectionRequired
            ? (dark ? { background: "#D7B87A", color: "#0B1929" } : { background: "var(--surface-sunken)", color: "var(--text-primary)", border: "1px solid var(--border-default)" })
            : chipStatic
        }
      >
        <span style={{ color: selectionRequired ? "inherit" : accent }}><OrgGlyph /></span>
        <span className="truncate">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 z-50 overflow-hidden rounded-xl border" style={menuPanel}>
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <p className="text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: "var(--text-tertiary)" }}>
              {selectionRequired ? "Select an organisation to continue" : "Switch organisation"}
            </p>
          </div>
          <ul className="p-1.5 max-h-72 overflow-y-auto">
            {accessible.map((o) => {
              const isCurrent = o.id === ctx.currentOrganisationId;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    disabled={busy}
                    onClick={() => (isCurrent ? setOpen(false) : choose(o.id))}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span style={{ color: "var(--text-tertiary)" }}><OrgGlyph /></span>
                    <span className="flex-1 truncate">{o.name ?? o.id}</span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Current</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

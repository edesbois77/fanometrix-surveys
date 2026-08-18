"use client";

// ── Product switcher (GlobalShell, Level 1) ──────────────────────────────────
// "Where am I in Fanometrix?" — the switch between products. Survey Studio is
// the first new product; "Archive / Legacy" is the entry point back into the
// entire existing application (navigates to the untouched /home). It is styled
// as secondary so it never competes with Survey Studio as a primary product.
// The component is reusable for real future products; we do not invent a
// catalogue to fill it.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRODUCTS, CURRENT_PRODUCT_KEY, type ProductConfig } from "@/lib/studio-nav";
import { StudioIcon } from "./studio-icons";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

export function ProductSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = PRODUCTS.find(p => p.key === CURRENT_PRODUCT_KEY) ?? PRODUCTS[0];
  // Real products render under "Products"; Archive / Legacy is not a product, so
  // it renders in its own secondary group below a divider. Future real products
  // slot into the top group automatically.
  const products = PRODUCTS.filter(p => !p.legacy);
  const legacy = PRODUCTS.filter(p => p.legacy);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function renderItem(p: ProductConfig) {
    const Glyph = StudioIcon[p.icon];
    const isCurrent = p.key === CURRENT_PRODUCT_KEY;
    return (
      <Link
        key={p.key}
        href={p.href}
        role="menuitem"
        onClick={() => setOpen(false)}
        className="flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--surface-hover)]"
      >
        <span
          className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
          style={
            p.legacy
              ? { background: "var(--surface-sunken)", color: "var(--text-tertiary)" }
              : { background: NAVY, color: GOLD }
          }
          aria-hidden
        >
          <Glyph size={16} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{p.label}</span>
            {isCurrent && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ color: "var(--accent-ink)", background: "var(--accent-wash)" }}>
                Current
              </span>
            )}
          </span>
          <span className="block text-xs mt-0.5 leading-snug" style={{ color: "var(--text-tertiary)" }}>{p.description}</span>
        </span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg pl-2.5 pr-2 py-1.5 text-sm font-semibold transition-colors"
        style={{ color: "#FFFFFF", background: open ? "rgba(255,255,255,0.08)" : "transparent" }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ color: GOLD }} aria-hidden><StudioIcon.apps size={16} /></span>
        <span className="hidden sm:inline">{current.label}</span>
        <span style={{ color: "rgba(255,255,255,0.5)" }} aria-hidden><StudioIcon.chevronDown size={14} /></span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-72 z-50 overflow-hidden rounded-xl border"
          style={{ background: "#FFFFFF", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
        >
          {/* Real products */}
          <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
            Products
          </p>
          <div className="px-1.5 pb-1.5">
            {products.map(renderItem)}
          </div>

          {/* Archive / Legacy — not a product; its own secondary group. */}
          {legacy.length > 0 && (
            <>
              <div className="h-px mx-3 my-1" style={{ background: "var(--border-subtle)" }} aria-hidden />
              <p className="px-3 pt-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-disabled)" }}>
                Existing application
              </p>
              <div className="px-1.5 pb-1.5">
                {legacy.map(renderItem)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

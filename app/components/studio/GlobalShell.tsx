"use client";

// ── GlobalShell — Level 1, the persistent navy Fanometrix header ─────────────
// "Where am I in Fanometrix?" The strong brand frame that sits above every
// product. Restrained on purpose: identity + product switch + organisation
// context + account — NOT a horizontal version of the old sidebar. It reuses
// the existing session (useSession) and never introduces a second auth system.
//
// Navy #0B1929, gold #D7B87A used only as a small accent. Sticky at the top so
// it remains the platform frame while the workspace scrolls beneath it. It sets
// no scroll container of its own, so sticky descendants (the product sidebar)
// keep pinning to the real window scroll.

import Link from "next/link";
import Image from "next/image";
import { ProductSwitcher } from "./ProductSwitcher";
import { UserMenu } from "./UserMenu";
import { StudioIcon } from "./studio-icons";
import { OrganisationSwitcher } from "@/app/components/OrganisationSwitcher";

export const GLOBAL_HEADER_H = "3.5rem"; // 56px — the one place the header height is declared

export function GlobalShell({ onOpenNav }: { onOpenNav: () => void }) {

  return (
    <header
      className="sticky top-0 z-40 flex-shrink-0 print:hidden"
      style={{ height: GLOBAL_HEADER_H, background: "#0B1929", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="h-full flex items-center pr-3 sm:pr-4">

        {/* Identity zone — on large screens exactly the width of the product
            sidebar (lg:w-56), so its right edge (the divider) sits on the
            sidebar's right border and the product switcher below begins at that
            same grey line, aligning "Survey Studio" with the content column. */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 h-full pl-3 sm:pl-4 lg:w-56">
          {/* Mobile: open the product sidebar drawer */}
          <button
            type="button"
            onClick={onOpenNav}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white transition-colors"
            style={{ background: "transparent" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            aria-label="Open navigation"
          >
            <StudioIcon.menu size={20} />
          </button>

          {/* Fanometrix identity */}
          <Link href="/survey-studio" className="flex items-center flex-shrink-0" aria-label="Fanometrix — Survey Studio">
            <Image
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              width={124} height={28}
              priority
              style={{ objectFit: "contain", objectPosition: "left" }}
            />
          </Link>

          {/* Divider — pushed to the identity zone's right edge on large screens
              (aligning with the sidebar's right border). */}
          <span className="hidden sm:block h-6 w-px flex-shrink-0 lg:ml-auto" style={{ background: "rgba(255,255,255,0.12)" }} aria-hidden />
        </div>

        {/* Product switcher — begins at the sidebar's right edge on large screens */}
        <ProductSwitcher />

        <div className="flex-1" />

        {/* ORG-006 WP-01 — platform-owned Current Organisation control (governed
            0/1/many: static when one, a switcher when many, a prompt when selection
            is required). The single shell-level mechanism; products never fork it. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <OrganisationSwitcher variant="dark" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

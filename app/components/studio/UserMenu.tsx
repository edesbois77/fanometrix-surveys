"use client";

// ── Account menu (GlobalShell, Level 1) ──────────────────────────────────────
// The user/account access point in the global header: initials avatar → a
// dropdown with identity, the organisation context, an "Archive / Legacy"
// escape hatch into the existing app, and Sign out. It reuses the EXISTING
// session (useSession) and the EXISTING logout endpoint — it never forks the
// auth/session system.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { StudioIcon } from "./studio-icons";

function initials(user: { firstName: string | null; lastName: string | null; workEmail: string }): string {
  const f = user.firstName?.trim()?.[0];
  const l = user.lastName?.trim()?.[0];
  if (f && l) return `${f}${l}`.toUpperCase();
  if (f) return f.toUpperCase();
  return user.workEmail.trim()[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (!user) {
    return <span className="w-8 h-8 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} aria-hidden />;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.workEmail;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={fullName}
        className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-shadow focus-visible:outline-none focus-visible:ring-2"
        style={{ background: "#D7B87A", color: "#0B1929", boxShadow: open ? "0 0 0 2px rgba(215,184,122,0.4)" : "none" }}
      >
        {initials(user)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 z-50 overflow-hidden rounded-xl border"
          style={{ background: "#FFFFFF", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
        >
          {/* Identity */}
          <div className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{fullName}</p>
            <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{user.workEmail}</p>
            <p className="text-[11px] font-medium capitalize mt-1.5 inline-block px-1.5 py-0.5 rounded"
              style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)" }}>
              {user.role}
            </p>
          </div>

          {/* Organisation context (display only — no switcher in Phase 1) */}
          {user.organisationName && (
            <div className="px-3.5 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.org size={15} /></span>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: "var(--text-tertiary)" }}>Organisation</span>
                <span className="block text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>{user.organisationName}</span>
              </span>
            </div>
          )}

          <div className="p-1.5">
            <Link
              href="/home"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <StudioIcon.archive size={16} /> Archive / Legacy
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <StudioIcon.logout size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

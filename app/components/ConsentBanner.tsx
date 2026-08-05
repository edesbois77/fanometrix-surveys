"use client";

// First-party cookie-consent banner for the public marketing website. Styled to
// match the Fanometrix brand (navy + gold), not a generic browser banner.
//
// Behaviour:
//   • Deny by default — analytics load only after "Accept" (see MarketingAnalytics).
//   • Accept and Reject are equally prominent and equally easy.
//   • The choice persists (first-party cookie), so it isn't shown on every page.
//   • Re-openable from the footer "Cookie Settings" link to change/withdraw.
//   • Never shown on /embed, /survey, the logged-in app, etc. (isMarketingPath).
//
// State is read via useSyncExternalStore (SSR-safe, no setState-in-effect): the
// banner auto-shows only while there's no stored choice, plus whenever it's
// manually re-opened from the footer.

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readConsent, writeConsent, subscribeConsent, isMarketingPath, OPEN_SETTINGS_EVENT } from "@/lib/consent";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

// Client-only flag (server snapshot = false) so the banner never renders in SSR.
const emptySubscribe = () => () => {};

export function ConsentBanner() {
  const pathname = usePathname();
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const [manualOpen, setManualOpen] = useState(false);

  // The footer "Cookie Settings" link re-opens the banner (setState in the
  // event callback — not directly in the effect body).
  useEffect(() => {
    const onOpen = () => setManualOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  const choose = useCallback((choice: "granted" | "denied") => {
    writeConsent(choice);       // updates the cookie + fires the change event
    setManualOpen(false);       // and closes the banner
    // Withdrawing after analytics had already loaded this session: reload so the
    // already-initialised GA/Clarity are fully removed (not just gated going
    // forward). No reload on a first-visit Reject, where nothing has loaded.
    if (choice === "denied" && typeof window !== "undefined") {
      const w = window as unknown as { gtag?: unknown; clarity?: unknown };
      if (w.gtag || w.clarity) window.location.reload();
    }
  }, []);

  // Auto-open while no choice is stored; also open when manually re-opened.
  const open = manualOpen || consent === null;
  if (!isClient || !open || !pathname || !isMarketingPath(pathname)) return null;

  const btnBase =
    "flex-1 sm:flex-none inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1929]";

  return (
    <div role="region" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6 sm:pb-6">
      <div
        className="mx-auto max-w-[1080px] rounded-2xl p-5 sm:p-6"
        style={{ background: NAVY, border: "1px solid rgba(215,184,122,0.35)", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.6)" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="max-w-[640px]">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
              Your privacy
            </p>
            <p className="leading-[1.6] text-[14px]" style={{ color: "rgba(255,255,255,0.82)" }}>
              We&apos;d like to use Google Analytics and Microsoft Clarity to understand how visitors use the Fanometrix
              website. These analytics cookies only load if you accept, and never on our fan surveys. See our{" "}
              <Link href="/privacy" className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-80" style={{ color: GOLD }}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => choose("denied")}
              className={btnBase}
              style={{ background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,0.35)", ["--tw-ring-color" as string]: GOLD }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className={btnBase}
              style={{ background: GOLD, color: NAVY, border: `2px solid ${GOLD}`, ["--tw-ring-color" as string]: GOLD }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

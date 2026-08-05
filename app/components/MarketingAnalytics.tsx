"use client";

// Site analytics for the PUBLIC MARKETING pages only — Microsoft Clarity and
// Google Analytics (gtag.js), loaded once via next/script.
//
// Rendered from the root layout (so it's a single source of truth), but it
// self-limits to marketing routes via the allowlist below. It deliberately does
// NOT run on the logged-in app/admin, the fan-facing survey (/survey), or the
// 300×250 survey embed iframes (/embed) — those would pollute the data and raise
// consent/privacy issues inside third-party iframes.
//
// To change coverage, edit isMarketingPath() below (nothing else references the IDs).

import Script from "next/script";
import { usePathname } from "next/navigation";

const CLARITY_PROJECT_ID = "xxpmb65ugi";
const GA_MEASUREMENT_ID = "G-MNDTT2H4L5";

const CLARITY_SNIPPET = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`;
const GA_INIT_SNIPPET = `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${GA_MEASUREMENT_ID}');`;

// The public marketing surface. Anything not matched here (app/admin, /survey,
// /embed, /login, /access-denied, API routes) gets no analytics.
function isMarketingPath(p: string): boolean {
  if (p === "/") return true;                              // homepage
  if (p === "/request-access") return true;
  if (p === "/privacy") return true;
  if (/^\/[a-z]{2}\/privacy$/.test(p)) return true;        // localised privacy (/en/privacy, …)
  if (p.startsWith("/for-publishers")) return true;        // /for-publishers + all sub-pages
  if (p.startsWith("/trust/")) return true;                // public trust/governance pages
  if (p === "/publisher-hub" || p === "/publisher-guide" || p === "/fanometrix-guide") return true;
  return false;
}

export function MarketingAnalytics() {
  const pathname = usePathname();
  if (!pathname || !isMarketingPath(pathname)) return null;
  return (
    <>
      <Script id="microsoft-clarity" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: CLARITY_SNIPPET }} />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: GA_INIT_SNIPPET }} />
    </>
  );
}

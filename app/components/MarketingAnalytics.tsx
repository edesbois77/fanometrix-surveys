"use client";

// Google Analytics + Microsoft Clarity for the PUBLIC MARKETING pages, loaded
// STRICTLY on a deny-by-default basis: the tags are not injected at all until
// the visitor has accepted analytics cookies (see ConsentBanner). Rendered once
// from the root layout; self-limits to marketing routes via isMarketingPath.
//
// Google Consent Mode v2 is implemented WITHOUT weakening deny-by-default:
// because gtag.js is only injected after acceptance, we set the consent state
// (default denied → analytics granted) in the same init, so GA is signalled
// correctly the moment it loads and nothing runs before consent.
//
// Consent is read via useSyncExternalStore so it's SSR-safe (server snapshot =
// null → renders nothing) and reacts to Accept/withdraw without setState-in-effect.

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { readConsent, subscribeConsent, isMarketingPath } from "@/lib/consent";

const CLARITY_PROJECT_ID = "xxpmb65ugi";
const GA_MEASUREMENT_ID = "G-MNDTT2H4L5";

// Consent Mode v2: populate dataLayer with consent (default denied, then grant
// analytics) BEFORE config, then let gtag.js process it in order. This only
// runs once the visitor has accepted, so deny-by-default is preserved.
const GA_INIT_SNIPPET = `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});gtag('consent','update',{analytics_storage:'granted'});gtag('js', new Date());gtag('config','${GA_MEASUREMENT_ID}');`;
const CLARITY_SNIPPET = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`;

export function MarketingAnalytics() {
  const pathname = usePathname();
  // SSR snapshot is null → renders nothing on the server and before consent.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  // Deny by default: only load once consent is explicitly "granted", and only on
  // public marketing routes.
  if (consent !== "granted" || !pathname || !isMarketingPath(pathname)) return null;

  return (
    <>
      {/* Consent Mode init first (populates dataLayer), then the loader. */}
      <Script id="ga-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: GA_INIT_SNIPPET }} />
      <Script id="ga-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ms-clarity" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: CLARITY_SNIPPET }} />
    </>
  );
}

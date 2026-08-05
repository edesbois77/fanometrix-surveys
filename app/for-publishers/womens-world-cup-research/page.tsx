import type { Metadata } from "next";
import Script from "next/script";
import { MARKETING_URL } from "@/lib/env";
import { WwcCampaign } from "./WwcCampaign";

// Publisher recruitment landing page for the FIFA Women's World Cup 2027 fan
// research initiative. It lives inside the existing /for-publishers section and
// reuses that section's design system (navy/gold tokens, sticky header, footer,
// FAQ accordion styling, scroll-fade animations). This explicit static route
// takes precedence over the sibling [publisher] dynamic segment, so no config
// entry is required. Registrations post to the existing /api/access-requests
// endpoint (see WwcCampaign → RegistrationForm).

const PATH = "/for-publishers/womens-world-cup-research";
const PAGE_URL = `${MARKETING_URL}${PATH}`;

const TITLE = "Women's World Cup 2027 Fan Research for Publishers | Fanometrix";
const DESCRIPTION =
  "Join football publishers worldwide in a global Fanometrix research initiative capturing fan insight ahead of the FIFA Women's World Cup 2027.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    siteName: "Fanometrix",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Structured data — Organization, WebPage and BreadcrumbList in a single graph
// so search engines can model the publisher, the page and its place in the site.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${MARKETING_URL}/#organization`,
      name: "Fanometrix",
      url: MARKETING_URL,
      logo: `${MARKETING_URL}/Fanometrix_Logo.png`,
      description:
        "Fanometrix helps publishers, brands and rights holders better understand sports audiences through audience research, zero-party data and fan insight.",
    },
    {
      "@type": "WebPage",
      "@id": `${PAGE_URL}#webpage`,
      url: PAGE_URL,
      name: TITLE,
      description: DESCRIPTION,
      inLanguage: "en-GB",
      about: { "@id": `${MARKETING_URL}/#organization` },
      publisher: { "@id": `${MARKETING_URL}/#organization` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${PAGE_URL}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: MARKETING_URL },
        { "@type": "ListItem", position: 2, name: "For Publishers", item: `${MARKETING_URL}/for-publishers` },
        { "@type": "ListItem", position: 3, name: "Women's World Cup 2027 Fan Research", item: PAGE_URL },
      ],
    },
  ],
};

// Microsoft Clarity — analytics / session insight, scoped to THIS page only
// (not the whole site) via next/script. `afterInteractive` loads it early but
// after hydration; Clarity then self-injects its tag into <head>.
const CLARITY_PROJECT_ID = "xxpmb65ugi";
const CLARITY_SNIPPET = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`;

// Google Analytics (gtag.js) — also scoped to THIS page only via next/script:
// the loader plus the inline init (dataLayer + gtag config).
const GA_MEASUREMENT_ID = "G-MNDTT2H4L5";
const GA_INIT_SNIPPET = `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${GA_MEASUREMENT_ID}');`;

export default function WomensWorldCupResearchPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Script id="microsoft-clarity" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: CLARITY_SNIPPET }} />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: GA_INIT_SNIPPET }} />
      <WwcCampaign />
    </>
  );
}

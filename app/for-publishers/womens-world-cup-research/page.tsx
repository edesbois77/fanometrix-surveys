import type { Metadata } from "next";
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

export default function WomensWorldCupResearchPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <WwcCampaign />
    </>
  );
}

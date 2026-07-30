import type { Metadata } from "next";
import { PublisherTemplate } from "./PublisherTemplate";
import { DEFAULT_CONFIG } from "./config";

// Canonical marketing page. Renders the shared template with the brand-neutral
// default configuration. Personalised partner pages live at
// /for-publishers/<slug> and inject their own config into the same template.
export const metadata: Metadata = {
  title: DEFAULT_CONFIG.metaTitle,
  description: DEFAULT_CONFIG.metaDescription,
};

export default function ForPublishersPage() {
  return <PublisherTemplate config={DEFAULT_CONFIG} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublisherTemplate } from "../PublisherTemplate";
import { getPublisherConfig, PUBLISHER_SLUGS } from "../config";

// Personalised partner pages (/for-publishers/<slug>). Same shared template as
// the canonical page; only the injected config differs. Only the configured
// publishers are valid routes — anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLISHER_SLUGS.map(publisher => ({ publisher }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publisher: string }>;
}): Promise<Metadata> {
  const { publisher } = await params;
  const config = getPublisherConfig(publisher);
  if (!config) return { title: "Fanometrix" };
  return { title: config.metaTitle, description: config.metaDescription };
}

export default async function PublisherPartnerPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher } = await params;
  const config = getPublisherConfig(publisher);
  if (!config) notFound();
  return <PublisherTemplate config={config} />;
}

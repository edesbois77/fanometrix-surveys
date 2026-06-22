/**
 * Canonical domain constants — single source of truth for all generated URLs.
 *
 * Set in Vercel:
 *   NEXT_PUBLIC_MARKETING_URL = https://fanometrix.com
 *   NEXT_PUBLIC_APP_URL       = https://app.fanometrix.com
 *   NEXT_PUBLIC_SURVEYS_URL   = https://surveys.fanometrix.com
 *
 * All three fall back to the Vercel preview URL so local dev and preview
 * deployments work without any extra configuration.
 */

const FALLBACK = "https://fanometrix-surveys.vercel.app";

export const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? FALLBACK;
export const APP_URL       = process.env.NEXT_PUBLIC_APP_URL       ?? FALLBACK;
export const SURVEYS_URL   = process.env.NEXT_PUBLIC_SURVEYS_URL   ?? FALLBACK;

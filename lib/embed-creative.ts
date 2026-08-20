// Shared creative resolution for the embed surface.
//
// WHY THIS EXISTS
// The Studio draft Preview (/embed?survey=<id>&preview=1) rendered the DEFAULT
// creative rather than the one selected on the Creative stage. The selection was
// stored correctly on `surveys.creative_design`; the survey Preview API simply
// never selected or returned it, and the client's survey-only branch had nothing
// to apply. So Preview could not show what partners would actually receive.
//
// The resolution logic already existed, duplicated, in /api/embed/campaign and
// /api/embed/group. Adding a third copy for the survey route would have fixed
// Preview today and guaranteed it drifted again. This module is a VERBATIM
// extraction of that logic so Preview and delivery resolve from one place.
//
// SCOPE OF THE FIRST RELEASE
// Only /api/embed/survey consumes this. The campaign and group routes are
// deliberately left byte-identical — they are the live delivery paths and must
// not change during WWC fieldwork. `lib/embed-creative.test.ts` pins this
// helper's output against those routes' own logic for every design in the
// database, so a divergence fails the suite rather than reaching a partner.
// Migrating campaign and group onto this helper is a post-WWC follow-up.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildEmbedThemeFromState, resolveBrandingLogos, type BuilderState, type BrandingConfig } from "@/lib/creative-theme-builder";
import { coerceStackConfig, resolveEffectiveTopic } from "@/lib/stack-config";
import type { EmbedTheme } from "@/app/embed/ThemedSurvey";

/** The seven creative fields the embed client needs to render a design. */
export type ResolvedCreative = {
  creative_design: string | null;
  custom_theme:    EmbedTheme | null;
  layout:          string | null;
  renderer:        string | null;
  config:          unknown;
  topic:           string | null;
  branding:        string[];
};

/** What a caller with no design selected gets. Every field explicitly null/empty
 *  so a consumer can spread it without conditionals. */
export const EMPTY_CREATIVE: ResolvedCreative = {
  creative_design: null, custom_theme: null, layout: null,
  renderer: null, config: null, topic: null, branding: [],
};

/**
 * Resolve a creative_design slug into the fields the embed renderer consumes.
 *
 * `topicOverride` is the campaign-level Topic (campaigns.topic): null means "use
 * the design default", "" means the campaign deliberately cleared it. A survey
 * has no campaign, so the survey route passes null and gets the design default.
 */
export async function resolveCreativeForEmbed(
  designSlug: string | null | undefined,
  topicOverride: string | null = null,
): Promise<ResolvedCreative> {
  if (!designSlug) return { ...EMPTY_CREATIVE };

  const { data: design } = await supabaseAdmin
    .from("creative_designs")
    .select("layout, builder_state, branding, config")
    .eq("slug", designSlug)
    .is("deleted_at", null)
    .single();

  const creativeLayout: string | null = design?.layout ?? null;

  // Durable, explicit renderer selector for the strangler: a design may pin a
  // specific renderer via config.renderer (e.g. "studio-classic" — the refreshed
  // Classic). Historical `classic` designs have no config.renderer, so they
  // resolve to their layout and keep rendering via ClassicSurvey. NEVER keyed on
  // layout alone, so historical traffic can never be redirected.
  const renderer = ((design?.config as Record<string, unknown> | null)?.renderer as string) ?? creativeLayout;

  // "invitation" is the timer creative with an intro screen — same palette
  // build; the client decides whether to show the intro from `layout`.
  let customTheme: EmbedTheme | null = null;
  if ((design?.layout === "timer" || design?.layout === "invitation") && design.builder_state) {
    customTheme = buildEmbedThemeFromState(design.builder_state as BuilderState);
  }

  const branding = resolveBrandingLogos(design?.branding as BrandingConfig | null);

  // Stack config lives in a separate jsonb column. Fetched only for stack, in
  // its own query so a not-yet-migrated `config` column degrades to defaults
  // (null) instead of breaking the main resolution for every other design.
  let stackConfig: unknown = null;
  let effectiveTopic: string | null = null;
  if (design?.layout === "stack") {
    const { data: cfg } = await supabaseAdmin
      .from("creative_designs").select("config").eq("slug", designSlug).single();
    stackConfig = cfg?.config ?? null;
    // Default (design) / override (campaign text) / cleared (campaign "") → effective Topic.
    effectiveTopic = resolveEffectiveTopic(topicOverride, coerceStackConfig(cfg?.config).defaultTopic);
  }

  return {
    creative_design: designSlug,
    custom_theme:    customTheme,
    layout:          creativeLayout,
    renderer,
    config:          stackConfig,
    topic:           effectiveTopic,
    branding,
  };
}

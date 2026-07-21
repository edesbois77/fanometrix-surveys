// The Information Needs resolver — the SINGLE read path for the research design
// every specialist consumes. Consumers (the conversation classifier today;
// Survey Research and the Research Library next) call this and never reach into
// storage themselves, so they don't depend on where needs live.
//
// TODAY needs live on the Conversation Advisor's briefing (social_searches
// .information_needs). In the longer-term Research Project model they will move
// to the project's approved, versioned Research Design. When that happens, ONLY
// this function's body changes — every consumer keeps working, and this is where
// "resolve the APPROVED version" will be enforced.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { InformationNeeds } from "@/lib/information-needs";

// A loose descriptor so callers name what they have, not where needs are stored.
// searchId is the path today; projectId lands with the Research Design.
export type InformationNeedsSource = { searchId?: string; projectId?: string };

/** Resolve the Information Needs to judge/collect against, or null when none are
 *  defined (e.g. a legacy search created before the Conversation Advisor) so
 *  callers can fall back to their prior behaviour. */
export async function resolveInformationNeeds(source: InformationNeedsSource): Promise<InformationNeeds | null> {
  if (source.searchId) {
    const { data } = await supabaseAdmin
      .from("social_searches")
      .select("information_needs")
      .eq("id", source.searchId)
      .single<{ information_needs: InformationNeeds | null }>();
    return data?.information_needs ?? null;
  }
  // projectId → the project's approved Research Design. Not owned there yet;
  // returning null keeps every consumer on its safe fallback until it is.
  return null;
}

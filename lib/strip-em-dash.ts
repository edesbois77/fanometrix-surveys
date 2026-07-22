// Enforce the standing "no em-dashes on the site" rule (user preference) on any
// AI-generated prose before it reaches the user. LLMs ignore the prompt
// instruction often, so this is the deterministic guarantee: every em-dash (or
// horizontal bar) becomes a comma. Hyphens (-) and en-dashes in number ranges are
// left alone so "30-somethings" and "16–24" survive.
export function stripEmDash(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\s*[—―]\s*/g, ", ") // em-dash / horizontal bar -> ", "
    .replace(/\s+,/g, ",")                    // tidy " ," -> ","
    .replace(/,\s*,/g, ",")                   // collapse ", ," -> ","
    .trim();
}

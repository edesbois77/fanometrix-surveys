// ── System-owned Thank-You (Fanometrix-controlled terminal frame) ────────────
// V1 product rule: NEW Survey Studio surveys end on a MANDATORY, system-owned
// Thank-You frame. Its copy is NOT authored per survey — it lives here, centrally
// controlled, and is shown in the survey's delivery language. Publishers cannot
// edit it. Historical/legacy surveys are unaffected (they keep their own authored
// thank-you); this treatment applies only to Studio-journey surveys — see
// `isSystemThankYouSurvey`.
//
// EXTENSIBILITY: the shape carries an optional `cta` slot so the terminal frame
// can later hold a centrally-controlled action (e.g. a Fanometrix Panel
// recruitment link). It is intentionally NULL in V1 — Panel recruitment has its
// own eligibility/privacy/identity/commercial requirements and is NOT activated
// here. Renderers must tolerate `cta: null` and render no CTA.

export interface SystemThankYou {
  title: string;
  body: string;
  cta: null; // reserved for a future centrally-controlled action; never set in V1
}

// Curated, reviewed translations for the common delivery languages. Any language
// without an entry falls back to English (resolveSystemThankYou). Expand centrally
// as delivery languages grow — this is the single source of truth.
const SYSTEM_THANKYOU: Record<string, { title: string; body: string }> = {
  en:      { title: "Thank you!",   body: "Your voice has been counted." },
  de:      { title: "Vielen Dank!", body: "Deine Stimme wurde gezählt." },
  fr:      { title: "Merci !",      body: "Votre voix a été comptée." },
  es:      { title: "¡Gracias!",    body: "Tu voz ha sido contada." },
  it:      { title: "Grazie!",      body: "La tua voce è stata registrata." },
  pt:      { title: "Obrigado!",    body: "A tua voz foi contabilizada." },
  nl:      { title: "Bedankt!",     body: "Je stem is meegeteld." },
  sv:      { title: "Tack!",        body: "Din röst har räknats." },
};

/** Resolve the system Thank-You for a delivery language, falling back to English. */
export function resolveSystemThankYou(lang: string | null | undefined): SystemThankYou {
  const copy = (lang && SYSTEM_THANKYOU[lang]) || SYSTEM_THANKYOU.en;
  return { title: copy.title, body: copy.body, cta: null };
}

/**
 * Whether a survey uses the system-owned Thank-You. The marker is that the survey
 * was authored through the new Survey Studio journey, which always sets
 * `intro_enabled` (true by default, or false if the publisher disabled the intro)
 * — a non-NULL value. Historical/legacy surveys have `intro_enabled = NULL` and
 * keep their own authored thank-you. This needs no schema: it reuses the existing
 * migration-182 column as the journey marker.
 */
export function isSystemThankYouSurvey(introEnabled: boolean | null | undefined): boolean {
  return introEnabled !== null && introEnabled !== undefined;
}

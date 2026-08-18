import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { translateTexts, isDeeplTranslatable } from "@/lib/deepl";

// ── Survey-scoped Publisher machine-translation ──────────────────────────────
// A NARROW translation path: an authorised editor may machine-translate the
// PUBLISHER-AUTHORED fan-facing content (question text, answer text, intro copy)
// of a survey they may edit, into one of that survey's established delivery
// languages. It is NOT a general DeepL capability (that stays admin-only at
// /api/translate).
//
// Boundary enforced (same trusted boundary as PUT /api/surveys/[id]):
//   • requireUser(["admin","publisher"]) — authenticated editor;
//   • non-admins must own the survey (organisation_id === Current Organisation);
//   • targetLang must be one of the survey's enabled_languages (established
//     delivery languages), must not be English, and must be DeepL-supported.
// The system-owned Thank-You is EXCLUDED here (it uses central translations, not
// this flow). The endpoint is GENERATE-ONLY: it returns translations and writes
// nothing, so it can never silently overwrite a reviewed translation — the client
// decides how to apply them (empty fields / explicit action).

type LocalisedText = Record<string, string> | null | undefined;
type StoredOption = { id: number; text: LocalisedText };
type StoredQuestion = { id: string; text: LocalisedText; options?: StoredOption[] };

function en(t: LocalisedText): string {
  if (!t || typeof t !== "object") return typeof t === "string" ? t : "";
  return t["en"] ?? "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: survey, error } = await supabaseAdmin
    .from("surveys")
    .select("organisation_id, questions, intro_title, intro_body, enabled_languages")
    .eq("id", id)
    .single();
  if (error || !survey) return NextResponse.json({ error: "Survey not found." }, { status: 404 });

  // Current Organisation boundary — identical to the survey edit boundary.
  if (session.role !== "admin" && survey.organisation_id !== session.organisationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const targetLang = typeof body?.targetLang === "string" ? body.targetLang : null;
  if (!targetLang) return NextResponse.json({ error: "targetLang is required." }, { status: 400 });
  if (targetLang === "en") {
    return NextResponse.json({ error: "English is the source language." }, { status: 400 });
  }

  // targetLang must be an ESTABLISHED delivery language for THIS survey.
  const enabled = Array.isArray(survey.enabled_languages) ? (survey.enabled_languages as string[]) : ["en"];
  if (!enabled.includes(targetLang)) {
    return NextResponse.json(
      { error: "That language is not one of this survey's delivery languages.", code: "language_not_authorised" },
      { status: 403 },
    );
  }
  if (!isDeeplTranslatable(targetLang)) {
    return NextResponse.json(
      { error: "That language must be translated manually.", code: "language_not_machine_translatable" },
      { status: 400 },
    );
  }

  // Collect the survey's Publisher-authored ENGLISH strings in a stable order,
  // recording where each came from so results map back precisely. Thank-You is
  // NOT included (system-owned).
  const questions = (Array.isArray(survey.questions) ? survey.questions : []) as StoredQuestion[];
  const texts: string[] = [];
  const slots: Array<{ kind: "q"; qi: number } | { kind: "o"; qi: number; oi: number } | { kind: "introTitle" } | { kind: "introBody" }> = [];

  questions.forEach((q, qi) => {
    const qt = en(q.text);
    if (qt.trim()) { texts.push(qt); slots.push({ kind: "q", qi }); }
    (q.options ?? []).forEach((o, oi) => {
      const ot = en(o.text);
      if (ot.trim()) { texts.push(ot); slots.push({ kind: "o", qi, oi }); }
    });
  });
  const introTitleEn = en(survey.intro_title as LocalisedText);
  if (introTitleEn.trim()) { texts.push(introTitleEn); slots.push({ kind: "introTitle" }); }
  const introBodyEn = en(survey.intro_body as LocalisedText);
  if (introBodyEn.trim()) { texts.push(introBodyEn); slots.push({ kind: "introBody" }); }

  if (texts.length === 0) {
    return NextResponse.json({ targetLang, questions: [], intro_title: "", intro_body: "" });
  }

  const result = await translateTexts(texts, targetLang);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Map translations back into a structure the client applies to its draft.
  const qOut: Array<{ id: string; text?: string; options: Array<{ id: number; text: string }> }> =
    questions.map((q) => ({ id: q.id, options: (q.options ?? []).map((o) => ({ id: o.id, text: "" })) }));
  let introTitle = "";
  let introBody = "";
  result.translations.forEach((tr, i) => {
    const slot = slots[i];
    if (slot.kind === "q") qOut[slot.qi].text = tr;
    else if (slot.kind === "o") qOut[slot.qi].options[slot.oi].text = tr;
    else if (slot.kind === "introTitle") introTitle = tr;
    else if (slot.kind === "introBody") introBody = tr;
  });

  return NextResponse.json({ targetLang, questions: qOut, intro_title: introTitle, intro_body: introBody });
}

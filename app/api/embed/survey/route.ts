// Public endpoint — no auth required.
// Returns resolved question content for a survey UUID so the embed iframe
// can render questions in the requested language without exposing raw
// localisation data or response data.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateSurvey } from "@/lib/survey-validation";
import { resolveQuestion, type LangCode, type LocalisedQuestion } from "@/lib/survey-locale";

export async function GET(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get("id");
  const lang = (req.nextUrl.searchParams.get("lang") ?? "en") as LangCode;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("surveys")
    .select("id, questions, thank_you_title, thank_you_body")
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  // Validate before serving — a survey that fails MPU limits must not reach a live embed
  const validationErrors = validateSurvey(data as Parameters<typeof validateSurvey>[0]);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "Survey failed MPU validation", reason: validationErrors[0] },
      { status: 404 }
    );
  }

  // Resolve localised questions to the requested language (falls back to en)
  const questions = ((data.questions ?? []) as LocalisedQuestion[]).map(q =>
    resolveQuestion(q, lang)
  );

  return NextResponse.json({
    questions,
    thank_you_title: data.thank_you_title ?? "Thank you!",
    thank_you_body:  data.thank_you_body  ?? "Your anonymous feedback helps improve the football experience for fans everywhere.",
  });
}

// Admin-only endpoint — translates arbitrary survey text via DeepL.
// (The Survey-scoped Publisher translate path lives at app/api/surveys/[id]/translate,
// which enforces Survey + Current Organisation + edit authorisation. This admin
// endpoint is the general one and stays admin-only.)
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { translateTexts } from "@/lib/deepl";

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json().catch(() => null);
  if (!body?.texts?.length || !body?.targetLang) {
    return NextResponse.json({ error: "texts (array) and targetLang are required." }, { status: 400 });
  }

  const result = await translateTexts(body.texts as string[], body.targetLang as string);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ translations: result.translations });
}

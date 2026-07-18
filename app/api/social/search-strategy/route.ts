// Generate a Search Strategy from a Conversation Search's intent. Stateless: it
// takes the current config in the body (so it works for both a new, unsaved
// search and an existing one) and returns the structured strategy for the config
// form to review, edit and save with the search. It does NOT persist — the
// search_strategy is saved as part of the normal search save (PUT/POST), and
// connectors do not consume it in Phase 1.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseSearchStrategy } from "@/lib/intelligence/analysts/analyseSearchStrategy";
import { IntelligenceError } from "@/lib/intelligence/types";

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json().catch(() => ({}));
  try {
    const strategy = await analyseSearchStrategy({
      researchQuestion: body.research_question ?? null,
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      researchGoal: body.research_goal ?? null,
      entityType: body.entity_type ?? null,
      markets: Array.isArray(body.markets) ? body.markets : [],
      languages: Array.isArray(body.languages) ? body.languages : [],
    });
    return NextResponse.json({ strategy });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to generate the search strategy." }, { status: 500 });
  }
}

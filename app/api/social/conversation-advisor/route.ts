// Generate a Conversation Advisor briefing from a research question. Stateless:
// it takes the question (+ optional commercial context / markets) in the body so
// it works for a new, unsaved search, and returns the full briefing —
// recommendation, information needs (themes), platform recommendations,
// limitations, challenges, and the subordinate search strategy — for the entry
// UI to review and approve. It does NOT persist; the briefing is saved as part
// of the normal search create (POST /api/social/searches) across the
// recommendation / information_needs / search_strategy columns.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseConversationAdvisor } from "@/lib/intelligence/analysts/analyseConversationAdvisor";
import { IntelligenceError } from "@/lib/intelligence/types";

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json().catch(() => ({}));
  try {
    const briefing = await analyseConversationAdvisor({
      researchQuestion: body.research_question ?? "",
      objective: body.objective ?? null,
      projectName: body.project_name ?? null,
      markets: Array.isArray(body.markets) ? body.markets : [],
      languages: Array.isArray(body.languages) ? body.languages : [],
      existingKeywords: Array.isArray(body.keywords) ? body.keywords : [],
    });
    return NextResponse.json({ briefing });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to generate the Conversation Advisor briefing." }, { status: 500 });
  }
}

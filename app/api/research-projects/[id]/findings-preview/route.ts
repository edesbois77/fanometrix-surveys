// Read-only findings PREVIEW for the Analysis homepage (the executive
// Intelligence Overview). It returns, per attached source, the most significant
// APPROVED findings so the homepage can preview intelligence without opening the
// full reader. It is strictly read-only: it reuses the existing stored outputs
// via getSummary and NEVER invokes an analyst engine or writes a draft — no
// summary is ever generated for this page. Only approved/published per-source
// rows are surfaced (Key Findings, which has no review lifecycle, is surfaced
// whenever it exists). Admin-gated, like every other findings read.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSummary } from "@/lib/intelligence/store";

const APPROVED = new Set(["approved", "published"]);

// The stored report content is schema-free JSONB; read defensively and never let
// a missing/stale field throw. current = edited_content ?? content.
function current(row: { content?: unknown; edited_content?: unknown } | null): Record<string, unknown> | null {
  if (!row) return null;
  const c = (row.edited_content ?? row.content) as Record<string, unknown> | null;
  return c && typeof c === "object" ? c : null;
}

function asStrings(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(x => (typeof x === "string" ? x : (x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : null)))
    .filter((x): x is string => !!x)
    .slice(0, limit);
}

type Preview = {
  status: string;
  generatedAt: string | null;
  headline?: string;
  executiveSummary?: string;
  evidenceStrength?: string;
  findings: string[];
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const { data: evidence } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id")
    .eq("research_project_id", id);

  const surveys: Record<string, Preview> = {};
  const conversations: Record<string, Preview> = {};
  const documents: Record<string, Preview> = {};

  for (const row of evidence ?? []) {
    if (row.evidence_type === "survey") {
      const r = await getSummary("survey", row.evidence_id, "research_summary");
      if (r && APPROVED.has(r.status)) {
        const c = current(r) ?? {};
        surveys[row.evidence_id] = {
          status: r.status, generatedAt: r.generated_at,
          headline: typeof c.headline === "string" ? c.headline : undefined,
          executiveSummary: typeof c.executive_summary === "string" ? c.executive_summary : undefined,
          findings: asStrings(c.key_findings, 3),
        };
      }
    } else if (row.evidence_type === "social_search") {
      const r = await getSummary("conversation_search", row.evidence_id, "research_summary");
      if (r && APPROVED.has(r.status)) {
        const c = current(r) ?? {};
        // Conversation "insights" = the substantive drivers and concerns.
        const insights = [...asStrings(c.positive_drivers, 3), ...asStrings(c.key_concerns, 3)].slice(0, 3);
        conversations[row.evidence_id] = {
          status: r.status, generatedAt: r.generated_at,
          headline: typeof c.headline === "string" ? c.headline : undefined,
          executiveSummary: typeof c.executive_summary === "string" ? c.executive_summary : undefined,
          findings: insights,
        };
      }
    } else if (row.evidence_type === "document") {
      const r = await getSummary("document_project", row.id, "research_summary");
      if (r && APPROVED.has(r.status)) {
        const c = current(r) ?? {};
        documents[row.id] = {
          status: r.status, generatedAt: r.generated_at,
          headline: typeof c.headline === "string" ? c.headline : undefined,
          executiveSummary: typeof c.executive_summary === "string" ? c.executive_summary : undefined,
          evidenceStrength: typeof c.evidence_strength === "string" ? c.evidence_strength : undefined,
          findings: asStrings(c.key_findings, 3),
        };
      }
    }
  }

  // Key Findings (project-level, cross-source) has no approval lifecycle — surface
  // it whenever it exists. No headline/executive summary in this output type.
  const kfRow = await getSummary("research_project", id, "key_findings");
  const kfContent = current(kfRow);
  const keyFindings = kfRow && kfContent
    ? { generatedAt: kfRow.generated_at, findings: asStrings(kfContent.findings, 5) }
    : null;

  return NextResponse.json({ data: { keyFindings, surveys, conversations, documents } });
}

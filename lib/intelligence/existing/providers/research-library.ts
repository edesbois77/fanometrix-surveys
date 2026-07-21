// Research Library provider (Project Intelligence) — surfaces the organisation's
// APPROVED library-document findings that bear on this project's research
// question (docs/existing-intelligence.md). Every finding is a real key finding
// from a real approved document, cited to that document, with evidence strength
// taken from the document's own research-quality assessment. Returns [] when the
// org has no approved library evidence — never fabricates.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyAspects } from "@/lib/intelligence/aspect-classify";
import type { IntelligenceProvider, IntelligenceContext, IntelligenceFinding, EvidenceStrength } from "@/lib/intelligence/existing/types";

const MAX_DOCS = 25;
const MAX_CANDIDATES = 30;      // cap before the (per-item) relevance judge
const MAX_FINDINGS = 6;         // cap what we surface
const RELEVANCE_MIN = 0.45;

// Document-level evidence rating → finding strength.
function mapStrength(raw: unknown): EvidenceStrength {
  const v = String(raw ?? "").toLowerCase();
  if (v === "robust") return "strong";
  if (v === "directional") return "moderate";
  return "limited";
}

type Candidate = { text: string; docId: string; docTitle: string; strength: EvidenceStrength };

export const researchLibraryProvider: IntelligenceProvider = {
  id: "research_library",
  name: "Research Library",
  category: "project",
  isAvailable: () => true,

  async retrieve(ctx: IntelligenceContext): Promise<IntelligenceFinding[]> {
    if (!ctx.orgId || !ctx.researchQuestion?.trim()) return [];

    // Approved, non-deleted library documents owned by the org.
    const { data: docs } = await supabaseAdmin
      .from("library_documents")
      .select("id, title")
      .eq("owner_org_id", ctx.orgId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("approved_at", { ascending: false })
      .limit(MAX_DOCS);
    if (!docs?.length) return [];

    const titleById = new Map<string, string>((docs as { id: string; title: string | null }[]).map(d => [d.id, d.title || "Untitled document"]));

    // Their current, approved analyses.
    const { data: analyses } = await supabaseAdmin
      .from("library_document_analysis")
      .select("library_document_id, content, edited_content")
      .in("library_document_id", Array.from(titleById.keys()))
      .eq("is_current", true)
      .eq("status", "approved");
    if (!analyses?.length) return [];

    // Flatten every approved key finding into a candidate, tagged with its doc.
    const candidates: Candidate[] = [];
    for (const row of analyses as { library_document_id: string; content: unknown; edited_content: unknown }[]) {
      const content = (row.edited_content ?? row.content) as Record<string, unknown> | null;
      if (!content) continue;
      const strength = mapStrength((content.research_quality as { evidence_strength?: unknown } | undefined)?.evidence_strength);
      const findings = Array.isArray(content.key_findings) ? content.key_findings : [];
      for (const kf of findings as { text?: unknown }[]) {
        const text = typeof kf?.text === "string" ? kf.text.trim() : "";
        if (text) candidates.push({ text, docId: row.library_document_id, docTitle: titleById.get(row.library_document_id) ?? "Document", strength });
      }
      if (candidates.length >= MAX_CANDIDATES) break;
    }
    if (!candidates.length) return [];

    // Keep only findings that genuinely bear on THIS research question.
    const judged = await classifyAspects(
      candidates.slice(0, MAX_CANDIDATES),
      c => ({ text: c.text, unitLabel: "a finding from an approved research document", researchQuestion: ctx.researchQuestion }),
    );

    const kept: IntelligenceFinding[] = [];
    for (const c of candidates) {
      const j = judged.get(c);
      if (!j || (j.relevance ?? 0) < RELEVANCE_MIN || j.research_aspect === "Off-topic") continue;
      kept.push({
        statement: c.text,
        detail: j.why_this_matters ?? null,
        strength: c.strength,
        aspect: j.research_aspect ?? null,
        sources: [{ provider: "Research Library", label: c.docTitle, href: `/research-library/${c.docId}`, ref: { kind: "library_document", id: c.docId } }],
      });
    }

    // Strongest, most relevant first — surface a focused set.
    const rank: Record<EvidenceStrength, number> = { strong: 3, moderate: 2, limited: 1 };
    return kept.sort((a, b) => rank[b.strength] - rank[a.strength]).slice(0, MAX_FINDINGS);
  },
};

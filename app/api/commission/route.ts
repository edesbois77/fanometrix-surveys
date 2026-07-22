// Commissioning — the pre-project analysis endpoint (Slice 2). No Research Project
// exists yet. It takes the client's material (described text, pasted email, or an
// uploaded PDF/DOCX brief), and returns Fanometrix's FIRST READ — the reframe (the
// point of view) plus the supporting understanding (the evidence behind it). The
// reframe is the star; the understanding is secondary.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { IntelligenceError } from "@/lib/intelligence/types";
import { analyseReframe } from "@/lib/intelligence/analysts/analyseReframe";
import { analyseBriefUnderstanding } from "@/lib/intelligence/analysts/analyseBriefUnderstanding";
import { extractPdf, extractDocx } from "@/lib/library-documents/extract-text";

const MAX_BYTES = 10 * 1024 * 1024;

async function extractBriefText(file: File): Promise<{ text: string; label: string }> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (ext === "pdf") { const r = await extractPdf(buf); return { text: r.pages.map(p => p.text).join("\n\n"), label: file.name }; }
  if (ext === "docx") { const r = await extractDocx(buf); return { text: r.sections.map(s => s.text).join("\n\n"), label: file.name }; }
  throw new IntelligenceError(415, "I can read a PDF or Word (.docx) brief — or just paste the text and I'll take it from there.");
}

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin", "publisher"]); } catch (err) { return err as Response; }

  try {
    // The commissioning material is everything the user gave us together: the
    // primary description plus any labelled fragments (email, notes, deadline,
    // asides) assembled client-side, plus the text of any attached documents.
    let material = "";
    let sourceLabel: string | null = null;
    let correction: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      material = typeof form.get("material") === "string" ? (form.get("material") as string) : "";
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      const docTexts: string[] = [];
      for (const file of files) {
        if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 10MB, paste the key parts instead and I'll work from those." }, { status: 413 });
        const extracted = await extractBriefText(file);
        docTexts.push(`DOCUMENT (${extracted.label}):\n${extracted.text}`);
      }
      material = [material, ...docTexts].filter(Boolean).join("\n\n");
      sourceLabel = files.length ? `${files[0].name}${files.length > 1 ? ` +${files.length - 1} more` : ""}` : "Described challenge";
    } else {
      const body = await req.json().catch(() => ({}));
      material = typeof body.material === "string" ? body.material : (typeof body.text === "string" ? body.text : "");
      sourceLabel = typeof body.source_label === "string" && body.source_label.trim() ? body.source_label.trim() : "Described challenge";
      correction = typeof body.correction === "string" && body.correction.trim() ? body.correction.trim() : null;
    }

    // The reframe is the point of view; the understanding is the evidence behind
    // it. Both reason from the commission (all the material together). A correction
    // (the client pushing back or answering a question) is folded into both.
    const understandingText = correction ? `${material}\n\nClient added: ${correction}` : material;
    const [reframe, understanding] = await Promise.all([
      analyseReframe({ text: material, correction }),
      analyseBriefUnderstanding({ briefText: understandingText, sourceLabel }),
    ]);

    return NextResponse.json({ reframe, understanding, source_label: sourceLabel, source_text: material });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Something went wrong reading that. Give it another go." }, { status: 500 });
  }
}

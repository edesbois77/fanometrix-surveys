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
    let text = "";
    let sourceLabel: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No brief file was provided." }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 10MB — paste the key parts instead and I'll work from those." }, { status: 413 });
      const extracted = await extractBriefText(file);
      text = extracted.text;
      sourceLabel = extracted.label;
    } else {
      const body = await req.json().catch(() => ({}));
      text = typeof body.text === "string" ? body.text : "";
      sourceLabel = typeof body.source_label === "string" && body.source_label.trim() ? body.source_label.trim() : null;
    }

    // The reframe is the point of view; the understanding is the evidence behind
    // it. Run both from the same material, in parallel.
    const [reframe, understanding] = await Promise.all([
      analyseReframe({ text }),
      analyseBriefUnderstanding({ briefText: text, sourceLabel }),
    ]);

    return NextResponse.json({ reframe, understanding, source_label: sourceLabel, source_text: text });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Something went wrong reading that. Give it another go." }, { status: 500 });
  }
}

// "Our Understanding" — the Overview commissioning endpoint (docs/overview-page.md).
//   POST: ingest a brief (a described challenge in JSON, or an uploaded PDF/DOCX),
//         reflect it back via the analyst, and save it to the project.
//   PUT:  save an edited / confirmed understanding (user refinements + the
//         shared-understanding gate).
// The understanding lives as jsonb on research_projects (migration 129).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { IntelligenceError } from "@/lib/intelligence/types";
import { analyseBriefUnderstanding } from "@/lib/intelligence/analysts/analyseBriefUnderstanding";
import { extractPdf, extractDocx } from "@/lib/library-documents/extract-text";
import type { ProjectUnderstanding } from "@/lib/understanding";

const MAX_BRIEF_BYTES = 10 * 1024 * 1024; // 10MB — briefs are small; large docs belong in the Library

type ProjectCtx = { project_name: string | null; research_question: string | null; objective: string | null };

async function loadCtx(id: string): Promise<ProjectCtx | null> {
  const { data } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, research_question, objective")
    .eq("id", id)
    .single<ProjectCtx>();
  return data ?? null;
}

// Pull plain text out of an uploaded brief. PDF + DOCX today (PPTX has no parser).
async function extractBriefText(file: File): Promise<{ text: string; label: string }> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (ext === "pdf") {
    const r = await extractPdf(buf);
    return { text: r.pages.map(p => p.text).join("\n\n"), label: file.name };
  }
  if (ext === "docx") {
    const r = await extractDocx(buf);
    return { text: r.sections.map(s => s.text).join("\n\n"), label: file.name };
  }
  throw new IntelligenceError(415, "Upload a PDF or Word (.docx) brief, or describe the challenge instead. (PowerPoint isn't supported yet.)");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  try {
    const ctx = await loadCtx(id);
    if (!ctx) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    let briefText = "";
    let sourceLabel: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No brief file was provided." }, { status: 400 });
      if (file.size > MAX_BRIEF_BYTES) return NextResponse.json({ error: "That brief is over 10MB — please upload a smaller file or describe the challenge." }, { status: 413 });
      const extracted = await extractBriefText(file);
      briefText = extracted.text;
      sourceLabel = extracted.label;
    } else {
      const body = await req.json().catch(() => ({}));
      briefText = typeof body.description === "string" ? body.description : "";
      sourceLabel = typeof body.source_label === "string" && body.source_label.trim() ? body.source_label.trim() : "Described challenge";
    }

    const understanding = await analyseBriefUnderstanding({
      briefText,
      projectName: ctx.project_name,
      existingQuestion: ctx.research_question,
      existingObjective: ctx.objective,
      sourceLabel,
    });

    const { error } = await supabaseAdmin.from("research_projects").update({ understanding, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ understanding });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't analyse the brief. Please try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const understanding = body.understanding as ProjectUnderstanding | undefined;
  if (!understanding || typeof understanding !== "object") {
    return NextResponse.json({ error: "No understanding to save." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("research_projects").update({ understanding, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ understanding });
}

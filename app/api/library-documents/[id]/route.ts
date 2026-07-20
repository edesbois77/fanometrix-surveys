// Single Library Document's own metadata — status polling while the
// automatic upload→extract→analyse pipeline runs, plus the approved,
// queryable fields once past that. The richer analysis content lives at
// the sibling analysis/route.ts, not here.
//
// GET is readable by any authenticated user (a library_document surfaces
// read-only inside any Research Project that attaches it). PATCH edits the
// human-editable metadata and is restricted to admins + publishers (the
// research curators / "project owner-manager" role) — see the audit +
// title-lock notes on PATCH below.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { createDownloadUrl } from "@/lib/library-documents/storage";
import { isDocumentType, isConfidentiality, normaliseTag, MAX_DOCUMENT_TAGS } from "@/lib/library-documents/constants";
import { isOwner, isVisibility, isLearningPermission, isAIAccess } from "@/lib/library-documents/governance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req); } catch (err) { return err as Response; }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("library_documents")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  // How many Research Projects attach this document as evidence — surfaced
  // before an edit so it's clear the record is shared, not a project copy.
  // Best-effort: a count failure must never break the metadata response.
  let projectUsageCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from("research_project_evidence")
      .select("id", { count: "exact", head: true })
      .eq("evidence_type", "document")
      .eq("evidence_id", id);
    projectUsageCount = count ?? 0;
  } catch {
    projectUsageCount = 0;
  }

  // Best-effort — a missing/expired file must never break the metadata
  // response, since the original document may legitimately still be
  // uploading (status='uploaded') the first time this is polled.
  let previewUrl: string | null = null;
  try {
    previewUrl = await createDownloadUrl(data.storage_path);
  } catch {
    previewUrl = null;
  }

  return NextResponse.json({ data: { ...data, preview_url: previewUrl, project_usage_count: projectUsageCount } });
}

// Edit a document's human-owned metadata: display title, document type,
// confidentiality and a free-text description. The original filename,
// status, file and AI-extracted fields are NOT editable here.
//
// Governance: a library_document is one GLOBAL record shared by every
// project that attaches it, so every change applies everywhere — the UI
// says so, and confidentiality changes are confirmed there. Each changed
// field is written to library_document_audit (old → new, who, when, and
// which project it was edited from). Editing the title also sets
// title_manually_edited so the AI-analysis approval step can never
// overwrite a human title (mirrors how document_type is already protected
// in promote-approved-metadata.ts).
//
// Permissions: admins + publishers only. Other roles get 403 (read-only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch (err) { return err as Response; }

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const { data: current, error: loadErr } = await supabaseAdmin
    .from("library_documents")
    .select("title, author, document_type, confidentiality, description, tags, owner, owner_org_id, visibility, learning_permission, ai_access")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (loadErr || !current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  const audits: { field: string; old_value: string | null; new_value: string | null }[] = [];

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    const title = body.title.trim();
    if (title !== current.title) {
      update.title = title;
      update.title_manually_edited = true; // lock against AI overwrite on approval
      audits.push({ field: "title", old_value: current.title, new_value: title });
    }
  }

  if (body.author !== undefined) {
    const author = typeof body.author === "string" && body.author.trim() ? body.author.trim() : null;
    if (author !== (current.author ?? null)) {
      update.author = author;
      update.author_manually_edited = true; // lock against AI overwrite on approval
      audits.push({ field: "author", old_value: current.author ?? null, new_value: author });
    }
  }

  if (body.document_type !== undefined) {
    if (!isDocumentType(body.document_type)) return NextResponse.json({ error: "Invalid document type." }, { status: 400 });
    if (body.document_type !== current.document_type) {
      update.document_type = body.document_type;
      audits.push({ field: "document_type", old_value: current.document_type, new_value: body.document_type });
    }
  }

  if (body.confidentiality !== undefined) {
    if (!isConfidentiality(body.confidentiality)) return NextResponse.json({ error: "Invalid confidentiality." }, { status: 400 });
    if (body.confidentiality !== current.confidentiality) {
      update.confidentiality = body.confidentiality;
      audits.push({ field: "confidentiality", old_value: current.confidentiality, new_value: body.confidentiality });
    }
  }

  // ── Governance (docs/governance-model.md) — ownership / visibility / learning
  //    / AI access. Each is an independent access-control field, validated and
  //    audited exactly like confidentiality above. ──────────────────────────────
  if (body.owner !== undefined) {
    if (!isOwner(body.owner)) return NextResponse.json({ error: "Invalid owner." }, { status: 400 });
    if (body.owner !== current.owner) {
      update.owner = body.owner;
      audits.push({ field: "owner", old_value: current.owner, new_value: body.owner });
    }
  }
  if (body.owner_org_id !== undefined) {
    const orgId = typeof body.owner_org_id === "string" && body.owner_org_id.trim() ? body.owner_org_id.trim() : null;
    if (orgId !== (current.owner_org_id ?? null)) {
      update.owner_org_id = orgId;
      audits.push({ field: "owner_org_id", old_value: current.owner_org_id ?? null, new_value: orgId });
    }
  }
  if (body.visibility !== undefined) {
    if (!isVisibility(body.visibility)) return NextResponse.json({ error: "Invalid visibility." }, { status: 400 });
    if (body.visibility !== current.visibility) {
      update.visibility = body.visibility;
      audits.push({ field: "visibility", old_value: current.visibility, new_value: body.visibility });
    }
  }
  if (body.learning_permission !== undefined) {
    if (!isLearningPermission(body.learning_permission)) return NextResponse.json({ error: "Invalid learning permission." }, { status: 400 });
    if (body.learning_permission !== current.learning_permission) {
      update.learning_permission = body.learning_permission;
      audits.push({ field: "learning_permission", old_value: current.learning_permission, new_value: body.learning_permission });
    }
  }
  if (body.ai_access !== undefined) {
    if (!isAIAccess(body.ai_access)) return NextResponse.json({ error: "Invalid AI access." }, { status: 400 });
    if (body.ai_access !== current.ai_access) {
      update.ai_access = body.ai_access;
      audits.push({ field: "ai_access", old_value: current.ai_access, new_value: body.ai_access });
    }
  }

  if (body.description !== undefined) {
    const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
    if (description !== (current.description ?? null)) {
      update.description = description;
      update.description_manually_edited = true; // lock against AI overwrite on approval
      audits.push({ field: "description", old_value: current.description ?? null, new_value: description });
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return NextResponse.json({ error: "Tags must be a list." }, { status: 400 });
    // Normalise, dedupe (case-insensitively, keeping first spelling), cap.
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const raw of body.tags) {
      const t = normaliseTag(raw);
      if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); tags.push(t); }
      if (tags.length >= MAX_DOCUMENT_TAGS) break;
    }
    const currentTags = (current.tags ?? []) as string[];
    if (tags.join("") !== currentTags.join("")) {
      update.tags = tags;
      update.tags_manually_edited = true; // lock against AI overwrite on approval
      audits.push({ field: "tags", old_value: currentTags.join(", ") || null, new_value: tags.join(", ") || null });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ data: null, unchanged: true });
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("library_documents")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (updErr || !updated) return NextResponse.json({ error: updErr?.message ?? "Couldn't save changes." }, { status: 500 });

  // Append-only audit. Best-effort — never fail a saved edit if the log
  // write hiccups, but attempt it synchronously so the common path records.
  const projectContext = typeof body.project_context === "string" ? body.project_context : null;
  if (audits.length) {
    await supabaseAdmin.from("library_document_audit").insert(
      audits.map(a => ({
        library_document_id: id,
        field: a.field,
        old_value: a.old_value,
        new_value: a.new_value,
        changed_by: session.workEmail,
        project_context: projectContext,
      }))
    );
  }

  let previewUrl: string | null = null;
  try { previewUrl = await createDownloadUrl(updated.storage_path); } catch { previewUrl = null; }

  return NextResponse.json({ data: { ...updated, preview_url: previewUrl } });
}

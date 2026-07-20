// Research Library — Uploaded Documents. Admin-only in v1 (see
// supabase-migration-099.sql's confidentiality column comment: captured
// now, not yet enforced differentially — the whole Library stays
// admin-only end to end until self-service access is a real requirement).
//
// POST creates the library_documents row and returns a signed upload
// ticket — it never receives the file's bytes itself. See
// lib/library-documents/storage.ts for why (this Next.js version's proxy
// layer silently truncates request bodies past 10MB by default, and
// documents go up to 25MB).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, isDocumentType } from "@/lib/library-documents/constants";
import { buildStoragePath, createUploadTicket } from "@/lib/library-documents/storage";
import { canAttachDocumentToProject, type GovernedDocument } from "@/lib/library-documents/governance";

function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return base.trim() || filename;
}

// Keyword + metadata search/filter for the Research Library list page.
// Keyword (`q`) hits the trigger-maintained `search_vector` column (title,
// publisher, tags, topics, brands, markets, sports_competitions all folded
// in — see supabase-migration-099.sql's set_library_documents_search_vector),
// so a single search box already covers every metadata dimension without a
// separate filter control for each one. `document_type`/`status` are exact
// matches; `tag` (repeatable) is an any-match overlap, not "must have all",
// since narrowing to one shared tag is the common case.
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const documentType = searchParams.get("document_type")?.trim();
  const status = searchParams.get("status")?.trim();
  const tags = searchParams.getAll("tag").map(t => t.trim()).filter(Boolean);
  // When attaching from within a project, only offer documents whose governance
  // permits attachment to THAT project (org-restricted docs stay hidden elsewhere).
  const projectId = searchParams.get("project_id")?.trim();

  let query = supabaseAdmin
    .from("library_documents")
    .select("id, title, document_type, status, error_message, original_filename, page_count, uploaded_by, uploaded_at, approved_at, tags, owner, owner_org_id, confidentiality, visibility, learning_permission, ai_access")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (q) query = query.textSearch("search_vector", q, { type: "websearch", config: "english" });
  if (documentType) query = query.eq("document_type", documentType);
  if (status) query = query.eq("status", status);
  if (tags.length > 0) query = query.overlaps("tags", tags);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (projectId) {
    const { data: project } = await supabaseAdmin
      .from("research_projects")
      .select("brand_org_id, agency_org_id, publisher_org_ids")
      .eq("id", projectId).maybeSingle();
    if (project) rows = rows.filter(d => canAttachDocumentToProject(d as GovernedDocument, project));
  }
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { original_filename, mime_type, file_size_bytes, document_type } = body;

  if (typeof original_filename !== "string" || !original_filename.trim()) {
    return NextResponse.json({ error: "original_filename is required." }, { status: 400 });
  }
  const ext = ALLOWED_MIME_TYPES[mime_type];
  if (!ext) {
    return NextResponse.json({ error: "Only PDF and DOCX documents are supported in this release." }, { status: 400 });
  }
  if (typeof file_size_bytes !== "number" || file_size_bytes <= 0) {
    return NextResponse.json({ error: "file_size_bytes is required." }, { status: 400 });
  }
  if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `Documents must be smaller than ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` }, { status: 400 });
  }
  if (document_type !== undefined && !isDocumentType(document_type)) {
    return NextResponse.json({ error: "Invalid document_type." }, { status: 400 });
  }

  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath(documentId, ext);

  const { data: inserted, error } = await supabaseAdmin
    .from("library_documents")
    .insert([{
      id: documentId,
      title: titleFromFilename(original_filename),
      ...(document_type ? { document_type } : {}),
      status: "uploaded",
      storage_path: storagePath,
      original_filename,
      mime_type,
      file_size_bytes,
      uploaded_by: session.workEmail,
    }])
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Failed to create the document record." }, { status: 500 });
  }

  try {
    const ticket = await createUploadTicket(storagePath);
    return NextResponse.json({
      data: { id: inserted.id, upload_url: ticket.signedUrl, upload_token: ticket.token, path: ticket.path },
    }, { status: 201 });
  } catch (err) {
    // The row exists but has no usable upload ticket — surface the failure
    // rather than leaving the client to guess; the row stays in 'uploaded'
    // with no file behind it, which confirm-upload's existence check will
    // correctly refuse to move past.
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create an upload URL." }, { status: 500 });
  }
}

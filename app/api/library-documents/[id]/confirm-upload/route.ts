// Called by the client immediately after its direct-to-Storage upload
// (see lib/library-documents/storage.ts) completes — this app never sees
// the file's bytes, so it has no other way to know the upload actually
// landed. Confirms the object exists at the row's own storage_path, then
// kicks off extraction (lib/library-documents/run-extraction.ts) after the
// response is sent — same after()-then-poll-status shape
// createSimulated()/runSimulationGeneration already use in
// app/api/research-projects/route.ts. Extraction currently hands the
// document off in 'analysing' status with nothing yet consuming it — the
// next pipeline stage (global document analysis) picks that trigger point
// up once it ships, rather than this route growing a second responsibility.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { objectExists } from "@/lib/library-documents/storage";
import { runExtraction } from "@/lib/library-documents/run-extraction";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from("library_documents")
    .select("id, status, storage_path")
    .eq("id", id)
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status !== "uploaded") {
    return NextResponse.json({ data: { status: doc.status } });
  }

  const exists = await objectExists(doc.storage_path);
  if (!exists) {
    return NextResponse.json({ error: "Upload did not complete — the file wasn't found in storage. Try uploading again." }, { status: 409 });
  }

  after(() => runExtraction(id));

  return NextResponse.json({ data: { status: "uploaded" } });
}

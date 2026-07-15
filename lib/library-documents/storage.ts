// Server-only. Signed-URL helpers for the private library-documents Storage
// bucket (supabase-migration-100.sql). Deliberately NOT the
// proxy-through-our-own-API-route pattern report-images/route.ts uses —
// that pattern reads the file into this Next.js app's own request body via
// req.formData(), which this Next.js version's proxy layer (the renamed
// middleware.ts — see next/dist/docs/.../version-16.md, "middleware to
// proxy") buffers into memory up to `proxyClientMaxBodySize` (10MB by
// default, configured globally in next.config.ts, not per-route) — past
// that limit the body is silently truncated, not rejected, per Next's own
// docs. report-images gets away with the proxied pattern only because it
// caps uploads at 8MB; library documents go up to 25MB, so that same
// pattern would risk silently corrupting a valid upload. Instead, the
// browser uploads directly to Supabase Storage using a short-lived signed
// upload URL minted here (service-role only) — the file's bytes never pass
// through this app's own request handling at all.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LIBRARY_DOCUMENTS_BUCKET } from "@/lib/library-documents/constants";

export function buildStoragePath(libraryDocumentId: string, ext: string): string {
  return `${libraryDocumentId}/original.${ext}`;
}

export function buildPageImagePath(libraryDocumentId: string, pdfPageNumber: number): string {
  return `${libraryDocumentId}/pages/${pdfPageNumber}.png`;
}

/** Server-side direct upload (via the service-role client, not a signed
 * URL) — unlike the original document upload, this is our own server code
 * calling Supabase directly with an already-in-memory buffer, never a
 * bytes-through-this-app's-own-request-body path, so the proxy body-size
 * concern above doesn't apply here. upsert:true — a re-render (e.g.
 * "Re-analyse") legitimately overwrites the same page's image. */
export async function uploadPageImage(libraryDocumentId: string, pdfPageNumber: number, data: Buffer): Promise<string> {
  const path = buildPageImagePath(libraryDocumentId, pdfPageNumber);
  const { error } = await supabaseAdmin.storage
    .from(LIBRARY_DOCUMENTS_BUCKET)
    .upload(path, data, { contentType: "image/png", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** One-time upload authorisation for a specific path — the token is what
 * authorises the browser's direct-to-Supabase upload, not the browser's
 * own session, so this never needs a Storage RLS policy granting broader
 * write access (the bucket has none, see migration 100). */
export async function createUploadTicket(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await supabaseAdmin.storage
    .from(LIBRARY_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Failed to create an upload URL.");
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/** Confirms the object actually landed at `path` after the browser's direct
 * upload — the API can't otherwise know the upload succeeded, since the
 * bytes never passed through it. */
export async function objectExists(path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  const { data, error } = await supabaseAdmin.storage.from(LIBRARY_DOCUMENTS_BUCKET).list(folder);
  if (error || !data) return false;
  return data.some(f => f.name === filename);
}

/** Short-lived signed read URL — every download/preview goes through this,
 * never a public URL (the bucket has no public-read policy at all). */
export async function createDownloadUrl(path: string, expiresInSeconds = 600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(LIBRARY_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "Failed to create a download URL.");
  return data.signedUrl;
}

/** Never called on a soft delete (library_documents.deleted_at) — only for
 * a genuine hard-delete path, which doesn't exist yet in v1. See
 * migration 099's header comment on deletion behaviour. */
export async function removeStoredFile(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(LIBRARY_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/** Server-side read of the file's actual bytes — used by extraction, never
 * exposed to the client (which only ever gets short-lived signed URLs). */
export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(LIBRARY_DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "Failed to download the stored file.");
  return Buffer.from(await data.arrayBuffer());
}

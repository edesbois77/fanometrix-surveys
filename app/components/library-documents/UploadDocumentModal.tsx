"use client";

// Upload entry point for the Research Library. File bytes go straight from
// the browser to Supabase Storage using a signed upload URL minted by
// POST /api/library-documents — never through this app's own request body
// (see lib/library-documents/storage.ts's header comment for why: the
// proxy layer this Next.js version's middleware runs as silently truncates
// request bodies past 10MB by default, and documents go up to 25MB). The
// browser talks to Supabase directly here using the existing anon-key
// client (lib/supabase.ts) — a deliberate, narrow exception to this app's
// otherwise-universal "everything goes through our own API routes"
// convention, made only for this one upload step; every read of a
// document (metadata, analysis, search) still goes through this app's own
// API exactly as everywhere else does.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DOCUMENT_TYPES, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, type DocumentType } from "@/lib/library-documents/constants";

const ACCEPT = Object.keys(ALLOWED_MIME_TYPES).join(",");

export function UploadDocumentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function pickFile(f: File) {
    setError("");
    if (!ALLOWED_MIME_TYPES[f.type]) {
      setError("Only PDF and DOCX documents are supported.");
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(`File must be smaller than ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true); setError("");

    try {
      const createRes = await fetch("/api/library-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_filename: file.name,
          mime_type: file.type,
          file_size_bytes: file.size,
          document_type: documentType,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? "Failed to start the upload.");

      const { id, path, upload_token } = createJson.data;

      const { error: uploadError } = await supabase.storage
        .from("library-documents")
        .uploadToSignedUrl(path, upload_token, file);
      if (uploadError) throw new Error(uploadError.message);

      const confirmRes = await fetch(`/api/library-documents/${id}/confirm-upload`, { method: "POST" });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmJson.error ?? "Upload didn't complete.");

      router.push(`/research-library/${id}`);
    } catch (err) {
      setUploading(false);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">Upload Document</h2>
          <button onClick={onClose} disabled={uploading} className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-40">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Document Type</label>
            <select value={documentType} onChange={e => setDocumentType(e.target.value as DocumentType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]">
              {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">File</label>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
              className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-gray-300 hover:border-[#D7B87A] hover:bg-[#D7B87A]/5 transition-colors disabled:opacity-50">
              {file ? (
                <span className="text-sm text-gray-800">{file.name} <span className="text-gray-400">({Math.round(file.size / 1024)} KB)</span></span>
              ) : (
                <span className="text-sm text-gray-400">Click to choose a PDF or DOCX file (max {MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB)</span>
              )}
            </button>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={handleUpload} disabled={!file || uploading}
            className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40"
            style={{ background: "#0B1929", color: "#D7B87A" }}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

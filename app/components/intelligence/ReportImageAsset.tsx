"use client";

// Reusable image upload/picker for report content — infrastructure for
// the forthcoming Editorial Article (and potentially other report types
// later). Not wired into any existing report yet; uploads go through
// app/api/report-images/route.ts into the "report-images" Storage bucket
// (supabase-migration-097.sql).
import { useRef, useState } from "react";

export type ReportImage = {
  url: string;
  path: string;
  content_type: string;
  size: number;
  caption?: string;
  /** Attribution/source line, distinct from the caption — e.g. "Getty
   * Images" or "Fanometrix survey visualisation", not what the image
   * depicts. */
  credit?: string;
  uploaded_by: string;
  uploaded_at: string;
};

export function ReportImageAsset({
  value, onChange, disabled, recommendedSize,
}: {
  value: ReportImage | null;
  onChange: (image: ReportImage | null) => void;
  disabled?: boolean;
  /** Short hint shown next to the upload button before an image is
   * attached, e.g. "Recommended: 1600×900px". Purely advisory copy, not
   * enforced — the upload route only validates file type/size, never
   * dimensions. Omit for no hint. */
  recommendedSize?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setUploading(true); setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/report-images", { method: "POST", body: formData });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) { setError(json.error ?? "Failed to upload image."); return; }
    onChange(json.data as ReportImage);
  }

  async function handleRemove() {
    if (!value) return;
    await fetch(`/api/report-images?path=${encodeURIComponent(value.path)}`, { method: "DELETE" });
    onChange(null);
  }

  return (
    <div>
      {value ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a static local asset */}
          <img src={value.url} alt={value.caption ?? ""} className="max-w-full rounded-lg border border-gray-200" />
          <div className="flex items-center gap-2 mt-2">
            <input value={value.caption ?? ""} placeholder="Caption (optional)" disabled={disabled}
              onChange={e => onChange({ ...value, caption: e.target.value })}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" />
            {!disabled && (
              <button type="button" onClick={handleRemove}
                className="text-xs font-semibold text-red-400 hover:text-red-500 hover:underline flex-shrink-0">
                Remove
              </button>
            )}
          </div>
          <input value={value.credit ?? ""} placeholder="Credit / source (optional)" disabled={disabled}
            onChange={e => onChange({ ...value, credit: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm mt-2 focus:outline-none focus:border-[#D7B87A]" />
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
            {uploading ? "Uploading…" : "+ Add Image"}
          </button>
          {recommendedSize && <span className="text-xs text-gray-400">{recommendedSize}</span>}
        </div>
      )}
      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

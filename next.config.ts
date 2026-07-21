import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Allows loading the dev server from another device on the same
  // Wi-Fi network (e.g. testing on a phone via http://<lan-ip>:3000)
  // without Next.js blocking HMR/hydration as a cross-origin request.
  allowedDevOrigins: ["10.0.0.8"],

  // pdf-parse (lib/library-documents/extract-text.ts) wraps pdfjs-dist,
  // which loads its own PDF-parsing worker via a path relative to its own
  // module location. Left to Next's default server bundling, pdfjs-dist
  // gets chunked into .next/dev/server/chunks/... at a path that no longer
  // matches what it expects, so it fails with "Setting up fake worker
  // failed: Cannot find module .../pdf.worker.mjs". Excluding both
  // packages from bundling makes Next load them via native Node `require`
  // from their real node_modules location instead, where that relative
  // resolution (and the explicit PDFParse.setWorker() override in
  // extract-text.ts) works correctly. Applies in both `next dev` and
  // `next build` — this option isn't dev-only.
  // @napi-rs/canvas is a native (.node) module — pdf-parse's canvas backend and
  // the source of our DOMMatrix/Path2D/ImageData polyfills (lib/library-documents/
  // pdf-polyfills.ts). It must load via native Node resolution, never be bundled.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;

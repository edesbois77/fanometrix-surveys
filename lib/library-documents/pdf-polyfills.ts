// pdfjs-dist 5.x (bundled by pdf-parse) references the browser globals
// DOMMatrix, Path2D and ImageData at MODULE-EVALUATION time. The Node runtime
// Vercel uses has none of them, so importing pdf-parse there throws
// "ReferenceError: DOMMatrix is not defined" (surfacing as "Failed to load
// external module pdf-parse") before any of our code runs.
//
// pdf-parse already depends on @napi-rs/canvas — a prebuilt native canvas that
// ships real implementations of exactly these classes (and a Linux x64 binary
// for Vercel). We install them onto globalThis here so pdfjs finds them.
//
// This module has NO exports; it exists purely for its side effect and MUST be
// imported BEFORE pdf-parse. ES module evaluation is depth-first in source
// order, so an `import "./pdf-polyfills"` placed above `import "pdf-parse"`
// runs first — see extract-text.ts. Guarded with `typeof` checks so a runtime
// that already provides these (e.g. a future Node, or the browser build) is
// left untouched.
import { DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = DOMMatrix;
if (typeof g.Path2D === "undefined") g.Path2D = Path2D;
if (typeof g.ImageData === "undefined") g.ImageData = ImageData;

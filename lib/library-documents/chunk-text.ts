// Packs extracted pages/sections (extract-text.ts) into library_document_
// chunks rows. Deliberately never merges text across a page or section
// boundary into one chunk, even when both are short enough to fit the same
// budget — a chunk's page_start/page_end (or section_label) must always
// describe exactly what it contains, since this is what gives Document
// Intelligence findings a real, citable provenance reference. The cost is
// a few more, smaller rows for short pages; the benefit is that a citation
// is never a range wider than what was actually read.
export type ChunkRow = {
  page_start: number | null;
  page_end: number | null;
  section_label: string | null;
  chunk_text: string;
};

// ~1,500 tokens at a rough 4 chars/token — generous enough for a
// completeJSON prompt to reference a handful of chunks at once without
// blowing past gpt-4o's context budget, small enough to keep citations
// specific.
const MAX_CHUNK_CHARS = 6000;

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

/** Packs paragraphs from ONE page/section into one or more pieces, never
 * exceeding MAX_CHUNK_CHARS except when a single paragraph alone is over
 * budget, which is hard-split as a last resort rather than dropped. */
function packParagraphs(paragraphs: string[]): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }
    if (current) pieces.push(current);
    if (para.length <= MAX_CHUNK_CHARS) {
      current = para;
    } else {
      for (let i = 0; i < para.length; i += MAX_CHUNK_CHARS) pieces.push(para.slice(i, i + MAX_CHUNK_CHARS));
      current = "";
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkPdfPages(pages: { num: number; text: string }[]): ChunkRow[] {
  const chunks: ChunkRow[] = [];
  for (const page of pages) {
    for (const piece of packParagraphs(splitParagraphs(page.text))) {
      chunks.push({ page_start: page.num, page_end: page.num, section_label: null, chunk_text: piece });
    }
  }
  return chunks;
}

export function chunkDocxSections(sections: { label: string | null; text: string }[]): ChunkRow[] {
  const chunks: ChunkRow[] = [];
  for (const section of sections) {
    for (const piece of packParagraphs(splitParagraphs(section.text))) {
      chunks.push({ page_start: null, page_end: null, section_label: section.label, chunk_text: piece });
    }
  }
  return chunks;
}

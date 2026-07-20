// Server-only. Reads an uploaded IMAGE document (PNG/JPEG — a screenshot,
// infographic, chart or scanned page) with the vision model and returns its full
// content as text. Unlike a PDF/DOCX there is no text layer to extract, so the
// vision model IS the extraction: it transcribes every readable word and
// describes any charts/tables so the result can be analysed exactly like a
// text document downstream (chunks → run-analysis).
import { completeJSON } from "@/lib/intelligence/openai";

const PROMPT = `You are reading a single image uploaded as a research document — typically a screenshot of an article, an infographic, a chart, or a scanned page.

Capture its FULL content so it can be analysed as a document:
- Transcribe ALL readable text faithfully, in reading order — headline, standfirst, body copy, captions, pull-quotes, data labels, figures and percentages, footnotes, source lines.
- For any chart, table or diagram, describe what it shows and include the concrete numbers/labels it presents.
- Do NOT summarise, paraphrase or omit — reproduce the content itself. If some text is unreadable, note "[illegible]" rather than guessing.

Return ONLY valid JSON: { "content": "the full transcribed and described content" }`;

export async function extractImageContent(buffer: Buffer, mimeType: string): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const raw = await completeJSON<{ content?: unknown }>({
    prompt: PROMPT,
    model: "gpt-4o",
    temperature: 0.1,
    maxTokens: 3000,
    images: [{ dataUrl, detail: "high" }],
  });
  return (typeof raw.content === "string" ? raw.content : "").trim();
}

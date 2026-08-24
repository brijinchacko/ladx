/**
 * Getting the words out of whatever the client sent.
 *
 * A control project arrives as documents somebody else wrote: a URS as a PDF, a
 * scope as a Word file, an I/O schedule as a spreadsheet export. Every fact the
 * platform wants is already in them, and asking an engineer to retype it into a
 * form is asking them to do the work twice.
 *
 * Runs in the browser, deliberately. The file never leaves the machine to be
 * read, which matters when the document is a client's specification under NDA,
 * and it keeps a 40 MB drawing pack off the server entirely. Only the extracted
 * text is sent anywhere, and only when the user asks for it to be.
 *
 * PDF is the format that actually needed work: pdf.js is loaded on demand, so
 * it costs nothing until somebody drops a PDF. DOCX is a zip with one XML file
 * in it, which the platform can open itself with DecompressionStream rather
 * than carrying a second library for.
 */

export interface ExtractedDocument {
  name: string;
  text: string;
  /** Pages for a PDF, paragraphs for a Word file, lines otherwise. */
  units: number;
  kind: "pdf" | "docx" | "text" | "csv";
}

export class UnsupportedDocument extends Error {
  constructor(ext: string) {
    super(
      ext === "doc"
        ? "Old .doc files cannot be read here. Save it as .docx or PDF first."
        : `Cannot read a ${ext ? `.${ext}` : "file of that type"} here. PDF, Word, text, markdown and CSV all work.`,
    );
    this.name = "UnsupportedDocument";
  }
}

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
  "st",
  "scl",
  "l5x",
  "sr",
  "exp",
]);

/** Everything this accepts, for an input's `accept` attribute. */
export const ACCEPTED_DOCUMENTS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".st",
  ".scl",
  ".l5x",
].join(",");

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export async function extractText(file: File): Promise<ExtractedDocument> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / 1_000_000)} MB. The limit is ${MAX_DOCUMENT_BYTES / 1_000_000} MB.`,
    );
  }

  const ext = extensionOf(file.name);

  if (ext === "pdf") return extractPdf(file);
  if (ext === "docx") return extractDocx(file);
  if (TEXT_EXT.has(ext) || file.type.startsWith("text/")) {
    const text = await file.text();
    return {
      name: file.name,
      text: normalise(text),
      units: text.split("\n").length,
      kind: ext === "csv" || ext === "tsv" ? "csv" : "text",
    };
  }

  throw new UnsupportedDocument(ext);
}

/* ────────────────────────────── PDF ────────────────────────────── */

/**
 * Text, page by page, with the page breaks kept.
 *
 * The breaks matter: a specification's section numbering is the thing that
 * makes an extracted requirement traceable, and a wall of text with the page
 * boundaries dissolved loses the only reference anybody can check against.
 */
async function extractPdf(file: File): Promise<ExtractedDocument> {
  // Loaded here rather than at module scope: it is a large library and most
  // sessions never open a PDF.
  const pdfjs = await import("pdfjs-dist");
  // The worker ships with the package; pointing at it as a module URL keeps it
  // bundled rather than fetched from a CDN, which the CSP would refuse anyway.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(`--- page ${n} ---\n${line}`);
    page.cleanup();
  }
  await doc.destroy();

  const text = pages.join("\n\n");
  if (!text.replace(/--- page \d+ ---/g, "").trim()) {
    throw new Error(
      "No text in that PDF. It is probably a scan, which needs OCR before anything can read it.",
    );
  }

  return { name: file.name, text: normalise(text), units: doc.numPages, kind: "pdf" };
}

/* ────────────────────────────── DOCX ────────────────────────────── */

/**
 * A .docx is a zip. The document body is one entry inside it.
 *
 * Only the stored and deflated entries matter, which is every entry Word
 * actually writes. Rather than carry a zip library, the central directory is
 * read directly and the one file needed is inflated with the platform's own
 * DecompressionStream.
 */
async function extractDocx(file: File): Promise<ExtractedDocument> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await readZipEntry(buf, "word/document.xml");
  if (!xml) {
    throw new Error("That .docx has no document body. It may be corrupt, or not a Word file.");
  }

  // Paragraph and line breaks become newlines before the tags are stripped, or
  // the whole document collapses into one line and every heading is lost.
  const withBreaks = xml
    .replace(/<w:p[\s>]/g, "\n<w:p ")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, "\t");

  const text = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  if (!text.trim()) throw new Error("That Word file appears to be empty.");

  return {
    name: file.name,
    text: normalise(text),
    units: text.split("\n").filter(Boolean).length,
    kind: "docx",
  };
}

/** One entry from a zip, by name, or null. */
async function readZipEntry(buf: Uint8Array, wanted: string): Promise<string | null> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // The end-of-central-directory record is at the tail, after a comment of
  // unknown length, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));

    if (name === wanted) {
      // The local header repeats the name and extra fields with its own lengths.
      const lnameLen = view.getUint16(localOffset + 26, true);
      const lextraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lnameLen + lextraLen;
      const bytes = buf.subarray(start, start + compressedSize);

      if (method === 0) return decoder.decode(bytes);
      if (method === 8) {
        const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(
          // Raw deflate: a zip entry carries no zlib header.
          new DecompressionStream("deflate-raw"),
        );
        return await new Response(stream).text();
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Normalised line endings, trimmed, and capped so a 300 page pack stays sane. */
function normalise(text: string): string {
  // NUL bytes survive some PDF and DOCX extractions and break everything
  // downstream, from Postgres text columns to the model's tokeniser. Split and
  // rejoin rather than a regex, which would need a control character in it.
  const clean = text.replace(/\r\n/g, "\n").split("\u0000").join("").trim();
  const LIMIT = 400_000;
  return clean.length > LIMIT
    ? `${clean.slice(0, LIMIT)}\n\n[truncated at ${LIMIT.toLocaleString()} characters]`
    : clean;
}

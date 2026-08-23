/**
 * Splitting a document into retrievable passages.
 *
 * The unit of retrieval is a passage, not a document, so the split decides how
 * good the answers are. Two rules do most of the work.
 *
 * Split on structure before size. A manual is already divided into sections by
 * its headings, and those divisions are meaningful in a way that "every 800
 * characters" is not. Cutting mid-sentence produces a chunk that reads as a
 * fragment, and a fragment quoted back as a citation looks like the tool is
 * guessing.
 *
 * Overlap the joins. A torque figure that sits one line after the heading it
 * belongs to is useless if the heading landed in the previous chunk. Repeating
 * the tail of each chunk at the head of the next costs a little storage and
 * saves the answer that falls across a boundary.
 */

export interface Chunk {
  ordinal: number;
  text: string;
}

/** Target size in characters. Roughly 250 to 350 tokens for English prose. */
const TARGET = 1200;
/** Never emit a chunk smaller than this unless it is the last one. */
const MIN = 200;
/** How much of the previous chunk to repeat at the start of the next. */
const OVERLAP = 180;
/** Hard ceiling, so one enormous paragraph cannot produce an unusable chunk. */
const MAX = 2000;

/** A heading in Markdown, or a line that looks like a numbered section. */
const HEADING = /^(#{1,6}\s+\S|(\d+\.){1,4}\s+\S|[A-Z][A-Z0-9 ,.\-/]{6,}$)/;

/**
 * Break text into passages.
 *
 * Paragraph boundaries are preferred, then single line breaks, then a hard cut.
 * The hard cut only happens for text with no structure at all, which in practice
 * means a table dumped as one line.
 */
export function chunkText(raw: string): Chunk[] {
  const normalised = raw.replace(/\r\n/g, "\n").replace(/ /g, " ").trim();
  if (!normalised) return [];

  const paragraphs = normalised.split(/\n{2,}/).flatMap(splitOversized);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const piece = para.trim();
    if (!piece) continue;

    // A heading starts a new chunk, so a section's title travels with its body
    // rather than being stranded at the end of the previous passage.
    const startsSection = HEADING.test(piece) && current.length >= MIN;

    if (startsSection || current.length + piece.length + 2 > TARGET) {
      if (current.trim()) chunks.push(current.trim());
      current = overlapFrom(chunks.at(-1)) + piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // A trailing scrap is folded back rather than kept: a 40 character chunk
  // matches almost any query and answers none of them.
  if (chunks.length > 1) {
    const last = chunks.at(-1) as string;
    if (last.length < MIN) {
      chunks.pop();
      chunks[chunks.length - 1] = `${chunks.at(-1)}\n\n${last}`;
    }
  }

  return chunks.map((text, ordinal) => ({ ordinal, text }));
}

/** The tail of the previous chunk, cut at a sentence where possible. */
function overlapFrom(previous: string | undefined): string {
  if (!previous || previous.length < OVERLAP) return "";
  const tail = previous.slice(-OVERLAP);
  const at = tail.search(/[.!?]\s/);
  const clean = at >= 0 ? tail.slice(at + 2) : tail;
  return clean.trim() ? `${clean.trim()}\n\n` : "";
}

/** Split a paragraph that is longer than the hard ceiling. */
function splitOversized(paragraph: string): string[] {
  if (paragraph.length <= MAX) return [paragraph];

  const out: string[] = [];
  // Sentence boundaries first, then bare line breaks, then characters.
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const sentence of sentences) {
    if (sentence.length > MAX) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < sentence.length; i += TARGET) {
        out.push(sentence.slice(i, i + TARGET));
      }
      continue;
    }
    if (buf.length + sentence.length + 1 > TARGET) {
      out.push(buf);
      buf = sentence;
    } else {
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Scale a vector to unit length.
 *
 * Done once at write time so that similarity at read time is a dot product
 * rather than a dot product plus two square roots per candidate. Most providers
 * already return normalised vectors; doing it anyway costs nothing and removes
 * the assumption.
 */
export function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const magnitude = Math.sqrt(sum);
  // A zero vector cannot be normalised. Returning it unchanged makes it score
  // zero against everything, which is the correct behaviour for empty input.
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

/**
 * Format-preserving document model for MIDI Captain page files (pageN.txt).
 *
 * The device firmware treats these INI-style files as a fixed contract: section
 * names, key names, ordering and the `[..]` value wrapping must all be preserved
 * exactly. This module parses a file into a line-oriented model that re-serializes
 * byte-for-byte, and only regenerates a line when it has actually been edited.
 *
 * Design guarantees:
 *  - `serializeDocument(parseDocument(text)) === text` for ANY input (identity).
 *  - Editing a value via the semantic API changes only that value's text; the key
 *    name, separator, indentation, ordering and every other byte are preserved.
 */

export type LineKind = "blank" | "section" | "entry" | "other";

export interface DocLine {
  /** Original text of the line WITHOUT its end-of-line terminator. */
  content: string;
  /** Exact terminator that followed this line: "\n", "\r\n", "\r", or "" for a final line with no trailing newline. */
  eol: string;
  kind: LineKind;
  /** Set true once an edit changes this line; `serializeDocument` then rebuilds it from its parts. */
  dirty: boolean;
  /** section name, e.g. "key1" for a "[key1]" line (kind === "section"). */
  section?: string;
  /** leading whitespace before the key, usually "" (kind === "entry"). */
  indent?: string;
  /** entry key, e.g. "ledcolor0" (kind === "entry"). */
  key?: string;
  /** exact separator between key and value, e.g. " = ", "= ", "   = " (kind === "entry"). */
  sep?: string;
  /** raw value text after the separator; may be "" and may include trailing spaces (kind === "entry"). */
  value?: string;
}

export interface PageDocument {
  lines: DocLine[];
}

const SECTION_RE = /^\s*\[[^\]]+\]\s*$/;
const SECTION_NAME_RE = /\[([^\]]+)\]/;
// key = run of non-space, non-equals chars; sep = surrounding spaces + a single '='; value = the rest of the line.
const ENTRY_RE = /^(\s*)([^\s=]+)(\s*=\s*)(.*)$/;

/** Classify one raw line (already split from its terminator) into a DocLine. */
function classify(content: string, eol: string): DocLine {
  const line: DocLine = { content, eol, kind: "other", dirty: false };

  if (content.trim() === "") {
    line.kind = "blank";
    return line;
  }
  if (SECTION_RE.test(content)) {
    line.kind = "section";
    const nm = content.match(SECTION_NAME_RE);
    line.section = nm ? nm[1] : "";
    return line;
  }
  const em = content.match(ENTRY_RE);
  if (em) {
    line.kind = "entry";
    line.indent = em[1];
    line.key = em[2];
    line.sep = em[3];
    line.value = em[4];
    return line;
  }
  return line; // "other" — preserved verbatim
}

/**
 * Parse text into a PageDocument, preserving every byte. Detects each line's own
 * terminator so mixed EOLs and a missing final newline are reproduced exactly.
 */
export function parseDocument(text: string): PageDocument {
  const lines: DocLine[] = [];
  const re = /([^\r\n]*)(\r\n|\r|\n)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    lines.push(classify(m[1] ?? "", m[2] ?? ""));
    lastIndex = re.lastIndex;
  }
  // Trailing line with no terminator (file does not end in a newline).
  if (lastIndex < text.length) {
    lines.push(classify(text.slice(lastIndex), ""));
  }
  return { lines };
}

/** Rebuild a single line's content from its parsed parts. Equals `content` for an unedited line. */
function rebuildContent(l: DocLine): string {
  if (l.kind === "entry") {
    return (l.indent ?? "") + (l.key ?? "") + (l.sep ?? "") + (l.value ?? "");
  }
  if (l.kind === "section") {
    return "[" + (l.section ?? "") + "]";
  }
  return l.content;
}

/**
 * Serialize back to text. Unedited lines emit their original bytes; edited lines
 * (dirty) are rebuilt from their parts. This preserves the file byte-for-byte
 * except where a value was intentionally changed.
 */
export function serializeDocument(doc: PageDocument): string {
  let out = "";
  for (const l of doc.lines) {
    out += (l.dirty ? rebuildContent(l) : l.content) + l.eol;
  }
  return out;
}

/**
 * Serialize by rebuilding EVERY line from its parsed parts (ignoring `content`).
 * Used by tests to prove the parser decomposes each line losslessly: for a valid
 * file this must still equal the original text.
 */
export function serializeRebuilt(doc: PageDocument): string {
  let out = "";
  for (const l of doc.lines) {
    out += rebuildContent(l) + l.eol;
  }
  return out;
}

/**
 * @midicaptain/page-config — format-preserving parser, serializer, validator and
 * linter for MIDI Captain `pageN.txt` files.
 *
 * The package makes the firmware contract *executable*: parsing then serializing
 * an unedited file returns it byte-for-byte, edits only ever change the value
 * bytes they target, and the schema/linter catch structural or behavioral drift.
 */

export * from "./document";
export * from "./brackets";
export * from "./model";
export * from "./schema";
export * from "./lint";

import { parseDocument, serializeDocument, serializeRebuilt, type PageDocument } from "./document";
import { validate } from "./schema";
import { lint, type LintOptions } from "./lint";
import type { Diagnostic } from "./model";

/** Parse page text into a format-preserving document model. */
export function parse(text: string): PageDocument {
  return parseDocument(text);
}

/** Serialize a document back to text (byte-exact for unedited content). */
export function serialize(doc: PageDocument): string {
  return serializeDocument(doc);
}

/**
 * True when the file round-trips byte-for-byte through both the identity
 * serializer and the parts-rebuilt serializer — i.e. the parser decomposed every
 * line losslessly. This is the contract guarantee the test suite enforces.
 */
export function roundtripEquals(text: string): boolean {
  const doc = parseDocument(text);
  return serializeDocument(doc) === text && serializeRebuilt(doc) === text;
}

/** Combined report: schema validation plus behavioral lint findings. */
export interface AnalysisReport {
  validation: Diagnostic[];
  lint: Diagnostic[];
  /** Convenience: all diagnostics, validation first. */
  all: Diagnostic[];
  /** True when nothing of `severity: "error"` was found. */
  ok: boolean;
}

/** Parse, validate and lint page text in one call. */
export function analyze(text: string, options?: LintOptions): AnalysisReport {
  const doc = parseDocument(text);
  const validation = validate(doc);
  const lintFindings = lint(doc, options);
  const all = [...validation, ...lintFindings];
  return {
    validation,
    lint: lintFindings,
    all,
    ok: !all.some((d) => d.severity === "error"),
  };
}

/**
 * Semantic model over the format-preserving {@link PageDocument}.
 *
 * Two layers live here:
 *  1. Low-level, byte-safe entry access (`getEntry`, `getRawValue`, `setRawValue`)
 *     that reads/edits a single value while leaving every other byte untouched.
 *  2. A read-only projection (`buildPage`) that decodes the document into typed
 *     sections/keys/steps/commands for validation and linting. The projection never
 *     mutates the document; edits always go back through `setRawValue`.
 */

import type { DocLine, PageDocument } from "./document";
import { bracketGroups, parseCommandLine, type RawCommand } from "./brackets";

/** A diagnostic produced by validation or linting. Shared shape across the package. */
export interface Diagnostic {
  /** Stable rule id, e.g. `"schema/range"` or `"lint/long-press-page-retrigger"`. */
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Section the finding belongs to, e.g. `"GlobalSetup"` or `"key1"`. */
  section?: string;
  /** Entry key involved, e.g. `"ledbright"` or `"short_dw1"`. */
  key?: string;
  /** 1-based line number in the source file, when known. */
  line?: number;
}

/** The four trigger states, matching the editor's internal names. */
export type TriggerState = "down" | "long" | "shortup" | "longup";

/** A located entry: the parsed line plus its index in `doc.lines`. */
export interface EntryRef {
  line: DocLine;
  /** 0-based index into `doc.lines`. */
  index: number;
}

/** A `ledcolorN` entry decoded into its bracket groups. */
export interface ColorEntry {
  index: number;
  groups: string[];
  /** 1-based source line. */
  line: number;
}

/** One trigger line (`short_dw1`, `long2`, …) with its parsed commands. */
export interface TriggerModel {
  state: TriggerState;
  /** Step (loop) index the trigger attaches to. */
  step: number;
  /** The raw entry key, e.g. `"short_dw1"`. */
  key: string;
  /** Screen label from the paired `..._name` line, if present. */
  name?: string;
  /** Raw right-hand-side value text. */
  rawValue: string;
  commands: RawCommand[];
  /** 1-based source line. */
  line: number;
}

/** A step (loop) groups all triggers that share the same index for a key. */
export interface StepModel {
  step: number;
  triggers: TriggerModel[];
  /** Total commands across every trigger on this step (they share 4 slots). */
  commandCount: number;
}

/** One `[keyN]` section decoded. */
export interface KeyModel {
  /** Section name, e.g. `"key1"`, `"keyA"`. */
  name: string;
  /** Suffix after `key`, e.g. `"1"`, `"A"`. */
  suffix: string;
  /** 1-based source line of the section header. */
  line: number;
  keytimes: number | null;
  ledmode: string | null;
  colors: ColorEntry[];
  triggers: TriggerModel[];
  steps: StepModel[];
}

/** A GlobalSetup entry, keeping both the raw and the unwrapped first-bracket value. */
export interface GlobalEntry {
  key: string;
  /** Raw value text after `=`. */
  rawValue: string;
  /** First `[..]` group's content, or the trimmed raw value when unbracketed. */
  value: string;
  /** 1-based source line. */
  line: number;
}

/** The whole page decoded for analysis. */
export interface PageModel {
  global: GlobalEntry[];
  globalByKey: Map<string, GlobalEntry>;
  keys: KeyModel[];
  /** All section names in file order (e.g. GlobalSetup, key1 … keyE). */
  sections: string[];
}

const SECTION_NAME_RE = /\[([^\]]+)\]/;

/** Iterate entries in document order, tracking the current section name. */
function forEachEntry(
  doc: PageDocument,
  visit: (section: string | null, line: DocLine, index: number) => void,
): void {
  let section: string | null = null;
  doc.lines.forEach((line, index) => {
    if (line.kind === "section") {
      const m = line.content.match(SECTION_NAME_RE);
      section = m ? (m[1] ?? "") : (line.section ?? "");
    } else if (line.kind === "entry") {
      visit(section, line, index);
    }
  });
}

/** Find a single entry by section + key. Returns the located line or undefined. */
export function getEntry(doc: PageDocument, section: string, key: string): EntryRef | undefined {
  let found: EntryRef | undefined;
  forEachEntry(doc, (sec, line, index) => {
    if (found) return;
    if (sec === section && line.key === key) found = { line, index };
  });
  return found;
}

/** Read the raw value text of an entry (everything after the separator). */
export function getRawValue(doc: PageDocument, section: string, key: string): string | undefined {
  return getEntry(doc, section, key)?.line.value;
}

/** Read the bracket groups of an entry's value, e.g. `["0xFF0000","0xFF0000","0xFF0000"]`. */
export function getBracketValues(doc: PageDocument, section: string, key: string): string[] {
  const raw = getRawValue(doc, section, key);
  return raw === undefined ? [] : bracketGroups(raw);
}

/**
 * Set an entry's value text, marking the line dirty so the serializer rebuilds
 * only that line. The key, separator, indentation, ordering and every other byte
 * are preserved. Returns true if the entry was found and updated.
 *
 * The caller supplies the exact value text (including any `[..]` wrapping), so the
 * firmware's bracket convention stays the caller's responsibility — this never
 * invents or strips brackets.
 */
export function setRawValue(
  doc: PageDocument,
  section: string,
  key: string,
  value: string,
): boolean {
  const ref = getEntry(doc, section, key);
  if (!ref) return false;
  if (ref.line.value === value) return true; // no-op keeps the line clean
  ref.line.value = value;
  ref.line.dirty = true;
  return true;
}

/** All section names in document order. */
export function getSections(doc: PageDocument): string[] {
  const out: string[] = [];
  for (const line of doc.lines) {
    if (line.kind === "section") {
      const m = line.content.match(SECTION_NAME_RE);
      out.push(m ? (m[1] ?? "") : (line.section ?? ""));
    }
  }
  return out;
}

const TRIGGER_PATTERNS: ReadonlyArray<{ re: RegExp; state: TriggerState }> = [
  { re: /^short_dw(\d+)$/, state: "down" },
  { re: /^short_up(\d+)$/, state: "shortup" },
  { re: /^long_up(\d+)$/, state: "longup" },
  { re: /^long(\d+)$/, state: "long" },
];

/** Match a trigger command key like `"short_dw3"` -> `{ state, step }`. */
export function matchTrigger(key: string): { state: TriggerState; step: number } | null {
  for (const p of TRIGGER_PATTERNS) {
    const m = key.match(p.re);
    if (m) return { state: p.state, step: parseInt(m[1] ?? "0", 10) };
  }
  return null;
}

/** Match a trigger name key like `"short_dw3_name"` -> `{ state, step }`. */
export function matchTriggerName(key: string): { state: TriggerState; step: number } | null {
  const m = key.match(/^(short_dw|short_up|long_up|long)(\d+)_name$/);
  if (!m) return null;
  return matchTrigger((m[1] ?? "") + (m[2] ?? ""));
}

/** True for the GlobalSetup section (case-insensitive), matching the editor. */
function isGlobalSection(name: string): boolean {
  return /^globalsetup$/i.test(name);
}

/** Unwrap a GlobalSetup value the way the editor does: first bracket, else the raw text. */
function globalValue(rawValue: string): string {
  const groups = bracketGroups(rawValue);
  return groups.length ? (groups[0] ?? "") : rawValue.trim();
}

/**
 * Decode a document into a typed {@link PageModel} for validation and linting.
 * Read-only: it never mutates `doc`. Line numbers are 1-based for diagnostics.
 */
export function buildPage(doc: PageDocument): PageModel {
  const global: GlobalEntry[] = [];
  const globalByKey = new Map<string, GlobalEntry>();
  const keys: KeyModel[] = [];
  const sections: string[] = [];

  let currentKey: KeyModel | null = null;
  // Pending trigger names keyed by "state:step" until their command line appears.
  let pendingNames = new Map<string, string>();

  const flushKey = () => {
    if (currentKey) currentKey.steps = buildSteps(currentKey.triggers);
  };

  doc.lines.forEach((line, index) => {
    const lineNo = index + 1;

    if (line.kind === "section") {
      const m = line.content.match(SECTION_NAME_RE);
      const name = m ? (m[1] ?? "") : (line.section ?? "");
      sections.push(name);

      if (isGlobalSection(name)) {
        flushKey();
        currentKey = null;
        pendingNames = new Map();
      } else if (/^key/i.test(name)) {
        flushKey();
        currentKey = {
          name,
          suffix: name.replace(/^key/i, "").toUpperCase(),
          line: lineNo,
          keytimes: null,
          ledmode: null,
          colors: [],
          triggers: [],
          steps: [],
        };
        keys.push(currentKey);
        pendingNames = new Map();
      } else {
        // Unknown section: still track it, but don't attach entries to a key.
        flushKey();
        currentKey = null;
        pendingNames = new Map();
      }
      return;
    }

    if (line.kind !== "entry") return;
    const key = line.key ?? "";
    const rawValue = line.value ?? "";

    // GlobalSetup entries (only when we're inside it — the first section).
    if (currentKey === null && sections.length > 0 && isGlobalSection(sections[sections.length - 1] ?? "")) {
      const entry: GlobalEntry = { key, rawValue, value: globalValue(rawValue), line: lineNo };
      global.push(entry);
      if (!globalByKey.has(key)) globalByKey.set(key, entry);
      return;
    }

    if (!currentKey) return;

    if (/^keytimes$/i.test(key)) {
      const v = bracketGroups(rawValue)[0] ?? rawValue.trim();
      const n = parseInt(v, 10);
      currentKey.keytimes = Number.isNaN(n) ? null : n;
      return;
    }
    if (/^ledmode$/i.test(key)) {
      currentKey.ledmode = bracketGroups(rawValue)[0] ?? rawValue.trim();
      return;
    }

    const colorMatch = key.match(/^ledcolor(\d+)$/i);
    if (colorMatch) {
      currentKey.colors.push({
        index: parseInt(colorMatch[1] ?? "0", 10),
        groups: bracketGroups(rawValue),
        line: lineNo,
      });
      return;
    }

    const nameMatch = matchTriggerName(key);
    if (nameMatch) {
      pendingNames.set(`${nameMatch.state}:${nameMatch.step}`, bracketGroups(rawValue)[0] ?? "");
      return;
    }

    const trig = matchTrigger(key);
    if (trig) {
      const nameKey = `${trig.state}:${trig.step}`;
      const trigger: TriggerModel = {
        state: trig.state,
        step: trig.step,
        key,
        rawValue,
        commands: parseCommandLine(rawValue),
        line: lineNo,
      };
      const pending = pendingNames.get(nameKey);
      if (pending !== undefined) trigger.name = pending;
      currentKey.triggers.push(trigger);
      return;
    }
  });

  flushKey();

  return { global, globalByKey, keys, sections };
}

/** Group a key's triggers into steps (loops), summing their shared command counts. */
function buildSteps(triggers: TriggerModel[]): StepModel[] {
  const byStep = new Map<number, StepModel>();
  for (const t of triggers) {
    let step = byStep.get(t.step);
    if (!step) {
      step = { step: t.step, triggers: [], commandCount: 0 };
      byStep.set(t.step, step);
    }
    step.triggers.push(t);
    step.commandCount += t.commands.length;
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

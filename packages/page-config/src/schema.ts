/**
 * Schema validation for MIDI Captain page files.
 *
 * Encodes the firmware contract as data: the known GlobalSetup keys with their
 * value ranges/enums, the fixed set of key sections, and the entries a key section
 * may contain. `validate` walks a parsed document and reports anything that falls
 * outside the contract — unknown sections/keys, out-of-range values, bad enums,
 * missing keys and unparseable commands.
 *
 * Value validators are built with Zod (per the design doc) from the spec table,
 * so ranges/enums live in one declarative place.
 */

import { z } from "zod";
import type { PageDocument } from "./document";
import { buildPage, type Diagnostic } from "./model";
import { matchTrigger, matchTriggerName } from "./model";

/** How a single value is validated. */
export type FieldSpec =
  | { kind: "int"; min: number; max: number }
  | { kind: "enum"; values: string[]; caseInsensitive?: boolean }
  | { kind: "onoff" }
  | { kind: "text" }
  | { kind: "raw" };

/** GlobalSetup keys and their value contracts. Order here is informational; the
 *  document model preserves the real on-file order. */
export const GLOBAL_SPECS: Record<string, FieldSpec> = {
  page_name: { kind: "text" },
  ledbright: { kind: "int", min: 0, max: 100 },
  screenbright: { kind: "int", min: 0, max: 100 },
  long_press_timing: { kind: "int", min: 1, max: 3 },
  "WIRELESS_2.4G": { kind: "onoff" },
  WIRELESS_ID: { kind: "int", min: 0, max: 99 },
  WIRELESS_dB: { kind: "int", min: 0, max: 14 },
  BATTERY_CHARGE: { kind: "onoff" },
  group_number: { kind: "int", min: 3, max: 10 },
  display_number_ABC: {
    kind: "enum",
    values: ["123", "abc3", "abc4", "abc5", "abc6", "abc7", "abc8", "abc9", "abc10"],
    caseInsensitive: true,
  },
  display_bank_offset: { kind: "int", min: 0, max: 1 },
  pc_open_num: { kind: "int", min: 0, max: 127 },
  PC_Bank_Select: { kind: "int", min: 1, max: 10 },
  CC_value_gropnumber: { kind: "raw" },
  tapcountMIN: { kind: "int", min: 0, max: 999 },
  tapcountMAX: { kind: "int", min: 0, max: 999 },
  midithrough: { kind: "onoff" },
  externalmidicontrol: { kind: "onoff" },
  externalmidicontrolch: { kind: "int", min: 1, max: 16 },
  encoderCH: { kind: "int", min: 1, max: 16 },
  encoderCCnum: { kind: "int", min: 0, max: 127 },
  encoderkeyCCtoggle: { kind: "int", min: 0, max: 127 },
  exp1_CH: { kind: "int", min: 1, max: 16 },
  exp1_CC: { kind: "int", min: 0, max: 127 },
  exp1_min: { kind: "int", min: 0, max: 127 },
  exp1_max: { kind: "int", min: 0, max: 127 },
  exp2_CH: { kind: "int", min: 1, max: 16 },
  exp2_CC: { kind: "int", min: 0, max: 127 },
  exp2_min: { kind: "int", min: 0, max: 127 },
  exp2_max: { kind: "int", min: 0, max: 127 },
  // PC_group_0..9 are command sequences (or empty); not range-checked here.
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`PC_group_${i}`, { kind: "raw" } as FieldSpec]),
  ),
};

/** The key sections the firmware contract allows (Mini6 uses 1,2,3,A,B,C; files carry all 10). */
export const KNOWN_KEY_SUFFIXES = new Set(["1", "2", "3", "4", "5", "A", "B", "C", "D", "E"]);

/** Allowed `ledmode` values. */
export const LED_MODES = ["normal", "tap", "select", "select1", "select2", "select3", "select4", "select5"];

/** Build a Zod validator for one field spec. */
function buildSchema(spec: FieldSpec): z.ZodTypeAny {
  switch (spec.kind) {
    case "text":
    case "raw":
      return z.string();
    case "onoff":
      return z
        .string()
        .refine((s) => ["on", "off"].includes(s.trim().toLowerCase()), { message: "must be 'on' or 'off'" });
    case "enum": {
      const norm = (s: string) => (spec.caseInsensitive ? s.trim().toLowerCase() : s.trim());
      const allowed = spec.values.map(norm);
      return z
        .string()
        .refine((s) => allowed.includes(norm(s)), { message: `must be one of: ${spec.values.join(", ")}` });
    }
    case "int":
      return z.string().superRefine((s, ctx) => {
        const t = s.trim();
        if (!/^-?\d+$/.test(t)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a whole number" });
          return;
        }
        const n = parseInt(t, 10);
        if (n < spec.min || n > spec.max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must be between ${spec.min} and ${spec.max}` });
        }
      });
  }
}

function ruleFor(spec: FieldSpec): string {
  if (spec.kind === "int") return "schema/range";
  if (spec.kind === "enum" || spec.kind === "onoff") return "schema/enum";
  return "schema/value";
}

/** Validate one value against a spec, returning zero or more issue messages. */
function checkValue(spec: FieldSpec, value: string): string[] {
  const res = buildSchema(spec).safeParse(value);
  if (res.success) return [];
  return res.error.issues.map((i) => i.message);
}

const SECTION_NAME_RE = /\[([^\]]+)\]/;

/** Walk entries with their section context and 1-based line numbers. */
function walkEntries(
  doc: PageDocument,
  visit: (section: string, key: string, value: string, line: number) => void,
): void {
  let section = "";
  doc.lines.forEach((line, index) => {
    if (line.kind === "section") {
      const m = line.content.match(SECTION_NAME_RE);
      section = m ? (m[1] ?? "") : (line.section ?? "");
    } else if (line.kind === "entry") {
      visit(section, line.key ?? "", line.value ?? "", index + 1);
    }
  });
}

const isGlobal = (name: string) => /^globalsetup$/i.test(name);

/** Classify an entry key inside a `[keyN]` section. */
function classifyKeyEntry(key: string): "keytimes" | "ledmode" | "color" | "trigger" | "name" | "unknown" {
  if (/^keytimes$/i.test(key)) return "keytimes";
  if (/^ledmode$/i.test(key)) return "ledmode";
  if (/^ledcolor\d+$/i.test(key)) return "color";
  if (matchTriggerName(key)) return "name";
  if (matchTrigger(key)) return "trigger";
  return "unknown";
}

/** Loose MIDI range check for a command's numeric fields (reported as warnings). */
function checkCommandRanges(
  section: string,
  key: string,
  line: number,
  command: import("./brackets").Command,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const intField = (label: string, raw: string, min: number, max: number) => {
    const t = raw.trim();
    if (!/^-?\d+$/.test(t)) return; // keyword (e.g. value_inc) — not a number, skip
    const n = parseInt(t, 10);
    if (n < min || n > max) {
      out.push({
        rule: "schema/command-range",
        severity: "warning",
        message: `${label} ${n} is outside ${min}–${max}.`,
        section,
        key,
        line,
      });
    }
  };
  if (command.type === "cc" || command.type === "cct" || command.type === "nt") {
    intField("channel", command.channel, 1, 16);
    intField(command.type === "nt" ? "note" : "CC number", command.number, 0, 127);
    intField(command.type === "nt" ? "velocity" : "value", command.value, 0, 127);
  } else if (command.type === "pc") {
    intField("channel", command.channel, 1, 16);
    intField("program", command.program, 0, 127);
  }
  return out;
}

/**
 * Validate a parsed page against the firmware contract. Returns all findings;
 * an empty array means the file's structure and values are contract-clean.
 */
export function validate(doc: PageDocument): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const page = buildPage(doc);

  // 1) Sections: only GlobalSetup and the known key sections are allowed.
  doc.lines.forEach((line, index) => {
    if (line.kind !== "section") return;
    const m = line.content.match(SECTION_NAME_RE);
    const name = m ? (m[1] ?? "") : (line.section ?? "");
    if (isGlobal(name)) return;
    const km = name.match(/^key(.+)$/i);
    if (km && KNOWN_KEY_SUFFIXES.has((km[1] ?? "").toUpperCase())) return;
    diags.push({
      rule: "schema/unknown-section",
      severity: "error",
      message: `Unknown section [${name}] — not part of the page contract.`,
      section: name,
      line: index + 1,
    });
  });

  // 2) GlobalSetup values + unknown keys.
  for (const entry of page.global) {
    const spec = GLOBAL_SPECS[entry.key];
    if (!spec) {
      diags.push({
        rule: "schema/unknown-key",
        severity: "error",
        message: `Unknown GlobalSetup key "${entry.key}".`,
        section: "GlobalSetup",
        key: entry.key,
        line: entry.line,
      });
      continue;
    }
    for (const msg of checkValue(spec, entry.value)) {
      diags.push({
        rule: ruleFor(spec),
        severity: "error",
        message: `${entry.key} ${msg} (got "${entry.value}").`,
        section: "GlobalSetup",
        key: entry.key,
        line: entry.line,
      });
    }
  }

  // 3) Missing GlobalSetup keys (contract expects the full set).
  for (const key of Object.keys(GLOBAL_SPECS)) {
    if (!page.globalByKey.has(key)) {
      diags.push({
        rule: "schema/missing-key",
        severity: "warning",
        message: `Missing GlobalSetup key "${key}".`,
        section: "GlobalSetup",
        key,
      });
    }
  }

  // 4) Key-section entries: keytimes / ledmode values + unknown keys.
  walkEntries(doc, (section, key, value, line) => {
    if (isGlobal(section)) return;
    if (!/^key/i.test(section)) return; // unknown sections already flagged
    const kind = classifyKeyEntry(key);
    if (kind === "keytimes") {
      const inner = value.replace(/^\[|\]$/g, "");
      for (const msg of checkValue({ kind: "int", min: 1, max: 10 }, inner)) {
        diags.push({ rule: "schema/range", severity: "error", message: `keytimes ${msg} (got "${inner}").`, section, key, line });
      }
    } else if (kind === "ledmode") {
      const inner = value.replace(/^\[|\]$/g, "");
      for (const msg of checkValue({ kind: "enum", values: LED_MODES }, inner)) {
        diags.push({ rule: "schema/enum", severity: "error", message: `ledmode ${msg} (got "${inner}").`, section, key, line });
      }
    } else if (kind === "unknown") {
      diags.push({
        rule: "schema/unknown-key",
        severity: "error",
        message: `Unknown key "${key}" in [${section}].`,
        section,
        key,
        line,
      });
    }
  });

  // 5) Commands: unparseable groups + loose numeric range checks.
  for (const key of page.keys) {
    for (const trigger of key.triggers) {
      for (const raw of trigger.commands) {
        if (!raw.command && raw.groups.length > 0) {
          diags.push({
            rule: "schema/unknown-command",
            severity: "error",
            message: `Unrecognized command "[${raw.groups.join("][")}]" on ${trigger.key}.`,
            section: key.name,
            key: trigger.key,
            line: trigger.line,
          });
        } else if (raw.command) {
          diags.push(...checkCommandRanges(key.name, trigger.key, trigger.line, raw.command));
        }
      }
    }
  }

  return diags;
}

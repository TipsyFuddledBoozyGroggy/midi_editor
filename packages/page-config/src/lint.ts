/**
 * Behavioral linter for MIDI Captain page files.
 *
 * These rules encode real, domain-specific bugs that a byte-valid file can still
 * contain (design doc §7). They operate on the semantic {@link PageModel}, never on
 * raw bytes, and return {@link Diagnostic}s — they never mutate the document.
 *
 * Rules:
 *  - `lint/long-press-page-retrigger` — page-nav (`[preset]`) on a press-down `long#`
 *    trigger instead of the release `long_up#`, which can skip/bounce pages.
 *  - `lint/step-overflow` — more than 4 commands in one step (they share 4 slots).
 *  - `lint/beyond-keytimes` — a trigger/color whose step index exceeds `keytimes`.
 *  - `lint/mixed-select-groups` / `lint/select-keytimes` — select-mode sanity.
 *  - `lint/channel-mismatch` — a QC/SYN command whose channel differs from the
 *    device's configured (or first-seen) MIDI channel.
 *  - `lint/color-format` — an `ledcolorN` value that isn't three `0xRRGGBB` groups.
 */

import type { PageDocument } from "./document";
import { buildPage, type Diagnostic, type PageModel } from "./model";
import { isPageNavCommand } from "./brackets";

/** Options let a caller pin the expected device channels (e.g. from the navbar). */
export interface LintOptions {
  /** Expected Quad Cortex MIDI channel (1–16). Defaults to the first QC channel seen. */
  qcChannel?: number;
  /** Expected Synergy SYN-20IR MIDI channel (1–16). Defaults to the first SYN channel seen. */
  synChannel?: number;
}

/* ------------------------------------------------------------------ *
 * Device MIDI maps (seed of the planned `midi-maps` data package).
 * Mirrors the QC/SYN quick-fill tables in the editor so device detection
 * here matches what the editor writes and badges.
 * ------------------------------------------------------------------ */

/** SYN-20IR owns these CC numbers outright, regardless of value. */
const SYN_CC_NUMS = new Set([24, 25, 27, 28, 29, 30]);

/** Quad Cortex CC:value pairs the editor recognizes (for device detection). */
const QC_CCVAL: ReadonlySet<string> = new Set<string>([
  // Modes (CC47), Footswitch Page (CC64)
  "47:0", "47:1", "47:2", "64:0", "64:127",
  // Scenes (CC43 0–7)
  ...Array.from({ length: 8 }, (_, i) => `43:${i}`),
  // Footswitches (CC35–42 = 127)
  ...Array.from({ length: 8 }, (_, i) => `${35 + i}:127`),
  // Menus
  "44:127", "45:127", "45:0", "46:127", "46:0",
  // Looper X
  "48:0", "48:127", "53:127", "54:127", "56:127",
  "50:127", "51:127", "55:127", "49:127", "52:127",
  // MIDI settings
  "62:127", "62:0",
]);

/** Work out which device a CC command targets: 'QC', 'SYN', or '' (unknown). */
export function detectDevice(cc: number, val: number): "QC" | "SYN" | "" {
  if (Number.isNaN(cc)) return "";
  if (SYN_CC_NUMS.has(cc)) return "SYN";
  return QC_CCVAL.has(`${cc}:${val}`) ? "QC" : "";
}

interface DeviceCommand {
  device: "QC" | "SYN";
  channel: number;
  section: string;
  key: string;
  line: number;
}

/** Collect every CC command that maps to QC or SYN, with its channel. */
function collectDeviceCommands(page: PageModel): DeviceCommand[] {
  const out: DeviceCommand[] = [];
  for (const key of page.keys) {
    for (const trigger of key.triggers) {
      for (const raw of trigger.commands) {
        const cmd = raw.command;
        if (!cmd || cmd.type !== "cc") continue;
        const cc = parseInt(cmd.number, 10);
        const val = parseInt(cmd.value, 10);
        const ch = parseInt(cmd.channel, 10);
        if (Number.isNaN(ch) || ch < 1 || ch > 16) continue;
        const device = detectDevice(cc, val);
        if (device === "") continue;
        out.push({ device, channel: ch, section: key.name, key: trigger.key, line: trigger.line });
      }
    }
  }
  return out;
}

const COLOR_RE = /^0x[0-9A-Fa-f]{6}$/;
const isSelectMode = (mode: string | null): boolean => !!mode && /^select([1-5])?$/.test(mode);

/**
 * Run the behavioral linter over a page. Accepts a parsed document or a prebuilt
 * model. Returns findings ordered by rule group.
 */
export function lint(input: PageDocument | PageModel, options: LintOptions = {}): Diagnostic[] {
  const page: PageModel = "lines" in input ? buildPage(input) : input;
  const diags: Diagnostic[] = [];

  // ---- Rule: long-press page retrigger -------------------------------------
  for (const key of page.keys) {
    for (const trigger of key.triggers) {
      if (trigger.state !== "long") continue;
      if (trigger.commands.some((c) => isPageNavCommand(c.command))) {
        diags.push({
          rule: "lint/long-press-page-retrigger",
          severity: "warning",
          message:
            `Page navigation is on the press-down trigger "${trigger.key}". While the switch is still held, ` +
            `the new page can re-fire it. Move page changes to "long_up${trigger.step}" (release).`,
          section: key.name,
          key: trigger.key,
          line: trigger.line,
        });
      }
    }
  }

  // ---- Rule: step overflow (editor holds only 4 command slots per step) ----
  // The device firmware itself accepts more (real files send e.g. a 3-note chord on
  // press + release + long-release = 9 commands on one step), but this editor's UI
  // represents at most 4 slots per step, SHARED across that step's triggers. So this
  // is a warning about *editor* round-trip data loss, not a firmware error.
  for (const key of page.keys) {
    for (const step of key.steps) {
      if (step.commandCount > 4) {
        diags.push({
          rule: "lint/step-overflow",
          severity: "warning",
          message:
            `Step ${step.step} of ${key.name} has ${step.commandCount} commands across its triggers. ` +
            `The editor holds only 4 per step, so opening and re-saving this page here would drop the extras.`,
          section: key.name,
          line: step.triggers[0]?.line,
        });
      }
    }
  }

  // ---- Rule: content beyond keytimes ---------------------------------------
  for (const key of page.keys) {
    if (key.keytimes == null) continue;
    for (const trigger of key.triggers) {
      if (trigger.step > key.keytimes) {
        diags.push({
          rule: "lint/beyond-keytimes",
          severity: "warning",
          message: `Trigger "${trigger.key}" is on step ${trigger.step}, beyond keytimes=${key.keytimes}; the pedal won't reach it.`,
          section: key.name,
          key: trigger.key,
          line: trigger.line,
        });
      }
    }
    for (const color of key.colors) {
      if (color.index > key.keytimes) {
        diags.push({
          rule: "lint/beyond-keytimes",
          severity: "warning",
          message: `Color "ledcolor${color.index}" is beyond keytimes=${key.keytimes}; that step is never shown.`,
          section: key.name,
          key: `ledcolor${color.index}`,
          line: color.line,
        });
      }
    }
  }

  // ---- Rule: select-group sanity -------------------------------------------
  const hasBareSelect = page.keys.some((k) => k.ledmode === "select");
  const hasNumberedSelect = page.keys.some((k) => !!k.ledmode && /^select[1-5]$/.test(k.ledmode));
  if (hasBareSelect && hasNumberedSelect) {
    diags.push({
      rule: "lint/mixed-select-groups",
      severity: "warning",
      message:
        `This page mixes the global "select" mode with numbered "select1–5" groups. ` +
        `They interact confusingly — prefer one scheme per page.`,
    });
  }
  for (const key of page.keys) {
    if (isSelectMode(key.ledmode) && key.keytimes != null && key.keytimes > 1) {
      diags.push({
        rule: "lint/select-keytimes",
        severity: "info",
        message:
          `${key.name} is in "${key.ledmode}" (radio) mode with keytimes=${key.keytimes}. ` +
          `Select switches are usually single-step; confirm the extra steps are intended.`,
        section: key.name,
      });
    }
  }

  // ---- Rule: channel mismatch ----------------------------------------------
  const deviceCommands = collectDeviceCommands(page);
  const firstOf = (device: "QC" | "SYN") => deviceCommands.find((d) => d.device === device)?.channel;
  const qcExpected = options.qcChannel ?? firstOf("QC");
  const synExpected = options.synChannel ?? firstOf("SYN");
  for (const dc of deviceCommands) {
    const expected = dc.device === "QC" ? qcExpected : synExpected;
    if (expected != null && dc.channel !== expected) {
      const label = dc.device === "QC" ? "Quad Cortex" : "SYN-20IR";
      diags.push({
        rule: "lint/channel-mismatch",
        severity: "warning",
        message: `${label} command on "${dc.key}" uses channel ${dc.channel}, but the ${dc.device} channel is ${expected}.`,
        section: dc.section,
        key: dc.key,
        line: dc.line,
      });
    }
  }

  // ---- Rule: color format ---------------------------------------------------
  for (const key of page.keys) {
    for (const color of key.colors) {
      const bad = color.groups.length !== 3 || color.groups.some((g) => !COLOR_RE.test(g));
      if (bad) {
        diags.push({
          rule: "lint/color-format",
          severity: "error",
          message:
            `ledcolor${color.index} should be three 0xRRGGBB values but is ` +
            `"[${color.groups.join("][")}]".`,
          section: key.name,
          key: `ledcolor${color.index}`,
          line: color.line,
        });
      }
    }
  }

  return diags;
}

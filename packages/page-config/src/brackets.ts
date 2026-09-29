/**
 * Bracket-token and command parsing for MIDI Captain command values.
 *
 * A command line's value (the right-hand side of e.g. `short_dw1 = ...`) holds
 * zero or more *commands*, separated by spaces. Each command is a run of
 * `[..]` bracket groups with no spaces between them, e.g. `[1][CC][43][0]`.
 *
 * This module is the typed, DOM-free equivalent of the editor's `bracketValues`
 * / `splitCommands` / `parseCommand` helpers. It mirrors their behavior exactly
 * so parsing here matches what the firmware and the existing editor accept, and
 * `serializeCommand` re-emits the exact tokens the editor's exporter writes.
 */

/** The command "type" tokens the editor understands. */
export type CommandType =
  | "cc"
  | "cct"
  | "nt"
  | "pc"
  | "preset"
  | "timeengine"
  | "systemcommon"
  | "realtime"
  | "hid";

/** Control Change, CC Toggle and Note share the `[ch][TYPE][num][val]` shape. */
export interface CcLikeCommand {
  type: "cc" | "cct" | "nt";
  /** MIDI channel token (1–16), kept as text to preserve the original bytes. */
  channel: string;
  /** CC/Note number token. */
  number: string;
  /** CC value / note velocity token. */
  value: string;
}

/** Program Change: `[ch][PC][program][-]`. `program` may be a number or a keyword. */
export interface PcCommand {
  type: "pc";
  channel: string;
  /** number (0–127) or `value_inc` | `value_dec` | `bank_inc` | `bank_dec` | `auto0..9`. */
  program: string;
}

/** Page navigation: `[preset][value_inc|value_dec]`. */
export interface PresetCommand {
  type: "preset";
  action: string;
}

/** Tap / looper engine: `[timeengine][value_inc|value_dec|begin|stop|record|0..9]`. */
export interface TimeEngineCommand {
  type: "timeengine";
  action: string;
}

/** MIDI transport / clock: `[realtime][start|continue|stop|systemreset]`. */
export interface RealtimeCommand {
  type: "realtime";
  action: string;
}

/** System Common: `[SysCmn][cmd][param]`. Empty `param` serializes as `-`. */
export interface SystemCommonCommand {
  type: "systemcommon";
  command: string;
  param: string;
}

/**
 * USB HID output: `[HID][send][key]…[END]`. The pedal can act as a USB keyboard /
 * media controller, e.g. `[HID][send][play_pause][END]` or, typing a word,
 * `[HID][send][P][a][i][n][t][END]`. `keys` holds the payload tokens (without the
 * trailing `END` terminator).
 */
export interface HidCommand {
  type: "hid";
  /** HID sub-command, e.g. `"send"`. */
  action: string;
  /** Key tokens between the action and the `END` terminator. */
  keys: string[];
}

export type Command =
  | CcLikeCommand
  | PcCommand
  | PresetCommand
  | TimeEngineCommand
  | RealtimeCommand
  | SystemCommonCommand
  | HidCommand;

/** One command as it appeared in the file: the raw bracket groups plus its parse (or null). */
export interface RawCommand {
  /** The inner text of each `[..]` group, e.g. `["1","CC","43","0"]`. */
  groups: string[];
  /** The typed command, or `null` when the groups don't match any known shape. */
  command: Command | null;
}

const BRACKET_RE = /\[([^\]]*)\]/g;

/**
 * Pull every `[..]` group's inner text out of a string.
 * `"[1][CC][44][127]"` -> `["1","CC","44","127"]`. Matches the editor's `bracketValues`.
 */
export function bracketGroups(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text)) !== null) {
    out.push(m[1] ?? "");
  }
  return out;
}

/**
 * Turn a run of bracket groups into a typed command, or `null` if unrecognized.
 * Faithful to the editor's `parseCommand`: `[ch][CC|CCT|NT][num][val]`,
 * `[ch][PC][program][-]`, `[preset|timeengine|realtime][action]`, `[syscmn][cmd][param]`.
 */
export function parseCommandGroups(groups: string[]): Command | null {
  if (groups.length === 0) return null;

  const first = (groups[0] ?? "").toLowerCase();
  const second = (groups[1] ?? "").toUpperCase();

  if (groups.length >= 4 && (second === "CC" || second === "CCT" || second === "NT")) {
    return {
      type: second.toLowerCase() as "cc" | "cct" | "nt",
      channel: groups[0] ?? "",
      number: groups[2] ?? "",
      value: groups[3] ?? "",
    };
  }

  if (groups.length >= 3 && second === "PC") {
    return { type: "pc", channel: groups[0] ?? "", program: groups[2] ?? "" };
  }

  if (first === "preset") return { type: "preset", action: groups[1] ?? "" };
  if (first === "timeengine") return { type: "timeengine", action: groups[1] ?? "" };
  if (first === "realtime") return { type: "realtime", action: groups[1] ?? "" };
  if (first === "syscmn") {
    const raw = groups[2] ?? "";
    return { type: "systemcommon", command: groups[1] ?? "", param: raw === "-" ? "" : raw };
  }
  if (first === "hid") {
    const rest = groups.slice(2);
    // Drop the trailing END terminator if present; keep everything else as payload.
    const keys = rest.length > 0 && rest[rest.length - 1] === "END" ? rest.slice(0, -1) : rest;
    return { type: "hid", action: groups[1] ?? "", keys };
  }

  return null;
}

/**
 * Split a command-line value into individual commands. Commands are separated by
 * whitespace; the bracket groups within one command are stuck together with no spaces.
 * Returns one {@link RawCommand} per command, preserving order.
 */
export function parseCommandLine(value: string): RawCommand[] {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const groups = bracketGroups(tok);
      return { groups, command: parseCommandGroups(groups) };
    });
}

/**
 * Serialize a typed command back to its `[..]` bracket form, byte-identical to
 * what the editor's exporter writes (note the mixed-case `SysCmn` token and the
 * literal `-` placeholder for Program Change and empty System Common params).
 */
export function serializeCommand(cmd: Command): string {
  switch (cmd.type) {
    case "cc":
      return `[${cmd.channel}][CC][${cmd.number}][${cmd.value}]`;
    case "cct":
      return `[${cmd.channel}][CCT][${cmd.number}][${cmd.value}]`;
    case "nt":
      return `[${cmd.channel}][NT][${cmd.number}][${cmd.value}]`;
    case "pc":
      return `[${cmd.channel}][PC][${cmd.program}][-]`;
    case "preset":
      return `[preset][${cmd.action}]`;
    case "timeengine":
      return `[timeengine][${cmd.action}]`;
    case "realtime":
      return `[realtime][${cmd.action}]`;
    case "systemcommon":
      return `[SysCmn][${cmd.command}][${cmd.param || "-"}]`;
    case "hid":
      return `[HID][${cmd.action}]${cmd.keys.map((k) => `[${k}]`).join("")}[END]`;
  }
}

/** Serialize a whole line of commands (space-separated), the editor's on-file form. */
export function serializeCommandLine(cmds: Command[]): string {
  return cmds.map(serializeCommand).join(" ");
}

/** True for a page-navigation command (`[preset][...]`), used by the long-press lint rule. */
export function isPageNavCommand(cmd: Command | null): boolean {
  return !!cmd && cmd.type === "preset";
}

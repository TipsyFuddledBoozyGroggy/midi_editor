/** Unit tests for bracket tokenizing and command parse/serialize round trips. */
import { describe, it, expect } from "vitest";
import {
  bracketGroups,
  parseCommandGroups,
  parseCommandLine,
  serializeCommand,
  serializeCommandLine,
  isPageNavCommand,
  type Command,
} from "../src/brackets";

describe("bracketGroups", () => {
  it("extracts inner text of each group", () => {
    expect(bracketGroups("[1][CC][44][127]")).toEqual(["1", "CC", "44", "127"]);
    expect(bracketGroups("[]")).toEqual([""]);
    expect(bracketGroups("")).toEqual([]);
  });
});

describe("parseCommandGroups", () => {
  it("parses CC / CCT / NT", () => {
    expect(parseCommandGroups(["1", "CC", "43", "0"])).toEqual({ type: "cc", channel: "1", number: "43", value: "0" });
    expect(parseCommandGroups(["2", "CCT", "10", "64"])).toEqual({ type: "cct", channel: "2", number: "10", value: "64" });
    expect(parseCommandGroups(["3", "NT", "60", "100"])).toEqual({ type: "nt", channel: "3", number: "60", value: "100" });
  });

  it("parses PC keeping the program token (number or keyword)", () => {
    expect(parseCommandGroups(["1", "PC", "2", "-"])).toEqual({ type: "pc", channel: "1", program: "2" });
    expect(parseCommandGroups(["1", "PC", "value_inc", "-"])).toEqual({ type: "pc", channel: "1", program: "value_inc" });
  });

  it("parses native command types", () => {
    expect(parseCommandGroups(["preset", "value_inc"])).toEqual({ type: "preset", action: "value_inc" });
    expect(parseCommandGroups(["timeengine", "record"])).toEqual({ type: "timeengine", action: "record" });
    expect(parseCommandGroups(["realtime", "start"])).toEqual({ type: "realtime", action: "start" });
    expect(parseCommandGroups(["SysCmn", "SongSelectinc", "-"])).toEqual({
      type: "systemcommon",
      command: "SongSelectinc",
      param: "",
    });
  });

  it("returns null for unrecognized groups", () => {
    expect(parseCommandGroups(["nonsense"])).toBeNull();
    expect(parseCommandGroups([])).toBeNull();
  });
});

describe("parseCommandLine", () => {
  it("splits space-separated commands and keeps bracket groups together", () => {
    const cmds = parseCommandLine("[1][CC][64][0] [16][CC][24][2]");
    expect(cmds).toHaveLength(2);
    expect(cmds[0]?.command).toEqual({ type: "cc", channel: "1", number: "64", value: "0" });
    expect(cmds[1]?.command).toEqual({ type: "cc", channel: "16", number: "24", value: "2" });
  });

  it("returns [] for an empty value", () => {
    expect(parseCommandLine("")).toEqual([]);
    expect(parseCommandLine("   ")).toEqual([]);
  });
});

describe("serialize round trips", () => {
  const cases: Command[] = [
    { type: "cc", channel: "1", number: "43", value: "0" },
    { type: "cct", channel: "2", number: "10", value: "64" },
    { type: "nt", channel: "3", number: "60", value: "100" },
    { type: "pc", channel: "1", program: "2" },
    { type: "preset", action: "value_inc" },
    { type: "timeengine", action: "record" },
    { type: "realtime", action: "start" },
    { type: "systemcommon", command: "SongSelectinc", param: "" },
    { type: "hid", action: "send", keys: ["play_pause"] },
    { type: "hid", action: "send", keys: ["P", "a", "i", "n", "t"] },
  ];

  for (const cmd of cases) {
    it(`re-parses ${cmd.type}`, () => {
      const text = serializeCommand(cmd);
      expect(parseCommandGroups(bracketGroups(text))).toEqual(cmd);
    });
  }

  it("emits the editor's exact tokens (PC placeholder, SysCmn casing)", () => {
    expect(serializeCommand({ type: "pc", channel: "1", program: "2" })).toBe("[1][PC][2][-]");
    expect(serializeCommand({ type: "systemcommon", command: "SongSelectinc", param: "" })).toBe(
      "[SysCmn][SongSelectinc][-]",
    );
  });

  it("parses and re-emits HID key sequences (USB keyboard / media keys)", () => {
    expect(parseCommandGroups(bracketGroups("[HID][send][play_pause][END]"))).toEqual({
      type: "hid",
      action: "send",
      keys: ["play_pause"],
    });
    expect(parseCommandGroups(bracketGroups("[HID][send][P][a][i][n][t][END]"))).toEqual({
      type: "hid",
      action: "send",
      keys: ["P", "a", "i", "n", "t"],
    });
    expect(serializeCommand({ type: "hid", action: "send", keys: ["vol_up"] })).toBe("[HID][send][vol_up][END]");
  });

  it("serializes a whole line", () => {
    const line = serializeCommandLine([
      { type: "cc", channel: "1", number: "64", value: "0" },
      { type: "preset", action: "value_inc" },
    ]);
    expect(line).toBe("[1][CC][64][0] [preset][value_inc]");
  });

  it("identifies page-nav commands", () => {
    expect(isPageNavCommand({ type: "preset", action: "value_inc" })).toBe(true);
    expect(isPageNavCommand({ type: "cc", channel: "1", number: "1", value: "1" })).toBe(false);
    expect(isPageNavCommand(null)).toBe(false);
  });
});

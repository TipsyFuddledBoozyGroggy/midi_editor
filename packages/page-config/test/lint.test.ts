/** Tests for the behavioral linter: each rule fires on a crafted case, and no
 *  real fixture produces error-severity findings. */
import { describe, it, expect } from "vitest";
import { parseDocument } from "../src/document";
import { lint, detectDevice } from "../src/lint";
import type { Diagnostic } from "../src/model";
import { listPageFixtures, readFixture } from "./helpers";

const rulesOf = (diags: Diagnostic[]) => diags.map((d) => d.rule);

/** Build a minimal key section as page text. */
function keyBlock(lines: string[]): string {
  return ["[key1]", ...lines, ""].join("\n");
}

describe("detectDevice", () => {
  it("maps SYN CC numbers regardless of value", () => {
    expect(detectDevice(24, 2)).toBe("SYN");
    expect(detectDevice(27, 64)).toBe("SYN");
  });
  it("maps QC on exact cc:value pairs", () => {
    expect(detectDevice(43, 0)).toBe("QC");
    expect(detectDevice(44, 127)).toBe("QC");
  });
  it("returns '' for unknown pairs", () => {
    expect(detectDevice(120, 5)).toBe("");
  });
});

describe("lint rules fire on crafted input", () => {
  it("long-press page retrigger: preset on a long# trigger", () => {
    const text = keyBlock([
      "keytimes = [1]",
      "ledmode = [normal]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "ledcolor1 = [0x00FFFF][0x00FFFF][0x00FFFF]",
      "long1_name = [PAGE+]",
      "long1 = [preset][value_inc]",
    ]);
    expect(rulesOf(lint(parseDocument(text)))).toContain("lint/long-press-page-retrigger");
  });

  it("step overflow: more than 4 commands share a step", () => {
    const text = keyBlock([
      "keytimes = [1]",
      "ledmode = [normal]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "short_dw1 = [1][CC][1][1] [1][CC][2][2] [1][CC][3][3]",
      "short_up1 = [1][CC][4][4] [1][CC][5][5]",
    ]);
    const diags = lint(parseDocument(text));
    expect(rulesOf(diags)).toContain("lint/step-overflow");
    // The firmware accepts >4/step (see the chord fixture); it's the editor that can't
    // represent them, so this is a data-loss warning rather than a hard error.
    expect(diags.find((d) => d.rule === "lint/step-overflow")?.severity).toBe("warning");
  });

  it("beyond keytimes: a trigger past the step count", () => {
    const text = keyBlock([
      "keytimes = [1]",
      "ledmode = [normal]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "short_dw2 = [1][CC][1][1]",
    ]);
    expect(rulesOf(lint(parseDocument(text)))).toContain("lint/beyond-keytimes");
  });

  it("color format: not three 0xRRGGBB groups", () => {
    const text = keyBlock([
      "keytimes = [1]",
      "ledmode = [normal]",
      "ledcolor0 = [0xZZZZZZ][0x000000][0x000000]",
    ]);
    const diags = lint(parseDocument(text));
    expect(rulesOf(diags)).toContain("lint/color-format");
    expect(diags.find((d) => d.rule === "lint/color-format")?.severity).toBe("error");
  });

  it("channel mismatch: a QC command on a different channel", () => {
    const text = keyBlock([
      "keytimes = [2]",
      "ledmode = [normal]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "short_dw1 = [1][CC][43][0]", // QC scene A on ch 1 -> expected QC channel
      "short_dw2 = [2][CC][44][127]", // QC tap on ch 2 -> mismatch
    ]);
    expect(rulesOf(lint(parseDocument(text)))).toContain("lint/channel-mismatch");
  });

  it("channel mismatch honors an explicit expected channel", () => {
    const text = keyBlock([
      "keytimes = [1]",
      "ledmode = [normal]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "short_dw1 = [1][CC][43][0]", // QC on ch 1
    ]);
    expect(rulesOf(lint(parseDocument(text), { qcChannel: 5 }))).toContain("lint/channel-mismatch");
  });

  it("mixed select groups on one page", () => {
    const text = [
      "[key1]",
      "keytimes = [1]",
      "ledmode = [select]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "",
      "[key2]",
      "keytimes = [1]",
      "ledmode = [select1]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
      "",
    ].join("\n");
    expect(rulesOf(lint(parseDocument(text)))).toContain("lint/mixed-select-groups");
  });

  it("select mode with keytimes > 1 (info)", () => {
    const text = keyBlock([
      "keytimes = [3]",
      "ledmode = [select]",
      "ledcolor0 = [0x000000][0x000000][0x000000]",
    ]);
    const diags = lint(parseDocument(text));
    const found = diags.find((d) => d.rule === "lint/select-keytimes");
    expect(found?.severity).toBe("info");
  });
});

describe("lint produces no error-severity findings on real fixtures", () => {
  for (const parts of listPageFixtures()) {
    it(`clean: ${parts.join("/")}`, () => {
      const errors = lint(parseDocument(readFixture(...parts))).filter((d) => d.severity === "error");
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    });
  }
});

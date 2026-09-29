/** Tests for schema/contract validation. */
import { describe, it, expect } from "vitest";
import { parseDocument } from "../src/document";
import { validate } from "../src/schema";
import { listPageFixtures, readFixture } from "./helpers";

describe("validate over real fixtures", () => {
  for (const parts of listPageFixtures()) {
    it(`no contract errors: ${parts.join("/")}`, () => {
      const errors = validate(parseDocument(readFixture(...parts))).filter((d) => d.severity === "error");
      // Surface any error messages if this ever fails.
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    });
  }
});

describe("validate catches contract violations", () => {
  const bad = [
    "[GlobalSetup]",
    "page_name = [TEST]",
    "ledbright = [200]", // out of range 0-100
    "mysteryKey = [1]", // unknown global key
    "",
    "[key1]",
    "keytimes = [1]",
    "ledmode = [disco]", // not a valid ledmode
    "ledcolor0 = [0x000000][0x000000][0x000000]",
    "bogus = [1]", // unknown key in a key section
    "",
    "[keyZ]", // unknown section
    "keytimes = [1]",
    "ledmode = [normal]",
    "ledcolor0 = [0x000000][0x000000][0x000000]",
    "short_dw1 = [1][WAT][9][9]", // unrecognized command
    "",
  ].join("\n");

  const diags = validate(parseDocument(bad));
  const errorRules = diags.filter((d) => d.severity === "error").map((d) => d.rule);

  it("flags out-of-range values", () => {
    expect(errorRules).toContain("schema/range");
  });
  it("flags unknown keys (global and per-key)", () => {
    expect(errorRules).toContain("schema/unknown-key");
  });
  it("flags bad enums", () => {
    expect(errorRules).toContain("schema/enum");
  });
  it("flags unknown sections", () => {
    expect(errorRules).toContain("schema/unknown-section");
  });
  it("flags unrecognized commands", () => {
    expect(errorRules).toContain("schema/unknown-command");
  });
});

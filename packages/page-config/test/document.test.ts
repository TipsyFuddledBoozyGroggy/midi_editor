/** Unit tests for the format-preserving document model and byte-safe editing. */
import { describe, it, expect } from "vitest";
import { parseDocument, serializeDocument, serializeRebuilt } from "../src/document";
import { getRawValue, getBracketValues, setRawValue, getSections } from "../src/model";

describe("parseDocument / serializeDocument", () => {
  it("reproduces mixed EOLs and a missing final newline exactly", () => {
    const text = "a\r\nb\nc";
    const doc = parseDocument(text);
    expect(serializeDocument(doc)).toBe(text);
    expect(serializeRebuilt(doc)).toBe(text);
  });

  it("preserves blank lines and odd separators", () => {
    const text = ["[GlobalSetup]", "BATTERY_CHARGE= [off]", "WIRELESS_ID   = [8]", "", "PC_group_0 = ", ""].join("\n");
    const doc = parseDocument(text);
    expect(serializeRebuilt(doc)).toBe(text);
  });

  it("classifies lines and exposes sections", () => {
    const doc = parseDocument("[GlobalSetup]\nledbright = [80]\n\n[key1]\nkeytimes = [1]\n");
    expect(getSections(doc)).toEqual(["GlobalSetup", "key1"]);
  });
});

describe("byte-safe editing", () => {
  const text = "[GlobalSetup]\nledbright = [80]\nscreenbright = [80]\n";

  it("changes only the edited line and marks it dirty", () => {
    const doc = parseDocument(text);
    expect(setRawValue(doc, "GlobalSetup", "ledbright", "[90]")).toBe(true);
    expect(serializeDocument(doc)).toBe("[GlobalSetup]\nledbright = [90]\nscreenbright = [80]\n");
    // The untouched line stays clean (emitted from its original bytes).
    const dirty = doc.lines.filter((l) => l.dirty).map((l) => l.key);
    expect(dirty).toEqual(["ledbright"]);
  });

  it("returns false for a missing entry and leaves the doc unchanged", () => {
    const doc = parseDocument(text);
    expect(setRawValue(doc, "GlobalSetup", "does_not_exist", "x")).toBe(false);
    expect(serializeDocument(doc)).toBe(text);
  });

  it("reads raw values and bracket groups", () => {
    const doc = parseDocument("[key1]\nledcolor0 = [0xFF0000][0x00FF00][0x0000FF]\n");
    expect(getRawValue(doc, "key1", "ledcolor0")).toBe("[0xFF0000][0x00FF00][0x0000FF]");
    expect(getBracketValues(doc, "key1", "ledcolor0")).toEqual(["0xFF0000", "0x00FF00", "0x0000FF"]);
  });

  it("setting the same value is a no-op that keeps the line clean", () => {
    const doc = parseDocument(text);
    expect(setRawValue(doc, "GlobalSetup", "ledbright", "[80]")).toBe(true);
    expect(doc.lines.some((l) => l.dirty)).toBe(false);
  });
});

/**
 * The contract guarantee: for every real device file, parsing then serializing
 * returns the exact same bytes — via both the identity serializer and the
 * parts-rebuilt serializer (which proves each line was decomposed losslessly).
 *
 * A failure here means the parser lost or changed something, which would corrupt
 * the firmware contract on export. This test gates every change to the model.
 */
import { describe, it, expect } from "vitest";
import { parseDocument, serializeDocument, serializeRebuilt } from "../src/document";
import { roundtripEquals } from "../src/index";
import { listPageFixtures, readFixture } from "./helpers";

describe("byte-exact round trip over real device files", () => {
  const fixtures = listPageFixtures();

  it("has fixtures to test", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const parts of fixtures) {
    const rel = parts.join("/");
    it(`identity + rebuilt: ${rel}`, () => {
      const text = readFixture(...parts);
      const doc = parseDocument(text);
      expect(serializeDocument(doc)).toBe(text);
      expect(serializeRebuilt(doc)).toBe(text);
      expect(roundtripEquals(text)).toBe(true);
    });
  }
});

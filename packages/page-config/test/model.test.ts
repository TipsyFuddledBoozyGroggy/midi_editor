/** Tests for the semantic projection (buildPage) over a real, rich fixture. */
import { describe, it, expect } from "vitest";
import { parseDocument } from "../src/document";
import { buildPage } from "../src/model";
import { readFixture } from "./helpers";

describe("buildPage over supersetup/page0.txt (TKMKII)", () => {
  const page = buildPage(parseDocument(readFixture("supersetup", "page0.txt")));

  it("reads GlobalSetup values (first bracket unwrapped)", () => {
    expect(page.globalByKey.get("page_name")?.value).toBe("TKMKII");
    expect(page.globalByKey.get("ledbright")?.value).toBe("80");
    expect(page.globalByKey.get("externalmidicontrol")?.value).toBe("off");
  });

  it("decodes all ten key sections in order", () => {
    expect(page.keys.map((k) => k.name)).toEqual([
      "key1", "key2", "key3", "key4", "key5", "keyA", "keyB", "keyC", "keyD", "keyE",
    ]);
    expect(page.keys.map((k) => k.suffix)).toEqual(["1", "2", "3", "4", "5", "A", "B", "C", "D", "E"]);
  });

  it("reads keytimes, ledmode and colors per key", () => {
    const key1 = page.keys.find((k) => k.name === "key1")!;
    expect(key1.keytimes).toBe(10);
    expect(key1.ledmode).toBe("select");
    expect(key1.colors.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(key1.colors[0]?.groups).toEqual(["0x000000", "0x000000", "0x000000"]);
  });

  it("groups triggers into steps that share their 4 command slots", () => {
    const key3 = page.keys.find((k) => k.name === "key3")!;
    const step1 = key3.steps.find((s) => s.step === 1)!;
    // long1 (2 cmds) + short_up1 (1) + long_up1 (1) = 4 commands on step 1.
    expect(step1.commandCount).toBe(4);
    expect(step1.triggers.map((t) => t.state).sort()).toEqual(["long", "longup", "shortup"]);
  });

  it("attaches trigger names and parses commands", () => {
    const key3 = page.keys.find((k) => k.name === "key3")!;
    const shortUp1 = key3.triggers.find((t) => t.key === "short_up1")!;
    expect(shortUp1.name).toBe("SCENE");
    expect(shortUp1.commands[0]?.command).toEqual({ type: "cc", channel: "1", number: "47", value: "0" });

    const longUp1 = key3.triggers.find((t) => t.key === "long_up1")!;
    expect(longUp1.state).toBe("longup");
    expect(longUp1.commands[0]?.command).toEqual({ type: "preset", action: "value_inc" });
  });
});

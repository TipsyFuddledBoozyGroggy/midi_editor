/** Shared helpers for loading the real device-file fixtures. */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, "fixtures");

/** Absolute path to a fixture, e.g. `fixturePath("pages", "page0.txt")`. */
export function fixturePath(...parts: string[]): string {
  return join(FIXTURES, ...parts);
}

/** Read a fixture as UTF-8 text, preserving its exact bytes/line endings. */
export function readFixture(...parts: string[]): string {
  return readFileSync(fixturePath(...parts), "utf8");
}

/** Every real page fixture, as `[relativeParts]` tuples for both fixture folders. */
export function listPageFixtures(): string[][] {
  const out: string[][] = [];
  for (const dir of ["pages", "supersetup"]) {
    for (const name of readdirSync(fixturePath(dir))) {
      if (name.toLowerCase().endsWith(".txt")) out.push([dir, name]);
    }
  }
  return out;
}

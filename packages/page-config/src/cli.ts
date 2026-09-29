/**
 * Small CLI over the page-config core: validate, lint, and byte-exact round-trip
 * checks for one or more page files (or directories of them).
 *
 * Usage:
 *   tsx src/cli.ts roundtrip <path...>   # prove serialize(parse(file)) === file
 *   tsx src/cli.ts validate  <path...>   # schema/contract checks
 *   tsx src/cli.ts lint      <path...>   # behavioral lint rules
 *   tsx src/cli.ts check     <path...>   # validate + lint
 *
 * Exits non-zero if any error-severity finding (or a failed round-trip) is seen,
 * so it can gate CI.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, serializeDocument, serializeRebuilt } from "./document";
import { validate } from "./schema";
import { lint } from "./lint";
import type { Diagnostic } from "./model";

type Command = "roundtrip" | "validate" | "lint" | "check";

const SEVERITY_LABEL: Record<Diagnostic["severity"], string> = {
  error: "ERROR",
  warning: "WARN ",
  info: "INFO ",
};

/** Expand any directory arguments into the `.txt` files inside them. */
function expandPaths(paths: string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      console.error(`Cannot access: ${p}`);
      continue;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name.toLowerCase().endsWith(".txt")) files.push(join(p, name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function printDiagnostics(diags: Diagnostic[]): void {
  for (const d of diags) {
    const loc = d.line != null ? `line ${d.line}` : d.section ? `[${d.section}]` : "";
    const where = loc ? `${loc}: ` : "";
    console.log(`  ${SEVERITY_LABEL[d.severity]} ${d.rule}  ${where}${d.message}`);
  }
}

function main(): void {
  const [command, ...paths] = process.argv.slice(2) as [Command | undefined, ...string[]];

  if (!command || !["roundtrip", "validate", "lint", "check"].includes(command)) {
    console.error("Usage: cli.ts <roundtrip|validate|lint|check> <path...>");
    process.exit(2);
  }
  if (paths.length === 0) {
    console.error("No files given.");
    process.exit(2);
  }

  const files = expandPaths(paths);
  let hadError = false;

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      console.error(`Cannot read: ${file}`);
      hadError = true;
      continue;
    }

    console.log(file);

    if (command === "roundtrip") {
      const doc = parseDocument(text);
      const identity = serializeDocument(doc) === text;
      const rebuilt = serializeRebuilt(doc) === text;
      if (identity && rebuilt) {
        console.log("  ✓ byte-exact round trip");
      } else {
        hadError = true;
        console.log(`  ✗ round trip FAILED (identity=${identity}, rebuilt=${rebuilt})`);
      }
      continue;
    }

    const doc = parseDocument(text);
    const diags: Diagnostic[] =
      command === "validate" ? validate(doc) : command === "lint" ? lint(doc) : [...validate(doc), ...lint(doc)];

    if (diags.length === 0) {
      console.log("  ✓ no issues");
    } else {
      printDiagnostics(diags);
      if (diags.some((d) => d.severity === "error")) hadError = true;
    }
  }

  process.exit(hadError ? 1 : 0);
}

main();

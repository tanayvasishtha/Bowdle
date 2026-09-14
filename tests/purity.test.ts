import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SHARED = resolve("src/shared");

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const IMPORT_SPECIFIER =
  /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;
const FORBIDDEN = /\b(window|document|navigator|localStorage|process|Buffer|require)\b|Math\.random\s*\(/;

describe("src/shared purity", () => {
  const files = sourceFiles(SHARED);

  it("imports only files inside src/shared", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of stripComments(readFileSync(file, "utf8")).matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1] ?? match[2] ?? match[3] ?? "";
        const escapes = relative(SHARED, resolve(dirname(file), specifier)).startsWith("..");
        if (!specifier.startsWith(".") || escapes) {
          offenders.push(`${relative(process.cwd(), file)} imports "${specifier}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never uses DOM globals, Node globals or Math.random", () => {
    const offenders = files
      .filter((file) => FORBIDDEN.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});

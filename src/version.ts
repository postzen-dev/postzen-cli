// Package version, read from package.json at runtime (works from dist/ too:
// dist/version.js -> ../package.json is the package root in both dev and npm installs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

let resolved = "0.0.0";
try {
	resolved = (JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string }).version ?? "0.0.0";
} catch {
	// Fall back to the placeholder; not worth failing the CLI over.
}

export const version = resolved;

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RESOURCE_TREES = [
  "bundled/workflows/modeling-core/1.0.0",
  "bundled/capabilities/modeling-paper-standard/1.0.0",
  "bundled/capabilities/modeling-plot-suite/1.0.0",
  "bundled/capabilities/modeling-submission-package/1.0.0",
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotTree(productRoot, relativeRoot) {
  const root = resolve(productRoot, ...relativeRoot.split("/"));
  const files = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) throw new Error(`Resource tree contains a symlink: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.set(relative(root, path).replaceAll("\\", "/"), digest(readFileSync(path)));
    }
  }
  walk(root);
  return files;
}

function compareTree(expectedRoot, actualRoot, relativeRoot) {
  const expected = snapshotTree(expectedRoot, relativeRoot);
  const actual = snapshotTree(actualRoot, relativeRoot);
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  const drift = paths.filter((path) => expected.get(path) !== actual.get(path));
  if (drift.length) throw new Error(`Resource parity failed for ${relativeRoot}: ${drift.join(", ")}`);

  const manifestPath = [...expected.keys()].find((path) => path === "manifest.json");
  const routeHash = manifestPath
    ? digest(canonicalJson(JSON.parse(readFileSync(join(expectedRoot, ...relativeRoot.split("/"), manifestPath), "utf8"))))
    : null;
  return { files: expected.size, routeHash };
}

const expectedRoot = resolve(process.argv[2] ?? process.cwd());
const actualRoot = resolve(process.argv[3] ?? "");
if (!process.argv[3]) {
  console.error("Usage: node scripts/check-hajimi-resource-parity.mjs <development-product-root> <packaged-product-root>");
  process.exit(2);
}

try {
  for (const relativeRoot of RESOURCE_TREES) {
    const result = compareTree(expectedRoot, actualRoot, relativeRoot);
    console.log(`${relativeRoot}: ${result.files} files match${result.routeHash ? `; route hash ${result.routeHash}` : ""}`);
  }
} catch (error) {
  console.error(`check-hajimi-resource-parity: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { checkPlotRecipeRouting } from './check-plot-recipe-routing.mjs';

const projectRoot = resolve(process.cwd());
const capabilitiesRoot = join(projectRoot, "bundled", "capabilities");
const expected = [
  ["modeling-paper-standard", "1.0.0"],
  ["modeling-plot-suite", "1.0.0"],
  ["modeling-submission-package", "1.0.0"],
];
const checkSource = process.argv.includes("--source");
const sourceRoot = process.env.HAJIMI_CODEX_SKILLS_ROOT?.trim()
  || (process.env.USERPROFILE ? join(process.env.USERPROFILE, ".codex", "skills") : null);

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertStringArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  if (nonEmpty && value.length === 0) throw new Error(`${label} must not be empty`);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
}

function assertStages(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((stage) => !Number.isInteger(stage) || stage < 0 || stage > 9)) {
    throw new Error(`${label} must contain HaJiMi stages 0 through 9`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate stages`);
}

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

for (const [id, version] of expected) {
  const root = join(capabilitiesRoot, id, version);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== "hajimi.capability-manifest.v1" || manifest.id !== id || manifest.version !== version) {
    throw new Error(`Invalid capability identity: ${id}@${version}`);
  }
  assertStages(manifest.allowedStages, `${id}.allowedStages`);
  assertStringArray(manifest.requiredInputs, `${id}.requiredInputs`, { nonEmpty: true });
  assertStringArray(manifest.toolScopes, `${id}.toolScopes`, { nonEmpty: true });
  if (!manifest.activation || JSON.stringify(manifest.activation.stages) !== JSON.stringify(manifest.allowedStages)
      || manifest.activation.requiresActiveEvidenceFreeze !== true || manifest.activation.persistRoute !== true) {
    throw new Error(`Invalid activation contract: ${id}@${version}`);
  }
  if (!Array.isArray(manifest.contextFragments) || manifest.contextFragments.length === 0) {
    throw new Error(`Capability has no context fragments: ${id}@${version}`);
  }
  if (JSON.stringify(manifest.contextFragments) !== JSON.stringify(manifest.fragments)) {
    throw new Error(`Legacy and governed fragment lists disagree: ${id}@${version}`);
  }
  const listed = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 0
        || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid capability file record: ${id}/${entry?.path ?? "unknown"}`);
    }
    if (listed.has(entry.path)) throw new Error(`Duplicate capability file record: ${id}/${entry.path}`);
    const path = resolve(root, ...entry.path.split("/"));
    const relativePath = relative(root, path);
    if (relativePath.startsWith("..") || relativePath === "" || relativePath.includes(":")) {
      throw new Error(`Capability path escapes its root: ${entry.path}`);
    }
    const info = await stat(path);
    const actualHash = digest(await readFile(path));
    if (!info.isFile() || info.size !== entry.sizeBytes || actualHash !== entry.sha256) {
      throw new Error(`Capability file drift: ${id}/${entry.path}`);
    }
    listed.add(entry.path);
  }
  const fragmentIds = new Set();
  for (const fragment of manifest.contextFragments) {
    if (!fragment || typeof fragment.id !== "string" || !fragment.id.trim() || fragmentIds.has(fragment.id)
        || typeof fragment.path !== "string" || !listed.has(fragment.path)
        || !Number.isFinite(fragment.priority)) {
      throw new Error(`Invalid or unhashed capability fragment: ${id}/${fragment?.id ?? "unknown"}`);
    }
    assertStages(fragment.stages, `${id}.${fragment.id}.stages`);
    if (fragment.stages.some((stage) => !manifest.allowedStages.includes(stage))) {
      throw new Error(`Capability fragment escapes allowed stages: ${id}/${fragment.id}`);
    }
    if (fragment.tags !== undefined) assertStringArray(fragment.tags, `${id}.${fragment.id}.tags`, { nonEmpty: true });
    fragmentIds.add(fragment.id);
  }
  const actual = (await walk(root))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => path !== "manifest.json" && path !== "manifest.json.tmp");
  const extras = actual.filter((path) => !listed.has(path));
  const missing = [...listed].filter((path) => !actual.includes(path));
  if (extras.length || missing.length) throw new Error(`Capability manifest coverage mismatch for ${id}: extras=${extras.join(",")} missing=${missing.join(",")}`);
  if (checkSource) {
    if (!sourceRoot) throw new Error("--source requires USERPROFILE or HAJIMI_CODEX_SKILLS_ROOT");
    const sourceSkill = id === 'modeling-submission-package'
      ? join(process.env.HAJIMI_SUBMISSION_SKILL_ROOT || 'C:/Users/hhhh/Desktop/MathModeling-AI-Lab/.codex/skills/modeling-submission-package', 'SKILL.md')
      : id === 'modeling-plot-suite'
        ? join(projectRoot, 'toolkit/legacy-modeling-plot-suite/SKILL.md')
        : join(sourceRoot, id, "SKILL.md");
    if (digest(await readFile(sourceSkill)) !== manifest.source.entrypointSha256) {
      throw new Error(`Upstream Codex skill changed; review and resync explicitly: ${id}`);
    }
  }
  process.stdout.write(`${id}@${version}: ${manifest.files.length} files verified\n`);
}

process.stdout.write(await checkPlotRecipeRouting(projectRoot) + '\n');

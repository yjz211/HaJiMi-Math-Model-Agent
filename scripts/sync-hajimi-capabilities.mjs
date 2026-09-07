import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { adaptHajimiPaper } from "./adapt-hajimi-paper.mjs";
import { patchHajimiLegacyPlot } from './patch-hajimi-legacy-plot.mjs';

const projectRoot = resolve(process.cwd());
const configuredRoot = process.env.HAJIMI_CODEX_SKILLS_ROOT?.trim();
const userProfile = process.env.USERPROFILE?.trim();
const skillsRoot = resolve(configuredRoot || (userProfile ? join(userProfile, ".codex", "skills") : ""));
if (!configuredRoot && !userProfile) throw new Error("Set HAJIMI_CODEX_SKILLS_ROOT when USERPROFILE is unavailable");

const capabilities = [
  {
    id: "modeling-paper-standard",
    version: "1.0.0",
    sourceDirectory: "modeling-paper-standard",
    allowedStages: [8],
    requiredInputs: ["active_evidence_freeze"],
    toolScopes: ["hajimi_bind_publication", "hajimi_validate_delivery", "bash:bundled-paper-checkers"],
    copy: [
      "SKILL.md",
      ...[
        "structure-contract.md",
        "writing-patterns.md",
        "plain-competition-language.md",
        "language-contract.md",
        "direct-competition-language.md",
        "video-language-playbook.md",
        "layout-contract.md",
        "review-contract.md",
        "data-analysis-paper-route.md",
        "optimization-paper-route.md",
      ].map((name) => `references/${name}`),
      ...[
        "check_latex_equation_drift.py",
        "check_latex_language.py",
        "check_latex_layout_risks.py",
        "check_latex_structure.py",
        "check_pdf_large_float.py",
        "check_pdf_page_flow.py",
        "check_pdf_page_gate.py",
        "check_section_balance.py",
      ].map((name) => `scripts/${name}`),
    ],
    fragments: [
      { id: "paper-stage-8-core", path: "fragments/stage-8-core.md", priority: 100, stages: [8] },
      { id: "paper-data-route", path: "fragments/data-route.md", priority: 70, stages: [8], tags: ["data", "statistics", "machine-learning"] },
      { id: "paper-optimization-route", path: "fragments/optimization-route.md", priority: 70, stages: [8], tags: ["optimization", "planning", "scheduling", "routing"] },
      { id: "paper-graph-network-route", path: "fragments/graph-network-route.md", priority: 70, stages: [8], tags: ["graph", "network"] },
      { id: "paper-review-gates", path: "fragments/review-gates.md", priority: 60, stages: [8] },
    ],
    commands: [
      "python3 {capabilityRoot}/resources/scripts/create_paper_skeleton.py",
      "python3 {capabilityRoot}/resources/scripts/check_pdf_typography.py",
      "python3 {capabilityRoot}/resources/scripts/check_latex_structure.py",
      "python3 {capabilityRoot}/resources/scripts/check_latex_language.py",
      "python3 {capabilityRoot}/resources/scripts/check_latex_layout_risks.py",
      "python3 {capabilityRoot}/resources/scripts/check_pdf_page_gate.py",
      "python3 {capabilityRoot}/resources/scripts/check_pdf_large_float.py",
      "python3 {capabilityRoot}/resources/scripts/check_pdf_page_flow.py",
    ],
    omitted: ["assets/reference.doc", "assets/reference.docx", "assets/reference-preview.png", "references/evolution-protocol.md", "tests", "__pycache__"],
  },
  {
    id: "modeling-plot-suite",
    version: "1.0.0",
    sourceDirectory: "modeling-plot-suite",
    allowedStages: [7, 8],
    requiredInputs: ["active_evidence_freeze"],
    toolScopes: ["hajimi_bind_publication", "hajimi_validate_delivery", "bash:bundled-plot-checkers"],
    copy: [
      "SKILL.md",
      ...[
        "router-contract.md", "figure-set-exemplars.md", "data-figures.md", "technical-diagrams.md",
        "scientific-illustration.md", "html-diagrams.md", "mermaid-diagrams.md", "paper-layout-gate.md",
        "style-system.md", "drawio-design-guide.md", "tikz-design-guide.md", "figure-design-catalog.md",
      ].map((name) => `references/${name}`),
      ...[
        "data-figures.md", "technical-diagrams.md", "scientific-illustration.md", "html-diagrams.md", "mermaid-diagrams.md",
      ].map((name) => `workflows/${name}`),
      ...[
        "audit_final_figure_size.py", "check_drawio.py", "check_html_geometry.py", "check_html_pdf.py",
        "check_latex_figure_sizes.py", "check_plot_source.py", "check_tikz.py", "export_drawio.py",
        "get_recipe.py", "normalize_latex_figures.py", "render_html.py", "render_mermaid.py",
        "render_pdf_preview.py", "render_svg.py", "resolve_runtime.py", "setup_workspace.py", "validate_figure_manifest.py",
      ].map((name) => `scripts/${name}`),
      ...["plot_utils.py", "stats_utils.py", "table_slim.py"].map((name) => `assets/plotting/${name}`),
      ...["themes.css", "tpl_arch.html", "tpl_flow.html", "tpl_framework.html", "tpl_pipeline.html", "tpl_roadmap.html"].map((name) => `assets/html-templates/${name}`),
      ...["figure_recipes_academic.md", "figure_recipes_advanced.md", "figure_recipes_basic.md", "figure_recipes_competition.md", "figure_recipes_empirical.md"].map((name) => `assets/recipes/${name}`),
      "assets/geo/china_provinces.geojson",
      "assets/tikz_examples_extra.tex",
    ],
    fragments: [
      { id: "plot-original-size-preflight", path: "fragments/original-size-preflight.md", priority: 200, stages: [7, 8] },
      { id: "plot-original-color-usage", path: "fragments/original-color-usage.md", priority: 190, stages: [7, 8] },
      { id: "plot-stage-8-core", path: "fragments/stage-8-core.md", priority: 100, stages: [8] },
      { id: "plot-data", path: "fragments/data-figures.md", priority: 70, stages: [7, 8], tags: ["data", "simulation"] },
      { id: "plot-statistics", path: "fragments/statistics-figures.md", priority: 75, stages: [7, 8], tags: ["statistics", "machine-learning"] },
      { id: "plot-optimization", path: "fragments/optimization-figures.md", priority: 75, stages: [7, 8], tags: ["optimization", "planning", "scheduling", "routing"] },
      { id: "plot-graph-network", path: "fragments/graph-network-figures.md", priority: 75, stages: [7, 8], tags: ["graph", "network"] },
      { id: "plot-technical", path: "fragments/technical-diagrams.md", priority: 65, stages: [8], tags: ["geometry", "mechanism", "flowchart"] },
      { id: "plot-layout", path: "fragments/layout-gate.md", priority: 60, stages: [8] },
    ],
    commands: [
      "python3 {capabilityRoot}/resources/scripts/validate_figure_manifest.py --profile modeling --full-paper",
      "python3 {capabilityRoot}/resources/scripts/bootstrap.py --profile modeling-competition --capability paper-figure",
      "bash {capabilityRoot}/resources/assets/shared-scripts/figure_check.sh",
      "python3 {capabilityRoot}/resources/assets/shared-scripts/fig_size_consistency_check.py",
      "python3 {capabilityRoot}/resources/assets/shared-scripts/audit_final_figure_size.py",
    ],
    omitted: ["__pycache__"],
  },
];

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--only' || !capabilities.some(item => item.id === args[1]))) {
  throw new Error('Usage: sync-hajimi-capabilities.mjs [--only modeling-paper-standard|modeling-plot-suite]');
}
for (const capability of capabilities.filter(item => !args.length || item.id === args[1])) {
  const legacyPlot = capability.id === 'modeling-plot-suite';
  const sourceRoot = legacyPlot
    ? join(projectRoot, 'toolkit', 'legacy-modeling-plot-suite')
    : join(skillsRoot, capability.sourceDirectory);
  const destinationRoot = join(projectRoot, "bundled", "capabilities", capability.id, capability.version);
  const sourceSkill = join(sourceRoot, "SKILL.md");
  await stat(sourceSkill);
  const copyPaths = legacyPlot
    ? (await walk(sourceRoot)).map(path => normalizePath(relative(sourceRoot, path)))
      .filter(path => !path.includes('__pycache__') && !path.endsWith('.pyc'))
    : capability.copy;
  for (const relativePath of copyPaths) {
    const source = join(sourceRoot, ...relativePath.split("/"));
    const destination = join(destinationRoot, "resources", ...relativePath.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  if (capability.id === "modeling-paper-standard") await adaptHajimiPaper(destinationRoot);
  if (legacyPlot) await patchHajimiLegacyPlot(destinationRoot);
  const sourceEntrypointHash = await sha256File(sourceSkill);
  const files = [];
  for (const path of (await walk(destinationRoot)).filter(path => !path.includes('__pycache__') && !path.endsWith('.pyc'))) {
    if (path === join(destinationRoot, "manifest.json")) continue;
    const info = await stat(path);
    files.push({
      path: normalizePath(relative(destinationRoot, path)),
      sizeBytes: info.size,
      sha256: await sha256File(path),
    });
  }
  const manifest = {
    schemaVersion: "hajimi.capability-manifest.v1",
    id: capability.id,
    version: capability.version,
    source: {
      kind: "user-authorized-local-codex-skill",
      logicalPath: legacyPlot ? 'toolkit/legacy-modeling-plot-suite' : `.codex/skills/${capability.sourceDirectory}`,
      entrypointSha256: sourceEntrypointHash,
      licenseStatus: "not-declared-in-source-snapshot",
      redistributionScope: "HaJiMi local and packaged builds authorized by the user",
    },
    allowedStages: capability.allowedStages,
    requiredInputs: capability.requiredInputs,
    toolScopes: capability.toolScopes,
    contextFragments: capability.fragments,
    activation: { stages: capability.allowedStages, requiresActiveEvidenceFreeze: true, persistRoute: true },
    fragments: capability.fragments,
    commands: capability.commands,
    files,
    omitted: capability.omitted,
  };
  const temporary = join(destinationRoot, "manifest.json.tmp");
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, join(destinationRoot, "manifest.json"));
  process.stdout.write(`${capability.id}@${capability.version}: ${files.length} hashed files\n`);
}

if (!args.length) await import('./sync-hajimi-submission.mjs');

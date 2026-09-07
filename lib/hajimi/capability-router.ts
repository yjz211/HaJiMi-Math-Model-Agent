import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./workflow-definition.ts";
import type { HajimiCapabilityRouteDecision, HajimiStageId, HajimiWorkflowState } from "./workflow-types.ts";

export const BUNDLED_CAPABILITIES = [
  { id: "modeling-paper-standard", version: "1.0.0" },
  { id: "modeling-plot-suite", version: "1.0.0" },
  { id: "modeling-submission-package", version: "1.0.0" },
] as const;

interface CapabilityFileEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

interface CapabilityFragmentEntry {
  id: string;
  path: string;
  priority: number;
  stages: HajimiStageId[];
  tags?: string[];
}

export interface HajimiCapabilityManifest {
  schemaVersion: "hajimi.capability-manifest.v1";
  id: string;
  version: string;
  source: {
    kind: "user-authorized-local-codex-skill";
    logicalPath: string;
    entrypointSha256: string;
    licenseStatus: string;
    redistributionScope: string;
  };
  allowedStages: HajimiStageId[];
  requiredInputs: string[];
  toolScopes: string[];
  contextFragments: CapabilityFragmentEntry[];
  activation: { stages: HajimiStageId[]; requiresActiveEvidenceFreeze: boolean; persistRoute: boolean };
  fragments: CapabilityFragmentEntry[];
  commands: string[];
  files: CapabilityFileEntry[];
  omitted: string[];
}

export interface LoadedCapability {
  root: string;
  manifest: HajimiCapabilityManifest;
  manifestHash: string;
}

export interface CapabilityRoutingResult {
  decisions: HajimiCapabilityRouteDecision[];
  fragments: Array<{ capabilityId: string; text: string }>;
  contextChars: number;
  truncated: boolean;
  evidenceFreezeReady: boolean;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadCapabilityRegistry(productRoot: string): Promise<LoadedCapability[]> {
  const output: LoadedCapability[] = [];
  for (const expected of BUNDLED_CAPABILITIES) {
    const root = join(resolve(productRoot), "bundled", "capabilities", expected.id, expected.version);
    const manifestPath = join(root, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as HajimiCapabilityManifest;
    if (manifest.schemaVersion !== "hajimi.capability-manifest.v1" || manifest.id !== expected.id || manifest.version !== expected.version) {
      throw new Error(`Invalid bundled capability identity at ${manifestPath}`);
    }
    if (!Array.isArray(manifest.allowedStages) || !Array.isArray(manifest.requiredInputs) || !Array.isArray(manifest.toolScopes) || !Array.isArray(manifest.contextFragments)) {
      throw new Error(`Capability manifest lacks routing contracts: ${manifest.id}`);
    }
    if (JSON.stringify(manifest.allowedStages) !== JSON.stringify(manifest.activation.stages)) {
      throw new Error(`Capability stage contracts disagree: ${manifest.id}`);
    }
    const fileByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
    for (const entry of manifest.files) {
      const path = join(root, ...entry.path.split("/"));
      const info = await stat(path);
      if (!info.isFile() || info.size !== entry.sizeBytes || sha256(await readFile(path)) !== entry.sha256) {
        throw new Error(`Bundled capability file hash mismatch: ${manifest.id}/${entry.path}`);
      }
    }
    for (const fragment of manifest.contextFragments) {
      if (!fileByPath.has(fragment.path)) throw new Error(`Capability fragment is not hashed: ${manifest.id}/${fragment.path}`);
      if (fragment.stages.some((stage) => !manifest.allowedStages.includes(stage))) {
        throw new Error(`Capability fragment escapes allowed stages: ${manifest.id}/${fragment.id}`);
      }
    }
    output.push({ root, manifest, manifestHash: sha256(canonicalJson(manifest)) });
  }
  return output;
}

export async function routeCapabilities(input: {
  productRoot: string;
  state: HajimiWorkflowState;
  stage?: HajimiStageId;
  maxChars?: number;
  now?: string;
}): Promise<CapabilityRoutingResult> {
  const stage = input.stage ?? input.state.focus.stage;
  const maxChars = input.maxChars ?? 7_000;
  const registry = await loadCapabilityRegistry(input.productRoot);
  const activeFreeze = input.state.provenance.freezes.some(f => f.status === "active");
  const selected = registry.filter((capability) => capability.manifest.allowedStages.includes(stage));
  const eligibleFragments = selected.flatMap((capability) => capability.manifest.contextFragments
    .filter((fragment) => fragment.stages.includes(stage))
    .filter((fragment) => !fragment.tags || fragment.tags.some((tag) => input.state.problemTags.includes(tag)))
    .map((fragment) => ({ capability, fragment })))
    .sort((left, right) => right.fragment.priority - left.fragment.priority || left.fragment.id.localeCompare(right.fragment.id));
  const decisions = selected.map((capability) => {
    const fragmentIds = eligibleFragments.filter((item) => item.capability === capability).map((item) => item.fragment.id);
    const missingInputs = capability.manifest.requiredInputs.filter((required) =>
      (required === "human_accepted_paper" && !input.state.interaction?.finalAccepted));
    return ({
    routeId: `${capability.manifest.id}@${capability.manifest.version}:${capability.manifestHash}:stage-${stage}:${sha256(fragmentIds.join("|"))}`,
    capabilityId: capability.manifest.id,
    capabilityVersion: capability.manifest.version,
    sourceHash: capability.manifestHash,
    activationReason: `Stage ${stage} automatic route for tags [${input.state.problemTags.join(", ") || "unclassified"}]; ${missingInputs.length ? `blocked by ${missingInputs.join(", ")}` : "required inputs satisfied"}.`,
    fragmentIds,
    availability: missingInputs.length ? "blocked_missing_input" : "ready",
    stage,
    persisted: capability.manifest.activation.persistRoute,
    routedAt: input.now ?? new Date().toISOString(),
  } satisfies HajimiCapabilityRouteDecision);
  });
  const fragments: Array<{ capabilityId: string; text: string }> = [];
  let contextChars = 0;
  let truncated = false;
  // The entrypoint is the actual workflow; fragments below are routing hints.
  // Reserve its discovery instructions before optional tag-specific summaries.
  for (const capability of selected) {
    const resourceRoot = join(capability.root, "resources");
    const text = [
      `Skill ${capability.manifest.id}: read ${join(resourceRoot, "SKILL.md")} before using this capability.`,
      `Bundled revision: ${capability.manifestHash}. Reload applicable guidance if this revision changed.`,
      `Resolve that skill's references, workflows, scripts and assets relative to ${resourceRoot}.`,
      "Follow the selected workflow and its required references completely; the stage summaries below do not replace them. At stage 8 read ../stage8-policy.md first. Its three-phase and light-review policy supersedes legacy repeated audit/repair loops, while writing standards and templates remain. Reuse unchanged guidance.",
      `Formal publication use remains limited to stages ${capability.manifest.allowedStages.join(", ")} ; binding derives the evidence snapshot automatically.`,
      capability.manifest.id === "modeling-plot-suite"
        ? "The user-designated pre-native-20260904 skill is the authoritative plotting implementation. For a new full-paper figure set, read ../upstream-planning.md and call hajimi_validate_figure_plan begin then validate before drawing. Read workflows/paper-figure.md and references/paper-figure.md completely for DATA; run scripts/bootstrap.py with the managed Python and follow its original _utils style-guide, recipe prefetch and per-figure workflow. The bundled helper fixes exported palette list identity; bootstrap refreshes only recognized pristine helpers in both _utils and skills/shared-scripts, preserving custom files. In new generators read active colors after setup_style(), e.g. import _utils.plot_utils as pu; pu.setup_style(); use pu.PALETTE and pu.COLORS. Map 鲜艳舒适型 to expressive and 稳重科研型 to restrained, using the stage-7 handoff direction. Preserve original defaults unless the user selects expressive or restrained: read ../profiles/<selection>.md relative to resources and apply the project palette/style markers. Do not substitute the migrated global skill. Apply the original-size-preflight excerpt below before writing figsize, using the actual include width and height constraints; no new sizing standard or automatic redraw gate. Recovery begins with the original manifest reconciliation and existing-output verification. INFO/WARNING alone do not justify regeneration; diagnose real defects and preserve prior outputs before any repair. Original source supplements must identify exact source and applicability. Frozen-evidence and user acceptance requirements remain in force."
        : "Preserve the full writing constraints and the selected paper route; checkers do not replace semantic and visual review.",
    ].join("\n");
    if (contextChars + text.length > maxChars) {
      truncated = true;
      continue;
    }
    fragments.push({ capabilityId: capability.manifest.id, text });
    contextChars += text.length;
  }
  for (const { capability, fragment } of eligibleFragments) {
    const path = join(capability.root, ...fragment.path.split("/"));
    const capabilityShellRoot = `$HAJIMI_CAPABILITIES_ROOT/${capability.manifest.id}/${capability.manifest.version}`;
    const guard = capability.manifest.requiredInputs.includes("human_accepted_paper") && !input.state.interaction?.finalAccepted
      ? "SUBMISSION BLOCKED: the user must accept the current stage-8 paper before stage-9 packaging. Do not accept on the user's behalf.\n"
      : "";
    const body = `${guard}Capability resource root for shell commands: ${capabilityShellRoot}\n${await readFile(path, "utf8")}`;
    if (contextChars + body.length > maxChars) {
      truncated = true;
      continue;
    }
    fragments.push({ capabilityId: capability.manifest.id, text: body });
    contextChars += body.length;
  }
  return { decisions, fragments, contextChars, truncated, evidenceFreezeReady: activeFreeze };
}

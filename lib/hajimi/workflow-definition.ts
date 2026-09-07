import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  HajimiRequirementDefinition,
  HajimiStageDefinition,
  HajimiWorkflowDefinition,
  HajimiWorkflowVersionPin,
} from "./workflow-types.ts";

export const MODELING_WORKFLOW_ID = "modeling-core" as const;
export const MODELING_WORKFLOW_VERSION = "1.0.0";
export const MODELING_WORKFLOW_RELATIVE_ROOT = join(
  "bundled",
  "workflows",
  MODELING_WORKFLOW_ID,
  MODELING_WORKFLOW_VERSION,
);

const SOURCE_MANIFEST_HASH = "b7557fec2a9b9359929468a3b8f2953f1167cb0203081842dd289a83b1c238b5";

function requirement(
  id: string,
  summary: string,
  evaluator: HajimiRequirementDefinition["evaluator"],
): HajimiRequirementDefinition {
  return { id, summary, evaluator, severity: "required" };
}

function stage(
  id: HajimiStageDefinition["id"],
  title: string,
  summary: string,
  dependencies: HajimiStageDefinition["dependencies"],
  requirements: HajimiRequirementDefinition[],
): HajimiStageDefinition {
  return {
    id,
    title,
    summary,
    dependencies,
    stageCard: `stage-cards/${id}.md`,
    requirements,
  };
}

export const MODELING_WORKFLOW_DEFINITION: HajimiWorkflowDefinition = {
  schemaVersion: "hajimi.workflow-definition.v1",
  id: MODELING_WORKFLOW_ID,
  version: MODELING_WORKFLOW_VERSION,
  protocolVersion: "hajimi.workflow-protocol.v1",
  sourceManifestHash: SOURCE_MANIFEST_HASH,
  stages: [
    stage(0, "材料就绪", "核验原题与附件是否完整、真实且可读取。", [], [
      requirement("input_manifest", "关键题目材料已清点、冻结并可读取。", "input_manifest"),
    ]),
    stage(1, "问题定义", "逐问提取事实、输出、变量、单位、目标、约束和歧义。", [0], [
      requirement("problem_contract", "事实、假设、待确认项与逐问输出已分开。", "human"),
    ]),
    stage(2, "数据审计与文献预研", "审计数据口径、质量和泄漏，并登记可靠方法来源。", [1], [
      requirement("data_and_sources", "数据变换与外部来源均可追溯。", "human"),
    ]),
    stage(3, "简单基线", "运行最简单的可解释基线并固定评价口径。", [2], [
      requirement("baseline_run", "基线已实际运行并保存失败案例。", "provenance_freeze"),
    ]),
    stage(4, "逐问建模与代码求解", "按依赖顺序完成每个小问的候选比较、实现和局部验证。", [3], [
      requirement("question_packets", "各问完成模型比较、求解和必要的独立验证。", "question_packets"),
    ]),
    stage(5, "整题集成与联合审查", "核对跨问数据、符号和接口，必要时端到端复算。", [4], [
      requirement("integrated_run", "逐问覆盖完整且整题入口运行通过。", "provenance_freeze"),
    ]),
    stage(6, "结果验证", "用适配任务的独立方法检查结论、稳健性和现实边界。", [5], [
      requirement("independent_validation", "每个关键结论至少有一种独立检查。", "provenance_freeze"),
    ]),
    stage(7, "证据与展示结果整理", "整理有效计算结果与展示方案，复用已有验证。", [6], [
      requirement("evidence_freeze", "关键结论有实际计算依据；登记与冻结可选。", "provenance_freeze"),
    ]),
    stage(8, "论文与图表制作", "依据实际建模结果生成图表、LaTeX 论文与 PDF 候选稿。", [7], [
      requirement("delivery_candidate", "交付实际论文源文件与PDF，供用户审查。", "delivery_validation"),
    ]),
    stage(9, "提交材料与打包", "人工验收正文后生成代码附录、AI使用说明和提交包。", [8], [
      requirement("human_final_review", "用户审查结论与所有高优先级问题均已记录。", "human"),
      requirement("submission_package", "两版论文、代码和AI说明已生成并打包为ZIP。", "delivery_validation"),
    ]),
  ],
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function workflowVersionPin(
  definition: HajimiWorkflowDefinition = MODELING_WORKFLOW_DEFINITION,
): HajimiWorkflowVersionPin {
  return {
    id: definition.id,
    version: definition.version,
    protocolVersion: definition.protocolVersion,
    definitionHash: sha256Text(canonicalJson(definition)),
    sourceManifestHash: definition.sourceManifestHash,
  };
}

export function validateWorkflowDefinition(definition: HajimiWorkflowDefinition): void {
  if (definition.id !== MODELING_WORKFLOW_ID) throw new Error(`Unsupported workflow: ${definition.id}`);
  if (definition.stages.length !== 10) throw new Error("The modeling workflow must define stages 0 through 9");
  for (let index = 0; index < definition.stages.length; index += 1) {
    const item = definition.stages[index];
    if (item.id !== index) throw new Error(`Workflow stage ${index} is missing or out of order`);
    if (item.dependencies.some((dependency) => dependency >= item.id)) {
      throw new Error(`Workflow stage ${item.id} has a non-prior dependency`);
    }
    const ids = item.requirements.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Workflow stage ${item.id} repeats a requirement id`);
  }
}

export async function loadBundledWorkflowDefinition(productRoot: string): Promise<HajimiWorkflowDefinition> {
  const path = join(resolve(productRoot), MODELING_WORKFLOW_RELATIVE_ROOT, "definition.json");
  const definition = JSON.parse(await readFile(path, "utf8")) as HajimiWorkflowDefinition;
  validateWorkflowDefinition(definition);
  const expected = workflowVersionPin(MODELING_WORKFLOW_DEFINITION).definitionHash;
  const actual = workflowVersionPin(definition).definitionHash;
  if (actual !== expected) throw new Error(`Bundled workflow definition hash mismatch: ${actual}`);
  return definition;
}

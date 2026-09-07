import { mkdir, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { translate } from "../i18n/index.ts";

export function modelingProjectsRoot() {
  return process.env.HAJIMI_PROJECTS_ROOT ?? join(homedir(), "Desktop", "HaJiMi", "projects");
}

export function projectLocationNotice(cwd: string) {
  const current = resolve(cwd);
  const root = resolve(modelingProjectsRoot());
  return translate("zh-CN", dirname(current) === root ? "hajimi.projectLocation" : "hajimi.existingProjectLocation", {
    root, cwd: current,
  });
}

/** Allocate only on an explicit create action. mkdir is the cross-process reservation. */
export async function createModelingDirectory(root = modelingProjectsRoot()) {
  await mkdir(root, { recursive: true });
  const names = await readdir(root);
  let index = Math.max(0, ...names.map(name => Number(/^数学建模(\d+)$/.exec(name)?.[1] ?? 0))) + 1;
  for (;;) {
    const name = `数学建模${index}`;
    const cwd = join(root, name);
    try {
      await mkdir(cwd);
      return { name, cwd };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      index++;
    }
  }
}

export const MODELING_START_PROMPT = "开始这道数模题目：请介绍你会如何协助我，并引导我上传第 0 阶段所需的材料。现在只处理上传和材料核对；执行方式与工作策略由阶段0完成后的两道独立问题询问，此时不要提前询问。";

export const STAGE_GUIDANCE = [
  "材料就绪：请在聊天框上传或拖入题目与数据附件。我会核对题目、附件和缺失材料，再建立输入快照。",
  "问题定义：梳理背景、逐问目标、约束和评价标准，形成清晰的问题清单。",
  "数据与文献：检查数据质量，整理必要的文献与依据，记录数据处理方法。",
  "简单基线：建立可复现的基础模型，先得到用于比较的基准结果。",
  "建模求解：比较候选方法、求解各问，按需要换方法交叉验证并迭代。",
  "整题集成：连接各问结果，统一变量、参数和接口，检查整题一致性。",
  "结果验证：检查误差、敏感性和稳健性，确认结论是否得到实验支持。",
  "结果整理：汇总有效计算结果与展示方案，复用已有验证，登记与冻结可选。",
  "论文与图表：依据实际建模结果组织论文、制作图表并交付可审查稿件。",
  "提交材料：你验收正文后，生成代码附录版、AI使用说明、复现附件与校验ZIP；提交的正文与你验收的版本保持一致。",
] as const;

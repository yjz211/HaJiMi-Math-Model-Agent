import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/** Allocate only on an explicit create action. mkdir is the cross-process reservation. */
export async function createModelingDirectory(root = process.env.HAJIMI_PROJECTS_ROOT ?? join(homedir(), "HaJiMi", "projects")) {
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

export const MODELING_START_PROMPT = "开始这道数模题目：请介绍你会如何协助我，并引导我上传第 0 阶段所需的材料。";

export const STAGE_GUIDANCE = [
  "材料就绪：请在聊天框上传或拖入题目与数据附件。我会核对题目、附件和缺失材料，再建立输入快照。",
  "问题定义：梳理背景、逐问目标、约束和评价标准，形成清晰的问题清单。",
  "数据与文献：检查数据质量，整理必要的文献与依据，记录数据处理方法。",
  "简单基线：建立可复现的基础模型，先得到用于比较的基准结果。",
  "建模求解：按每一问制定计划，选择模型、求解并记录实验与依赖。",
  "整题集成：连接各问结果，统一变量、参数和接口，检查整题一致性。",
  "结果验证：检查误差、敏感性和稳健性，确认结论是否得到实验支持。",
  "证据冻结：核对实验、证据和结论，锁定正式写作使用的结果版本。",
  "论文与图表：依据冻结的结果组织论文、制作图表并检查排版。",
  "提交材料：你验收正文后，生成代码附录版、AI使用说明、复现附件与校验ZIP；正文与冻结证据保持不变。",
] as const;

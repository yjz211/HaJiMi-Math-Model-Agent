import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { ensureHajimiTask, resolveHajimiGate } from "./task-state.ts";
import { captureStageFiles, fileReadUrl } from "./stage-files.ts";
import { mutateWorkflowState } from "./workflow-store.ts";
import { acceptFinalDelivery, rollbackWorkflow } from "./workflow-service.ts";
import type { HajimiInteraction, HajimiStageId, HajimiWorkflowState } from "./workflow-types.ts";

export function interactionFor(state: HajimiWorkflowState): HajimiInteraction {
  return state.interaction ?? { mode: "unselected", stageStartedAt: state.updatedAt, pending: null,
    reports: [], reviewedStages: [], finalAccepted: false, stageBaseline: [] };
}

export async function saveInteraction(cwd: string, state: HajimiWorkflowState, interaction: HajimiInteraction) {
  return mutateWorkflowState({ cwd, expectedRevision: state.revision, command: { kind: "set_interaction", interaction },
    ensure: async () => (await ensureHajimiTask(cwd)).state });
}

/** Recognize conversational assent while leaving questions/rework pending. */
export function reviewAssent(text: string): { direction: string } | null {
  const value = text.trim();
  if (/(?:如果|假如|比如|考虑|也许|可能|似乎|之前|是否|[吗么呢“”「」])/.test(value)) return null;
  if (!value || /[?？]|(?:不|别|先别|暂不)(?:要)?(?:同意|通过|继续|推进)|(?:不能|不可以|不行|不同意|通过不了)|(?:返工|重做|先修改|先改|(?<!没)有问题|还需修改|等一下|等等)/.test(value)) return null;
  const assent = /^(?:(?:嗯|嗯嗯|那|我觉得|我认为|这个阶段|当前阶段|这部分|结果)[，,\s]*)*(?:没问题|没有问题|可以|好的?|行|同意|确认|认可|通过|继续|往下|就这样|按你(?:的)?(?:建议|推荐|方案)|照你(?:的)?(?:建议|推荐|方案))/;
  if (!assent.test(value)) return null;
  // Retain the full user wording so a combined acceptance and direction survives.
  return { direction: value.replace(/^(?:继续下一阶段|同意继续|确认继续|继续|通过)\s*[:：]\s*/, "") };
}

/** Only a current user-origin message can be semantically accepted by the model. */
export async function recordReviewInput(cwd: string, text: string) {
  const state = (await ensureHajimiTask(cwd)).state;
  const interaction = interactionFor(state);
  const pending = interaction.pending;
  if (!pending || !["stage", "gate"].includes(pending.kind)) return;
  interaction.reviewInput = { id: randomUUID(), text, stage: pending.stage, gateId: pending.gateId };
  await saveInteraction(cwd, state, interaction);
}

export async function acceptInterpretedReview(cwd: string, userInputId: string): Promise<string> {
  const state = (await ensureHajimiTask(cwd)).state;
  const interaction = interactionFor(state);
  const input = interaction.reviewInput;
  if (!input || input.id !== userInputId || !interaction.pending
    || !["stage", "gate"].includes(interaction.pending.kind)
    || input.stage !== interaction.pending.stage || input.gateId !== interaction.pending.gateId) {
    throw new Error("No matching current user review; generated text and stale approvals cannot authorize continuation.");
  }
  if (/[?？]|(?:不同意|不通过|别继续|不要继续|不能继续|暂不|先别|返工|重做|先修改|先改|还需修改|(?<!没)有问题|等一下|等等)/.test(input.text)) {
    throw new Error("The user raised a question or objection; discuss it without accepting the review.");
  }
  return (await handleReviewInput(cwd, input.text, userInputId))!;
}

export function reviewPrompt(state: HajimiWorkflowState): string {
  const pending = state.interaction?.pending;
  if (pending?.kind === "mode") return "材料已核对。请在聊天中回复「全自动」或「半自动」：全自动连续推进至论文交付；半自动每阶段提交报告后等待你审查。两种模式均在论文交付后停止，等待人工验收。";
  if (pending?.kind === "final") return "论文候选稿已交付，第 8 阶段已停止，等待人工验收。请审查论文与文件清单，直接提出问题或修改意见；完成审查后回复「验收通过」，随后进入第 9 阶段生成代码附录、AI使用说明和提交包。需要返工可回复「返工第 8 阶段：修改意见」，也可指定更早阶段。";
  if (!pending && state.interaction?.finalAccepted) return state.milestones.find(item => item.stage === 9)?.status === "satisfied"
    ? "提交材料已完成。需要修改已验收内容时请指定返工阶段。"
    : "论文已人工验收。仅通过第9阶段专用生成工具整理提交材料，正文、代码和证据仍保持只读；如需修改请先返工。";
  if (pending?.kind === "gate") {
    const gate = state.openGates.find(item => item.gateId === pending.gateId);
    if (gate?.gate === "question_checkpoint") return "本问已停止，等待你审核本问结果、验证与待确认事项。通过请回复「同意继续」；需要修改请回复「返工：修改意见」。确认前不会进入下一问。";
    return "请在聊天中讨论这项决定，准备好后回复「同意继续」，或提出修改意见。";
  }
  if (pending?.kind === "stage" && pending.stage === 7) return "第七阶段已完成。第八阶段需要什么风格的图像：鲜艳舒适型，还是稳重科研型？你可以回复「继续，鲜艳舒适型」或「继续，稳重科研型」，也可以补充绘图偏好。";
  if (!pending && state.interaction?.mode === "automatic") return "本阶段已完成，全自动模式将继续推进；论文交付后会停止并等待人工验收。";
  return "本阶段已停止执行，等待你审查。对下一阶段有没有方向建议？你可以自然表达同意并补充建议，例如「没问题，继续吧」或「可以，下一步重点检查异常值」，不需要逐字照抄。单独讨论或提出问题不会通过当前阶段；需要返工请说明要改哪里。";
}

function filePurpose(path: string): string {
  if (/\.(pdf|tex)$/i.test(path)) return "论文正文、排版源文件或可阅读稿件";
  if (/\.(png|svg|jpg|jpeg)$/i.test(path)) return "图表与结果展示";
  if (/\.(py|r|m|ipynb)$/i.test(path)) return "模型、计算或验证代码";
  if (/\.(csv|xlsx|json)$/i.test(path)) return "数据、参数或计算结果";
  if (/valid|review|audit/i.test(path)) return "验证与审查记录";
  return "过程说明、运行记录或辅助成果";
}

/** Enumerate actual task outputs, never invent file links. Preserve every stage report. */
export async function stageReport(cwd: string, state: HajimiWorkflowState, summary?: string,
  descriptions: Array<{ path: string; purpose: string }> = []) {
  const files = await captureStageFiles(cwd);
  const stage = state.focus.stage;
  const milestone = state.milestones.find(item => item.stage === stage)!;
  const explanation = summary?.trim() || `${milestone.title}：${milestone.requirements.map(item => `${item.summary}（${item.status}）`).join("；")}`;
  const purposes = new Map(descriptions.map(item => [item.path.replaceAll("\\", "/"), item.purpose]));
  const baseline = new Map((state.interaction?.stageBaseline ?? []).map(file => [file.path, file]));
  const lines = files.map(file => {
    const before = baseline.get(file.path);
    const source = !before ? "本阶段新增" : before.sha256 !== file.sha256 || before.sizeBytes !== file.sizeBytes ? "本阶段修改" : "已有成果，本阶段引用";
    const absolute = resolve(cwd, file.path);
    return `| [${file.path.replaceAll("|", "\\|")}](${fileReadUrl(absolute)}) | ${(purposes.get(file.path) ?? filePurpose(file.path)).replaceAll("|", "\\|")} | ${source} |`;
  });
  const text = `# 第 ${stage} 阶段：${milestone.title}\n\n${explanation}\n\n## 成果文件与用途\n\n以下列出当前题目全部可审查成果，包含已有文件，便于检查本阶段引用的结果。\n\n| 文件（点击打开） | 用途 | 来源说明 |\n|---|---|---|\n${lines.join("\n") || "| 暂无成果文件 | 请核对阶段产出 | — |"}\n\n## 审查与返工\n\n${reviewPrompt(state)}\n`;
  const path = `reports/stage-${stage}-revision-${state.revision}.md`;
  await mkdir(join(cwd, "reports"), { recursive: true });
  await writeFile(join(cwd, path), text, "utf8");
  return { path, text, summary: explanation };
}

export async function finishStage(cwd: string, state: HajimiWorkflowState, summary?: string,
  files?: Array<{ path: string; purpose: string }>) {
  const stage = state.focus.stage;
  const interaction = interactionFor(state);
  delete interaction.reviewInput;
  const kind = stage === 8 ? "final" : stage === 0 ? "mode" : stage === 7 || interaction.mode === "supervised" ? "stage" : null;
  interaction.pending = kind ? { kind, stage } : null;
  const report = await stageReport(cwd, { ...state, interaction }, summary, files);
  if (interaction.pending) interaction.pending.reportPath = report.path;
  interaction.reports.push({ stage, path: report.path, summary: report.summary, createdAt: new Date().toISOString() });
  state = await saveInteraction(cwd, state, interaction);
  return { state, report };
}

/** Only called for user-originated input, never a model tool or generated prompt. */
export async function handleReviewInput(cwd: string, text: string, interpretedInputId?: string): Promise<string | null> {
  let state = (await ensureHajimiTask(cwd)).state;
  let interaction = interactionFor(state);
  const value = text.trim().replace(/[。！!]+$/, "");
  const mode = /^(?:选择|使用|切换到|切换为)?全自动(?:模式)?$/.test(value) ? "automatic"
    : /^(?:选择|使用|切换到|切换为)?半自动(?:模式)?$/.test(value) ? "supervised" : null;
  if (mode) {
    interaction.mode = mode;
    if (interaction.pending?.kind === "mode") {
      interaction.reviewedStages.push(interaction.pending.stage);
      interaction.pending = null;
    }
    await saveInteraction(cwd, state, interaction);
    return mode === "automatic" ? "已选择全自动。请继续完成当前工作，至第 8 阶段交付论文后必须停止等待人工验收。" : "已选择半自动。每阶段完成后请交付报告和文件清单，停止并等待用户审查。";
  }
  const rework = /^(?:返工|修改)(?:第?\s*([0-8])\s*阶段)?\s*[:：]\s*([\s\S]+)$/.exec(value);
  if (rework) {
    const stage = Number(rework[1] ?? interaction.pending?.stage ?? Math.min(state.focus.stage, 8)) as HajimiStageId;
    if (stage > state.focus.stage) throw new Error("只能返工当前或已经进行过的阶段。");
    if (interaction.mode === "unselected" && stage > 0) throw new Error("请先选择全自动或半自动。");
    const questionGate = interaction.pending?.kind === "gate"
      ? state.openGates.find(item => item.gateId === interaction.pending?.gateId && item.gate === "question_checkpoint") : undefined;
    state = await rollbackWorkflow({ cwd, expectedRevision: state.revision, source: "user_chat_rework", targetStage: stage,
      targetQuestion: !rework[1] ? questionGate?.target.questionId ?? undefined : undefined,
      invalidatedIds: [], reason: rework[2] });
    interaction = interactionFor(state);
    interaction.pending = interaction.mode === "unselected" && state.focus.stage > 0 ? { kind: "mode", stage } : null;
    interaction.finalAccepted = false;
    delete interaction.acceptedSubmissionInputs;
    delete interaction.nextStageDirection;
    interaction.reviewedStages = interaction.reviewedStages.filter(item => item < stage);
    interaction.stageStartedAt = new Date().toISOString();
    interaction.stageBaseline = await captureStageFiles(cwd);
    await saveInteraction(cwd, state, interaction);
    return `用户要求返工第 ${stage} 阶段：${rework[2]}。保留旧报告，说明修改方案、影响范围，执行后重新报告并等待相应审查。`;
  }
  if (!interaction.pending) return null;
  const approval = interpretedInputId && interaction.reviewInput?.id === interpretedInputId
    ? { direction: value } : reviewAssent(value);
  if (approval && interaction.pending.kind !== "final" && interaction.pending.kind !== "mode") {
    if (interaction.pending.kind === "stage") {
      interaction.nextStageDirection = { stage: (interaction.pending.stage + 1) as HajimiStageId,
        text: approval.direction };
    }
    if (interaction.pending.gateId) state = await resolveHajimiGate(cwd, state.revision, interaction.pending.gateId, "accepted", text);
    else interaction.reviewedStages.push(interaction.pending.stage);
    interaction.pending = null;
    delete interaction.reviewInput;
    await saveInteraction(cwd, state, interaction);
    return `用户已审查并同意继续。请推进至下一步，继续遵循当前全自动／半自动模式。${interaction.nextStageDirection ? `下一阶段方向：${interaction.nextStageDirection.text}。` : ""}`;
  }
  if (value === "验收通过" && interaction.pending.kind === "final") {
    state = await acceptFinalDelivery(cwd, state.revision, text);
    return "用户已完成人工验收。继续第9阶段内置提交包能力：从已验收正文制作代码附录版、如实整理AI使用说明并生成ZIP；打包成功后阶段直接完成。普通写入与Bash仍锁定，只使用 hajimi_generate_submission；不得修改正文或编造使用记录。";
  }
  return null;
}

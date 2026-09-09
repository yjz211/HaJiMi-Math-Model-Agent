import { MODELING_WORKFLOW_DEFINITION as lean, workflowVersionPin } from "./workflow-definition.ts";
import { MODELING_WORKFLOW_DEFINITION as original } from "../../compatibility/v010/lib/hajimi/workflow-definition.ts";
import { readWorkflowState, withTaskLock, writeWorkflowStateAtomic } from "./workflow-store.ts";

/** Migrate definition metadata only; preserve completed work, evidence and revision. */
export async function alignPolicyDefinition(cwd: string) {
  await withTaskLock(cwd, async () => {
    const state = await readWorkflowState(cwd);
    if (!state || state.interaction?.pending?.kind === "mode") return;
    const definition = state.interaction?.executionPolicy === "strict" ? original
      : { ...lean, stages: lean.stages.map(stage => stage.id === 8 ? original.stages[8] : stage) };
    const pin = workflowVersionPin(definition);
    if (state.workflowVersion.definitionHash === pin.definitionHash) return;
    state.workflowVersion = pin;
    state.milestones = state.milestones.map(milestone => {
      const stage = definition.stages[milestone.stage];
      return { ...milestone, title: stage.title, dependencies: stage.dependencies,
        requirements: milestone.requirements.map(requirement => ({ ...requirement,
          ...stage.requirements.find(item => item.id === requirement.id) })) };
    });
    await writeWorkflowStateAtomic(cwd, state);
  });
}

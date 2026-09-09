import type { HajimiWorkflowState } from "./workflow-types.ts";

export function usesOriginalWorkflow(state: Pick<HajimiWorkflowState, "focus" | "interaction">): boolean {
  return state.interaction?.pending?.kind !== "mode"
    && (state.focus.stage === 8 || state.interaction?.executionPolicy === "strict");
}

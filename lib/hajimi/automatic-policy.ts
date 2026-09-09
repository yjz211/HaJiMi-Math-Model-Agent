import { automaticRunLocked as originalAutomaticRunLocked } from "../../compatibility/v010/lib/hajimi/automatic-policy.ts";

export function automaticRunLocked(state: Parameters<typeof originalAutomaticRunLocked>[0]): boolean {
  return !!state && (state.focus.stage === 8 || (state.interaction as { executionPolicy?: string } | undefined)?.executionPolicy === "strict")
    && originalAutomaticRunLocked(state);
}

export function automaticRunActive(state: {
  focus: { stage: number };
  milestones?: Array<{ stage: number; status: string }>;
  interaction?: { mode: string; pending?: { kind: string } | null; finalAccepted?: boolean; runtimeFailure?: unknown };
} | null | undefined): boolean {
  return !!state && state.interaction?.mode === "automatic"
    && state.focus.stage >= 1 && state.focus.stage <= 8
    && !state.interaction.pending
    && !state.interaction.finalAccepted && !state.interaction.runtimeFailure;
}

export function automaticRunBlocked(state: { focus: { stage: number }; milestones: Array<{ stage: number; status: string }> }): boolean {
  return state.milestones.some(item => item.stage === state.focus.stage && item.status === "blocked");
}

export const AUTOMATIC_LOCK_MESSAGE = "全自动正在运行，可随时停止、补充指令或切换模式。";

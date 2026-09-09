/** Shared by the renderer and runtime; workflow state, not streaming, owns the lock. */
export function automaticRunLocked(state: {
  focus: { stage: number };
  interaction?: { mode: string; pending?: { kind: string } | null; finalAccepted?: boolean; runtimeFailure?: unknown };
} | null | undefined): boolean {
  return !!state && state.interaction?.mode === "automatic"
    && state.focus.stage >= 1 && state.focus.stage <= 8
    && state.interaction.pending?.kind !== "final"
    && !state.interaction.finalAccepted && !state.interaction.runtimeFailure;
}

export const AUTOMATIC_LOCK_MESSAGE = "全自动正在连续执行阶段 1—8；论文交付后开放验收，运行失败时开放恢复。";

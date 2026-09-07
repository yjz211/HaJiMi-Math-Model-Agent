import { randomUUID } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { HajimiWorkflowHistoryEntry, HajimiWorkflowState } from "./workflow-types.ts";
import { reduceWorkflowState, type HajimiWorkflowCommand } from "./workflow-reducer.ts";

declare global {
  var __hajimiTaskLocks: Map<string, Promise<void>> | undefined;
}

const taskLocks = globalThis.__hajimiTaskLocks ??= new Map<string, Promise<void>>();

export class HajimiRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(`HaJiMi state revision conflict: expected ${expectedRevision}, current ${actualRevision}`);
    this.name = "HajimiRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export function workflowStatePath(cwd: string): string {
  return join(resolve(cwd), ".hajimi", "state.json");
}

export async function withTaskLock<T>(cwd: string, work: () => Promise<T>): Promise<T> {
  const key = resolve(cwd).toLowerCase();
  const previous = taskLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const queued = previous.then(() => current);
  taskLocks.set(key, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (taskLocks.get(key) === queued) taskLocks.delete(key);
  }
}

export function normalizeUnstartedMilestones(state: HajimiWorkflowState): HajimiWorkflowState {
  if (state.schemaVersion !== "hajimi.workflow-state.v2") return state;
  // Older invalidation marked untouched downstream stages stale. Preserve every
  // stage with an attempt, evidence, a report, or an actual reviewed completion.
  const visited = new Set([...(state.interaction?.reviewedStages ?? []),
    ...(state.interaction?.reports.map(report => report.stage) ?? [])]);
  state.milestones = state.milestones.map(item => item.stage > state.focus.stage
    && item.status === "stale" && item.attempt === 0 && item.acceptedRefs.length === 0
    && !visited.has(item.stage) && item.requirements.every(requirement => requirement.status === "unmet" && requirement.evidenceRefs.length === 0)
    ? { ...item, status: "not_started", staleBy: [] } : item);
  return state;
}

export async function readWorkflowState(cwd: string): Promise<HajimiWorkflowState | null> {
  const path = workflowStatePath(cwd);
  try {
    return normalizeUnstartedMilestones(JSON.parse(await readFile(path, "utf8")) as HajimiWorkflowState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    try {
      return normalizeUnstartedMilestones(JSON.parse(await readFile(`${path}.bak`, "utf8")) as HajimiWorkflowState);
    } catch {
      throw error;
    }
  }
}

export async function writeWorkflowStateAtomic(cwd: string, state: HajimiWorkflowState): Promise<void> {
  const path = workflowStatePath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path, "utf8");
    JSON.parse(current);
    await copyFile(path, `${path}.bak`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  try {
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

export async function mutateWorkflowState(input: {
  cwd: string;
  expectedRevision: number;
  command: HajimiWorkflowCommand;
  ensure: () => Promise<HajimiWorkflowState>;
  commandId?: string;
}): Promise<HajimiWorkflowState> {
  return withTaskLock(input.cwd, async () => {
    const current = (await readWorkflowState(input.cwd)) ?? await input.ensure();
    if (current.revision !== input.expectedRevision) {
      throw new HajimiRevisionConflictError(input.expectedRevision, current.revision);
    }
    const next = reduceWorkflowState(current, input.command);
    next.revision = current.revision + 1;
    await writeWorkflowStateAtomic(input.cwd, next);
    const history: HajimiWorkflowHistoryEntry = {
      schemaVersion: "hajimi.workflow-history.v1",
      commandId: input.commandId ?? randomUUID(),
      kind: input.command.kind,
      fromRevision: current.revision,
      toRevision: next.revision,
      recordedAt: new Date().toISOString(),
    };
    await appendFile(join(resolve(input.cwd), ".hajimi", "workflow-history.jsonl"), `${JSON.stringify(history)}\n`, "utf8");
    return next;
  });
}

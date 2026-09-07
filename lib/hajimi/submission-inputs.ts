import { captureStageFiles } from "./stage-files.ts";
import type { HajimiWorkflowState } from "./workflow-types.ts";

/** Stage 9 may add deliverables, never reinterpret or rewrite accepted inputs. */
export async function assertSubmissionInputs(cwd: string, state: HajimiWorkflowState): Promise<void> {
  const accepted = state.interaction?.acceptedSubmissionInputs;
  if (state.focus.stage !== 9 || !state.interaction?.finalAccepted || state.interaction.pending || !accepted) {
    throw new Error("Submission requires a current human acceptance with an input snapshot.");
  }
  if (!accepted.bindingRefs.length) throw new Error("No accepted paper binding.");
  for (const id of accepted.bindingRefs) {
    const binding = state.provenance.bindings.find(item => item.bindingId === id);
    if (!binding || binding.kind !== "paper" || !binding.artifactRef || !["candidate", "published"].includes(binding.status)) {
      throw new Error("Accepted paper binding is unavailable.");
    }
  }
  const current = new Map((await captureStageFiles(cwd, true)).map(file => [file.path, file]));
  const paperPaths = new Set(state.provenance.bindings.filter(b => accepted.bindingRefs.includes(b.bindingId)).map(b => b.artifactRef?.path));
  for (const file of accepted.files.filter(file => paperPaths.has(file.path))) {
    const actual = current.get(file.path);
    if (!actual || actual.sha256 !== file.sha256 || actual.sizeBytes !== file.sizeBytes) {
      throw new Error(`Accepted input changed or disappeared: ${file.path}`);
    }
    current.delete(file.path);
  }
}

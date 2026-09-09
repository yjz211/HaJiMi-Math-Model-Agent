import { captureStageFiles } from "./stage-files.ts";
import { canonicalJson, sha256Text } from "./workflow-definition.ts";
import { assertPublicationMayConsume } from "./workflow-reducer.ts";
import type { HajimiWorkflowState } from "./workflow-types.ts";

/** Stage 9 may add deliverables, never reinterpret or rewrite accepted inputs. */
export async function assertSubmissionInputs(cwd: string, state: HajimiWorkflowState): Promise<void> {
  const accepted = state.interaction?.acceptedSubmissionInputs;
  if (state.focus.stage !== 9 || !state.interaction?.finalAccepted || state.interaction.pending || !accepted) {
    throw new Error("Submission requires a current human acceptance with an input snapshot.");
  }
  if (accepted.provenanceHash !== sha256Text(canonicalJson({ provenance: state.provenance, questions: state.questions }))) {
    throw new Error("Accepted provenance changed; return to the affected stage for review.");
  }
  if (!accepted.bindingRefs.length) throw new Error("No accepted paper binding.");
  for (const id of accepted.bindingRefs) {
    const binding = state.provenance.bindings.find(item => item.bindingId === id);
    if (!binding || binding.kind !== "paper" || !binding.artifactRef || !["candidate", "published"].includes(binding.status)) {
      throw new Error("Accepted paper binding is unavailable.");
    }
    assertPublicationMayConsume(state, binding.claimRefs);
  }
  const current = new Map((await captureStageFiles(cwd, true)).map(file => [file.path, file]));
  for (const file of accepted.files) {
    const actual = current.get(file.path);
    if (!actual || actual.sha256 !== file.sha256 || actual.sizeBytes !== file.sizeBytes) {
      throw new Error(`Accepted input changed or disappeared: ${file.path}`);
    }
    current.delete(file.path);
  }
  for (const path of current.keys()) {
    if (!path.startsWith("deliverables/")) throw new Error(`Stage 9 wrote outside deliverables: ${path}`);
  }
}

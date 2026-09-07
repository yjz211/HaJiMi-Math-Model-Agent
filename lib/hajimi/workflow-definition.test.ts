import assert from "node:assert/strict";
import test from "node:test";

import { loadBundledWorkflowDefinition, MODELING_WORKFLOW_DEFINITION, workflowVersionPin } from "./workflow-definition.ts";

test("bundled modeling workflow is the pinned 0-9 definition", async () => {
  const bundled = await loadBundledWorkflowDefinition(process.cwd());
  assert.deepEqual(bundled, MODELING_WORKFLOW_DEFINITION);
  assert.equal(bundled.stages.length, 10);
  assert.equal(workflowVersionPin(bundled).definitionHash.length, 64);
  assert.match(bundled.stages[8].summary, /LaTeX|论文/);
});

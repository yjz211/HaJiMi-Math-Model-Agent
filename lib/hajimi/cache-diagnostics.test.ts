import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintRequest } from "./cache-diagnostics.ts";

test("cache fingerprints contain no raw prompt, key, tool schema or unexpected field", () => {
  const secret = "sentinel-private-value";
  const body = { instructions: secret, prompt_cache_key: secret, model: "model",
    input: [{ role: "user", content: secret }, { role: secret, content: secret }],
    tools: [{ name: secret }], headers: { Authorization: secret }, extra: secret };
  const before = fingerprintRequest(body);
  assert.doesNotMatch(JSON.stringify(before), /sentinel-private-value|Authorization|headers/);
  assert.equal(before.items[1].role, null);
  const after = fingerprintRequest({ ...body, input: [...body.input, { role: "assistant", content: "reply" }] });
  assert.deepEqual(after.items.slice(0, before.items.length), before.items);
  assert.equal(before.instructionsHash, after.instructionsHash);
  assert.notEqual(fingerprintRequest({ ...body, instructions: "changed" }).instructionsHash, before.instructionsHash);
});

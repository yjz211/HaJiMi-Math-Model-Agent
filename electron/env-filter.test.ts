import assert from "node:assert/strict";
import test from "node:test";
import { pickApiKeys } from "./env-filter.ts";

test("server receives Windows system paths but not unrelated secrets or Python injection", () => {
  const env = {
    SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", COMSPEC: "C:\\Windows\\System32\\cmd.exe",
    PYTHONPATH: "C:\\untrusted", UNRELATED_SECRET: "do-not-forward",
  };
  assert.deepEqual(pickApiKeys(env), {
    SystemRoot: env.SystemRoot, WINDIR: env.WINDIR, COMSPEC: env.COMSPEC,
  });
});

test("Windows system variable casing is normalized for server children", () => {
  assert.deepEqual(pickApiKeys({ SYSTEMROOT: "C:\\Windows", windir: "C:\\Windows", ComSpec: "cmd.exe" }), {
    SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", COMSPEC: "cmd.exe",
  });
});

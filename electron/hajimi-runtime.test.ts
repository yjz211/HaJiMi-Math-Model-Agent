import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { resolveHajimiRuntimePaths } from "./hajimi-runtime.ts";

const testInput = {
  appPath: "C:\\product\\HaJiMi",
  userDataPath: "C:\\test-profile",
  resourcesPath: "C:\\product\\resources",
  isPackaged: true,
};

test("explicit test runtime home is independent from the default profile", () => {
  const paths = resolveHajimiRuntimePaths({ ...testInput, env: { HAJIMI_RUNTIME_HOME: "D:\\HaJiMi Test\\runtime" } });
  assert.equal(paths.runtimeHome, "D:\\HaJiMi Test\\runtime");
  assert.notEqual(paths.runtimeHome, resolveHajimiRuntimePaths({ ...testInput, env: {} }).runtimeHome);
});

test("runtime home rejects relative, network and non-ASCII paths", () => {
  for (const home of ["runtime", "C:runtime", "\\\\server\\share", "C:\\测试\\runtime"]) {
    assert.throws(() => resolveHajimiRuntimePaths({ ...testInput, env: { HAJIMI_RUNTIME_HOME: home } }), /absolute ASCII local-drive/);
  }
});

test("default runtime homes are stable and separated by application profile", () => {
  const first = resolveHajimiRuntimePaths({ ...testInput, env: {} }).runtimeHome;
  assert.equal(first, resolveHajimiRuntimePaths({ ...testInput, env: {} }).runtimeHome);
  assert.notEqual(first, resolveHajimiRuntimePaths({ ...testInput, userDataPath: "C:\\other-profile", env: {} }).runtimeHome);
});

test("HaJiMi uses an app-owned Pi agent directory by default", () => {
  const paths = resolveHajimiRuntimePaths({
    appPath: "C:\\product\\HaJiMi",
    userDataPath: "C:\\Users\\test\\AppData\\Roaming\\HaJiMi",
    resourcesPath: "C:\\product\\HaJiMi\\resources",
    isPackaged: false,
    env: {},
  });

  assert.equal(paths.agentDir, path.join("C:\\Users\\test\\AppData\\Roaming\\HaJiMi", "agent"));
  assert.equal(paths.productRoot, "C:\\product\\HaJiMi");
  assert.doesNotMatch(paths.agentDir, /\.pi[\\/]agent/i);
});

test("packaged resources and explicit independent agent directory are resolved deterministically", () => {
  const paths = resolveHajimiRuntimePaths({
    appPath: "C:\\ignored",
    userDataPath: "C:\\ignored-user-data",
    resourcesPath: "D:\\Apps\\HaJiMi\\resources",
    isPackaged: true,
    env: { HAJIMI_AGENT_DIR: "D:\\HaJiMiData\\agent" },
  });

  assert.equal(paths.agentDir, "D:\\HaJiMiData\\agent");
  assert.equal(paths.productRoot, path.join("D:\\Apps\\HaJiMi\\resources", "hajimi"));
});

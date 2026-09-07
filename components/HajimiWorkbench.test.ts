import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statusSource = readFileSync(new URL("./HajimiStatus.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("the modeling workbench makes the governed 0-9 workflow persistent", () => {
  const stageKeys = [...statusSource.matchAll(/"hajimi\.stage\d"/g)];
  assert.equal(stageKeys.length, 10);
  assert.match(statusSource, /export function HajimiDashboard/);
  assert.match(statusSource, /export function HajimiWelcome/);
  assert.ok(shellSource.indexOf("<HajimiDashboard") < shellSource.indexOf("<ChatWindow"));
  assert.match(shellSource, /<HajimiWelcome onCreate=/);
});

test("the workbench keeps evidence status and hides implementation capability badges", () => {
  assert.doesNotMatch(statusSource, /Paper Standard|Plot Suite|publicationEngine|evidenceGoverned/);
  assert.match(statusSource, /item\.status === "active"/);
  assert.match(statusSource, /overflow-x-auto/);
  assert.match(statusSource, /shrink-0 snap-start/);
});

test("general-purpose coding configuration and branch-clone surfaces are absent from the primary UI", () => {
  for (const hiddenSurface of ["SkillsConfig", "BranchNavigator", "ExtensionsConfigModal", "BranchCloneModal"]) {
    assert.doesNotMatch(shellSource, new RegExp(hiddenSurface));
  }
  assert.doesNotMatch(shellSource, /onBranchSession=/);
  assert.doesNotMatch(shellSource, /onCloneSession=/);
  assert.doesNotMatch(shellSource, /onSystemPromptChange=/);
  assert.doesNotMatch(chatSource, /onBranchMessage=/);
  assert.doesNotMatch(chatSource, /BranchCloneModal/);
  assert.doesNotMatch(chatSource, /src="\/logo\.png"/);
  assert.match(chatSource, /hajimi\.startConversation/);
});

test("the dashboard and toolbar share one read-only HaJiMi status request", () => {
  assert.match(statusSource, /export function useHajimiStatus/);
  assert.equal([...statusSource.matchAll(/fetch\(`\/api\/hajimi\/status/g)].length, 1);
  assert.match(shellSource, /const hajimiStatus = useHajimiStatus/);
  assert.match(shellSource, /<HajimiStatus result=\{hajimiStatus\}/);
  assert.match(shellSource, /<HajimiDashboard result=\{hajimiStatus\}/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelingDirectory, modelingProjectsRoot, projectLocationNotice } from "./modeling-project.ts";

test("stage zero notice identifies the actual folder and keeps old project locations truthful", () => {
  const current = join(modelingProjectsRoot(), "数学建模1");
  assert.ok(projectLocationNotice(current).includes(current));
  assert.match(projectLocationNotice(current), /一一对应/);
  assert.match(projectLocationNotice(join(tmpdir(), "existing-task")), /原位置/);
});
import { ensureHajimiTask, freezeHajimiInputs } from "./task-state.ts";
import { importProblemFiles } from "./input-upload.ts";

test("explicit creates reserve distinct sequential modeling folders even concurrently", async () => {
  const root = await mkdtemp(join(tmpdir(), "hajimi-create-test-"));
  try {
    const projects = await Promise.all(Array.from({ length: 5 }, () => createModelingDirectory(root)));
    assert.deepEqual(projects.map(p => p.name).sort(), [1, 2, 3, 4, 5].map(n => `数学建模${n}`));
    assert.equal(new Set(projects.map(p => p.cwd)).size, 5);
    assert.equal((await createModelingDirectory(root)).name, "数学建模6");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("chat uploads accept incremental files and preserve names and frozen evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "hajimi-upload-test-"));
  try {
    const { cwd } = await createModelingDirectory(root);
    await ensureHajimiTask(cwd);
    await assert.rejects(freezeHajimiInputs(cwd), /上传题目/);
    const first = await importProblemFiles(cwd, [{ name: "题目.pdf", data: Buffer.from("pdf-content") }]);
    assert.deepEqual(first, ["input/题目.pdf"]);
    const second = await importProblemFiles(cwd, [{ name: "题目.pdf", data: Buffer.from("second-content") }, { name: "../../data.csv", data: Buffer.from("x,y\n1,2") }]);
    assert.notEqual(second[0], first[0]);
    assert.equal(second[1], "input/data.csv");
    assert.equal(await readFile(join(cwd, first[0]), "utf8"), "pdf-content");
    const frozen = await freezeHajimiInputs(cwd);
    assert.equal(frozen.length, 3);
    await assert.rejects(importProblemFiles(cwd, [{ name: "late.txt", data: Buffer.from("late") }]), /已冻结/);
    assert.equal((await readdir(join(cwd, "input"))).length, 3);
    assert.deepEqual(await freezeHajimiInputs(cwd), frozen);
  } finally { await rm(root, { recursive: true, force: true }); }
});

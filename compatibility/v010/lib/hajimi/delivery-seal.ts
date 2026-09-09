import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureStageFiles } from "./stage-files.ts";
import { canonicalJson, sha256Text } from "./workflow-definition.ts";
import { ensureHajimiTask, readHajimiValidation } from "./task-state.ts";

export async function deliveryFingerprint(cwd: string): Promise<string> {
  const state = (await ensureHajimiTask(cwd)).state;
  return sha256Text(canonicalJson({
    files: await captureStageFiles(cwd, true),
    provenance: state.provenance,
    questions: state.questions,
  }));
}

/** Seal only a successful validator run over unchanged inputs and publications. */
export async function sealDeliveryValidation(cwd: string, before: string): Promise<void> {
  const validation = await readHajimiValidation(cwd);
  if (!validation?.strict || !validation.passed) throw new Error("A passing strict validation is required.");
  if (before !== await deliveryFingerprint(cwd)) throw new Error("Delivery changed during validation; validate again.");
  const report = await readFile(join(cwd, ".hajimi", "validation.json"), "utf8");
  await writeFile(join(cwd, ".hajimi", "delivery-seal.json"), JSON.stringify({
    fingerprint: before, reportHash: sha256Text(report),
  }), "utf8");
}

export async function assertDeliverySeal(cwd: string): Promise<void> {
  let seal: { fingerprint: string; reportHash: string };
  try {
    seal = JSON.parse(await readFile(join(cwd, ".hajimi", "delivery-seal.json"), "utf8"));
  } catch {
    throw new Error("Delivery validation is not bound to this paper. Run strict delivery validation again.");
  }
  const report = await readFile(join(cwd, ".hajimi", "validation.json"), "utf8");
  if (seal.reportHash !== sha256Text(report) || seal.fingerprint !== await deliveryFingerprint(cwd)) {
    throw new Error("Delivery changed after validation. Run strict delivery validation again.");
  }
}

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = 'C:/hajimi-native-test-data-20260905/projects/数学建模1';
const session = 'C:/hajimi-native-test-data-20260905/agent/sessions/--C--hajimi-native-test-data-20260905-projects-数学建模1--/2026-09-05T07-55-17-895Z_01a07090-9205-7420-afad-4576f78bf02e.jsonl';
const checkpointPath = join(root, '.hajimi/checkpoints/000139-aacda755-c6c0-460c-aaaa-49d0b8f50d86.json');
const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
const cutoff = checkpoint.createdAt;
const current = JSON.parse(readFileSync(join(root, '.hajimi/state.json'), 'utf8'));
assert.equal(current.taskId, checkpoint.state.taskId);
assert.equal(checkpoint.state.revision, 139);
assert.equal(checkpoint.state.focus.stage, 7);
assert.equal(checkpoint.state.interaction.pending.stage, 7);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function inside(path) {
  const absolute = resolve(root, path);
  assert(absolute.startsWith(resolve(root) + sep), `Path outside task: ${path}`);
  return absolute;
}
const lines = path => readFileSync(path, 'utf8').trimEnd().split(/\r?\n/);
const registryPath = inside('.hajimi/artifacts.jsonl');
const registry = lines(registryPath).filter(line => JSON.parse(line).registeredAt <= cutoff);
const byPath = new Map(registry.map(line => { const ref = JSON.parse(line); return [ref.path, ref]; }));
const restore = [];
for (const ref of byPath.values()) {
  const source = inside(ref.frozenPath);
  assert.equal(hash(source), ref.sha256, `Corrupt snapshot: ${ref.path}`);
  const destination = inside(ref.path);
  if (!existsSync(destination) || hash(destination) !== ref.sha256) restore.push({ source, destination, path: ref.path });
}
const historyPath = inside('.hajimi/workflow-history.jsonl');
const history = lines(historyPath).filter(line => JSON.parse(line).toRevision <= checkpoint.state.revision);
assert.equal(JSON.parse(history.at(-1)).toRevision, 139);
const sessionLines = lines(session);
const stop = sessionLines.findIndex(line => JSON.parse(line).id === '7478c55a');
assert(stop >= 0);
const retained = sessionLines.slice(0, stop + 1);
assert.equal(JSON.parse(retained.at(-1)).message.role, 'assistant');
const backup = inside('.hajimi/recovery-backups/stage7-20260906');
const summary = { checkpoint: checkpointPath, beforeRevision: current.revision, restoredRevision: 139, stage: 7,
  restoredFiles: restore.map(item => item.path), retainedMessages: retained.length, originalMessages: sessionLines.length, backup };
if (!process.argv.includes('--apply')) { console.log(JSON.stringify(summary)); process.exit(0); }
assert.equal(current.revision, 164, 'State changed since inspection');
assert(!existsSync(backup), 'Backup already exists; do not apply twice');
mkdirSync(backup, { recursive: true });
for (const name of ['state.json', 'state.json.bak', 'artifacts.jsonl', 'workflow-history.jsonl', 'validation.json']) {
  const source = inside(`.hajimi/${name}`);
  if (existsSync(source)) copyFileSync(source, join(backup, name));
}
copyFileSync(session, join(backup, 'session-before.jsonl'));
for (const item of restore) {
  if (existsSync(item.destination)) {
    const saved = join(backup, 'files', item.path);
    mkdirSync(dirname(saved), { recursive: true }); copyFileSync(item.destination, saved);
  }
}
writeFileSync(join(backup, 'manifest.json'), JSON.stringify(summary, null, 2));
function atomic(path, text) { const temp = `${path}.stage7-restore.tmp`; assert(!existsSync(temp)); writeFileSync(temp, text); renameSync(temp, path); }
for (const item of restore) { mkdirSync(dirname(item.destination), { recursive: true }); copyFileSync(item.source, item.destination); }
atomic(registryPath, registry.join('\n') + '\n');
atomic(historyPath, history.join('\n') + '\n');
atomic(session, retained.join('\n') + '\n');
atomic(inside('.hajimi/state.json'), JSON.stringify(checkpoint.state, null, 2) + '\n');
atomic(inside('.hajimi/state.json.bak'), JSON.stringify(checkpoint.state, null, 2) + '\n');
const validation = inside('.hajimi/validation.json');
if (existsSync(validation)) renameSync(validation, join(backup, 'validation-moved.json'));
assert.deepEqual(JSON.parse(readFileSync(inside('.hajimi/state.json'), 'utf8')), checkpoint.state);
for (const ref of byPath.values()) assert.equal(hash(inside(ref.path)), ref.sha256);
console.log(JSON.stringify({ ...summary, applied: true }));

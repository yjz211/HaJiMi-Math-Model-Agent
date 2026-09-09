import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('0.12 legacy plotting resources match the frozen 0.10 baseline byte for byte', async () => {
  const baseline = JSON.parse(await readFile('docs/v012-baseline.json', 'utf8'));
  const removal = JSON.parse(await readFile('docs/v012-scienceplots-removal.json', 'utf8')).changes;
  const prefix = 'bundled/capabilities/modeling-plot-suite/1.0.0/';
  const expected = Object.keys(baseline.v010Files).filter(path => path.startsWith(prefix)).sort();
  assert.ok(expected.length > 100);
  async function files(directory, relative = prefix) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const path = relative + entry.name;
      if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), path + '/'));
      else result.push(path);
    }
    return result.sort();
  }
  assert.deepEqual(await files('compatibility/v010/' + prefix), expected);
  for (const path of expected) {
    const bytes = await readFile('compatibility/v010/' + path);
    const change = removal['compatibility/v010/' + path];
    if (change) assert.equal(change.before, baseline.v010Files[path], path + ' original baseline');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), change?.after ?? baseline.v010Files[path], path);
  }
});

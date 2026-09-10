import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('saving preserves nine authored layouts and matches native Matplotlib', (t) => {
  const python = process.env.HAJIMI_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const dependencies = spawnSync(python, ['-c', 'import matplotlib, numpy'], {encoding:'utf8'});
  if (dependencies.status !== 0) {
    t.skip('optional Python plotting dependencies are unavailable');
    return;
  }
  const result = spawnSync(python, ['-X','utf8','-B','scripts/repro-plot-layout-expanded.py','--verify'], {encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message || result.stderr || result.stdout);
  assert.match(result.stdout,/nine layouts preserved/);
});

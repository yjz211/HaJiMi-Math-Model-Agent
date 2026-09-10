import { applyReviewGuidance } from './plot-review-guidance.mjs';
import { applyLayoutPreservation } from './plot-layout-preservation.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const FONT_GUIDANCE = JSON.parse(await readFile(fileURLToPath(new URL('./plot-font-guidance.json', import.meta.url)), 'utf8'));
export function undoFontGuidance(text, path) {
  for (const patch of FONT_GUIDANCE.filter(x => x.path === path)) {
    if (!text.includes(patch.after)) throw new Error('Missing font guidance: ' + path);
    text = text.replace(patch.after, patch.before);
  }
  return text;
}

const ORIGINAL_FIDELITY_HINT = ' 适配实际数据时，尽量保留原模板的视觉结构、配色层次和关键图形元素，仅按数据语义与可读性需要作必要调整。';
export const FIDELITY_HINT = ORIGINAL_FIDELITY_HINT + ' 修图时优先调整位置、间距和尺寸，尽量保留色条、图例、关键标记等信息元素；确需删减时，说明原因及替代的表达方式。';
export async function applyPlotFidelityHint(cap) {
  await applyLayoutPreservation(cap);
  await applyReviewGuidance(cap);
  for (const patch of FONT_GUIDANCE) {
    const target = join(cap, patch.path);
    const original = await readFile(target, 'utf8');
    if (original.includes(patch.after)) continue;
    if (!original.includes(patch.before)) throw new Error('Font guidance source drift: ' + target);
    await writeFile(target, original.replace(patch.before, patch.after));
  }
  const path = join(cap, 'resources/workflows/paper-figure.md');
  const text = await readFile(path, 'utf8');
  if (text.includes(FIDELITY_HINT)) return;
  if (text.includes(ORIGINAL_FIDELITY_HINT)) {
    await writeFile(path, text.replace(ORIGINAL_FIDELITY_HINT, FIDELITY_HINT));
    return;
  }
  const anchor = 'templates, export quality, review, and iteration.';
  if (text.split(anchor).length !== 2) throw new Error('Plot workflow entrypoint changed');
  await writeFile(path, text.replace(anchor, anchor + FIDELITY_HINT));
}

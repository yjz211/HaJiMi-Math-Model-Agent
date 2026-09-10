import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const patches = JSON.parse(await readFile(new URL('./plot-review-guidance.json', import.meta.url), 'utf8'));
export function undoReviewGuidance(text, path, compatibility = false) {
  for (const patch of patches.filter(p => p.path === path).reverse()) {
    if (!text.includes(patch.after)) throw new Error('Review guidance missing: ' + path);
    text = text.replace(patch.after, patch.before[compatibility ? patch.before.length - 1 : 0]);
  }
  return text;
}
export async function applyReviewGuidance(cap) {
  for (const patch of patches) {
    const target = join(cap, patch.path);
    const text = await readFile(target, 'utf8');
    if (text.includes(patch.after)) continue;
    const before = patch.before.find(value => text.includes(value));
    if (!before) throw new Error('Review guidance source drift: ' + target);
    await writeFile(target, text.replace(before, patch.after));
  }
}

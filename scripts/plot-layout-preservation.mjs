import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const patches = JSON.parse(await readFile(new URL('./plot-layout-preservation.json', import.meta.url), 'utf8'));
function transform(text, reverse = false) {
  for (const patch of reverse ? [...patches].reverse() : patches) {
    const before = reverse ? patch.after : patch.before;
    const after = reverse ? patch.before : patch.after;
    let matched = false;
    for (const newline of text.includes('\r\n') ? ['\r\n', '\n'] : ['\n', '\r\n']) {
      const source = before.replaceAll('\n', newline);
      if (!text.includes(source)) continue;
      text = text.replace(source, after.replaceAll('\n', newline));
      matched = true;
      break;
    }
    if (!matched && (reverse || !text.replaceAll('\r\n', '\n').includes(after))) throw new Error('Plot layout patch source drift');
  }
  return text;
}
export const undoLayoutPreservation = text => transform(text, true);
export async function applyLayoutPreservation(cap) {
  const path = join(cap, 'resources/assets/shared-scripts/plot_utils.py');
  await writeFile(path, transform(await readFile(path, 'utf8')));
  const hashes = JSON.parse(await readFile(new URL('./plot-layout-helper-baselines.json', import.meta.url), 'utf8'));
  const bootstrap = join(cap, 'resources/scripts/bootstrap.py');
  const original = await readFile(bootstrap, 'utf8');
  if (!original.includes('layout_helper_baselines =')) {
    const block = `    # Refresh recognized pre-preservation helpers; keep user edits.\n    layout_helper_baselines = ${JSON.stringify(hashes)}\n    for folder in (workspace / "_utils", workspace / "skills/shared-scripts"):\n        existing = folder / "plot_utils.py"\n        if existing.is_file() and sha256(existing) in layout_helper_baselines:\n            shutil.copy2(assets / "shared-scripts/plot_utils.py", existing)\n`;
    const marker = '    profile = detect_profile';
    if (!original.includes(marker)) throw new Error('Bootstrap insertion point missing');
    await writeFile(bootstrap, original.replace(marker, (original.includes('\r\n') ? block.replaceAll('\n', '\r\n') : block) + marker));
  }
}

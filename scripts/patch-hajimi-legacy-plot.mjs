import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ORIGINAL_HELPER_SHA256 = '63ad0791b7262e562a28e1500ba8f15005ca66e815f6230df1951197beb89a25';

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Legacy plot source changed: ${before}`);
  return text.replace(before, after);
}

// Keep the source snapshot pristine. Only fix exported list identity; do not
// change theme selection, font selection, sizes, or saving/layout behavior.
export function patchLegacyPlotHelper(text) {
  text = replaceOnce(text, "PALETTE = PALETTES['elegant']", "PALETTE = list(PALETTES['elegant'])");
  text = replaceOnce(text, '    PALETTE = colors', '    PALETTE[:] = colors');
  return replaceOnce(text, '    PALETTE_LIGHT = [_lighten(c, 0.4) for c in colors]', '    PALETTE_LIGHT[:] = [_lighten(c, 0.4) for c in colors]');
}

export function patchLegacyPlotBootstrap(text) {
  return replaceOnce(text, '    assets = root / "assets"', `    assets = root / "assets"
    # HaJiMi: refresh only the identified pristine helper, preserving custom files.
    for relative in ("_utils/plot_utils.py", "skills/shared-scripts/plot_utils.py"):
        existing = workspace / relative
        if existing.is_file() and sha256(existing) == "${ORIGINAL_HELPER_SHA256}":
            shutil.copy2(assets / "shared-scripts/plot_utils.py", existing)`);
}

export function originalSizePreflight(guide) {
  const start = guide.indexOf('#### ⛔⛔ 硬规则：`figsize`');
  const end = guide.indexOf('\n#### ', start + 1);
  if (start < 0 || end < 0) throw new Error('Original figsize section missing');
  return '# DATA：生成前按原版计算最终尺寸\n\n'
    + '在写每张新图的 figsize 前完成以下原版计算；可以记在现有规划或脚本 docstring 中。表内正文宽及显示宽为原文示例：本项目已有明确引用宽度时，将实际宽度（统一单位）代入同一个公式，同时考虑实际高度限制。不固定所有图为 136 mm，不新增字号门槛或自动拦截器。\n\n'
    + '以下逐字摘自 resources/assets/shared-scripts/figure_style_guide.md 的 figsize 硬规则，保留适用前提与上下文。原文案例统计未在本项目独立复验。\n\n'
    + guide.slice(start, end) + '\n';
}

export async function patchHajimiLegacyPlot(root) {
  const helper = join(root, 'resources/assets/shared-scripts/plot_utils.py');
  const bootstrap = join(root, 'resources/scripts/bootstrap.py');
  await writeFile(helper, patchLegacyPlotHelper(await readFile(helper, 'utf8')));
  await writeFile(bootstrap, patchLegacyPlotBootstrap(await readFile(bootstrap, 'utf8')));
  const guide = await readFile(join(root, 'resources/assets/shared-scripts/figure_style_guide.md'), 'utf8');
  await writeFile(join(root, 'fragments/original-size-preflight.md'), originalSizePreflight(guide));
}

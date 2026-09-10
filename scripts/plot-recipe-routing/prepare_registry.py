"""One-time migration authoring tool; requires the unchanged 0.1.2 snapshot."""
import hashlib
import json
from pathlib import Path
import re
import sys

from get_recipe import sections, content_hash, LEGACY_REF

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCE = Path(sys.argv[1])
if json.loads((SOURCE / 'package.json').read_text(encoding='utf-8'))['version'] != '0.1.2':
    raise SystemExit('This one-time migration requires the frozen 0.1.2 source; do not regenerate IDs from later versions.')
PREFIX = 'bundled/capabilities/modeling-plot-suite/1.0.0'
CAP = SOURCE / PREFIX
SHARED = CAP / 'resources/assets/shared-scripts'
SLUGS = {
    'basic': 'grouped_bar stacked_bar line scatter_regression heatmap donut raincloud area pareto dual_axis raincloud_violin multipanel',
    'advanced': 'lollipop dumbbell slope bump sankey waterfall shap_summary bland_altman kaplan_meier volcano calibration funnel dot_ci cluster_heatmap network method_heatmap parallel_coordinates pca_biplot taylor diverging_bar back_to_back_bar paired_dot ridgeline grouped_violin performance_profile ice_pdp fan calendar_heatmap hovmoller pair_plot triptych posterior_trace_density streamgraph bivariate_choropleth',
    'empirical': 'forest parallel_trends event_study placebo correlation_heatmap raincloud time_series residual_diagnostics marginal_effects subgroup_forest quantile_regression psm_balance prediction_ci prediction_accuracy_heatmap prediction_error_raincloud multistep_decay moran_scatter lisa_map coefficient_stability variance_decomposition impulse_response',
    'academic': 'ablation training_curves tsne_umap attention_heatmap radar hyperparameter_sensitivity confusion_matrix feature_importance learning_rate latent_interpolation benchmark_table error_analysis',
    'competition': 'convergence tornado pareto_front prediction_actual radar surface_3d china_choropleth residual_diagnostics feature_importance confusion_matrix roc correlation_matrix gravity_migration contour gantt network_path multistep_decay spatiotemporal_heatmap pareto_surface_3d waterfall bubble_joint bubble_kde kmeans hexbin_joint kde_joint scatter_regression_marginals cluster_3d feasible_region state_grid',
}
entries = []
for category, names in SLUGS.items():
    filename = f'figure_recipes_{category}.md'
    items = sections((SHARED / filename).read_text(encoding='utf-8'))
    names = names.split()
    assert len(items) == len(names), category
    for (number, title, body), slug in zip(items, names):
        entries.append(dict(id=f'{category}.{slug}', file=filename, title=title,
                            legacy=f'{category} #{number}', contentSha256=content_hash(body)))
registry = dict(schemaVersion=1, bundleVersion='0.1.3', recipes=entries)
(OUT / 'recipe_registry.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
by_legacy = {item['legacy']: item['id'] for item in entries}

# Exact, context-specific corrections, applied only to the reference text.
fixes = {
 'figure_style_guide.md': {
  'Distribution (2-5 groups)': ('academic #4', 'basic #7'),
  'High-dim features': ('academic #2', 'academic #3'),
  'Classification/clustering': ('comp #10, #11, #13', 'comp #10, #11, #27'),
  'Regression/prediction': ('empirical #12, #14, #16, #13', 'empirical #13, #15, #16, #14'),
  'Regression analysis': ('empirical #1, #10, #15', 'empirical #1, #10, #9'),
  'Prediction/forecasting': ('empirical #12, #14, #16, #13', 'empirical #13, #15, #16, #14'),
  'Deep learning': ('academic #3, #6, #2', 'academic #2, #4, #3'),
  'Hyperparameter tuning': ('academic #7, #8', 'academic #6, competition #6'),
 },
 'figure_exemplars.md': {
  '| 预测/时间序列 |': ('empirical #12,#14,#16', 'empirical #13,#8,#16'),
  '| 分类/聚类/异常检测 |': ('comp #10,#11,#13', 'comp #10,#11,#27'),
  "Moran's I 散点图": ('empirical #5', 'empirical #17'),
  '| 数据描述 | 特征分布对比 |': ('academic #4', 'basic #7'),
  '| 模型结果 | 聚类可视化 |': ('academic #2', 'academic #3'),
  '| 数据描述 | 变量分布 | Ridgeline 或 Rain Cloud': ('academic #4', 'basic #7'),
  # No existing horizontal weight-bar recipe: keep the requested chart and use the existing custom route.
  '| 评价结果 | 权重分配 | 横向柱状图 |': ('basic #9', 'custom'),
 },
 'writing_rules.md': {
  'fig_q2_residual_diag': ('basic #5', 'competition #8'),
  'fig_cls_eval': ('competition #10 + #14', 'competition #10 + #11'),
  'fig_space_time': ('competition #8', 'competition #18 + basic #3'),
 },
}

def stable(match):
    category = 'competition' if match.group(1) == 'comp' else match.group(1)
    numbers = [match.group(2), *re.findall(r'#\s*(\d+)', match.group(3))]
    separators = re.findall(r'(\s*[,/+]\s*)#\s*\d+', match.group(3))
    refs = ['recipe:' + by_legacy[f'{category} #{number}'] for number in numbers]
    return refs[0] + ''.join(separator + ref for separator, ref in zip(separators, refs[1:]))

changes = []
corrections = []
for path in CAP.rglob('*.md'):
    if path.name.startswith('figure_recipes_'):
        continue
    original = path.read_bytes().decode('utf-8')
    for before in original.splitlines(keepends=True):
        after = before
        for context, (old, new) in fixes.get(path.name, {}).items():
            if context in before:
                assert old in after, (path, context)
                after = after.replace(old, new)
                corrections.append(dict(file=path.relative_to(CAP).as_posix(), context=context, before=old, after=new))
        after = LEGACY_REF.sub(stable, after)
        if path.name == 'paper-figure.md':
            after = after.replace('category #N', 'recipe:<id>')
            after = after.replace('get_recipe.py competition 14', 'get_recipe.py --id competition.contour')
            after = after.replace('get_recipe.py advanced 1', 'get_recipe.py --id advanced.lollipop')
        if after != before:
            changes.append(dict(path=path.relative_to(CAP).as_posix(), before=before, after=after))

# Prefetch is reference plumbing: preserve all surrounding drawing instructions.
paper = (CAP / 'resources/references/paper-figure.md').read_bytes().decode('utf-8')
start = paper.index('# 从规划里自动抓出所有配方号')
end = paper.index('```', start)
old = paper[start:end]
new = '''# 从规划里自动抓出配方 ID 或兼容编号，一次全取到 _utils/RECIPES_FOR_THIS_PAPER.md
PLAN=(); for pf in FIGURE_PLAN.json PROBLEM_ANALYSIS.md TOPIC_PLAN.md PAPER_PLAN.md; do
    [ -f "$pf" ] && PLAN+=("$pf")
done
PYTHON=""; for _c in "$MH_PYTHON" python python3; do
    [ -z "$_c" ] && continue; command -v "$_c" >/dev/null 2>&1 && PYTHON="$_c" && break
done
RECIPE_TOOL="_utils/get_recipe.py"
[ -f "$RECIPE_TOOL" ] || RECIPE_TOOL="skills/shared-scripts/get_recipe.py"
"$PYTHON" "$RECIPE_TOOL" --plan "${PLAN[@]}" --output _utils/RECIPES_FOR_THIS_PAPER.md
'''
if '\r\n' in old:
    new = new.replace('\n', '\r\n')
changes.append(dict(path='resources/references/paper-figure.md', before=old, after=new))
assert len(corrections) == sum(map(len, fixes.values()))
(OUT / 'reference_migrations.json').write_text(json.dumps(dict(schemaVersion=1, changes=changes, corrections=corrections), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
baseline = {p.relative_to(CAP).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in CAP.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
(ROOT / 'docs/v013-plot-baseline.json').write_text(json.dumps(dict(source=str(SOURCE), files=baseline), indent=2) + '\n', encoding='utf-8')
print(f'{len(entries)} recipes; {len(changes)} reference-only replacements; {len(corrections)} corrected reference locations')

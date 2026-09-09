from pathlib import Path
import json, hashlib

root=Path(__file__).resolve().parent.parent
changes={}
def change(name, before, after):
    path=root/name
    data=path.read_bytes()
    changes.setdefault(name,data.decode('utf-8'))
    assert data.count(before.encode())==1,(name,before)
    path.write_bytes(data.replace(before.encode(),after.encode()))

for prefix,entry in [('', 'core-extension-v011.ts'),('compatibility/v010/','core-extension.ts')]:
    change(prefix+'lib/hajimi/'+entry,
        'if (stage === 7 || stage === 8) allowed.add("hajimi_validate_figure_plan");',
        'if (stage === 8) allowed.add("hajimi_validate_figure_plan");')
    change(prefix+'lib/hajimi/'+entry,
        'async execute(_id, params) { return textResult(JSON.stringify(params.action',
        'async execute(_id, params) { if ((await ensureHajimiTask(cwd)).state.focus.stage !== 8) throw new Error("Figure planning starts at stage 8."); return textResult(JSON.stringify(params.action')
    change(prefix+'lib/hajimi/capability-router.ts',
        'const selected = registry.filter((capability) => capability.manifest.allowedStages.includes(stage));',
        'const selected = registry.filter((capability) => capability.manifest.allowedStages.includes(stage)\n    && (capability.manifest.id !== "modeling-plot-suite" || stage >= 8));')

change('lib/hajimi/completion-checks.ts','if (stage === 7 || stage === 8) {','if (stage === 8) {')
change('lib/hajimi/context-projector.ts','Stage 7 completes FIGURE_PLAN.json','Stage 8 completes FIGURE_PLAN.json')
change('bundled/workflows/modeling-core/1.0.0/stage-cards/7.md','整理已选模型、代码、计算结果与图表计划','整理已选模型、代码、计算结果')
change('compatibility/v010/bundled/workflows/modeling-core/1.0.0/stage-cards/7.md',
    '把用户原话保留为第8阶段方向，读取 modeling-plot-suite',
    '把用户原话保留为第8阶段方向，进入第8阶段后读取 modeling-plot-suite')

audit=root/'docs/v012-plot-stage-before.json'
assert not audit.exists()
audit.write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
print('\n'.join(changes))

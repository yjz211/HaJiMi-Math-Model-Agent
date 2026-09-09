import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');const changes={};
function edit(p,fn){const before=fs.readFileSync(p);const text=before.toString('utf8');const after=Buffer.from(fn(text));if(before.equals(after))return;fs.writeFileSync(p,after);changes[p]={before:digest(before),after:digest(after)};}
for(const prefix of ['', 'compatibility/v010/'])for(const base of ['bundled/capabilities/modeling-plot-suite/1.0.0/resources/assets/shared-scripts/','toolkit/legacy-modeling-plot-suite/assets/shared-scripts/']){
 edit(prefix+base+'plot_utils.py',text=>{const start=text.indexOf('    # 尝试使用 SciencePlots');const end=text.indexOf("    matplotlib.rcParams['savefig.bbox']",start);if(start<0||end<0)throw Error('missing block');return (text.slice(0,start)+'    # 保持既有导出边界设置。\n'+text.slice(end)).replace('    if sns and not _has_scienceplots:', '    if sns:').replace('用 seaborn 主题（如果可用且没有 SciencePlots）','用 seaborn 主题（如果可用）').replace('SciencePlots — 经典学术','经典学术');});
 edit(prefix+base+'figure_style_guide.md',text=>text.replace(/## SciencePlots 库（可选）[\s\S]*?(?=## TikZ)/,'').replace(/> `pad=2\.0` 在 SciencePlots[^\n]*\r?\n> 大 pad 值会进一步挤压子图空间）。/,'> 大 pad 值会挤压子图空间。'));
 edit(prefix+base+'figure_recipes_basic.md',text=>text.replace('SciencePlots 下会导致子图极小','紧凑布局下会导致子图极小'));
}
for(const prefix of ['', 'compatibility/v010/']){const p=prefix+'bundled/capabilities/modeling-plot-suite/1.0.0/manifest.json';edit(p,text=>{const m=JSON.parse(text);for(const f of m.files){const b=fs.readFileSync(path.join(path.dirname(p),f.path));f.sha256=digest(b);f.sizeBytes=b.length;}return JSON.stringify(m,null,2)+'\n';});}
fs.writeFileSync('docs/v012-scienceplots-removal.json',JSON.stringify({reason:'User explicitly requested removal of SciencePlots',changes},null,2)+'\n');console.log('Changed files',Object.keys(changes).length);

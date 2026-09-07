"""Exercise product-bundled global Skill routes in a NEW scratch workspace.

Numerical data below is an explicitly synthetic solver test, not research evidence.
Run only with the managed Python environment. Retain outputs for visual inspection.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import pandas as pd
from scipy.linalg import solve

parser = argparse.ArgumentParser()
parser.add_argument('--workspace', type=Path, required=True)
args = parser.parse_args()
assert os.environ.get('HAJIMI_MANAGED_RUNTIME') == '1', 'Use the real managed runtime'
workspace = args.workspace.resolve()
workspace.mkdir(parents=True, exist_ok=False)
skill = Path(os.environ['HAJIMI_CAPABILITIES_ROOT']) / 'modeling-plot-suite/1.0.0/resources'
scripts = skill / 'scripts'


def run(script, *arguments):
    result = subprocess.run([sys.executable, str(script), *map(str, arguments)], cwd=workspace,
                            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    print(result.stdout)
    if result.returncode:
        raise RuntimeError(f'{script.name}: {result.stderr}\n{result.stdout}')


run(scripts / 'setup_workspace.py', '--workspace', workspace, '--capability', 'data')
figures = workspace / 'figures'
matrix = np.array([[3., 1.], [1., 2.]])
parameters = np.linspace(1., 5., 9)
results = np.array([solve(matrix, np.array([value, 2. * value])) for value in parameters])
assert np.allclose(results @ matrix.T, np.column_stack([parameters, 2. * parameters]))
pd.DataFrame({'参数': parameters, '解': results[:, 1]}).to_csv(figures / 'solver.csv', index=False)
(figures / 'provenance.json').write_text(json.dumps({
    'kind': 'synthetic-runtime-acceptance-only', 'equation': '[[3,1],[1,2]] x = [t,2t]',
    'plotted': 'x[1]', 'source': 'solver.csv',
}, ensure_ascii=False, indent=2), encoding='utf-8')
generator = figures / 'gen_fig_runtime.py'
generator.write_text('''from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from _plot_support.plot_utils import setup_style, save_fig, inspect_layout
root = Path(__file__).parent
data = pd.read_csv(root / "solver.csv")
assert list(data.columns) == ["参数", "解"] and len(data) == 9
assert np.isfinite(data.to_numpy()).all()
setup_style(base_size=12)
fig, ax = plt.subplots(figsize=(5.4, 3.5), layout="constrained")
ax.plot(data["参数"], data["解"], marker="o")
ax.set_xlabel("输入参数 t（无量纲）")
ax.set_ylabel("线性方程组的解（无量纲）")
for item in inspect_layout(fig):
    print(item)
save_fig(fig, root / "solver.pdf", close=False)
save_fig(fig, root / "solver.png")
''', encoding='utf-8')
run(scripts / 'check_plot_source.py', generator)
run(generator)
tikz = figures / 'geometry.tex'
tikz.write_text(r'''\documentclass[tikz,border=8pt]{standalone}
\usepackage[fontset=fandol]{ctex}
\usepackage{amsmath,amssymb}
\begin{document}
\begin{tikzpicture}
\draw[->] (0,0)--(4,0) node[right] {$x$};
\draw[->] (0,0)--(0,3) node[above] {$y$};
\draw[->] (0,0)--(3,2) node[above] {向量 $v=(3,2)$};
\end{tikzpicture}
\end{document}
''', encoding='utf-8')
run(scripts / 'check_tikz.py', tikz, '--compile')
engine = json.loads(os.environ['HAJIMI_RUNTIME_TOOLS'])['xelatex']
compiled = subprocess.run([engine, '-no-shell-escape', '-halt-on-error', '-interaction=nonstopmode', tikz.name],
                          cwd=figures, capture_output=True, encoding='utf-8', errors='replace', timeout=180)
assert compiled.returncode == 0, compiled.stdout + compiled.stderr
drawio = figures / 'linear-solve.drawio'
drawio.write_text('''<mxfile><diagram name="linear system"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="系数矩阵 A" style="rounded=0;fontSize=16" vertex="1" parent="1"><mxGeometry x="0" y="0" width="150" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="线性求解 Ax=b" style="rounded=0;fontSize=16" vertex="1" parent="1"><mxGeometry x="240" y="0" width="210" height="60" as="geometry"/></mxCell>
<mxCell id="e" source="a" target="b" edge="1" parent="1" style="endArrow=classic"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>''', encoding='utf-8')
run(scripts / 'check_drawio.py', drawio)
run(scripts / 'export_drawio.py', drawio, '--format', 'pdf')
for pdf in (figures / 'solver.pdf', figures / 'linear-solve.pdf', figures / 'geometry.pdf'):
    run(scripts / 'render_pdf_preview.py', pdf, '--output-dir', figures / 'preview')
    assert pdf.stat().st_size > 512
print(json.dumps({'passed': True, 'scope': 'route execution; visual inspection still required',
                  'workspace': str(workspace)}, ensure_ascii=False))

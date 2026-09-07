"""One-figure synthetic layout fixture, not a competition paper or research result."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--figures', type=Path, required=True)
args = parser.parse_args()
assert os.environ.get('HAJIMI_MANAGED_RUNTIME') == '1'
figures = args.figures.resolve()
page = figures.parent / 'page-acceptance'
page.mkdir(exist_ok=False)
scripts = Path(os.environ['HAJIMI_CAPABILITIES_ROOT']) / 'modeling-plot-suite/1.0.0/resources/scripts'
engine = json.loads(os.environ['HAJIMI_RUNTIME_TOOLS'])['xelatex']


def run(command):
    result = subprocess.run(list(map(str, command)), cwd=figures.parent, capture_output=True,
                            encoding='utf-8', errors='replace', timeout=180)
    print(result.stdout)
    assert result.returncode == 0, result.stderr + result.stdout
    return result.stdout


includes = figures / 'latex_includes.tex'
assert not includes.exists()
includes.write_text(r'''\begin{figure}[htbp]
\centering
\includegraphics[width=0.85\textwidth]{figures/solver.pdf}
\caption{线性求解器的合成测试：输入参数与第二分量的关系。}
\label{fig:solver}
\end{figure}
''', encoding='utf-8')
run([sys.executable, scripts / 'normalize_latex_figures.py', '--figdir', figures, '--latex', includes])
# Copy the approved block verbatim; the checker verifies the actual paper copy.
shutil.copyfile(includes, page / 'approved-figure.tex')
source = page / 'page-test.tex'
source.write_text(r'''\documentclass[UTF8,fontset=fandol]{ctexart}
\usepackage[a4paper,margin=25mm]{geometry}
\usepackage{graphicx}
\begin{document}
\typeout{HAJIMI-WIDTH=\the\textwidth}
\typeout{HAJIMI-HEIGHT=\the\textheight}
\section*{运行时页面排版测试（非论文成果）}
本页仅验证合成数据图的矢量嵌入、中文显示和实际字号，不包含研究结论。
图\ref{fig:solver}来自已保存的求解器测试数据。
\input{page-acceptance/approved-figure.tex}
\par 图中第二分量随输入参数线性变化；应能清楚辨认轴标签与刻度。
\end{document}
''', encoding='utf-8')
command = [engine, '-no-shell-escape', '-halt-on-error', '-interaction=nonstopmode',
           '-output-directory=' + str(page), source]
run(command)
log = run(command)
width = float(re.search(r'HAJIMI-WIDTH=([\d.]+)pt', log)[1]) * 25.4 / 72.27
height = float(re.search(r'HAJIMI-HEIGHT=([\d.]+)pt', log)[1]) * 25.4 / 72.27
run([sys.executable, scripts / 'audit_final_figure_size.py', figures / 'solver.pdf',
     '--tex-root', includes, '--profile', 'modeling', '--textwidth-mm', width,
     '--columnwidth-mm', width, '--linewidth-mm', width, '--textheight-mm', height,
     '--json', page / 'final-size-audit.json'])
run([sys.executable, scripts / 'check_latex_figure_sizes.py', '--latex', includes, '--paperdir', page])
run([sys.executable, scripts / 'render_pdf_preview.py', page / 'page-test.pdf', '--output-dir', page / 'preview'])
print(json.dumps({'passed': True, 'scope': 'single synthetic figure placement; inspect rendered page',
                  'page': str(page), 'measuredTextwidthMm': width, 'measuredTextheightMm': height}))

"""No network, no user fonts, no task mutation. --smoke uses only its temporary cwd."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import importlib.metadata

parser = argparse.ArgumentParser()
parser.add_argument('--smoke', action='store_true')
args = parser.parse_args()
packages = ['numpy', 'scipy', 'pandas', 'matplotlib', 'openpyxl', 'pypdf', 'pymupdf', 'scikit-learn', 'statsmodels', 'sympy', 'networkx', 'seaborn', 'pillow', 'python-docx']
versions = {name: importlib.metadata.version(name) for name in packages}
import numpy as np
import scipy.linalg
import pandas as pd
import matplotlib.pyplot as plt
import pymupdf as fitz
from pypdf import PdfReader
from matplotlib.font_manager import FontProperties

root = Path(os.environ['HAJIMI_RUNTIME_ROOT'])
font = root / 'fonts' / 'NotoSansCJKsc-Regular.ttf'
assert font.is_file(), 'missing managed Chinese font'
assert Path(sys.executable).resolve().is_relative_to(root.resolve()), 'Python is outside managed runtime'
tools = json.loads(os.environ['HAJIMI_RUNTIME_TOOLS'])
assert Path(tools['xelatex']).is_file()
report = {'python': sys.version.split()[0], 'executable': sys.executable, 'packages': versions, 'xelatex': tools['xelatex']}
if args.smoke:
    solution = scipy.linalg.solve(np.array([[3., 1.], [1., 2.]]), np.array([9., 8.]))
    assert np.allclose(solution, [2., 3.])
    frame = pd.DataFrame({'参数': [1, 2], '结果': [2., 3.]})
    target = Path('中文 Excel.xlsx'); frame.to_excel(target, index=False)
    loaded = pd.read_excel(target)
    assert list(loaded.columns) == list(frame.columns) and np.allclose(loaded.to_numpy(), frame.to_numpy())
    fig, ax = plt.subplots(); ax.plot([1, 2], [2, 3]); ax.set_title('中文计算验证', fontproperties=FontProperties(fname=str(font)))
    fig.savefig('中文 图.png'); plt.close(fig)
    tex = Path('main.tex')
    tex.write_text(r'''\documentclass[UTF8,fontset=fandol]{ctexart}
\usepackage{amsmath,amssymb,graphicx,booktabs,tikz}
\usepackage{fontspec}
\setmainfont{texgyretermes-regular.otf}
\begin{document}
中文数学建模运行时验证。English 123. $Ax=b$。
\begin{tabular}{rr}\toprule 输入&输出\\\midrule 1&2\\\bottomrule\end{tabular}
\begin{tikzpicture}\draw[->] (0,0)--(1,1);\end{tikzpicture}
\includegraphics[width=.6\linewidth]{中文 图.png}
\end{document}''', encoding='utf-8')
    for _ in range(2):
        result = subprocess.run([tools['xelatex'], '-no-shell-escape', '-halt-on-error', '-interaction=nonstopmode', 'main.tex'], capture_output=True, encoding='utf-8', errors='replace', timeout=90)
        if result.returncode: raise RuntimeError(result.stdout[-8000:] + result.stderr[-2000:])
    assert len(PdfReader('main.pdf').pages) > 0
    with fitz.open('main.pdf') as doc:
        assert '中文' in ''.join(page.get_text() for page in doc)
        doc[0].get_pixmap(dpi=100).save('page.png')
    report['smoke'] = {'numpy_scipy': True, 'xlsx': True, 'cjk_plot': True, 'xelatex_ctex_tikz': True, 'pdf_text_and_render': True}
print(json.dumps(report, ensure_ascii=False))

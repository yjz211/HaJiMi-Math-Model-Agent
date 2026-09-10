"""Render four unchanged recipes through old/new extraction, using fixed seeds."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops
import fitz

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / 'bundled/capabilities/modeling-plot-suite/1.0.0/resources/assets/shared-scripts'
ORIGINAL = ROOT / 'toolkit/legacy-modeling-plot-suite/assets/shared-scripts'
OUTPUT = ROOT / 'artifacts/v013-recipe-render-regression'
spec = importlib.util.spec_from_file_location('routing', SHARED / 'get_recipe.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
recipes = module.Recipes(SHARED)
OUTPUT.mkdir(parents=True, exist_ok=True)
results = []
for key in ['basic.raincloud', 'competition.surface_3d', 'empirical.prediction_ci', 'basic.multipanel']:
    entry = recipes.entries[key]
    category, number = entry['legacy'].split(' #')
    original = (ORIGINAL / entry['file']).read_text(encoding='utf-8')
    old = re.search(rf'^## {number}\.\s.*?(?=\n## \d+\.|\Z)', original, re.M | re.S).group(0).strip()
    new = recipes.extract(key)
    assert old == new
    outputs = []
    with tempfile.TemporaryDirectory(prefix='hajimi-recipe-render-') as directory:
        cwd = Path(directory)
        shutil.copytree(SHARED, cwd / '_utils', ignore=shutil.ignore_patterns('__pycache__'))
        for label, body in [('old', old), ('new', new)]:
            code = re.findall(r'```python\s*\n(.*?)```', body, re.S)[0]
            (cwd / 'gen_recipe.py').write_text(code, encoding='utf-8')
            result = subprocess.run([sys.executable, '-B', '-c', "import numpy as np,random,runpy;np.random.seed(42);random.seed(42);runpy.run_path('gen_recipe.py',run_name='__main__')"],
                                    cwd=cwd, env={**os.environ, 'MPLBACKEND': 'Agg', 'PYTHONHASHSEED': '0', 'PYTHONUTF8': '1'}, capture_output=True, text=True)
            (OUTPUT / f'{key}-{label}.log').write_text(result.stdout + result.stderr, encoding='utf-8')
            if result.returncode:
                raise RuntimeError(f'{key} {label}: {result.stderr[-1500:]}')
            pdfs = [path for path in cwd.rglob('*.pdf') if '_utils' not in path.parts]
            if len(pdfs) != 1:
                raise RuntimeError(f'Expected one rendered PDF for {key}, found {pdfs}')
            shutil.copy2(pdfs[0], OUTPUT / f'{key}-{label}.pdf')
            target = OUTPUT / f'{key}-{label}.png'
            with fitz.open(pdfs[0]) as document:
                document[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(target)
            outputs.append(target)
        with Image.open(outputs[0]) as before, Image.open(outputs[1]) as after:
            same = before.size == after.size and ImageChops.difference(before.convert('RGB'), after.convert('RGB')).getbbox() is None
            if not same:
                raise RuntimeError(f'Render pixels changed for {key}')
            results.append(dict(id=key, pixelsIdentical=True, size=before.size, sourceSha256=hashlib.sha256(code.encode()).hexdigest()))
    print(f'{key}: identical rendered pixels', flush=True)
(OUTPUT / 'results.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')

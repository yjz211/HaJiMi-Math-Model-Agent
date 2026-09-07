"""Compare native/bundled style semantics and rendered pixels on identical data.

This isolates the shared helper; managed-runtime and live-agent probes cover
workspace initialization, font environment, resource loading and tool use.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

p = argparse.ArgumentParser()
p.add_argument('--native', type=Path, required=True)
p.add_argument('--bundled', type=Path, required=True)
p.add_argument('--data', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
args = p.parse_args()
modules = []
for name, root in [('native', args.native), ('bundled', args.bundled)]:
    spec = importlib.util.spec_from_file_location(name, root / 'assets/plotting/plot_utils.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    modules.append(module)
data = pd.read_csv(args.data)
args.output.parent.mkdir(parents=True, exist_ok=True)
cases = [{'palette': k, 'style': 'clean_open'} for k in modules[0].PALETTES]
cases += [{'palette': 'journal', 'style': k} for k in modules[0].STYLE_FAMILIES]
cases += [{'config': {'palette': 'journal', 'style': 'clean_open'}},
          {'config': {'colors': ['#123456', '#ABCDEF'], 'custom': {'grid': 'y', 'frame': 'open'}}},
          {}]
rows = []
with tempfile.TemporaryDirectory(prefix='hajimi-helper-parity-') as scratch:
    previous = Path.cwd()
    os.chdir(scratch)
    try:
        Path('figures').mkdir()
        for case in cases:
            config = Path('figures/figure_style.json')
            if config.exists():
                config.unlink()
            if 'config' in case:
                config.write_text(json.dumps(case['config']), encoding='utf-8')
            config_before = config.read_bytes() if config.exists() else None
            snapshots = []
            for helper in modules:
                plt.rcdefaults()
                helper.setup_style(**{k: v for k, v in case.items() if k != 'config'})
                fig, ax = plt.subplots(figsize=(6.3, 3.3), layout='constrained')
                ax.scatter(data.total_length_nm, data.pairwise_over20_length_nm, color=helper.PALETTE[0], marker='o')
                ax.set(xlabel='测线长度（海里）', ylabel='超限重叠长度（海里）')
                fig.canvas.draw()
                snapshots.append({'palette': list(helper.PALETTE), 'colors': dict(helper.COLORS),
                    'rc': {k: str(v) for k, v in matplotlib.rcParams.items()},
                    'pixels': hashlib.sha256(fig.canvas.buffer_rgba()).hexdigest(),
                    'layout': helper.inspect_layout(fig)})
                plt.close(fig)
            assert snapshots[0] == snapshots[1], f'Native/bundled mismatch: {case}'
            assert (config.read_bytes() if config.exists() else None) == config_before
            rows.append({'case': case, 'pixels': snapshots[0]['pixels'], 'passed': True})
    finally:
        os.chdir(previous)
args.output.write_text(json.dumps({'passed': True, 'cases': rows, 'data_sha256': hashlib.sha256(args.data.read_bytes()).hexdigest(),
    'scope': 'helper behavior/pixels in one environment; does not prove agent compliance or deployment parity'}, indent=2), encoding='utf-8')
print(json.dumps({'passed': True, 'cases': len(rows), 'output': str(args.output)}))

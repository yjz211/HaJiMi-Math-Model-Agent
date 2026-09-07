"""Exercise real setup/bootstrap without creating or saving any figures."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
RESOURCE = ROOT / 'bundled/capabilities/modeling-plot-suite/1.0.0/resources'
PRISTINE = ROOT / 'toolkit/legacy-modeling-plot-suite/assets/shared-scripts/plot_utils.py'

def module_at(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class LegacyPlotTests(unittest.TestCase):
    def test_imported_palette_tracks_theme_without_mutating_templates(self):
        pu = module_at('tested_plot_utils', RESOURCE / 'assets/shared-scripts/plot_utils.py')
        palette, light, colors = pu.PALETTE, pu.PALETTE_LIGHT, pu.COLORS
        templates = {k: list(v) for k, v in pu.PALETTES.items()}
        plt = pu._get_plt()
        with patch.object(plt, 'figure', side_effect=AssertionError('No drawing allowed')), \
             patch.object(pu, '_read_style_custom_marker', return_value=None), \
             patch.object(pu, '_read_style_marker', return_value=None), \
             patch.object(pu, '_read_palette_marker', return_value=None), \
             patch.object(pu, '_fig_seed', return_value=3147973889):
            pu.setup_style()
            self.assertEqual(palette[:3], ['#4A5A2B', '#A68A64', '#7F4F24'])
            self.assertIs(palette, pu.PALETTE)
            self.assertIs(light, pu.PALETTE_LIGHT)
            self.assertIs(colors, pu.COLORS)
            self.assertEqual(colors['primary'], palette[0])
            self.assertEqual(light, [pu._lighten(c, 0.4) for c in palette])
            with patch.object(pu, '_fig_seed', return_value=0), patch.object(pu, '_read_palette_marker', return_value='elegant'):
                pu.setup_style()
            self.assertEqual(palette, templates['elegant'])
            self.assertEqual(pu.PALETTES, templates)
            self.assertEqual(plt.get_fignums(), [])

    def test_bootstrap_upgrades_only_known_original_helpers(self):
        sys.path.insert(0, str(RESOURCE / 'scripts'))
        bootstrap = module_at('tested_bootstrap', RESOURCE / 'scripts/bootstrap.py')
        shipped = (RESOURCE / 'assets/shared-scripts/plot_utils.py').read_bytes()
        with tempfile.TemporaryDirectory(prefix='hajimi-palette-migration-') as name:
            workspace = Path(name)
            paths = [workspace / '_utils/plot_utils.py', workspace / 'skills/shared-scripts/plot_utils.py']
            for path in paths:
                path.parent.mkdir(parents=True)
                path.write_bytes(PRISTINE.read_bytes())
            with patch.object(sys, 'argv', ['bootstrap.py', '--workspace', name]), \
                 patch.object(bootstrap, 'resolve', return_value={}), contextlib.redirect_stdout(io.StringIO()):
                bootstrap.main()
                for path in paths:
                    self.assertEqual(path.read_bytes(), shipped)
                paths[0].write_bytes(b'# user custom helper\n')
                bootstrap.main()
                self.assertEqual(paths[0].read_bytes(), b'# user custom helper\n')
                self.assertEqual(paths[1].read_bytes(), shipped)

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='hajimi-mpl-cache-') as cache:
        os.environ['MPLCONFIGDIR'] = cache
        unittest.main()

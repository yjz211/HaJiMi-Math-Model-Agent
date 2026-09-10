"""Routing regression tests. Never rewrite recipe bodies or rendering helpers."""
import os
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CAP = ROOT / os.environ.get('HAJIMI_TEST_CAP_PREFIX', '') / 'bundled/capabilities/modeling-plot-suite/1.0.0'
SHARED = CAP / 'resources/assets/shared-scripts'
spec = importlib.util.spec_from_file_location('recipe_routing', SHARED / 'get_recipe.py')
routing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routing)


class RecipeRoutingTests(unittest.TestCase):
    def test_every_original_recipe_is_returned_in_full_by_both_interfaces(self):
        recipes = routing.Recipes(SHARED)
        self.assertEqual(len(recipes.entries), 108)
        for key, entry in recipes.entries.items():
            with self.subTest(key=key):
                original = (ROOT / 'toolkit/legacy-modeling-plot-suite/assets/shared-scripts' / entry['file']).read_text(encoding='utf-8')
                category, number = entry['legacy'].split(' #')
                expected = re.search(rf'^## {number}\.\s.*?(?=\n## \d+\.|\Z)', original, re.M | re.S).group(0).strip()
                self.assertEqual(recipes.extract(key), expected)
                self.assertEqual(recipes.extract(recipes.legacy_id(category, number)), expected)

    def fixture(self, root):
        shutil.copytree(SHARED, root, ignore=shutil.ignore_patterns('__pycache__'))
        return routing.Recipes(root)

    def test_reorder_and_renumber_preserve_identity_including_legacy_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            recipes = self.fixture(Path(directory) / 'bundle')
            file = recipes.root / 'figure_recipes_academic.md'
            original = recipes.extract('academic.tsne_umap')
            items = routing.sections(file.read_text(encoding='utf-8'))
            file.write_text('\n\n'.join(re.sub(r'^## \d+\.', f'## {100 + i}.', body) for i, (_, _, body) in enumerate(reversed(items))), encoding='utf-8')
            result = recipes.extract(recipes.legacy_id('academic', 3))
            self.assertEqual(routing.content_hash(result), routing.content_hash(original))
            self.assertIn('t-SNE / UMAP', result.splitlines()[0])

    def test_wrong_bundle_duplicate_title_and_unknown_id_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            recipes = self.fixture(Path(directory) / 'bundle')
            with self.assertRaisesRegex(ValueError, 'Unknown recipe'):
                recipes.extract('academic.missing')
            path = recipes.root / 'figure_recipes_academic.md'
            original = path.read_text(encoding='utf-8')
            path.write_text(original.replace('t-SNE / UMAP', 'wrong-title'), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'matching title'):
                recipes.extract('academic.tsne_umap')
            # Corrupt only the selected section, preserving its title.
            path.write_text(original.replace('## 4.', 'changed body\n## 4.', 1), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'differs'):
                recipes.extract('academic.tsne_umap')
            path.write_text(original + '\n\n## 99. ' + recipes.entries['academic.tsne_umap']['title'] + '\ncode', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'found 2'):
                recipes.extract('academic.tsne_umap')

    def test_plan_prefetch_supports_grouped_legacy_and_ids_without_partial_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            plan = cwd / 'plan with spaces.md'
            plan.write_text('recipe:basic.raincloud; comp #10 + #11; academic #3; recipe:basic.raincloud', encoding='utf-8')
            output = cwd / 'prefetch.md'
            command = [sys.executable, '-B', str(SHARED / 'get_recipe.py'), '--plan', str(plan), '--output', str(output)]
            subprocess.run(command, cwd=cwd, check=True, capture_output=True)
            before = output.read_bytes()
            self.assertEqual(before.count(b'########## recipe:'), 4)
            self.assertIn(b'academic.tsne_umap', before)
            plan.write_text('recipe:basic.raincloud recipe:academic.missing', encoding='utf-8')
            result = subprocess.run(command, cwd=cwd, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), before)

    def test_cwd_cannot_shadow_the_script_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            (cwd / '_utils').mkdir()
            (cwd / '_utils/figure_recipes_academic.md').write_text('## 3. Wrong recipe\nwrong body', encoding='utf-8')
            result = subprocess.run([sys.executable, '-B', str(SHARED / 'get_recipe.py'), 'academic', '3'], cwd=cwd, capture_output=True, check=True)
            self.assertEqual(result.stdout.decode('utf-8').replace('\r\n', '\n').strip(), routing.Recipes(SHARED).extract('academic.tsne_umap'))

    def test_bootstrap_refreshes_only_known_old_routing_files(self):
        bootstrap = CAP / 'resources/scripts/bootstrap.py'
        baseline = ROOT / 'toolkit/legacy-modeling-plot-suite/assets/shared-scripts'
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            (cwd / '_utils').mkdir()
            shutil.copy2(baseline / 'get_recipe.py', cwd / '_utils/get_recipe.py')
            shutil.copy2(baseline / 'figure_style_guide.md', cwd / '_utils/figure_style_guide.md')
            (cwd / '_utils/plot_utils.py').write_text('# user customized plotting helper', encoding='utf-8')
            subprocess.run([sys.executable, '-B', str(bootstrap), '--workspace', str(cwd), '--capability', 'paper-figure'], check=True, capture_output=True)
            self.assertEqual((cwd / '_utils/get_recipe.py').read_bytes(), (SHARED / 'get_recipe.py').read_bytes())
            self.assertEqual((cwd / '_utils/figure_style_guide.md').read_bytes(), (SHARED / 'figure_style_guide.md').read_bytes())
            self.assertEqual((cwd / '_utils/plot_utils.py').read_text(), '# user customized plotting helper')
            self.assertEqual(routing.Recipes(cwd / '_utils').extract('basic.raincloud'), routing.Recipes(SHARED).extract('basic.raincloud'))


if __name__ == '__main__':
    unittest.main()

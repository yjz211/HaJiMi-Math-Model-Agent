"""Regression checks for the real bundled skeleton/checker/delivery interfaces."""
import json
import hashlib
import subprocess
import sys
import tempfile
import unittest
import runpy
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'bundled/capabilities/modeling-paper-standard/1.0.0/resources/scripts'
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT / 'toolkit/src'))
from create_paper_skeleton import create
from check_latex_layout_risks import expand_inputs
from hajimi_toolkit.stage8_validation import stage8_checks, _equation_checks


class PaperIntegration(unittest.TestCase):
    def test_delivery_equations_use_active_frozen_artifacts_and_real_checker(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp).resolve()
            original = r'\begin{equation}D=D_0-x\tan\alpha.\label{eq:q1depth}\end{equation}'
            baseline, current, frozen = (workspace / name for name in ['technical.tex', 'main.tex', 'cas'])
            for path in [baseline, current, frozen]:
                path.write_text(original, encoding='utf-8')
            artifact = {'id': 'formula-1', 'path': 'technical.tex', 'frozenPath': 'cas', 'sizeBytes': baseline.stat().st_size, 'sha256': hashlib.sha256(baseline.read_bytes()).hexdigest()}
            experiment = {'experimentId': 'exp', 'status': 'succeeded', 'trust': 'verified', 'selection': 'selected', 'outputRefs': [artifact]}
            evidence = {'evidenceId': 'ev', 'status': 'frozen', 'domainValidationStatus': 'accepted', 'experimentRefs': ['exp'], 'artifactRefs': ['formula-1']}
            freeze = {'status': 'active', 'evidenceRefs': ['ev']}
            state = {'provenance': {'experiments': [experiment], 'evidence': [evidence], 'freezes': [freeze]}}
            config = {'equationBaselineArtifactIds': ['formula-1']}
            def verify():
                return _equation_checks(workspace, state, config, current, SCRIPTS)
            self.assertTrue(all(item['passed'] for item in verify()))
            for source in [original.replace('eq:q1depth', 'eq:other'), original.replace('D_0-x', 'D_0+x'), '']:
                current.write_text(source, encoding='utf-8')
                self.assertFalse(verify()[-1]['passed'])
            current.write_text(original, encoding='utf-8')
            for obj, field, bad in [(freeze, 'status', 'invalidated'), (evidence, 'status', 'stale'), (experiment, 'trust', 'legacy_unverified'), (experiment, 'selection', 'invalidated'), (artifact, 'path', '../outside.tex')]:
                previous = obj[field]
                obj[field] = bad
                self.assertFalse(verify()[0]['passed'])
                obj[field] = previous
            baseline.write_text(original + 'drift', encoding='utf-8')
            self.assertFalse(verify()[0]['passed'])
            baseline.write_text(original, encoding='utf-8')
            frozen.write_text('tampered', encoding='utf-8')
            self.assertFalse(verify()[0]['passed'])
            self.assertFalse(_equation_checks(workspace, state, {}, current, SCRIPTS)[0]['passed'])
            frozen.write_text(original, encoding='utf-8')
            (workspace / '.hajimi').mkdir()
            (workspace / '.hajimi/state.json').write_text(json.dumps(state), encoding='utf-8')
            (workspace / 'paper').mkdir()
            (workspace / 'paper/hajimi-paper-config.json').write_text(json.dumps({**config, 'mainTex': 'main.tex'}), encoding='utf-8')
            with patch.dict('os.environ', {'HAJIMI_CAPABILITIES_ROOT': str(ROOT / 'bundled/capabilities'), 'PYTHONUTF8': '1'}):
                checks = stage8_checks(workspace, strict=True)
            self.assertTrue(next(item for item in checks if item['name'] == 'stage8_equation_drift_1')['passed'])

    def test_exact_equation_labels_reject_rename_drift_and_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            baseline, current = Path(tmp) / 'baseline.tex', Path(tmp) / 'current.tex'
            original = r'\begin{equation}D=D_0-x\tan\alpha.\label{eq:q1-depth}\end{equation}'
            baseline.write_text(original, encoding='utf-8')
            command = [sys.executable, '-B', '-X', 'utf8', str(SCRIPTS / 'check_latex_equation_drift.py'), str(baseline), str(current), '--require-all', '--exact-labels']
            for source, expected in [(original, 0), (original.replace('eq:q1-depth', 'eq:q2-depth'), 1), (original.replace('D_0-x', 'D_0+x'), 1), (original + original, 1), ('', 1)]:
                current.write_text(source, encoding='utf-8')
                result = subprocess.run(command, capture_output=True, encoding='utf-8')
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)

    def test_whole_paper_balance_covers_split_files_and_exact_threshold(self):
        checker = runpy.run_path(str(ROOT / 'scripts/check-hajimi-section-balance.py'))
        with tempfile.TemporaryDirectory() as tmp:
            paper = Path(tmp)
            main = paper / 'main.tex'
            main.write_text(r'\section*{六、模型建立与求解}\input{model}' + r'\section*{七、模型检验}\input{validation}' + r'\section*{八、模型优缺点评价}\input{evaluation}' + r'\section*{九、参考文献}', encoding='utf-8')
            for name, count in [('model', 1000), ('validation', 200), ('evaluation', 100)]:
                (paper / f'{name}.tex').write_text('测' * count, encoding='utf-8')
            self.assertEqual(checker['whole_paper_units'](main), [1000, 200, 100])
            command = [sys.executable, '-B', '-X', 'utf8', str(SCRIPTS / 'check_section_balance.py'), '--main', str(main)]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            (paper / 'evaluation.tex').write_text('测' * 101, encoding='utf-8')
            model, validation, evaluation = checker['whole_paper_units'](main)
            self.assertGreater((validation + evaluation) / model, .30)
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)
            main.write_text(main.read_text(encoding='utf-8').replace('八、模型优缺点评价', '八、其他内容'), encoding='utf-8')
            with self.assertRaises(ValueError):
                checker['whole_paper_units'](main)

    def test_split_manuscript_and_real_emphasis_macro(self):
        with tempfile.TemporaryDirectory() as tmp:
            paper = Path(tmp) / 'paper'
            create(paper, '多波束测线设计', 2)
            abstract = paper / 'sections/abstract.tex'
            abstract.write_text(r'\paperkey{针对问题一，}计算覆盖宽度。' + '\n\n' + r'\paperkey{针对问题二，}比较测线方向。', encoding='utf-8')
            command = [sys.executable, '-B', '-X', 'utf8', str(SCRIPTS / 'check_latex_structure.py'), str(paper / 'main.tex'), '--questions', '2']
            result = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            analysis = paper / 'sections/analysis.tex'
            original = analysis.read_text(encoding='utf-8')
            analysis.write_text(original.replace('2.1', '1.1'), encoding='utf-8')
            failed = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('2.1', failed.stdout)
            analysis.write_text(original, encoding='utf-8')
            main = paper / 'main.tex'
            main.write_text(main.read_text(encoding='utf-8').replace(r'\newcommand{\paperkey}[1]{{\heiti\bfseries #1}}', r'\newcommand{\paperkey}[1]{#1}'), encoding='utf-8')
            failed = subprocess.run(command, capture_output=True, encoding='utf-8')
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('加粗', failed.stdout)

    def test_skeleton_preserves_route_structure_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as tmp:
            paper = Path(tmp) / 'paper'
            create(paper, '测试', 3, True, [3])
            source = expand_inputs(paper / 'main.tex')
            self.assertIn('五、数据处理与概览', source)
            self.assertIn('6.3.1 模型建立', source)
            self.assertIn('8.3 模型的改进', source)
            self.assertLess(source.index('Step 4 模型汇总'), source.index('6.3.2 模型求解'))
            before = (paper / 'main.tex').read_bytes()
            with self.assertRaises(FileExistsError):
                create(paper, '覆盖', 2)
            self.assertEqual((paper / 'main.tex').read_bytes(), before)
            with self.assertRaises(ValueError):
                create(Path(tmp) / 'bad', '测试', 2, False, [3])
            self.assertFalse((Path(tmp) / 'bad').exists())

    def test_delivery_invokes_typography_and_keeps_its_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp).resolve()
            (workspace / '.hajimi').mkdir()
            (workspace / '.hajimi/state.json').write_text(json.dumps({'questions': [{}, {}]}), encoding='utf-8')
            (workspace / 'paper').mkdir()
            (workspace / 'paper/main.tex').write_text('test', encoding='utf-8')
            (workspace / 'paper/main.pdf').write_bytes(b'fixture handled by the subprocess spy')
            (workspace / 'paper/hajimi-paper-config.json').write_text(json.dumps({'questions': 2, 'topicTerms': ['测线', '覆盖']}), encoding='utf-8')
            calls = []
            def invoke(command, **kwargs):
                calls.append(command)
                typography = Path(command[1]).name == 'check_pdf_typography.py'
                return subprocess.CompletedProcess(command, 1 if typography else 0, 'wrong typography' if typography else 'PASS', '')
            with patch.dict('os.environ', {'HAJIMI_CAPABILITIES_ROOT': str(ROOT / 'bundled/capabilities')}), patch('hajimi_toolkit.stage8_validation.subprocess.run', side_effect=invoke):
                checks = stage8_checks(workspace, strict=True)
            self.assertTrue(any(Path(command[1]).name == 'check_pdf_typography.py' for command in calls))
            check = next(item for item in checks if item['name'] == 'stage8_pdf_typography')
            self.assertFalse(check['passed'])
            self.assertEqual(check['severity'], 'error')
            self.assertTrue(any(item['name'] == 'stage8_section_balance' for item in checks))
            self.assertTrue(any(item['name'] == 'stage8_equation_baseline' and not item['passed'] for item in checks))
            self.assertTrue(all(item['passed'] for item in checks if item['name'].startswith('capability_')))


if __name__ == '__main__':
    unittest.main()

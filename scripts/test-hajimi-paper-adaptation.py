"""Exercise the adapted page gate using real PDFs, without changing task outputs."""
import runpy
import subprocess
import sys
import tempfile
from pathlib import Path
import pymupdf as fitz

root = Path('bundled/capabilities/modeling-paper-standard/1.0.0/resources/scripts')
sys.path.insert(0, str(root.resolve()))
structure = runpy.run_path(str(root / 'check_latex_structure.py'))
for key in ['STANDARD_HEADINGS', 'DATA_ANALYSIS_HEADINGS']:
    assert structure[key][-1] == '参考文献'
    assert '附录' not in structure[key]
with tempfile.TemporaryDirectory(prefix='hajimi-paper-gate-') as tmp:
    for pages, appendix, expected in [(22, False, 0), (21, False, 1), (31, False, 1), (22, True, 1)]:
        doc = fitz.open()
        for number in range(pages):
            page = doc.new_page()
            page.insert_text((72, 72), '附录' if appendix and number == pages - 1 else '参考文献' if number == pages - 1 else '正文', fontname='china-s')
        path = Path(tmp) / f'{pages}-{appendix}.pdf'
        doc.save(path)
        doc.close()
        result = subprocess.run([sys.executable, '-B', '-X', 'utf8', str(root / 'check_pdf_page_gate.py'), str(path)], capture_output=True, text=True, encoding='utf-8')
        assert result.returncode == expected, result.stdout + result.stderr
        print(result.stdout.strip())
print('PASS: standard/data structure and four real-PDF page boundaries')

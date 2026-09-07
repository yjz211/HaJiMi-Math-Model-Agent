"""Real-PDF appendix smoke using the retained isolated paper, not a user paper."""
import importlib.util
import json
import re
from pathlib import Path
import shutil
import tempfile

import fitz

root = Path(__file__).resolve().parents[1]
script = root / "bundled/capabilities/modeling-submission-package/1.0.0/resources/scripts/build_code_appendix.py"
spec = importlib.util.spec_from_file_location("appendix", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
workspace = Path(tempfile.mkdtemp(prefix="hajimi-appendix-"))
source = root / "docs/verification/native-20260905/live-skill/5a705a37-6ab0-470f-967a-9248f4ae38ef/paper/efficiency_prepare/main.pdf"
shutil.copy2(source, workspace / "body.pdf")
shutil.copy2(script, workspace / "appendix.py")
output = workspace / "deliverables" / "v1"
output.mkdir(parents=True)
config = output / "generation-config.json"
config.write_text(json.dumps({"workspace_root": "../..", "papers": {"without_code": "../../body.pdf"},
    "code_files": [{"source": "../../appendix.py", "appendix": "B1", "purpose": "代码附录生成器隔离测试（含中文注释、长行与跨页）"}]}), encoding="utf-8")
receipt = module.build(config)
assert module.digest(source) == module.digest(workspace / "body.pdf") == receipt["body_sha256"]
with fitz.open(output / receipt["with_code"]) as pdf:
    extracted_code = []
    for index in range(receipt["body_pages"], len(pdf)):
        page = pdf[index]
        assert page.get_text().strip()
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    assert fitz.Rect(span["bbox"]) in page.rect, span
                    if span["bbox"][0] >= 84 and span["bbox"][1] < 790:
                        extracted_code.append(span["text"])
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(output / f"page-{index + 1}.png")
    receipt["total_pages"] = len(pdf)
    assert re.sub(r"\s+", "", "".join(extracted_code)) == re.sub(r"\s+", "", (workspace / "appendix.py").read_text(encoding="utf-8")), "Code characters were lost during layout"
try:
    module.build(config)
    raise AssertionError("Existing output was overwritten")
except FileExistsError:
    pass
print(json.dumps({"output": str(output), **receipt}, ensure_ascii=False, indent=2))

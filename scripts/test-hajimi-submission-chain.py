"""Actual PDF -> appendix + AI DOCX/PDF -> ZIP -> package validation smoke."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
scripts = root / "bundled/capabilities/modeling-submission-package/1.0.0/resources/scripts"
workspace = Path(tempfile.mkdtemp(prefix="hajimi-submission-chain-"))
delivery = workspace / "deliverables"
appendix, package, validation = [delivery / name for name in ("appendix", "package", "validation")]
for path in (appendix, package, validation):
    path.mkdir(parents=True)
body = root / "docs/verification/native-20260905/live-skill/5a705a37-6ab0-470f-967a-9248f4ae38ef/paper/efficiency_prepare/main.pdf"
shutil.copy2(body, workspace / "body.pdf")
shutil.copy2(scripts / "build_code_appendix.py", workspace / "appendix.py")

def run(script, folder, config, success=True):
    path = folder / "generation-config.json"
    path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    result = subprocess.run([sys.executable, str(script), str(path)], capture_output=True, text=True, encoding="utf-8")
    if success:
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    assert result.returncode != 0, "Invalid package passed"
    return result.stderr

code = {"source": "../../appendix.py", "target": "代码/appendix.py", "appendix": "B1", "purpose": "代码附录生成器隔离测试（含中文注释、长行与跨页）"}
run(scripts / "build_code_appendix.py", appendix, {"workspace_root": "../..", "papers": {"without_code": "../../body.pdf"}, "code_files": [code]})
ai_result = subprocess.run([sys.executable, str(root / "scripts/test-hajimi-ai-report.py")], capture_output=True, text=True, encoding="utf-8")
assert ai_result.returncode == 0, ai_result.stderr
ai = Path(json.loads(ai_result.stdout)["output"])
shutil.copytree(ai, delivery / "ai")
package_config = {"workspace_root": "../..", "output_dir": ".", "staging_name": "files", "zip_name": "提交包.zip",
    "papers": {"without_code": "../../body.pdf", "with_code": "../appendix/00_论文_含完整代码附录.pdf"},
    "ai_report_pdf": "../ai/AI工具使用详情.pdf", "code_files": [code],
    "data_instructions": "隔离软件验证样例，不含正式竞赛原始数据。",
    "run_steps": ["使用受管Python运行附录生成器，并提供本题配置JSON。"]}
run(scripts / "build_submission_package.py", package, package_config)
request = {"workspace_root": "../..", "package_path": "../package/提交包.zip", "accepted_body_path": "../../body.pdf",
    "accepted_body_sha256": hashlib.sha256(body.read_bytes()).hexdigest()}
report = run(scripts / "validate_submission.py", validation, request)
assert report["status"] == "technical_pass_visual_review_required"
assert len(report["previews"]) == 13
archive_path = package / "提交包.zip"
original = archive_path.read_bytes()
with zipfile.ZipFile(archive_path) as archive:
    entries = {name: archive.read(name) for name in archive.namelist()}
entries["代码/appendix.py"] += b"\n# tampered\n"
with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in entries.items():
        archive.writestr(name, data)
assert "checksum mismatch" in run(scripts / "validate_submission.py", validation, request, success=False)
archive_path.write_bytes(original)
assert run(scripts / "validate_submission.py", validation, request)["zip_sha256"] == report["zip_sha256"]
print(json.dumps({"workspace": str(workspace), "report": report, "tamper_rejection": "passed"}, ensure_ascii=False, indent=2))

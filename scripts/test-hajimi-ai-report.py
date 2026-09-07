"""Render an honest record of the actual isolated appendix test, then test draft rejection."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import pymupdf as fitz

root = Path(__file__).resolve().parents[1]
script = root / "bundled/capabilities/modeling-submission-package/1.0.0/resources/scripts/render_ai_usage_report.py"
output = Path(tempfile.mkdtemp(prefix="hajimi-ai-report-"))
config = {"document_status": "final", "tools": [{"name": "Codex", "version": "使用期间平台默认模型，界面未显示具体版本",
    "provider": "OpenAI", "use_method": "桌面客户端辅助开发与工具调用", "date_range": "2026年9月6日"}],
    "records": [{"id": "1", "tool": "Codex", "stage": "提交材料能力的隔离软件测试", "purpose": "为论文追加可读代码附录，同时保留原正文页面",
        "provided_materials": "已有隔离测试论文PDF和附录生成器源码；未使用用户正式竞赛题目", "prompt_summary": "提示摘要：将打包、附录和AI使用说明能力深度接入第九阶段，保留现有限制，并进行隔离测试。",
        "process": "实现代码附录生成器，使用受管Python运行，渲染附录页面并检查；发现目录独占一页后调整为与首段代码共页，再次生成并核验。",
        "ai_output": "两版论文PDF、代码来源哈希回执和附录页面预览", "paper_location": "隔离测试PDF的第5至7页代码附录；不代表完整竞赛论文通过验收",
        "adoption": "采纳", "human_modification": "本轮没有观察到人工修改操作，版面调整由AI执行。",
        "verification": "AI调用程序逐页比较原4页正文文本与144dpi渲染像素，结果一致；抽取附录代码并去除排版空白后与源文件比较一致。AI查看全部3页附录，未观察到裁切或乱码。这些动作不是人工核验。"}],
    "responsibility_statement": "本文件记录已发生的隔离软件测试，不是竞赛提交材料或人工验收结论。正式提交前仍须由负责人核对使用记录、适用规则和最终材料。"}

final_config = json.loads(json.dumps(config))

def run(export=True):
    path = output / "generation-config.json"
    path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    return subprocess.run([sys.executable, str(script), str(path)] + (["--export-pdf"] if export else []), capture_output=True, text=True, encoding="utf-8")

result = run()
assert result.returncode == 0, result.stderr
summary = json.loads(result.stdout)
with fitz.open(summary["pdf"]) as pdf:
    for index, page in enumerate(pdf):
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(output / f"page-{index + 1}.png")
    pages = len(pdf)
config["document_status"] = "draft"
config["output_docx"] = "草稿.docx"
config["records"][0]["purpose"] = "【待补充具体任务】"
draft = run(export=False)
assert draft.returncode == 0, draft.stderr
assert json.loads(draft.stdout)["pdf"] is None, "Draft reported stale final PDF"
config["document_status"] = "final"
blocked = run()
assert blocked.returncode != 0 and "最终提交版" in blocked.stderr
(output / "generation-config.json").write_text(json.dumps(final_config, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"output": str(output), "pages": pages, "final": summary, "draft_and_placeholder_rejection": "passed"}, ensure_ascii=False, indent=2))

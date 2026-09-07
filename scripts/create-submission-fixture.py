"""Create a minimal software-only body and truthful disclosure input for tool smoke."""
import json
from pathlib import Path
import tempfile
import pymupdf as fitz

output = Path(tempfile.mkdtemp(prefix="hajimi-submission-positive-"))
with fitz.open() as doc:
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 75), "Submission pipeline software fixture", fontsize=19)
    page.insert_text((60, 112), "NOT a competition paper or human acceptance record.", fontsize=11)
    page.insert_text((60, 155), "Purpose", fontsize=14)
    page.insert_text((60, 180), "Verify immutable body copying, appendix packaging and report delivery.", fontsize=11)
    page.insert_text((60, 230), "Deterministic example", fontsize=14)
    page.insert_text((60, 255), "For y = 2x, x = 1, 2, 3 gives y = 2, 4, 6.", fontsize=11)
    page.insert_text((60, 305), "Scope", fontsize=14)
    page.insert_text((60, 330), "Synthetic workflow state tests software only, never user approval.", fontsize=11)
    page.insert_text((290, 800), "1", fontsize=10)
    doc.save(output / "body.pdf")

with fitz.open(output / "body.pdf") as check:
    assert len(check) == 1
    assert "NOT a competition paper" in check[0].get_text()
    assert "y = 2, 4, 6" in check[0].get_text()

config = {
    "document_status": "final",
    "tools": [{"name": "Codex", "version": "平台未在本测试记录中提供具体模型版本", "provider": "OpenAI",
               "use_method": "桌面客户端调用受管工具", "date_range": "2026年9月6日"}],
    "records": [{"id": "1", "tool": "Codex", "stage": "第九阶段软件测试", "purpose": "创建独立的软件测试正文和如实使用说明输入",
                 "provided_materials": "第九阶段实现与用户要求；本样例不包含正式题目或用户论文",
                 "prompt_summary": "将打包、代码附录和AI说明深度融合进第九阶段并进行隔离测试，保留所有限制。",
                 "process": "AI编写并执行小型PDF夹具生成器，制作一页明确标注为软件测试的正文。",
                 "ai_output": "一页软件测试PDF及本说明的结构化输入",
                 "paper_location": "软件测试正文第1页；非竞赛论文",
                 "adoption": "采纳",
                 "human_modification": "本次未观察到人工修改。",
                 "verification": "AI调用程序重新打开PDF，核对页数为1，抽取文字并检查软件测试声明和示例数值均存在。只用于隔离软件测试，不预先宣称后续打包、页面审查或人工验收成功。后续结果另存独立记录。"}],
    "responsibility_statement": "本说明不是竞赛合规声明。合成验收状态只用于软件测试，不能视为用户已审查论文。"
}
(output / "ai-config.json").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
print(output)

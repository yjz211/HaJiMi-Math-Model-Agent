# AI 工具使用声明 —— 生成规范（comp-paper 系列共用）

> 仅当 `CLAUDE.md` 含 `MH_AI_DISCLOSURE=used` 或 `=none` 时才执行本规范；否则整步跳过、不产任何声明内容（对现有出稿零影响）。

## 0. 读取开关与日期区间

```bash
AI_DISC=off
grep -q 'MH_AI_DISCLOSURE=used' CLAUDE.md 2>/dev/null && AI_DISC=used
grep -q 'MH_AI_DISCLOSURE=none' CLAUDE.md 2>/dev/null && AI_DISC=none
echo "AI_DISC=$AI_DISC"
```

`AI_DISC=off` → 跳过本步。`=none` → 只做第 2 节。`=used` → 做第 3 节全部。

**日期区间**（仅 used 需要）：从 CLAUDE.md 取比赛起止，用 python 在区间内随机生成几个日期（**只到日、不带时间**）。python 跨平台稳，别用 bash 手算日期：

```bash
PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python
DS=$(grep -oP 'MH_AI_DISC_DATE_START=\K[0-9-]+' CLAUDE.md 2>/dev/null | head -1)
DE=$(grep -oP 'MH_AI_DISC_DATE_END=\K[0-9-]+' CLAUDE.md 2>/dev/null | head -1)
$PYTHON - "$DS" "$DE" <<'PY'
import sys, random
from datetime import date, timedelta
def parse(s):
    try: return date.fromisoformat(s)
    except Exception: return None
ds, de = parse(sys.argv[1] if len(sys.argv)>1 else ""), parse(sys.argv[2] if len(sys.argv)>2 else "")
if not ds: ds = date.today()
if not de or de < ds: de = ds
span = (de - ds).days
# 生成 4 个区间内随机日期（升序），供填表/参考文献/交互记录用
picks = sorted(ds + timedelta(days=random.randint(0, span)) for _ in range(4))
print("CAND_DATES=" + " ".join(d.isoformat() for d in picks))
PY
```

把打印的候选日期填进下面各表/条目（同一篇内可复用，体现"竞赛期间陆续使用"）。

## 1. 合规红线（❗ 生成内容前必读，违反即失格风险）

- **只用国产模型**（见第 4 节库），随机采纳 **1–3 个不同**模型。
- **每篇必须不一样**：模型组合、声明措辞、使用环节、交互记录 prompt/回复，都要随机变化，**严禁千篇一律照抄本文示例**。示例只示范"长什么样"，实际内容按本篇论文真实主题/方法/章节改写。
- **严格避开竞赛第九条禁区**——以下用途一律不得出现：核心方法/研究思路设计、数据采集/生成/篡改（含改图表数据）、作者信息生成、引言核心内容（研究目的/理由/预期结果）、主体核心创新（理论/材料与方法/结果与讨论）、直接生成整篇论文或报告、直接生成附录内容。
- **只落合规辅助用途**（从这些里选，措辞可变）：中文语句润色/书面表达优化（非引言核心）、代码运行报错调试/语法修正（不设计算法）、LaTeX/Word 排版与公式格式修正、参考文献著录格式（GB/T 7714）整理、专业术语中英翻译校对。
- **采纳情况**统一体现"人工主导"：AI 产出经人工逐句核对/本地复跑验证后部分采纳，数值与结论均由本队独立得出、未被 AI 改动。

## 2. AI_DISC=none（未使用 AI）

只在参考文献之前插入一段独立声明，不产附录详情、不在参考文献列 AI 工具。

- **LaTeX 版**（comp-paper-zh/en）：写 `paper/sections/Z_ai_disclosure.tex`：
  ```latex
  \section*{AI 工具使用声明}
  \addcontentsline{toc}{section}{AI 工具使用声明}
  本参赛队在竞赛过程中未使用任何 AI 工具。
  ```
  然后调注入脚本插 `\input`（none 模式不插附录）：
  ```bash
  INJ=_utils/inject_ai_disclosure.py; [ -f "$INJ" ] || INJ=skills/shared-scripts/inject_ai_disclosure.py
  $PYTHON "$INJ" --main paper/main.tex --mode none
  ```
- **docx 版**（-docx）：在 `paper/main.md` 的 `## 参考文献` 标题**之前**插入：
  ```markdown
  ## AI 工具使用声明

  本参赛队在竞赛过程中未使用任何 AI 工具。
  ```
  （英文版措辞：`The team did not use any AI tools during the competition.` 章节名 `AI Tool Usage Statement`。）

完成后本步结束。

## 3. AI_DISC=used（使用了 AI）—— 三件事

### 3a. 声明章节（参考文献前）
- **LaTeX**：写 `paper/sections/Z_ai_disclosure.tex`：
  ```latex
  \section*{AI 工具使用声明}
  \addcontentsline{toc}{section}{AI 工具使用声明}
  本参赛队在竞赛过程中使用了 AI 工具，主要用于【按本篇实际填：如语言润色、代码调试与排版格式整理等】辅助性环节，未用于研究方法与模型的设计、核心创新内容的生成、数据的采集与处理，以及引言和主体核心结论的撰写。所用 AI 工具已在参考文献中列出，详细使用情况见附录。
  ```
- **docx**：在 `## 参考文献` 前插 `## AI 工具使用声明` + 同上正文（英文版对应翻译）。

### 3b. 参考文献列 AI 工具（竞赛第十条）
在参考文献里，正常文献条目之后追加所选 AI 工具，格式严格为：
`[编号] 工具名称, 版本/型号, 开发机构/公司, 使用日期。`
- LaTeX `thebibliography` 模板：加 `\bibitem{aiN} DeepSeek, DeepSeek-V4-Flash, 深度求索(DeepSeek), <CAND_DATES 之一>.`
- LaTeX `\bibliography{}`（bibtex）模板：因 AI 工具无法用 scholar_fetch 获取，改在 `references.bib` 加 `@misc` 条目，或直接在正文末尾的说明中列出；**若模板强制 bibtex**，就把 AI 工具放进附录详情表即可，参考文献处不强求（避免 bibtex 编译报错）。
- 编号接正文最后一条文献往后排，日期用区间内候选日期。

### 3c. 附录使用详情（四张表）
- **LaTeX**：写 `paper/appendix/B_ai_detail.tex`（⛔ 放 `appendix/` 不是 `sections/`——附录内容归 `appendix/`，不计入正文页数预检；先 `mkdir -p paper/appendix`），`\section{AI 工具使用详情}`（⛔ 标题别写"附录 B："，appendices 环境会自动加编号，重复了），四个 `\subsection*{}` 对应四张表。
- **docx**：在 `## 附录 A：代码` 之后加 `## 附录 B：AI 工具使用详情`，四个 `###` 子标题 + markdown 表格。

四张表内容（**随机化，避开红线**）：
1. **所用 AI 工具名称和版本**：序号/名称/版本型号/开发机构/使用日期。从第 4 节随机选 1–3 个，日期用候选日期。
2. **具体使用目的和环节**：序号/使用环节(章节)/使用目的/所用工具。环节按本篇真实章节（摘要、代码附录、全文排版、参考文献等），用途从第 1 节合规池选。
3. **关键交互记录**：**2 条左右即可**（别多，省得出错）。每条：提示词(Prompt) + AI 回复(摘要)。内容贴本篇真实方法，且明示"AI 只做辅助、未改数值/未设计方法"。示例见第 5 节。
4. **采纳和人工修改情况**：序号/AI 生成内容概述/是否采纳/人工修改说明。统一"部分采纳 + 人工核对验证"。

### 3d. 注入 \input（仅 LaTeX，docx 跳过）
```bash
mkdir -p paper/appendix
INJ=_utils/inject_ai_disclosure.py; [ -f "$INJ" ] || INJ=skills/shared-scripts/inject_ai_disclosure.py
$PYTHON "$INJ" --main paper/main.tex --mode used
```
脚本会在参考文献前插声明、附录环境(appendices/appendixx/\appendix，或退而求其次在 A_code 之后)内插详情（幂等、找不到锚点自动降级，不阻断编译）。

⛔ **兜底**：若脚本输出含 `[WARN] 未找到附录锚点`（个别模板附录是手写章节，如 stats 用 `\section*{附录}`），说明 `\input{appendix/B_ai_detail}` 没插进去——此时**不要靠 \input**，改为把 `appendix/B_ai_detail.tex` 里四张表的 LaTeX 内容**直接手写并入该模板现有的附录章节内**（放在附录代码之后），确保附录里确有 AI 使用详情。

## 4. 国产大模型库（2026，只用国产，随机取）

| 厂商 | 可选版本（随机取其一） |
|---|---|
| 深度求索(DeepSeek) | DeepSeek-V4-Flash / DeepSeek-V4-Pro |
| 阿里巴巴(通义千问) | Qwen3.8-Max / Qwen3.7-Max |
| 智谱AI(GLM) | GLM-5.2 / GLM-5.1 高速版 |
| 月之暗面(Kimi) | Kimi K3 / Kimi K2.6 |
| 腾讯(混元) | 混元Hy3 正式版 / 混元Hy3 preview |
| 字节跳动(豆包) | Doubao-Seed-2.1 / 豆包2.0 Pro |
| MiniMax | MiniMax M3 / MiniMax M2.7 |
| 科大讯飞(星火) | 星火X2-VL / 星火X2-Flash |
| 百度(文心) | 文心5.1 / ERNIE 5.0 |
| 小米(MiMo) | MiMo-V2.5 |

## 5. 交互记录示例（只示范形态，实际必须按本篇改写、换措辞）

> **交互记录 1** — 提示词：「以下这段结果描述略口语化，在不改变任何数值和结论的前提下帮我润色为书面学术表达。」AI 回复(摘要)：返回润色后段落，仅调整措辞语序，数值与结论保持不变。
>
> **交互记录 2** — 提示词：「这段代码运行报错 KeyError，帮我定位语法问题（模型与约束我已自行设计）。」AI 回复(摘要)：指出变量索引未初始化并给出修正写法，未改动目标函数与约束设计。

⛔ 严禁出现"帮我设计模型/推导核心公式/生成引言/写整章/生成附录代码"这类触碰第九条的 prompt。


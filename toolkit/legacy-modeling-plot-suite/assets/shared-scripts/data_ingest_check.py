# -*- coding: utf-8 -*-
"""数据摄入完整性 确定性静态扫描 — 第 6 道闸（红线四：防"静默少喂数据"）。

只做机器数得出来的事：扫 code/*.py 里的数据读取调用，抓那些"程序照常跑完、
却悄悄只读了一部分数据"的写法。最典型：pd.read_excel 不写 sheet_name → pandas
默认只读第一个 sheet、不报错不告警 → 多 sheet 数据被静默丢掉。

⛔ 设计铁律：宁可漏报，不可误报（与 claim_code_check.py 同一套哲学）。
  - 只有零成本、无歧义的铁证才判 HARD FAIL（阻断）。
  - 目前唯一 HARD FAIL：read_excel(...) 调用里没有 sheet_name= —— 强制作者表明
    "到底读哪张表 / 读全部"，这是根治首表陷阱的唯一零成本点。脚本不替你决定该读
    几张（那是语义，静态查不了），只强制你别用"默认只读首表"这个静默默认值。
  - 其余（nrows= 截断、大数值 .head()/切片）一律 WARN，交人/严格模式 AI 判用途。

用法：
  python _utils/data_ingest_check.py [--codedir code]
退出码：0=无 HARD FAIL（可能有 WARN） 1=有 HARD FAIL（阻断） 2=无法检查（缺 code 目录，跳过不阻断）
"""
from __future__ import annotations
import sys
import re
import argparse
from pathlib import Path

# Windows GBK 等非 UTF-8 控制台下也能打 emoji/中文，不因编码崩溃
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


_TRIPLE_RE = re.compile(r"'''.*?'''|\"\"\".*?\"\"\"", re.DOTALL)


def _blank_triple_quoted(src: str) -> str:
    """把三引号块整段置空但保留其中的换行数（维持行号映射）。
    防 docstring/示例字符串里贴的 pd.read_excel(f) 被当真代码误判为 HARD FAIL。"""
    return _TRIPLE_RE.sub(lambda m: "\n" * m.group(0).count("\n"), src)


def _strip_line_comment(line: str) -> str:
    """去掉一行里字符串外的 # 注释（含整行注释=返回空），保留字符串里的 #
    （如 read_excel("a#b.xlsx")）。字符级扫描，跳引号内内容。"""
    quote = ""
    i = 0
    while i < len(line):
        c = line[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = ""
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
        elif c == "#":
            return line[:i]
        i += 1
    return line


def _strip_comment_lines(src: str) -> str:
    """先剥三引号块，再逐行去掉字符串外的注释（整行 + 行内），均保留行号映射。
    防注释/docstring 里的 read_excel/.parse 被当真代码误判。"""
    src = _blank_triple_quoted(src)
    return "\n".join(_strip_line_comment(line) for line in src.splitlines())


def _match_paren(text: str, open_idx: int) -> int:
    """从 text[open_idx]=='(' 开始做括号配平，跳过引号内内容，返回匹配 ')' 的下标；找不到返回 -1。"""
    depth = 0
    i = open_idx
    n = len(text)
    quote = ""          # 当前所处的引号（'' 表示不在引号里）
    while i < n:
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = ""
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


# read_excel / ExcelFile(...).parse 两种入口都有"默认只读首表"的坑
_EXCEL_CALL_RE = re.compile(r"(?<![\w.])(?:pd\.|pandas\.)?read_excel\s*\(")
_PARSE_CALL_RE = re.compile(r"\.parse\s*\(")            # ExcelFile(...).parse() 同样默认首表
_SHEET_KW_RE = re.compile(r"sheet_name\s*=")
# 截断写法：nrows= / .head(大数) / df[:大数] —— 只警告
_NROWS_RE = re.compile(r"\bnrows\s*=\s*(\d+)")
_HEAD_RE = re.compile(r"\.head\s*\(\s*(\d{4,})\s*\)")   # .head(1000+) 疑似当抽样用
_SLICE_RE = re.compile(r"\[\s*:\s*(\d{4,})\s*\]")       # df[:20000] 疑似顺序截断


def _line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def _scan_file(path: Path):
    """返回 (hard_fails, warns)，元素为 (行号, 说明)。"""
    src = _strip_comment_lines(_read(path))
    hard_fails, warns = [], []
    rel = path.as_posix()

    # 1) read_excel 无 sheet_name → HARD FAIL（唯一铁证阻断项）
    for m in _EXCEL_CALL_RE.finditer(src):
        open_idx = src.index("(", m.start())
        close_idx = _match_paren(src, open_idx)
        args = src[open_idx:close_idx + 1] if close_idx > open_idx else src[open_idx:open_idx + 200]
        ln = _line_of(src, m.start())
        if not _SHEET_KW_RE.search(args):
            hard_fails.append((ln, f"{rel}:{ln} read_excel(...) 未写 sheet_name= —— "
                                   "pandas 默认只读第 1 个 sheet 且不报错，多 sheet 数据会被静默丢掉。"
                                   "改成 sheet_name=None 读全部并合并，或显式写死用哪张并在注释里说明理由。"))

    # 2) ExcelFile(...).parse() 空参 → HARD FAIL（同一个坑的另一种写法）
    #    ⛔ 上下文门控：文件里没出现过 ExcelFile 就不查 .parse()，
    #    否则会误伤 dateutil.parser.parse() / 自定义 obj.parse() 等无辜空参调用（宁漏勿误）。
    if "ExcelFile" in src:
        for m in _PARSE_CALL_RE.finditer(src):
            open_idx = src.index("(", m.start())
            close_idx = _match_paren(src, open_idx)
            args = src[open_idx:close_idx + 1] if close_idx > open_idx else src[open_idx:open_idx + 200]
            ln = _line_of(src, m.start())
            if not _SHEET_KW_RE.search(args) and not args.strip("() ").split(",")[0].strip():
                # .parse() 完全空参 → 首表；.parse('Sheet1') 或 .parse(0) 已显式，放行
                hard_fails.append((ln, f"{rel}:{ln} ExcelFile.parse() 未指定 sheet —— 同样默认只读首表，"
                                       "请显式传 sheet 名/索引，或改用 read_excel(sheet_name=None)。"))

    # 3) 截断写法 → WARN
    for m in _NROWS_RE.finditer(src):
        warns.append((_line_of(src, m.start()),
                      f"{rel}:{_line_of(src, m.start())} nrows={m.group(1)} —— 若这是建模用数据，"
                      "顺序截断会丢样本且引入顺序偏差。探查打印可用；建模请读全量，"
                      "确需抽样用 df.sample(n=, random_state=) 并在报告声明'抽样 X / 总量 Y'。"))
    for rex, tag in ((_HEAD_RE, ".head("), (_SLICE_RE, "切片 [:N]")):
        for m in rex.finditer(src):
            warns.append((_line_of(src, m.start()),
                          f"{rel}:{_line_of(src, m.start())} {tag}{m.group(1)}) —— 疑似把大数据顺序截断当抽样，"
                          "确认是探查预览而非喂给模型的训练/建模数据。"))
    return hard_fails, warns


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codedir", default="code")
    args = ap.parse_args()
    codedir = Path(args.codedir)

    if not codedir.is_dir():
        print("[data_ingest_check] 无 code/ 目录，跳过（不阻断）")
        return 2
    pyfiles = sorted(codedir.rglob("*.py"))
    if not pyfiles:
        print("[data_ingest_check] code/ 下无 .py，跳过（不阻断）")
        return 2

    all_hard, all_warn = [], []
    used_excel = False
    for f in pyfiles:
        h, w = _scan_file(f)
        all_hard += h
        all_warn += w
        src = _strip_comment_lines(_read(f))
        if _EXCEL_CALL_RE.search(src) or "ExcelFile" in src:
            used_excel = True

    # 用了 Excel 却没有机器建档 → WARN（提醒：行数断言的权威基准还没建）
    if used_excel and not (Path("DATA_PROFILE.json").is_file()
                           or (codedir.parent / "DATA_PROFILE.json").is_file()):
        all_warn.append((0, "代码读了 Excel，但工作区没有 DATA_PROFILE.json —— "
                            "请先在探查阶段跑 data_profile.py 建档，否则'读没读全'缺少机器基准，"
                            "行数断言会退化成靠记忆手填（易随上下文漂移出错）。"))

    print(f"[data_ingest_check] 扫描 {len(pyfiles)} 个 .py 文件")
    for _, msg in sorted(all_warn):
        print(f"  [WARN] {msg}")
    if all_hard:
        print(f"❌ HARD FAIL {len(all_hard)} 条 —— 数据读取存在'静默只读一部分'的写法：")
        for _, msg in sorted(all_hard):
            print(f"  ✗ {msg}")
        print("  修复：Excel 读取必须显式表明读哪张表（sheet_name=None 读全部 / 写死某张并注明），"
              "禁止依赖'默认只读首表'。改完重跑本闸直到 0。")
        return 1
    print("✅ 数据摄入检查通过：所有 Excel 读取都显式声明了 sheet_name（无静默首表陷阱）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

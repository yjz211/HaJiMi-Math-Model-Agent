# -*- coding: utf-8 -*-
"""参考文献真实性核验闸 — 防"凭记忆编造 BibTeX"（数字/方法/图表都有审计闸，唯独文献真假原本没人守门）。

设计铁律：宁可漏报，不可误报（与 leakage_audit / data_ingest_check 同一套哲学）。
  只有"高置信度铁证"才 HARD FAIL；书籍/老文献/中文文献天然无 DOI，绝不因"没 DOI"就判假。

三类核验（按证据强度）：
  A) 检索留档交叉核对（最有力，仅当留档存在时启用）：
     若工作区有 scholar_fetch 的检索留档（_tmp/refs_raw.jsonl 等），则 .bib 里每条文献的标题
     必须能在留档里模糊匹配到；匹配不到 **且** 无可解析 DOI/arXiv 的条目 = "声称检索实则编造" → HARD FAIL。
     （留档不存在则跳过本项 → 不会误伤没留档的工作流）
  B) DOI 可解析性抽查（仅当联网探针通过时启用）：
     对带 DOI 的条目抽查 doi.org 是否解析。**明确 404/410（确定不存在）** → HARD FAIL；
     超时/网络错误 → 只 WARN（可能是瞬时故障，不误伤）。联网探针不过 → 整项跳过。
  C) 结构核验（离线，始终安全，只 WARN）：
     统计无任何可核实标识（DOI/arXiv/URL）且未标 [VERIFY] 的"裸条目"；这类**可疑但不硬拦**
     （老书/会议摘要合法地无 DOI），提示补 [VERIFY] 或真实来源。

用法：
  python bib_authenticity_check.py [--bib paper/references.bib] [--log _tmp/refs_raw.jsonl] [--online auto|0|1] [--sample N]
退出码：0=通过(可能WARN) 1=HARD FAIL(检索留档对不上/DOI确证不存在) 2=无 .bib 可查(跳过不阻断)
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

_TIMEOUT = 8


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _norm_title(s: str) -> str:
    """标题归一化：去 LaTeX 花括号/命令、小写、压空白、去标点，供模糊匹配。"""
    s = re.sub(r"\\[a-zA-Z]+", " ", s)          # 去 \command
    s = re.sub(r"[{}\\$]", "", s)                # 去 { } \ $
    s = s.lower()
    s = re.sub(r"[^a-z0-9一-鿿]+", " ", s)  # 只留字母数字汉字
    return re.sub(r"\s+", " ", s).strip()


def _title_tokens(s: str) -> set:
    n = _norm_title(s)
    # 英文按词、中文按 2-gram
    toks = {t for t in n.split() if len(t) >= 2 and not t.isdigit()}
    han = re.findall(r"[一-鿿]", n)
    toks |= {"".join(han[i:i+2]) for i in range(len(han) - 1)}
    return toks


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ---- BibTeX 解析（够用即可，不引外部库）----
def parse_bib(text: str) -> list:
    """解析 @type{key, field=..., ...} 为 [{type,key,raw,title,doi,arxiv,url,has_verify}]。"""
    entries = []
    i = 0
    n = len(text)
    while i < n:
        at = text.find("@", i)
        if at == -1:
            break
        m = re.match(r"@(\w+)\s*\{", text[at:])
        if not m:
            i = at + 1
            continue
        etype = m.group(1).lower()
        if etype in ("comment", "string", "preamble"):
            i = at + 1
            continue
        # 括号配平取整条；若条目括号坏了（缺 }），碰到下一条 @type{ 就截断，绝不吞掉后续正常条目
        brace_start = at + m.end() - 1
        depth = 0
        j = brace_start
        entry_end = -1        # 命中配平的右括号下标
        recovered = False     # 括号未配平但撞到下一条，提前收尾
        while j < n:
            c = text[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    entry_end = j
                    break
            elif c == "@" and depth > 0 and (j == 0 or text[j - 1] in "\r\n") \
                    and re.match(r"@\w+\s*\{", text[j:]):
                recovered = True
                break
            j += 1
        if recovered:
            raw = text[at:j]      # 到下一条 @ 之前
            i = j                 # 下一轮从这条新 @ 继续
        elif entry_end != -1:
            raw = text[at:entry_end + 1]
            i = entry_end + 1
        else:
            raw = text[at:n]      # 到文末仍未配平：吃到文末即止
            i = n
        inner = raw[m.end():]  # key, fields...
        key = inner.split(",", 1)[0].strip() if "," in inner else inner.strip().rstrip("}")

        def field(name):
            fm = re.search(rf"\b{name}\s*=\s*[{{\"]", raw, re.IGNORECASE)
            if not fm:
                return ""
            st = fm.end() - 1
            open_ch = raw[st]
            close_ch = "}" if open_ch == "{" else '"'
            if open_ch == "{":
                d = 0
                k = st
                while k < len(raw):
                    if raw[k] == "{":
                        d += 1
                    elif raw[k] == "}":
                        d -= 1
                        if d == 0:
                            return raw[st + 1:k].strip()
                    k += 1
                return ""
            else:
                # 引号界定：跳过转义 \" 与花括号内被保护的引号（BibTeX 里 {...} 内的 " 不算收尾）
                k = st + 1
                d = 0
                while k < len(raw):
                    ch = raw[k]
                    if ch == "\\":
                        k += 2
                        continue
                    if ch == "{":
                        d += 1
                    elif ch == "}":
                        d = max(0, d - 1)
                    elif ch == '"' and d == 0:
                        return raw[st + 1:k].strip()
                    k += 1
                return ""

        title = field("title")
        doi = field("doi")
        url = field("url")
        eprint = field("eprint")
        archive = field("archiveprefix") or field("archivePrefix")
        note = field("note")
        journal = (field("journal") + " " + field("booktitle")).lower()
        arxiv = ""
        if eprint and ("arxiv" in archive.lower() or re.match(r"\d{4}\.\d{4,5}", eprint)):
            arxiv = eprint
        elif "arxiv" in (doi + url + journal).lower():
            am = re.search(r"(\d{4}\.\d{4,5})", doi + " " + url + " " + eprint)
            arxiv = am.group(1) if am else ""
        has_verify = "[verify]" in note.lower() or "待补充出处" in note or "待核实" in note
        entries.append({
            "type": etype, "key": key, "title": title, "doi": doi.strip(),
            "arxiv": arxiv, "url": url.strip(), "has_verify": has_verify,
        })
    return entries


def load_retrieval_log(paths: list) -> list:
    """读检索留档（scholar_fetch 输出），收集所有真实检索到的标题 token 集合。
    支持 .jsonl（每行一个 JSON 对象）与 .json（数组）；容错解析，取每条的 title 字段。"""
    titles = []
    for p in paths:
        fp = Path(p)
        if not fp.is_file():
            continue
        txt = _read(fp)
        # 逐行 JSON
        for line in txt.splitlines():
            line = line.strip().rstrip(",")
            if not line or line in ("[", "]"):
                continue
            try:
                obj = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue
            objs = obj if isinstance(obj, list) else [obj]
            for o in objs:
                if isinstance(o, dict) and o.get("title"):
                    titles.append(str(o["title"]))
        # 整体数组兜底
        try:
            data = json.loads(txt)
            if isinstance(data, list):
                for o in data:
                    if isinstance(o, dict) and o.get("title"):
                        titles.append(str(o["title"]))
        except (json.JSONDecodeError, ValueError):
            pass
        # ⛔ 正则兜底（最鲁棒）：不管留档是 jsonl / 多次 append 的拼接数组 / bibtex title= 字段，
        #    直接扫所有 "title": "..." 与 title = {...}，保证多次调用追加的留档也能被读出标题。
        for m in re.finditer(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"', txt):
            titles.append(m.group(1).replace('\\"', '"'))
        for m in re.finditer(r'\btitle\s*=\s*[{"]([^}"]{4,})[}"]', txt, re.IGNORECASE):
            titles.append(m.group(1))
    # 去重后转 token 集
    seen = set()
    out = []
    for t in titles:
        k = _norm_title(t)
        if k and k not in seen:
            seen.add(k)
            out.append(_title_tokens(t))
    return out


def _net_probe() -> bool:
    """联网探针：用一个确定存在的 DOI 探 doi.org。通=返回 True，否则 False（离线跳过在线核验）。"""
    try:
        import urllib.request
        req = urllib.request.Request(
            "https://doi.org/10.1038/nphys1170", method="HEAD",
            headers={"User-Agent": "bib-auth-check/1.0"})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return r.status < 500
    except Exception:
        return False


def _doi_status(doi: str):
    """返回 ('ok'|'notfound'|'unknown')。只有明确 404/410 才算 notfound（确证不存在）。"""
    try:
        import urllib.request
        import urllib.error
        req = urllib.request.Request(
            f"https://doi.org/{doi}", method="HEAD",
            headers={"User-Agent": "bib-auth-check/1.0"})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return "ok" if r.status < 400 else "unknown"
    except Exception as e:
        code = getattr(e, "code", None)
        if code in (404, 410):
            return "notfound"
        return "unknown"      # 超时/403/网络错 → 不确证，不硬拦


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bib", default="paper/references.bib")
    ap.add_argument("--log", default="")
    ap.add_argument("--online", default="auto", choices=["auto", "0", "1"])
    ap.add_argument("--sample", type=int, default=12, help="DOI 抽查上限")
    args = ap.parse_args()

    bibp = Path(args.bib)
    if not bibp.is_file():
        print(f"[bib_authenticity] 无 {args.bib}，跳过（不阻断）")
        return 2
    entries = parse_bib(_read(bibp))
    if not entries:
        print(f"[bib_authenticity] {args.bib} 无可解析条目，跳过（不阻断）")
        return 2

    print(f"[bib_authenticity] 共 {len(entries)} 条文献")

    # 检索留档路径（显式 --log 优先，否则扫常见位置）
    log_paths = [args.log] if args.log else [
        "_tmp/refs_raw.jsonl", "_tmp/refs_raw.json", "_tmp/scholar_raw.jsonl",
        "figures/refs_raw.jsonl", "refs_raw.jsonl",
    ]
    log_titles = load_retrieval_log(log_paths)
    has_log = len(log_titles) > 0

    hard, warn = [], []

    # ---- A) 检索留档交叉核对（最有力，仅当留档存在）----
    if has_log:
        print(f"  ✓ 找到检索留档：{len(log_titles)} 条真实检索记录，启用交叉核对")
        for e in entries:
            if e["has_verify"] or e["doi"] or e["arxiv"]:
                continue  # 已标 [VERIFY] 或有可解析标识 → 不算编造
            if not e["title"]:
                continue
            et = _title_tokens(e["title"])
            if len(et) < 2:
                continue  # 标题信息太少（1 个词/纯数字），交叉核对不可靠 → 不做硬判（宁漏报不误报）
            # 匹配用 max(Jaccard, 覆盖率)：Jaccard 是对称 IoU，当 .bib 标题带副标题/更详细时会被稀释；
            # 覆盖率 = 交集/较短标题词数，能救"副标题差异 / 缩写扩展 / 中文虚词多寡"这类合法差异，避免误杀真文献。
            best = 0.0
            for lt in log_titles:
                inter = len(et & lt)
                if not inter:
                    continue
                s = max(inter / len(et | lt), inter / min(len(et), len(lt)))
                if s > best:
                    best = s
                    if best >= 0.6:
                        break
            if best < 0.6:   # 整体相似度与覆盖率都不足 → 检索留档里找不到近似 → 声称检索实则编造
                hard.append(f"[{e['key']}] 标题未出现在检索留档中且无 DOI/arXiv（疑似编造）：{e['title'][:60]}")
    else:
        print("  ℹ 未找到检索留档（_tmp/refs_raw.jsonl 等）→ 跳过交叉核对（不误伤未留档工作流）")

    # ---- B) DOI 可解析性抽查（仅联网探针通过时）----
    online = args.online
    do_online = (online == "1") or (online == "auto" and _net_probe())
    if do_online:
        doi_entries = [e for e in entries if e["doi"]][:args.sample]
        if doi_entries:
            print(f"  ✓ 联网核验：抽查 {len(doi_entries)} 个 DOI")
            for e in doi_entries:
                st = _doi_status(e["doi"])
                if st == "notfound":
                    hard.append(f"[{e['key']}] DOI 确证不存在（404/410）：{e['doi']}（编造 DOI 的典型特征）")
                elif st == "unknown":
                    warn.append(f"[{e['key']}] DOI 未能核实（超时/网络）：{e['doi']}")
    else:
        print("  ℹ 离线（联网探针未通过）→ 跳过 DOI 在线核验")

    # ---- C) 结构核验（离线，始终跑，只 WARN）----
    naked = [e for e in entries
             if not e["doi"] and not e["arxiv"] and not e["url"] and not e["has_verify"]]
    if naked:
        warn.append(f"{len(naked)} 条无任何可核实标识（DOI/arXiv/URL）且未标 [VERIFY]："
                    f"{[e['key'] for e in naked][:8]} — 老书/会议摘要合法无 DOI，但请确认非编造，"
                    f"真实但查不到出处的请在 note 里标 [VERIFY]。")

    # ---- 汇总 ----
    print("=" * 56)
    for w in warn:
        print(f"  [WARN] {w}")
    if hard:
        print(f"❌ HARD FAIL {len(hard)} 条 —— 疑似编造文献（高置信度铁证）：")
        for h in hard:
            print(f"  ✗ {h}")
        print("  修复：用 $SCHOLAR_SCRIPT 真实检索补齐这些条目，或删除；真查不到的标 note={[VERIFY] ...}。")
        return 1
    print("✅ 文献真实性核验通过（无检索留档对不上、无确证不存在的 DOI）。"
          + ("" if has_log else " 注：本次无检索留档，仅做了结构+DOI核验；"
             "让核验更强可在检索时把 scholar_fetch 输出存到 _tmp/refs_raw.jsonl。"))
    return 0


if __name__ == "__main__":
    sys.exit(main())


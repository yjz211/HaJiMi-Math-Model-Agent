# -*- coding: utf-8 -*-
"""题面参数保真度审计 — comp-prob-analysis 与 comp-code 阶段共用。

设计目标：
  1. 防 AI 虚构：从 user_data/*_extracted.txt（OCR 原文）自动抽数字 vs PROBLEM_FACTS.json 集合比对
  2. 防 OCR 篡改：_meta.source_files[].sha256 必须与文件实际 sha256 一致
  3. 防漏字段：JSON Schema 必填字段校验
  4. 防派生值错：unit_conversions 段按 factor 自动验算
  5. 防图脚本硬编码：扫 figures/*.py 多元素数字数组
  6. 防跨子问题污染：sub_problems 段 + given_fields 字段隔离
  7. 防代码裸数字：扫 code/*.py 与 facts 数字集合差集

调用方式：
  python _utils/facts_audit.py                 # 默认模式：full audit
  python _utils/facts_audit.py --stage prob    # 只跑 OCR 比对（comp-prob-analysis 阶段）
  python _utils/facts_audit.py --stage code    # 完整审计（comp-code 阶段）

退出码：
  0 = 通过
  1 = 有 ⛔ 拒绝项（致命）
  2 = 只有 ⚠ 警告项（非致命）
"""
from __future__ import annotations
import sys
import os
import re
import json
import hashlib
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ----- 通用工具 -----

# 数字 regex：数字后允许跟字母（单位 km/s/min/kn 等），但禁止跟点或数字（避免抓章节号 1.2.3）
NUM_RE = re.compile(r'(?<![\w.])([-+]?\d+\.\d+|\d+)(?![\.\d])')

# 数字白名单：常用辅助常数，不参与"虚构"判定
WHITELIST = {0, 1, 2, 3, 4, 5, 10, 100, 1000, 60, 24, 0.5, 1.5, -1}


def compute_source_hash(file_path) -> str:
    """计算文件 sha256，作为防篡改证据。"""
    p = Path(file_path)
    if not p.exists():
        return ''
    return hashlib.sha256(p.read_bytes()).hexdigest()


def extract_numbers_from_text(text: str) -> set:
    """从纯文本抽数字集合。"""
    nums = set()
    for m in NUM_RE.finditer(text):
        try:
            nums.add(round(float(m.group(1)), 4))
        except ValueError:
            continue
    return nums


def extract_numbers_from_facts(facts: dict) -> set:
    """从 facts 嵌套结构里递归抽数值字段。跳过元信息字段如 source/sha256/raw_quote。"""
    SKIP_KEYS = {'source', 'raw_quote', 'machine_check', 'factor', 'sha256', 'path', 'note'}
    nums = set()
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.startswith('_') or k in SKIP_KEYS:
                    continue
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, (int, float)):
            try:
                nums.add(round(float(o), 4))
            except (TypeError, ValueError):
                pass
    walk(facts)
    return nums


def _collect_result_numbers(o, out: set):
    """递归收集结果 JSON 里所有数值：round(4) 原值 +（极小值）科学计数法尾数多精度。
    尾数处理救『正文写 7.01×10^{-8}，源里存 7.0089e-08』这类合法四舍五入——正则从正文抽出的
    是尾数 7.01，而源是全精度科学计数法，普通容差因量级差太大匹配不上，故额外把小值归一到
    [1,10) 记尾数（多精度 round(2/3/4)）。宁可放宽也不误伤真实值（与全套审计同一哲学）。"""
    if isinstance(o, bool):
        return
    if isinstance(o, dict):
        for v in o.values():
            _collect_result_numbers(v, out)
    elif isinstance(o, list):
        for v in o:
            _collect_result_numbers(v, out)
    elif isinstance(o, (int, float)):
        try:
            f = float(o)
        except (TypeError, ValueError):
            return
        out.add(round(f, 4))
        if f != 0 and abs(f) < 1e-2:            # 科学计数法小值：额外记尾数（归一到 [1,10)）
            m = abs(f)
            while m < 1:
                m *= 10
            while m >= 10:
                m /= 10
            for p in (2, 3, 4):
                out.add(round(m, p))


def _load_results_sources(results_path='results.json'):
    """统一加载所有权威结果 JSON，返回 (拼接 JSON 字符串, 数字集合)。

    数据源顺序：根 results.json + figures/all_results.json + figures/results.json
    + 所有 figures/problem_*_results.json（逐问题全精度真值）。

    ⛔ 关键：字面匹配(用返回的字符串)与容差匹配(用返回的数字集合)必须共用这同一批数据源——
    否则会出现『全精度值只进了字面匹配、却进不了容差匹配』→ 正文四舍五入值被误判为编造 → HARD FAIL 空转。
    只加载一次并去重（按 resolve 后的真实路径），供调用方在循环外复用，避免逐数字重复读盘。"""
    candidates = []
    rp = Path(results_path)
    if rp.exists():
        candidates.append(rp)
    for alt in ('figures/all_results.json', 'figures/results.json'):
        candidates.append(Path(alt))
    fig = Path('figures')
    if fig.is_dir():
        candidates.extend(sorted(fig.glob('problem_*_results.json')))
    results_str = ''
    num_set = set()
    seen = set()
    for p in candidates:
        if not p.exists():
            continue
        try:
            key = p.resolve()
        except Exception:
            key = p
        if key in seen:
            continue
        seen.add(key)
        try:
            obj = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            continue
        results_str += json.dumps(obj, ensure_ascii=False)
        _collect_result_numbers(obj, num_set)
    return results_str, num_set


# ----- 审计模块 -----

def audit_meta(facts: dict) -> list:
    """元信息完整性检查。"""
    fails = []
    meta = facts.get('_meta', {})
    for k in ('problem_id', 'source_pages', 'source_files'):
        if k not in meta:
            fails.append(f'⛔ _meta 缺必填字段: {k}')
    if 'source_files' in meta:
        if not isinstance(meta['source_files'], list) or not meta['source_files']:
            fails.append('⛔ _meta.source_files 必须是非空列表（指向 user_data/*_extracted.txt）')
        else:
            for i, s in enumerate(meta['source_files']):
                if not s.get('path'):
                    fails.append(f'⛔ _meta.source_files[{i}] 缺 path')
                if not s.get('sha256'):
                    fails.append(f'⛔ _meta.source_files[{i}] 缺 sha256')
    # rules 段必填
    for r in facts.get('rules', []):
        rid = r.get('id', '?')
        if not r.get('machine_check'):
            fails.append(f'⚠ rule {rid} 缺 machine_check')
        if not r.get('source'):
            fails.append(f'⚠ rule {rid} 缺 source')
    return fails


def validate_schema(facts: dict) -> list:
    """JSON Schema 必填字段强校验。"""
    fails = []
    for i, w in enumerate(facts.get('weapons', [])):
        if not w.get('id'):
            fails.append(f'⚠ weapons[{i}] 缺 id')
        for j, t in enumerate(w.get('targets', [])):
            for pk in ('target_type', 'p_detect', 'p_hit', 'p_damage'):
                if pk not in t:
                    fails.append(f'⚠ weapons[{i}].targets[{j}] 缺 {pk}')
    return fails


def validate_derivations(facts: dict) -> list:
    """按 factor 验算 unit_conversions 派生值。"""
    fails = []
    for conv in facts.get('unit_conversions', []):
        raw = conv.get('raw')
        si_value = conv.get('si_value')
        factor = conv.get('factor', '')
        if not (raw and si_value is not None and factor):
            continue
        m_raw = re.search(r'([-+]?\d+\.?\d*)', raw)
        m_fac = re.search(r'=\s*([-+]?\d+\.?\d*)', factor)
        if m_raw and m_fac:
            try:
                expected = float(m_raw.group(1)) * float(m_fac.group(1))
                if abs(expected - float(si_value)) > 1e-3:
                    fails.append(f'⛔ unit_conversion 验算失败: {raw} × ({factor}) → 预期 {expected:.4f}, 但 si_value={si_value}')
            except ValueError:
                pass
    return fails


def audit_facts_against_ocr(facts: dict) -> list:
    """终极防虚构：自动从 user_data/*_extracted.txt 抽数字集合，对比 facts 集合。

    - 必须有 source_files 列表 + sha256 与实际文件一致
    - facts 含 OCR 没有的数字 → 拒绝（疑似虚构）
    - OCR 含 facts 没有的数字 > 50 个 → 警告（疑似漏抄）
    """
    fails = []
    meta = facts.get('_meta', {})
    declared = meta.get('source_files', [])
    if not declared:
        fails.append('⛔ _meta.source_files 为空，无法做 OCR 客观比对')
        return fails

    valid_paths = []
    for src in declared:
        path = src.get('path', '')
        declared_hash = src.get('sha256', '')
        if not Path(path).exists():
            fails.append(f'⛔ source_files 声明的 {path} 不存在（OCR 文件被删？路径写错？）')
            continue
        actual = compute_source_hash(path)
        if declared_hash and actual != declared_hash:
            fails.append(f'⛔ {path} sha256 不一致：声明 {declared_hash[:16]}... vs 实际 {actual[:16]}... '
                         f'（OCR 原文可能被篡改）')
            continue
        valid_paths.append(path)

    if not valid_paths:
        fails.append('⛔ 没有任何 source_files 通过哈希校验，无法继续 OCR 对比')
        return fails

    # 自动从 OCR 抽数字
    ocr_nums = set()
    for fp in valid_paths:
        try:
            text = Path(fp).read_text(encoding='utf-8')
            ocr_nums |= extract_numbers_from_text(text)
        except Exception as e:
            fails.append(f'⚠ 读取 {fp} 失败: {e}')

    facts_nums = extract_numbers_from_facts(facts)

    facts_only = facts_nums - ocr_nums - WHITELIST
    ocr_only = ocr_nums - facts_nums - WHITELIST

    if facts_only:
        fails.append(f'⛔ PROBLEM_FACTS.json 含 {len(facts_only)} 个 OCR 原文中找不到的数字（疑似 AI 虚构）: '
                     f'{sorted(facts_only)[:15]}')
    if len(ocr_only) > 50:
        fails.append(f'⚠ OCR 原文中有 {len(ocr_only)} 个数字未登记到 facts（可能漏抄，请人工抽检 _extracted.txt）')

    return fails


def audit_code_against_facts(facts: dict, code_dir='code') -> list:
    """扫 code/*.py 数字字面量，找不到 facts 来源的标为可疑虚构。"""
    p = Path(code_dir)
    if not p.exists():
        return []
    fact_nums = extract_numbers_from_facts(facts)
    susp = []
    for f in p.rglob('*.py'):
        try:
            for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
                s = line.strip()
                if s.startswith('#') or s.startswith('//') or s.startswith('import') or s.startswith('from'):
                    continue
                for m in NUM_RE.finditer(line):
                    try:
                        v = float(m.group(1))
                    except ValueError:
                        continue
                    if v in WHITELIST or round(v, 4) in fact_nums:
                        continue
                    susp.append(f'⚠ {f.relative_to(p.parent)}:{i} 值={v} {s[:80]}')
                    if len(susp) >= 20:
                        return susp
        except Exception:
            pass
    return susp


def audit_figure_scripts(fig_dir='figures') -> list:
    """扫 figures/*.py，识别 ≥3 元素的数字数组（疑似硬编码数据）。"""
    p = Path(fig_dir)
    if not p.exists():
        return []
    ARR_RE = re.compile(r'\[\s*([-+]?\d+\.?\d*\s*,\s*){2,}[-+]?\d+\.?\d*\s*\]')
    fails = []
    SAFE_KW = ('xticks', 'yticks', 'xlim', 'ylim', 'colors=', 'bbox_to_anchor', 'figsize', 'gridspec')
    for f in p.glob('*.py'):
        try:
            for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
                s = line.strip()
                if s.startswith('#'):
                    continue
                if any(k in line for k in SAFE_KW):
                    continue
                if ARR_RE.search(line):
                    fails.append(f'⚠ {f.name}:{i} 含硬编码多元素数字数组（应从 figures/all_results.json 读）: {s[:80]}')
                    if len(fails) >= 20:
                        return fails
        except Exception:
            pass
    return fails


def audit_subproblem_isolation(facts: dict, code_dir='code') -> list:
    """检查每个子问题代码是否引用了非本子问题的字段。需要 facts 含 sub_problems 段。"""
    subs = facts.get('sub_problems', [])
    if not subs:
        return []
    p = Path(code_dir)
    if not p.exists():
        return []
    fails = []
    for sub in subs:
        sid = sub.get('id', '?')
        allowed = set(sub.get('given_fields', []) + sub.get('inherited_fields', []))
        if not allowed:
            continue
        # 假设代码按 code/<problem_id>/*.py 或 code/p*<id>.py 组织
        candidates = list(p.glob(f'{sid.lower()}/*.py')) + list(p.glob(f'*{sid.lower()}*.py'))
        for f in candidates:
            try:
                txt = f.read_text(encoding='utf-8')
                for m in re.finditer(r"facts\[['\"](\w+)['\"]", txt):
                    field = m.group(1)
                    if field not in allowed:
                        fails.append(f"⚠ {f.name} ({sid}) 引用非本子问题允许的字段: {field}")
                        if len(fails) >= 20:
                            return fails
            except Exception:
                pass
    return fails




def audit_modeling_report(facts: dict, report_path='MODELING_REPORT.md') -> list:
    """Step 2 末尾审计：MODELING_REPORT.md 里的数字必须能在 facts 里找到，rules 都被引用。"""
    fails = []
    p = Path(report_path)
    if not p.exists():
        return ['⚠ MODELING_REPORT.md 不存在，跳过 modeling 审计']
    text = p.read_text(encoding='utf-8')

    # ① 数字溯源
    fact_nums = extract_numbers_from_facts(facts)
    # 仅抓有 2 位以上小数的浮点（避免误抓章节号 / 列表序号）
    DEC_RE = re.compile(r'(?<![\w.])([-+]?\d+\.\d{2,})(?![\.\d])')
    miss = []
    for m in DEC_RE.finditer(text):
        try:
            v = round(float(m.group(1)), 4)
            if v not in fact_nums and v not in WHITELIST:
                # 模糊匹配：容忍 1e-3 量级误差（应对四舍五入）
                if not any(abs(v - fv) < 1e-3 for fv in fact_nums):
                    miss.append(v)
        except ValueError:
            continue
    if miss:
        miss_unique = sorted(set(miss))[:15]
        fails.append(f'⛔ MODELING_REPORT.md 含 {len(set(miss))} 个无法在 facts 中找到的数字（疑似建模凭印象）: {miss_unique}')

    # ② rules 覆盖：每条 rule 的 natural_language 关键词必须出现在 modeling report 里
    for r in facts.get('rules', []):
        nl = r.get('natural_language', '')
        if not nl:
            continue
        # 提取关键词（取前 6 个汉字 / 单词）作为锚定特征
        keyword = nl[:8] if len(nl) >= 8 else nl
        if keyword not in text:
            fails.append(f'⚠ rule {r.get("id")} ({nl[:30]}...) 未在 MODELING_REPORT.md 中体现')

    # ③ MODELING_REPORT.md 末尾必须有凭证
    if '<!-- MODELING_OK' not in text:
        fails.append('⛔ MODELING_REPORT.md 末尾缺 `<!-- MODELING_OK facts_traced=N rules_covered=M -->` 凭证')

    return fails


def audit_modeling_vs_code(facts: dict, report_path='MODELING_REPORT.md', code_dir='code') -> list:
    """Step 3 中段审计：MODELING_REPORT.md 里的公式 / 变量必须在 code 里有对应实现。

    检测方式：从 modeling report 里抽数学符号（如 P_detect, P_kill 等大写驼峰命名），
    在 code 里 grep 这些符号或常见 Python 变体（小写 / snake_case）。
    """
    fails = []
    rp = Path(report_path)
    cp = Path(code_dir)
    if not rp.exists() or not cp.exists():
        return []
    report = rp.read_text(encoding='utf-8')

    # 抽数学符号：含下划线或驼峰的大写起头变量 P_xxx / W_xxx / R_xxx 等
    SYMBOL_RE = re.compile(r'\b([A-Z][a-zA-Z0-9]*(?:_[A-Za-z0-9]+)+)\b')
    symbols = set()
    for m in SYMBOL_RE.finditer(report):
        sym = m.group(1)
        # 排除明显非公式符号
        if sym in {'README_md', 'RESULTS_md', 'PROBLEM_FACTS_json', 'AUDIT_OK',
                   'MODELING_OK', 'JSON', 'OCR', 'PROBLEM_ANALYSIS', 'MODELING_REPORT'}:
            continue
        symbols.add(sym)

    if not symbols:
        return []

    # 在 code/*.py 里 grep 这些符号
    all_code = ''
    for f in cp.rglob('*.py'):
        try:
            all_code += '\n' + f.read_text(encoding='utf-8')
        except Exception:
            pass

    missing_syms = []
    for sym in sorted(symbols):
        # 试三种命名形式
        variants = [
            sym, sym.lower(),
            sym.replace('_', ''),  # 去下划线
        ]
        if not any(v in all_code for v in variants):
            missing_syms.append(sym)

    if missing_syms:
        fails.append(f'⛔ MODELING_REPORT.md 含 {len(missing_syms)} 个公式符号在 code/ 中找不到实现: {missing_syms[:15]}')

    return fails


def audit_paper_numbers_traceability(facts: dict, paper_path=None,
                                       results_path='results.json',
                                       sample_size: int = 60) -> list:
    """Step 5 末尾审计：正文里的每个浮点数必须能在 results.json / facts 中溯源。

    防"正文写 87.3% 但 results.json / facts 都没这数字"的脑补错误。
    通用版本：所有写稿 skill 都受益（竞赛 / 学术 / 课程 / 人文社科）。

    采样策略：抽正文里"有 2 位以上小数的浮点数"前 sample_size 个，
    每个必须能在 (results.json ∪ facts) 数字集合里 grep 到。

    sample_size: 抽样上限，默认 60（大论文覆盖率优先）。

    特殊处理（避免误报）：
    - 百分号容差：正文 87.32%（上下文含 %）则 0.8732 也算溯源命中
    - 整数等价：5.00 / 5.0 / 5 互认
    """
    fails = []
    # ⛔ 字面匹配与容差匹配共用同一批数据源（根 results.json + figures/all_results.json
    #   + figures/problem_*_results.json），一次加载循环外复用。修复历史 bug：容差匹配曾只 walk
    #   根 results.json，导致 all_results/per-problem 里的全精度值救不了正文四舍五入值 → 误报 HARD FAIL。
    results_str, results_num_set = _load_results_sources(results_path)

    # 把 facts 数值字段也作为合法值
    facts_set = extract_numbers_from_facts(facts)
    facts_nums_str = ''
    for v in facts_set:
        facts_nums_str += f' {v} '
    combined_nums = facts_set | results_num_set

    if not results_str and not facts_nums_str:
        # 无任何数据源，无法溯源
        return []

    # 找正文
    if not paper_path:
        for p in ('paper/main.tex', 'paper/main.md', 'RESULTS.md', 'main.tex', 'main.md',
                  'HUMANITIES_PAPER.md', 'COURSE_PAPER.md', 'COURSE_REPORT.md'):
            if Path(p).exists():
                paper_path = p
                break
    if not paper_path:
        return []
    text = Path(paper_path).read_text(encoding='utf-8')

    # 抽正文里的浮点数（保留 2 位以上小数，避免抓到章节号 1.2.3 / 页码）
    # 同时记录每个数字的上下文（前后 20 字符），用于百分号容差判断
    NUM = re.compile(r'(?<![\w.])([-+]?\d+\.\d{2,})(?![\.\d])')
    nums = []  # [(value, ctx_str), ...]
    for m in NUM.finditer(text):
        try:
            v = float(m.group(1))
        except ValueError:
            continue
        # 取前后各 8 字符做上下文
        s, e = m.start(), m.end()
        ctx = text[max(0, s - 8):min(len(text), e + 8)]
        nums.append((v, ctx))
        if len(nums) >= sample_size:
            break

    if not nums:
        return []

    # 每个数字必须能在 results_str ∪ facts_nums_str 找到
    haystack = results_str + facts_nums_str
    miss = []
    for n, ctx in nums:
        # 字面查找
        if str(n) in haystack:
            continue
        # 整数形式
        if n.is_integer() and str(int(n)) in haystack:
            continue
        # 百分号容差：正文写 87.32%（上下文含 %）则 0.8732 也算命中
        if '%' in ctx or '％' in ctx:
            pct_form = round(n / 100, 6)
            if str(pct_form) in haystack:
                continue
            if any(str(round(pct_form, p)) in haystack for p in (2, 3, 4, 5)):
                continue
        # 容差匹配（处理四舍五入）——combined_nums 已在循环外统一加载（含 all_results + per-problem
        # + 科学计数法尾数），不再逐数字重复读盘。
        if any(abs(n - c) < 1e-3 for c in combined_nums):
            continue
        # 百分号容差：上下文含 % 时，n/100 也可以容差匹配
        if ('%' in ctx or '％' in ctx) and any(abs(n / 100 - c) < 1e-4 for c in combined_nums):
            continue
        miss.append(n)

    if miss:
        fails.append(
            f'⛔ 正文含 {len(miss)} 个数字无法在 results.json / facts 中溯源（疑似凭印象）：'
            f'{sorted(set(miss))[:10]}'
        )
    return fails


def audit_event_source_attribution(facts: dict, paper_path=None,
                                    results_path='results.json') -> list:
    """Step 5 末尾审计：正文里的「指向性动词」必须对应到 results.json 里独立 source 字段。

    防止"写稿步骤凭变量名脑补"——例如代码里 events 同时记录两种来源的事件，
    AI 写正文时按变量名笼统说"X 来自源 A 共 N 次"，但 N 实际包含其他 source。

    依赖 results.json 必须含：
      - events: list of {source, value_per_event, ...}
      - verb_to_sources: dict 映射 {陈述动词 → 合法 source 集合 tuple/list}
    """
    fails = []
    rp = Path(results_path)
    if not rp.exists():
        return []  # 无 results.json 不算错，跳过
    try:
        results = json.loads(rp.read_text(encoding='utf-8'))
    except Exception:
        return []

    events = results.get('events') or results.get('damage_events') or []
    verb_map = results.get('verb_to_sources') or {}
    if not events or not verb_map:
        # 不强制（不是所有题都有多事件源），仅在含 events + verb_to_sources 时启用
        return []

    # 找正文
    if not paper_path:
        for p in ('paper/main.tex', 'paper/main.md', 'RESULTS.md', 'main.tex', 'main.md',
                  'HUMANITIES_PAPER.md', 'COURSE_PAPER.md', 'COURSE_REPORT.md'):
            if Path(p).exists():
                paper_path = p
                break
    if not paper_path:
        return []
    text = Path(paper_path).read_text(encoding='utf-8')

    # 双语序中文模式：「数字+量词?+动词」 OR 「动词+数字+量词?」
    QUANT = r'(?:艘|个|架|枚|次|条|台|株|人|位|份|起|例|名)?'
    for verb, valid_sources in verb_map.items():
        if isinstance(valid_sources, str):
            valid_sources = (valid_sources,)
        valid_sources = tuple(valid_sources)
        v_esc = re.escape(verb)
        pat_a = re.compile(rf'(\d+)\s*{QUANT}\s*{v_esc}')
        pat_b = re.compile(rf'{v_esc}\s*(\d+)\s*{QUANT}')
        seen = set()
        for m in list(pat_a.finditer(text)) + list(pat_b.finditer(text)):
            key = (m.start(), m.end())
            if key in seen:
                continue
            seen.add(key)
            try:
                claimed = int(m.group(1))
            except (ValueError, IndexError):
                continue
            actual = sum(1 for e in events if e.get('source') in valid_sources)
            if claimed != actual:
                snippet = text[max(0, m.start()-20):m.end()+10].replace('\n', ' ')
                fails.append(
                    f'⛔ 正文陈述 "{verb}…{claimed}" 与事件流不符：'
                    f'verb_to_sources 映射 {valid_sources} 的实际事件数 = {actual}'
                    f'（上下文: ...{snippet}...）'
                )
    return fails


def audit_conclusion_consistency(facts: dict, paper_path=None, results_path='results.json') -> list:
    """Step 5 末尾审计：正文结论性陈述与 results.json 一致。"""
    fails = []
    rp = Path(results_path)
    if not rp.exists():
        return ['⚠ results.json 不存在，跳过结论一致性审计']
    try:
        results = json.loads(rp.read_text(encoding='utf-8'))
    except Exception as e:
        return [f'⛔ results.json 解析失败: {e}']

    # 找正文
    if not paper_path:
        for p in ('paper/main.tex', 'paper/main.md', 'RESULTS.md', 'main.tex', 'main.md'):
            if Path(p).exists():
                paper_path = p
                break
    if not paper_path:
        return ['⚠ 未找到正文（paper/main.* 或 RESULTS.md），跳过结论审计']
    text = Path(paper_path).read_text(encoding='utf-8')

    # 收集 results.json 里的"标量结论值"（最优解、最优值、最优方案编号等）
    conclusion_keys = (
        'optimal_solution', 'best_plan', 'min_count', 'max_count',
        'optimal_value', 'final_answer', 'best_score', 'best_n',
        'optimal_x', 'optimal_y', 'optimal_n', 'min_n', 'max_n',
        'n_minimal', 'n_optimal', 'final_score', 'final_value',
        'min_count_for', 'max_count_for', 'best_count', 'best_value',
        '最优方案', '最优解', '最优值', '最少', '最优数', '最少数量',
    )
    conclusion_values = []
    def walk(o, prefix=''):
        if isinstance(o, dict):
            for k, v in o.items():
                if any(ck.lower() in k.lower() for ck in conclusion_keys):
                    if isinstance(v, (int, float, str)) and v not in (None, ''):
                        conclusion_values.append((f'{prefix}.{k}' if prefix else k, v))
                if isinstance(v, (dict, list)):
                    walk(v, f'{prefix}.{k}' if prefix else k)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f'{prefix}[{i}]')
    walk(results)

    # 检查每个"结论值"是否出现在正文里
    miss_conclusions = []
    for key, val in conclusion_values[:50]:
        if isinstance(val, (int, float)):
            fv = float(val)
            patterns = [str(val)]
            if fv.is_integer():
                patterns.append(f'{fv:.0f}')
            else:
                patterns.append(f'{fv:.2f}')
                patterns.append(f'{fv:.3f}')
                # 百分比形式：0.95 → 95% / 95.0% / 95.00%
                if 0 < fv < 1:
                    pct = fv * 100
                    patterns.append(f'{pct:.0f}%')
                    patterns.append(f'{pct:.1f}%')
                    patterns.append(f'{pct:.2f}%')
        else:
            patterns = [str(val)]
        if not any(p in text for p in patterns):
            miss_conclusions.append(f'{key}={val}')
    if miss_conclusions:
        fails.append(f'⛔ {len(miss_conclusions)} 个 results.json 里的结论值未在正文中体现: {miss_conclusions[:10]}')

    return fails


def audit_params_py_enforced(code_dir='code') -> list:
    """Step 3 强制检查：code/params.py 必须存在且其他 .py 必须 from params import。"""
    fails = []
    p = Path(code_dir)
    if not p.exists():
        return []
    params_py = p / 'params.py'
    if not params_py.exists():
        fails.append('⛔ code/params.py 不存在（参数密集型题目必须生成，从 PROBLEM_FACTS.json 自动展开）')
        return fails
    # 其他 .py 必须 import params
    other_py = [f for f in p.rglob('*.py') if f.name != 'params.py' and f.name != '__init__.py']
    no_import = []
    for f in other_py:
        try:
            txt = f.read_text(encoding='utf-8')
            if 'from params' not in txt and 'import params' not in txt:
                no_import.append(f.name)
        except Exception:
            pass
    if no_import:
        fails.append(f'⚠ {len(no_import)} 个代码文件未 `from params import *`（可能凭印象写裸数字）: {no_import[:5]}')
    return fails


def audit_figure_labels(facts: dict, fig_dir='figures') -> list:
    """Step 4 审计：图脚本 xlabel/ylabel/title 必须含单位且与 facts 一致。"""
    fails = []
    p = Path(fig_dir)
    if not p.exists():
        return []

    # 收集 facts 里的所有合法单位（从 unit_conversions 段、weapons 段字段名等）
    legal_units = set()
    for c in facts.get('unit_conversions', []):
        unit = c.get('si_unit') or ''
        if unit:
            legal_units.add(unit)
        raw = c.get('raw', '')
        # 从 "18kn" 抽 "kn"
        m = re.search(r'\d+(\.\d+)?\s*([a-zA-Z]+)', raw)
        if m:
            legal_units.add(m.group(2))
    # 常见物理/工程单位
    common_units = {'km', 'm', 'cm', 'mm', 's', 'min', 'h', 'kg', 'g', 'kn', 'rad', '°',
                    '%', 'kW', 'W', 'MHz', 'Hz', 'J', 'N'}
    legal_units |= common_units

    # 只检查 xlabel/ylabel（坐标轴标签需单位），title 通常是描述性的，不强制
    LABEL_RE = re.compile(r"(?:xlabel|ylabel|set_xlabel|set_ylabel)\s*\(\s*['\"]([^'\"]+)['\"]")
    for f in p.glob('*.py'):
        try:
            txt = f.read_text(encoding='utf-8')
            for line_no, line in enumerate(txt.splitlines(), 1):
                if line.strip().startswith('#'):
                    continue
                for m in LABEL_RE.finditer(line):
                    label = m.group(1)
                    # 检查是否含单位（圆括号 / 方括号 / 斜杠分隔）
                    has_paren_unit = re.search(r'[(\[]([\w/°%]+)[)\]]', label)
                    has_slash_unit = '/' in label  # 如 "速度/m·s⁻¹"
                    if not (has_paren_unit or has_slash_unit):
                        # 没有单位标注（只 xlabel("时间") 而非 xlabel("时间 (s)")）
                        # 但允许一些明显不需要单位的（如纯类别 / 编号 / 比例）
                        if any(kw in label for kw in ('编号', '索引', 'index', '类型', 'category',
                                                        '比例', 'ratio', '占比', '排名', 'rank')):
                            continue
                        fails.append(f'⚠ {f.name}:{line_no} 标签 "{label}" 缺单位标注')
                        if len(fails) >= 20:
                            return fails
        except Exception:
            pass
    return fails


def audit_figure_legends(facts: dict, fig_dir='figures') -> list:
    """Step 4 审计：图例文字必须能 grep 到 facts 里登记的实体名（entities[].id 或 weapons[].id）。"""
    fails = []
    p = Path(fig_dir)
    if not p.exists():
        return []
    # 收集 facts 中所有"实体名/武器名"作为合法图例词
    legal_terms = set()
    for w in facts.get('weapons', []):
        wid = w.get('id') or ''
        if wid:
            legal_terms.add(wid)
            # 拆下划线后的中英文词
            for part in wid.split('_'):
                if len(part) >= 2:
                    legal_terms.add(part)
    for e in facts.get('entities', []):
        eid = e.get('id') or ''
        if eid:
            legal_terms.add(eid)

    if not legal_terms:
        return []  # facts 没登记实体，跳过

    # 匹配 label='xxx' 关键字参数（必须前面有逗号或空格，不能是 xlabel 的一部分）
    LEGEND_KWARG_RE = re.compile(r"[\s,(]label\s*=\s*['\"]([^'\"]+)['\"]")
    # 匹配 plt.legend([...]) 或 ax.legend(['a','b'])
    LEGEND_CALL_RE = re.compile(r"\.legend\s*\(\s*\[\s*((?:['\"][^'\"]+['\"]\s*,?\s*)+)\]")
    for f in p.glob('*.py'):
        try:
            txt = f.read_text(encoding='utf-8')
            for line_no, line in enumerate(txt.splitlines(), 1):
                if line.strip().startswith('#'):
                    continue
                labels_found = []
                for m in LEGEND_KWARG_RE.finditer(line):
                    labels_found.append(m.group(1))
                for m in LEGEND_CALL_RE.finditer(line):
                    # 抽逗号分隔的多个字符串
                    inner = m.group(1)
                    for s in re.findall(r"['\"]([^'\"]+)['\"]", inner):
                        labels_found.append(s)
                for label in labels_found:
                    # 跳过明显的描述性文字
                    if any(kw in label for kw in ('原始', 'raw', '总计', 'total', '其他', 'other',
                                                    '理论值', '观测值', 'observed', 'predicted')):
                        continue
                    if not any(t in label for t in legal_terms):
                        fails.append(f'⚠ {f.name}:{line_no} 图例 "{label}" 未匹配 facts 登记的任何实体/武器名')
                        if len(fails) >= 20:
                            return fails
        except Exception:
            pass
    return fails


def audit_figure_data_source(fig_dir='figures') -> list:
    """Step 4 审计：图脚本必须从 results.json/all_results.json 读数据，不能 hardcode。
    （与第 8 项 audit_figure_scripts 互补：本项检查"是否真的有 json.load(...)"）"""
    fails = []
    p = Path(fig_dir)
    if not p.exists():
        return []
    for f in p.glob('*.py'):
        try:
            txt = f.read_text(encoding='utf-8')
            # 去掉注释行后再判断（防止注释里出现 json.load 把审计骗过去）
            non_comment = '\n'.join(
                line for line in txt.splitlines()
                if not line.strip().startswith('#')
            )
            # 排除明显不需要读 JSON 的脚本（如生成示意图、坐标轴示例）
            if 'plt.plot' not in non_comment and 'plt.scatter' not in non_comment \
                    and 'plt.bar' not in non_comment and 'plt.hist' not in non_comment:
                continue
            # 必须含 json.load( 或 read_json( 或 pd.read_csv(（带括号，是函数调用而非字面文字）
            if 'json.load(' not in non_comment and 'read_json(' not in non_comment \
                    and 'pd.read_csv(' not in non_comment and 'np.load(' not in non_comment:
                fails.append(f'⚠ {f.name} 含绘图代码但未从 JSON/CSV 读数据（疑似硬编码数据）')
                if len(fails) >= 20:
                    return fails
        except Exception:
            pass
    return fails


# ----- 主入口 -----

def run_audit(stage='full') -> int:
    """跑审计，返回 exit code（0=通过, 1=拒绝, 2=仅警告）。"""
    facts_path = Path('PROBLEM_FACTS.json')

    # ⛔ paper / figure stage：即使无 PROBLEM_FACTS.json 也能跑（[13]+[14] 独立）
    # 用空 facts 继续，让正文 ↔ results.json 一致性审计 + 事件源归属审计独立可用
    # 适用所有写稿 / 制图 skill（含通用学术 / 课程论文 / 人文社科），无需依赖参数密集型题面
    paper_only_stages = ('paper', 'figure')

    if not facts_path.exists():
        if stage in paper_only_stages:
            facts = {}
            print(f'ℹ PROBLEM_FACTS.json 不存在 — 进入 paper/figure 简化模式：'
                  f'仅跑独立审计（正文结论一致性 + 事件源归属 + 图表标签）')
        else:
            print('⚠ PROBLEM_FACTS.json 不存在，跳过参数保真度审计')
            print('  （如题面参数 ≥ 20 个，请回 comp-prob-analysis 补产 PROBLEM_FACTS.json）')
            return 0
    else:
        try:
            facts = json.loads(facts_path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'⛔ PROBLEM_FACTS.json JSON 格式错误: {e}')
            return 1

    print(f'=' * 60)
    print(f'facts_audit (stage={stage})  共 {len(extract_numbers_from_facts(facts))} 个数值字段')
    print(f'=' * 60)

    all_fails = []

    # 模块 1: 元信息 + schema（仅在有 facts 时跑）
    if facts:
        print('\n[1] 元信息与 Schema 检查')
        fails = audit_meta(facts) + validate_schema(facts)
        for f in fails:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过')
        all_fails.extend(fails)

        # 模块 2: OCR 客观比对（仅在有 facts 时跑）
        print('\n[2] OCR 客观比对（防虚构）')
        fails = audit_facts_against_ocr(facts)
        for f in fails:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过')
        all_fails.extend(fails)

    # 模块 3: 派生值验算（仅在有 facts 且含 unit_conversions 时跑）
    if facts:
        print('\n[3] 派生值验算')
        fails = validate_derivations(facts)
        for f in fails:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 unit_conversions 段')
        all_fails.extend(fails)

    # 模块 4: modeling stage 起加入 modeling report 审计
    if facts and stage in ('modeling', 'code', 'full'):
        print('\n[4] MODELING_REPORT.md 数字溯源 + rules 覆盖')
        fails = audit_modeling_report(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / MODELING_REPORT.md 暂未生成')
        all_fails.extend(fails)

    # 模块 5-8: code stage 才跑（需要 facts）
    if facts and stage in ('code', 'full'):
        print('\n[5] 代码端审计（裸数字 vs facts）')
        fails = audit_code_against_facts(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if len(fails) > 10:
            print(f'  ...还有 {len(fails) - 10} 处')
        if not fails:
            print('  ✅ 通过 / 无 code/ 目录')
        all_fails.extend(fails)

        print('\n[6] params.py 强制使用检查')
        fails = audit_params_py_enforced()
        for f in fails:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 code/ 目录')
        all_fails.extend(fails)

        print('\n[7] 公式 ↔ 代码实现一致性')
        fails = audit_modeling_vs_code(facts)
        for f in fails:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 modeling report 公式符号')
        all_fails.extend(fails)

        print('\n[8] 图脚本数据溯源')
        fails = audit_figure_scripts()
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 figures/ 目录')
        all_fails.extend(fails)

        print('\n[9] 子问题字段隔离')
        fails = audit_subproblem_isolation(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 sub_problems 段')
        all_fails.extend(fails)

    # 模块 10-12: figure stage 才跑
    if stage in ('figure', 'full'):
        print('\n[10] 图表标签单位检查')
        fails = audit_figure_labels(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 figures/ 目录')
        all_fails.extend(fails)

        print('\n[11] 图例与 facts 实体名匹配')
        fails = audit_figure_legends(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / facts 无 entities/weapons 段')
        all_fails.extend(fails)

        print('\n[12] 图脚本数据来源（防硬编码）')
        fails = audit_figure_data_source()
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无绘图脚本')
        all_fails.extend(fails)

    # 模块 13: paper stage 才跑
    if stage in ('paper', 'full'):
        print('\n[13] 正文结论一致性')
        fails = audit_conclusion_consistency(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 暂无正文 / 无明显结论字段')
        all_fails.extend(fails)

        print('\n[14] 事件源归属（防写稿脑补：正文陈述 ↔ events ↔ verb_to_sources）')
        fails = audit_event_source_attribution(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无 events + verb_to_sources（不适用本题）')
        all_fails.extend(fails)

        print('\n[15] 正文数字溯源（抽样 30 个浮点数，每个必须能在 results / facts 找到）')
        fails = audit_paper_numbers_traceability(facts)
        for f in fails[:10]:
            print(f'  {f}')
        if not fails:
            print('  ✅ 通过 / 无正文或无可溯源源（results.json / facts）')
        all_fails.extend(fails)

    # 汇总
    print()
    print('=' * 60)
    fatal = [f for f in all_fails if f.startswith('⛔')]
    warn = [f for f in all_fails if f.startswith('⚠')]
    n_suspicious = len(fatal) + len(warn)
    print(f'汇总: {len(fatal)} 项 ⛔ 拒绝 + {len(warn)} 项 ⚠ 警告  (n_suspicious_numbers={n_suspicious})')

    # 落档 AUDIT_REPORT.md
    report = ['# facts_audit 报告',
              f'\nstage: {stage}',
              f'\nfatal: {len(fatal)}, warn: {len(warn)}',
              '\n## 拒绝项'] + [f'- {x}' for x in fatal] + \
             ['\n## 警告项'] + [f'- {x}' for x in warn]
    Path('AUDIT_REPORT.md').write_text('\n'.join(report), encoding='utf-8')
    print(f'报告落档: AUDIT_REPORT.md')

    if fatal:
        print('⛔ 存在 fatal 项，不允许进入下一步')
        return 1
    if warn:
        print('⚠ 仅警告项，可继续但建议复查')
        return 2
    print('✅ 全部通过')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=['prob', 'modeling', 'code', 'figure', 'paper', 'full'], default='full',
                        help='prob = Step 1; modeling = Step 2; code = Step 3; figure = Step 4; paper = Step 5; full = 全部')
    args = parser.parse_args()
    sys.exit(run_audit(args.stage))

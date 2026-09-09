# -*- coding: utf-8 -*-
"""数据建档 — 用户数据的权威台账，第 6 道闸的基准来源。

把"传进来的数据长什么样"从"AI 记在上下文里"变成"机器探测后落盘成 DATA_PROFILE.json"。
后续任何一步要核对行数/sheet 数/列名，一律读这份档，而不是靠上下文记忆（会漂移/被压缩）。
与 PROBLEM_FACTS.json（题面参数权威源）同一套哲学，只是对象换成"数据本身"。

对每个 user_data/*.{csv,xlsx,xls}：逐文件（Excel 逐 sheet）记录行数、列名、每列缺失率、sha256。
大文件用分块计数防 OOM（上传上限 5G）。只 print 摘要，完整结构写进 DATA_PROFILE.json。

用法：
  python _utils/data_profile.py [--datadir user_data] [--out DATA_PROFILE.json]
退出码：0=建档成功（含无数据文件的情形） 1=有文件全部读取失败
"""
from __future__ import annotations
import sys
import os
import json
import glob
import hashlib
import argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    import pandas as pd
except ImportError:
    print("[data_profile] 缺 pandas，跳过建档（不阻断）")
    sys.exit(0)

CSV_ENCODINGS = ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1"]
CHUNK = 100_000          # CSV 分块行数，控内存


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""):
            h.update(blk)
    return h.hexdigest()


def _profile_frame(df) -> dict:
    """从一个 DataFrame 抽字段级摘要（不落原始数据，只落元信息）。"""
    n = int(len(df))
    miss = {}
    for col in df.columns:
        nulls = int(df[col].isnull().sum())
        if nulls:
            miss[str(col)] = round(nulls / n, 4) if n else 1.0
    return {"rows": n, "cols": [str(c) for c in df.columns], "null_rate": miss}


def _profile_csv(path: str) -> dict:
    """分块读 CSV：累计行数、取列名、按块累计每列缺失数（防大文件 OOM）。"""
    for enc in CSV_ENCODINGS:
        try:
            total, cols, null_acc = 0, None, {}
            for chunk in pd.read_csv(path, encoding=enc, chunksize=CHUNK):
                if cols is None:
                    cols = [str(c) for c in chunk.columns]
                    null_acc = {c: 0 for c in cols}
                total += len(chunk)
                for c in chunk.columns:
                    null_acc[str(c)] = null_acc.get(str(c), 0) + int(chunk[c].isnull().sum())
            miss = {c: round(v / total, 4) for c, v in null_acc.items() if v} if total else {}
            return {"encoding": enc, "sheets": {"__csv__": {"rows": total, "cols": cols or [], "null_rate": miss}},
                    "total_rows": total, "n_sheets": 1}
        except UnicodeDecodeError:
            continue
        except Exception as e:                       # 编码对了但解析炸 → 记错误、别再换编码
            return {"error": f"{type(e).__name__}: {e}"}
    return {"error": "所有编码均无法解码"}


def _profile_excel(path: str) -> dict:
    """读全部 sheet（sheet_name=None），逐张记录。绝不默认只读首表。"""
    try:
        all_sheets = pd.read_excel(path, sheet_name=None)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    sheets = {str(name): _profile_frame(df) for name, df in all_sheets.items()}
    total = sum(s["rows"] for s in sheets.values())
    return {"sheets": sheets, "total_rows": total, "n_sheets": len(sheets)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--datadir", default="user_data")
    ap.add_argument("--out", default="DATA_PROFILE.json")
    args = ap.parse_args()

    files = sorted(
        glob.glob(os.path.join(args.datadir, "*.csv"))
        + glob.glob(os.path.join(args.datadir, "*.xlsx"))
        + glob.glob(os.path.join(args.datadir, "*.xls"))
    )
    if not files:
        print(f"[data_profile] {args.datadir}/ 下无 csv/xlsx/xls，无需建档（纯建模题）")
        # 仍写一份空档，让下游"有没有数据"这件事也有据可查
        json.dump({"_meta": {"n_files": 0}, "files": {}},
                  open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        return 0

    profile, n_err = {}, 0
    for f in files:
        base = os.path.basename(f)
        try:
            info = _profile_csv(f) if f.lower().endswith(".csv") else _profile_excel(f)
            info["sha256"] = _sha256(f)
            info["bytes"] = os.path.getsize(f)
        except Exception as e:
            info = {"error": f"{type(e).__name__}: {e}"}
        if "error" in info:
            n_err += 1
        profile[base] = info

    out = {"_meta": {"n_files": len(files), "n_error": n_err}, "files": profile}
    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 只 print 人看的摘要，完整结构在 JSON 里
    print(f"[data_profile] 已建档 {len(files)} 个数据文件 → {args.out}")
    for base, info in profile.items():
        if "error" in info:
            print(f"  ✗ {base}: 读取失败 {info['error']}")
            continue
        sheet_desc = ", ".join(f"{n}({s['rows']}行)" for n, s in info["sheets"].items())
        tag = "" if info["n_sheets"] == 1 else f"{info['n_sheets']} sheet · "
        print(f"  ✓ {base}: {tag}共 {info['total_rows']} 行 [{sheet_desc}]")
    if n_err == len(files):
        print("❌ 所有数据文件都读取失败——请先解决编码/格式问题再继续。")
        return 1
    if n_err:
        print(f"⚠ {n_err} 个文件读取失败，其余已建档；确认失败文件是否建模必需。")
    print("→ 后续所有'该有多少行/几张 sheet'的核对，一律读 DATA_PROFILE.json，勿凭记忆。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

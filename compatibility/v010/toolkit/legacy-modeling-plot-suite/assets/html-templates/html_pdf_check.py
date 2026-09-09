#!/usr/bin/env python3
"""HTML→PDF 产物专属质检 — paper-figure-html skill 用。

screenshot_capture.py 用 Electron printToPDF 出 PDF。本脚本对产出的 PDF 做
4 项 HTML/PDF 专属检查，堵住「HTML 画图 → 转 PDF」这条链路特有的坑：

  1. 单页检测（最关键）：printToPDF 内容超一页会分页，而 LaTeX \\includegraphics
     只显示第一页 → 图被截断。多页 = FAIL。
  2. 矢量校验：确认 PDF 内含文字/矢量（有 /Font 对象），而非整页渲染成一张位图
     （位图放大会糊，且往往意味着内容尺寸测量出错）。
  3. 内容裁切检测：页面尺寸异常小/异常大（对比 HTML 声明尺寸，若提供）提示裁切。
  4. 宽高比合理性：过于极端的宽高比（如 > 8:1）对论文排版不友好 → WARN。

⛔ 纯标准库实现（与项目其它 tools 一致，不引第三方）。只解析 PDF 结构，
   不渲染、不联网。

用法:
  python html_pdf_check.py <fig.pdf>
  python html_pdf_check.py <fig.pdf> --expect-w 1180 --expect-h 720   # 传 HTML 声明尺寸(px)辅助裁切判断
  python html_pdf_check.py <fig.pdf> --aspect-warn 8                  # 自定义宽高比告警阈值(默认 8)

退出码:
  0 = 通过（可能带 WARN，WARN 不阻塞）
  1 = 有问题（打印 FAIL 明细，skill 端据此修复重出）
  2 = 无法检查（文件不存在/非 PDF/解析失败）→ skill 端跳过，不阻塞
"""
from __future__ import annotations

import argparse
import re
import sys
import zlib
from pathlib import Path

# Windows 控制台默认 GBK，打印 ℹ/⚠/❌ 等符号会 UnicodeEncodeError。
# 统一把 stdout/stderr 重编码为 UTF-8（replace 兜底），保证跨平台不崩。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# printToPDF 用 CSS 96dpi 量内容，但 PDF 内部单位是 pt(72/inch)。
# px → pt 换算: pt = px * 72 / 96 = px * 0.75
_PX_TO_PT = 72.0 / 96.0
# 页面尺寸下限(pt)：低于此值几乎不可能是正常图（约 40px 宽/高），提示裁切/测量失败
_MIN_PAGE_PT = 30.0


def _read_bytes(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except Exception:
        return None


def _iter_decoded_streams(raw: bytes):
    """尽力解出 PDF 里被 FlateDecode 压缩的 stream（含对象流 ObjStm），
    yield 解压后的字节。Chromium printToPDF 常把页树/字体信息塞进压缩对象流，
    只搜原始字节会漏判 → 解压后再搜一遍更稳。解不出的流跳过。"""
    for m in re.finditer(rb"stream\r?\n", raw):
        start = m.end()
        end = raw.find(b"endstream", start)
        if end == -1:
            continue
        chunk = raw[start:end]
        # 去掉 stream 后可能的尾部换行
        chunk = chunk.rstrip(b"\r\n")
        try:
            yield zlib.decompress(chunk)
        except Exception:
            # 有的流带前导空白或非 zlib，尝试跳过头部再解
            try:
                yield zlib.decompressobj().decompress(chunk)
            except Exception:
                continue


def _count_pages(raw: bytes, blobs: list[bytes]) -> int | None:
    """页数统计：优先信任页树 /Count，回退到 /Type /Page 计数。
    返回 None 表示无法判定。"""
    haystacks = [raw] + blobs

    # 1) 页树根 /Type /Pages 上的 /Count N（最权威）
    counts: list[int] = []
    for hs in haystacks:
        for pm in re.finditer(rb"/Type\s*/Pages\b", hs):
            # 在该对象附近(前后 400 字节)找 /Count N
            window = hs[max(0, pm.start() - 400): pm.end() + 400]
            cm = re.search(rb"/Count\s+(\d+)", window)
            if cm:
                counts.append(int(cm.group(1)))
    if counts:
        # 顶层页树 Count 取最大（嵌套页树时根节点最大）
        return max(counts)

    # 2) 回退：数 /Type /Page（注意排除 /Pages）。用负向断言避免把 /Pages 也算进去
    page_re = re.compile(rb"/Type\s*/Page(?![sA-Za-z])")
    total = 0
    for hs in haystacks:
        total += len(page_re.findall(hs))
    if total > 0:
        return total
    return None


def _has_font(raw: bytes, blobs: list[bytes]) -> bool:
    """是否含字体对象（判定矢量文字 vs 整页位图）。"""
    font_re = re.compile(rb"/(Font|FontDescriptor|BaseFont)\b")
    if font_re.search(raw):
        return True
    for b in blobs:
        if font_re.search(b):
            return True
    return False


def _has_big_image(raw: bytes, blobs: list[bytes]) -> bool:
    """是否含较大的位图 XObject（辅助判断「整页被渲染成图」）。"""
    img_re = re.compile(rb"/Subtype\s*/Image\b")
    if img_re.search(raw):
        return True
    for b in blobs:
        if img_re.search(b):
            return True
    return False


def _page_size_pt(raw: bytes) -> tuple[float, float] | None:
    """取第一个 /MediaBox 的 (宽, 高)，单位 pt。取不到返回 None。"""
    m = re.search(
        rb"/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]",
        raw,
    )
    if not m:
        return None
    x0, y0, x1, y1 = (float(m.group(i)) for i in range(1, 5))
    w = abs(x1 - x0)
    h = abs(y1 - y0)
    if w <= 0 or h <= 0:
        return None
    return w, h


def main() -> None:
    ap = argparse.ArgumentParser(description="HTML→PDF 产物专属质检（单页/矢量/裁切/宽高比）")
    ap.add_argument("pdf", help="待检查的 PDF 路径")
    ap.add_argument("--expect-w", type=float, default=None, help="HTML 声明内容宽(px)，辅助裁切判断")
    ap.add_argument("--expect-h", type=float, default=None, help="HTML 声明内容高(px)，辅助裁切判断")
    ap.add_argument("--aspect-warn", type=float, default=8.0, help="宽高比告警阈值(默认 8)")
    args = ap.parse_args()

    path = Path(args.pdf)
    if not path.exists() or not path.is_file():
        print(f"NO_FILE: {path} 不存在 — skip", file=sys.stderr)
        sys.exit(2)

    raw = _read_bytes(path)
    if raw is None or len(raw) < 200:
        print(f"UNREADABLE: {path} 读取失败或过小 — skip", file=sys.stderr)
        sys.exit(2)
    if not raw.lstrip()[:5].startswith(b"%PDF-"):
        print(f"NOT_PDF: {path} 不是 PDF（缺 %PDF- 头）— skip", file=sys.stderr)
        sys.exit(2)

    blobs = list(_iter_decoded_streams(raw))

    fails: list[str] = []
    warns: list[str] = []
    infos: list[str] = []

    # —— 检查 1：单页检测（最关键）——
    pages = _count_pages(raw, blobs)
    if pages is None:
        warns.append("页数无法判定（未找到 /Count 或 /Type /Page）— 建议人工确认是否单页")
    elif pages > 1:
        fails.append(
            f"多页 PDF（{pages} 页）！LaTeX \\includegraphics 只显示第 1 页 → 图会被截断。"
            "→ 缩小 HTML 内容或调窄容器宽度，让内容落在单页内，重新出图。"
        )
    else:
        infos.append(f"单页 ✓（{pages} 页）")

    # —— 检查 2：矢量校验 ——
    has_font = _has_font(raw, blobs)
    has_img = _has_big_image(raw, blobs)
    if not has_font:
        if has_img:
            fails.append(
                "PDF 内无字体对象但含大位图 → 内容疑似被整页渲染成位图（放大会糊、非真矢量）。"
                "→ 检查 HTML 是否用了 <img>/canvas/背景图代替文字，改成纯文本+CSS 重画。"
            )
        else:
            warns.append("PDF 内未检测到字体对象 — 若图中本应有文字，请人工确认文字是否丢失")
    else:
        infos.append("含字体对象（矢量文字）✓")

    # —— 检查 3 & 4：页面尺寸 / 宽高比 ——
    size = _page_size_pt(raw)
    if size is None:
        warns.append("未取到 /MediaBox 页面尺寸 — 跳过裁切与宽高比检查")
    else:
        w_pt, h_pt = size
        infos.append(f"页面尺寸 {w_pt:.0f}×{h_pt:.0f} pt（≈{w_pt/_PX_TO_PT:.0f}×{h_pt/_PX_TO_PT:.0f} px）")

        # 检查 3：内容裁切 —— 异常小
        if w_pt < _MIN_PAGE_PT or h_pt < _MIN_PAGE_PT:
            fails.append(
                f"页面尺寸异常小（{w_pt:.0f}×{h_pt:.0f} pt）→ 内容疑似被裁切或未渲染。"
                "→ 检查 .fig 容器是否 display:inline-block 且有内容，body 是否 margin:0。"
            )
        # 检查 3b：与 HTML 声明尺寸对比（若提供）
        if args.expect_w and args.expect_w > 0:
            exp_w_pt = args.expect_w * _PX_TO_PT
            ratio = w_pt / exp_w_pt if exp_w_pt else 1.0
            if ratio < 0.6 or ratio > 1.6:
                warns.append(
                    f"实际宽 {w_pt:.0f}pt 与声明宽 {args.expect_w:.0f}px({exp_w_pt:.0f}pt) 偏差较大"
                    f"（比值 {ratio:.2f}）— 可能裁切或多量了空白"
                )
        if args.expect_h and args.expect_h > 0:
            exp_h_pt = args.expect_h * _PX_TO_PT
            ratio = h_pt / exp_h_pt if exp_h_pt else 1.0
            if ratio < 0.6 or ratio > 1.6:
                warns.append(
                    f"实际高 {h_pt:.0f}pt 与声明高 {args.expect_h:.0f}px({exp_h_pt:.0f}pt) 偏差较大"
                    f"（比值 {ratio:.2f}）— 可能裁切或多量了空白"
                )

        # 检查 4：宽高比合理性
        aspect = max(w_pt, h_pt) / min(w_pt, h_pt)
        if aspect > args.aspect_warn:
            orient = "过宽" if w_pt >= h_pt else "过高"
            warns.append(
                f"宽高比 {aspect:.1f}:1 {orient}（阈值 {args.aspect_warn:.0f}:1）"
                "— 对论文单栏/双栏排版不友好，建议重排布局让长宽更接近。"
            )
        else:
            infos.append(f"宽高比 {aspect:.2f}:1（合理）✓")

    # —— 汇总输出 ——
    print(f"=== html_pdf_check: {path.name} ===")
    for s in infos:
        print(f"  ℹ {s}")
    for s in warns:
        print(f"  ⚠ WARN: {s}")
    for s in fails:
        print(f"  ❌ FAIL: {s}")

    if fails:
        print(f"❌ {len(fails)} 项 FAIL — 必须修复后重新出图")
        sys.exit(1)
    if warns:
        print(f"✅ 通过（{len(warns)} 项 WARN，不阻塞，酌情优化）")
    else:
        print("✅ 全部通过")
    sys.exit(0)


if __name__ == "__main__":
    main()

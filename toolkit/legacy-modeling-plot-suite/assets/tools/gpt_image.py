#!/usr/bin/env python3
"""GPT Image 2 命令行工具 — 供 Claude skill 调用生成示意图/技术路线图/流程图。

用法:
  python _utils/gpt_image.py --check
  python _utils/gpt_image.py --prompt "..." --output figures/fig_xxx.png --lang zh
  python _utils/gpt_image.py --prompt "..." --output figures/fig_xxx.png --lang en --aspect-ratio 16:9

环境变量:
  GPT_IMAGE_API_KEY  — API Key（必须）
  GPT_IMAGE_BASE_URL — API 地址（默认 https://www.mhcoding.ai/）

退出码:
  0 = 成功（--check 模式：API Key 已配置；生成模式：图片已保存）
  1 = 失败（未配置 key / API 错误 / 网络错误）

输出 PNG 后自动转 PDF（LaTeX 需要 PDF 格式）。
"""
from __future__ import annotations

import argparse
import base64
import http.client
import json
import os
import socket
import ssl
import sys
import urllib.request
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

# ============================================================
# 提示词模板（集中管理，方便修改替换）
# ============================================================

# 中文语言适配前缀（精简版——GPT Image 越简洁效果越好）
ZH_LANG_PREFIX = (
    "生成一张科研级别的学术论文插图。"
    "字体不要出现乱码，确保生成简体中文可适配。"
    "数学变量保持拉丁字母。\n\n"
)

# 英文语言适配前缀
EN_LANG_PREFIX = (
    "Generate a research-grade academic paper illustration. "
    "All text in English, clean sans-serif font.\n\n"
)

# 统一风格后缀（极简——只保留必要约束，让 GPT Image 自由发挥）
UNIFIED_STYLE_SUFFIX = (
    "\n\n图表上方不需要标题。白色背景，无水印无签名无装饰边框。"
    "配色自由搭配，丰富专业。4K分辨率。"
)

# 安全约束后缀（精简）
SAFETY_SUFFIX = (
    "\n不要生成真人面孔或肖像照片，需要人物时用抽象图标代替。"
)


def build_prompt(user_prompt: str, lang: str) -> str:
    """注入语言适配 + 统一风格 + 安全约束。Claude 只需写核心场景描述。"""
    if lang == "zh":
        prefix = ZH_LANG_PREFIX
    else:
        prefix = EN_LANG_PREFIX
    return prefix + user_prompt + UNIFIED_STYLE_SUFFIX + SAFETY_SUFFIX


# ============================================================
# GPT Image API 调用（基于用户提供的 GPTImage2ChatProvider 代码）
# ============================================================

def _download_image_bytes(url: str) -> bytes:
    """用原生 urllib 下载图片，返回 bytes。"""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except Exception as e:
        raise Exception(f"图片下载失败 {url}: {e}")


def _aspect_to_size(aspect_ratio: str) -> str:
    """把 skill 传入的宽高比映射成 OpenAI images API 的标准 size。
    gpt-image 系列支持 1024x1024 / 1024x1536(竖) / 1536x1024(横)。"""
    m = {
        "1:1": "1024x1024",
        "16:9": "1536x1024", "3:2": "1536x1024", "4:3": "1536x1024",
        "9:16": "1024x1536", "2:3": "1024x1536", "3:4": "1024x1536",
    }
    return m.get((aspect_ratio or "").strip(), "1024x1024")


def _call_gpt_image_api(
    api_base: str,
    api_key: str,
    prompt: str,
    aspect_ratio: str = "16:9",
    timeout: int = 180,
) -> bytes:
    """调用 GPT Image 2 API，返回图片 bytes。"""
    parsed = urlparse(api_base)
    host = parsed.hostname
    if not host:
        raise ValueError(f"API Base URL 格式错误: {api_base}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    # 强制路由到画图端点
    path = (parsed.path or "").rstrip("/")
    if not path.endswith("/v1/images/generations"):
        if path.endswith("/v1"):
            path = path + "/images/generations"
        else:
            path = "/v1/images/generations"

    # ⛔ OpenAI images API 的标准参数是 size（不是 aspect_ratio）；gpt-image 系列不支持
    #    response_format（传了会报 unknown parameter）。把宽高比映射成标准 size。
    payload_dict = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": 1,
        "size": _aspect_to_size(aspect_ratio),
    }
    payload_bytes = json.dumps(payload_dict).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Content-Length": str(len(payload_bytes)),
    }

    conn = None
    try:
        if parsed.scheme == "https":
            # 默认 CERT_REQUIRED + check_hostname，防 MITM（端点已锁定且持有效证书）
            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=ctx)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)

        conn.request("POST", path, payload_bytes, headers)
        res = conn.getresponse()
        data = res.read()

        if res.status != 200:
            error_text = data.decode("utf-8", errors="replace")[:500]
            raise Exception(f"HTTP {res.status}: {error_text}")

        response_json = json.loads(data.decode("utf-8"))
        data_list = response_json.get("data", [])
        if not data_list:
            raise ValueError(f"响应中无图片数据: {data.decode('utf-8')[:300]}")

        item = data_list[0]

        # 优先 base64
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"])

        # URL 下载（兼容 data URL：某些 API 返回 data:image/png;base64,... 而非 HTTP 链接）
        if item.get("url"):
            url_val = item["url"]
            if url_val.startswith("data:"):
                # data URL：直接解码 base64 部分
                b64_data = url_val.split(",", 1)[1]
                return base64.b64decode(b64_data)
            return _download_image_bytes(url_val)

        raise ValueError("响应中既无 b64_json 也无 url")

    except socket.timeout:
        raise Exception(f"请求超时（{timeout}秒），图片生成可能需要更长时间")
    except socket.gaierror:
        raise Exception("无法解析域名，请检查 GPT_IMAGE_BASE_URL")
    except ConnectionRefusedError:
        raise Exception("连接被拒绝，请检查 API 地址和端口")
    finally:
        if conn:
            conn.close()


# ============================================================
# PNG → PDF 转换
# ============================================================

def _png_to_pdf(png_path: str) -> str:
    """将 PNG 转为 PDF（LaTeX 需要），返回 PDF 路径。"""
    pdf_path = png_path.rsplit(".", 1)[0] + ".pdf"
    try:
        from PIL import Image
        img = Image.open(png_path)
        if img.mode == "RGBA":
            # PDF 不支持透明通道，合成白色背景
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.save(pdf_path, "PDF", resolution=300)
        return pdf_path
    except ImportError:
        # PIL 不可用，直接用 PNG（LaTeX 也能用，只是不如 PDF）
        print("WARNING: PIL not available, skipping PNG→PDF conversion")
        return png_path


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="GPT Image 2 生成工具")
    parser.add_argument("--check", action="store_true", help="仅检查 API Key 是否配置")
    parser.add_argument("--prompt", type=str, help="生成提示词（核心内容，语言/风格自动注入）")
    parser.add_argument("--output", type=str, help="输出路径（.png），自动生成同名 .pdf")
    parser.add_argument("--lang", type=str, default="zh", choices=["zh", "en"], help="语言：zh 中文（默认）/ en 英文")
    parser.add_argument("--aspect-ratio", type=str, default="16:9", help="宽高比（默认 16:9）")
    parser.add_argument("--max-retries", type=int, default=3, help="最大重试次数（默认 3）")
    args = parser.parse_args()

    api_key = os.environ.get("GPT_IMAGE_API_KEY", "").strip()
    api_base = os.environ.get("GPT_IMAGE_BASE_URL", "https://www.mhcoding.ai/").strip()

    # Fallback: 从工作区配置文件读取（后端会写入这个文件，绕过环境变量传递问题）
    if not api_key:
        for cfg_path in ["_utils/_gpt_image_config.json", "../_utils/_gpt_image_config.json"]:
            if os.path.exists(cfg_path):
                try:
                    import json as _json
                    with open(cfg_path, "r") as _f:
                        _cfg = _json.load(_f)
                    api_key = _cfg.get("api_key", "").strip()
                    api_base = _cfg.get("base_url", api_base).strip()
                    if api_key:
                        break
                except Exception:
                    pass

    # --check 模式
    if args.check:
        if api_key:
            print("GPT_IMAGE_AVAILABLE=YES")
            sys.exit(0)
        else:
            print("GPT_IMAGE_AVAILABLE=NO (GPT_IMAGE_API_KEY not set)")
            sys.exit(1)

    # 生成模式：参数校验
    if not args.prompt:
        print("ERROR: --prompt is required")
        sys.exit(1)
    if not args.output:
        print("ERROR: --output is required")
        sys.exit(1)
    if not api_key:
        print("GPT_IMAGE_NOT_CONFIGURED: Set GPT_IMAGE_API_KEY in settings")
        sys.exit(1)

    # 构建完整 prompt（注入语言/风格/安全约束）
    full_prompt = build_prompt(args.prompt, args.lang)

    # 确保输出目录存在
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # 带重试的 API 调用（最多 max_retries 次）
    last_error = None
    for attempt in range(1, args.max_retries + 1):
        try:
            print(f"[GPT Image] Attempt {attempt}/{args.max_retries} ...")
            img_bytes = _call_gpt_image_api(
                api_base, api_key, full_prompt,
                aspect_ratio=args.aspect_ratio,
                timeout=240,
            )

            # 保存 PNG（确保格式统一）
            try:
                from PIL import Image as _PILImage
                _img = _PILImage.open(BytesIO(img_bytes))
                if _img.mode == "RGBA":
                    _bg = _PILImage.new("RGB", _img.size, (255, 255, 255))
                    _bg.paste(_img, mask=_img.split()[3])
                    _img = _bg
                elif _img.mode != "RGB":
                    _img = _img.convert("RGB")
                _img.save(str(out_path), "PNG")
            except ImportError:
                # PIL 不可用，直接写原始 bytes
                out_path.write_bytes(img_bytes)
            print(f"[GPT Image] PNG saved: {out_path} ({out_path.stat().st_size} bytes)")

            # 转 PDF
            pdf_path = _png_to_pdf(str(out_path))
            print(f"[GPT Image] PDF saved: {pdf_path}")
            print(f"OK {pdf_path}")
            sys.exit(0)

        except Exception as e:
            last_error = str(e)
            print(f"[GPT Image] Attempt {attempt} failed: {last_error}")
            if attempt < args.max_retries:
                import time
                wait = 3 * attempt  # 3s, 6s, 9s
                print(f"[GPT Image] Retrying in {wait}s ...")
                time.sleep(wait)

    # 所有重试都失败
    print(f"FAILED after {args.max_retries} attempts: {last_error}")
    sys.exit(1)


if __name__ == "__main__":
    main()

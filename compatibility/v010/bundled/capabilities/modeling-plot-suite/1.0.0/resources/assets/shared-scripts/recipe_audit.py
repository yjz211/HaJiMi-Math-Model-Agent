#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""recipe_audit.py — 规划图型 vs 实际代码对账（治「规划写等高线、画出来是条形图」）

背景：对 4 个真实竞赛工作区 94 张图逐图核对发现，图表质量塌方的首要原因不是
"不知道该画什么"，而是规划里写对了图型、执行时却凭印象退化成 plot/bar/scatter。
实测某工作区 14 张图有 3 张跑偏：等高线→barh、棒棒糖→plot、收敛曲线→bar。

用法:
  python3 _utils/recipe_audit.py                    # 在工作区根目录跑
  python3 _utils/recipe_audit.py --plan X.md        # 指定规划文档
  python3 _utils/recipe_audit.py --quiet            # 只输出不一致项

退出码: 0 = 无不一致（或无法判定）; 1 = 有不一致（仅供参考，调用方决定是否阻塞）

设计原则（防误判）:
  - 只对「特征明确、必须出现某个 API」的图型建映射，模糊图型（空间图/示意图/custom）不判
  - 每种图型给多个可接受 API（如棒棒糖可用 hlines 也可用 barh），命中任一即通过
  - 判不出来一律放行，宁漏不误
"""
import argparse
import os
import re
import sys

# ⛔ 自防御：Windows 下往管道输出中文默认走 GBK，遇到 ⚠ · — 会 UnicodeEncodeError 崩掉，
#    调用方即使忘了设 PYTHONIOENCODING 也不能让本脚本静默半途崩掉（实测踩过）。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# 图型关键词 → 可接受的绘图 API 正则（命中任一即算落实）
# 只列特征明确的；空间图/示意图/轨迹图/custom 等自由度高的不列（不判）
TYPE_RULES = [
    # (识别规划里图型的关键词, 期望API正则, 人类可读的期望说明)
    (('等高线', '响应面', 'contour'), r'\.contourf?\(|tricontour', 'contourf/contour'),
    (('热力图', '热图', 'heatmap'), r'\.imshow\(|\.pcolormesh\(|sns\.heatmap', 'imshow/pcolormesh'),
    (('混淆矩阵',), r'\.imshow\(|\.pcolormesh\(|sns\.heatmap', 'imshow/pcolormesh'),
    (('棒棒糖', 'lollipop'), r'\.hlines\(|\.vlines\(|\.barh\(|\.stem\(', 'hlines/vlines/barh/stem'),
    (('哑铃', 'dumbbell'), r'\.hlines\(|\.plot\(.*\n?.*\.scatter\(|\.barh\(', 'hlines+scatter'),
    (('龙卷风', 'tornado'), r'\.barh\(', 'barh'),
    (('瀑布', 'waterfall'), r'\.bar\(|\.barh\(|Rectangle|\.vlines\(|\.hlines\(|fill_between',
     'bar/Rectangle/vlines（任一种瀑布画法）'),
    (('森林图', 'forest'), r'\.errorbar\(|\.hlines\(', 'errorbar/hlines'),
    (('小提琴', 'violin'), r'violinplot', 'violinplot'),
    (('箱线', 'boxplot', '箱型'), r'\.boxplot\(|\.bxp\(', 'boxplot'),
    # Rain Cloud 常见三种实现：violinplot / 半小提琴手画(fill_betweenx+KDE) / 只画KDE+散点
    (('rain cloud', 'raincloud', '雨云'),
     r'violinplot|fill_betweenx|gaussian_kde|\.fill\(', 'violinplot 或 KDE+fill 手画半小提琴'),
    (('山脊', 'ridgeline', 'ridge'), r'fill_between|\.fill\(', 'fill_between'),
    (('桑基', 'sankey'), r'Sankey|\.fill\(|Polygon|PathPatch', 'Sankey/Polygon'),
    (('雷达', 'radar', '蜘蛛'), r"projection=['\"]polar['\"]|set_theta", 'polar 投影'),
    (('3d', '曲面', 'surface'), r"projection=['\"]3d['\"]|plot_surface|plot_trisurf", '3d 投影/plot_surface'),
    (('直方图', 'histogram'), r'\.hist\(|\.stairs\(|\.bar\(', 'hist/stairs'),
    (('饼图', '环形图', 'donut', 'pie'), r'\.pie\(', 'pie'),
    (('六边形', 'hexbin'), r'\.hexbin\(', 'hexbin'),
    # 阶梯/ECDF：.step / drawstyle='steps*' / .ecdf / 也有人用 plot 画阈值阶梯折线
    (('阶梯', 'ecdf', '累积分布'),
     r'\.step\(|drawstyle\s*=|steps-|\.ecdf\(|\.stairs\(', 'step/stairs/drawstyle=steps'),
    (('矢量场', '流线', 'quiver', 'stream'), r'\.quiver\(|\.streamplot\(', 'quiver/streamplot'),
    (('堆叠面积', 'stackplot'), r'\.stackplot\(|fill_between', 'stackplot/fill_between'),
    (('平行坐标', 'parallel'), r'\.plot\(', 'plot(多轴)'),
    (('收敛曲线', '收敛性'), r'\.plot\(|\.semilog|\.step\(', 'plot 折线（不是 bar）'),
    (('误差棒', 'errorbar'), r'\.errorbar\(|yerr=|xerr=', 'errorbar'),
]


def parse_plan(paths):
    """从规划文档抓 fig_xxx → 规划的图型描述。返回 {figname: desc}"""
    out = {}
    for p in paths:
        if not os.path.isfile(p):
            continue
        try:
            src = open(p, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        for line in src.split('\n'):
            # ⛔ 一行里出现 >=2 个不同图名的，是「清单/多样性检查」汇总行，不是单图规划行。
            #    误把整行当某张图的描述会造成严重假阳性（整行的词都算进那张图的图型）。
            allnames = set(re.findall(r'\b(fig_[A-Za-z0-9_]+)', line))
            if len(allnames) >= 2:
                continue
            m = re.search(r'\b(fig_[A-Za-z0-9_]+)', line)
            if not m:
                continue
            name = m.group(1)
            rest = line[m.end():]
            # 去掉图名后剩的描述（含图型）；表格行按 | 切
            if line.count('|') >= 3:
                cells = [c.strip() for c in line.split('|')]
                rest = ' '.join(cells)
            # 已有更长的描述则保留更长的（正文通常比 manifest 详细）
            if len(rest.strip()) > len(out.get(name, '')):
                out[name] = rest.strip()
    return out


def audit(plan_map, figdir='figures', quiet=False):
    issues = []
    checked = 0
    for name, desc in sorted(plan_map.items()):
        script = os.path.join(figdir, 'gen_%s.py' % name)
        if not os.path.isfile(script):
            continue
        try:
            code = open(script, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        dl = desc.lower()
        for kws, api_pat, human in TYPE_RULES:
            if not any(k.lower() in dl for k in kws):
                continue
            checked += 1
            if not re.search(api_pat, code, re.I):
                issues.append((name, desc, human))
            break          # 一张图只按第一个命中的图型判，避免重复报
    return issues, checked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='append', default=None)
    ap.add_argument('--figdir', default='figures')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    plans = a.plan or ['PROBLEM_ANALYSIS.md', 'TOPIC_PLAN.md', 'PAPER_PLAN.md']
    plan_map = parse_plan(plans)
    if not plan_map:
        if not a.quiet:
            print('INFO recipe_audit: 未找到规划文档或规划里没有 fig_ 条目，跳过对账')
        return 0

    issues, checked = audit(plan_map, a.figdir, a.quiet)

    if not a.quiet:
        print('=== 规划图型 vs 实际代码 对账（可判定 %d 张）===' % checked)
    if not issues:
        if not a.quiet:
            print('✅ 所有可判定的图，代码里都出现了规划要求的图型 API')
        return 0

    print('⚠ %d 张图的代码没画出规划要求的图型（最常见的质量塌方）：' % len(issues))
    for name, desc, human in issues:
        print('   · %s' % name)
        print('       规划要求: %s' % desc[:110])
        print('       代码里应出现: %s —— 实际没找到' % human)
    print('   处理：翻 _utils/RECIPES_FOR_THIS_PAPER.md 里对应配方，按配方代码重写该图；')
    print('        若该图型确实不适合本题数据，请先改规划文档里的图型，再改图（保持规划=产物一致）。')
    return 1


if __name__ == '__main__':
    sys.exit(main())

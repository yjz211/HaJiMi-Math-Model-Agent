#!/usr/bin/env bash
# count_subproblems.sh —— 统一的"子问题数量"计数器（单一权威口径）
#
# 背景：赛题有几个子问题(Q1/Q2/...)是贯穿 建模→编程→论文 全链的核心契约。
# 历史 bug：comp-modeling / comp-code / comp-paper-zh 各自用不同正则数，口径漂移：
#   - 有的按"标题行"数(准)、有的按"全文出现次数"数(虚高) → 两个口径比大小恒误报
#   - 有的正则漏了阿拉伯数字("问题1"数不出来) → 漏问不告警
# 统一口径：只数"顶层标题行"里的子问题声明，同时支持 中文数字 / 阿拉伯数字 / Problem N。
#
# 用法：
#   bash _utils/count_subproblems.sh <file.md>
# 输出：一个整数（该文件里声明的子问题数，去重后）。文件不存在则输出 0。
#
# 判定规则（一行命中一个子问题，按编号去重）：
#   ^## 问题一 / ^### 问题二 / ^## 问题1 / ^## Problem 1 / ^## Question 3 等
#   —— 必须是 Markdown 标题行(以 # 开头)，避免正文里"针对问题一……"被误计。

f="$1"
if [ -z "$f" ] || [ ! -f "$f" ]; then
    echo 0
    exit 0
fi

# ⛔ 强制 UTF-8 locale：很多运行环境 LANG 为空，grep/sed 会按单字节处理 UTF-8 中文，
# 导致"问题一/问题二/问题三"的中文数字被截成相同字节前缀而误判去重。设 UTF-8 后按字符处理。
export LC_ALL=C.UTF-8 2>/dev/null || true
export LANG=C.UTF-8 2>/dev/null || true

# 判定规则：只看 Markdown 标题行(以 # 开头)里声明的子问题，避免正文"针对问题一…"被误计。
# 不用"中文数字字符类"(按字节易错)，改为匹配「标题行中出现 问题/Problem/Question + 紧跟的编号」，
# 用「整个标题行去重」来数唯一子问题数——同一子问题即使拆成多个小节标题也只算一次。
#
# 具体：抓取形如  ^##[#] ... 问题<编号>  的标题行，提取到"问题X"这个 token 后去重计数。
# - 中文："问题" 后跟任意一个中文数字或阿拉伯数字
# - 英文：Problem / Question 后跟数字
count=$(awk '
    # 只处理标题行(以一个或多个 # 开头)
    /^#{1,4}[[:space:]]/ {
        line=$0
        # 匹配中文"问题X"：问题后面跟一个字符(中文数字或阿拉伯数字)
        if (match(line, /问题[一二三四五六七八九十0-9]+/)) {
            key=substr(line, RSTART, RLENGTH)
            seen[key]=1
        }
        # 匹配英文 Problem N / Question N
        else if (match(tolower(line), /(problem|question)[ ]*[0-9]+/)) {
            key=substr(tolower(line), RSTART, RLENGTH)
            gsub(/[ ]+/, "", key)
            seen[key]=1
        }
    }
    END { print length(seen) }
' "$f" 2>/dev/null)

echo "${count:-0}"

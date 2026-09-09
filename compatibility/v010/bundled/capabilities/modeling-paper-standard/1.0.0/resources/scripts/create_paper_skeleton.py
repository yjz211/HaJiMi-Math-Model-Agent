"""Create an empty, reusable HaJiMi manuscript skeleton; never overwrite a paper."""
import argparse
from pathlib import Path

NUMERALS = '一二三四五六七八九十'
PREAMBLE = r'''\documentclass[12pt,a4paper,fontset=fandol]{ctexart}
\usepackage[margin=25mm,headsep=10mm,footskip=18mm]{geometry}
\usepackage{amsmath,amssymb,bm,booktabs,longtable,tabularx,graphicx,xcolor,caption,fancyhdr,hyperref}
\hypersetup{hidelinks}
\captionsetup{font=small,labelfont=bf,labelsep=space}
\graphicspath{{figures/}}
\setlength{\parindent}{2em}
\setlength{\parskip}{0pt}
\setlength{\emergencystretch}{2em}
\ctexset{section={format=\centering\heiti\bfseries\fontsize{14pt}{18pt}\selectfont},subsection={format=\songti\bfseries\fontsize{12pt}{16pt}\selectfont},subsubsection={format=\songti\bfseries\fontsize{12pt}{16pt}\selectfont}}
\pagestyle{fancy}\fancyhf{}\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0pt}
\newcommand{\paperkey}[1]{{\heiti\bfseries #1}}
\renewcommand{\refname}{}
\begin{document}
'''

def escape_tex(value):
    mapping = {'\\': r'\textbackslash{}', '&': r'\&', '%': r'\%', '$': r'\$', '#': r'\#', '_': r'\_', '{': r'\{', '}': r'\}', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}'}
    return ''.join(mapping.get(char, char) for char in value)

def create(output, title, questions, data_route=False, optimization_questions=()):
    if not 1 <= questions <= 10 or any(q < 1 or q > questions for q in optimization_questions):
        raise ValueError('Question numbers must be within the declared question count (1–10).')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'sections').mkdir()
    (output / 'figures').mkdir()
    def section_file(name, content=''):
        (output / 'sections' / f'{name}.tex').write_text(content + '\n', encoding='utf-8')
        return f'\\input{{sections/{name}}}\n'
    main = PREAMBLE + '{\\centering\\songti\\bfseries\\fontsize{16pt}{20pt}\\selectfont ' + escape_tex(title) + '\\par}\n'
    main += '\\section*{摘要}\n' + section_file('abstract', '% 使用 \\paperkey{针对问题一，} 等逐问起段，并加粗模型名与答案关键词。')
    main += '\\noindent\\paperkey{关键词：} ' + section_file('keywords', '% 关键词只以空格或 \\quad 分隔。')
    main += '\\section*{一、问题重述}\n' + section_file('problem', '\\subsection*{1.1 问题背景}\n\n\\subsection*{1.2 问题提出}\n')
    main += '\\section*{二、问题分析}\n' + section_file('analysis', '\n'.join(f'\\subsection*{{2.{i} 问题{NUMERALS[i-1]}的分析}}\n' for i in range(1, questions+1)))
    main += '\\section*{三、模型假设}\n' + section_file('assumptions')
    main += '\\section*{四、符号说明}\n' + section_file('symbols', '% 建立符号、含义、单位三线表。')
    chapter = 5
    if data_route:
        main += '\\section*{五、数据处理与概览}\n' + section_file('data')
        chapter = 6
    main += f'\\section*{{{NUMERALS[chapter-1]}、模型建立与求解}}\n'
    for i in range(1, questions+1):
        content = f'\\subsection*{{{chapter}.{i} 问题{NUMERALS[i-1]}模型的建立与求解}}\n'
        if i in optimization_questions:
            content += f'\\subsubsection*{{{chapter}.{i}.1 模型建立}}\n'
            for step, name in enumerate(['决策变量', '目标函数', '约束条件', '模型汇总'], 1):
                content += f'\\par\\noindent\\paperkey{{Step {step} {name}}}\\par\n\n'
            content += f'\\subsubsection*{{{chapter}.{i}.2 模型求解}}\n\n\\subsubsection*{{{chapter}.{i}.3 结果分析}}\n'
        else:
            content += '% 按本问实际方法展开到三级标题；数据类方法之后紧跟对应结果。'
        main += section_file(f'model_q{i}', content)
    for offset, title, name in [(1, '模型检验', 'validation'), (2, '模型优缺点评价', 'evaluation'), (3, '参考文献', 'references')]:
        content = '\n'.join(f'\\subsection*{{{chapter+offset}.{i} 模型的{label}}}\n' for i, label in enumerate(['优点', '缺点', '改进'], 1)) if name == 'evaluation' else ''
        main += f'\\section*{{{NUMERALS[chapter+offset-1]}、{title}}}\n' + section_file(name, content)
    main += '\\end{document}\n'
    (output / 'main.tex').write_text(main, encoding='utf-8')
    return output / 'main.tex'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--title', required=True)
    parser.add_argument('--questions', type=int, choices=range(1, 11), required=True)
    parser.add_argument('--paper-type', choices=['standard', 'data-analysis'], default='standard')
    parser.add_argument('--optimization-question', type=int, action='append', default=[])
    args = parser.parse_args()
    print(create(args.output, args.title, args.questions, args.paper_type == 'data-analysis', args.optimization_question))

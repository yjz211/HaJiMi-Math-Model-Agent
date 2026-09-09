"""Check the explicit title/abstract/heading typography contract in actual PDFs."""
import argparse
import re
import pymupdf

def audit(path):
    failures = []
    checked = []
    found_abstract = False
    title_found = False
    body_found = False
    def check(spans, role, size, family):
        for span in spans:
            if not re.search(r'[\u4e00-\u9fff]', span['text']):
                continue
            # LaTeX points are 1/72.27 inch; PDF points are 1/72 inch.
            actual = span['size'] * 72.27 / 72
            if abs(actual - size) > 0.35:
                failures.append(f'{role}字号 {actual:.2f} pt，应为 {size} pt：{span["text"][:36]}')
            if family and not re.search(family, span['font'], re.I):
                failures.append(f'{role}字体 {span["font"]} 与规定不符：{span["text"][:36]}')
        checked.append(role)
    song = r'Song|SimSun|NSimSun|NotoSerif|SourceHanSerif'
    hei = r'Hei|SimHei|NotoSans|SourceHanSans'
    with pymupdf.open(path) as doc:
        for page_no, page in enumerate(doc, 1):
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    spans = line['spans']
                    raw_text = ''.join(s['text'] for s in spans)
                    text = re.sub(r'\s+', '', raw_text)
                    if text == '摘要':
                        found_abstract = True
                        check(spans, '摘要标题', 14, hei)
                    elif re.match(r'^[一二三四五六七八九十]+、', text):
                        check(spans, f'第{page_no}页一级标题', 14, hei)
                    elif re.match(r'^\d+\.\d{1,2}(?:\.\d{1,2})?\s+[\u4e00-\u9fff]', raw_text):
                        check(spans, f'第{page_no}页小节标题', 12, song)
                    elif page_no == 1 and not found_abstract and len(re.findall(r'[\u4e00-\u9fff]', text)) >= 4 and line['bbox'][1] > 60:
                        check(spans, '论文题目', 16, song)
                        title_found = True
                    elif page_no == 1 and found_abstract and not body_found and len(re.findall(r'[\u4e00-\u9fff]', text)) >= 15:
                        check(spans, '摘要正文', 12, song)
                        body_found = True
    if not found_abstract: failures.append('未找到可识别的摘要标题')
    if not title_found: failures.append('未找到可识别的论文题目')
    return checked, failures

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf')
    args = parser.parse_args()
    checked, failures = audit(args.pdf)
    for item in dict.fromkeys(failures): print('FAIL: ' + item)
    print(f'PDF_TYPOGRAPHY: {"FAIL" if failures else "PASS"}; checked={len(checked)}')
    raise SystemExit(1 if failures else 0)

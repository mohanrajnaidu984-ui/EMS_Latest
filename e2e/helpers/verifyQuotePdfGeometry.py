import json, sys, unicodedata
import pdfplumber

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).lower() if c.isalnum())

expected = json.load(open(sys.argv[2], encoding='utf-8'))
checks = []
with pdfplumber.open(sys.argv[1]) as pdf:
    for index, units in enumerate(expected):
        page = pdf.pages[index]
        for unit in units:
            needle = normalize(unit['text'])
            if not needle:
                continue
            x0, y0, x1, y1 = unit['box']
            box = (max(0, x0*page.width-3), max(0, y0*page.height-3), min(page.width, x1*page.width+3), min(page.height, y1*page.height+3))
            actual = page.crop(box).extract_text(use_text_flow=True) or ''
            checks.append(dict(page=index+1, unit=unit['id'], matches=needle in normalize(actual), expected=unit['text'], actual=actual))
result = dict(passed=all(c['matches'] for c in checks), checks=checks)
json.dump(result, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(json.dumps(dict(passed=result['passed'], checks=len(checks), failures=sum(not c['matches'] for c in checks))))

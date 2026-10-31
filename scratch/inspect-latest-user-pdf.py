from pypdf import PdfReader
from pathlib import Path
import json
p=Path(r'C:\Users\mohan.naidu\Downloads\Quote_Draft - 2026-10-31T114729.245.pdf')
r=PdfReader(p);out=[page.extract_text() or '' for page in r.pages]
Path('scratch/user-draft-114729-text.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print('Pages:',len(out))
for i,t in enumerate(out):
 if '5.01' in t:
  start=t.find('5.01');print('5.01 page:',i+1,repr(t[start:start+400]))
print('Last-page chars:',len(out[-1]))

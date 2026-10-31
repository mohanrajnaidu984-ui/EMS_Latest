from pypdf import PdfReader
from pathlib import Path
p=Path('e2e/artifacts/clause-mutations-1515/additional-preceding-paragraphs.pdf')
r=PdfReader(p)
for i,page in enumerate(r.pages):
 text=page.extract_text() or ''
 print(i+1,len(text),repr(text[:115]),repr(text[-100:]))

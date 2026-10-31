from pypdf import PdfReader
from pathlib import Path
import json
p=Path(r'C:\Users\mohan.naidu\Downloads\Quote_Draft - 2026-10-31T112749.080.pdf')
r=PdfReader(p)
print('PAGES',len(r.pages))
for i,p in enumerate(r.pages):
 t=p.extract_text() or ''
 print('\nPAGE',i+1,'CHARS',len(t),'\n',t[:450],'\nLAST:',t[-380:])
Path('scratch/user-draft-1515-text.json').write_text(json.dumps([p.extract_text() for p in r.pages],indent=2),encoding='utf8')

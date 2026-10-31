from bs4 import BeautifulSoup
from pathlib import Path
s=BeautifulSoup(Path('e2e/artifacts/current-draft-1515/draft-before.txt').read_text(encoding='utf8'),'html.parser')
for i,p in enumerate(s.select('.quote-a4-sheet')):
 print('PAGE',i+1,[(h.get_text(' ',strip=True)) for h in p.select('.quote-clause-heading-panel')])
 for b in p.select('.quote-clause-block'):
  if 'Assumptions-' in b.get_text() or 'General Conditions' in b.get_text():
   print(str(b)[:1600])

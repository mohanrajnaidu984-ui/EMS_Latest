from PIL import Image
from pypdf import PdfReader
from pathlib import Path
p=Path('e2e/artifacts/clause-mutations-1515/fixed-pricing-page-3.png')
im=Image.open(p).convert('RGB'); box=im.crop((500,40,720,110));print('Header dark pixels',sum(min(c)<160 for c in box.getdata()))
r=PdfReader('e2e/artifacts/clause-mutations-1515/pricing.pdf');print('Pages',len(r.pages),'page 3 images',len(r.pages[2].images));print('Last page text',len(r.pages[-1].extract_text() or ''))

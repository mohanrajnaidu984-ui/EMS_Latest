from pathlib import Path
import json, subprocess
from PIL import Image, ImageDraw
from pypdf import PdfReader
root=Path('e2e/artifacts/general-pagination')
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
reports=[]
for folder in sorted(root.glob('quote-*')):
    if not (folder/'report.json').exists(): continue
    report=json.loads((folder/'report.json').read_text(encoding='utf-8'))
    if not report.get('passed'): continue
    reader=PdfReader(folder/'quote.pdf')
    for page in sorted(set([2,len(reader.pages)])):
        subprocess.run([str(poppler),'-f',str(page),'-l',str(page),'-scale-to','900','-png','-singlefile',str(folder/'quote.pdf'),str(folder/f'render-page-{page}')],check=True,capture_output=True)
    reports.append(dict(id=report['id'],division=report['division'],variant=folder.name,previewPages=report['previewPages'],pdfPages=report['pdfPages'],positionChecks=len(report['geometry']['checks']),passed=True,lastPageTextChars=len(reader.pages[-1].extract_text() or ''),pageSizes=[list(map(float,p.mediabox[2:])) for p in reader.pages]))
canvas=Image.new('RGB',(1800,((len(reports)+4)//5)*550),'#ddd');draw=ImageDraw.Draw(canvas)
for i,r in enumerate(reports):
    image=Image.open(root/r['variant']/'render-page-2.png');image.thumbnail((350,510))
    x=(i%5)*360;y=(i//5)*550
    canvas.paste(image,(x,y+30));draw.text((x+4,y+5),f"{r['id']} {r['division'][:28]}",fill='black')
canvas.save(root/'general-contact.png')
(root/'summary.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
print(json.dumps(dict(quotes=len(reports),pages=sum(r['pdfPages'] for r in reports),positionChecks=sum(r['positionChecks'] for r in reports))))

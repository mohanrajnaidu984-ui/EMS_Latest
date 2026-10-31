from pathlib import Path
from PIL import Image,ImageDraw
from pypdf import PdfReader
import json
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else 'e2e/artifacts/clause-mutations-1515')
runs=json.loads((root/'results.json').read_text(encoding='utf8'))['results']
report=[]
for run in runs:
    reader=PdfReader(root/(run['label']+'.pdf')); texts=[p.extract_text() or '' for p in reader.pages]
    expected=sum(b.count('☑') for sheet in run['preview'] for b in sheet['blocks'])
    actual=sum(text.count('☑') for text in texts)
    assert expected==actual,(run['label'],expected,actual)
    assert len(texts)==run['pages']
    assert len(texts[-1].strip())>100
    metrics=json.loads((root/(run['label']+'-live-metrics.json')).read_text(encoding='utf8'))
    starts=[]
    for sheet in metrics[1:]:
        visible=[unit for unit in sheet['units'] if unit['text'].strip()]
        assert visible, (run['label'],sheet['page'],'blank continuation')
        first=min(unit['top'] for unit in visible)
        assert first<130,(run['label'],sheet['page'],first,'carried blank band')
        starts.append({'page':sheet['page'],'firstContentTopPx':round(first,2)})
    report.append({'variant':run['label'],'previewPages':run['pages'],'pdfPages':len(texts),'checkmarks':actual,'lastPageTextChars':len(texts[-1]),'blankLastPage':False,'pageStarts':starts})
canvas=Image.new('RGB',(1600,1740),'#d0d0d0');draw=ImageDraw.Draw(canvas)
logos=[]
rendered_count=len(PdfReader(root/'additional-preceding-paragraphs.pdf').pages)
for index in range(1,rendered_count+1):
 image=Image.open(root/f'final-page-{index}.png').convert('RGB')
 dark=sum(min(p)<160 for p in image.crop((500,40,720,110)).get_flattened_data())
 assert dark>200,(index,dark)
 logos.append({'page':index,'headerDarkPixels':dark})
 image.thumbnail((390,550));x=((index-1)%4)*400;y=((index-1)//4)*580
 canvas.paste(image,(x,y+22));draw.text((x+10,y+5),f'Page {index}',fill='black')
canvas.save(root/'final-contact.png')
(root/'pdf-validation.json').write_text(json.dumps({'variants':report,'logos':logos},indent=2),encoding='utf8')
print(json.dumps(report,indent=2))

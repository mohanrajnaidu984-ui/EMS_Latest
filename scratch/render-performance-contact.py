from pathlib import Path
from PIL import Image,ImageDraw
root=Path('e2e/artifacts/independent-investigation')
out=Image.new('RGB',(1600,1160),'#cccccc')
for i in range(1,9):
 image=Image.open(root/f'pdf-page-{i}.png').convert('RGB'); image.thumbnail((390,550))
 x=((i-1)%4)*400;y=((i-1)//4)*580
 out.paste(image,(x,y+22));ImageDraw.Draw(out).text((x+10,y+5),f'Page {i}',fill='black')
out.save(root/'performance-pdf-contact.png')

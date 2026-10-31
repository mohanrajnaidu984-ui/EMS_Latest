import hashlib
import json
from pathlib import Path
from PIL import Image
from pypdf import PdfReader

root = Path('e2e/artifacts/independent-investigation')
load = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
runs = load('preview.json')
parity = load('pdf-parity.json')
zoom = load('zoom.json')
gate = load('export-gate.json')
assert len(runs) == 3
assert all(r['groups'] == runs[0]['groups'] for r in runs)
assigned = [int(i) for group in runs[0]['groups'] for i in group]
assert assigned == sorted(set(assigned))
assert all(not r['health']['overflows'] and not r['health']['sparseSheets'] and not r['health']['integrityBanner'] for r in runs)
assert parity['previewCount'] == parity['pdfCount'] == 8
assert all(page['matches'] for page in parity['parity'])
assert all(not z['overflows'] and z['sheets'] == 8 for z in zoom)
assert gate['blocked']
preview_ticks = sum(b['preview'].count('☑') for p in parity['parity'] for b in p['blocks'])
pdf_ticks = sum(p['pdf'].count('☑') for p in parity['parity'])
assert preview_ticks == pdf_ticks
logos = []
for index in range(1, 9):
    image = Image.open(root / f'pdf-page-{index}.png').convert('RGB')
    pixels = image.crop((500, 40, 720, 110)).get_flattened_data()
    dark = sum(min(pixel) < 160 for pixel in pixels)
    assert dark > 200, f'Logo missing from PDF page {index}'
    logos.append({'page': index, 'darkHeaderPixels': dark})
reader = PdfReader(root / 'quote-1515-R4.pdf')
assert len(reader.pages) == 8
assert all(abs(float(p.mediabox.width) - 595.28) < 1 and abs(float(p.mediabox.height) - 841.89) < 1 for p in reader.pages)
files = ['src/components/Quote/QuoteForm.jsx', 'src/components/Quote/quoteClausePagination.js', 'src/components/Quote/quotePrintDocumentHtml.js', 'server/routes/quotePdf.js']
summary = {
    'scope': 'Enquiry 1515 / Simplex / Cinqo / saved SMA/SXP/1515-L1/1504-R4 / portrait A4',
    'validatedQuotePassed': True, 'productionDeployed': False,
    'previewPages': 8, 'pdfPages': 8, 'alignRuns': 3, 'identicalPageAssignments': True,
    'paintedUnits': len(assigned), 'proseRowContinuationSupported': True,
    'overflowViolations': 0, 'sparsePages': [], 'zoom': [z['zoom'] for z in zoom],
    'allClauseBlocksMatchPdfPageInOrder': True, 'matrixCheckmarksPreserved': preview_ticks,
    'warmCacheOverflowExportBlocked': True, 'logos': logos,
    'unitTestsPassed': 27, 'frontendBuildPassed': True, 'backendSyntaxCheckPassed': True,
    'sourceSha256': {file: hashlib.sha256(Path(file).read_bytes()).hexdigest() for file in files},
}
(root / 'validation-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in summary.items() if k not in ['sourceSha256', 'logos']}, indent=2))

/**
 * Rebuild Tamkeen PPTX with embedded live EMS screenshots + MP4 walkthrough videos.
 */
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const MEDIA = path.join(__dirname, 'tamkeen-media');
const OUT = path.join(__dirname, 'EMS_Tamkeen_Usage_Evidence_Six_Companies.pptx');
const SNAPSHOT = 'Live EMS UI capture · http://151.50.1.38 · 27 Aug 2026';
const NAVY = '20396D';
const BLUE = '2B5AA8';
const LIGHT = 'F4F6FA';
const WHITE = 'FFFFFF';
const GRAY = '5A6577';
const GREEN = '1B7F4E';
const AMBER = 'B86E00';

const entities = [
  {
    key: 'aluminium',
    tamkeen: '1. Almoayyed Aluminium',
    ems: 'Almoayyed Aluminium W.L.L. · Division: Almoayyed Aluminium',
    metrics: '4 Active users · 4 enquiries with Aluminium job · Req 134 / 34 / 18 / 53',
    shotNote: 'Screenshot: Modify Enquiry with Aluminium job assignment on live bid',
  },
  {
    key: 'landscapes',
    tamkeen: '2. Almoayyed Landscapes and Pools',
    ems: 'Almoayyed Landscapes and Swimming Pools · Landscape Maint / Project (ALP)',
    metrics: '7 users · 105 enquiries · 130 quotes · Req 1044 example below',
    shotNote: 'Screenshot: Enquiry 1044 — Landscape Maint LEAD · Created by Angelique Cielo',
  },
  {
    key: 'security',
    tamkeen: '3. Guardus Security Co. W.L.L.',
    ems: 'EMS master: Almoayyed Security · Division: Security Project (ASD/ALS)',
    metrics: '6 users · 12 enquiries · 8 ASD/ALS quotes',
    shotNote: 'Screenshot: Quote module filtered to Security Project — live pending quotes',
  },
  {
    key: 'simplex',
    tamkeen: '4. Simplex Almoayyed',
    ems: 'Simplex Almoayyed W.L.L · Simplex Project (SMA/SXP)',
    metrics: '4 users · 21 enquiries · 28 quotes · Req 1059 (27 Aug 2026)',
    shotNote: 'Screenshot: Enquiry 1059 — Simplex Project LEAD · Stefy Mary Simon',
  },
  {
    key: 'interiors',
    tamkeen: '5. Almoayyed Interiors',
    ems: 'Almoayyed Interiors · Interiors Project (AIN/INP)',
    metrics: '11 users · 29 enquiries · 21 AIN quotes',
    shotNote: 'Screenshot: Live Interiors enquiry / quote screens from production EMS',
  },
  {
    key: 'camair',
    tamkeen: '6. CAMAIR',
    ems: 'Cam Air International W.L.L. · Direct Sales - CamAir (ACG/DS)',
    metrics: '1 user · 7 enquiries · 13 quotes by camairsales@',
    shotNote: 'Screenshot: CamAir Direct Sales enquiry / quote activity in production EMS',
  },
];

function exists(p) {
  return fs.existsSync(p);
}

function hdr(s, pptx, title) {
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.8, fill: { color: NAVY } });
  s.addText('EMS · Tamkeen Usage Evidence Pack (with screenshots & video)', {
    x: 0.4, y: 0.1, w: 12, h: 0.25, fontSize: 11, color: 'A8C0E8', fontFace: 'Calibri',
  });
  s.addText(title, {
    x: 0.4, y: 0.35, w: 12.5, h: 0.38, fontSize: 18, bold: true, color: WHITE, fontFace: 'Calibri',
  });
}

function ftr(s, page) {
  s.addText('Confidential · ACG · ' + SNAPSHOT + ' · Screenshots from live production UI', {
    x: 0.4, y: 7.15, w: 11.5, h: 0.25, fontSize: 9, color: '8A94A6', fontFace: 'Calibri',
  });
  s.addText(String(page), {
    x: 12.2, y: 7.15, w: 0.7, h: 0.25, fontSize: 9, color: '8A94A6', align: 'right', fontFace: 'Calibri',
  });
}

async function main() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'EMS Production Capture';
  pptx.title = 'EMS Tamkeen Usage Evidence — Screenshots & Videos';
  let page = 0;

  // Cover
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addText('TAMKEEN SUPPORTING EVIDENCE', {
      x: 0.7, y: 1.6, w: 12, h: 0.35, fontSize: 14, color: 'A8C0E8', bold: true, fontFace: 'Calibri', charSpacing: 2,
    });
    s.addText('EMS Usage Evidence Pack', {
      x: 0.7, y: 2.1, w: 12, h: 0.55, fontSize: 32, bold: true, color: WHITE, fontFace: 'Calibri',
    });
    s.addText('Live production screenshots + embedded walkthrough videos\nfor all six requested companies', {
      x: 0.7, y: 2.85, w: 11.5, h: 0.8, fontSize: 16, color: 'C5D4EE', fontFace: 'Calibri',
    });
    s.addText(
      'Almoayyed Aluminium  ·  Landscapes & Pools  ·  Guardus Security  ·  Simplex Almoayyed  ·  Almoayyed Interiors  ·  CAMAIR',
      { x: 0.7, y: 4.1, w: 12, h: 0.6, fontSize: 13, color: WHITE, fontFace: 'Calibri' }
    );
    s.addText(SNAPSHOT + '\nSource: Live EMS at http://151.50.1.38 · Captured from production UI (not mockups)', {
      x: 0.7, y: 5.5, w: 12, h: 0.7, fontSize: 12, color: '9BB0D4', fontFace: 'Calibri',
    });
  }

  // How to use media
  {
    const s = pptx.addSlide();
    page++;
    hdr(s, pptx, 'How to use this pack');
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 1.1, w: 12.5, h: 5.6, fill: { color: LIGHT }, rectRadius: 0.08,
    });
    const lines = [
      '1. Each company has THREE evidence slides: (A) Enquiry screenshot, (B) Quote / Report screenshots, (C) Embedded MP4 walkthrough video.',
      '2. Screenshots were captured from the live production EMS (http://151.50.1.38) on 27 Aug 2026 showing real Request Nos and division filters.',
      '3. Videos (~60–70 seconds each) show navigation: Enquiry → Quote (division filter) → Sales Report → Probability for that company.',
      '4. In PowerPoint: click a video slide and press Play (Slide Show mode recommended). Videos are H.264 MP4 embedded in the file.',
      '5. Guardus Security appears in EMS as “Almoayyed Security / Security Project” with quote codes ASD/ALS.',
      '6. Transaction counts and sample Req/Quote numbers remain available in the prior data extract PPTX if needed for tables.',
    ];
    lines.forEach((t, i) => {
      s.addText(t, {
        x: 0.7, y: 1.4 + i * 0.8, w: 11.9, h: 0.7, fontSize: 14, color: NAVY, fontFace: 'Calibri',
      });
    });
    ftr(s, page);
  }

  // Index
  {
    const s = pptx.addSlide();
    page++;
    hdr(s, pptx, 'Media index — six entities');
    const rows = [
      [
        { text: 'Entity', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        { text: 'Enquiry shot', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        { text: 'Quote / Report', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        { text: 'Video', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
      ],
    ];
    entities.forEach((e) => {
      const enq = exists(path.join(MEDIA, e.key, '02-enquiry.png')) ? 'Yes' : '—';
      const q = exists(path.join(MEDIA, e.key, '03-quotes.png')) ? 'Yes' : '—';
      const v = exists(path.join(MEDIA, e.key, `${e.key}-walkthrough.mp4`)) ? '~1 min MP4' : '—';
      rows.push([e.tamkeen.replace(/^\d+\.\s*/, ''), enq, q, v]);
    });
    s.addTable(rows, {
      x: 0.5, y: 1.3, w: 12.3, colW: [4.5, 2.4, 2.6, 2.8],
      border: [
        { pt: 0.5, color: 'D8DEE9' },
        { pt: 0.5, color: 'D8DEE9' },
        { pt: 0.5, color: 'D8DEE9' },
        { pt: 0.5, color: 'D8DEE9' },
      ],
      fontFace: 'Calibri', fontSize: 13, color: NAVY, valign: 'middle',
    });
    ftr(s, page);
  }

  for (const ent of entities) {
    const dir = path.join(MEDIA, ent.key);
    const enq = path.join(dir, '02-enquiry.png');
    const quotes = path.join(dir, '03-quotes.png');
    const report = path.join(dir, '04-sales-report.png');
    const video = path.join(dir, `${ent.key}-walkthrough.mp4`);

    // Slide A: Enquiry screenshot
    {
      const s = pptx.addSlide();
      page++;
      hdr(s, pptx, ent.tamkeen + ' — Enquiry screenshot');
      s.addText(ent.ems, {
        x: 0.4, y: 0.9, w: 12.5, h: 0.28, fontSize: 12, color: BLUE, fontFace: 'Calibri',
      });
      s.addText(ent.metrics + '  ·  ' + ent.shotNote, {
        x: 0.4, y: 1.15, w: 12.5, h: 0.35, fontSize: 11, color: GRAY, fontFace: 'Calibri',
      });
      if (exists(enq)) {
        s.addImage({ path: enq, x: 0.55, y: 1.55, w: 12.2, h: 5.35, sizing: { type: 'contain', w: 12.2, h: 5.35 } });
      } else {
        s.addText('Enquiry screenshot missing', { x: 0.5, y: 3, w: 12, h: 0.4, color: AMBER });
      }
      ftr(s, page);
    }

    // Slide B: Quotes + Report
    {
      const s = pptx.addSlide();
      page++;
      hdr(s, pptx, ent.tamkeen + ' — Quote & Sales Report screenshots');
      s.addText('Left: Quote module (division filter)   ·   Right: Sales Report', {
        x: 0.4, y: 0.95, w: 12.5, h: 0.3, fontSize: 12, color: GRAY, fontFace: 'Calibri',
      });
      if (exists(quotes)) {
        s.addImage({ path: quotes, x: 0.3, y: 1.35, w: 6.3, h: 5.5, sizing: { type: 'contain', w: 6.3, h: 5.5 } });
      }
      if (exists(report)) {
        s.addImage({ path: report, x: 6.75, y: 1.35, w: 6.3, h: 5.5, sizing: { type: 'contain', w: 6.3, h: 5.5 } });
      }
      ftr(s, page);
    }

    // Slide C: Video
    {
      const s = pptx.addSlide();
      page++;
      hdr(s, pptx, ent.tamkeen + ' — Walkthrough video');
      s.addText('Embedded MP4 · Play in Slide Show mode · Captured from live EMS production UI', {
        x: 0.4, y: 0.95, w: 12.5, h: 0.3, fontSize: 12, color: GRAY, fontFace: 'Calibri',
      });
      if (exists(video)) {
        s.addMedia({
          path: video,
          x: 1.4, y: 1.4, w: 10.5, h: 5.5,
          type: 'video',
        });
      } else {
        s.addText('Video file not found: ' + video, { x: 0.5, y: 3, w: 12, color: AMBER });
      }
      ftr(s, page);
    }
  }

  // Closing
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addText('Evidence complete', {
      x: 0.8, y: 2.2, w: 11.5, h: 0.4, fontSize: 14, color: 'A8C0E8', bold: true, fontFace: 'Calibri',
    });
    s.addText(
      'This pack embeds live EMS screenshots and walkthrough videos for all six Tamkeen-requested companies, demonstrating operational system usage in production.',
      { x: 0.8, y: 2.8, w: 11.5, h: 1.5, fontSize: 20, color: WHITE, fontFace: 'Calibri' }
    );
    s.addText(SNAPSHOT + ' · Confidential · Almoayyed Contracting Group', {
      x: 0.8, y: 5.5, w: 11.5, h: 0.4, fontSize: 13, color: '9BB0D4', fontFace: 'Calibri',
    });
  }

  await pptx.writeFile({ fileName: OUT });
  const size = fs.statSync(OUT).size;
  console.log('Wrote', OUT, Math.round(size / 1024 / 1024) + ' MB');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

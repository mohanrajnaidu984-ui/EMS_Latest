/**
 * Generate EMS Investor Presentation PowerPoint
 * Run: node generate-investor-pptx.js
 */
const PptxGenJS = require('pptxgenjs');
const path = require('path');

const SNAPSHOT = 'Live EMS_DB · 26 Aug 2026';
const OUT = path.join(__dirname, 'EMS_Investor_Presentation.pptx');

const NAVY = '20396D';
const BLUE = '2B5AA8';
const LIGHT = 'F4F6FA';
const WHITE = 'FFFFFF';
const GRAY = '5A6577';
const GREEN = '1B7F4E';
const AMBER = 'B86E00';

async function main() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Mohan Naidu';
  pptx.title = 'EMS Investor Presentation — Almoayyed Contracting Group';
  pptx.subject = 'Enquiry Management System — Investor Briefing';

  // ——— SLIDE 1: Title ———
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 6.6, w: 13.333, h: 0.9, fill: { color: '162A52' } });
    s.addText('INVESTOR BRIEFING', {
      x: 0.7, y: 1.6, w: 12, h: 0.35,
      fontSize: 14, fontFace: 'Calibri', color: 'A8C0E8', bold: true, charSpacing: 3,
    });
    s.addText('EMS — Enquiry Management System', {
      x: 0.7, y: 2.1, w: 12, h: 0.7,
      fontSize: 36, fontFace: 'Calibri', color: WHITE, bold: true,
    });
    s.addText('Enterprise sales operating system for Almoayyed Contracting Group\nand sister companies — live across Bahrain multi-division operations.', {
      x: 0.7, y: 3.0, w: 11, h: 0.8,
      fontSize: 18, fontFace: 'Calibri', color: 'C5D4EE',
    });
    s.addText([
      { text: 'Metrics: ', options: { bold: true } },
      { text: SNAPSHOT + '  ·  Developed by Mohan Naidu  ·  Confidential' },
    ], {
      x: 0.7, y: 6.85, w: 12, h: 0.35,
      fontSize: 12, fontFace: 'Calibri', color: '9BB0D4',
    });
  }

  // ——— SLIDE 2: Thesis ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Investment Thesis');
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y: 1.3, w: 12.3, h: 1.6, fill: { color: 'E8EEF8' }, rectRadius: 0.08,
    });
    s.addText(
      'EMS is already live across 20 group company entities and 38 divisions, with 144 active users managing 1,031+ enquiries and 1,135 formal quotes — proving product–market fit inside a complex multi-division contracting organisation.',
      { x: 0.75, y: 1.5, w: 11.8, h: 1.3, fontSize: 16, fontFace: 'Calibri', color: NAVY, valign: 'middle' }
    );

    const cards = [
      { t: 'Proven adoption', d: '144 active users across HVAC, civil, interiors, IFM, scaffolding, security & more' },
      { t: 'Embedded process IP', d: 'Division codes, approval hierarchies, quote formats — hard to replace with generic CRM' },
      { t: 'Measurable throughput', d: '1,000+ enquiries, 1,100+ quotes, 11k+ workflow notifications' },
    ];
    cards.forEach((c, i) => {
      const x = 0.5 + i * 4.2;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 3.3, w: 4.0, h: 2.8, fill: { color: WHITE },
        shadow: { type: 'outer', color: '000000', blur: 6, opacity: 0.08, offset: 2 },
        line: { color: 'D8DEE9', width: 1 }, rectRadius: 0.08,
      });
      s.addShape(pptx.shapes.RECTANGLE, { x, y: 3.3, w: 0.12, h: 2.8, fill: { color: BLUE } });
      s.addText(c.t, { x: x + 0.35, y: 3.55, w: 3.4, h: 0.5, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri' });
      s.addText(c.d, { x: x + 0.35, y: 4.2, w: 3.4, h: 1.5, fontSize: 14, color: GRAY, fontFace: 'Calibri' });
    });
    addFooter(s, pptx, 2);
  }

  // ——— SLIDE 3: Headline metrics ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Live Scale at a Glance');
    const metrics = [
      { v: '144', l: 'Active Users', c: GREEN },
      { v: '20', l: 'Company Entities', c: BLUE },
      { v: '38', l: 'Divisions / Services', c: BLUE },
      { v: '36', l: 'User-Linked Divisions', c: NAVY },
      { v: '1,031', l: 'Enquiries Logged', c: NAVY },
      { v: '1,135', l: 'Formal Quotes', c: NAVY },
      { v: '1,275', l: 'Customer Masters', c: NAVY },
      { v: '3,409', l: 'Contact Masters', c: NAVY },
    ];
    metrics.forEach((m, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 0.5 + col * 3.15;
      const y = 1.4 + row * 2.4;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 3.0, h: 2.1, fill: { color: LIGHT }, rectRadius: 0.08,
      });
      s.addText(m.v, {
        x, y: y + 0.4, w: 3.0, h: 0.8,
        fontSize: 36, bold: true, color: m.c, fontFace: 'Calibri', align: 'center',
      });
      s.addText(m.l, {
        x: x + 0.15, y: y + 1.3, w: 2.7, h: 0.5,
        fontSize: 13, color: GRAY, fontFace: 'Calibri', align: 'center',
      });
    });
    addFooter(s, pptx, 3);
  }

  // ——— SLIDE 4: What EMS is ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'What EMS Is');
    s.addText('Product definition', {
      x: 0.5, y: 1.25, w: 6, h: 0.35, fontSize: 14, bold: true, color: BLUE, fontFace: 'Calibri',
    });
    s.addText(
      'EMS replaces fragmented spreadsheets, email threads, and ad-hoc Word/PDF quotes with one division-scoped record for every opportunity across Almoayyed Contracting Group and sister companies.\n\nIt is a single-tenant, multi-division enterprise platform hosted on company Windows Server / IIS with Microsoft SQL Server — not a public SaaS product. Data residency stays on-premise (Asia/Bahrain).',
      { x: 0.5, y: 1.65, w: 6.2, h: 3.2, fontSize: 14, color: GRAY, fontFace: 'Calibri' }
    );

    const tags = ['On-premise', 'Role-based access', 'Outlook / SMTP', 'Protected PDF', 'Digital approvals'];
    tags.forEach((t, i) => {
      const x = 0.5 + (i % 3) * 2.1;
      const y = 5.0 + Math.floor(i / 3) * 0.55;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 1.95, h: 0.42, fill: { color: 'E8EEF8' }, rectRadius: 0.06,
      });
      s.addText(t, {
        x, y, w: 1.95, h: 0.42, fontSize: 11, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle',
      });
    });

    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 7.1, y: 1.25, w: 5.7, h: 5.0, fill: { color: LIGHT }, rectRadius: 0.08,
    });
    s.addText('Who uses it', {
      x: 7.4, y: 1.5, w: 5, h: 0.4, fontSize: 14, bold: true, color: BLUE, fontFace: 'Calibri',
    });
    const who = [
      'Sales Engineers & QS / tender teams',
      'Division managers & approvers',
      'Business development & direct sales',
      'Group management (reports & targets)',
    ];
    who.forEach((w, i) => {
      s.addText('●  ' + w, {
        x: 7.4, y: 2.15 + i * 0.55, w: 5.1, h: 0.45, fontSize: 14, color: NAVY, fontFace: 'Calibri',
      });
    });
    s.addText('Module roles: Enquiry, Pricing, Quote, Probability, Sales Report, Sales Target, Admin.\n141 users have core commercial roles · 49 Sales Target · 1 Admin.', {
      x: 7.4, y: 4.5, w: 5.1, h: 1.3, fontSize: 12, color: GRAY, fontFace: 'Calibri',
    });
    addFooter(s, pptx, 4);
  }

  // ——— SLIDE 5: Users by division chart ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Active Users by Division');
    s.addChart(pptx.charts.BAR, [
      {
        name: 'Users',
        labels: [
          'AC Maint-HVAC', 'Civil Project', 'Interiors', 'HVAC Project', 'AC Maint-Elec',
          'IFM Civil', 'Security', 'Landscape Maint', 'Simplex', 'IFM Cleaning',
          'Aluminium', 'Cleaning Maint', 'DS-ACG', 'Electrical', 'Scaffolding', 'Other (21)',
        ],
        values: [15, 14, 11, 8, 8, 6, 6, 5, 4, 4, 4, 4, 4, 4, 4, 43],
      },
    ], {
      x: 0.4, y: 1.2, w: 12.5, h: 5.5,
      barGrouping: 'clustered',
      showValue: true,
      showLegend: false,
      chartColors: [BLUE],
      catAxisLabelColor: GRAY,
      catAxisLabelFontSize: 10,
      valAxisHidden: false,
      valAxisMaxValue: 50,
    });
    addFooter(s, pptx, 5);
  }

  // ——— SLIDE 6: Pipeline ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Pipeline Status Mix');
    s.addChart(pptx.charts.PIE, [
      {
        name: 'Pipeline',
        labels: ['Follow Up', 'Won', 'Lost', 'Cancelled', 'Retendered', 'On Hold', 'Pending'],
        values: [214, 188, 25, 12, 9, 9, 3],
      },
    ], {
      x: 0.3, y: 1.2, w: 7.2, h: 5.5,
      showPercent: true,
      showLegend: true,
      legendPos: 'b',
      chartColors: ['2B5AA8', '1B7F4E', 'C0392B', '7F8C8D', '8E44AD', 'B86E00', '95A5A6'],
    });

    const highlights = [
      { v: '460', l: 'Total pipeline records' },
      { v: '188', l: 'Won opportunities' },
      { v: '214', l: 'Active follow-ups' },
      { v: '11.3k', l: 'Workflow notifications' },
    ];
    highlights.forEach((h, i) => {
      const y = 1.4 + i * 1.25;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 8.0, y, w: 4.8, h: 1.1, fill: { color: LIGHT }, rectRadius: 0.08,
      });
      s.addText(h.v, {
        x: 8.2, y: y + 0.15, w: 4.4, h: 0.45, fontSize: 24, bold: true, color: NAVY, fontFace: 'Calibri',
      });
      s.addText(h.l, {
        x: 8.2, y: y + 0.6, w: 4.4, h: 0.35, fontSize: 13, color: GRAY, fontFace: 'Calibri',
      });
    });
    addFooter(s, pptx, 6);
  }

  // ——— SLIDE 7: Companies ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Companies on the Platform');
    s.addText('Company identity drives quote letterheads, department codes, and company-level approver pools.', {
      x: 0.5, y: 1.15, w: 12, h: 0.35, fontSize: 12, color: GRAY, fontFace: 'Calibri', italic: true,
    });
    s.addTable(
      [
        [
          { text: 'Company entity', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: 'Divs', options: { bold: true, color: WHITE, fill: { color: NAVY }, align: 'center' } },
          { text: 'Coverage', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ['Almoayyed Air Conditioning W.L.L.', '8', 'HVAC, BMS, Electrical, Plumbing, Maint, Direct Sales'],
        ['Integrated Facility Management W.L.L', '7', 'Civil / HVAC / Elec / Cleaning / Facility / Home / Project'],
        ['YK Almoayyed Integrated Building Solutions', '2', 'IBMS Project & Maint'],
        ['Almoayyed Scaffolding Company W.L.L', '2', 'Scaffolding, Machine Leasing'],
        ['Almoayyed Contracting W.L.L.', '2', 'Civil Project & Maint'],
        ['Almoayyed Interiors', '2', 'Interiors Project & Maint'],
        ['Almoayyed Landscapes and Swimming Pools', '2', 'Landscape Project & Maint'],
        ['Almoayyed Contracting Group W.L.L', '1', 'Direct Sales – ACG'],
        ['Almoayyed Property Development W.L.L.', '1', 'Property'],
        ['Almoayyed Air Ducts Factory W.L.L', '1', 'Duct Factory'],
        ['Almoayyed Aluminium / Cleaning / Security / Transport…', '1 ea', 'Plus CamAir, Designers Gallery, YK RE, Simplex, BD'],
      ],
      {
        x: 0.4, y: 1.55, w: 12.5, colW: [5.5, 1.0, 6.0],
        border: [{ pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }],
        fontFace: 'Calibri', fontSize: 11, color: NAVY,
        align: 'left', valign: 'middle',
      }
    );
    addFooter(s, pptx, 7);
  }

  // ——— SLIDE 8: Top divisions ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Divisions with the Most Users');
    s.addTable(
      [
        [
          { text: 'Division', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: 'Active users', options: { bold: true, color: WHITE, fill: { color: NAVY }, align: 'center' } },
          { text: 'Parent company', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ['AC Maint-HVAC', '15', 'Almoayyed Air Conditioning'],
        ['Civil Project', '14', 'Almoayyed Contracting'],
        ['Interiors Project', '11', 'Almoayyed Interiors'],
        ['HVAC Project', '8', 'Almoayyed Air Conditioning'],
        ['AC Maint-Elec', '8', 'Almoayyed Air Conditioning'],
        ['IFM Civil Maint', '6', 'Integrated Facility Management'],
        ['Security Project', '6', 'Almoayyed Security'],
        ['Landscape Maint', '5', 'Almoayyed Landscapes'],
      ],
      {
        x: 1.5, y: 1.5, w: 10.3, colW: [3.5, 2.0, 4.8],
        border: [{ pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }],
        fontFace: 'Calibri', fontSize: 14, color: NAVY,
        align: 'left', valign: 'middle',
      }
    );
    s.addText('Plus 28 additional divisions with 1–4 users each (Management, BMS, Plumbing, Direct Sales, IFM variants, etc.).', {
      x: 1.5, y: 6.2, w: 10.3, h: 0.4, fontSize: 12, color: GRAY, fontFace: 'Calibri', italic: true,
    });
    addFooter(s, pptx, 8);
  }

  // ——— SLIDE 9: Lifecycle ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'End-to-End Commercial Lifecycle');
    const steps = ['1. Enquiry', '2. Pricing', '3. Quote', '4. Approval', '5. Probability', '6. Reports'];
    steps.forEach((st, i) => {
      const x = 0.4 + i * 2.15;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.4, w: 2.0, h: 0.7, fill: { color: i % 2 === 0 ? NAVY : BLUE }, rectRadius: 0.08,
      });
      s.addText(st, {
        x, y: 1.4, w: 2.0, h: 0.7, fontSize: 13, bold: true, color: WHITE, fontFace: 'Calibri',
        align: 'center', valign: 'middle',
      });
      if (i < steps.length - 1) {
        s.addText('→', {
          x: x + 1.95, y: 1.4, w: 0.25, h: 0.7, fontSize: 16, color: GRAY, valign: 'middle',
        });
      }
    });

    const mods = [
      ['Dashboard', 'Dual calendars, KPIs, division/SE filters, enquiry drill-down'],
      ['Enquiry', 'Multi-customer registration, Lead/Sub-Job hierarchy, attachments, Outlook notify'],
      ['Pricing', 'Commercial evaluation by job/customer; base price & options; division ACL'],
      ['Quote', 'Clause editor, revisions, protected A4 PDF, Outlook draft with PDF'],
      ['Approvals', 'Multi-step routing, digital signatures, cross-division rules, audit trail'],
      ['Probability', 'Won / Lost / Follow Up / On Hold / Cancelled / Retendered pipeline'],
      ['Sales Report', 'Charts, top jobs, status analysis, Excel / A4 print'],
      ['Sales Target', 'Goals vs actual by FY/quarter/division/SE'],
      ['Masters & Admin', 'Customers, contacts, users, divisions, clauses, roles'],
    ];
    s.addTable(
      [
        [
          { text: 'Module', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: 'What it delivers', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ...mods,
      ],
      {
        x: 0.4, y: 2.4, w: 12.5, colW: [2.4, 10.1],
        border: [{ pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }],
        fontFace: 'Calibri', fontSize: 11, color: NAVY,
        align: 'left', valign: 'middle',
      }
    );
    addFooter(s, pptx, 9);
  }

  // ——— SLIDE 10: Traction ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Traction & Operating Volume');
    const left = [
      ['Enquiries logged', '1,031'],
      ['Date span', '3 Jan 2025 – 26 Aug 2026'],
      ['Formal quotes', '1,135'],
      ['Quote drafts', '731'],
      ['Pricing value rows', '1,044'],
      ['Approval workflow steps', '1,105'],
      ['Sales target records', '84'],
      ['Pipeline records', '460'],
    ];
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y: 1.3, w: 6.0, h: 5.3, fill: { color: LIGHT }, rectRadius: 0.08,
    });
    s.addText('Transactional scale', {
      x: 0.8, y: 1.5, w: 5.4, h: 0.4, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    left.forEach((row, i) => {
      s.addText(row[0], { x: 0.8, y: 2.1 + i * 0.5, w: 3.5, h: 0.4, fontSize: 13, color: GRAY, fontFace: 'Calibri' });
      s.addText(row[1], { x: 4.2, y: 2.1 + i * 0.5, w: 2.0, h: 0.4, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri', align: 'right' });
    });

    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 6.9, y: 1.3, w: 5.9, h: 5.3, fill: { color: WHITE },
      line: { color: 'D8DEE9', width: 1 }, rectRadius: 0.08,
    });
    s.addText('Why this matters', {
      x: 7.2, y: 1.5, w: 5.3, h: 0.4, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    const why = [
      { t: 'Multi-entity deployment', d: 'Not a single-department pilot — spans HVAC, civil, interiors, IFM, scaffolding, security, aluminium, landscape, transport.' },
      { t: 'Embedded process IP', d: 'Division ACL, approval hierarchies, and quote numbering are productised — not spreadsheet workarounds.' },
      { t: 'Daily operational dependence', d: 'Live enquiry, quote, approval, and notification traffic show real usage, not demo data.' },
    ];
    why.forEach((w, i) => {
      const y = 2.15 + i * 1.35;
      s.addText(w.t, { x: 7.2, y, w: 5.3, h: 0.35, fontSize: 14, bold: true, color: BLUE, fontFace: 'Calibri' });
      s.addText(w.d, { x: 7.2, y: y + 0.35, w: 5.3, h: 0.9, fontSize: 12, color: GRAY, fontFace: 'Calibri' });
    });
    addFooter(s, pptx, 10);
  }

  // ——— SLIDE 11: Tech ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Technology & Architecture');
    const stack = [
      { t: 'Frontend', d: 'React 19 · Vite 7\nRecharts · ExcelJS\nRich text editors' },
      { t: 'Backend', d: 'Node.js 22 · Express 5\n60+ API endpoints\nPM2 process manager' },
      { t: 'Data & Ops', d: 'MS SQL Server (EMS_DB)\nIIS reverse proxy\nSMTP / Outlook · PDF' },
    ];
    stack.forEach((c, i) => {
      const x = 0.5 + i * 4.2;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.4, w: 4.0, h: 2.8, fill: { color: LIGHT }, rectRadius: 0.08,
      });
      s.addText(c.t, { x: x + 0.3, y: 1.65, w: 3.4, h: 0.45, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri' });
      s.addText(c.d, { x: x + 0.3, y: 2.3, w: 3.4, h: 1.6, fontSize: 14, color: GRAY, fontFace: 'Calibri' });
    });
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y: 4.5, w: 12.3, h: 1.9, fill: { color: 'E8EEF8' }, rectRadius: 0.08,
    });
    s.addText('Deployment model', {
      x: 0.8, y: 4.7, w: 11.7, h: 0.35, fontSize: 14, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    s.addText(
      'Browser SPA → IIS (static + ARR) → Node API → SQL Server + file share for attachments.\nDesigned for ~50 concurrent internal users; current registered base is 144 active accounts across the group (concurrency is lower than headcount).',
      { x: 0.8, y: 5.15, w: 11.7, h: 1.0, fontSize: 13, color: GRAY, fontFace: 'Calibri' }
    );
    addFooter(s, pptx, 11);
  }

  // ——— SLIDE 12: Commercial ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Business Value & Commercial Framing');
    const vals = [
      { v: 'BHD 45–60k', l: 'External replacement\nbenchmark' },
      { v: '18–24 mo', l: 'Typical vendor\nbuild timeline' },
      { v: 'BHD 5–8k/yr', l: 'Annual support\nbenchmark' },
    ];
    vals.forEach((v, i) => {
      const x = 0.5 + i * 4.2;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.35, w: 4.0, h: 2.0, fill: { color: LIGHT }, rectRadius: 0.08,
      });
      s.addText(v.v, {
        x, y: 1.55, w: 4.0, h: 0.7, fontSize: 26, bold: true, color: AMBER, fontFace: 'Calibri', align: 'center',
      });
      s.addText(v.l, {
        x: x + 0.2, y: 2.35, w: 3.6, h: 0.8, fontSize: 13, color: GRAY, fontFace: 'Calibri', align: 'center',
      });
    });

    s.addText('Value created for the group', {
      x: 0.5, y: 3.7, w: 12, h: 0.4, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    const value = [
      'One source of truth for opportunities across 20 company entities.',
      'Controlled quoting (protected PDF + approval audit) reduces commercial risk.',
      'Management visibility via dashboard, sales report, and targets.',
      'Cost avoidance vs outsourcing an equivalent GCC enterprise build.',
      'Domain rules (Lead/Sub-Job, division ACL, company letterheads) are productised IP.',
    ];
    value.forEach((t, i) => {
      s.addText(`${i + 1}.  ${t}`, {
        x: 0.5, y: 4.2 + i * 0.4, w: 12.3, h: 0.38, fontSize: 13, color: GRAY, fontFace: 'Calibri',
      });
    });
    addFooter(s, pptx, 12);
  }

  // ——— SLIDE 13: Scale summary ———
  {
    const s = pptx.addSlide();
    addHeader(s, pptx, 'Scale Summary for the Deck');
    s.addTable(
      [
        [
          { text: 'Dimension', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: 'Live figure', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
          { text: 'Interpretation', options: { bold: true, color: WHITE, fill: { color: NAVY } } },
        ],
        ['Users', '144 Active', 'Registered sales / QS / management accounts'],
        ['Companies', '20 entities', 'Group + sister companies on shared EMS'],
        ['Divisions', '38 services', 'Master Enquiry-For catalogue'],
        ['User divisions', '36 departments', 'Users mapped to operational divisions'],
        ['Customers', '1,275', 'Reusable customer master'],
        ['Contacts', '3,409', 'Received-from / stakeholder master'],
        ['Enquiries', '1,031', 'Jan 2025 – Aug 2026'],
        ['Quotes', '1,135 formal (+731 draft)', 'High quoting throughput'],
        ['Pipeline', '460 (188 Won)', 'Active commercial discipline'],
        ['Notifications', '11,262', 'System-driven workflow engagement'],
      ],
      {
        x: 0.5, y: 1.3, w: 12.3, colW: [2.5, 3.5, 6.3],
        border: [{ pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }, { pt: 0.5, color: 'D8DEE9' }],
        fontFace: 'Calibri', fontSize: 12, color: NAVY,
        align: 'left', valign: 'middle',
      }
    );
    addFooter(s, pptx, 13);
  }

  // ——— SLIDE 14: Closing ———
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addText('Closing Narrative', {
      x: 0.8, y: 1.5, w: 11.5, h: 0.5, fontSize: 14, color: 'A8C0E8', bold: true, fontFace: 'Calibri', charSpacing: 2,
    });
    s.addText(
      'EMS is not a slideware prototype. It is the live sales backbone of Almoayyed Contracting Group’s multi-company operations — already adopted by 144 users across HVAC, civil, interiors, facilities, scaffolding, security, and allied businesses — with measurable enquiry, quote, approval, and win/follow-up volume.',
      { x: 0.8, y: 2.2, w: 11.5, h: 1.8, fontSize: 18, color: WHITE, fontFace: 'Calibri' }
    );
    s.addText(
      'For investors or management sponsors: proven internal product–market fit, deep domain IP, on-premise control, and a clear path to continued expansion across remaining group entities and modules — without rebuilding the core.',
      { x: 0.8, y: 4.2, w: 11.5, h: 1.3, fontSize: 15, color: 'C5D4EE', fontFace: 'Calibri' }
    );
    s.addText('Confidential — Almoayyed Contracting Group  ·  ' + SNAPSHOT + '  ·  Mohan Naidu', {
      x: 0.8, y: 6.6, w: 11.5, h: 0.35, fontSize: 12, color: '9BB0D4', fontFace: 'Calibri',
    });
  }

  await pptx.writeFile({ fileName: OUT });
  console.log('Wrote: ' + OUT);
}

function addHeader(s, pptx, title) {
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: NAVY } });
  s.addText('EMS · Investor Presentation', {
    x: 0.5, y: 0.18, w: 8, h: 0.28, fontSize: 11, color: 'A8C0E8', fontFace: 'Calibri',
  });
  s.addText(title, {
    x: 0.5, y: 0.42, w: 12, h: 0.4, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri',
  });
}

function addFooter(s, pptx, page) {
  s.addText('Almoayyed Contracting Group  ·  Confidential  ·  ' + SNAPSHOT, {
    x: 0.5, y: 7.15, w: 10, h: 0.25, fontSize: 10, color: '8A94A6', fontFace: 'Calibri',
  });
  s.addText(String(page), {
    x: 12.3, y: 7.15, w: 0.6, h: 0.25, fontSize: 10, color: '8A94A6', fontFace: 'Calibri', align: 'right',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

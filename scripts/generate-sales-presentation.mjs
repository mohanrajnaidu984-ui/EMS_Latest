import PptxGenJS from 'pptxgenjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '..', 'docs', 'EMS_Sales_Presentation.pptx');

const C = {
  navy: '0C1F3D',
  brand: '1A3568',
  blue: '2563A8',
  ice: 'F4F7FB',
  white: 'FFFFFF',
  slate: '2D3748',
  muted: '6B7C93',
  gold: 'B8963E',
  line: 'D5DEEA',
  soft: 'E8EEF5',
};

const FONT = 'Calibri';
const TOTAL = 9;

const pptx = new PptxGenJS();
pptx.author = 'Mohan Naidu';
pptx.company = 'Almoayyed Contracting Group';
pptx.title = 'EMS - Enquiry Management System';
pptx.subject = 'Enterprise Solution Overview';
pptx.layout = 'LAYOUT_16x9';

function slideBase(slide, { page, subtitle } = {}) {
  slide.background = { color: C.ice };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.55,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0.55, w: '100%', h: 0.04,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  if (subtitle) {
    slide.addText(subtitle.toUpperCase(), {
      x: 0.6, y: 0.78, w: 8.5, h: 0.28,
      fontSize: 9, color: C.blue, bold: true, charSpacing: 3, fontFace: FONT,
    });
  }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 5.12, w: 8.8, h: 0.01,
    fill: { color: C.line }, line: { color: C.line },
  });
  slide.addText('EMS  ·  Enquiry Management System  ·  Confidential', {
    x: 0.6, y: 5.18, w: 7, h: 0.25,
    fontSize: 7.5, color: C.muted, fontFace: FONT,
  });
  if (page) {
    slide.addText(`${page} / ${TOTAL}`, {
      x: 8.7, y: 5.18, w: 0.8, h: 0.25,
      fontSize: 7.5, color: C.muted, align: 'right', fontFace: FONT,
    });
  }
}

function slideTitle(slide, title, y = 1.12) {
  slide.addText(title, {
    x: 0.6, y, w: 8.8, h: 0.52,
    fontSize: 24, bold: true, color: C.navy, fontFace: FONT,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: y + 0.56, w: 0.9, h: 0.04,
    fill: { color: C.gold }, line: { color: C.gold },
  });
}

function card(slide, { x, y, w, h, accent = C.blue }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: C.white },
    line: { color: C.line, width: 0.75 },
    rectRadius: 0.06,
    shadow: { type: 'outer', blur: 5, offset: 1, angle: 135, color: '000000', opacity: 0.06 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: '100%', h: 0.05,
    fill: { color: accent }, line: { color: accent },
  });
}

function bullets(texts, { size = 11, color = C.slate } = {}) {
  return texts.map((t) => ({
    text: t,
    options: { bullet: { code: '2022' }, breakLine: true, fontSize: size, color, fontFace: FONT, paraSpaceAfter: 5 },
  }));
}

// ── SLIDE 1: Title ──────────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: C.navy };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4.6, w: '100%', h: 0.06,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 6.8, y: -2.2, w: 6, h: 6,
    fill: { color: C.brand, transparency: 65 },
    line: { color: C.brand, transparency: 100 },
  });

  slide.addText('EMS', {
    x: 0.9, y: 1.35, w: 8, h: 1.0,
    fontSize: 54, bold: true, color: C.white, fontFace: FONT,
  });
  slide.addText('Enquiry Management System', {
    x: 0.9, y: 2.3, w: 8, h: 0.5,
    fontSize: 22, color: 'A8BDD4', fontFace: FONT,
  });
  slide.addText('Enterprise Solution Overview', {
    x: 0.9, y: 3.05, w: 8, h: 0.4,
    fontSize: 15, color: '8FA8C4', fontFace: FONT,
  });
  slide.addText('A unified platform for enquiry management, commercial evaluation,\nquotation, approval, and sales performance across your organisation.', {
    x: 0.9, y: 3.65, w: 7.8, h: 0.7,
    fontSize: 11, color: '6E8AA8', fontFace: FONT, lineSpacing: 16,
  });
  slide.addText('Almoayyed Contracting Group  ·  2026', {
    x: 0.9, y: 4.85, w: 6, h: 0.3,
    fontSize: 9, color: '5A7490', fontFace: FONT,
  });
}

// ── SLIDE 2: Executive Overview ───────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 2, subtitle: 'Executive Overview' });
  slideTitle(slide, 'Purpose-Built for Contracting & Engineering Sales');

  slide.addText(
    'EMS is a full-stack enterprise web platform that manages the complete sales and enquiry lifecycle — from initial customer contact through pricing, formal quotation, multi-level approval, pipeline tracking, and management reporting.',
    { x: 0.6, y: 1.85, w: 8.8, h: 0.75, fontSize: 12, color: C.slate, fontFace: FONT, lineSpacing: 18 },
  );

  const pillars = [
    { title: 'Single System of Record', desc: 'One consistent enquiry record across all divisions and teams' },
    { title: 'Controlled Workflows', desc: 'Structured processes with accountability at every stage' },
    { title: 'Management Intelligence', desc: 'Real-time visibility into pipeline, performance, and targets' },
    { title: 'Enterprise Security', desc: 'On-premise deployment with role-based access control' },
  ];

  pillars.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * 4.55;
    const y = 2.85 + row * 1.15;
    card(slide, { x, y, w: 4.3, h: 0.95, accent: C.blue });
    slide.addText(p.title, {
      x: x + 0.2, y: y + 0.2, w: 3.9, h: 0.3,
      fontSize: 12, bold: true, color: C.navy, fontFace: FONT,
    });
    slide.addText(p.desc, {
      x: x + 0.2, y: y + 0.52, w: 3.9, h: 0.35,
      fontSize: 10, color: C.muted, fontFace: FONT,
    });
  });
}

// ── SLIDE 3: Challenge & Solution ─────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 3, subtitle: 'Business Context' });
  slideTitle(slide, 'Addressing Operational Complexity');

  card(slide, { x: 0.6, y: 1.75, w: 4.25, h: 3.1, accent: C.navy });
  slide.addText('Current Challenges', {
    x: 0.85, y: 1.95, w: 3.8, h: 0.32,
    fontSize: 13, bold: true, color: C.navy, fontFace: FONT,
  });
  slide.addText(bullets([
    'Enquiry data dispersed across spreadsheets and email threads',
    'Inconsistent quote formats and uncontrolled document versions',
    'Approval delays with limited audit visibility',
    'Limited real-time insight into pipeline and team performance',
  ], { size: 10.5 }), { x: 0.85, y: 2.35, w: 3.85, h: 2.2 });

  card(slide, { x: 5.15, y: 1.75, w: 4.25, h: 3.1, accent: C.blue });
  slide.addText('The EMS Approach', {
    x: 5.4, y: 1.95, w: 3.8, h: 0.32,
    fontSize: 13, bold: true, color: C.navy, fontFace: FONT,
  });
  slide.addText(bullets([
    'Centralised enquiry register with full project context',
    'Integrated pricing, quoting, and revision management',
    'Configurable multi-level approval with digital sign-off',
    'Executive dashboards, sales reports, and target tracking',
  ], { size: 10.5 }), { x: 5.4, y: 2.35, w: 3.85, h: 2.2 });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 2.2, y: 4.55, w: 5.6, h: 0.42,
    fill: { color: C.soft }, line: { color: C.line }, rectRadius: 0.06,
  });
  slide.addText('Enquiry  →  Pricing  →  Quote  →  Approval  →  Pipeline  →  Reporting', {
    x: 2.2, y: 4.62, w: 5.6, h: 0.3,
    fontSize: 10, bold: true, color: C.brand, align: 'center', fontFace: FONT,
  });
}

// ── SLIDE 4: Platform Modules ─────────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 4, subtitle: 'Platform Architecture' });
  slideTitle(slide, 'Integrated Functional Modules');

  const mods = [
    ['Dashboard', 'KPI summary, dual calendar views, division and SE filters'],
    ['Enquiry', 'Registration, job hierarchy, attachments, acknowledgements'],
    ['Pricing', 'Commercial evaluation with lead/sub-job cost breakdowns'],
    ['Quote', 'Clause editor, A4 preview, revisions, protected PDF output'],
    ['Approval', 'Multi-step routing, digital signatures, audit trail'],
    ['Probability', 'Pipeline status: Won, Lost, Follow Up, On Hold, and more'],
    ['Sales Report', 'Performance analytics, top-jobs analysis, Excel export'],
    ['Sales Target', 'Planned goals versus actual achievement by period'],
  ];

  mods.forEach(([name, desc], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.6 + col * 2.3;
    const y = 1.78 + row * 1.65;
    card(slide, { x, y, w: 2.15, h: 1.45, accent: C.blue });
    slide.addText(name, {
      x: x + 0.15, y: y + 0.18, w: 1.85, h: 0.32,
      fontSize: 12, bold: true, color: C.navy, fontFace: FONT,
    });
    slide.addText(desc, {
      x: x + 0.15, y: y + 0.55, w: 1.85, h: 0.75,
      fontSize: 9, color: C.muted, fontFace: FONT, lineSpacing: 13,
    });
  });
}

// ── SLIDE 5: Workflow ───────────────────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 5, subtitle: 'Process Framework' });
  slideTitle(slide, 'End-to-End Enquiry Lifecycle');

  const steps = [
    'Enquiry\nReceived',
    'Register\n& Scope',
    'Commercial\nPricing',
    'Formal\nQuotation',
    'Approval\nWorkflow',
    'Customer\nDelivery',
    'Pipeline\nManagement',
    'Executive\nReporting',
  ];

  steps.forEach((label, i) => {
    const x = 0.45 + i * 1.17;
    const isEven = i % 2 === 0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.1, w: 1.02, h: 1.05,
      fill: { color: isEven ? C.navy : C.blue },
      line: { color: isEven ? C.navy : C.blue },
      rectRadius: 0.08,
    });
    slide.addText(label, {
      x, y: 2.22, w: 1.02, h: 0.85,
      fontSize: 8, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: FONT,
    });
    if (i < steps.length - 1) {
      slide.addText('›', {
        x: x + 1.0, y: 2.38, w: 0.18, h: 0.35,
        fontSize: 14, color: C.muted, align: 'center',
      });
    }
  });

  const features = [
    'Auto-generated request numbers and job hierarchy',
    'Division-level access control throughout',
    'Protected PDF export and Outlook integration',
    'Complete approval audit trail',
    'Real-time pipeline and performance dashboards',
    'Role-based access for Admin, SE, Manager, and Approver',
  ];
  features.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * 4.55;
    const y = 3.55 + row * 0.4;
    slide.addText('—  ' + f, {
      x, y, w: 4.3, h: 0.35,
      fontSize: 9.5, color: C.slate, fontFace: FONT,
    });
  });
}

// ── SLIDE 6: Capabilities ───────────────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 6, subtitle: 'Functional Capabilities' });
  slideTitle(slide, 'Comprehensive Feature Set');

  const cols = [
    {
      title: 'Enquiry & Commercial',
      items: [
        'Multi-customer and split-quote scenarios',
        'Lead Job and Sub-Job hierarchy with division codes',
        'Document attachments with OCR-assisted capture',
        'Material, labour, and overhead cost structures',
        'Automated customer acknowledgement workflows',
      ],
    },
    {
      title: 'Quotation & Governance',
      items: [
        'Rich-text clause editor with A4-formatted preview',
        'Controlled revision management (R0 through Rn)',
        'Password-protected, print-only PDF export',
        'Configurable approval hierarchies by division',
        'Digital signatures with email notifications',
      ],
    },
    {
      title: 'Analytics & Performance',
      items: [
        'Pipeline tracking across all opportunity statuses',
        'Dual calendar views for due dates and deadlines',
        'Division and sales engineer performance charts',
        'Top-opportunities analysis ranked by value',
        'Sales target planning with progress visibility',
      ],
    },
  ];

  cols.forEach((col, i) => {
    const x = 0.6 + i * 3.1;
    const y = 1.78;
    card(slide, { x, y, w: 2.9, h: 3.15, accent: C.blue });
    slide.addText(col.title, {
      x: x + 0.2, y: y + 0.2, w: 2.5, h: 0.35,
      fontSize: 12, bold: true, color: C.navy, fontFace: FONT,
    });
    slide.addText(bullets(col.items, { size: 9.5 }), {
      x: x + 0.2, y: y + 0.62, w: 2.5, h: 2.35,
    });
  });
}

// ── SLIDE 7: Strategic Value ────────────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 7, subtitle: 'Strategic Value' });
  slideTitle(slide, 'Organisational Benefits');

  const benefits = [
    { title: 'Operational Efficiency', desc: 'Eliminate redundant data entry and manual document preparation across teams.' },
    { title: 'Process Standardisation', desc: 'Enforce consistent enquiry, pricing, and quotation practices organisation-wide.' },
    { title: 'Decision Support', desc: 'Provide management with timely, accurate pipeline and performance intelligence.' },
    { title: 'Accountability & Compliance', desc: 'Maintain a complete audit trail for approvals, revisions, and status changes.' },
    { title: 'Domain Alignment', desc: 'Purpose-built for contracting workflows — not adapted from generic CRM software.' },
    { title: 'Data Governance', desc: 'On-premise hosting ensures full control over sensitive commercial information.' },
  ];

  benefits.forEach((b, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.6 + col * 3.1;
    const y = 1.78 + row * 1.6;
    card(slide, { x, y, w: 2.9, h: 1.4, accent: i % 3 === 0 ? C.navy : C.blue });
    slide.addText(b.title, {
      x: x + 0.2, y: y + 0.2, w: 2.5, h: 0.32,
      fontSize: 11.5, bold: true, color: C.navy, fontFace: FONT,
    });
    slide.addText(b.desc, {
      x: x + 0.2, y: y + 0.55, w: 2.5, h: 0.7,
      fontSize: 9, color: C.muted, fontFace: FONT, lineSpacing: 13,
    });
  });
}

// ── SLIDE 8: Technology & Security ──────────────────────────
{
  const slide = pptx.addSlide();
  slideBase(slide, { page: 8, subtitle: 'Technology & Governance' });
  slideTitle(slide, 'Enterprise Architecture & Security');

  card(slide, { x: 0.6, y: 1.78, w: 5.3, h: 3.1, accent: C.navy });
  slide.addText('Technology Foundation', {
    x: 0.85, y: 1.98, w: 4.8, h: 0.3,
    fontSize: 12, bold: true, color: C.navy, fontFace: FONT,
  });

  const stack = [
    ['Presentation Layer', 'React 19 — responsive web interface'],
    ['Application Layer', 'Node.js 22 with Express 5 REST API'],
    ['Data Layer', 'Microsoft SQL Server relational database'],
    ['Authentication', 'JWT-based sessions with role-based access'],
    ['Integrations', 'SMTP, Microsoft Outlook, OCR, Excel export'],
    ['Infrastructure', 'IIS deployment on Windows Server (on-premise)'],
  ];
  stack.forEach(([layer, tech], i) => {
    const y = 2.38 + i * 0.4;
    slide.addText(layer, {
      x: 0.85, y, w: 1.6, h: 0.3,
      fontSize: 9, bold: true, color: C.brand, fontFace: FONT,
    });
    slide.addText(tech, {
      x: 2.5, y, w: 3.2, h: 0.3,
      fontSize: 9.5, color: C.slate, fontFace: FONT,
    });
    if (i < stack.length - 1) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.85, y: y + 0.32, w: 4.8, h: 0.005,
        fill: { color: C.line }, line: { color: C.line },
      });
    }
  });

  card(slide, { x: 6.1, y: 1.78, w: 3.3, h: 3.1, accent: C.blue });
  slide.addText('Security & Compliance', {
    x: 6.35, y: 1.98, w: 2.8, h: 0.3,
    fontSize: 12, bold: true, color: C.navy, fontFace: FONT,
  });
  slide.addText(bullets([
    'Role-based access control (RBAC)',
    'Hashed credential storage',
    'Division-level data restrictions',
    'Protected PDF document output',
    'Comprehensive approval audit logs',
    'Support for 50+ concurrent users',
    'Chrome and Edge browser compatibility',
  ], { size: 9.5 }), { x: 6.35, y: 2.38, w: 2.8, h: 2.3 });
}

// ── SLIDE 9: Implementation & Next Steps ────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: C.navy };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.06,
    fill: { color: C.gold }, line: { color: C.gold },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 7, y: 2.5, w: 5, h: 5,
    fill: { color: C.brand, transparency: 70 },
    line: { color: C.brand, transparency: 100 },
  });

  slide.addText('Implementation & Engagement', {
    x: 0.9, y: 0.55, w: 8, h: 0.55,
    fontSize: 26, bold: true, color: C.white, fontFace: FONT,
  });
  slide.addText('A structured path from evaluation to operational deployment.', {
    x: 0.9, y: 1.1, w: 8, h: 0.35,
    fontSize: 12, color: '8FA8C4', fontFace: FONT,
  });

  const steps = [
    { n: '01', title: 'Requirements Review', desc: 'Align EMS capabilities with your organisational processes and divisions' },
    { n: '02', title: 'Live Demonstration', desc: 'Guided walkthrough of all modules tailored to your workflow' },
    { n: '03', title: 'Deployment Planning', desc: 'Infrastructure setup, data migration, and user onboarding strategy' },
    { n: '04', title: 'Go-Live & Support', desc: 'Production deployment with training and post-implementation assistance' },
  ];

  steps.forEach((s, i) => {
    const y = 1.65 + i * 0.78;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.9, y, w: 8.2, h: 0.62,
      fill: { color: C.brand, transparency: 35 },
      line: { color: '2E4A72', width: 0.5 },
      rectRadius: 0.06,
    });
    slide.addText(s.n, {
      x: 1.1, y: y + 0.1, w: 0.45, h: 0.4,
      fontSize: 14, bold: true, color: C.gold, fontFace: FONT,
    });
    slide.addText(s.title, {
      x: 1.65, y: y + 0.1, w: 2.4, h: 0.35,
      fontSize: 13, bold: true, color: C.white, fontFace: FONT,
    });
    slide.addText(s.desc, {
      x: 4.1, y: y + 0.13, w: 4.8, h: 0.35,
      fontSize: 10, color: '94A8C4', fontFace: FONT,
    });
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.9, y: 4.75, w: 8.2, h: 0.01,
    fill: { color: '3A5A82' }, line: { color: '3A5A82' },
  });
  slide.addText('Deliverables:  Full source code  ·  Database schema  ·  Deployment guides  ·  User documentation  ·  Post go-live support', {
    x: 0.9, y: 4.85, w: 8.2, h: 0.3,
    fontSize: 8.5, color: '6E8AA8', fontFace: FONT,
  });
  slide.addText('Mohan Naidu  ·  Almoayyed Contracting Group', {
    x: 0.9, y: 5.15, w: 6, h: 0.25,
    fontSize: 9, color: '5A7490', fontFace: FONT,
  });
  slide.addText('9 / 9', {
    x: 8.7, y: 5.15, w: 0.8, h: 0.25,
    fontSize: 7.5, color: '5A7490', align: 'right', fontFace: FONT,
  });
}

await pptx.writeFile({ fileName: OUTPUT });
console.log(`Presentation saved to: ${OUTPUT}`);

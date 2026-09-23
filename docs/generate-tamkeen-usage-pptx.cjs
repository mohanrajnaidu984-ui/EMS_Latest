/**
 * Tamkeen EMS Usage Evidence PPTX — six requested companies
 * Run: node generate-tamkeen-usage-pptx.cjs
 */
const PptxGenJS = require('pptxgenjs');
const path = require('path');

const OUT = path.join(__dirname, 'EMS_Tamkeen_Usage_Evidence_Six_Companies.pptx');
const SNAPSHOT = 'Live EMS_DB extract · 27 Aug 2026';
const NAVY = '20396D';
const BLUE = '2B5AA8';
const LIGHT = 'F4F6FA';
const WHITE = 'FFFFFF';
const GRAY = '5A6577';
const GREEN = '1B7F4E';
const AMBER = 'B86E00';

const entities = [
  {
    tamkeen: '1. Almoayyed Aluminium',
    emsCompany: 'Almoayyed Aluminium W.L.L.',
    division: 'Almoayyed Aluminium',
    codes: 'Dept ACA · Div AFP',
    users: 4,
    enquiries: 4,
    quotes: 0,
    quotesNote: 'No ACA/AFP letterhead quotes yet; Aluminium assigned as job on 4 multi-discipline enquiries',
    pricing: 'Participates as Enquiry-For job on live bids',
    pipeline: 'Follow-up activity on linked opportunities',
    period: '23 Apr 2026 – 2 Jun 2026',
    userRows: [
      ['Balamurugan Muthu', 'Almoayyed Aluminium', 'almmanager@almoayyedcg.com', 'Active'],
      ['Jebin Banarji Abraham', 'Almoayyed Aluminium', 'jebin.abraham@almoayyedcg.com', 'Active'],
      ['Sabu John', 'Almoayyed Aluminium', 'almmanager@almoayyedcg.com', 'Active'],
      ['Sibin Kannoli Sugathan', 'Almoayyed Aluminium', 'sibin.sugathan@almoayyedcg.com', 'Active'],
    ],
    enqRows: [
      ['134', '2026-06-02', 'Ministry of Works / Al-Kharafi', 'PRIMARY BOYS SCHOOL EAST HIDD', 'Quote'],
      ['34', '2026-06-02', 'Ministry of Education / Al-Kharafi', 'SECONDARY GIRLS SCHOOL MADINAT SALMAN', 'Quote'],
      ['18', '2026-05-14', 'United Engineering / Poullaides', 'RAMEZ HYPERMARKET EAST HIDD', 'Quote'],
      ['53', '2026-04-23', 'MINISTRY OF HOUSING & URBAN PLANNING', 'TERM CONTRACT HOUSING UNITS', 'Enquiry'],
    ],
    quoteRows: [
      ['—', 'ACA/AFP quote refs not yet issued', 'Aluminium job assigned on ReqNos above; SE Sibin assigned on 4 enquiries'],
    ],
    extra: 'System evidence: Master company active; 4 Active users; Aluminium ItemName on EnquiryFor for ReqNos 134, 34, 18, 53; Concerned SE assignments for Aluminium staff.',
  },
  {
    tamkeen: '2. Almoayyed Landscapes and Pools',
    emsCompany: 'Almoayyed Landscapes and Swimming Pools',
    division: 'Landscape Project · Landscape Maint',
    codes: 'Dept ALP · Div LDP / LDM',
    users: 7,
    enquiries: 105,
    quotes: 130,
    quotesNote: '94 enquiries have formal ALP quotes',
    pricing: '99 pricing rows',
    pipeline: 'Won 24 · Follow Up 7 · Lost 2',
    period: '7 May 2026 – 26 Aug 2026',
    userRows: [
      ['Angelique Cielo', 'Landscape Maint', 'ALPProjects1@almoayyedcg.com', 'Active'],
      ['Azara Fathima Ashraf', 'Landscape Maint', 'ALPQS3@almoayyedcg.com', 'Active'],
      ['Kavyasree Narayanakurup', 'Landscape Maint', 'ALPQS1@almoayyedcg.com', 'Active'],
      ['Nishantha Gamage', 'Landscape Maint', 'nishantha.g@almoayyedcg.com', 'Active'],
      ['Rufus Immanual M', 'Landscape Project', 'ALPQS2@almoayyedcg.com', 'Active'],
      ['Shoaib Akhtar', 'Landscape Maint', 'ALPMaintenance1@almoayyedcg.com', 'Active'],
      ['Vishal Mane', 'Landscape Project', 'ALPGM@almoayyedcg.com', 'Active'],
    ],
    enqRows: [
      ['1044', '2026-08-26', 'Fahad Bin Abdulrahman Algosaibi', 'Additional Works at Al Gosaibi', 'Quote'],
      ['1045', '2026-08-26', 'Mrs. Mona Almoayyed', 'Pool Repair Villa 3183 Durrat', 'Quote'],
      ['1034', '2026-08-24', 'Lotus Investment Company', 'Pool Maintenance Al Dar Compound', 'Quote'],
      ['1016', '2026-08-23', 'Monroe Hotel Bahrain', 'Pool and Wall Railings', 'Quote'],
      ['1020', '2026-08-23', 'Ameeri Services Co.', 'Fountain Maintenance NCM', 'Quote'],
      ['1033', '2026-08-20', 'Megalink Trading & Contracting', 'SMR Infra Mainline Irrigation', 'Quote'],
      ['971', '2026-08-20', 'Foulath Holding', 'Pool Maintenance Bahrain Steel', 'Quote'],
      ['972', '2026-08-20', 'British Embassy Bahrain', 'Swimming Pool Maintenance', 'Quote'],
    ],
    quoteRows: [
      ['1045', 'ALP/LDM/1045-L1/890-R0', 'Angelique Cielo'],
      ['1044', 'ALP/LDM/1044-L1/889-R0', 'Angelique Cielo'],
      ['1033', 'ALP/LDP/1033-L1/880-R0', 'Azara Fathima Ashraf'],
      ['1034', 'ALP/LDM/1034-L1/877-R0', 'Angelique Cielo'],
      ['641', 'ALP/LDM/641-L1/893-R0', 'Azara Fathima Ashraf'],
      ['643', 'ALP/LDP/643-L1/652-R5', 'Kavyasree Narayanakurup'],
    ],
    extra: 'Heavy daily usage: enquiries created by Landscape users; quotes carry ALP department code on letterhead/reference.',
  },
  {
    tamkeen: '3. Guardus Security Co. W.L.L.',
    emsCompany: 'Almoayyed Security (EMS master name)',
    division: 'Security Project',
    codes: 'Dept ASD · Div ALS',
    mappingNote: 'EMS master company name is “Almoayyed Security”; operational division “Security Project”. Quote refs use ASD/ALS (Guardus Security entity).',
    users: 6,
    enquiries: 12,
    quotes: 8,
    quotesNote: '8 formal ASD/ALS quotes prepared by Security staff',
    pricing: '10 pricing rows',
    pipeline: 'Security opportunities in enquiry/quote workflow',
    period: '6 Jan 2026 – 5 Aug 2026',
    userRows: [
      ['Hrishikesh', 'Security Project', 'hrishikesh.s@almoayyedcg.com', 'Active'],
      ['Mahmood Ismail', 'Security Project', 'ismail@almoayyedcg.com', 'Active'],
      ['Saji Kumar', 'Security Project', 'saji.kumar@almoayyedcg.com', 'Active'],
      ['Sam Peethambaran', 'Security Project', 'sam.p@almoayyedcg.com', 'Active'],
      ['Sreejith Asilakumari', 'Security Project', 'sreejith.a@almoayyedcg.com', 'Active'],
      ['Sudheer Menon', 'Security Project', 'sudheer.p@almoayyedcg.com', 'Active'],
    ],
    enqRows: [
      ['768', '2026-08-05', 'THC FACILITY MANAGEMENT', 'THC Marassi Project', 'Enquiry'],
      ['167', '2026-06-22', 'Alnajleen Group', 'Alnajleen Group', 'Enquiry'],
      ['1057', '2026-02-04', 'Rashid Equestrian & Horseracing Club', 'Security Services @ REHC', 'Quote'],
      ['1049', '2026-02-03', 'Ahmadi Industries (Pepsi Factory)', 'Security Services', 'Quote'],
      ['1052', '2026-02-03', 'Meena7 Owners Association', 'Security @ Meena7 Towers Amwaj', 'Quote'],
      ['1046', '2026-01-25', 'Philippine School Bahrain', 'Security Services', 'Quote'],
      ['1031', '2026-01-22', 'Central Bank of Bahrain', 'Female Security appointment', 'Quote'],
      ['1018', '2026-01-21', 'TAHA International', 'RFQ PRF-2026-00025', 'Enquiry'],
    ],
    quoteRows: [
      ['1057', 'ASD/ALS/1057-L1/900-R0', 'Saji Kumar'],
      ['1052', 'ASD/ALS/1052-L1/898-R0', 'Saji Kumar'],
      ['1049', 'ASD/ALS/1049-L1/896-R0', 'Saji Kumar'],
      ['1046', 'ASD/ALS/1046-L1/894-R0', 'Saji Kumar'],
      ['1031', 'ASD/ALS/1031-L1/879-R0', 'Saji Kumar'],
      ['1010', 'ASD/ALS/1010-L1/863-R0', 'Saji Kumar'],
      ['777', 'ASD/ALS/777-L1/620-R0', 'Saji Kumar'],
      ['597', 'ASD/ALS/597-L1/606-R0', 'Saji Kumar'],
    ],
    extra: 'All sample enquiries CreatedBy = Security user (Saji Kumar). Quote numbers prove Security letterhead codes ASD/ALS.',
  },
  {
    tamkeen: '4. Simplex Almoayyed',
    emsCompany: 'Simplex Almoayyed W.L.L',
    division: 'Simplex Project',
    codes: 'Dept SMA · Div SXP',
    users: 4,
    enquiries: 21,
    quotes: 28,
    quotesNote: '11 enquiries with SMA/SXP formal quotes',
    pricing: '24 pricing rows',
    pipeline: 'Active quoting through Aug 2026',
    period: '17 Jun 2026 – 27 Aug 2026',
    userRows: [
      ['Merin Kurian', 'Simplex Project', 'Simplex.Office@almoayyedcg.com', 'Active'],
      ['Mohammad Sharique Kamal', 'Simplex Project', 'Simplex.Design@almoayyedcg.com', 'Active'],
      ['Stefy Mary Simon', 'Simplex Project', 'simplex@almoayyedcg.com', 'Active'],
      ['Udayababu D Achary', 'Simplex Project', 'Udayababu@almoayyedcg.com', 'Active'],
    ],
    enqRows: [
      ['1059', '2026-08-27', 'Arab Constructors W.L.L', '14 storey building at Hidd', 'Enquiry'],
      ['994', '2026-08-19', 'CINQO / Reem al sharq', '14 storey building Al Sayh', 'Quote'],
      ['929', '2026-08-18', 'Ms. Hanan Mejayed', '07 Storey Building at Hidd', 'Quote'],
      ['765', '2026-08-05', 'Nexum Real Estate', '09 Storey Building Juffair', 'Quote'],
      ['732', '2026-08-01', 'Ms. Hanan Mejayed', '07 Storey Building at Hidd', 'Quote'],
      ['819', '2026-08-01', 'Bukamal Properties', '07 Storey Al Suwayfiah', 'Quote'],
      ['609', '2026-07-21', 'Ms. Hanan Mejayed', '07 STOREY BUILDING AT HIDD', 'Enquiry'],
      ['506', '2026-07-13', 'Yaser Ehmoud / Hanan Mejayed', '07 Storey Building at Hidd', 'Quote'],
    ],
    quoteRows: [
      ['506', 'SMA/SXP/506-L1/891-R0', 'Stefy Mary Simon'],
      ['994', 'SMA/SXP/994-L1/839-R0', 'Stefy Mary Simon'],
      ['994', 'SMA/SXP/994-L1/835-R1', 'Stefy Mary Simon'],
      ['929', 'SMA/SXP/929-L1/766-R0', 'Stefy Mary Simon'],
      ['765', 'SMA/SXP/765-L1/680-R1', 'Stefy Mary Simon'],
      ['819', 'SMA/SXP/819-L1/662-R2', 'Stefy Mary Simon'],
    ],
    extra: 'Latest enquiry ReqNo 1059 dated 27 Aug 2026 — same day as this extract. Continuous Simplex usage.',
  },
  {
    tamkeen: '5. Almoayyed Interiors',
    emsCompany: 'Almoayyed Interiors',
    division: 'Interiors Project · Interiors Maint',
    codes: 'Dept AIN · Div INP / INM',
    users: 11,
    enquiries: 29,
    quotes: 21,
    quotesNote: '18 enquiries with AIN formal quotes',
    pricing: '19 pricing rows',
    pipeline: 'Active enquiry/quote cycle Jun–Aug 2026',
    period: '1 Jun 2026 – 23 Aug 2026',
    userRows: [
      ['Ankit Agarwal', 'Interiors Project', 'aiqs2@almoayyedcg.com', 'Active'],
      ['Criston Ramola', 'Interiors Project', 'aiqs3@almoayyedcg.com', 'Active'],
      ['Dileep Parambil', 'Interiors Project', 'Acrqs1@almoayyedcg.com', 'Active'],
      ['Mahesh Kotian', 'Interiors Project', 'mahesh.k@almoayyedcg.com', 'Active'],
      ['Manoj R Nair', 'Interiors Project', 'aidc1@almoayyedcg.com', 'Active'],
      ['Prasanth Divakaren', 'Interiors Project', 'aiqs1@almoayyedcg.com', 'Active'],
      ['Raneesh Manikoth', 'Interiors Project', 'raneeshm@almoayyedcg.com', 'Active'],
      ['Renji Kunchacko', 'Interiors Project', 'aiqs5@almoayyedcg.com', 'Active'],
      ['Sunil M.P.', 'Interiors Project', 'sunil.mp@almoayyedcg.com', 'Active'],
      ['(+2 more Active users)', 'Interiors Project', '—', 'Active'],
    ],
    enqRows: [
      ['1011', '2026-08-23', 'Interiors customer (EMS)', 'Interiors Project opportunity', '—'],
      ['896', '2026-08-12', 'Binaa Al Bahrain', 'Wood Works Package - Bay View', 'Enquiry'],
      ['839', '2026-08-11', 'Mazen Alumran Consulting', 'Nissan Spare Parts Manama', 'Enquiry'],
      ['820', '2026-08-10', 'BMMI', 'Revamp Fit out Alosra Riffa', 'Quote'],
      ['833', '2026-08-10', 'Mirai Architecture', 'Qurayyah Villa turnkey', 'Enquiry'],
      ['886', '2026-08-10', 'University of Bahrain', 'Interior Design Early Childhood', 'Quote'],
    ],
    quoteRows: [
      ['452', 'AIN/INP/452-L1/886-R0', 'Raneesh Manikoth'],
      ['820', 'AIN/INP/820-L1/866-R0', 'Raneesh Manikoth'],
      ['886', 'AIN/INP/886-L1/734-R1', 'Criston Ramola'],
      ['86', 'AIN/INP/86-L1/731-R0', 'Mahesh Kotian'],
      ['782', 'AIN/INP/782-L1/691-R0', 'Raneesh Manikoth'],
      ['182', 'AIN/INP/182-L1/601-R0', 'Renji Kunchacko'],
    ],
    extra: '27 of 29 Interiors enquiries CreatedBy = Manoj R Nair (Interiors user). Quote refs use AIN/INP.',
  },
  {
    tamkeen: '6. CAMAIR',
    emsCompany: 'Cam Air International W.L.L.',
    division: 'Direct Sales - CamAir',
    codes: 'Dept ACG · Div DS (CamAir sales)',
    users: 1,
    enquiries: 7,
    quotes: 13,
    quotesNote: '6+ ACG/DS quotes prepared by camairsales@almoayyedcg.com',
    pricing: '16 pricing rows',
    pipeline: 'Follow Up on linked opportunities',
    period: '2 Jul 2026 – 26 Aug 2026',
    userRows: [
      ['Akhil S K', 'Direct Sales - CamAir', 'camairsales@almoayyedcg.com', 'Active'],
    ],
    enqRows: [
      ['1050', '2026-08-26', 'AJK Unity', 'AL HELLI SUPER MARKET SALMAN CITY', 'Enquiry'],
      ['994', '2026-08-19', 'CINQO / Utility Air Condition', '14 storey Al Sayh (CamAir job)', 'Quote'],
      ['880', '2026-08-10', 'Contratech S.P.C', 'MUHARRAQ DEVELOPMENT PHASE 3', 'Quote'],
      ['1048', '2026-07-28', 'Airmaster Co. W.L.L', 'SW VILLA AT JANABIYA', 'Quote'],
      ['722', '2026-07-23', 'R.P. Construction / Yateem', 'Amakin Pearls Muharraq', 'Quote'],
      ['876', '2026-07-15', 'Yateem Airconditioning', 'Al Hunayniyah & South Saar', 'Quote'],
      ['441', '2026-07-02', 'Arab Architects / BLUE LAKE', 'Mixed Use Development Seef', 'Quote'],
    ],
    quoteRows: [
      ['1048', 'ACG/DS/1048-L1/895-R0', 'Akhil S K (camairsales@)'],
      ['994', 'ACG/DS/994-L2/870-R0', 'Akhil S K (camairsales@)'],
      ['722', 'ACG/DS/722-L2/867-R0', 'Akhil S K (camairsales@)'],
      ['441', 'ACG/DS/441-L2/865-R0', 'Akhil S K (camairsales@)'],
      ['880', 'ACG/DS/880-L1/717-R0', 'Akhil S K (camairsales@)'],
      ['876', 'ACG/DS/876-L1/712-R0', 'Akhil S K (camairsales@)'],
    ],
    extra: 'CamAir enquiries use ItemName “Direct Sales - CamAir” under company Cam Air International W.L.L. Quotes prepared by CamAir sales user.',
  },
];

function hdr(s, pptx, title) {
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.85, fill: { color: NAVY } });
  s.addText('EMS · Tamkeen Usage Evidence Pack', {
    x: 0.45, y: 0.12, w: 9, h: 0.25, fontSize: 11, color: 'A8C0E8', fontFace: 'Calibri',
  });
  s.addText(title, {
    x: 0.45, y: 0.38, w: 12.4, h: 0.4, fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri',
  });
}

function ftr(s, page) {
  s.addText('Confidential · Almoayyed Contracting Group · ' + SNAPSHOT + ' · System-generated records (not marketing scope)', {
    x: 0.45, y: 7.15, w: 11.5, h: 0.25, fontSize: 9, color: '8A94A6', fontFace: 'Calibri',
  });
  s.addText(String(page), {
    x: 12.2, y: 7.15, w: 0.7, h: 0.25, fontSize: 9, color: '8A94A6', fontFace: 'Calibri', align: 'right',
  });
}

function tableHeader(cells) {
  return cells.map((t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY } } }));
}

async function main() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'EMS System Extract';
  pptx.title = 'EMS Tamkeen Usage Evidence — Six Companies';
  pptx.subject = 'Operational usage evidence for Tamkeen';

  let page = 1;

  // 1 Cover
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addText('TAMKEEN SUPPORTING EVIDENCE', {
      x: 0.7, y: 1.5, w: 12, h: 0.35, fontSize: 14, color: 'A8C0E8', bold: true, fontFace: 'Calibri', charSpacing: 2,
    });
    s.addText('EMS Operational Usage Evidence', {
      x: 0.7, y: 2.0, w: 12, h: 0.6, fontSize: 32, bold: true, color: WHITE, fontFace: 'Calibri',
    });
    s.addText('System-generated users, enquiries, quotes, and pipeline records\nconfirming live usage for the six requested companies.', {
      x: 0.7, y: 2.8, w: 11.5, h: 0.8, fontSize: 16, color: 'C5D4EE', fontFace: 'Calibri',
    });
    const names = entities.map((e) => e.tamkeen.replace(/^\d+\.\s*/, '')).join('  ·  ');
    s.addText(names, {
      x: 0.7, y: 4.0, w: 12, h: 0.7, fontSize: 13, color: WHITE, fontFace: 'Calibri',
    });
    s.addText(SNAPSHOT + '\nSource: Microsoft SQL Server EMS_DB production · On-premise Enquiry Management System', {
      x: 0.7, y: 5.5, w: 12, h: 0.7, fontSize: 12, color: '9BB0D4', fontFace: 'Calibri',
    });
    s.addText('Prepared for Investor / Tamkeen office · Almoayyed Contracting Group', {
      x: 0.7, y: 6.7, w: 12, h: 0.3, fontSize: 12, color: '9BB0D4', fontFace: 'Calibri',
    });
  }

  // 2 Purpose
  {
    const s = pptx.addSlide();
    hdr(s, pptx, 'Purpose of this pack');
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.45, y: 1.15, w: 12.4, h: 1.5, fill: { color: 'E8EEF8' }, rectRadius: 0.08,
    });
    s.addText(
      'Tamkeen requested evidence that EMS is actually used by each of the six listed companies — not a description of system scope. This pack extracts live production records (users, enquiries, quote references, pipeline) from EMS_DB for each entity.',
      { x: 0.7, y: 1.35, w: 12, h: 1.15, fontSize: 15, color: NAVY, fontFace: 'Calibri', valign: 'middle' }
    );
    const points = [
      ['What is included', 'Active EMS users per company division; sample enquiry transactions (Request No, date, customer, project, status); formal quote reference numbers with company department/division codes; pipeline/won counts where available.'],
      ['How companies are identified', 'EMS Master_EnquiryFor.CompanyName + division ItemName; user Department; QuoteNumber prefix (e.g. ALP/…, ASD/ALS/…, SMA/SXP/…, AIN/INP/…, ACG/DS/…).'],
      ['Video / screenshots', 'This PPTX is the data evidence pack. For the requested video: open each Request No / Quote No in live EMS and screen-record Enquiry, Quote, and Report screens for each company (suggested demo path on last slide).'],
    ];
    points.forEach((p, i) => {
      const y = 2.9 + i * 1.25;
      s.addText(p[0], { x: 0.55, y, w: 12.2, h: 0.3, fontSize: 14, bold: true, color: BLUE, fontFace: 'Calibri' });
      s.addText(p[1], { x: 0.55, y: y + 0.3, w: 12.2, h: 0.8, fontSize: 13, color: GRAY, fontFace: 'Calibri' });
    });
    ftr(s, ++page);
  }

  // 3 Summary
  {
    const s = pptx.addSlide();
    hdr(s, pptx, 'Usage summary — all six entities');
    s.addTable(
      [
        tableHeader(['Tamkeen entity', 'EMS company / division', 'Users', 'Enquiries', 'Quotes*', 'Evidence period']),
        ['Almoayyed Aluminium', 'Almoayyed Aluminium W.L.L. / Aluminium', '4', '4', 'Job on bids†', 'Apr–Jun 2026'],
        ['Almoayyed Landscapes and Pools', 'Landscapes & Swimming Pools / LDP+LDM', '7', '105', '130', 'May–Aug 2026'],
        ['Guardus Security Co. W.L.L.', 'Almoayyed Security / Security Project', '6', '12', '8 (ASD/ALS)', 'Jan–Aug 2026'],
        ['Simplex Almoayyed', 'Simplex Almoayyed W.L.L / Simplex Project', '4', '21', '28 (SMA/SXP)', 'Jun–Aug 2026'],
        ['Almoayyed Interiors', 'Almoayyed Interiors / INP+INM', '11', '29', '21 (AIN)', 'Jun–Aug 2026'],
        ['CAMAIR', 'Cam Air International / Direct Sales-CamAir', '1', '7', '13 (ACG/DS)', 'Jul–Aug 2026'],
      ],
      {
        x: 0.35, y: 1.2, w: 12.6, colW: [2.8, 4.0, 1.0, 1.3, 1.7, 1.8],
        border: [
          { pt: 0.5, color: 'D8DEE9' },
          { pt: 0.5, color: 'D8DEE9' },
          { pt: 0.5, color: 'D8DEE9' },
          { pt: 0.5, color: 'D8DEE9' },
        ],
        fontFace: 'Calibri', fontSize: 11, color: NAVY, valign: 'middle',
      }
    );
    s.addText(
      '* Quotes counted from EnquiryQuotes linked to the company division (or QuoteNumber department/division code).\n† Aluminium: 4 Active users + Aluminium job on ReqNos 134/34/18/53; dedicated ACA/AFP quote letterhead not yet issued — see Aluminium slides.',
      { x: 0.45, y: 5.5, w: 12.4, h: 1.2, fontSize: 12, color: GRAY, fontFace: 'Calibri' }
    );
    ftr(s, ++page);
  }

  // Per entity: overview + users, then transactions
  entities.forEach((ent) => {
    // Overview
    {
      const s = pptx.addSlide();
      hdr(s, pptx, ent.tamkeen);
      s.addText(ent.emsCompany + '  ·  ' + ent.division + '  ·  ' + ent.codes, {
        x: 0.45, y: 1.0, w: 12.4, h: 0.3, fontSize: 13, color: BLUE, fontFace: 'Calibri',
      });
      if (ent.mappingNote) {
        s.addText(ent.mappingNote, {
          x: 0.45, y: 1.3, w: 12.4, h: 0.45, fontSize: 12, color: AMBER, fontFace: 'Calibri',
        });
      }
      const metricsY = ent.mappingNote ? 1.85 : 1.45;
      const metrics = [
        { v: String(ent.users), l: 'Active users' },
        { v: String(ent.enquiries), l: 'Enquiries' },
        { v: String(ent.quotes), l: 'Formal quotes' },
        { v: ent.period.split('–')[0].trim().slice(0, 12), l: 'Activity from' },
      ];
      metrics.forEach((m, i) => {
        const x = 0.45 + i * 3.15;
        s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x, y: metricsY, w: 3.0, h: 1.15, fill: { color: LIGHT }, rectRadius: 0.08,
        });
        s.addText(m.v, {
          x, y: metricsY + 0.15, w: 3.0, h: 0.5, fontSize: 22, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center',
        });
        s.addText(m.l, {
          x, y: metricsY + 0.7, w: 3.0, h: 0.3, fontSize: 12, color: GRAY, fontFace: 'Calibri', align: 'center',
        });
      });

      s.addText('Registered EMS users (Master_ConcernedSE · Status = Active)', {
        x: 0.45, y: metricsY + 1.35, w: 12, h: 0.3, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri',
      });
      s.addTable(
        [tableHeader(['Full name', 'Division (Department)', 'Email (login)', 'Status']), ...ent.userRows],
        {
          x: 0.35, y: metricsY + 1.7, w: 12.6, colW: [3.2, 3.2, 4.5, 1.7],
          border: [
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
          ],
          fontFace: 'Calibri', fontSize: 11, color: NAVY, valign: 'middle',
        }
      );
      ftr(s, ++page);
    }

    // Transactions
    {
      const s = pptx.addSlide();
      hdr(s, pptx, ent.tamkeen + ' — Transaction evidence');
      s.addText('Sample enquiries from EMS_DB (EnquiryMaster + EnquiryFor)', {
        x: 0.45, y: 1.0, w: 12, h: 0.28, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri',
      });
      s.addTable(
        [
          tableHeader(['Req No', 'Date', 'Customer', 'Project', 'Status']),
          ...ent.enqRows,
        ],
        {
          x: 0.3, y: 1.3, w: 12.7, colW: [1.0, 1.3, 3.5, 5.2, 1.7],
          border: [
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
          ],
          fontFace: 'Calibri', fontSize: 10, color: NAVY, valign: 'middle',
        }
      );

      const qY = 1.3 + 0.35 * (ent.enqRows.length + 1) + 0.25;
      s.addText('Sample formal quotes (EnquiryQuotes · system QuoteNumber)', {
        x: 0.45, y: qY, w: 12, h: 0.28, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri',
      });
      s.addTable(
        [tableHeader(['Req No', 'Quote reference (system-generated)', 'Prepared by']), ...ent.quoteRows],
        {
          x: 0.3, y: qY + 0.3, w: 12.7, colW: [1.2, 6.5, 5.0],
          border: [
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
            { pt: 0.5, color: 'D8DEE9' },
          ],
          fontFace: 'Calibri', fontSize: 10, color: NAVY, valign: 'middle',
        }
      );

      s.addText(ent.extra, {
        x: 0.45, y: 6.55, w: 12.4, h: 0.5, fontSize: 11, color: GRAY, fontFace: 'Calibri',
      });
      ftr(s, ++page);
    }
  });

  // Aggregate chart slide
  {
    const s = pptx.addSlide();
    hdr(s, pptx, 'Comparative usage volume (live EMS_DB)');
    s.addChart(pptx.charts.BAR, [
      {
        name: 'Enquiries',
        labels: ['Aluminium', 'Landscapes', 'Guardus Sec.', 'Simplex', 'Interiors', 'CAMAIR'],
        values: [4, 105, 12, 21, 29, 7],
      },
      {
        name: 'Quotes',
        labels: ['Aluminium', 'Landscapes', 'Guardus Sec.', 'Simplex', 'Interiors', 'CAMAIR'],
        values: [0, 130, 8, 28, 21, 13],
      },
      {
        name: 'Users',
        labels: ['Aluminium', 'Landscapes', 'Guardus Sec.', 'Simplex', 'Interiors', 'CAMAIR'],
        values: [4, 7, 6, 4, 11, 1],
      },
    ], {
      x: 0.4, y: 1.15, w: 12.5, h: 5.5,
      barGrouping: 'clustered',
      showValue: true,
      showLegend: true,
      legendPos: 'b',
      chartColors: [BLUE, GREEN, AMBER],
      catAxisLabelColor: GRAY,
      valAxisHidden: false,
    });
    ftr(s, ++page);
  }

  // Attestation + video guide
  {
    const s = pptx.addSlide();
    hdr(s, pptx, 'Attestation & recommended video capture path');
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.45, y: 1.15, w: 12.4, h: 2.0, fill: { color: 'E8EEF8' }, rectRadius: 0.08,
    });
    s.addText('Attestation', {
      x: 0.7, y: 1.3, w: 12, h: 0.3, fontSize: 14, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    s.addText(
      'The Request Numbers, Quote Numbers, user accounts, and counts in this pack were extracted from the live EMS production database (EMS_DB) on 27 August 2026. They represent operational transactions created by company users in the Enquiry Management System, not hypothetical or demo-only data.',
      { x: 0.7, y: 1.7, w: 11.9, h: 1.2, fontSize: 13, color: GRAY, fontFace: 'Calibri' }
    );

    s.addText('Suggested screen-recording sequence (for Tamkeen video requirement)', {
      x: 0.45, y: 3.4, w: 12, h: 0.35, fontSize: 14, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    const steps = [
      '1. Login as (or filter by) each company division user → show Active user profile / Department.',
      '2. Enquiry module → open sample Req Nos from this pack → show customer, project, Enquiry-For job = company division.',
      '3. Quote module → open QuoteNumber with company code (ALP, ASD/ALS, SMA/SXP, AIN, ACG/DS) → show PDF/preview.',
      '4. Sales Report / Probability → filter by division → show charts/records for that company.',
      '5. Repeat for all six entities (≈1–2 minutes each). Use Req Nos listed in this deck.',
    ];
    steps.forEach((t, i) => {
      s.addText(t, {
        x: 0.55, y: 3.85 + i * 0.45, w: 12.2, h: 0.4, fontSize: 13, color: GRAY, fontFace: 'Calibri',
      });
    });
    ftr(s, ++page);
  }

  // Closing
  {
    const s = pptx.addSlide();
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: NAVY } });
    s.addText('Conclusion', {
      x: 0.8, y: 2.0, w: 11.5, h: 0.4, fontSize: 14, color: 'A8C0E8', bold: true, fontFace: 'Calibri',
    });
    s.addText(
      'EMS is in operational use across all six Tamkeen-requested entities, evidenced by active user accounts and live enquiry/quote transactions in the production database.',
      { x: 0.8, y: 2.6, w: 11.5, h: 1.5, fontSize: 20, color: WHITE, fontFace: 'Calibri' }
    );
    s.addText(
      'Strongest transaction volume: Landscapes (105 enquiries / 130 quotes). Clear coded quotes: Guardus/Security (ASD/ALS), Simplex (SMA/SXP), Interiors (AIN), CAMAIR (ACG/DS). Aluminium: registered users + job assignment on live multi-discipline enquiries.',
      { x: 0.8, y: 4.4, w: 11.5, h: 1.2, fontSize: 14, color: 'C5D4EE', fontFace: 'Calibri' }
    );
    s.addText(SNAPSHOT + ' · Confidential', {
      x: 0.8, y: 6.5, w: 11.5, h: 0.3, fontSize: 12, color: '9BB0D4', fontFace: 'Calibri',
    });
  }

  await pptx.writeFile({ fileName: OUT });
  console.log('Wrote ' + OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

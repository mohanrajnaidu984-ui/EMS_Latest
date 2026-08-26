import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, Header, Footer,
} from "docx";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "docs", "EMS_Scope_of_Work.docx");

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLUE = "1F4E79";
const LIGHT_BLUE = "D6E4F0";
const DARK_TEXT = "1A1A1A";
const ACCENT = "2E75B6";
const TABLE_HEADER_BG = "2E75B6";
const TABLE_ALT = "EBF3FB";
const WHITE = "FFFFFF";

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    run: { color: BLUE, bold: true, size: 28 },
  });
}

function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 24 })],
    spacing: { before: 280, after: 80 },
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: DARK_TEXT, ...opts })],
    spacing: { before: 80, after: 80 },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: `\u2022  ${text}`, size: 22, color: DARK_TEXT })],
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { before: 80, after: 80 } });
}

function tableCell(text, isHeader = false, shade = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({
          text,
          bold: isHeader,
          color: isHeader ? WHITE : DARK_TEXT,
          size: isHeader ? 20 : 20,
        })],
        alignment: AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
      }),
    ],
    shading: isHeader
      ? { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG }
      : shade
      ? { type: ShadingType.CLEAR, fill: TABLE_ALT }
      : { type: ShadingType.CLEAR, fill: WHITE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(h => tableCell(h, true)),
      }),
      ...rows.map((row, i) =>
        new TableRow({
          children: row.map(cell => tableCell(cell, false, i % 2 === 1)),
        })
      ),
    ],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: ACCENT },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT },
      left:   { style: BorderStyle.SINGLE, size: 4, color: ACCENT },
      right:  { style: BorderStyle.SINGLE, size: 4, color: ACCENT },
      insideH:{ style: BorderStyle.SINGLE, size: 2, color: "C0D6E8" },
      insideV:{ style: BorderStyle.SINGLE, size: 2, color: "C0D6E8" },
    },
  });
}

// ── Title block ───────────────────────────────────────────────────────────────

const titleBlock = [
  new Paragraph({
    children: [new TextRun({ text: "SCOPE OF WORK", bold: true, size: 56, color: BLUE })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 160 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Enquiry Management System (EMS)", bold: true, size: 36, color: ACCENT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Almoayyed Contracting Group", size: 26, color: DARK_TEXT })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Document Type: Tender Scope of Work  |  Date: August 2026", size: 22, color: "555555", italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Prepared by: Mohan Naidu", size: 22, color: "555555", italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
  }),
];

// ── Section 1: Project Overview ───────────────────────────────────────────────

const section1 = [
  heading1("1. Project Overview"),
  body(
    "The Enquiry Management System (EMS) is a custom, full-stack web application that manages the complete sales and enquiry lifecycle for Almoayyed Contracting Group — from initial customer contact through pricing, formal quotation, multi-level approval, pipeline tracking, and management reporting."
  ),
  body(
    "The system is to be developed as an internal enterprise platform accessible via a web browser, hosted on company infrastructure, and integrated with the organisation's Microsoft SQL Server database environment."
  ),
];

// ── Section 2: Technology Stack ───────────────────────────────────────────────

const section2 = [
  heading1("2. Technology Stack"),
  makeTable(
    ["Layer", "Technology"],
    [
      ["Frontend", "React 19 (JSX / TSX)"],
      ["Backend", "Node.js 22, Express 5"],
      ["Database", "Microsoft SQL Server"],
      ["Authentication", "JWT-based session management"],
      ["Email Integration", "SMTP / Outlook draft generation"],
      ["PDF Export", "Server-side A4 protected PDF rendering"],
      ["Deployment", "IIS (Windows Server)"],
    ]
  ),
];

// ── Section 3: Modules ────────────────────────────────────────────────────────

const section3 = [
  heading1("3. Modules & Functional Scope"),

  heading2("Module 1 — Authentication & User Management"),
  bullet("Email-based login with hashed password storage"),
  bullet("First-time password setup flow"),
  bullet("Role-based access control (Admin, Sales Engineer, Division Manager, Approver)"),
  bullet("User master management"),

  heading2("Module 2 — Enquiry Management (Core)"),
  bullet("Register new enquiries with full customer, stakeholder, and project details"),
  bullet("Assign multiple customers per enquiry (for split-quote scenarios)"),
  bullet("Assign Lead Job and Sub-Jobs with automatic Division/Department code derivation"),
  bullet("Upload and manage received documents and attachments"),
  bullet("Modify and version-track existing enquiries"),
  bullet("Auto-generate unique Enquiry (Request) Numbers"),
  bullet("Automated acknowledgement email on submission"),
  bullet("Enquiry search, filter, and status tracking"),

  heading2("Module 3 — Pricing Engine"),
  bullet("Load enquiry scope by Request Number"),
  bullet("Enter multi-line cost breakdowns (Material, Labour, Overheads) per job/item"),
  bullet("Support for Lead Job and Sub-Job pricing layers"),
  bullet("Per-customer pricing tabs for multi-customer enquiries"),
  bullet("Division-level access control for pricing data"),
  bullet("Validation: zero-value filtering, duplicate prevention"),
  bullet("Persist pricing to PricingMaster and PricingDetail tables"),

  heading2("Module 4 — Quoting System"),
  bullet("Generate formal quotations from approved pricing data"),
  bullet("Auto-construct quote reference: DeptCode/DivCode/ReqNo-JobPrefix/QuoteNo-RevNo"),
  bullet("Rich-text clause editor (Scope, Payment Terms, Warranty, Custom clauses)"),
  bullet("Clause reordering and editing within quote body"),
  bullet("A4-formatted print/preview layout"),
  bullet("Protected PDF export (print-only, no copy/edit)"),
  bullet("Draft and Final quote versioning"),
  bullet("Quote revision workflow (R0 → R1 → Rn)"),
  bullet("Customer-specific 'To' address population"),

  heading2("Module 5 — Approval Workflow"),
  bullet("Multi-step approval routing based on job type and division"),
  bullet("Cross-division approver rule configuration"),
  bullet("Digital sign-off at each approval stage"),
  bullet("Full audit trail of approval actions and timestamps"),
  bullet("Email notifications to approvers at each stage"),

  heading2("Module 6 — Probability / Pipeline Tracking"),
  bullet("Record and update opportunity status: Won, Lost, Follow Up, On Hold, Cancelled, Retendered"),
  bullet("Assign ownership context (SE, Division) per opportunity"),
  bullet("Filter and view pipeline by status, SE, division, and date range"),

  heading2("Module 7 — Dashboard & Analytics"),
  bullet("KPI summary cards: Active Enquiries, Pending Quotes, Approvals Pending"),
  bullet("Dual calendar views for enquiry and quote due dates"),
  bullet("Division and Sales Engineer filter controls"),
  bullet("Enquiry drill-down from dashboard tiles"),

  heading2("Module 8 — Sales Reports & Targets"),
  bullet("Performance charts: individual and division-level"),
  bullet("Top-jobs analysis by value"),
  bullet("Goal vs. actual tracking against defined sales targets"),
  bullet("Excel export for reporting"),

  heading2("Module 9 — Notifications & Integrations"),
  bullet("In-app notification centre for workflow events"),
  bullet("SMTP email triggers (acknowledgements, approvals, reminders)"),
  bullet("Outlook draft generation for manual review before sending"),
  bullet("OCR-assisted contact capture from uploaded documents"),

  heading2("Module 10 — System Administration"),
  bullet("Master data management: Customers, Services/Divisions, Users, Clauses"),
  bullet("Database schema management and migration scripts"),
  bullet("Deployment configuration for IIS/Windows Server"),
  bullet("Help module for user guidance"),
];

// ── Section 4: Database Scope ─────────────────────────────────────────────────

const section4 = [
  heading1("4. Database Scope"),
  bullet("Design and delivery of full relational schema on Microsoft SQL Server"),
  bullet("Minimum 35–40 tables covering master data, transactional records, audit logs, and configuration"),
  bullet("Migration scripts for version-controlled schema evolution"),
  bullet("Stored procedures / views as required for reporting queries"),
];

// ── Section 5: Non-Functional Requirements ────────────────────────────────────

const section5 = [
  heading1("5. Non-Functional Requirements"),
  makeTable(
    ["Requirement", "Expectation"],
    [
      ["Concurrent users", "Up to 50 internal users"],
      ["Browser support", "Chrome, Edge (latest 2 versions)"],
      ["Uptime", "Business hours availability; hosted on-premise"],
      ["Security", "Role-based access, hashed credentials, no public exposure"],
      ["PDF export", "Password-protected, print-only"],
      ["Data residency", "On-premise MS SQL Server; no cloud data storage"],
    ]
  ),
];

// ── Section 6: Deliverables ───────────────────────────────────────────────────

const section6 = [
  heading1("6. Deliverables"),
  bullet("Full source code (React frontend, Node.js/Express backend)"),
  bullet("Database schema scripts and seed/migration files"),
  bullet("IIS deployment guide and configuration files"),
  bullet("User manual / onboarding documentation"),
  bullet("System administration guide"),
  bullet("3-month post-go-live support period"),
];

// ── Section 7: Timeline ───────────────────────────────────────────────────────

const section7 = [
  heading1("7. Estimated Effort & Timeline"),
  makeTable(
    ["Phase", "Description", "Duration"],
    [
      ["Phase 1", "Requirements finalisation, UI/UX design, DB schema", "4–6 weeks"],
      ["Phase 2", "Core modules: Auth, Enquiry, Pricing", "10–14 weeks"],
      ["Phase 3", "Quote, Approval Workflow, Notifications", "10–14 weeks"],
      ["Phase 4", "Dashboard, Pipeline, Sales Reports", "6–8 weeks"],
      ["Phase 5", "Integration, testing, UAT, deployment", "6–8 weeks"],
      ["Total", "", "~18–24 months (full team) / 12–15 months (accelerated)"],
    ]
  ),
];

// ── Section 8: Commercial Estimate ───────────────────────────────────────────

const section8 = [
  heading1("8. Commercial Estimate"),
  makeTable(
    ["Item", "Range (BHD)"],
    [
      ["One-time development (full scope)", "45,000 – 60,000"],
      ["Annual support & maintenance", "5,000 – 8,000 / year"],
      ["Optional — training & onboarding", "1,500 – 3,000"],
    ]
  ),
  spacer(),
  body(
    "Estimates are based on GCC market rates for enterprise custom web application development. Final pricing subject to detailed requirements review.",
    { italics: true, color: "555555" }
  ),
];

// ── Section 9: Exclusions ─────────────────────────────────────────────────────

const section9 = [
  heading1("9. Exclusions"),
  bullet("Mobile application (iOS / Android) — web responsive only"),
  bullet("ERP or third-party system integration (unless separately scoped)"),
  bullet("Cloud hosting or SaaS infrastructure"),
  bullet("HR, payroll, or finance module functionality"),
];

// ── Footer note ───────────────────────────────────────────────────────────────

const footerNote = [
  spacer(),
  new Paragraph({
    children: [new TextRun({
      text: "This Scope of Work is prepared as a basis for tender evaluation. Final scope, timelines, and commercial terms are subject to negotiation and sign-off by both parties.",
      italics: true,
      size: 18,
      color: "777777",
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 80 },
  }),
];

// ── Assemble & write ──────────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, color: BLUE },
        paragraph: { spacing: { before: 360, after: 120 } },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "EMS — Enquiry Management System  |  Scope of Work", size: 18, color: "777777" }),
              ],
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C0D6E8", space: 4 } },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Almoayyed Contracting Group  |  Confidential", size: 16, color: "999999" }),
                new TextRun({ text: "  |  Page ", size: 16, color: "999999" }),
                new TextRun({ text: "", size: 16, color: "999999" }),
              ],
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "C0D6E8", space: 4 } },
            }),
          ],
        }),
      },
      children: [
        ...titleBlock,
        ...section1,
        ...section2,
        spacer(),
        ...section3,
        ...section4,
        ...section5,
        spacer(),
        ...section6,
        ...section7,
        spacer(),
        ...section8,
        ...section9,
        ...footerNote,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log("Done:", outPath);

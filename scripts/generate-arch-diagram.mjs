/**
 * Generates EMS_Architecture_Diagram.docx — a visual block diagram
 * of the EMS Application Layer, mirroring the canvas layout.
 */
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  WidthType, AlignmentType, VerticalAlign,
  BorderStyle, ShadingType,
  Header, Footer,
} from "docx";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "docs", "EMS_Architecture_Diagram.docx");

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  BLUE_DARK:    "1F4E79",
  BLUE_MID:     "2E75B6",
  BLUE_LIGHT:   "BDD7EE",
  BLUE_PALE:    "DEEAF1",
  GREEN_DARK:   "1E5631",
  GREEN_MID:    "2E8B57",
  GREEN_LIGHT:  "C6EFCE",
  GREEN_PALE:   "E2EFDA",
  GREY_DARK:    "404040",
  GREY_MID:     "767676",
  GREY_LIGHT:   "D9D9D9",
  GREY_PALE:    "F2F2F2",
  WHITE:        "FFFFFF",
  DB_GREY:      "595959",
  DB_PALE:      "EDEDED",
};

// ── Shared border helpers ─────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: C.WHITE };
const thinBlue  = { style: BorderStyle.SINGLE, size: 4,  color: C.BLUE_MID  };
const thinGreen = { style: BorderStyle.SINGLE, size: 4,  color: C.GREEN_MID };
const thinGrey  = { style: BorderStyle.SINGLE, size: 2,  color: C.GREY_LIGHT };
const thickBlue  = { style: BorderStyle.SINGLE, size: 12, color: C.BLUE_MID  };
const thickGreen = { style: BorderStyle.SINGLE, size: 12, color: C.GREEN_MID };

function allBorders(b) {
  return { top: b, bottom: b, left: b, right: b };
}
function panelBordersBlue()  { return { top: thickBlue,  bottom: thickBlue,  left: thickBlue,  right: thickBlue  }; }
function panelBordersGreen() { return { top: thickGreen, bottom: thickGreen, left: thickGreen, right: thickGreen }; }

// ── Paragraph helpers ─────────────────────────────────────────────────────────
function p(text, opts = {}) {
  const {
    bold = false, italic = false, color = C.GREY_DARK,
    size = 18, align = AlignmentType.CENTER,
    spaceBefore = 0, spaceAfter = 0,
  } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { before: spaceBefore, after: spaceAfter },
    children: [new TextRun({ text, bold, italic, color, size })],
  });
}

function emptyP() {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

// ── Cell helpers ──────────────────────────────────────────────────────────────
function headerCell(text, fillColor, textColor, borders, colspan = 1) {
  return new TableCell({
    columnSpan: colspan,
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: fillColor },
    borders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [p(text, { bold: true, color: textColor, size: 20 })],
  });
}

function moduleItemCell(text, fillColor, borders) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: fillColor },
    borders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [p(text, { color: C.GREY_DARK, size: 16 })],
  });
}

function blankCell(fillColor = C.WHITE, borders = allBorders(noBorder), colspan = 1) {
  return new TableCell({
    columnSpan: colspan,
    shading: { type: ShadingType.CLEAR, fill: fillColor },
    borders,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [emptyP()],
  });
}

function labelCell(text, color, fillColor, borders, colspan = 1, size = 16) {
  return new TableCell({
    columnSpan: colspan,
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, fill: fillColor },
    borders,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [p(text, { color, size })],
  });
}

// ── Module data ───────────────────────────────────────────────────────────────
const ENQ = [
  "Enquiry Registration",
  "Multi-Customer Assignment",
  "Job & Division Hierarchy",
  "Document Attachments",
  "SE / Team Assignment",
  "Status Tracking",
  "Auto Acknowledgement Email",
];
const PRC = [
  "Load Enquiry Scope",
  "Lead & Sub-Job Costing",
  "Per-Customer Pricing Tabs",
  "Material / Labour / Overhead",
  "Division Access Control",
  "Duplicate Prevention",
];
const QTE = [
  "Auto Quote Reference",
  "Rich-Text Clause Editor",
  "A4 Print Preview",
  "Protected PDF Export",
  "Draft & Final Versioning",
  "Revision Workflow (R0→Rn)",
];
const APR = [
  "Multi-Step Routing",
  "Cross-Division Approver Rules",
  "Digital Sign-Off",
  "Audit Trail",
  "Approval Email Notifications",
];
const PPL = [
  "Won / Lost / Follow Up",
  "On Hold / Cancelled / Retendered",
  "SE & Division Ownership",
  "Pipeline Filter Views",
];
const DSH = [
  "KPI Summary Cards",
  "Dual Calendar Views",
  "Division & SE Filters",
  "Enquiry Drill-Down",
  "Sales Targets vs Actual",
  "Excel Export",
];

// Pad all columns to the same length
const maxRows = Math.max(ENQ.length, PRC.length, QTE.length, APR.length, PPL.length, DSH.length);
function pad(arr) {
  const out = [...arr];
  while (out.length < maxRows) out.push("");
  return out;
}
const [E, P, Q, A, L, D] = [ENQ, PRC, QTE, APR, PPL, DSH].map(pad);

// ── Build the main module grid (9 columns: 3 blue + gap + 3 green) ─────────────
// Column layout (each "panel" = 3 module cols, with a narrow gap col between panels)
// Col widths: E=16, P=16, Q=16, gap=3, A=14, L=14, D=14  (% of page)

function moduleItemRow(i) {
  const itemBorderBlue  = { top: thinGrey, bottom: thinGrey, left: thinBlue,  right: thinBlue  };
  const itemBorderGreen = { top: thinGrey, bottom: thinGrey, left: thinGreen, right: thinGreen };

  function itemCell(text, isBlue) {
    const fill = text === "" ? (isBlue ? C.BLUE_PALE : C.GREEN_PALE) : C.WHITE;
    const borders = isBlue ? itemBorderBlue : itemBorderGreen;
    return moduleItemCell(text, fill, borders);
  }

  return new TableRow({
    children: [
      itemCell(E[i], true),
      itemCell(P[i], true),
      itemCell(Q[i], true),
      blankCell(C.WHITE, allBorders(noBorder)),          // gap
      itemCell(A[i], false),
      itemCell(L[i], false),
      itemCell(D[i], false),
    ],
  });
}

const moduleColHeaderBorderBlue  = { top: thickBlue,  bottom: thinGrey,  left: thickBlue,  right: thickBlue  };
const moduleColHeaderBorderGreen = { top: thickGreen, bottom: thinGrey,  left: thickGreen, right: thickGreen };
const moduleColFooterBorderBlue  = { top: thinGrey,   bottom: thickBlue, left: thickBlue,  right: thickBlue  };
const moduleColFooterBorderGreen = { top: thinGrey,   bottom: thickGreen,left: thickGreen, right: thickGreen };

const moduleGrid = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: [2200, 2200, 2200, 300, 2000, 2000, 2000], // in twentieths of a point (twips); total ~14900
  rows: [
    // ── Sub-header row: module column titles ──────────────────────────────────
    new TableRow({
      children: [
        headerCell("Enquiry Management", C.BLUE_MID, C.WHITE, moduleColHeaderBorderBlue),
        headerCell("Pricing Engine",     C.BLUE_MID, C.WHITE, moduleColHeaderBorderBlue),
        headerCell("Quoting System",     C.BLUE_MID, C.WHITE, moduleColHeaderBorderBlue),
        blankCell(C.WHITE, allBorders(noBorder)),
        headerCell("Approval Workflow",  C.GREEN_MID, C.WHITE, moduleColHeaderBorderGreen),
        headerCell("Pipeline Tracking",  C.GREEN_MID, C.WHITE, moduleColHeaderBorderGreen),
        headerCell("Dashboard & Reports",C.GREEN_MID, C.WHITE, moduleColHeaderBorderGreen),
      ],
    }),
    // ── Item rows ─────────────────────────────────────────────────────────────
    ...Array.from({ length: maxRows }, (_, i) => moduleItemRow(i)),
  ],
});

// ── Panel label row (Sales & CRM | gap | Operations & Management) ─────────────
const panelLabelTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: [6600, 300, 6000],
  rows: [
    new TableRow({
      children: [
        headerCell("Sales & CRM Interface", C.BLUE_LIGHT, C.BLUE_DARK, panelBordersBlue()),
        blankCell(C.WHITE, allBorders(noBorder)),
        headerCell("Operations & Management Interface", C.GREEN_LIGHT, C.GREEN_DARK, panelBordersGreen()),
      ],
    }),
  ],
});

// ── Arrow row ─────────────────────────────────────────────────────────────────
const arrowTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: [6600, 300, 6000],
  rows: [
    new TableRow({
      children: [
        labelCell("↓", C.BLUE_MID,  C.WHITE, allBorders(noBorder), 1, 28),
        blankCell(C.WHITE, allBorders(noBorder)),
        labelCell("↓", C.GREEN_MID, C.WHITE, allBorders(noBorder), 1, 28),
      ],
    }),
  ],
});

// ── Interface boxes + DB row ──────────────────────────────────────────────────
const interfaceRow = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: [3800, 600, 900, 600, 900, 600, 3800],
  rows: [
    new TableRow({
      children: [
        // Admin / CRM box
        headerCell("Admin / CRM Interface", C.BLUE_PALE, C.BLUE_DARK,
          { top: thickBlue, bottom: thickBlue, left: thickBlue, right: thickBlue }),
        blankCell(C.WHITE, allBorders(noBorder)),
        // ← line
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.WHITE },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
            insideH: noBorder, insideV: noBorder },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [p("◄────", { color: C.GREY_MID, size: 16 })],
        }),
        // DB cylinder (text approximation)
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.DB_PALE },
          borders: allBorders(thinGrey),
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            p("MS SQL Server", { bold: true, color: C.DB_GREY, size: 17 }),
            p("EMS_DB", { color: C.GREY_MID, size: 15 }),
          ],
        }),
        // ────► line
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.WHITE },
          borders: allBorders(noBorder),
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [p("────►", { color: C.GREY_MID, size: 16 })],
        }),
        blankCell(C.WHITE, allBorders(noBorder)),
        // Admin / Operations box
        headerCell("Admin / Operations Interface", C.GREEN_PALE, C.GREEN_DARK,
          { top: thickGreen, bottom: thickGreen, left: thickGreen, right: thickGreen }),
      ],
    }),
  ],
});

// ── System Administration strip ───────────────────────────────────────────────
const ADMIN = [
  "User & Role Management",
  "Customer Master",
  "Services & Division Master",
  "Clause Library",
  "Notification Centre",
  "OCR Contact Capture",
];

const adminTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: Array(ADMIN.length).fill(Math.floor(12900 / ADMIN.length)),
  rows: [
    new TableRow({
      children: ADMIN.map(mod =>
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.GREY_PALE },
          borders: allBorders(thinGrey),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [p(mod, { color: C.GREY_DARK, size: 15 })],
        })
      ),
    }),
  ],
});

// ── Tech stack strip ──────────────────────────────────────────────────────────
const STACK = [
  ["Frontend", "React 19"],
  ["Backend",  "Node.js 22\nExpress 5"],
  ["Database", "MS SQL\nServer"],
  ["Auth",     "JWT\nSessions"],
  ["Email",    "SMTP /\nOutlook"],
  ["PDF",      "Protected\nA4 Export"],
  ["Deploy",   "IIS /\nWindows"],
  ["OCR",      "Contact\nCapture"],
];

const stackTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  columnWidths: Array(STACK.length).fill(Math.floor(12900 / STACK.length)),
  rows: [
    new TableRow({
      children: STACK.map(([layer]) =>
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.BLUE_DARK },
          borders: allBorders(noBorder),
          margins: { top: 60, bottom: 0, left: 80, right: 80 },
          children: [p(layer, { bold: true, color: C.WHITE, size: 16 })],
        })
      ),
    }),
    new TableRow({
      children: STACK.map(([, tech]) =>
        new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.BLUE_PALE },
          borders: allBorders(thinBlue),
          margins: { top: 0, bottom: 60, left: 80, right: 80 },
          children: [p(tech, { color: C.BLUE_DARK, size: 15 })],
        })
      ),
    }),
  ],
});

// ── App layer title banner ────────────────────────────────────────────────────
const appLayerBanner = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 1,
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.CLEAR, fill: C.BLUE_DARK },
          borders: allBorders({ style: BorderStyle.SINGLE, size: 6, color: C.BLUE_MID }),
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          children: [
            p("EMS Application Layer  ·  React 19 + Node.js 22 + Express 5", {
              bold: true, color: C.WHITE, size: 22,
            }),
          ],
        }),
      ],
    }),
  ],
});

// ── Document title ────────────────────────────────────────────────────────────
function titleParagraphs() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: "EMS — Enquiry Management System", bold: true, size: 40, color: C.BLUE_DARK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "Application Architecture Block Diagram", size: 26, color: C.BLUE_MID })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 280 },
      children: [new TextRun({ text: "Almoayyed Contracting Group  ·  August 2026", italic: true, size: 20, color: C.GREY_MID })],
    }),
  ];
}

function sectionLabel(text) {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 20, color: C.BLUE_MID })],
  });
}

// ── Assemble document ─────────────────────────────────────────────────────────
const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: { orientation: "landscape", width: 16838, height: 11906 }, // A4 landscape in twentieths
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.BLUE_LIGHT, space: 4 } },
              children: [new TextRun({ text: "EMS — Application Architecture  |  Almoayyed Contracting Group", size: 16, color: C.GREY_MID })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.BLUE_LIGHT, space: 4 } },
              children: [new TextRun({ text: "Confidential  ·  Internal Document  ·  Almoayyed Contracting Group", size: 16, color: C.GREY_MID })],
            }),
          ],
        }),
      },
      children: [
        ...titleParagraphs(),

        // 1. App layer banner
        appLayerBanner,
        new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }),

        // 2. Panel labels
        panelLabelTable,
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),

        // 3. Module grid
        moduleGrid,
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),

        // 4. Arrows
        arrowTable,

        // 5. Interface boxes + DB
        interfaceRow,

        // 6. Admin strip
        sectionLabel("System Administration & Integrations"),
        adminTable,

        // 7. Tech stack
        sectionLabel("Technology Stack"),
        stackTable,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log("Done:", outPath);

/**
 * Shared UI tokens — keep in sync with `:root { --ems-table-header-gradient }` in `index.css`.
 * Matches Search Enquiry results (`EnquiryResultsTable`).
 */
export const EMS_TABLE_HEADER_GRADIENT =
    'linear-gradient(180deg, #4d88d6 0%, #3e74c4 45%, #305894 100%)';

/** Centre main-menu strip in `Header.jsx` — deep blue bar (not the same token as quote panel headers). */
export const EMS_HEADER_NAV_GRADIENT =
    'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)';

/** Formal quote navy — panel headers, pricing table labels, etc. */
export const EMS_QUOTE_NAVY = '#1e3a5f';

/**
 * Quote panel headers (To, Quote Details, …): solid navy for formal print/PDF.
 * Enquiry tables keep {@link EMS_TABLE_HEADER_GRADIENT} (brighter UI blue).
 */
export const EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT = EMS_QUOTE_NAVY;

/** To / Quote Details panel header bar (~14% shorter vs original — padding, type, line-height). */
export const EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE = 0.855;
export const EMS_QUOTE_ACCENT_HEADER_PADDING = `calc(7px * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE}) calc(8px * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE})`;
export const EMS_QUOTE_ACCENT_HEADER_FONT_SIZE = `calc(11.2px * 1.2 * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE})`;
export const EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT = 1.1;

/** Quote A4 cover + panel bodies: very light sky under header bars (print/on-screen). */
export const EMS_QUOTE_COVER_META_MID_BG = '#f0f9ff';

/** Clause title — no fill bar; slightly lighter navy text on white. */
export const EMS_QUOTE_CLAUSE_HEADING_BG = 'transparent';
export const EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR = '#2f5478';
export const EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS = '0';
/** Vertical scale for clause heading bar (~14% shorter vs original — padding, type, margins). */
export const EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE = 0.857375;
export const EMS_QUOTE_CLAUSE_HEADING_PADDING_Y = `calc(6px * 1.69 * 0.85 * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_PADDING_X = 'calc(14px * 1.69)';
export const EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP = `calc(12px * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM = `calc(6px * 0.85 * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE = `calc(13px * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE} * 1.2)`;
export const EMS_QUOTE_CLAUSE_HEADING_FONT_WEIGHT = 700;
export const EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT = 1.05;
/** Horizontal rule under clause titles (preview + PDF). */
export const EMS_QUOTE_CLAUSE_HEADING_RULE_COLOR = '#94a3b8';
export const EMS_QUOTE_CLAUSE_HEADING_RULE_MARGIN_TOP = `calc(5px * 0.85 * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;

/** Same as {@link EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT} — kept for imports; quote rows use one continuous fill. */
export const EMS_QUOTE_PANEL_VALUE_NAV_GRADIENT = EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT;

/** Same as EMS_QUOTE_COVER_META_MID_BG — kept for imports; label and value cells match. */
export const EMS_QUOTE_PANEL_VALUE_META_BG = EMS_QUOTE_COVER_META_MID_BG;

/** Cover header: To column max width (was ~55%; trim 5% from the right). */
export const EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH = '50%';
/** Cover header: Quote Details column width (was 45%; grow 5% from the left). */
export const EMS_QUOTE_HEADER_QUOTE_COL_WIDTH = '50%';
/** Quote Details rows: fixed label width so extra panel width goes to values only. */
export const EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH = '132px';

/**
 * Reserved signatory panel height (For + signature gap + name + designation).
 * Keeps page 1 layout stable when a signatory is selected.
 */
export const EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT =
    'calc((12px * 1.69 * 2) + (13px * 1.58 * 2) + (13px * 1.58 * 3.15) + (13px * 1.58) + (4px + 12px * 1.45))';

/** Right-hand quote preview: trim sign-off panel 3% from the bottom (top edge unchanged). */
export const EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE = 0.97;
export const EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT_PREVIEW = `calc(${EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT.slice(5, -1)} * ${EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE})`;
export const EMS_QUOTE_COVER_SIGN_OFF_FOR_GAP_EM = 3.15;
export const EMS_QUOTE_COVER_SIGN_OFF_BODY_PAD_BOTTOM_PREVIEW = `calc(12px * 1.69 * ${EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE})`;
/** Lift signatory name + designation inside the sign-off panel (prevents bottom clipping). */
export const EMS_QUOTE_COVER_SIGNATORY_BLOCK_BOTTOM_OFFSET = '24px';

/** Reserved print footer block height (page indicator + rule + company lines). */
export const EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT = '72px';

/** Horizontal rule above company footer (was 0.5px; reduced 30%). */
export const EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH = '0.35px';

/** PDF/Puppeteer at 1× scale: thinner borders than on-screen 1px tables / 0.35px footer. */
export const EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF = '0.5px';
export const EMS_QUOTE_PDF_TABLE_BORDER_WIDTH = '0.5px';

/** Manual clause tables (Sl No / Description / …) — preview hairline vs PDF print scale. */
export const EMS_QUOTE_CLAUSE_TABLE_BORDER_COLOR = '#64748b';
export const EMS_QUOTE_CLAUSE_TABLE_BORDER = `1px solid ${EMS_QUOTE_CLAUSE_TABLE_BORDER_COLOR}`;
export const EMS_QUOTE_CLAUSE_TABLE_BORDER_PDF = `${EMS_QUOTE_PDF_TABLE_BORDER_WIDTH} solid ${EMS_QUOTE_CLAUSE_TABLE_BORDER_COLOR}`;
/** Hairline for vector PDF — pt units for Puppeteer/Chromium print (px sub-pixel snaps to 1px). */
export const EMS_QUOTE_CLAUSE_TABLE_BORDER_PDF_HAIRLINE = '0.25pt solid #64748b';

/** PDF-only overrides for EMS-built clause tables (not Excel paste / pricing summary). */
export const EMS_QUOTE_CLAUSE_TABLE_PDF_BORDER_CSS = `
html[data-preview-pdf="1"] .clause-content table:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]),
html[data-preview-pdf="1"] .clause-content table[data-ems-pdf-thin-borders="1"]:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) {
    border: none !important;
}
html[data-preview-pdf="1"] .clause-content table:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) th:not([data-ems-cell-border="none"]),
html[data-preview-pdf="1"] .clause-content table:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) td:not([data-ems-cell-border="none"]),
html[data-preview-pdf="1"] .quote-clause-block--continuation .clause-content table:not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) th:not([data-ems-cell-border="none"]),
html[data-preview-pdf="1"] .quote-clause-block--continuation .clause-content table:not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) td:not([data-ems-cell-border="none"]),
html[data-preview-pdf="1"] .clause-content table[data-ems-pdf-thin-borders="1"]:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) th:not([data-ems-cell-border="none"]),
html[data-preview-pdf="1"] .clause-content table[data-ems-pdf-thin-borders="1"]:not([data-ems-paste-source="office"]):not(#ems-auto-price-summary-table):not([data-ems-pricing-cols="fixed"]) td:not([data-ems-cell-border="none"]) {
    border: ${EMS_QUOTE_CLAUSE_TABLE_BORDER_PDF_HAIRLINE} !important;
}
html[data-preview-pdf="1"] td[data-ems-cell-border="none"],
html[data-preview-pdf="1"] th[data-ems-cell-border="none"] {
    border: none !important;
}
`;

/** Clause 4 auto pricing summary table — thin borders, navy header (preview / PDF / generated HTML). */
export const EMS_QUOTE_PRICING_TABLE_BORDER_WIDTH = '0.5px';
export const EMS_QUOTE_PRICING_TABLE_BORDER_COLOR = '#cbd5e1';
export const EMS_QUOTE_PRICING_TABLE_CELL_BORDER = `${EMS_QUOTE_PRICING_TABLE_BORDER_WIDTH} solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR}`;
/** Visible outer frame in on-screen preview (0.5px often disappears in browsers). */
export const EMS_QUOTE_PRICING_TABLE_OUTER_BORDER = `1px solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR}`;
export const EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER = '1px solid #94a3b8';
/** Space between clause heading bar and the auto pricing table in preview. */
export const EMS_QUOTE_PRICING_TABLE_MARGIN_TOP = '12px';
export const EMS_QUOTE_PRICING_TABLE_HEADER_BG = EMS_QUOTE_NAVY;
export const EMS_QUOTE_PRICING_TABLE_HEADER_COLOR = '#ffffff';
export const EMS_QUOTE_PRICING_TABLE_TOTAL_BG = '#f8fafc';
/** Slightly darker than TOTAL_BG — Discount / Final Discounted Price rows. */
export const EMS_QUOTE_PRICING_TABLE_DISCOUNT_BG = '#e2e8f0';
/** Overall table width — 20% narrower than full clause width. */
export const EMS_QUOTE_PRICING_TABLE_WIDTH = '80%';
/** Tight vertical padding so single-line rows fit the 24px row model. */
export const EMS_QUOTE_PRICING_TABLE_CELL_PADDING = '2px 10px';
export const EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX = 24;
/** Description vs Amount column ratio — must match in editor, preview, and PDF. */
export const EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH = '72%';
export const EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH = '28%';

/** Default column ratio before user resize; skipped when data-ems-col-widths is set (px drag-resize). */
export const EMS_QUOTE_PRICING_TABLE_COLUMN_SYNC_CSS = `
table#ems-auto-price-summary-table:not([data-ems-col-widths]),
table[data-ems-pricing-cols="fixed"]:not([data-ems-col-widths]) {
    width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
    max-width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
    table-layout: fixed !important;
    box-sizing: border-box !important;
}
table#ems-auto-price-summary-table:not([data-ems-col-widths]) {
    table-layout: fixed !important;
    box-sizing: border-box !important;
}
table#ems-auto-price-summary-table:not([data-ems-col-widths]) col:nth-child(1) {
    width: ${EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH} !important;
}
table#ems-auto-price-summary-table:not([data-ems-col-widths]) col:nth-child(2) {
    width: ${EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH} !important;
}
table#ems-auto-price-summary-table:not([data-ems-col-widths]) > thead > tr > th:nth-child(1),
table#ems-auto-price-summary-table:not([data-ems-col-widths]) > tbody > tr > td:nth-child(1) {
    width: ${EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH} !important;
}
table#ems-auto-price-summary-table:not([data-ems-col-widths]) > thead > tr > th:nth-child(2),
table#ems-auto-price-summary-table:not([data-ems-col-widths]) > tbody > tr > td:nth-child(2) {
    width: ${EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH} !important;
}
table#ems-auto-price-summary-table[data-ems-col-widths],
table[data-ems-pricing-cols="fixed"][data-ems-col-widths] {
    table-layout: fixed !important;
    box-sizing: border-box !important;
    max-width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
}
`;

/** Compact 24px rows + neutralized cell paragraphs (editor, preview, PDF). */
export const EMS_QUOTE_PRICING_TABLE_COMPACT_ROW_CSS = `
table#ems-auto-price-summary-table th,
table#ems-auto-price-summary-table td,
table[data-ems-pricing-cols="fixed"] th,
table[data-ems-pricing-cols="fixed"] td {
    padding: ${EMS_QUOTE_PRICING_TABLE_CELL_PADDING} !important;
    line-height: 1.25 !important;
    vertical-align: middle !important;
}
table#ems-auto-price-summary-table td p,
table#ems-auto-price-summary-table th p,
table[data-ems-pricing-cols="fixed"] td p,
table[data-ems-pricing-cols="fixed"] th p {
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.25 !important;
}
table#ems-auto-price-summary-table:not([data-ems-row-heights-custom]) > thead > tr,
table#ems-auto-price-summary-table:not([data-ems-row-heights-custom]) > tbody > tr,
table[data-ems-pricing-cols="fixed"]:not([data-ems-row-heights-custom]) > thead > tr,
table[data-ems-pricing-cols="fixed"]:not([data-ems-row-heights-custom]) > tbody > tr {
    height: ${EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX}px !important;
    max-height: ${EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX}px !important;
    min-height: ${EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX}px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
}
table#ems-auto-price-summary-table:not([data-ems-row-heights-custom]) > thead > tr > th,
table#ems-auto-price-summary-table:not([data-ems-row-heights-custom]) > tbody > tr > td,
table[data-ems-pricing-cols="fixed"]:not([data-ems-row-heights-custom]) > thead > tr > th,
table[data-ems-pricing-cols="fixed"]:not([data-ems-row-heights-custom]) > tbody > tr > td {
    height: ${EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX}px !important;
    max-height: ${EMS_QUOTE_PRICING_TABLE_ROW_HEIGHT_PX}px !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
}
`;

/** Navy header row — id and data-ems-pricing-cols (when Jodit drops id). Editor, preview, PDF. */
export const EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS = `
table#ems-auto-price-summary-table thead th,
table[data-ems-pricing-cols="fixed"] thead th {
    background: ${EMS_QUOTE_PRICING_TABLE_HEADER_BG} !important;
    background-color: ${EMS_QUOTE_PRICING_TABLE_HEADER_BG} !important;
    color: ${EMS_QUOTE_PRICING_TABLE_HEADER_COLOR} !important;
    font-weight: 600 !important;
    border: ${EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
`;

/** Prefix presentation rules for a container (e.g. `.quote-pricing-terms-auto-table-preview`). */
export function scopeEmsQuotePricingTablePresentationCss(scopeSelector) {
    const scope = String(scopeSelector || '').trim();
    if (!scope) return EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS;
    return EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS.replace(
        /table#ems-auto-price-summary-table/g,
        `${scope} table#ems-auto-price-summary-table`
    ).replace(
        /table\[data-ems-pricing-cols="fixed"\]/g,
        `${scope} table[data-ems-pricing-cols="fixed"]`
    );
}

/** Space below company logo row before To / Quote Details (was 20px; reduced 50%). */
export const EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM = '10px';

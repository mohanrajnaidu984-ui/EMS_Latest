/**
 * Single source of truth for quote PDF / html2pdf / Puppeteer sheet layout.
 * Must match on-screen #quote-preview .quote-a4-sheet grid (logo / body / footer).
 */
import {
    EMS_QUOTE_COVER_SIGNATORY_LIFT_PX,
    EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM,
    EMS_QUOTE_PDF_PREVIEW_GAP_PX,
    EMS_QUOTE_PDF_FOOTER_GAP_EXTRA_PX,
    EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT,
} from '../../constants/emsTheme.js';
import {
    QUOTE_PAGE_GEOMETRY,
    QUOTE_A4_SHEET_PADDING_MM,
    QUOTE_A4_LOGO_BAND_MM,
    QUOTE_A4_FOOTER_BAND_MM,
    QUOTE_A4_LANDSCAPE_WIDTH_MM,
    QUOTE_A4_LANDSCAPE_HEIGHT_MM,
} from './quotePageGeometry.js';

/** Printable body height inside one A4 sheet (mm): page − vertical padding. */
export const QUOTE_A4_INNER_HEIGHT_MM =
    QUOTE_PAGE_GEOMETRY.pageHeightMm - QUOTE_A4_SHEET_PADDING_MM * 2;

/**
 * Unified export overrides — hoisted preview layout CSS is stripped; sheets use grid like QuoteForm.
 */
export const QUOTE_UNIFIED_SHEET_EXPORT_CSS = `
@page { size: A4 portrait; margin: 0; }
@page quote-landscape { size: A4 landscape; margin: 0; }
html[data-preview-pdf="1"] #quote-preview,
[data-ems-pdf-export="1"] #quote-preview {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    /* No fixed width — portrait sheets are 210mm, landscape sheets are 297mm. */
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    box-shadow: none !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]),
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]) {
    box-sizing: border-box !important;
    /* Default portrait A4; landscape sheets override this below. */
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    padding: ${QUOTE_A4_SHEET_PADDING_MM}mm !important;
    margin: 0 !important;
    background: #fff !important;
    min-height: ${QUOTE_PAGE_GEOMETRY.pageHeightMm}mm !important;
    height: ${QUOTE_PAGE_GEOMETRY.pageHeightMm}mm !important;
    max-height: ${QUOTE_PAGE_GEOMETRY.pageHeightMm}mm !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-before: auto !important;
    break-before: auto !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    overflow: hidden !important;
    box-shadow: none !important;
    border: none !important;
}
/* R6: no trailing blank page — break-after only between sheets. */
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(:has(~ .quote-a4-sheet)),
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet:not(:has(~ .quote-a4-sheet)) {
    page-break-after: avoid !important;
    break-after: avoid !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"],
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] {
    box-sizing: border-box !important;
    width: ${QUOTE_A4_LANDSCAPE_WIDTH_MM}mm !important;
    min-width: ${QUOTE_A4_LANDSCAPE_WIDTH_MM}mm !important;
    max-width: ${QUOTE_A4_LANDSCAPE_WIDTH_MM}mm !important;
    padding: ${QUOTE_A4_SHEET_PADDING_MM}mm !important;
    margin: 0 !important;
    background: #fff !important;
    min-height: ${QUOTE_A4_LANDSCAPE_HEIGHT_MM}mm !important;
    height: ${QUOTE_A4_LANDSCAPE_HEIGHT_MM}mm !important;
    max-height: ${QUOTE_A4_LANDSCAPE_HEIGHT_MM}mm !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    overflow: hidden !important;
    box-shadow: none !important;
    border: none !important;
    page: quote-landscape;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]),
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation.quote-a4-sheet--landscape,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation[data-page-orientation="landscape"],
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]),
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation.quote-a4-sheet--landscape,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet.quote-a4-sheet--continuation[data-page-orientation="landscape"] {
    grid-template-rows: ${QUOTE_A4_LOGO_BAND_MM}mm minmax(0, 1fr) ${QUOTE_A4_FOOTER_BAND_MM}mm !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation > .quote-sheet-logo-row,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--continuation > .quote-sheet-logo-row {
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    min-height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    max-height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    margin-bottom: 0 !important;
    box-sizing: border-box !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation > .footer-section,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--continuation > .footer-section {
    height: ${QUOTE_A4_FOOTER_BAND_MM}mm !important;
    min-height: ${QUOTE_A4_FOOTER_BAND_MM}mm !important;
    max-height: ${QUOTE_A4_FOOTER_BAND_MM}mm !important;
    justify-content: flex-end !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .quote-sheet-main-flex,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .content-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .header-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .footer-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .quote-clause-block,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape .clause-content,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .quote-sheet-main-flex,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .content-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .header-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .footer-section,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .quote-clause-block,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .clause-content,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .quote-sheet-main-flex,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .content-section,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .header-section,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .footer-section,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .quote-clause-block,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape .clause-content {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-sheet-logo-row,
[data-ems-pdf-export="1"] .quote-sheet-logo-row {
    grid-row: 1 !important;
    flex: 0 0 auto !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-sheet-logo-row > div,
[data-ems-pdf-export="1"] .quote-sheet-logo-row > div {
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    text-align: right !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-sheet-logo-row img,
[data-ems-pdf-export="1"] .quote-sheet-logo-row img {
    display: block !important;
    height: auto !important;
    width: auto !important;
    max-height: 12.6mm !important;
    max-width: 100% !important;
    object-fit: contain !important;
    object-position: right top !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    position: static !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-sheet-main-flex,
[data-ems-pdf-export="1"] .quote-sheet-main-flex {
    grid-row: 2 !important;
    min-height: 0 !important;
    height: 100% !important;
    max-height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet > .footer-section,
[data-ems-pdf-export="1"] .quote-a4-sheet > .footer-section {
    grid-row: 3 !important;
    align-self: end !important;
    flex-shrink: 0 !important;
    margin-top: 0 !important;
    width: 100% !important;
    min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
    box-sizing: border-box !important;
    background: #fff !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .header-section,
[data-ems-pdf-export="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .header-section {
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet .content-section,
[data-ems-pdf-export="1"] .quote-a4-sheet .content-section {
    flex: 0 1 auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-sheet-logo-row,
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-continuation-header,
[data-ems-pdf-export="1"][data-print-with-header='1'] .quote-sheet-logo-row {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    flex-direction: row !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-sheet-logo-row img,
[data-ems-pdf-export="1"][data-print-with-header='1'] .quote-sheet-logo-row img {
    visibility: visible !important;
    display: block !important;
    opacity: 1 !important;
    max-height: 12.6mm !important;
    height: auto !important;
    width: auto !important;
    max-width: 100% !important;
    object-fit: contain !important;
    object-position: right top !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    float: none !important;
    position: static !important;
}
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-sheet-logo-row > div,
[data-ems-pdf-export="1"][data-print-with-header='1'] .quote-sheet-logo-row > div {
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    text-align: right !important;
}
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-print-footer-wrap {
    visibility: visible !important;
    display: block !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex,
[data-ems-pdf-export="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex {
    min-height: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-cover-page1-spacer,
[data-ems-pdf-export="1"] .quote-cover-page1-spacer {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex > .content-section,
[data-ems-pdf-export="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex > .content-section {
    flex: 1 1 0 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-cover-sign-off,
[data-ems-pdf-export="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-cover-sign-off {
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    margin-bottom: ${EMS_QUOTE_COVER_SIGNATORY_LIFT_PX}px !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .quote-sheet-main-flex,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
    min-height: 0 !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .content-section,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .content-section {
    /* Preview continuation content uses block flow. A flex column prevents
     * heading margins collapsing and added ~10px per clause only in the PDF. */
    display: block !important;
    flex: 0 0 auto !important;
    min-height: 0 !important;
    height: ${QUOTE_PAGE_GEOMETRY.contentHeightMm}mm !important;
    max-height: ${QUOTE_PAGE_GEOMETRY.contentHeightMm}mm !important;
    overflow: hidden !important;
    padding-top: 1px;
    box-sizing: border-box;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape.quote-a4-sheet--continuation .content-section,
[data-ems-pdf-export="1"] .quote-a4-sheet--landscape.quote-a4-sheet--continuation .content-section {
    height: ${QUOTE_PAGE_GEOMETRY.contentHeightLandscapeMm}mm !important;
    max-height: ${QUOTE_PAGE_GEOMETRY.contentHeightLandscapeMm}mm !important;
}
html[data-preview-pdf="1"] #quote-preview .clause-content > p[data-ems-para-continue="1"],
html[data-preview-pdf="1"] #quote-preview .clause-content > table[data-ems-clause-row-continue="1"],
[data-ems-pdf-export="1"] .clause-content > p[data-ems-para-continue="1"],
[data-ems-pdf-export="1"] .clause-content > table[data-ems-clause-row-continue="1"] {
    margin-top: 0 !important;
}
/* Keep the measured preview's table typography and row sizes. Export-only
 * line-height/padding/height resets changed wrapping after pagination (5.01). */
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .clause-content,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .clause-content p,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .clause-content li,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .clause-content,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .clause-content p,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .clause-content li {
    line-height: 1.4 !important;
    overflow: visible !important;
}
/* Same geometry as preview: logo / content / footer bands from quotePageGeometry. */
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation > .quote-sheet-logo-row,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation > .quote-sheet-logo-row {
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    min-height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    max-height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    margin-bottom: 0 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation > .quote-sheet-logo-row > div,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation > .quote-sheet-logo-row > div {
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    height: auto !important;
    max-height: ${QUOTE_A4_LOGO_BAND_MM}mm !important;
    min-height: 0 !important;
    width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation > .quote-sheet-logo-row img,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation > .quote-sheet-logo-row img {
    position: static !important;
    height: auto !important;
    width: auto !important;
    max-height: ${QUOTE_A4_LOGO_BAND_MM * 0.6}mm !important;
    max-width: 100% !important;
    object-fit: contain !important;
    object-position: right top !important;
    display: block !important;
    margin-left: auto !important;
    margin-right: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]),
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]) {
    padding: ${QUOTE_A4_SHEET_PADDING_MM}mm !important;
    padding-bottom: ${QUOTE_A4_SHEET_PADDING_MM}mm !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(:has(~ .quote-a4-sheet)),
[data-ems-pdf-export="1"] .quote-a4-sheet:not(:has(~ .quote-a4-sheet)) {
    page-break-after: avoid !important;
    break-after: avoid !important;
}
html[data-preview-pdf="1"] .quote-clause-measure-host,
[data-ems-pdf-export="1"] .quote-clause-measure-host,
html[data-preview-pdf="1"] [data-pack-merge-measure],
[data-ems-pdf-export="1"] [data-pack-merge-measure] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
}
html[data-preview-pdf="1"] .clause-content table,
html[data-preview-pdf="1"] .clause-content tr,
html[data-preview-pdf="1"] .clause-content td,
html[data-preview-pdf="1"] .clause-content th {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel,
html[data-preview-pdf="1"] .quote-header-address-panel-row--header,
html[data-preview-pdf="1"] .footer-section,
html[data-preview-pdf="1"] .avoid-break {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
}
`;

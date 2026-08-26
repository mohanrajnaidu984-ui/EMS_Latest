/**
 * Single source of truth for quote PDF / html2pdf / Puppeteer sheet layout.
 * Must match on-screen #quote-preview .quote-a4-sheet grid (logo / body / footer).
 * Keep in sync with src/components/Quote/quotePrintExportCss.js
 */
const EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM = '10px';
const EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT = '72px';

/** Printable body height inside one A4 sheet (mm): 297 − vertical padding. */
const QUOTE_A4_INNER_HEIGHT_MM = 297 - 15 * 2;

/**
 * Unified export overrides — hoisted preview layout CSS is stripped; sheets use grid like QuoteForm.
 */
const QUOTE_UNIFIED_SHEET_EXPORT_CSS = `
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
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    box-shadow: none !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]),
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--landscape):not([data-page-orientation="landscape"]) {
    box-sizing: border-box !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    padding: 15mm !important;
    margin: 0 !important;
    background: #fff !important;
    min-height: 297mm !important;
    height: 297mm !important;
    max-height: 297mm !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    page-break-after: auto !important;
    break-after: auto !important;
    page-break-before: auto !important;
    break-before: auto !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
    overflow: hidden !important;
    box-shadow: none !important;
    border: none !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--landscape,
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"],
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet--landscape,
[data-ems-pdf-export="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] {
    box-sizing: border-box !important;
    width: 297mm !important;
    min-width: 297mm !important;
    max-width: 297mm !important;
    padding: 15mm !important;
    margin: 0 !important;
    background: #fff !important;
    min-height: 210mm !important;
    height: 210mm !important;
    max-height: 210mm !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    overflow: hidden !important;
    box-shadow: none !important;
    border: none !important;
    page: quote-landscape;
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
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet[data-page-orientation="landscape"] .clause-content {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-sheet-logo-row,
[data-ems-pdf-export="1"] .quote-sheet-logo-row {
    grid-row: 1 !important;
    flex: 0 0 auto !important;
    width: 100% !important;
    margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
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
    flex-direction: row !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] #quote-print-root[data-print-with-header='1'] .quote-sheet-logo-row img,
[data-ems-pdf-export="1"][data-print-with-header='1'] .quote-sheet-logo-row img {
    visibility: visible !important;
    display: block !important;
    opacity: 1 !important;
    max-height: 68px !important;
    height: auto !important;
    width: auto !important;
    max-width: 212px !important;
    object-fit: contain !important;
    object-position: right top !important;
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
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .quote-sheet-main-flex,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .quote-sheet-main-flex {
    min-height: 0 !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet--continuation .content-section,
[data-ems-pdf-export="1"] .quote-a4-sheet--continuation .content-section {
    flex: 0 1 auto !important;
    min-height: 0 !important;
    max-height: 100% !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:last-of-type,
[data-ems-pdf-export="1"] .quote-a4-sheet:last-of-type {
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


module.exports = { QUOTE_A4_INNER_HEIGHT_MM, QUOTE_UNIFIED_SHEET_EXPORT_CSS };

/**
 * Single source of truth for EMS Quote A4 continuation-page geometry.
 * Pack, preview CSS, print/PDF CSS, and CONTENT START/END marks must all derive from here.
 *
 * Portrait stack: 15 + 21 + 220 + 26 + 15 = 297 mm.
 * Landscape stack: 15 + 21 + 133 + 26 + 15 = 210 mm.
 */

export const QUOTE_A4_PAGE_WIDTH_MM = 210;
export const QUOTE_A4_PAGE_HEIGHT_MM = 297;
export const QUOTE_A4_LANDSCAPE_WIDTH_MM = 297;
export const QUOTE_A4_LANDSCAPE_HEIGHT_MM = 210;

export const QUOTE_A4_SHEET_PADDING_MM = 15;
export const QUOTE_A4_LOGO_BAND_MM = 21;
export const QUOTE_A4_FOOTER_BAND_MM = 26;

/** CSS px per inch used for pack measurements (browser default). */
export const QUOTE_PACK_DPI = 96;

/** Reserve above CONTENT END so a wrapped line is not cropped. */
export const PACK_HEIGHT_SAFETY_PX = 20;

export function mmToCssPx(mm, dpi = QUOTE_PACK_DPI) {
    return (Number(mm) / 25.4) * dpi;
}

export function quoteA4InnerContentMm(isLandscape = false) {
    const pageW = isLandscape ? QUOTE_A4_LANDSCAPE_WIDTH_MM : QUOTE_A4_PAGE_WIDTH_MM;
    const pageH = isLandscape ? QUOTE_A4_LANDSCAPE_HEIGHT_MM : QUOTE_A4_PAGE_HEIGHT_MM;
    return {
        innerWidthMm: pageW - QUOTE_A4_SHEET_PADDING_MM * 2,
        innerHeightMm: pageH - QUOTE_A4_SHEET_PADDING_MM * 2,
    };
}

/** Fixed continuation content box: 180×220mm portrait, 267×133mm landscape. */
export function quoteContinuationContentMm(isLandscape = false) {
    const { innerWidthMm, innerHeightMm } = quoteA4InnerContentMm(isLandscape);
    return {
        widthMm: innerWidthMm,
        heightMm: innerHeightMm - QUOTE_A4_LOGO_BAND_MM - QUOTE_A4_FOOTER_BAND_MM,
    };
}

export function quoteContinuationContentPx(isLandscape = false) {
    return Math.round(mmToCssPx(quoteContinuationContentMm(isLandscape).heightMm));
}

/** Content starts after top pad + logo band (36mm portrait). */
export function quoteContentStartOffsetMm() {
    return QUOTE_A4_SHEET_PADDING_MM + QUOTE_A4_LOGO_BAND_MM;
}

/** Content ends at start + content height (256mm portrait). */
export function quoteContentEndOffsetMm(isLandscape = false) {
    return quoteContentStartOffsetMm() + quoteContinuationContentMm(isLandscape).heightMm;
}

export const EMS_QUOTE_CONT_USABLE_PX_FALLBACK = quoteContinuationContentPx(false);
export const EMS_QUOTE_CONT_USABLE_PX_LANDSCAPE_FALLBACK = quoteContinuationContentPx(true);

/**
 * Pack measure host MUST match live continuation paint
 * (`#quote-preview .quote-a4-sheet--continuation` table/body rules).
 * Mismatch under/over-packs → live peel oscillation / clipped units.
 */
export const QUOTE_PACK_MEASURE_BODY_CSS = `
  font-size: 13px !important;
  line-height: 1.4 !important;
`;

/**
 * Pack tables slightly taller than live (12.5px/15px) so fill-pack stays
 * conservative and does not overpack into the footer reserve.
 */
export const QUOTE_PACK_MEASURE_TABLE_CELL_CSS = `
  padding-top: 1px !important;
  padding-bottom: 1px !important;
  font-size: 13px !important;
  line-height: 1.35 !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
`;

/** Extra rules injected into the off-DOM pack measure shell (parity with live preview). */
export const QUOTE_PACK_MEASURE_SHELL_EXTRA_CSS = `
  [data-pack-measure-content] {
    padding-top: 1px !important;
    box-sizing: border-box !important;
  }
  [data-pack-measure-content] .quote-clause-heading-panel {
    margin-top: 8px !important;
  }
  [data-pack-measure-content] .quote-clause-block:first-child .quote-clause-heading-panel {
    margin-top: 0 !important;
  }
  [data-pack-measure-content] .clause-content > p[data-ems-para-continue="1"],
  [data-pack-measure-content] .clause-content > table[data-ems-clause-row-continue="1"] {
    margin-top: 0 !important;
  }
`;

/** Frozen snapshot for CSS templates / tests. */
export const QUOTE_PAGE_GEOMETRY = Object.freeze({
    pageWidthMm: QUOTE_A4_PAGE_WIDTH_MM,
    pageHeightMm: QUOTE_A4_PAGE_HEIGHT_MM,
    paddingMm: QUOTE_A4_SHEET_PADDING_MM,
    logoBandMm: QUOTE_A4_LOGO_BAND_MM,
    footerBandMm: QUOTE_A4_FOOTER_BAND_MM,
    contentWidthMm: quoteContinuationContentMm(false).widthMm,
    contentHeightMm: quoteContinuationContentMm(false).heightMm,
    contentHeightLandscapeMm: quoteContinuationContentMm(true).heightMm,
    contentStartMm: quoteContentStartOffsetMm(),
    contentEndMm: quoteContentEndOffsetMm(false),
    contentEndLandscapeMm: quoteContentEndOffsetMm(true),
    usablePx: EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
    usableLandscapePx: EMS_QUOTE_CONT_USABLE_PX_LANDSCAPE_FALLBACK,
    packSafetyPx: PACK_HEIGHT_SAFETY_PX,
    packLimitPx: Math.max(EMS_QUOTE_CONT_USABLE_PX_FALLBACK - PACK_HEIGHT_SAFETY_PX, 200),
});

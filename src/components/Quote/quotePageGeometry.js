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
export const PACK_HEIGHT_SAFETY_PX = 12;

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
 * Pack measure host must match live continuation `.clause-content` metrics
 * (understated fonts caused overpack → overflow:hidden clipping).
 */
export const QUOTE_PACK_MEASURE_BODY_CSS = `
  font-size: 13px !important;
  line-height: 1.4 !important;
`;

export const QUOTE_PACK_MEASURE_TABLE_CELL_CSS = `
  padding-top: 1px !important;
  padding-bottom: 1px !important;
  font-size: 13px !important;
  line-height: 1.4 !important;
  overflow: visible !important;
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

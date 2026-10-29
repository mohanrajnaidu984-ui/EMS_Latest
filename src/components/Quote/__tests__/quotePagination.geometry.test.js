import { describe, it, expect } from 'vitest';
import {
    QUOTE_PAGE_GEOMETRY,
    QUOTE_A4_PAGE_HEIGHT_MM,
    QUOTE_A4_SHEET_PADDING_MM,
    QUOTE_A4_LOGO_BAND_MM,
    QUOTE_A4_FOOTER_BAND_MM,
    quoteContinuationContentMm,
    quoteContinuationContentPx,
    EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
    PACK_HEIGHT_SAFETY_PX,
} from '../quotePageGeometry.js';

describe('quote page geometry', () => {
    it('content height = page − margins − logo − footer', () => {
        const { heightMm } = quoteContinuationContentMm(false);
        expect(heightMm).toBe(
            QUOTE_A4_PAGE_HEIGHT_MM -
                QUOTE_A4_SHEET_PADDING_MM * 2 -
                QUOTE_A4_LOGO_BAND_MM -
                QUOTE_A4_FOOTER_BAND_MM
        );
        expect(heightMm).toBe(220);
        expect(QUOTE_PAGE_GEOMETRY.contentHeightMm).toBe(220);
        expect(QUOTE_PAGE_GEOMETRY.contentStartMm).toBe(36);
        expect(QUOTE_PAGE_GEOMETRY.contentEndMm).toBe(256);
    });

    it('usablePx is 831 at 96dpi', () => {
        expect(quoteContinuationContentPx(false)).toBe(831);
        expect(EMS_QUOTE_CONT_USABLE_PX_FALLBACK).toBe(831);
        expect(QUOTE_PAGE_GEOMETRY.usablePx).toBe(831);
        expect(QUOTE_PAGE_GEOMETRY.packLimitPx).toBe(831 - PACK_HEIGHT_SAFETY_PX);
    });

    it('landscape content is 133mm', () => {
        expect(quoteContinuationContentMm(true).heightMm).toBe(133);
        expect(QUOTE_PAGE_GEOMETRY.contentHeightLandscapeMm).toBe(133);
    });
});

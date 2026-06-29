/** Shared A4 / word-flow layout math for clause editing in quote preview. */

export const quoteMmToPx = (mm) => (mm * 96) / 25.4;

/** Usable body height on a continuation A4 sheet (logo + footer chrome excluded). */
export function computeQuoteContinuationContentUsablePx(footerMinHeight, logoMarginBottom) {
    const sheetH = quoteMmToPx(297);
    const padV = quoteMmToPx(15) * 2;
    const logoH = 68 + (parseInt(logoMarginBottom, 10) || 0);
    const footerH = parseInt(footerMinHeight, 10) || 80;
    return Math.max(200, Math.floor(sheetH - padV - logoH - footerH));
}

/** How many extra A4 frames are needed below the editing sheet. */
export function computeWordFlowExtraPageCount(ribbonHeightPx, firstPageUsablePx, contPageUsablePx) {
    const ribbon = Math.max(0, Number(ribbonHeightPx) || 0);
    const first = Math.max(1, Number(firstPageUsablePx) || 1);
    const cont = Math.max(1, Number(contPageUsablePx) || 1);
    const overflow = ribbon - first;
    if (overflow <= 0) return 0;
    return Math.ceil(overflow / cont);
}

/** Y offsets (px) within the ribbon where each new A4 page begins (after page 1). */
export function computeWordFlowPageBreakOffsets(ribbonHeightPx, firstPageUsablePx, contPageUsablePx) {
    const extra = computeWordFlowExtraPageCount(ribbonHeightPx, firstPageUsablePx, contPageUsablePx);
    const first = Math.max(1, Number(firstPageUsablePx) || 1);
    const cont = Math.max(1, Number(contPageUsablePx) || 1);
    const breaks = [];
    for (let i = 1; i <= extra; i += 1) {
        breaks.push(first + (i - 1) * cont);
    }
    return breaks;
}

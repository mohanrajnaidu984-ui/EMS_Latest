/**
 * Standalone HTML document for quote print preview and server-side vector PDF (Puppeteer).
 */

import { QUOTE_UNIFIED_SHEET_EXPORT_CSS } from './quotePrintExportCss.js';
import {
    removeEmptyQuoteA4Sheets,
    renumberQuoteSheetPageIndicators,
} from './quotePrintSheetValidation.js';
import {
    EMS_QUOTE_ACCENT_HEADER_PADDING,
    EMS_QUOTE_ACCENT_HEADER_FONT_SIZE,
    EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT,
    EMS_QUOTE_COVER_META_MID_BG,
    EMS_QUOTE_CLAUSE_HEADING_BG,
    EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR,
    EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS,
    EMS_QUOTE_CLAUSE_HEADING_PADDING_Y,
    EMS_QUOTE_CLAUSE_HEADING_PADDING_X,
    EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP,
    EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM,
    EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE,
    EMS_QUOTE_CLAUSE_HEADING_FONT_WEIGHT,
    EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT,
    EMS_QUOTE_CLAUSE_HEADING_RULE_COLOR,
    EMS_QUOTE_CLAUSE_HEADING_RULE_MARGIN_TOP,
    EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT,
    EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT_PREVIEW,
    EMS_QUOTE_COVER_SIGN_OFF_BODY_PAD_BOTTOM_PREVIEW,
    EMS_QUOTE_COVER_SIGN_OFF_FOR_GAP_EM,
    EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE,
    EMS_QUOTE_COVER_SIGNATORY_BLOCK_BOTTOM_OFFSET,
    EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT,
    EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH,
    EMS_QUOTE_HEADER_QUOTE_COL_WIDTH,
    EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH,
    EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT,
    EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH,
    EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF,
    EMS_QUOTE_PDF_TABLE_BORDER_WIDTH,
    EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM,
    EMS_QUOTE_PRICING_TABLE_CELL_BORDER,
    EMS_QUOTE_PRICING_TABLE_OUTER_BORDER,
    EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER,
    EMS_QUOTE_PRICING_TABLE_MARGIN_TOP,
    EMS_QUOTE_PRICING_TABLE_HEADER_BG,
    EMS_QUOTE_PRICING_TABLE_HEADER_COLOR,
    EMS_QUOTE_PRICING_TABLE_TOTAL_BG,
    EMS_QUOTE_PRICING_TABLE_BORDER_COLOR,
    EMS_QUOTE_PRICING_TABLE_COLUMN_SYNC_CSS,
    EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS,
    EMS_QUOTE_PRICING_TABLE_COMPACT_ROW_CSS,
    EMS_QUOTE_PRICING_TABLE_WIDTH,
} from '../../constants/emsTheme';
const QUOTE_APP_FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Same stack as #quote-preview in QuoteForm.jsx — do not substitute Inter in PDF. */
export const QUOTE_PREVIEW_FONT_STACK =
    "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, sans-serif";

function stripAtMediaPrintBlocks(css) {
    const s = String(css);
    let out = '';
    let i = 0;
    while (i < s.length) {
        const idx = s.toLowerCase().indexOf('@media print', i);
        if (idx === -1) {
            out += s.slice(i);
            break;
        }
        out += s.slice(i, idx);
        const open = s.indexOf('{', idx);
        if (open === -1) {
            out += s.slice(idx);
            break;
        }
        let depth = 1;
        let k = open + 1;
        while (k < s.length && depth > 0) {
            if (s[k] === '{') depth += 1;
            else if (s[k] === '}') depth -= 1;
            k += 1;
        }
        i = k;
    }
    return out;
}

function removeCssRuleBlocks(css, shouldRemoveSelector) {
    const s = String(css);
    let out = '';
    let i = 0;
    while (i < s.length) {
        const brace = s.indexOf('{', i);
        if (brace === -1) {
            out += s.slice(i);
            break;
        }
        const selector = s.slice(i, brace).trim();
        let depth = 1;
        let k = brace + 1;
        while (k < s.length && depth > 0) {
            if (s[k] === '{') depth += 1;
            else if (s[k] === '}') depth -= 1;
            k += 1;
        }
        if (!shouldRemoveSelector(selector)) {
            out += s.slice(i, k);
        }
        i = k;
    }
    return out;
}

const HOISTED_PDF_LAYOUT_SELECTOR_RE =
    /quote-a4-sheet|quote-sheet-main-flex|quote-sheet-logo-row|quote-cover-page1-spacer|quote-preview-zoom|quote-print-repeat-strip|grid-template-rows|grid-template-columns|grid-row\s*:|align-content\s*:/i;

function stripHoistedSheetLayoutRulesForPdf(css) {
    let out = stripAtMediaPrintBlocks(css);
    out = removeCssRuleBlocks(out, (selector) => HOISTED_PDF_LAYOUT_SELECTOR_RE.test(selector));
    return out;
}

/** Hoist only typography/table rules — sheet layout comes from QUOTE_UNIFIED grid CSS + inline pin. */
function filterHoistedTypographyCssForPdf(css) {
    let out = stripHoistedSheetLayoutRulesForPdf(css);
    out = removeCssRuleBlocks(out, (selector) => {
        if (HOISTED_PDF_LAYOUT_SELECTOR_RE.test(selector)) return true;
        if (/@media/i.test(selector)) return true;
        return false;
    });
    return out.trim();
}

function sanitizeHoistedPreviewCssForPdf(css) {
    return filterHoistedTypographyCssForPdf(css);
}

function stripEmbeddedStyleTags(html) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function stripAllStyleTags(html) {
    if (!html) return { css: '', html: '' };
    const chunks = [];
    const out = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, inner) => {
        chunks.push(inner);
        return '';
    });
    return { css: chunks.join('\n\n'), html: out.trim() };
}

/** Base padding on Dear Sir panel; extra is added so letter→signatory gap matches table→letter gap. */
export const COVER_LETTER_PAD_BOTTOM_BASE_PX = 12;

/** Cover signatory layout was locked (e.g. user placed a digital signature on page 1). */
export function isCoverSignatoryLayoutLocked(letterEl) {
    if (!letterEl) return false;
    const sheet0 = letterEl.closest('.quote-a4-sheet');
    return (
        letterEl.dataset.emsCoverSignatoryLocked === '1' ||
        sheet0?.dataset?.emsCoverSignatoryLocked === '1'
    );
}

function queryQuoteExportSheets(root) {
    const preview = root?.querySelector?.('#quote-preview') || root;
    if (!preview?.querySelectorAll) return [];
    return [...preview.querySelectorAll('.quote-a4-sheet')].filter(
        (sheet) =>
            !sheet.classList.contains('quote-clause-measure-host') &&
            !sheet.hasAttribute('data-pack-measure-shell')
    );
}

/** Layout offset within a sheet — corrects preview CSS zoom when present. */
function readQuotePreviewZoomScale(root) {
    const preview = root?.querySelector?.('#quote-preview');
    const shell = preview?.parentElement;
    if (!shell) return 1;
    const z = shell.style.getPropertyValue('--quote-preview-zoom');
    if (z) {
        const n = parseFloat(z);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const m = String(shell.style.transform || '').match(/scale\(([\d.]+)\)/);
    if (m) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
}

function elementOffsetWithinAncestor(el, ancestor, zoomRoot) {
    if (!el || !ancestor) return { left: 0, top: 0 };
    const zoom = zoomRoot ? readQuotePreviewZoomScale(zoomRoot) : 1;
    if (zoom !== 1) {
        const ar = ancestor.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        return { left: (er.left - ar.left) / zoom, top: (er.top - ar.top) / zoom };
    }
    if (el.offsetParent === ancestor) {
        return { left: el.offsetLeft, top: el.offsetTop };
    }
    let left = 0;
    let top = 0;
    let node = el;
    while (node && node !== ancestor) {
        left += node.offsetLeft;
        top += node.offsetTop;
        const parent = node.offsetParent;
        if (!parent || parent === document.body || !ancestor.contains(parent)) break;
        node = parent;
    }
    return { left, top };
}

function elementOffsetWithinSheet(el, sheet) {
    const root = sheet?.closest('#quote-print-root') || sheet;
    return elementOffsetWithinAncestor(el, sheet, root);
}

function applyFrozenCoverSpacerHeight(spacer, heightPx) {
    if (!spacer) return;
    const h = Math.max(0, Math.round(Number(heightPx) || 0));
    spacer.style.setProperty('flex', '0 0 auto', 'important');
    spacer.style.setProperty('height', `${h}px`, 'important');
    spacer.style.setProperty('min-height', `${h}px`, 'important');
    spacer.style.setProperty('max-height', `${h}px`, 'important');
    spacer.style.setProperty('display', 'block', 'important');
    spacer.style.setProperty('overflow', 'hidden', 'important');
    spacer.setAttribute('data-ems-cover-spacer-frozen', '1');
    spacer.setAttribute('data-ems-cover-spacer-height', String(h));
}

/** Spacer = clone main height − live fixed content (letter/header/sign-off); keeps signatory above footer. */
function computeCoverSpacerHeightForPdfClone(liveSheet, cloneSheet) {
    const liveMain = liveSheet?.querySelector?.('.quote-sheet-main-flex');
    const cloneMain = cloneSheet?.querySelector?.('.quote-sheet-main-flex');
    const liveSpacer = liveSheet?.querySelector?.('.quote-cover-page1-spacer');
    if (!liveMain || !cloneMain) return 0;
    const liveSpacerH = liveSpacer?.offsetHeight ?? 0;
    const liveMainH = liveMain.offsetHeight;
    const liveFixedH = Math.max(0, liveMainH - liveSpacerH);
    const cloneMainH = cloneMain.offsetHeight;
    return Math.max(0, Math.round(cloneMainH - liveFixedH));
}

/**
 * Non-cover stamps: sheet-relative px from live preview.
 * Cover page stamps use embedCoverPageStampsInSignatoryColumn instead.
 */
export function collectDigitalSignatureStampPositions(root) {
    if (!root || typeof window === 'undefined') return [];
    const sheets = queryQuoteExportSheets(root);
    const out = [];
    sheets.forEach((sheet, sheetIdx) => {
        if (sheetIdx === 0) return;
        [...sheet.querySelectorAll('.quote-digital-signature-stamp')].forEach((stamp, stampIdx) => {
            const at = elementOffsetWithinSheet(stamp, sheet);
            out.push({ sheetIdx, stampIdx, leftPx: at.left, topPx: at.top });
        });
    });
    return out;
}

/** Sheet-absolute stamps (clause pages). Cover page uses signatory-column embed. */
export function applyDigitalSignatureStampPositions(cloneRoot, positions) {
    if (!cloneRoot || !positions?.length) return;
    const sheets = queryQuoteExportSheets(cloneRoot);
    for (const { sheetIdx, stampIdx, leftPx, topPx } of positions) {
        const sheet = sheets[sheetIdx];
        const stamp = sheet?.querySelectorAll('.quote-digital-signature-stamp')[stampIdx];
        if (!stamp) continue;
        stamp.style.setProperty('position', 'absolute', 'important');
        stamp.style.setProperty('left', `${Math.round(leftPx)}px`, 'important');
        stamp.style.setProperty('top', `${Math.round(topPx)}px`, 'important');
        stamp.style.removeProperty('right');
        stamp.style.removeProperty('bottom');
        stamp.style.removeProperty('transform');
        stamp.setAttribute('data-ems-sig-frozen', '1');
        stamp.setAttribute('data-ems-sig-left', String(Math.round(leftPx)));
        stamp.setAttribute('data-ems-sig-top', String(Math.round(topPx)));
    }
}

/**
 * PDF only: move cover stamps into the signatory column (relative to "For …" gap).
 * Header/footer grid rows and A4 size are untouched — stamp tracks the name line.
 */
export function embedCoverPageStampsInSignatoryColumn(liveRoot, cloneRoot) {
    if (!liveRoot || !cloneRoot || typeof window === 'undefined') return;
    const liveSheet = queryQuoteExportSheets(liveRoot)[0];
    const cloneSheet = queryQuoteExportSheets(cloneRoot)[0];
    if (!liveSheet || !cloneSheet) return;

    const liveCol = liveSheet.querySelector('.quote-cover-signatory-col:not(.quote-cover-signatory-col--co)');
    const cloneCol = cloneSheet.querySelector('.quote-cover-signatory-col:not(.quote-cover-signatory-col--co)');
    if (!liveCol || !cloneCol) return;

    const liveStamps = [...liveSheet.querySelectorAll('.quote-digital-signature-stamp')];
    if (!liveStamps.length) return;

    const liveFor = liveCol.querySelector('.quote-cover-sign-off-for');
    const cloneFor = cloneCol.querySelector('.quote-cover-sign-off-for');
    if (!liveFor || !cloneFor) return;

    cloneCol.style.setProperty('position', 'relative', 'important');
    cloneCol.setAttribute('data-ems-sig-host', '1');

    const zoomRoot = liveRoot.closest('#quote-print-root') || liveRoot;
    const liveForAt = elementOffsetWithinAncestor(liveFor, liveCol, zoomRoot);
    const liveGapBottom = liveForAt.top + liveFor.offsetHeight;

    liveStamps.forEach((liveStamp, idx) => {
        const cloneStamp = cloneSheet.querySelectorAll('.quote-digital-signature-stamp')[idx];
        if (!cloneStamp) return;

        const liveStampAt = elementOffsetWithinAncestor(liveStamp, liveCol, zoomRoot);
        const deltaLeft = liveStampAt.left - liveForAt.left;
        const deltaTop = liveStampAt.top - liveGapBottom;

        cloneCol.appendChild(cloneStamp);
        cloneStamp.classList.add('quote-digital-signature-stamp--in-signatory-col');

        const cloneForAt = elementOffsetWithinAncestor(cloneFor, cloneCol, null);
        const cloneGapBottom = cloneForAt.top + cloneFor.offsetHeight;
        const left = cloneForAt.left + deltaLeft;
        const top = cloneGapBottom + deltaTop;

        cloneStamp.style.setProperty('position', 'absolute', 'important');
        cloneStamp.style.setProperty('left', `${Math.round(left)}px`, 'important');
        cloneStamp.style.setProperty('top', `${Math.round(top)}px`, 'important');
        cloneStamp.style.removeProperty('right');
        cloneStamp.style.removeProperty('bottom');
        cloneStamp.style.removeProperty('transform');
        cloneStamp.setAttribute('data-ems-sig-frozen', '1');
        cloneStamp.setAttribute('data-ems-sig-in-col', '1');
        cloneStamp.setAttribute('data-ems-sig-left', String(Math.round(left)));
        cloneStamp.setAttribute('data-ems-sig-top', String(Math.round(top)));
    });
}

/**
 * Mirror sign-off internal spacing from live preview — no spacer/footer/header changes.
 */
export function mirrorCoverSignOffStylesFromLive(liveRoot, cloneRoot) {
    if (!liveRoot || !cloneRoot || typeof window === 'undefined') return false;
    const liveSheet = queryQuoteExportSheets(liveRoot)[0];
    const cloneSheet = queryQuoteExportSheets(cloneRoot)[0];
    if (!liveSheet || !cloneSheet) return false;

    const liveLetter = liveSheet.querySelector('.quote-cover-letter');
    const cloneLetter = cloneSheet.querySelector('.quote-cover-letter');
    if (liveLetter && cloneLetter) {
        const pb = window.getComputedStyle(liveLetter).paddingBottom;
        if (pb) {
            cloneLetter.style.setProperty('--quote-cover-letter-pad-bottom', pb);
            cloneLetter.style.setProperty('padding-bottom', pb, 'important');
        }
    }

    const stylePropsBySelector = {
        '.quote-cover-sign-off': ['min-height', 'padding-bottom', 'padding-top', 'margin-top'],
        '.quote-cover-sign-off-for': ['margin-bottom', 'margin-top', 'line-height', 'font-size'],
        '.quote-cover-signatory-block': ['margin-bottom', 'min-height'],
        '.quote-cover-signatory-line': ['margin-top', 'min-height'],
        '.quote-cover-signatory-designation': ['margin-top'],
    };
    for (const [sel, props] of Object.entries(stylePropsBySelector)) {
        const liveEl = liveSheet.querySelector(sel);
        const cloneEl = cloneSheet.querySelector(sel);
        if (!liveEl || !cloneEl) continue;
        const cs = window.getComputedStyle(liveEl);
        for (const prop of props) {
            const val = cs.getPropertyValue(prop);
            if (val) cloneEl.style.setProperty(prop, val, 'important');
        }
    }

    cloneSheet.setAttribute('data-ems-cover-styles-mirrored', '1');
    return true;
}

/** @deprecated use mirrorCoverSignOffStylesFromLive — kept for imports */
export function freezeCoverPageLayoutFromLive(liveRoot, cloneRoot) {
    return mirrorCoverSignOffStylesFromLive(liveRoot, cloneRoot);
}

/**
 * Grow Dear Sir padding-bottom until gap above signatory matches gap below meta table.
 * @param {HTMLElement} letterEl `.quote-cover-letter`
 * @param {{ lockSpacerForPdf?: boolean, compactForPdf?: boolean }} [options]
 *   lockSpacerForPdf — freeze spacer pixel height from live layout (rare; prefer CSS flex in PDF).
 *   compactForPdf — legacy: collapse spacer (causes signatory–footer gap drift; do not use).
 */
export function applyEqualCoverGaps(letterEl, options = {}) {
    const { lockSpacerForPdf = false, compactForPdf = false } = options;
    if (!letterEl || typeof window === 'undefined') return null;
    if (isCoverSignatoryLayoutLocked(letterEl)) {
        const pb =
            parseFloat(window.getComputedStyle(letterEl).paddingBottom) ||
            COVER_LETTER_PAD_BOTTOM_BASE_PX;
        const extra = Math.max(0, pb - COVER_LETTER_PAD_BOTTOM_BASE_PX);
        return { padBottom: pb, extra, gap: null, locked: true };
    }
    const sheet0 = letterEl.closest('.quote-a4-sheet');
    const firstPage = sheet0?.querySelector('.quote-cover-first-page');
    const table = firstPage?.querySelector('.quote-cover-meta-table');
    const signOff = sheet0?.querySelector('.quote-cover-sign-off');
    if (!table || !signOff) return null;

    if (compactForPdf) {
        letterEl.style.setProperty('--quote-cover-letter-pad-bottom', `${COVER_LETTER_PAD_BOTTOM_BASE_PX}px`);
        letterEl.style.setProperty('padding-bottom', `${COVER_LETTER_PAD_BOTTOM_BASE_PX}px`, 'important');
        sheet0?.style.setProperty('--quote-cover-letter-sign-gap', '0px');
        const spacer = sheet0?.querySelector('.quote-cover-page1-spacer');
        if (spacer) {
            spacer.style.setProperty('flex', '0 0 0');
            spacer.style.setProperty('height', '0');
            spacer.style.setProperty('min-height', '0');
            spacer.style.setProperty('max-height', '0');
            spacer.style.setProperty('display', 'none');
        }
        return { padBottom: COVER_LETTER_PAD_BOTTOM_BASE_PX, extra: 0, gap: 0 };
    }

    const gap1 = letterEl.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
    const gap2 = signOff.getBoundingClientRect().top - letterEl.getBoundingClientRect().bottom;
    const targetGap = Math.max(0, Math.round(gap1));
    const pb = parseFloat(window.getComputedStyle(letterEl).paddingBottom) || 0;
    const currentExtra = Math.max(0, pb - COVER_LETTER_PAD_BOTTOM_BASE_PX);
    const extra = Math.max(0, Math.round(gap2 + currentExtra - targetGap));
    const padBottom = COVER_LETTER_PAD_BOTTOM_BASE_PX + extra;

    letterEl.style.setProperty('--quote-cover-letter-pad-bottom', `${padBottom}px`);
    letterEl.style.setProperty('padding-bottom', `${padBottom}px`, 'important');

    const finalGap2 = Math.max(
        0,
        Math.round(signOff.getBoundingClientRect().top - letterEl.getBoundingClientRect().bottom)
    );
    sheet0?.style.setProperty('--quote-cover-letter-sign-gap', `${finalGap2}px`);

    const spacer = sheet0?.querySelector('.quote-cover-page1-spacer');
    if (lockSpacerForPdf && spacer) {
        const spacerH = Math.max(0, Math.round(spacer.getBoundingClientRect().height));
        spacer.style.setProperty('display', 'block');
        spacer.style.setProperty('flex', '0 0 auto');
        spacer.style.setProperty('height', `${spacerH}px`);
        spacer.style.setProperty('min-height', `${spacerH}px`);
        spacer.style.setProperty('max-height', `${spacerH}px`);
    }

    return { padBottom, extra, gap: finalGap2 };
}

/** Remove inline spacer overrides so PDF/CSS flex layout can match on-screen preview. */
export function clearCoverSpacerInlineStylesForPdf(letterEl) {
    const sheet0 = letterEl?.closest?.('.quote-a4-sheet');
    const spacer = sheet0?.querySelector('.quote-cover-page1-spacer');
    if (!spacer) return;
    for (const prop of ['display', 'height', 'min-height', 'max-height', 'flex']) {
        spacer.style.removeProperty(prop);
    }
}

/** Pin one A4 sheet via inline grid (matches on-screen #quote-preview .quote-a4-sheet). */
function pinQuoteA4SheetGridInline(sheetEl, { isCover = false } = {}) {
    if (!sheetEl) return;
    sheetEl.style.setProperty('box-sizing', 'border-box', 'important');
    sheetEl.style.setProperty('width', '210mm', 'important');
    sheetEl.style.setProperty('padding', '15mm', 'important');
    sheetEl.style.setProperty('margin', '0 auto', 'important');
    sheetEl.style.setProperty('height', '297mm', 'important');
    sheetEl.style.setProperty('min-height', '297mm', 'important');
    sheetEl.style.setProperty('max-height', '297mm', 'important');
    sheetEl.style.setProperty('display', 'grid', 'important');
    sheetEl.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
    sheetEl.style.setProperty('grid-template-rows', 'auto minmax(0, 1fr) auto', 'important');
    sheetEl.style.setProperty('align-content', 'stretch', 'important');
    sheetEl.style.setProperty('overflow', 'hidden', 'important');
    sheetEl.style.setProperty('page-break-after', 'auto', 'important');
    sheetEl.style.setProperty('break-after', 'auto', 'important');

    const logo = sheetEl.querySelector(':scope > .quote-sheet-logo-row');
    if (logo) logo.style.setProperty('grid-row', '1', 'important');

    const main = sheetEl.querySelector(':scope > .quote-sheet-main-flex');
    if (main) {
        main.style.setProperty('grid-row', '2', 'important');
        main.style.setProperty('min-height', '0', 'important');
        main.style.setProperty('height', '100%', 'important');
        main.style.setProperty('overflow', 'hidden', 'important');
        main.style.setProperty('display', 'flex', 'important');
        main.style.setProperty('flex-direction', 'column', 'important');
    }

    const content = sheetEl.querySelector('.quote-sheet-main-flex > .content-section');
    if (content) {
        if (isCover) {
            content.style.setProperty('flex', '1 1 0', 'important');
            content.style.setProperty('display', 'flex', 'important');
            content.style.setProperty('flex-direction', 'column', 'important');
            content.style.setProperty('min-height', '0', 'important');
            content.style.setProperty('overflow', 'hidden', 'important');
        } else {
            content.style.setProperty('flex', '0 1 auto', 'important');
            content.style.setProperty('min-height', '0', 'important');
            content.style.setProperty('max-height', '100%', 'important');
            content.style.setProperty('overflow', 'hidden', 'important');
        }
    }

    const header = sheetEl.querySelector('.header-section');
    if (header) header.style.setProperty('flex', '0 0 auto', 'important');

    const spacer = sheetEl.querySelector('.quote-cover-page1-spacer');
    if (isCover && spacer) {
        const frozenH = spacer.getAttribute('data-ems-cover-spacer-height');
        if (spacer.getAttribute('data-ems-cover-spacer-frozen') === '1' && frozenH) {
            applyFrozenCoverSpacerHeight(spacer, frozenH);
        } else {
            spacer.style.setProperty('flex', '1 1 0', 'important');
            spacer.style.setProperty('min-height', '0', 'important');
            spacer.style.removeProperty('height');
            spacer.style.removeProperty('max-height');
            spacer.style.setProperty('overflow', 'hidden', 'important');
        }
    }

    const signOff = sheetEl.querySelector('.quote-cover-sign-off');
    if (isCover && signOff) {
        signOff.style.setProperty('flex', '0 0 auto', 'important');
    }

    const footer = sheetEl.querySelector(':scope > .footer-section');
    if (footer) {
        footer.style.setProperty('grid-row', '3', 'important');
        footer.style.setProperty('align-self', 'end', 'important');
        footer.style.removeProperty('margin-top');
        footer.style.removeProperty('order');
        footer.style.removeProperty('flex');
    }

    sheetEl.querySelectorAll('.quote-digital-signature-stamp[data-ems-sig-frozen="1"]').forEach((stamp) => {
        const left = stamp.getAttribute('data-ems-sig-left');
        const top = stamp.getAttribute('data-ems-sig-top');
        if (left == null || top == null) return;
        stamp.style.setProperty('position', 'absolute', 'important');
        stamp.style.setProperty('left', `${left}px`, 'important');
        stamp.style.setProperty('top', `${top}px`, 'important');
    });
}

/** Pin grid + 297mm on every sheet in captured fragment HTML (inline wins over hoisted height:auto). */
function pinQuoteA4SheetsInFragmentHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return raw;
    if (typeof DOMParser !== 'undefined') {
        try {
            const doc = new DOMParser().parseFromString(
                `<div id="ems-quote-fragment-pin-root">${raw}</div>`,
                'text/html'
            );
            const root = doc.getElementById('ems-quote-fragment-pin-root');
            if (root) {
                root.querySelectorAll('.quote-a4-sheet').forEach((sheet) => {
                    if (sheet.classList.contains('quote-clause-measure-host')) return;
                    if (sheet.hasAttribute('data-pack-measure-shell')) return;
                    const isCover = !sheet.classList.contains('quote-a4-sheet--continuation');
                    pinQuoteA4SheetGridInline(sheet, { isCover });
                });
                return root.innerHTML;
            }
        } catch {
            /* regex-free fallback: return raw */
        }
    }
    return raw;
}

/** @deprecated use pinQuoteA4SheetGridInline */
function pinQuoteA4SheetFlexInline(sheetEl, options) {
    pinQuoteA4SheetGridInline(sheetEl, options);
}

/** @deprecated use pinQuoteA4SheetFlexInline */
function prepareCoverSheetPdfFlexShell(letterEl) {
    const sheet0 = letterEl?.closest?.('.quote-a4-sheet');
    if (!sheet0) return;
    pinQuoteA4SheetFlexInline(sheet0, { isCover: true });
}

function stripElementInlineStyles(el, props) {
    if (!el?.style) return;
    for (const prop of props) el.style.removeProperty(prop);
}

const PDF_CAPTURE_SHEET_LAYOUT_PROPS = [
    'height',
    'min-height',
    'max-height',
    'display',
    'flex-direction',
    'grid-template-columns',
    'grid-template-rows',
    'align-content',
    'overflow',
    'flex',
    'order',
    'grid-row',
    'align-self',
    'page-break-after',
    'page-break-before',
    'break-after',
    'break-before',
    'page-break-inside',
    'break-inside',
    'margin-bottom',
    'margin-top',
];

/** Reset cover letter padding / spacer locks so each PDF capture measures from a clean baseline. */
function resetCoverLetterInlineStyles(root) {
    if (!root) return;
    const letter = root.querySelector?.('.quote-cover-letter');
    if (isCoverSignatoryLayoutLocked(letter)) return;
    if (letter) {
        stripElementInlineStyles(letter, ['padding-bottom', '--quote-cover-letter-pad-bottom']);
    }
    root.querySelectorAll?.('.quote-a4-sheet').forEach((sheet) => {
        stripElementInlineStyles(sheet, ['--quote-cover-letter-sign-gap']);
        const spacer = sheet.querySelector('.quote-cover-page1-spacer');
        stripElementInlineStyles(spacer, ['display', 'height', 'min-height', 'max-height', 'flex']);
    });
}

/** Strip inline layout left on sheet nodes from prior PDF captures or align/measure passes. */
function stripPdfCaptureSheetLayoutInlineStyles(root, { preserveCoverLayout = false } = {}) {
    if (!root) return;
    const coverLocked =
        preserveCoverLayout || isCoverSignatoryLayoutLocked(root.querySelector?.('.quote-cover-letter'));
    root.querySelectorAll?.('.quote-a4-sheet').forEach((sheet) => {
        const isLockedCoverSheet =
            coverLocked && !sheet.classList.contains('quote-a4-sheet--continuation');
        stripElementInlineStyles(sheet, PDF_CAPTURE_SHEET_LAYOUT_PROPS);
        stripElementInlineStyles(sheet.querySelector('.quote-sheet-main-flex'), PDF_CAPTURE_SHEET_LAYOUT_PROPS);
        stripElementInlineStyles(
            sheet.querySelector('.quote-sheet-main-flex > .content-section'),
            PDF_CAPTURE_SHEET_LAYOUT_PROPS
        );
        stripElementInlineStyles(sheet.querySelector('.header-section'), ['flex', 'flex-shrink']);
        if (!isLockedCoverSheet) {
            stripElementInlineStyles(sheet.querySelector('.quote-cover-page1-spacer'), [
                'display',
                'height',
                'min-height',
                'max-height',
                'flex',
            ]);
        }
    });
}

/** Strip PDF-capture inline layout overrides from the live preview (prevents stacked bad exports). */
export function clearCoverPdfCaptureInlineStyles(rootEl) {
    const root = rootEl || (typeof document !== 'undefined' ? document.getElementById('quote-print-root') : null);
    if (!root) return;
    resetCoverLetterInlineStyles(root);
    stripPdfCaptureSheetLayoutInlineStyles(root);
}

/** Move .quote-a4-sheet nodes to be direct children of #quote-preview (drop wrapper div). */
function unwrapQuotePreviewSheetWrapper(clone) {
    const preview = clone?.querySelector?.('#quote-preview');
    if (!preview) return;
    const wrapper = preview.querySelector(':scope > div');
    if (!wrapper) return;
    const sheets = [...wrapper.querySelectorAll(':scope > .quote-a4-sheet')];
    if (!sheets.length) return;
    sheets.forEach((sheet) => preview.appendChild(sheet));
    if (!wrapper.querySelector(':scope > *')) wrapper.remove();
}

/** Drop preview zoom wrappers — inline transform/width breaks Puppeteer page height. */
function flattenQuotePreviewZoomWrappersInClone(clone) {
    const preview = clone?.querySelector?.('#quote-preview');
    if (!preview) return;
    const viewport = preview.closest('.quote-preview-zoom-viewport');
    if (viewport?.parentNode) {
        viewport.parentNode.insertBefore(preview, viewport);
        viewport.remove();
    }
    stripElementInlineStyles(preview, ['transform', 'margin', 'padding', 'min-height', 'height']);
    preview.style.setProperty('width', '210mm');
    preview.style.setProperty('margin', '0 auto');
    preview.style.setProperty('padding', '0');
}

function mountQuoteCloneOffscreen(clone) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-ems-pdf-offscreen-capture', '1');
    wrap.style.cssText =
        'position:fixed;left:-12000px;top:0;width:210mm;visibility:hidden;pointer-events:none;overflow:hidden;z-index:-1';
    document.documentElement.appendChild(wrap);
    wrap.appendChild(clone);
    return wrap;
}

/** Apply PDF-only 297mm flex shell on every sheet in a detached clone. */
function finalizeAllSheetsLayoutOnClone(clone, { preserveCoverLayout = false } = {}) {
    if (!preserveCoverLayout) {
        resetCoverLetterInlineStyles(clone);
    }
    stripPdfCaptureSheetLayoutInlineStyles(clone, { preserveCoverLayout });
    const preview = clone.querySelector('#quote-preview');
    if (preview) {
        preview.style.setProperty('display', 'flex', 'important');
        preview.style.setProperty('flex-direction', 'column', 'important');
        preview.style.setProperty('align-items', 'stretch', 'important');
        preview.style.setProperty('width', '210mm', 'important');
        preview.style.setProperty('max-width', '210mm', 'important');
        preview.style.setProperty('margin', '0 auto', 'important');
        preview.style.setProperty('padding', '0', 'important');
        preview.style.setProperty('gap', '0', 'important');
    }
    clone.querySelectorAll('.quote-a4-sheet').forEach((sheet) => {
        const isCover = !sheet.classList.contains('quote-a4-sheet--continuation');
        pinQuoteA4SheetGridInline(sheet, { isCover });
    });
    if (preserveCoverLayout) return;
    const letter = clone?.querySelector?.('.quote-cover-letter');
    if (letter && !isCoverSignatoryLayoutLocked(letter)) {
        applyEqualCoverGaps(letter);
    }
}

/** Run immediately before PDF HTML capture — live preview gap sync only (no PDF shell mutation). */
export function syncCoverLetterGapBeforePdfCapture(letterEl) {
    if (!letterEl || isCoverSignatoryLayoutLocked(letterEl)) return;
    const run = () => applyEqualCoverGaps(letterEl);
    run();
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run);
    }
}

/** Await layout after cover gap sync on the live preview. */
export async function syncCoverLetterGapBeforePdfCaptureAsync(letterEl) {
    if (!letterEl || isCoverSignatoryLayoutLocked(letterEl)) return;
    applyEqualCoverGaps(letterEl);
    if (typeof requestAnimationFrame === 'function') {
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }
    applyEqualCoverGaps(letterEl);
}

const QUOTE_LOGO_IMG_SELECTOR =
    '.quote-sheet-logo-row img, .quote-continuation-header img, .quote-print-repeat-strip img';

function cloneQuotePrintRootForExport(rootEl) {
    const root = rootEl || (typeof document !== 'undefined' ? document.getElementById('quote-print-root') : null);
    if (!root) return null;
    const clone = root.cloneNode(true);
    const removeSel = [
        '.quote-clause-measure-host',
        '.quote-print-footer-rule',
        '.quote-preview-clause-edit-bar',
        '[data-pack-merge-measure]',
        '[data-pack-measure-shell]',
        '.quote-a4-sheet--word-flow-extra',
        '[data-word-flow-extra]',
        '.quote-clause-word-flow-ribbon',
    ];
    for (const sel of removeSel) {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    /** Inline preview editors → static clause HTML for print/PDF. */
    clone.querySelectorAll('.quote-clause-inline-editor').forEach((wrap) => {
        const wys = wrap.querySelector('.jodit-wysiwyg');
        const html = wys?.innerHTML || '';
        const staticDiv = document.createElement('div');
        staticDiv.className = 'clause-content';
        staticDiv.style.fontSize = '13px';
        staticDiv.innerHTML = html;
        wrap.replaceWith(staticDiv);
    });
    /** Strip only the duplicate fixed-header strip outside sheets — keep per-sheet logos inside `.quote-a4-sheet`. */
    clone.querySelectorAll(':scope > .quote-print-repeat-strip').forEach((n) => n.remove());
    removeEmptyQuoteA4Sheets(clone);
    const preview = clone.querySelector('#quote-preview');
    if (preview) renumberQuoteSheetPageIndicators(preview);
    return clone;
}

function imgElementToDataUrl(img) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

async function fetchImageAsDataUrl(url) {
    const res = await fetch(url, { credentials: 'include', cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function resolveQuoteLogoDataUrl(liveImg, src) {
    const raw = String(src || '').trim();
    if (!raw) return null;
    if (/^data:/i.test(raw)) return raw;
    const fromCanvas = liveImg ? imgElementToDataUrl(liveImg) : null;
    if (fromCanvas) return fromCanvas;
    try {
        return await fetchImageAsDataUrl(raw);
    } catch {
        return null;
    }
}

function waitForQuoteLogoImages(root, timeoutMs = 4000) {
    if (!root) return Promise.resolve();
    const imgs = [...root.querySelectorAll(QUOTE_LOGO_IMG_SELECTOR)];
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise((resolve) => {
                    if (img.complete) {
                        resolve();
                        return;
                    }
                    const done = () => resolve();
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    setTimeout(done, timeoutMs);
                })
        )
    );
}

function waitForQuoteSignatureStampImages(root, timeoutMs = 4000) {
    if (!root) return Promise.resolve();
    const imgs = [...root.querySelectorAll('.quote-digital-signature-stamp img')];
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
        imgs.map(
            (img) =>
                new Promise((resolve) => {
                    if (img.complete && img.naturalWidth > 0) {
                        resolve();
                        return;
                    }
                    const done = () => resolve();
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    setTimeout(done, timeoutMs);
                })
        )
    );
}

/** Embed header logos as data URLs so print/PDF match on-screen preview (no broken /uploads across hosts). */
export async function embedQuoteLogoImagesInClone(cloneRoot, liveRoot) {
    if (!cloneRoot) return;
    const liveImgs = liveRoot ? [...liveRoot.querySelectorAll(QUOTE_LOGO_IMG_SELECTOR)] : [];
    const cloneImgs = [...cloneRoot.querySelectorAll(QUOTE_LOGO_IMG_SELECTOR)];
    await Promise.all(
        cloneImgs.map(async (cloneImg, index) => {
            const liveImg = liveImgs[index];
            const src = String(
                liveImg?.currentSrc || liveImg?.src || cloneImg.getAttribute('src') || ''
            ).trim();
            if (!src || /^data:/i.test(src)) return;
            const dataUrl = await resolveQuoteLogoDataUrl(liveImg, src);
            if (dataUrl) {
                cloneImg.setAttribute('src', dataUrl);
                cloneImg.removeAttribute('srcset');
            }
        })
    );
}

export function captureQuotePrintRootInnerHtmlForPdf(rootEl) {
    const clone = cloneQuotePrintRootForExport(rootEl);
    return clone ? clone.innerHTML : '';
}

/** Preferred capture for print popup and server PDF — inlines logos from the live preview. */
export async function captureQuotePrintRootInnerHtmlForPdfAsync(rootEl) {
    const root = rootEl || (typeof document !== 'undefined' ? document.getElementById('quote-print-root') : null);
    if (!root) return '';
    await waitForQuoteLogoImages(root);
    await waitForQuoteSignatureStampImages(root);
    await syncCoverLetterGapBeforePdfCaptureAsync(root.querySelector('.quote-cover-letter'));

    const stampPositions = collectDigitalSignatureStampPositions(root);
    const hasCoverLetter = Boolean(root.querySelector('.quote-cover-letter'));

    const clone = cloneQuotePrintRootForExport(root);
    if (!clone) return '';
    flattenQuotePreviewZoomWrappersInClone(clone);
    unwrapQuotePreviewSheetWrapper(clone);
    if (!hasCoverLetter) {
        resetCoverLetterInlineStyles(clone);
    }
    stripPdfCaptureSheetLayoutInlineStyles(clone, { preserveCoverLayout: hasCoverLetter });
    await embedQuoteLogoImagesInClone(clone, root);

    const mount = mountQuoteCloneOffscreen(clone);
    let fragmentHtml = '';
    try {
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
        }
        finalizeAllSheetsLayoutOnClone(clone, { preserveCoverLayout: hasCoverLetter });
        if (hasCoverLetter) {
            mirrorCoverSignOffStylesFromLive(root, clone);
            if (typeof requestAnimationFrame === 'function') {
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            embedCoverPageStampsInSignatoryColumn(root, clone);
        }
        if (stampPositions.length) {
            applyDigitalSignatureStampPositions(clone, stampPositions);
        }
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        fragmentHtml = clone.innerHTML;
    } finally {
        mount.remove();
    }
    return fragmentHtml;
}

/** Selectors removed before html2pdf — measure hosts and print-only chrome (keep cover spacer for gap parity). */
const HTML2PDF_REMOVE_SELECTORS = [
    '.quote-clause-measure-host',
    '[data-pack-merge-measure]',
    '[data-pack-measure-shell]',
    '.quote-print-footer-rule',
    '.quote-print-repeat-strip',
    '.quote-preview-clause-edit-bar',
    '.ems-browser-pdf-hint',
    '.no-print',
];

const HTML2PDF_SKIP_EMPTY_REMOVE_TAGS = new Set([
    'IMG',
    'BR',
    'HR',
    'TD',
    'TH',
    'TR',
    'TABLE',
    'TBODY',
    'THEAD',
    'TFOOT',
    'STYLE',
    'SCRIPT',
    'SVG',
    'CANVAS',
    'COL',
    'COLGROUP',
]);

/**
 * html2pdf overrides — unified sheet CSS (same as Puppeteer / data-preview-pdf).
 */
/**
 * html2pdf must NOT use page-break-before on 297mm sheets — each sheet already fills a page;
 * CSS "before" breaks + html2pdf legacy/css modes create a blank page between sheets.
 */
const HTML2PDF_PAGE_BREAK_OVERRIDES = `
[data-ems-pdf-export="1"] .quote-a4-sheet,
[data-ems-pdf-export="1"] .quote-a4-sheet + .quote-a4-sheet {
    page-break-before: auto !important;
    break-before: auto !important;
    page-break-after: auto !important;
    break-after: auto !important;
}
[data-ems-pdf-export="1"] .quote-a4-sheet {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
[data-ems-pdf-export="1"] .quote-a4-sheet:last-of-type {
    page-break-after: avoid !important;
    break-after: avoid !important;
}
`;

/** Puppeteer / data-preview-pdf — no inter-sheet breaks; keep each sheet intact (logo top, footer bottom). */
const PDF_PAGE_BREAK_OVERRIDES = `
html[data-preview-pdf="1"] .quote-a4-sheet,
html[data-preview-pdf="1"] .quote-a4-sheet + .quote-a4-sheet {
    page-break-before: auto !important;
    break-before: auto !important;
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet:last-of-type {
    page-break-after: avoid !important;
    break-after: avoid !important;
}
`;

export const HTML2PDF_EXPORT_STYLES = `
${QUOTE_UNIFIED_SHEET_EXPORT_CSS}
${HTML2PDF_PAGE_BREAK_OVERRIDES}
#quote-print-root,
#quote-preview {
    background: #fff !important;
    padding: 0 !important;
    margin: 0 auto !important;
    width: 210mm !important;
    max-width: 210mm !important;
    box-shadow: none !important;
    gap: 0 !important;
}
#quote-preview {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
}
.quote-a4-sheet {
    position: relative !important;
    box-shadow: none !important;
    border: none !important;
}
.quote-sheet-logo-row {
    grid-row: 1 !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
    box-sizing: border-box !important;
}
.quote-sheet-logo-row > div {
    width: 100% !important;
    text-align: right !important;
}
.header-section.quote-header-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    gap: 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
.quote-header-address-col {
    flex: 1 1 0 !important;
    max-width: ${EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH} !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
.quote-header-quote-col {
    flex: 0 1 ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
.quote-header-quote-stack {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
}
.quote-a4-sheet > .footer-section {
    width: 100% !important;
    grid-row: 3 !important;
    align-self: end !important;
    margin-top: auto !important;
    min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
    box-sizing: border-box !important;
}
.quote-cover-first-page {
    display: flex !important;
    flex-direction: column !important;
    gap: 18px !important;
    width: 100% !important;
}
.quote-cover-page1-spacer {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    max-height: none !important;
}
.quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex > .content-section {
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
}
.content-section,
.quote-clause-block,
.clause-content {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    text-align: left !important;
}
.clause-content table {
    table-layout: fixed !important;
    width: 100% !important;
    border-collapse: collapse !important;
}
.quote-preview-panel-shell,
.quote-cover-body-panel,
.quote-cover-meta-table,
.quote-clause-heading-panel {
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
}
.quote-print-footer-wrap {
    width: 50% !important;
    max-width: 50% !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    text-align: right !important;
}
table, tr, td, th {
    page-break-inside: auto !important;
    break-inside: auto !important;
}
tr.avoid-break, .avoid-break {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
}
.footer-section {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
}
#quote-print-root[data-print-with-header='0'] .quote-sheet-logo-row,
#quote-print-root[data-print-with-header='0'] .quote-continuation-header,
#quote-print-root[data-print-with-header='0'] .quote-sheet-logo-row img,
#quote-print-root[data-print-with-header='0'] .quote-continuation-header img,
#quote-print-root[data-print-with-header='0'] .quote-print-footer-wrap {
    visibility: hidden !important;
    opacity: 0 !important;
}
`;

function elementHasVisibleContent(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches?.('img[src], table, svg, canvas, .quote-digital-signature-stamp, .clause-content')) {
        return true;
    }
    const text = String(el.innerText || el.textContent || '')
        .replace(/\u00a0/g, ' ')
        .trim();
    if (text) return true;
    return !!el.querySelector?.('img[src], table, svg, canvas, .quote-digital-signature-stamp');
}

/** Remove leaf nodes with no text/images (spacer wrappers, empty divs). */
export function removeEmptyElementsFromClone(root) {
    if (!root) return;
    const nodes = [...root.querySelectorAll('*')].reverse();
    for (const el of nodes) {
        if (el === root) continue;
        if (HTML2PDF_SKIP_EMPTY_REMOVE_TAGS.has(el.tagName)) continue;
        if (el.closest?.('.quote-clause-measure-host, .quote-cover-page1-spacer')) {
            el.remove();
            continue;
        }
        /* Keep logo row even if img still loading — PDF CSS reserves header space. */
        if (!elementHasVisibleContent(el) && el.children.length === 0) {
            el.remove();
        }
    }
}

/** Strip inline/page-break and fixed A4 height left on sheet nodes from the live preview. */
function normalizeSheetNodesForHtml2pdf(clone) {
    clone.querySelectorAll('.quote-a4-sheet').forEach((sheet) => {
        sheet.style.removeProperty('height');
        sheet.style.removeProperty('min-height');
        sheet.style.removeProperty('max-height');
        sheet.style.removeProperty('page-break-after');
        sheet.style.removeProperty('page-break-before');
        sheet.style.removeProperty('break-after');
        sheet.style.removeProperty('break-before');
        sheet.style.removeProperty('page-break-inside');
        sheet.style.removeProperty('break-inside');
        sheet.style.removeProperty('margin-bottom');
    });
    clone.querySelectorAll('.quote-sheet-main-flex').forEach((el) => {
        el.style.removeProperty('height');
        el.style.removeProperty('min-height');
        el.style.removeProperty('max-height');
        el.style.removeProperty('overflow');
    });
}

/**
 * Clone #quote-print-root for html2pdf: no embedded preview CSS, no 297mm shells, no forced breaks.
 * @returns {Promise<HTMLElement|null>}
 */
export async function prepareQuotePrintRootCloneForHtml2pdf(rootEl) {
    const root = rootEl || (typeof document !== 'undefined' ? document.getElementById('quote-print-root') : null);
    if (!root) return null;

    await waitForQuoteLogoImages(root);
    await waitForQuoteSignatureStampImages(root);
    await syncCoverLetterGapBeforePdfCaptureAsync(root.querySelector('.quote-cover-letter'));
    const stampPositions = collectDigitalSignatureStampPositions(root);
    const hasCoverLetter = Boolean(root.querySelector('.quote-cover-letter'));
    const clone = cloneQuotePrintRootForExport(root);
    if (!clone) return null;

    for (const sel of HTML2PDF_REMOVE_SELECTORS) {
        clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    clone.querySelectorAll(':scope > .quote-print-repeat-strip').forEach((n) => n.remove());

    /** Keep embedded preview <style> for panels/tables; HTML2PDF_EXPORT_STYLES overrides height/breaks only. */
    removeEmptyElementsFromClone(clone);
    normalizeSheetNodesForHtml2pdf(clone);

    await embedQuoteLogoImagesInClone(clone, root);

    const mount = mountQuoteCloneOffscreen(clone);
    try {
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
        }
        finalizeAllSheetsLayoutOnClone(clone, { preserveCoverLayout: hasCoverLetter });
        if (hasCoverLetter) {
            mirrorCoverSignOffStylesFromLive(root, clone);
            if (typeof requestAnimationFrame === 'function') {
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            embedCoverPageStampsInSignatoryColumn(root, clone);
        }
        if (stampPositions.length) {
            applyDigitalSignatureStampPositions(clone, stampPositions);
        }
    } finally {
        mount.remove();
    }

    clone.setAttribute('data-ems-pdf-export', '1');

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-ems-html2pdf', '1');
    styleEl.textContent = HTML2PDF_EXPORT_STYLES;
    clone.appendChild(styleEl);

    return clone;
}

/** html2pdf.js options aligned with HTML2PDF_EXPORT_STYLES (no sheet "before" breaks). */
export function buildHtml2pdfOptions(filename) {
    /** ~210mm at 96dpi — keeps html2canvas width aligned with A4 sheet CSS */
    const a4WidthPx = Math.round((210 / 25.4) * 96);
    return {
        margin: 0,
        filename: filename || 'Quote.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            width: a4WidthPx,
            windowWidth: a4WidthPx,
            useCORS: true,
            logging: false,
            letterRendering: true,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: {
            /** legacy only — no sheet before-breaks; 297mm sheets already fill one page each */
            mode: ['legacy'],
            avoid: ['.quote-clause-heading-panel', '.footer-section', '.avoid-break'],
        },
    };
}

const PDF_SELF_CLOSE_FIX_TAGS = ['div', 'span', 'p', 'a', 'section', 'article', 'main', 'header', 'footer', 'label', 'li', 'td', 'th', 'tr', 'tbody', 'thead', 'table', 'h1', 'h2', 'h3'];

function fixInvalidSelfClosingTags(html) {
    let out = String(html);
    for (const tag of PDF_SELF_CLOSE_FIX_TAGS) {
        const re = new RegExp(`<${tag}([^>]*?)\\s*\\/\\s*>`, 'gi');
        out = out.replace(re, `<${tag}$1></${tag}>`);
    }
    return out;
}

function normalizePdfStaticAssets(html, apiOrigin, rewriteFromOrigin) {
    if (!html || !apiOrigin) return html;
    const api = String(apiOrigin).replace(/\/$/, '');
    let out = html;
    const from = String(rewriteFromOrigin || '').replace(/\/$/, '');
    if (from && from.toLowerCase() !== api.toLowerCase()) {
        const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(esc, 'gi'), api);
    }
    out = out.replace(/(\ssrc=["'])(\/uploads\/[^"']+)(["'])/gi, (_, q1, path, q2) => `${q1}${api}${path}${q2}`);
    out = out.replace(/(\ssrc=["'])uploads\/([^"']+)(["'])/gi, (_, q1, rest, q2) => `${q1}${api}/uploads/${rest}${q2}`);
    out = out.replace(/(url\(["']?)(\/uploads\/[^)"']+)(["']?\))/gi, (_, a, path, b) => `${a}${api}${path}${b}`);
    return out;
}

function getServerPdfHeaderModeCss(printWithHeader) {
    if (!printWithHeader) {
        /**
         * Keep layout: visibility:hidden preserves box size (no reflow). Page "Page X of Y" stays visible;
         * only logo band + company address block are invisible. Repeat strip is off-flow → display:none.
         * Scoped to data-print-with-header + @media print so export overrides cannot force visibility back on.
         */
        const hideLogo =
            '#quote-print-root[data-print-with-header="0"] .quote-sheet-logo-row,' +
            '#quote-print-root[data-print-with-header="0"] .quote-continuation-header,' +
            'html[data-preview-pdf="1"] #quote-print-root[data-print-with-header="0"] .quote-sheet-logo-row,' +
            'html[data-preview-pdf="1"] #quote-print-root[data-print-with-header="0"] .quote-continuation-header';
        const hideLogoImg =
            '#quote-print-root[data-print-with-header="0"] .quote-sheet-logo-row img,' +
            '#quote-print-root[data-print-with-header="0"] .quote-continuation-header img,' +
            'html[data-preview-pdf="1"] #quote-print-root[data-print-with-header="0"] .quote-sheet-logo-row img,' +
            'html[data-preview-pdf="1"] #quote-print-root[data-print-with-header="0"] .quote-continuation-header img';
        const hideFooter =
            '#quote-print-root[data-print-with-header="0"] .quote-print-footer-wrap,' +
            'html[data-preview-pdf="1"] #quote-print-root[data-print-with-header="0"] .quote-print-footer-wrap';
        return (
            `${hideLogo}{ visibility: hidden !important; opacity: 0 !important; } ` +
            `${hideLogoImg}{ visibility: hidden !important; opacity: 0 !important; } ` +
            `${hideFooter}{ visibility: hidden !important; opacity: 0 !important; } ` +
            '#quote-print-root[data-print-with-header="0"] .quote-print-repeat-strip,' +
            '#quote-print-root[data-print-with-header="0"] .print-logo-section' +
            '{ display: none !important; } ' +
            '@media print { ' +
            `${hideLogo}{ visibility: hidden !important; opacity: 0 !important; } ` +
            `${hideLogoImg}{ visibility: hidden !important; opacity: 0 !important; } ` +
            `${hideFooter}{ visibility: hidden !important; opacity: 0 !important; } ` +
            '}'
        );
    }
    return (
        '#quote-print-root[data-print-with-header="1"] .quote-print-repeat-strip, ' +
        '#quote-print-root[data-print-with-header="1"] .quote-print-footer-rule ' +
        '{ display: none !important; }'
    );
}

/**
 * Puppeteer PDF: typography/panels from QuoteForm preview; sheet layout is QUOTE_UNIFIED grid + inline pin.
 * Do not add height:auto or flex-column rules on .quote-a4-sheet here — they break page alignment.
 */
const PREVIEW_PDF_SCREEN_OVERRIDES = `
html[data-preview-pdf="1"] body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    box-sizing: border-box !important;
    min-width: 210mm !important;
}
html[data-preview-pdf="1"] #quote-print-root {
    background: white !important;
    padding: 0 !important;
    margin: 0 auto !important;
    width: 210mm !important;
    max-width: 210mm !important;
    display: block !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 0 !important;
    padding: 0 !important;
    margin: 0 auto !important;
    background: white !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet {
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-document-root {
    width: 100% !important;
    max-width: 210mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box !important;
}
/** Print/PDF: block imgs ignore parent text-align — keep logo right-aligned like on-screen flex layout */
html[data-preview-pdf="1"] .quote-sheet-logo-row {
    grid-row: 1 !important;
    flex: 0 0 auto !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: flex-end !important;
    align-items: flex-start !important;
    width: 100% !important;
    margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-sheet-logo-row > div {
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .header-section.quote-header-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    gap: 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    margin-bottom: 6px !important;
}
html[data-preview-pdf="1"] .quote-header-address-col,
html[data-preview-pdf="1"] .quote-header-quote-col {
    box-sizing: border-box !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-self: stretch !important;
}
html[data-preview-pdf="1"] .quote-header-address-col {
    flex: 1 1 0 !important;
    width: auto !important;
    max-width: ${EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH} !important;
}
html[data-preview-pdf="1"] .quote-header-quote-col {
    flex: 0 1 ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
    width: auto !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_COL_WIDTH} !important;
}
html[data-preview-pdf="1"] .quote-preview-panel-shell {
    border: 1px solid #e2e8f0 !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
}
html[data-preview-pdf="1"] .quote-header-quote-stack {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel {
    border-radius: 5px !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-row--header {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    background: ${EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT} !important;
    border-radius: 5px 5px 0 0 !important;
    padding: ${EMS_QUOTE_ACCENT_HEADER_PADDING} !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    line-height: ${EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-row--header .quote-header-address-panel-label--solo {
    flex: 1 1 auto !important;
    max-width: none !important;
    width: 100% !important;
    padding-right: 0 !important;
    font-weight: 600 !important;
    color: rgba(252, 252, 253, 0.96) !important;
    font-size: ${EMS_QUOTE_ACCENT_HEADER_FONT_SIZE} !important;
    line-height: ${EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT} !important;
    letter-spacing: 0.02em !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-customer {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #0f172a !important;
    line-height: 1.45 !important;
    margin: 0 0 4px 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    border-radius: 0 0 5px 5px !important;
    padding: 6px 8px 8px 8px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-address {
    font-size: 12px !important;
    color: #475569 !important;
    white-space: pre-line !important;
    line-height: 1.32 !important;
    flex: 1 1 auto !important;
    min-width: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-address-with-icon {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 6px !important;
    margin-top: 2px !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    width: 17px !important;
    height: 17px !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap svg {
    display: block !important;
    stroke: #ffffff !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--map {
    background: #0369a1 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--tel {
    background: #047857 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--fax {
    background: #475569 !important;
}
html[data-preview-pdf="1"] .quote-header-address-meta-ic-wrap--mail {
    background: #4f46e5 !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact {
    font-size: 12px !important;
    color: #475569 !important;
    margin-top: 6px !important;
    line-height: 1.32 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 4px !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact-line {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 6px !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] .quote-header-address-panel-contact-line span:last-child {
    flex: 1 1 auto !important;
    min-width: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel > .quote-header-address-panel-row--header {
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel {
    width: 100% !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    font-size: 13px !important;
    box-sizing: border-box !important;
    flex: 0 0 auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel--no-header .quote-header-quote-panel-mid {
    border-radius: 5px !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-body {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-meta-ic-wrap {
    width: 17px !important;
    height: 17px !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-meta-ic-wrap svg {
    display: block !important;
    stroke: #ffffff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--ref {
    color: #ffffff !important;
    background: #2563eb !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--date {
    color: #ffffff !important;
    background: #059669 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--user {
    color: #ffffff !important;
    background: #7c3aed !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--phone {
    color: #ffffff !important;
    background: #0d9488 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--email {
    color: #ffffff !important;
    background: #0284c7 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--tag {
    color: #ffffff !important;
    background: #d97706 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--custref {
    color: #ffffff !important;
    background: #4f46e5 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-meta-ic-wrap--clock {
    color: #ffffff !important;
    background: #db2777 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid [class*="quote-header-quote-meta-ic-wrap--"] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    border-radius: 0 0 5px 5px !important;
    overflow: hidden !important;
    padding: 2px 10px 7px 10px !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-row {
    padding: 5px 0 !important;
    margin: 0 !important;
    line-height: 1.28 !important;
}
html[data-preview-pdf="1"]
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row
    + .quote-header-quote-panel-row
    .quote-header-quote-panel-value {
    border-top: 1px solid #e2e8f0 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-label {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    flex: 0 0 ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    min-width: 0 !important;
    white-space: nowrap !important;
    color: #334155 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-mid .quote-header-quote-panel-value {
    color: #0f172a !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"]
    .quote-header-quote-panel:not(.quote-header-quote-panel--no-header)
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row:first-child
    .quote-header-quote-panel-label,
html[data-preview-pdf="1"]
    .quote-header-quote-panel:not(.quote-header-quote-panel--no-header)
    .quote-header-quote-panel-mid
    .quote-header-quote-panel-row:first-child
    .quote-header-quote-panel-value {
    font-weight: 700 !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-start !important;
    padding: 5px 0 !important;
    min-width: 0 !important;
    line-height: 1.38 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-label {
    flex: 0 0 ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    max-width: ${EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH} !important;
    color: #000 !important;
    font-weight: 400 !important;
    padding-right: 10px !important;
    box-sizing: border-box !important;
    white-space: nowrap !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel-value {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    color: #000 !important;
    font-weight: 400 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-section-rule {
    border: 0 !important;
    border-top: 1px solid #94a3b8 !important;
    margin: 0 0 16px 0 !important;
    height: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-section-rule--after-header {
    margin-top: 10px !important;
    margin-bottom: 16px !important;
}
html[data-preview-pdf="1"] .quote-section-rule--before-cover-letter {
    margin-top: 0 !important;
    margin-bottom: 20px !important;
}
html[data-preview-pdf="1"] .quote-cover-letter {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page .quote-cover-letter.quote-cover-body-panel {
    padding-top: calc(12px * 1.69) !important;
    padding-right: calc(14px * 1.69) !important;
    padding-left: var(--quote-cover-text-inset) !important;
    /** Synced in preview (inline + --quote-cover-letter-pad-bottom); do not force 12px or PDF gap ≠ preview. */
    padding-bottom: var(--quote-cover-letter-pad-bottom, 12px) !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page {
    margin-top: 6px !important;
    margin-bottom: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 18px !important;
    --quote-cover-text-inset: 8px !important;
}
html[data-preview-pdf="1"] .quote-cover-first-page .quote-cover-body-panel {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-cover-body-panel {
    margin-top: 18px !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-cover-body-panel.quote-preview-panel-shell {
    overflow: visible !important;
    height: auto !important;
}
html[data-preview-pdf="1"] .quote-cover-body-panel {
    --quote-cover-text-inset: 8px !important;
    border-radius: 5px !important;
    border: 1px solid #e2e8f0 !important;
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    box-sizing: border-box !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
    text-align: left !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-cover-body-panel:not(.quote-cover-letter):not(.quote-clause-heading-panel) {
    margin-top: 18px !important;
    padding: calc(12px * 1.69) calc(14px * 1.69) calc(12px * 1.69) var(--quote-cover-text-inset) !important;
}
html[data-preview-pdf="1"] .quote-clause-block--continuation {
    margin-bottom: 12px !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel.quote-preview-panel-shell {
    margin-top: ${EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP} !important;
    margin-bottom: ${EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM} !important;
    padding-top: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_Y} !important;
    padding-bottom: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_Y} !important;
    padding-left: var(--quote-cover-text-inset) !important;
    padding-right: ${EMS_QUOTE_CLAUSE_HEADING_PADDING_X} !important;
    border-radius: ${EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS} !important;
    border: none !important;
    background: ${EMS_QUOTE_CLAUSE_HEADING_BG} !important;
    box-shadow: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"]
    .content-section
    > .quote-clause-block--continuation:first-child
    .quote-clause-heading-panel {
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel > h3:not([data-ems-heading-custom]) {
    margin: 0 !important;
    padding: 0 !important;
    font-size: ${EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE} !important;
    font-weight: ${EMS_QUOTE_CLAUSE_HEADING_FONT_WEIGHT} !important;
    line-height: ${EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT} !important;
    color: ${EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR} !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel > h3[data-ems-heading-custom] {
    margin: 0 !important;
    padding: 0 !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel.quote-preview-panel-shell::after {
    content: '' !important;
    display: block !important;
    width: 100% !important;
    margin-top: ${EMS_QUOTE_CLAUSE_HEADING_RULE_MARGIN_TOP} !important;
    border-top: 1px solid ${EMS_QUOTE_CLAUSE_HEADING_RULE_COLOR} !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-clause-block--continuation .clause-content {
    font-size: 13px !important;
    color: #0f172a !important;
    padding-left: var(--quote-cover-text-inset, 8px) !important;
    padding-right: calc(14px * 1.69) !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-sheet-main-flex {
    width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .clause-content table {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    font-size: 14px !important;
    margin-bottom: 0 !important;
    box-sizing: border-box !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 5px !important;
    overflow: hidden !important;
    box-shadow:
        0 2px 10px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06) !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td {
    border: none !important;
    padding: 7px 10px 7px 0 !important;
    vertical-align: top !important;
    line-height: 1.45 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:first-child {
    width: 22% !important;
    max-width: 150px !important;
    padding-right: 4px !important;
    color: #64748b !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table td:last-child {
    color: #0f172a !important;
    font-weight: 400 !important;
    padding-left: 4px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:first-child td:first-child {
    border-radius: 5px 0 0 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:first-child td:last-child {
    border-radius: 0 5px 0 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td {
    border-left: none !important;
    border-right: none !important;
    border-bottom: none !important;
    border-top: none !important;
    border-radius: 0 !important;
    padding: 7px 6px 7px 8px !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid + tr.quote-cover-meta-row-mid td:first-child {
    border-top: none !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid + tr.quote-cover-meta-row-mid td:last-child {
    border-top: 1px solid #e2e8f0 !important;
    border-bottom: none !important;
    border-left: none !important;
    border-right: none !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td:first-child {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    color: #334155 !important;
    font-weight: 400 !important;
    padding: 7px 4px 7px 8px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-row-mid td:last-child {
    background: ${EMS_QUOTE_COVER_META_MID_BG} !important;
    color: #0f172a !important;
    font-weight: 400 !important;
    padding: 7px 8px 7px 4px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:last-child td:first-child {
    border-radius: 0 0 0 5px !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table tbody tr.quote-cover-meta-row-mid:last-child td:last-child {
    border-radius: 0 0 5px 0 !important;
}
html[data-preview-pdf="1"] .quote-sheet-main-flex > .content-section {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    height: 100% !important;
}
/** Spacer absorbs letter→signatory gap inside the fixed 297mm cover shell. */
html[data-preview-pdf="1"] .quote-cover-page1-spacer {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] .quote-cover-page1-spacer[data-ems-cover-spacer-frozen="1"] {
    flex: 0 0 auto !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex > .content-section {
    flex: 1 1 0 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-cover-body-panel:not(.quote-cover-letter):not(.quote-clause-heading-panel) {
    padding-bottom: ${EMS_QUOTE_COVER_SIGN_OFF_BODY_PAD_BOTTOM_PREVIEW} !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off {
    flex-shrink: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: ${EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT_PREVIEW} !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: visible !important;
    margin-bottom: 0 !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-block {
    flex: 0 0 auto !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
    gap: 16px !important;
    min-height: calc(13px * 1.58 + 1.58em * 3.15 + 13px * 1.58 + 4px + 12px * 1.45) !important;
    margin-top: 0 !important;
    margin-bottom: ${EMS_QUOTE_COVER_SIGNATORY_BLOCK_BOTTOM_OFFSET} !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-col {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-col--co {
    flex: 0 1 auto !important;
    max-width: 48% !important;
    text-align: right !important;
    align-items: flex-end !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-col--co .quote-cover-sign-off-for {
    text-align: right !important;
    width: 100% !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off.quote-preview-panel-shell {
    overflow: visible !important;
}
html[data-preview-pdf="1"] .quote-cover-sign-off-for {
    flex-shrink: 0 !important;
    margin: 0 0 calc(1.58em * ${EMS_QUOTE_COVER_SIGN_OFF_FOR_GAP_EM} * ${EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE}) 0 !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
    color: #0f172a !important;
    font-weight: 600 !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-line {
    margin-top: 0 !important;
    min-height: calc(13px * 1.58) !important;
    font-size: 13px !important;
    line-height: 1.58 !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-designation {
    margin-top: 4px !important;
    min-height: calc(12px * 1.45) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    color: #475569 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p {
    margin: 0 0 10px 0 !important;
    font-size: 14px !important;
    line-height: 1.45 !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p:last-of-type {
    margin-bottom: 0 !important;
    font-weight: 400 !important;
}
html[data-preview-pdf="1"] .content-section {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    text-align: left !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] .quote-clause-block {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    text-align: left !important;
}
html[data-preview-pdf="1"] .quote-clause-block .clause-content {
    /* Block flow default; table cell alignment comes from editor HTML. */
    text-align: left;
}
html[data-preview-pdf="1"] .clause-content table:not([data-ems-paste-source="office"]):not([data-ems-col-widths]) {
    table-layout: fixed !important;
    border-collapse: collapse !important;
}
html[data-preview-pdf="1"] .clause-content > table + table,
html[data-preview-pdf="1"] .clause-content table[data-ems-table-split] + table[data-ems-table-split] {
    margin-top: 0 !important;
    border-top: none !important;
}
html[data-preview-pdf="1"] .clause-content table[data-ems-table-split] + table[data-ems-table-split] thead {
    display: none !important;
}
html[data-preview-pdf="1"] .clause-content table td[data-ems-valign="top"],
html[data-preview-pdf="1"] .clause-content table th[data-ems-valign="top"] {
    vertical-align: top !important;
}
html[data-preview-pdf="1"] .clause-content table td[data-ems-valign="middle"],
html[data-preview-pdf="1"] .clause-content table th[data-ems-valign="middle"] {
    vertical-align: middle !important;
}
html[data-preview-pdf="1"] .clause-content table td[data-ems-valign="bottom"],
html[data-preview-pdf="1"] .clause-content table th[data-ems-valign="bottom"] {
    vertical-align: bottom !important;
}
html[data-preview-pdf="1"] .clause-content table th:not([data-ems-valign]),
html[data-preview-pdf="1"] .clause-content table td:not([data-ems-valign]) {
    vertical-align: top !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
}
html[data-preview-pdf="1"] .clause-content table[data-ems-paste-source="office"] th:not([data-ems-valign]),
html[data-preview-pdf="1"] .clause-content table[data-ems-paste-source="office"] td:not([data-ems-valign]),
html[data-preview-pdf="1"] .clause-content table[data-ems-col-widths] th:not([data-ems-valign]),
html[data-preview-pdf="1"] .clause-content table[data-ems-col-widths] td:not([data-ems-valign]) {
    vertical-align: middle !important;
}
html[data-preview-pdf="1"] img {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-sheet-logo-row img,
html[data-preview-pdf="1"] .quote-continuation-header img {
    max-height: 68px !important;
    height: auto !important;
    width: auto !important;
    max-width: 212px !important;
    display: block !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    object-fit: contain !important;
    object-position: right top !important;
    flex: 0 0 auto !important;
}
html[data-preview-pdf="1"] .clause-content table,
html[data-preview-pdf="1"] .clause-content table th,
html[data-preview-pdf="1"] .clause-content table td {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet > .footer-section {
    grid-row: 3 !important;
    align-self: end !important;
    flex-shrink: 0 !important;
    margin-top: 0 !important;
    padding-top: 3px !important;
    min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
}
html[data-preview-pdf="1"] .quote-print-page-indicator {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-print-footer-wrap {
    display: block !important;
    width: 50% !important;
    max-width: 50% !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .quote-print-footer-company {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    text-align: right !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section .quote-print-page-indicator {
    padding-bottom: 3px !important;
}
html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule {
    border: none !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
    box-sizing: border-box !important;
}
html[data-preview-pdf="1"] .footer-section .quote-print-footer-company > div {
    margin: 0 !important;
    line-height: 1.1 !important;
}
/**
 * Print dialog (popup from Print button) loads hoisted @media rules from QuoteForm that used to force
 * #quote-preview { width: 100% } and fixed sheet heights — blank or narrow pages. These rules win via
 * higher specificity + @media print so output matches on-screen preview.
 */
@media print {
    html[data-preview-pdf="1"],
    html[data-preview-pdf="1"] body {
        width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    html[data-preview-pdf="1"] #quote-print-root.print-wrapper {
        width: 210mm !important;
        min-width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
    }
    html[data-preview-pdf="1"] #quote-preview {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        width: 210mm !important;
        min-width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #fff !important;
    }
    html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet {
        flex-shrink: 0 !important;
    }
    html[data-preview-pdf="1"] .quote-sheet-logo-row {
        grid-row: 1 !important;
        display: flex !important;
        flex-direction: row !important;
        justify-content: flex-end !important;
        align-items: flex-start !important;
        width: 100% !important;
        margin-bottom: ${EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM} !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-sheet-logo-row img,
    html[data-preview-pdf="1"] .quote-continuation-header img {
        max-height: 68px !important;
        height: auto !important;
        width: auto !important;
        max-width: 212px !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        object-fit: contain !important;
        object-position: right top !important;
    }
    html[data-preview-pdf="1"] .quote-a4-sheet > .footer-section {
        grid-row: 3 !important;
        align-self: end !important;
        flex-shrink: 0 !important;
        margin-top: 0 !important;
        padding-top: 3px !important;
        min-height: ${EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT} !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    html[data-preview-pdf="1"] .quote-print-page-indicator {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-print-footer-wrap {
        display: block !important;
        width: 50% !important;
        max-width: 50% !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .quote-print-footer-company {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: right !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section .quote-print-page-indicator {
        padding-bottom: 3px !important;
    }
    html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule {
        border: 0 !important;
        border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
        height: 0 !important;
        box-sizing: border-box !important;
    }
    html[data-preview-pdf="1"] .footer-section .quote-print-footer-company > div {
        margin: 0 !important;
        line-height: 1.1 !important;
    }
    html[data-preview-pdf="1"] .no-print,
    html[data-preview-pdf="1"] .ems-browser-pdf-hint {
        display: none !important;
    }
}
`;

const SERVER_PDF_STYLES = `
html[data-server-pdf="1"] #quote-print-root { background: #fff; padding: 0; }
html[data-server-pdf="1"] .no-print { display: none !important; }
`;

/** Last in style block — clarity only (font stays Segoe UI from hoisted preview CSS). */
const PDF_FINAL_OVERRIDES = `
html[data-preview-pdf="1"] .quote-preview-zoom-viewport,
html[data-preview-pdf="1"] .quote-preview-zoom-shell {
    display: block !important;
    flex: none !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    transform: none !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview {
    background: #fff !important;
    padding: 0 !important;
    gap: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    width: 210mm !important;
    max-width: 210mm !important;
    margin: 0 auto !important;
    font-family: ${QUOTE_PREVIEW_FONT_STACK} !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] #quote-preview *:not(.quote-digital-signature-stamp):not(.quote-signature-stamp-caption):not(.quote-signature-stamp-body) {
    transform: none !important;
    filter: none !important;
    backdrop-filter: none !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet {
    position: relative !important;
}
html[data-preview-pdf="1"] .quote-digital-signature-stamp {
    position: absolute !important;
}
html[data-preview-pdf="1"] .quote-cover-signatory-col[data-ems-sig-host="1"] {
    position: relative !important;
}
html[data-preview-pdf="1"] .quote-digital-signature-stamp[data-ems-sig-in-col="1"],
html[data-preview-pdf="1"] .quote-digital-signature-stamp--in-signatory-col {
    position: absolute !important;
    z-index: 5 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet,
html[data-preview-pdf="1"] #quote-preview .quote-document-root {
    font-family: inherit !important;
}
html[data-preview-pdf="1"] .quote-a4-sheet,
html[data-preview-pdf="1"] .quote-preview-panel-shell,
html[data-preview-pdf="1"] .quote-cover-body-panel,
html[data-preview-pdf="1"] .quote-clause-heading-panel,
html[data-preview-pdf="1"] .quote-cover-meta-table {
    box-shadow: none !important;
}
html[data-preview-pdf="1"] .clause-content,
html[data-preview-pdf="1"] .clause-content p,
html[data-preview-pdf="1"] .clause-content li,
html[data-preview-pdf="1"] .clause-content td,
html[data-preview-pdf="1"] .clause-content th {
    font-family: inherit !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
${QUOTE_UNIFIED_SHEET_EXPORT_CSS}
${PDF_PAGE_BREAK_OVERRIDES}
html[data-preview-pdf="1"] .quote-clause-heading-panel > h3:not([data-ems-heading-custom]) {
    font-family: inherit !important;
    font-size: ${EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE} !important;
    line-height: ${EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT} !important;
    font-weight: ${EMS_QUOTE_CLAUSE_HEADING_FONT_WEIGHT} !important;
    color: ${EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR} !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] .quote-clause-heading-panel > h3[data-ems-heading-custom] {
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    text-rendering: auto !important;
}
html[data-preview-pdf="1"] .quote-cover-meta-table {
    font-size: 14px !important;
}
html[data-preview-pdf="1"] .quote-cover-letter p {
    font-size: 14px !important;
}
html[data-preview-pdf="1"] .quote-header-quote-panel,
html[data-preview-pdf="1"] .quote-header-quote-panel-mid {
    font-size: 13px !important;
}
html[data-preview-pdf="1"] .footer-section > hr.quote-section-rule,
html[data-preview-pdf="1"] .footer-section > hr {
    border: none !important;
    border-top: ${EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF} solid #94a3b8 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
}
${EMS_QUOTE_PRICING_TABLE_COLUMN_SYNC_CSS}
${EMS_QUOTE_PRICING_TABLE_PRESENTATION_CSS}
${EMS_QUOTE_PRICING_TABLE_COMPACT_ROW_CSS}
html[data-preview-pdf="1"] #ems-auto-price-summary-table {
    border: ${EMS_QUOTE_PRICING_TABLE_OUTER_BORDER} !important;
    margin-top: ${EMS_QUOTE_PRICING_TABLE_MARGIN_TOP} !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
    width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
    max-width: ${EMS_QUOTE_PRICING_TABLE_WIDTH} !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table th,
html[data-preview-pdf="1"] #ems-auto-price-summary-table td {
    border: ${EMS_QUOTE_PDF_TABLE_BORDER_WIDTH} solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR} !important;
    color: #0f172a !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table thead th {
    background: ${EMS_QUOTE_PRICING_TABLE_HEADER_BG} !important;
    color: ${EMS_QUOTE_PRICING_TABLE_HEADER_COLOR} !important;
    font-weight: 600 !important;
    border: ${EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER} !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="total"] td,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="vat"] td,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="grand-vat"] td,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="grand"] td {
    background: ${EMS_QUOTE_PRICING_TABLE_TOTAL_BG} !important;
    font-weight: 700 !important;
    border-top: 1px solid #94a3b8 !important;
}
html[data-preview-pdf="1"] #ems-auto-price-summary-table th:nth-child(2),
html[data-preview-pdf="1"] #ems-auto-price-summary-table td:nth-child(2),
html[data-preview-pdf="1"] #ems-auto-price-summary-table td[data-ems-amount],
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="total"] td:first-child,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="vat"] td:first-child,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="grand-vat"] td:first-child,
html[data-preview-pdf="1"] #ems-auto-price-summary-table tr[data-ems-row="grand"] td:first-child {
    text-align: right !important;
}
/** Highest-specificity sheet pin — grid matches on-screen preview. */
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet {
    box-sizing: border-box !important;
    width: 210mm !important;
    min-width: 210mm !important;
    max-width: 210mm !important;
    padding: 15mm !important;
    margin: 0 auto !important;
    min-height: 297mm !important;
    height: 297mm !important;
    max-height: 297mm !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    align-content: stretch !important;
    overflow: hidden !important;
    page-break-after: auto !important;
    break-after: auto !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet > .quote-sheet-logo-row {
    grid-row: 1 !important;
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet > .quote-sheet-main-flex {
    grid-row: 2 !important;
    min-height: 0 !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet > .footer-section {
    grid-row: 3 !important;
    align-self: end !important;
    margin-top: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-sheet-main-flex > .content-section {
    flex: 1 1 0 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
    overflow: hidden !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-cover-page1-spacer {
    flex: 1 1 0 !important;
    min-height: 0 !important;
}
html[data-preview-pdf="1"] #quote-preview .quote-a4-sheet:not(.quote-a4-sheet--continuation) .quote-cover-sign-off {
    flex: 0 0 auto !important;
}
`;

export function buildQuotePrintDocumentHtml(printWithHeader, fragmentHtml, tableStyles, serverOrigin = '', pdfMode = false, options = {}) {
    const usePreviewMatchedPdf = pdfMode === 'preview';
    const pdfAssetOriginRewriteFrom = options?.pdfAssetOriginRewriteFrom || '';
    const baseTag = serverOrigin ? `<base href="${String(serverOrigin).replace(/\/?$/, '/')}">` : '';

    let fragmentForBody = fragmentHtml;
    if (usePreviewMatchedPdf && serverOrigin) {
        fragmentForBody = normalizePdfStaticAssets(fragmentForBody, serverOrigin, pdfAssetOriginRewriteFrom);
    }

    let previewHoistedSheetCss = '';
    if (usePreviewMatchedPdf) {
        const { html: bodyWithoutStyles } = stripAllStyleTags(fragmentForBody);
        fragmentForBody = fixInvalidSelfClosingTags(bodyWithoutStyles.trim());
        fragmentForBody = pinQuoteA4SheetsInFragmentHtml(fragmentForBody);
    }

    const googleFontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

    const htmlDataAttrs = usePreviewMatchedPdf ? ' data-preview-pdf="1"' : '';
    const docFontStack = usePreviewMatchedPdf ? QUOTE_PREVIEW_FONT_STACK : QUOTE_APP_FONT_STACK;
    const rootTypography = usePreviewMatchedPdf
        ? '-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: auto;'
        : '-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;';

    const browserSavePdfHint = options?.browserSavePdfHint
        ? `<div class="no-print ems-browser-pdf-hint" style="position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 14px;background:#eff6ff;border-bottom:1px solid #3b82f6;font:14px 'Segoe UI',system-ui,sans-serif;color:#1e3a8a;text-align:center;box-sizing:border-box;">In the print dialog, choose <strong>Save as PDF</strong> or <strong>Microsoft Print to PDF</strong>, then click Save.</div>`
        : '';
    const docTitle = String(options?.documentTitle || 'EMS Quote').replace(/</g, '');

    return `<!DOCTYPE html><html lang="en"${htmlDataAttrs}><head><title>${docTitle}</title>${baseTag}${
        usePreviewMatchedPdf ? '' : googleFontLinks
    }<style>
        @page { size: A4 portrait; margin: 0; }
        html, body {
            margin: 0 !important; padding: 0 !important; background: white !important;
            font-family: ${docFontStack}; font-size: 14px; line-height: 1.6;
            ${rootTypography}
            display: block !important; font-size: 0 !important;
        }
        .print-wrapper {
            display: block !important;
            font-family: ${docFontStack} !important;
            font-size: 14px !important; line-height: 1.6 !important;
            width: 210mm !important; margin: 0 !important; padding: 0 !important;
        }
        ${previewHoistedSheetCss}
        ${PREVIEW_PDF_SCREEN_OVERRIDES}
        ${pdfMode === true ? SERVER_PDF_STYLES : ''}
        ${String(tableStyles || '').trim()}
        ${usePreviewMatchedPdf ? PDF_FINAL_OVERRIDES : ''}
        ${getServerPdfHeaderModeCss(printWithHeader)}
    </style></head><body>${browserSavePdfHint}<div id="quote-print-root" class="print-wrapper" data-print-with-header="${printWithHeader ? '1' : '0'}">${fragmentForBody}</div></body></html>`.trim().replace(/>\s*>/g, '>');
}

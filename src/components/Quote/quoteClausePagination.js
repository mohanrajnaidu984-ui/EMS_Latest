/**
 * Split clause HTML into measurable segments and pack them across A4 continuation sheets.
 * Units are the smallest safe pieces (heading, paragraph, clause-row fragment, table row).
 * Large tables are split one <tr> per segment for height packing; segments are rejoined on render.
 */

import {
    annotateOfficePasteSplitRowRowspanLeads,
    getOfficePasteTablePaginationGrid,
    officePasteTableRowHasMergedSpans,
    officePasteTableRowIsSpanContinuation,
    syncOfficePasteTableColumnLayout,
    syncOfficePasteTableColumnsInHtmlString,
} from './clauseEditorTable.js';

/** @typedef {{ clauseIdx: number, clause: object, html: string, showHeading: boolean, displayMajor: number, key: string }} ClauseSegment */

const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

/** True when table is a BOQ / schedule (SL.NO, Qty, Unit, or more than 2 columns). */
function tableLooksLikeBoqSchedule(table) {
    if (!table) return false;
    const id = String(table.id || table.getAttribute?.('id') || '').trim();
    /* Pricing summary with user-inserted columns is still the EMS price table. */
    if (
        id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        id.startsWith(`${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--`)
    ) {
        return false;
    }
    const rows = [...(table.rows || table.querySelectorAll?.('tr') || [])];
    const maxCells = Math.max(0, ...rows.map((r) => r.cells?.length || 0));
    const headerText = String(
        table.querySelector?.('thead')?.textContent || rows[0]?.textContent || ''
    )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (/\bsl\.?\s*no\b/.test(headerText)) return maxCells >= 2;
    if (/\bqty\b|\bquantity\b/.test(headerText) && /\bunit\b/.test(headerText)) {
        return maxCells >= 3;
    }
    return false;
}

/**
 * EMS auto Total/Discount/VAT table only.
 * Must NOT match BOQ tables that were wrongly given id ems-auto-price-summary-table--…
 */
function isEmsAutoPriceSummaryTableId(table) {
    if (!table) return false;
    if (tableLooksLikeBoqSchedule(table)) return false;
    const id = String(table.id || table.getAttribute?.('id') || '').trim();
    return (
        id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        id.startsWith(`${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--`)
    );
}

/** Footer labels that must not contribute to the stamped pricing base total. */
const PRICING_SPLIT_FOOTER_LABEL_RE =
    /^(Total(\s*\([^)]*\))?|Discount\b|Final\s+Discounted\b|VAT\b|Grand\s+Total\b)/i;

/**
 * Sum line amounts across all body rows before the pricing footer — used when
 * splitting the summary table so each page fragment carries the full base.
 * @param {HTMLTableRowElement[]} rows
 * @returns {number | null}
 */
function sumPricingLineAmountsForSplitStamp(rows) {
    if (!rows?.length) return null;
    let sum = 0;
    let found = false;
    for (const row of rows) {
        const cells = row?.cells || [];
        if (cells.length < 2) continue;
        const label = String(cells[0].textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        const rowKind = String(row.getAttribute?.('data-ems-row') || '')
            .trim()
            .toLowerCase();
        if (
            PRICING_SPLIT_FOOTER_LABEL_RE.test(label) ||
            /^(total|discount|final-discounted|vat|grand-vat)$/.test(rowKind)
        ) {
            break;
        }
        const amtText = String(cells[cells.length - 1].textContent || '')
            .replace(/,/g, '')
            .replace(/[^\d.\-]/g, ' ')
            .trim();
        const m = amtText.match(/-?\d+(?:\.\d+)?/);
        if (!m) continue;
        const n = parseFloat(m[0]);
        if (!Number.isFinite(n)) continue;
        sum += n;
        found = true;
    }
    if (!found) return null;
    return Math.round(sum * 1000) / 1000;
}

function pricingSummaryColgroupHtml(table) {
    const existing = table?.querySelector?.('colgroup');
    const colN = existing?.querySelectorAll?.('col')?.length || 0;
    /* Keep 2-col OR 3-col (Sl.No|Desc|Amount). Never collapse 3→2 — that right-aligned Description. */
    if (existing && (colN === 2 || colN === 3)) {
        return existing.outerHTML;
    }
    const row = table?.querySelector?.('thead tr, tr');
    const logicalCols = [...(row?.cells || [])].reduce(
        (n, c) => n + Math.max(1, Number(c.colSpan) || 1),
        0
    );
    if (logicalCols >= 3 || (row?.cells?.length || 0) >= 3) {
        return '<colgroup><col style="width:10%" /><col style="width:62%" /><col style="width:28%" /></colgroup>';
    }
    return '<colgroup><col style="width:72%" /><col style="width:28%" /></colgroup>';
}

/** Extra px reserved so packed content never overlaps continuation logo/footer (PDF uses 13px/1.45 vs editor 12px). */
/** Reserve logo/footer band on continuation sheets (PDF font metrics vs measure). */
/** Reserve logo/footer + Chromium/Edge print metrics vs client measure host (~5% on Server PDF). */
/**
 * Reserve above the content-end line inside the existing A4 content box (footer/A4 unchanged).
 * Text must finish 12px before that line so a wrapped row is not cropped.
 */
/** Bottom reserve inside the 220mm / ~831px content box (not extra gap between units). */
export {
    PACK_HEIGHT_SAFETY_PX,
    QUOTE_A4_SHEET_PADDING_MM,
    QUOTE_A4_LOGO_BAND_MM,
    QUOTE_A4_FOOTER_BAND_MM,
    quoteA4InnerContentMm,
    quoteContinuationContentMm,
    quoteContinuationContentPx,
    EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
    EMS_QUOTE_CONT_USABLE_PX_LANDSCAPE_FALLBACK,
    QUOTE_PAGE_GEOMETRY,
} from './quotePageGeometry.js';
import {
    PACK_HEIGHT_SAFETY_PX,
    quoteContinuationContentPx,
    EMS_QUOTE_CONT_USABLE_PX_FALLBACK,
} from './quotePageGeometry.js';
/** Tighter safety when user clicks Align Page (fills the fixed 220mm content box). */
const PACK_HEIGHT_SAFETY_PX_TIGHT = 10;
/** Measure vs print slack allowed when pulling the next segment up during Align Page. */
const PACK_ALIGN_FILL_SLACK_PX = 8;
/**
 * Sum-of-parts slack when checking fit. List items measured as separate blocks each carry
 * UL/clause margins that collapse when rejoined — without slack, pages stay half-empty.
 * Kept small so fill cannot pack a block that then paints through the footer.
 */
const PACK_SUM_HEIGHT_FILL_SLACK_PX = 8;
/** Zero slack for fit — any positive slack overpacked sheets and hid units under overflow:hidden. */
const PACK_MERGED_HEIGHT_FIT_SLACK_PX = 0;
/** Per-item by default so subheadings are not stranded above an unsplit list block. */
const PACK_LIST_SPLIT_MIN_ITEMS = 1;

function resolveListSplitMinItems(options = {}) {
    if (options.splitListsPerItem) return 1;
    if (Number.isFinite(options.splitListMinItems)) {
        return Math.max(1, options.splitListMinItems);
    }
    return PACK_LIST_SPLIT_MIN_ITEMS;
}

function shouldRefinePackSegments(options = {}) {
    return Boolean(
        options.splitListsPerItem ||
        options.splitParagraphs ||
        Number.isFinite(options.splitListMinItems)
    );
}

/** Opening tag of a list element with all original attributes (class, style, start, …). */
function getListOpenTag(listEl) {
    const tag = listEl.tagName.toLowerCase();
    const shell = listEl.cloneNode(false);
    const wrap = listEl.ownerDocument.createElement('div');
    wrap.appendChild(shell);
    const m = wrap.innerHTML.match(new RegExp(`^<${tag}[^>]*>`, 'i'));
    return m ? m[0] : `<${tag}>`;
}

/** 1-based start index from an &lt;ol&gt; (respects existing start attribute). */
function getListBaseStartIndex(listEl) {
    if (!listEl || listEl.tagName !== 'OL') return 1;
    const startAttr = parseInt(listEl.getAttribute('start') || '1', 10);
    return Number.isFinite(startAttr) && startAttr > 0 ? startAttr : 1;
}

/** CSS counter used by EMS numbered list presets (clauseEditorListPresets.js). */
function resolveEmsListCounterName(listEl) {
    if (!listEl?.classList) return null;
    if (listEl.classList.contains('ems-num-decimal')) return 'ems-decimal';
    if ([...listEl.classList].some((c) => c.startsWith('ems-num-'))) return 'emsol';
    return null;
}

/** Preserve serial numbering when a paginated segment contains a single &lt;li&gt;. */
function buildListOpenTagWithContinuation(listEl, itemNumber) {
    const tag = listEl.tagName.toLowerCase();
    if (tag !== 'ol' || itemNumber <= 1) return getListOpenTag(listEl);

    const shell = listEl.cloneNode(false);
    shell.setAttribute('start', String(itemNumber));

    const counterName = resolveEmsListCounterName(shell);
    if (counterName) {
        const existingStyle = String(shell.getAttribute('style') || '').trim();
        const counterReset = `counter-reset: ${counterName} ${itemNumber - 1}`;
        shell.setAttribute(
            'style',
            existingStyle ? `${existingStyle.replace(/;\s*$/, '')}; ${counterReset}` : counterReset
        );
    }

    const wrap = listEl.ownerDocument.createElement('div');
    wrap.appendChild(shell);
    const m = wrap.innerHTML.match(new RegExp(`^<${tag}[^>]*>`, 'i'));
    return m ? m[0] : `<${tag}>`;
}

/** One packable segment: full list shell + single &lt;li&gt; (preserves bullet/number styling). */
function wrapSingleListItem(listEl, li, itemNumber = 1) {
    const tag = listEl.tagName.toLowerCase();
    const openTag =
        tag === 'ol' && itemNumber > 1
            ? buildListOpenTagWithContinuation(listEl, itemNumber)
            : getListOpenTag(listEl);
    return `${openTag}${li.outerHTML}</${tag}>`;
}

/**
 * @typedef {{ tightFit?: boolean, fastAlign?: boolean }} ClausePackOptions
 */

function resolvePackSafetyPx(options) {
    return options?.tightFit ? PACK_HEIGHT_SAFETY_PX_TIGHT : PACK_HEIGHT_SAFETY_PX;
}

function resolvePackFillLimitPx(usablePx, options) {
    const safety = resolvePackSafetyPx(options);
    const base = Math.max(usablePx - safety, 200);
    if (!options?.tightFit) return base;
    return base + PACK_ALIGN_FILL_SLACK_PX;
}

/** Pull-up fill pass — merged DOM height is checked; keep a clear band above the footer. */
function resolvePackSlackFillLimitPx(usablePx, options) {
    if (options?.tightFit) return resolvePackFillLimitPx(usablePx, options);
    const antiClipTailPx = PACK_HEIGHT_SAFETY_PX;
    return Math.max(usablePx - antiClipTailPx, 200);
}

function sumSegmentHeightsPx(group, segmentHeightsPx) {
    if (!segmentHeightsPx?.length || !group?.length) return 0;
    return group.reduce((s, gi) => s + Math.max(segmentHeightsPx[gi] || 0, 1), 0);
}

function resolvePackFillSlackPx(options) {
    return options?.tightFit ? 12 : PACK_SUM_HEIGHT_FILL_SLACK_PX;
}

/* Geometry constants + helpers: re-exported from quotePageGeometry.js (above). */

function resolvePackLimitForContinuationPage(continuationPageIdx, fallbackUsablePx, options = {}) {
    if (typeof options?.usablePxForContinuationPage === 'function') {
        const raw = options.usablePxForContinuationPage(continuationPageIdx);
        return resolvePackFillLimitPx(raw, options);
    }
    return resolvePackFillLimitPx(fallbackUsablePx, options);
}

function resolvePackSlackLimitForContinuationPage(continuationPageIdx, fallbackUsablePx, options = {}) {
    if (typeof options?.usablePxForContinuationPage === 'function') {
        const raw = options.usablePxForContinuationPage(continuationPageIdx);
        return resolvePackSlackFillLimitPx(raw, options);
    }
    return resolvePackSlackFillLimitPx(fallbackUsablePx, options);
}

/** True when any segment in the group is a row-split table fragment (BOQ continuation). */
function groupHasSplitTableSegment(group, segments) {
    if (!group?.length || !segments?.length) return false;
    return group.some((idx) =>
        /data-ems-table-split\s*=\s*["']?1/i.test(String(segments[idx]?.html || ''))
    );
}

/** Authoritative fit check — rejoined/merged paint height is the source of truth. */
function groupFitsPackLimit(
    group,
    measureMergedGroupPx,
    limit,
    segmentHeightsPx,
    options = {},
    continuationPageIdx = null
) {
    if (!group?.length) return false;
    const pageIdx =
        continuationPageIdx != null ? continuationPageIdx : options._continuationPageIdx ?? null;
    if (pageIdx != null) {
        limit = resolvePackLimitForContinuationPage(pageIdx, limit, options);
    }
    const mergeSlack = options?.tightFit
        ? PACK_MERGED_HEIGHT_FIT_SLACK_PX + 8
        : PACK_MERGED_HEIGHT_FIT_SLACK_PX;
    const segments = options?.segments || null;
    const isSplitTableGroup = groupHasSplitTableSegment(group, segments);
    /*
     * Always pass pageIdx when known — default-arg measure fns report .length === 1.
     * Merged height is authoritative. Sum/estimate overrides previously packed pages
     * that clipped (estimate too low) or stayed half-empty (sum too high / peel).
     */
    const merged =
        typeof measureMergedGroupPx === 'function'
            ? pageIdx != null
                ? measureMergedGroupPx(group, pageIdx)
                : measureMergedGroupPx(group)
            : 0;
    if (merged > 0) {
        if (merged > limit + mergeSlack) return false;
        return true;
    }
    /* Prefer merged-only packing: if measure returned 0, do not trust estimates (overpack risk). */
    if (options?.preferMergedOnly && typeof measureMergedGroupPx === 'function') {
        return false;
    }
    /* Measure host not ready — fall back to thead-once / compact sum. */
    const sumSlack = resolvePackFillSlackPx(options);
    const splitEst = isSplitTableGroup
        ? estimateSplitTableGroupHeightPx(group, segmentHeightsPx, segments)
        : 0;
    if (isSplitTableGroup) {
        if (splitEst > 0) return splitEst <= limit + sumSlack;
        if (segmentHeightsPx?.length) {
            const sumH = sumSegmentHeightsPx(group, segmentHeightsPx);
            return sumH > 0 && sumH <= Math.max(160, limit - 24);
        }
        return false;
    }
    if (segmentHeightsPx?.length) {
        const sumH = sumSegmentHeightsPx(group, segmentHeightsPx);
        if (sumH > 0 && sumH <= limit + sumSlack) return true;
    }
    if (!options?.fastAlign) {
        if (typeof options.overflowTestForPage === 'function' && pageIdx != null) {
            return !options.overflowTestForPage(pageIdx, group);
        }
        if (typeof options.overflowTest === 'function' && pageIdx == null) {
            return !options.overflowTest(group);
        }
    }
    if (!segmentHeightsPx?.length) return false;
    return sumSegmentHeightsPx(group, segmentHeightsPx) <= limit + sumSlack;
}

/** Same limit for initial pack and fill when overflowTest is used; else fill may use tighter tail. */
function resolvePackFillLimitPxForFillPass(usablePx, options) {
    if (
        typeof options?.overflowTest === 'function' ||
        typeof options?.overflowTestForPage === 'function'
    ) {
        return resolvePackFillLimitPx(usablePx, options);
    }
    return resolvePackSlackFillLimitPx(usablePx, options);
}

/** User-inserted blank line (<p><br></p> etc.) — preserve intentional vertical space on Align Page. */
function isManualBlankSpacerElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName;
    if (tag === 'P') {
        const inner = String(el.innerHTML || '')
            .replace(/\s+/g, '')
            .toLowerCase();
        return (
            inner === '<br>' ||
            inner === '<br/>' ||
            inner === '<br/>' ||
            inner === '&nbsp;' ||
            inner === '' ||
            inner === '<br><br>'
        );
    }
    if (tag === 'DIV' && !String(el.textContent || '').trim()) {
        const inner = String(el.innerHTML || '')
            .replace(/\s+/g, '')
            .toLowerCase();
        return inner === '<br>' || inner === '<br/>' || inner === '';
    }
    return false;
}

/** Segment that is only one empty block (often editor noise after lists — not a user gap). */
function segmentIsSingleIncidentalBlankSpacer(html) {
    const raw = String(html || '').trim();
    if (!raw || typeof DOMParser === 'undefined') return false;
    const doc = new DOMParser().parseFromString(`<div id="ems-inc-blank">${raw}</div>`, 'text/html');
    const root = doc.getElementById('ems-inc-blank');
    if (!root) return false;
    const elements = [...root.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
    return elements.length === 1 && isManualBlankSpacerElement(elements[0]);
}

function countTrailingSingleBlankSegments(group, segments) {
    let count = 0;
    for (let i = group.length - 1; i >= 0; i -= 1) {
        const seg = segments[group[i]];
        if (seg && segmentIsSingleIncidentalBlankSpacer(seg.html)) count += 1;
        else break;
    }
    return count;
}

/** True when HTML ends with one or more manual blank spacer blocks (do not pull next page content up). */
export function segmentHtmlHasTrailingManualBlankSpacers(html) {
    const raw = String(html || '').trim();
    if (!raw || typeof DOMParser === 'undefined') return false;
    const doc = new DOMParser().parseFromString(`<div id="ems-trail-blank-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('ems-trail-blank-root');
    if (!root) return false;
    const elements = [...root.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
    if (!elements.length) return false;
    for (let i = elements.length - 1; i >= 0; i -= 1) {
        if (isManualBlankSpacerElement(elements[i])) continue;
        return false;
    }
    return true;
}

function groupEndsWithManualBlankSpacers(group, segments) {
    if (!group?.length || !segments?.length) return false;
    /* Two or more trailing blank-only segments = intentional vertical gap before the next block. */
    if (countTrailingSingleBlankSegments(group, segments) >= 2) return true;
    const lastIdx = group[group.length - 1];
    const seg = segments[lastIdx];
    if (!seg) return false;
    if (segmentIsSingleIncidentalBlankSpacer(seg.html)) return false;
    return segmentHtmlHasTrailingManualBlankSpacers(seg.html);
}

export function segmentHtmlContainsTable(html) {
    return /<table\b/i.test(String(html || ''));
}

/**
 * Keep each BOQ/pricing <tr> intact (same as edit mode).
 * Do NOT split description cells into extra rows — that repeated Qty/Unit/Amount and
 * looked broken in preview. Page packing moves whole rows to the next sheet instead.
 * @param {HTMLTableRowElement} row
 * @returns {HTMLTableRowElement[]}
 */
function expandTableRowForPagination(row, _rowIndex, _grid) {
    return row ? [row] : [];
}

/**
 * Preserve fixed column widths when splitting a table into row segments.
 * @param {HTMLTableElement} table
 * @returns {string}
 */
function getTableColgroupHtml(table) {
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
        const cols = colgroup.querySelectorAll('col');
        const colHtml = colgroup.innerHTML || '';
        /*
         * Never reuse a 2-col 72/28 summary colgroup on a wider BOQ table — that makes
         * SL.NO huge and Amount(BHD) stack vertically.
         */
        const row = table.querySelector('tr');
        const cellCount = row?.cells?.length || 0;
        if (cellCount > 2 && cols.length === 2 && /72%|28%/.test(colHtml)) {
            /* fall through to stored widths / empty */
        } else {
            return colgroup.outerHTML;
        }
    }

    const stored = String(table.getAttribute('data-ems-col-widths') || '').trim();
    if (!stored) return '';

    const widths = stored
        .split(',')
        .map((part) => Math.max(24, Math.round(parseFloat(part) || 0)))
        .filter((px) => px > 0);
    if (!widths.length) return '';

    const row = table.querySelector('tr');
    const cellCount = row?.cells?.length || 0;
    if (cellCount > 2 && widths.length === 2) return '';

    const cols = widths
        .map((px) => `<col style="width:${px}px" width="${px}">`)
        .join('');
    return `<colgroup>${cols}</colgroup>`;
}

/**
 * Slice full-table `data-ems-row-heights` to thead + one body row for a split fragment.
 * Copying the entire CSV onto every 1-row fragment made pack measure lock the wrong/tall rows.
 * @param {string} tableAttrs
 * @param {number[]} fragmentHeightPx
 */
function withSlicedRowHeightsAttr(tableAttrs, fragmentHeightPx) {
    const attrs = String(tableAttrs || '');
    if (!fragmentHeightPx?.length || !/data-ems-row-heights=/i.test(attrs)) return attrs;
    const csv = fragmentHeightPx.map((h) => (h > 0 ? String(Math.round(h)) : '0')).join(',');
    if (/data-ems-row-heights\s*=\s*"/i.test(attrs)) {
        return attrs.replace(/data-ems-row-heights\s*=\s*"[^"]*"/i, `data-ems-row-heights="${csv}"`);
    }
    if (/data-ems-row-heights\s*=\s*'/i.test(attrs)) {
        return attrs.replace(/data-ems-row-heights\s*=\s*'[^']*'/i, `data-ems-row-heights='${csv}'`);
    }
    return attrs;
}

/**
 * Split one HTML table into one segment per body row (never recurses — safe for fallback passes).
 * @param {HTMLTableElement} table
 * @returns {string[]}
 */
function splitTableToRowSegmentHtml(table) {
    const { rows: gridRows, grid } = getOfficePasteTablePaginationGrid(table);

    const tableAttrs = [...table.attributes]
        .map((a) => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
        .join(' ');

    let theadHtml = '';
    /** @type {HTMLTableRowElement | null} */
    let headerRowPromotedToThead = null;
    const thead = table.querySelector('thead');
    const ownRows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
    const thRows = ownRows.filter((tr) => tr.querySelector('th'));
    /*
     * Terms tables use <th> for every label (Delivery / Validity / Payment / Warranty).
     * Promoting the first row and then dropping every later <th> row deleted Payment
     * and left Warranty clipped under the footer.
     * Only a real <thead>, or a single header row, is repeated.
     */
    const promoteFirstDataRow =
        !thead && thRows.length === 1 && thRows[0] === ownRows[0];
    if (thead) {
        theadHtml = thead.outerHTML;
    } else if (promoteFirstDataRow) {
        theadHtml = `<thead>${ownRows[0].outerHTML}</thead>`;
        headerRowPromotedToThead = /** @type {HTMLTableRowElement} */ (ownRows[0]);
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')].filter(
        (tr) => tr.closest('table') === table && tr !== headerRowPromotedToThead
    );
    const allRows =
        bodyRows.length > 0
            ? bodyRows
            : ownRows.filter((tr) => tr !== headerRowPromotedToThead);

    if (!allRows.length) return [table.outerHTML];

    const isPriceSummary = isEmsAutoPriceSummaryTableId(table);
    /* Always split pricing summary by row so Discount/VAT/Grand can move to the next page. */
    if (!isPriceSummary && allRows.length < 2) {
        return [table.outerHTML];
    }

    const fullHeights = String(table.getAttribute('data-ems-row-heights') || '')
        .split(',')
        .map((s) => parseFloat(String(s).trim()) || 0);
    /*
     * Always row-split multi-row tables (BOQ / pricing / office paste). Keeping a
     * medium table atomic left large blank bands (e.g. rows 1–4 on page 2, row 5
     * stranded on page 3 despite free space above the footer).
     */

    const allTr = [...table.querySelectorAll('tr')];
    const theadTrCount = thead
        ? thead.querySelectorAll('tr').length
        : headerRowPromotedToThead
          ? 1
          : 0;

    /* BOQ: never rewrite row cells — only paginate intact rows. */
    const splitId = `ems-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let attrsForSplit = tableAttrs;
    if (!isPriceSummary && /id=["']ems-auto-price-summary-table/i.test(attrsForSplit)) {
        /* Strip wrongly assigned summary ids from BOQ so later passes do not treat it as EMS summary. */
        attrsForSplit = attrsForSplit
            .replace(/\s*id=["']ems-auto-price-summary-table(?:--[^"']*)?["']/gi, '')
            .replace(/\s*data-ems-pricing-cols=["']fixed["']/gi, '');
    }
    /*
     * Pricing summary: stamp full pre-VAT base onto every row fragment so normal-mode
     * VAT/Total reconcile cannot rebuild Total from only the rows on the current page.
     */
    if (isPriceSummary && !/data-ems-pricing-base-total=/i.test(attrsForSplit)) {
        const stampedBase = sumPricingLineAmountsForSplitStamp(allRows);
        if (stampedBase != null) {
            attrsForSplit = `${attrsForSplit} data-ems-pricing-base-total="${stampedBase}"`.trim();
        }
    }
    const colgroupHtml = isPriceSummary
        ? pricingSummaryColgroupHtml(table)
        : getTableColgroupHtml(table);

    const rowLooksLikeBoqNote = (row) => {
        const text = String(row?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        return /^notes?\s*:/i.test(text) || /^note\b/i.test(text);
    };

    /** Note: always emit a real "Note:" label ABOVE bullets (Excel often leaves only ":"). */
    const buildBoqNoteBlockOuterHtml = (row) => {
        const cells = [...(row.cells || [])];
        /** @type {string[]} */
        const bodyParts = [];
        const isLoneNoteLabel = (text) =>
            /^notes?\s*:?\s*$/i.test(text) ||
            /^:\s*$/.test(text) ||
            (/^notes?\s*:/i.test(text) && text.length <= 48);
        const pushBodyHtml = (html) => {
            const t = String(html || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!t || isLoneNoteLabel(t)) return;
            bodyParts.push(html);
        };
        cells.forEach((c) => {
            const html = String(c.innerHTML || '').trim();
            if (!html) return;
            const text = String(c.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (isLoneNoteLabel(text)) return;
            if (/notes?\s*:/i.test(text) || /<(ul|ol)\b/i.test(html)) {
                const doc = new DOMParser().parseFromString(
                    `<div id="ems-note-cell">${html}</div>`,
                    'text/html'
                );
                const root = doc.getElementById('ems-note-cell');
                if (root) {
                    [...root.childNodes].forEach((n) => {
                        if (n.nodeType !== Node.ELEMENT_NODE) {
                            const t = String(n.textContent || '').trim();
                            if (t && !isLoneNoteLabel(t)) pushBodyHtml(`<p>${t}</p>`);
                            return;
                        }
                        const el = /** @type {Element} */ (n);
                        const t = String(el.textContent || '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (isLoneNoteLabel(t)) return;
                        /* Strip a leading "Note:" run inside a mixed block. */
                        if (/^notes?\s*:/i.test(t) && el.childNodes.length) {
                            const clone = /** @type {HTMLElement} */ (el.cloneNode(true));
                            const first = clone.firstChild;
                            if (first && first.nodeType === Node.TEXT_NODE) {
                                first.textContent = String(first.textContent || '').replace(
                                    /^notes?\s*:\s*/i,
                                    ''
                                );
                            }
                            const cleaned = clone.outerHTML;
                            const ct = String(clone.textContent || '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            if (ct) pushBodyHtml(cleaned);
                            return;
                        }
                        pushBodyHtml(el.outerHTML);
                    });
                    return;
                }
            }
            pushBodyHtml(html);
        });
        if (!bodyParts.length && !String(row?.textContent || '').trim()) return '';
        const inner = `<p class="ems-boq-note-label" data-ems-boq-note-label="1"><strong>Note:</strong></p>${bodyParts.join('')}`;
        return `<div class="ems-boq-note-block" data-ems-boq-note="1" data-ems-keep-with-next="1">${inner}</div>`;
    };

    /** @type {string[]} */
    const out = [];
    /** After a Note row, stop using this split-id so header is not repeated above Notes. */
    let noteMode = false;
    for (let bodyIdx = 0; bodyIdx < allRows.length; bodyIdx += 1) {
        const row = allRows[bodyIdx];
        if (!isPriceSummary && rowLooksLikeBoqNote(row)) {
            noteMode = true;
            /* Extract Note as prose OUTSIDE the table — prevents thead repeating above it. */
            const noteOuter = buildBoqNoteBlockOuterHtml(row);
            if (noteOuter) out.push(noteOuter);
            continue;
        }
        if (noteMode && !isPriceSummary) {
            /* Trailing non-note rows after Note: still emit as table fragments with NEW id. */
        }
        const rowIndex = gridRows.indexOf(row);
        const absTrIndex = allTr.indexOf(row);
        const bodyHeightIdx = absTrIndex >= 0 ? absTrIndex : theadTrCount + bodyIdx;
        /** @type {number[]} */
        const fragmentHeights = [];
        for (let t = 0; t < theadTrCount; t += 1) {
            fragmentHeights.push(fullHeights[t] || 0);
        }
        fragmentHeights.push(fullHeights[bodyHeightIdx] || 0);
        const useSplitId = noteMode ? `${splitId}-postnote` : splitId;
        const splitAttrs = withSlicedRowHeightsAttr(attrsForSplit, fragmentHeights);
        const splitOpen = splitAttrs
            ? `<table ${splitAttrs} data-ems-table-split="1" data-ems-split-id="${useSplitId}">`
            : `<table data-ems-table-split="1" data-ems-split-id="${useSplitId}">`;
        if (isPriceSummary) {
            /* Keep label|amount as-is — never delete cells. */
            out.push(
                `${splitOpen}${colgroupHtml}${theadHtml}<tbody>${row.outerHTML}</tbody></table>`
            );
            continue;
        }
        /* Whole row only — do not expand/split cell content (that scrambled BOQ lines). */
        const rowClone = /** @type {HTMLTableRowElement} */ (row.cloneNode(true));
        annotateOfficePasteSplitRowRowspanLeads(rowClone, rowIndex, grid);
        out.push(
            `${splitOpen}${colgroupHtml}${theadHtml}<tbody>${rowClone.outerHTML}</tbody></table>`
        );
    }
    return out.length ? out : [table.outerHTML];
}

/**
 * When the DOM walk left one blob with a multi-row table, split that table inline (no recursion).
 * @param {string[]} segments
 * @param {ClausePackOptions & { splitTableMinRows?: number }} [options]
 */
function ensureMultiRowTablesSplit(segments, options = {}) {
    if (!segments?.length || segments.length > 1) return segments || [];
    const only = String(segments[0] || '').trim();
    if (!segmentHtmlContainsTable(only) || typeof DOMParser === 'undefined') return segments;

    const doc = new DOMParser().parseFromString(`<div id="ems-clause-root">${only}</div>`, 'text/html');
    const root = doc.getElementById('ems-clause-root');
    if (!root) return segments;

    /* Ignore nested in-cell vertical-split tables (data-ems-cell-split). */
    const tables = [...root.querySelectorAll('table')].filter(
        (t) => t.getAttribute('data-ems-cell-split') !== 'v'
    );
    if (tables.length !== 1) return segments;

    const table = /** @type {HTMLTableElement} */ (tables[0]);
    const rowCount = table.querySelectorAll('tbody tr, tr').length;
    const minRows = Number.isFinite(options.splitTableMinRows)
        ? Math.max(1, options.splitTableMinRows)
        : 2;
    if (rowCount < minRows) return segments;

    const rowSegments = splitTableToRowSegmentHtml(table);
    if (rowSegments.length <= 1) return segments;

    const tableHtml = table.outerHTML;
    const idx = only.indexOf(tableHtml);
    if (idx < 0) return rowSegments;

    /** @type {string[]} */
    const out = [];
    const before = only.slice(0, idx).trim();
    const after = only.slice(idx + tableHtml.length).trim();
    if (before) out.push(before);
    out.push(...rowSegments);
    if (after) out.push(after);
    return out.length ? out : rowSegments;
}

/**
 * @param {string} html
 * @param {ClausePackOptions & { splitListsPerItem?: boolean, splitTableMinRows?: number }} [options]
 * @returns {string[]}
 */
export function splitClauseHtmlToSegments(html, options = {}) {
    const raw = String(html || '').trim();
    if (!raw) return [''];

    if (typeof DOMParser === 'undefined') return [raw];

    const doc = new DOMParser().parseFromString(`<div id="ems-clause-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('ems-clause-root');
    if (!root) return [raw];

    /** @type {string[]} */
    const segments = [];

    const push = (h) => {
        const t = String(h || '').trim();
        if (t) segments.push(t);
    };

    const splitTable = (table) => {
        for (const part of splitTableToRowSegmentHtml(/** @type {HTMLTableElement} */ (table))) {
            push(part);
        }
    };

    const splitListToItemSegments = (listEl) => {
        const tag = listEl.tagName.toLowerCase();
        const items = [...listEl.children].filter(
            (c) => c.nodeType === Node.ELEMENT_NODE && /^LI$/i.test(c.tagName)
        );
        const minItems = resolveListSplitMinItems(options);
        if (items.length < minItems) {
            push(listEl.outerHTML);
            return;
        }
        items.forEach((li, idx) => {
            const itemNumber = getListBaseStartIndex(listEl) + idx;
            push(wrapSingleListItem(listEl, li, itemNumber));
        });
    };

    const tableSplitMinRows = Number.isFinite(options.splitTableMinRows)
        ? Math.max(1, options.splitTableMinRows)
        : 2;

    const countTableBodyRows = (table) => {
        const ownRows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
        const thead = table.querySelector('thead');
        if (thead) {
            return ownRows.filter((tr) => !thead.contains(tr)).length;
        }
        /* Label cells are often <th>. That is still a body row, not a reason to skip the split. */
        return ownRows.length;
    };

    const processElement = (el) => {
        const tag = el.tagName;
        if (tag === 'TABLE') {
            const table = /** @type {HTMLTableElement} */ (el);
            /* Pricing summary: always one segment per footer row so it can continue on the next page. */
            if (isEmsAutoPriceSummaryTableId(table) || countTableBodyRows(table) >= tableSplitMinRows) {
                splitTable(table);
                return;
            }
            /*
             * A one-row Word wrapper holds the real paragraphs/table in a cell.
             * Keeping it as one segment left the next clause on the following page
             * and a gap under the last paragraph.
             */
            const directRows = [...table.rows].filter((row) => row.closest('table') === table);
            const cells = directRows.length === 1 ? [...directRows[0].cells] : [];
            /*
             * Clause row 3.01-style: one row, label | body with many paragraphs.
             * Split BETWEEN body paragraphs — label only on the first fragment.
             */
            if (directRows.length === 1 && cells.length === 2) {
                const labelCell = cells[0];
                const bodyCell = cells[1];
                let bodyBlocks = [...bodyCell.children].filter((child) =>
                    /^(P|DIV|UL|OL|TABLE|H[1-6])$/i.test(child.tagName)
                );
                /*
                 * Single wrapping DIV with inner paragraphs — unwrap so we can split
                 * between/inside paragraphs (otherwise 3.01 stays one tall atomic unit).
                 */
                if (
                    bodyBlocks.length === 1 &&
                    /^DIV$/i.test(bodyBlocks[0].tagName) &&
                    bodyBlocks[0].children.length >= 1
                ) {
                    const inner = [...bodyBlocks[0].children].filter((child) =>
                        /^(P|DIV|UL|OL|TABLE|H[1-6])$/i.test(child.tagName)
                    );
                    if (inner.length >= 1) bodyBlocks = inner;
                }
                if (bodyBlocks.length >= 1) {
                    const colgroup =
                        table.querySelector('colgroup')?.outerHTML ||
                        '<colgroup><col style="width:12%" /><col style="width:88%" /></colgroup>';
                    const tableOpenAttrs = [...table.attributes]
                        .filter((a) => a.name !== 'data-ems-table-split' && a.name !== 'data-ems-split-id')
                        .map((a) => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
                        .join(' ');
                    const labelHtml = labelCell.outerHTML;
                    const emptyLabel = labelCell.cloneNode(false);
                    emptyLabel.innerHTML = '';
                    const emptyLabelHtml = emptyLabel.outerHTML;
                    let fragIdx = 0;
                    const pushClauseRowFrag = (innerHtml) => {
                        const label = fragIdx === 0 ? labelHtml : emptyLabelHtml;
                        const contAttr =
                            fragIdx > 0 ? ' data-ems-clause-row-continue="1"' : '';
                        fragIdx += 1;
                        const bodyShell = /** @type {HTMLElement} */ (bodyCell.cloneNode(false));
                        bodyShell.innerHTML = innerHtml;
                        push(
                            `<table ${tableOpenAttrs} data-ems-clause-row-split="1"${contAttr}>${colgroup}<tbody><tr>${label}${bodyShell.outerHTML}</tr></tbody></table>`
                        );
                    };
                    bodyBlocks.forEach((block) => {
                        if (/^TABLE$/i.test(block.tagName)) {
                            processElement(block);
                            return;
                        }
                        if (/^(UL|OL)$/i.test(block.tagName)) {
                            splitListToItemSegments(/** @type {HTMLElement} */ (block));
                            return;
                        }
                        if (/^P$/i.test(block.tagName)) {
                            for (const part of splitLongParagraphElement(
                                /** @type {HTMLElement} */ (block)
                            )) {
                                pushClauseRowFrag(part);
                            }
                            return;
                        }
                        pushClauseRowFrag(block.outerHTML);
                    });
                    if (fragIdx > 0) return;
                }
            }
            const splittable = cells.some((td) => {
                const blocks = [...td.children].filter((child) =>
                    /^(P|DIV|TABLE|UL|OL|H[1-6])$/i.test(child.tagName)
                );
                if (blocks.length >= 2) return true;
                const nested = [...td.children].find((child) => /^TABLE$/i.test(child.tagName));
                if (!(nested instanceof HTMLTableElement)) return false;
                const nestedRows = [...nested.rows].filter((row) => row.closest('table') === nested);
                return nestedRows.length >= tableSplitMinRows;
            });
            if (splittable) {
                cells.forEach((td) => {
                    [...td.childNodes].forEach((child) => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            const text = String(child.textContent || '').trim();
                            if (text) push(`<p>${text}</p>`);
                            return;
                        }
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            processElement(/** @type {Element} */ (child));
                        }
                    });
                });
                return;
            }
            push(table.outerHTML);
            return;
        }
        if (tag === 'UL' || tag === 'OL') {
            splitListToItemSegments(el);
            return;
        }
        if (tag === 'SPAN' || tag === 'FONT') {
            const blockChildren = [...el.children].filter((c) =>
                /^(P|DIV|TABLE|UL|OL|H[1-6]|FIGURE|SECTION|ARTICLE)$/i.test(c.tagName)
            );
            if (blockChildren.length > 0) {
                blockChildren.forEach((child) => processElement(/** @type {Element} */ (child)));
                return;
            }
        }
        if (tag === 'DIV' || tag === 'FIGURE' || tag === 'SECTION' || tag === 'ARTICLE') {
            /*
             * BOQ Note block: keep label + bullets as ONE pack unit (or label+first-li
             * then remaining items). Unwrapping put bullets on sheet N and "Note:" on N+1.
             */
            if (
                el.getAttribute?.('data-ems-boq-note') === '1' ||
                el.classList?.contains?.('ems-boq-note-block')
            ) {
                pushBoqNoteBlockSegments(el, push);
                return;
            }
            const blockChildren = [...el.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
            if (blockChildren.length > 0) {
                blockChildren.forEach((child) => processElement(/** @type {Element} */ (child)));
                return;
            }
        }
        push(el.outerHTML);
    };

    const nodes = [...root.childNodes].filter((n) => {
        if (n.nodeType === Node.TEXT_NODE) return Boolean(String(n.textContent || '').trim());
        return n.nodeType === Node.ELEMENT_NODE;
    });

    if (!nodes.length) {
        push(raw);
        return ensureMultiRowTablesSplit(segments.length ? segments : [raw], options);
    }

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = String(node.textContent || '').trim();
            if (t) push(`<p>${t}</p>`);
            continue;
        }
        processElement(/** @type {Element} */ (node));
    }

    let out = segments.length ? segments : [raw];
    if (shouldRefinePackSegments(options)) {
        out = splitTableTailSegments(out);
        out = splitListsInHtmlParts(out, options);
        if (options.splitParagraphs || options.splitListsPerItem) {
            out = expandParagraphListSegments(out);
        }
    }
    return ensureMultiRowTablesSplit(out, options);
}

/** Split top-level UL/OL in a fragment (e.g. table tail) without losing list attributes. */
function splitListsInHtmlParts(htmlParts, options = {}) {
    if (!htmlParts?.length || typeof DOMParser === 'undefined') return htmlParts || [];
    /** @type {string[]} */
    const out = [];
    for (const part of htmlParts) {
        const t = String(part || '').trim();
        if (!t) continue;
        const doc = new DOMParser().parseFromString(`<div id="ems-list-split">${t}</div>`, 'text/html');
        const root = doc.getElementById('ems-list-split');
        if (!root) {
            out.push(t);
            continue;
        }
        const children = [...root.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
        if (!children.length) {
            out.push(t);
            continue;
        }
        for (const child of children) {
            const tag = child.tagName;
            if (tag === 'UL' || tag === 'OL') {
                const listEl = /** @type {HTMLElement} */ (child);
                const items = [...listEl.children].filter(
                    (c) => c.nodeType === Node.ELEMENT_NODE && /^LI$/i.test(c.tagName)
                );
                const minItems = resolveListSplitMinItems(options);
                if (items.length < minItems) {
                    out.push(listEl.outerHTML);
                } else if (items.length) {
                    items.forEach((li, idx) => {
                        const itemNumber = getListBaseStartIndex(listEl) + idx;
                        out.push(wrapSingleListItem(listEl, li, itemNumber));
                    });
                } else {
                    out.push(listEl.outerHTML);
                }
            } else {
                out.push(child.outerHTML);
            }
        }
    }
    return out.length ? out : htmlParts;
}

/** When table + prose/list were measured as one blob, split tail for page packing. */
function splitTableTailSegments(htmlParts) {
    /** @type {string[]} */
    const out = [];
    for (const part of htmlParts) {
        const t = String(part || '').trim();
        const m = t.match(/^(.*?<\/table>)\s*([\s\S]+)$/i);
        if (m?.[1] && m[2]?.trim()) {
            out.push(m[1].trim());
            out.push(m[2].trim());
        } else if (t) {
            out.push(t);
        }
    }
    return out.length ? out : htmlParts;
}

/** ~90 chars ≈ one wrapped line at 13px / 180mm. */
const PACK_CHARS_PER_LINE = 90;
const PACK_MIN_LINES_EACH_SIDE = 2;

/** True when the last wrapped "line" of a fragment is a single short word (orphan). */
function endsWithOneWordOrphan(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return false;
    const lastBreak = raw.lastIndexOf(' ');
    if (lastBreak < 0) return raw.length <= 12;
    const lastWord = raw.slice(lastBreak + 1);
    const before = raw.slice(0, lastBreak).trim();
    if (!before) return false;
    /* One-word last line: short final token after a long preceding run. */
    return lastWord.length <= 12 && before.length >= PACK_CHARS_PER_LINE;
}

function splitPlainAtWordBoundary(text, maxChars) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    if (raw.length <= maxChars) return [raw];
    /** @type {string[]} */
    const parts = [];
    let rest = raw;
    const minKeep = PACK_CHARS_PER_LINE * PACK_MIN_LINES_EACH_SIDE;
    while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < Math.floor(maxChars * 0.45)) cut = maxChars;
        let head = rest.slice(0, cut).trim();
        rest = rest.slice(cut).trim();
        /* No one-word last line on the first fragment (e.g. "... The" | "remaining..."). */
        if (head && endsWithOneWordOrphan(head)) {
            const orphanBreak = head.lastIndexOf(' ');
            if (orphanBreak > Math.floor(maxChars * 0.4)) {
                const orphan = head.slice(orphanBreak + 1).trim();
                head = head.slice(0, orphanBreak).trim();
                rest = `${orphan} ${rest}`.trim();
            }
        }
        if (head) parts.push(head);
    }
    if (rest) parts.push(rest);
    while (parts.length >= 2 && parts[parts.length - 1].length < minKeep) {
        const last = parts.pop();
        parts[parts.length - 1] = `${parts[parts.length - 1]} ${last}`.trim();
    }
    /* Still avoid a one-word final fragment when the previous part can absorb a cut. */
    while (parts.length >= 2 && endsWithOneWordOrphan(parts[parts.length - 2])) {
        const prev = parts[parts.length - 2];
        const orphanBreak = prev.lastIndexOf(' ');
        if (orphanBreak < Math.floor(prev.length * 0.4)) break;
        const orphan = prev.slice(orphanBreak + 1).trim();
        parts[parts.length - 2] = prev.slice(0, orphanBreak).trim();
        parts[parts.length - 1] = `${orphan} ${parts[parts.length - 1]}`.trim();
        if (!parts[parts.length - 2]) {
            parts.splice(parts.length - 2, 1);
            break;
        }
    }
    return parts.filter(Boolean);
}

/**
 * Keep Note: label + all bullets as ONE pack unit so the label never lands on
 * a different sheet than its bullets (R7).
 * @param {Element} el
 * @param {(html: string) => void} push
 */
function pushBoqNoteBlockSegments(el, push) {
    const children = [...el.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
    if (!children.length) {
        push(el.outerHTML);
        return;
    }
    const hasLabel = children.some(
        (c) =>
            c.getAttribute?.('data-ems-boq-note-label') === '1' ||
            c.classList?.contains?.('ems-boq-note-label') ||
            /^notes?\s*:?\s*$/i.test(String(c.textContent || '').replace(/\s+/g, ' ').trim())
    );
    const labelHtml = hasLabel
        ? ''
        : '<p class="ems-boq-note-label" data-ems-boq-note-label="1"><strong>Note:</strong></p>';
    const inner = `${labelHtml}${children.map((c) => c.outerHTML).join('')}`;
    push(
        `<div class="ems-boq-note-block" data-ems-boq-note="1" data-ems-keep-with-next="1">${inner}</div>`
    );
}

function cloneOpenTag(el, extraAttrs = '') {
    const tag = el.tagName.toLowerCase();
    const attrs = [...el.attributes]
        .map((a) => ` ${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
        .join('');
    return `<${tag}${attrs}${extraAttrs}>`;
}

/**
 * Split a long paragraph into line-sized chunks (≥2 lines each side) so sheets fill.
 * Prefers <br> boundaries; otherwise word-boundary character chunks.
 * Continuation fragments are marked so preview/PDF can continue seamlessly (no extra gap).
 */
function splitLongParagraphElement(pEl) {
    if (!pEl || !/^P$/i.test(pEl.tagName)) return [pEl.outerHTML];
    const paraId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const open0 = cloneOpenTag(pEl, ` data-ems-para-split="${paraId}"`);
    const openCont = cloneOpenTag(
        pEl,
        ` data-ems-para-split="${paraId}" data-ems-para-continue="1"`
    );
    const close = `</${pEl.tagName.toLowerCase()}>`;
    const stamp = (htmlInner, isCont) => `${isCont ? openCont : open0}${htmlInner}${close}`;
    const brParts = String(pEl.innerHTML || '').split(/<br\s*\/?>/i);
    if (brParts.length >= PACK_MIN_LINES_EACH_SIDE * 2) {
        /** @type {string[]} */
        const chunks = [];
        /* Prefer 2–3 lines so leftover sheet space can take the next fragment. */
        const group = PACK_MIN_LINES_EACH_SIDE;
        for (let i = 0; i < brParts.length; i += group) {
            const slice = brParts.slice(i, i + group);
            if (i + group >= brParts.length && slice.length < PACK_MIN_LINES_EACH_SIDE && chunks.length) {
                chunks[chunks.length - 1] = `${chunks[chunks.length - 1].replace(
                    new RegExp(`${close}$`),
                    ''
                )}<br>${slice.join('<br>')}${close}`;
                break;
            }
            chunks.push(stamp(slice.join('<br>'), i > 0));
        }
        return chunks.length ? chunks : [pEl.outerHTML];
    }
    const plain = String(pEl.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    const estLines = Math.max(1, Math.ceil(plain.length / PACK_CHARS_PER_LINE));
    if (estLines < PACK_MIN_LINES_EACH_SIDE * 2 + 1) return [pEl.outerHTML];
    /* Prefer 2-line fragments so leftover sheet space (e.g. ~95mm) can take the next piece. */
    const chunkLines = PACK_MIN_LINES_EACH_SIDE;
    const texts = splitPlainAtWordBoundary(plain, chunkLines * PACK_CHARS_PER_LINE);
    if (texts.length <= 1) return [pEl.outerHTML];
    return texts.map((t, i) => stamp(t, i > 0));
}

/**
 * Soft-split one oversized pack unit at safe HTML boundaries (paragraph / br / word /
 * clause-row body blocks). Tables stay tables; paragraphs stay paragraphs.
 * Returns the original HTML alone when further split is unsafe.
 *
 * @param {string} html
 * @param {{ maxParts?: number }} [options]
 * @returns {string[]}
 */
export function softSplitOversizedUnitHtml(html, options = {}) {
    const raw = String(html || '').trim();
    if (!raw || typeof DOMParser === 'undefined') return raw ? [raw] : [];
    const maxParts = Math.max(2, Number(options.maxParts) || 8);

    /* Already a multi-row table fragment → re-run row split aggressively. */
    if (/<table\b/i.test(raw)) {
        const parts = splitClauseHtmlToSegments(raw, {
            splitListsPerItem: true,
            splitTableMinRows: 1,
            splitParagraphs: true,
            splitListMinItems: 1,
        });
        if (parts.length >= 2) return parts.slice(0, maxParts);
    }

    const doc = new DOMParser().parseFromString(`<div id="ems-soft-split">${raw}</div>`, 'text/html');
    const root = doc.getElementById('ems-soft-split');
    if (!root) return [raw];

    const children = [...root.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
    if (children.length >= 2) {
        const out = children.map((c) => String(c.outerHTML || '').trim()).filter(Boolean);
        if (out.length >= 2) return out.slice(0, maxParts);
    }

    const only = children[0] || null;
    if (only && /^P$/i.test(only.tagName)) {
        const parts = splitLongParagraphElement(/** @type {HTMLElement} */ (only));
        if (parts.length >= 2) return parts.slice(0, maxParts);
        /* Force word-boundary chop even for shorter paras when caller says oversized. */
        const plain = String(only.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (plain.length > 40) {
            const texts = splitPlainAtWordBoundary(plain, Math.max(40, Math.ceil(plain.length / 2)));
            if (texts.length >= 2) {
                const paraId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
                const open0 = cloneOpenTag(only, ` data-ems-para-split="${paraId}"`);
                const openCont = cloneOpenTag(
                    only,
                    ` data-ems-para-split="${paraId}" data-ems-para-continue="1"`
                );
                const close = `</${only.tagName.toLowerCase()}>`;
                return texts.slice(0, maxParts).map((t, i) => `${i > 0 ? openCont : open0}${t}${close}`);
            }
        }
    }

    if (only && /^(UL|OL)$/i.test(only.tagName)) {
        const items = [...only.children].filter((c) => /^LI$/i.test(c.tagName));
        if (items.length >= 2) {
            return items
                .slice(0, maxParts)
                .map((li, idx) => wrapSingleListItem(/** @type {HTMLElement} */ (only), li, getListBaseStartIndex(only) + idx));
        }
    }

    /* DIV / note wrappers: split block children. */
    if (only && /^(DIV|SECTION|ARTICLE)$/i.test(only.tagName)) {
        const blocks = [...only.children].filter((c) =>
            /^(P|DIV|UL|OL|TABLE|H[1-6])$/i.test(c.tagName)
        );
        if (blocks.length >= 2) {
            return blocks
                .slice(0, maxParts)
                .map((b) => String(b.outerHTML || '').trim())
                .filter(Boolean);
        }
    }

    return [raw];
}

/**
 * Detect repeated pack/peel state signatures (loop guard).
 * @param {Set<string>} seen
 * @param {unknown} groups
 * @returns {boolean} true when this state was already seen
 */
export function detectRepeatedPackState(seen, groups) {
    if (!seen || typeof seen.has !== 'function') return false;
    const sig = JSON.stringify(groups || []);
    if (seen.has(sig)) return true;
    seen.add(sig);
    return false;
}

/** Split multi-paragraph / Word DIV blobs; also chop long single paragraphs at line size. */
function expandParagraphListSegments(htmlParts) {
    if (!htmlParts?.length || typeof DOMParser === 'undefined') return htmlParts || [];
    /** @type {string[]} */
    const out = [];
    const pushSplitP = (el) => {
        for (const part of splitLongParagraphElement(el)) {
            if (part?.trim()) out.push(part.trim());
        }
    };
    for (const part of htmlParts) {
        const t = String(part || '').trim();
        if (!t || /<table\b/i.test(t) || /<ul\b|<ol\b/i.test(t)) {
            if (t) out.push(t);
            continue;
        }
        const doc = new DOMParser().parseFromString(`<div id="ems-para-split">${t}</div>`, 'text/html');
        const root = doc.getElementById('ems-para-split');
        if (!root) {
            out.push(t);
            continue;
        }
        const children = [...root.children].filter((c) => c.nodeType === Node.ELEMENT_NODE);
        if (children.length === 1 && /^P$/i.test(children[0].tagName)) {
            pushSplitP(children[0]);
            continue;
        }
        const blockOk =
            children.length > 1 &&
            children.every((c) => /^(P|DIV|H[1-6]|SECTION|ARTICLE)$/i.test(c.tagName));
        if (blockOk) {
            for (let i = 0; i < children.length; i += 1) {
                const c = children[i];
                const h = String(c.outerHTML || '').trim();
                if (!h) continue;
                if (isManualBlankSpacerElement(c)) {
                    let run = 1;
                    while (
                        i + run < children.length &&
                        isManualBlankSpacerElement(children[i + run])
                    ) {
                        run += 1;
                    }
                    /* Keep 2+ consecutive blank lines as packable segments; skip lone editor noise. */
                    if (run >= 2) {
                        for (let j = 0; j < run; j += 1) {
                            const bh = String(children[i + j].outerHTML || '').trim();
                            if (bh) out.push(bh);
                        }
                    }
                    i += run - 1;
                    continue;
                }
                if (/^P$/i.test(c.tagName)) pushSplitP(c);
                else if (/^DIV$/i.test(c.tagName)) {
                    const innerPs = [...c.children].filter((x) => /^P$/i.test(x.tagName));
                    if (innerPs.length >= 2) {
                        innerPs.forEach((p) => pushSplitP(p));
                    } else {
                        out.push(h);
                    }
                } else {
                    out.push(h);
                }
            }
            continue;
        }
        out.push(t);
    }
    return out.length ? out : htmlParts;
}

function packIndicesByHeightSum(indices, heights, usablePx, options = {}) {
    if (!indices?.length) return [];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    const fudge = options?.tightFit ? 12 : 8;
    /** @type {number[][]} */
    const pages = [];
    let cur = [];
    let sum = 0;
    let pageIdx = 0;
    for (const i of indices) {
        const h = Math.max(heights[i] || 0, 1);
        const usable = perPage
            ? resolvePackLimitForContinuationPage(pageIdx, usablePx, options)
            : resolvePackFillLimitPx(usablePx, options);
        if (cur.length > 0 && sum + h > usable + fudge) {
            pages.push(cur);
            pageIdx += 1;
            cur = [i];
            sum = h;
        } else {
            cur.push(i);
            sum += h;
        }
    }
    if (cur.length) pages.push(cur);
    return pages;
}

const TABLE_SIG_ATTR_SEP = '\u0001';
const TABLE_SIG_HEAD_SEP = '\u0002';

function tableSplitSignature(table) {
    const splitId = table.getAttribute('data-ems-split-id');
    if (splitId) return `id:${splitId}`;
    const parts = [];
    for (const attr of table.attributes) {
        if (attr.name === 'data-ems-table-split' || attr.name === 'data-ems-split-id') continue;
        parts.push(`${attr.name}${TABLE_SIG_ATTR_SEP}${attr.value}`);
    }
    parts.sort();
    const thead = table.querySelector('thead');
    return `${parts.join(TABLE_SIG_ATTR_SEP)}${TABLE_SIG_HEAD_SEP}${
        thead ? thead.outerHTML : ''
    }`;
}

/** Pass-through: preview/PDF must mirror editor HTML (no table restructuring). */
export function normalizeClauseTableHtml(html) {
    return String(html || '').trim();
}

function getSplitTableBodyRows(table) {
    const tbody = table.querySelector('tbody');
    if (tbody) return [...tbody.querySelectorAll(':scope > tr')];
    return [...table.querySelectorAll(':scope > tr')].filter((tr) => !tr.closest('thead'));
}

/**
 * Build one merged table from a template + collected body rows.
 * @param {Document} doc
 * @param {HTMLTableElement} template
 * @param {HTMLTableRowElement[]} rows
 */
function buildRejoinedTableOuterHtml(doc, template, rows) {
    const table = /** @type {HTMLTableElement} */ (template.cloneNode(true));
    table.removeAttribute('data-ems-table-split');
    table.removeAttribute('data-ems-split-id');
    table.querySelectorAll('tbody').forEach((tb) => tb.remove());
    const tbody = doc.createElement('tbody');
    rows.forEach((tr) => tbody.appendChild(tr.cloneNode(true)));
    const thead = table.querySelector('thead');
    if (thead) thead.after(tbody);
    else table.appendChild(tbody);
    /* Rebuild row-height CSV for rejoined row count (template only had thead + first body). */
    if (table.hasAttribute('data-ems-row-heights')) {
        const heights = [...table.querySelectorAll('tr')].map((tr) => {
            const attrH = parseFloat(tr.getAttribute('height') || '0');
            if (attrH > 0) return Math.round(attrH);
            const styleH = parseFloat(String(tr.style?.height || '').replace(/px$/i, ''));
            return styleH > 0 ? Math.round(styleH) : 0;
        });
        if (heights.some((h) => h > 0)) {
            table.setAttribute('data-ems-row-heights', heights.join(','));
        } else {
            table.removeAttribute('data-ems-row-heights');
        }
    }
    syncOfficePasteTableColumnLayout(table);
    return table.outerHTML;
}

/**
 * Pagination splits large tables one row per segment; merge those fragments back into
 * a single table for preview/PDF without changing cell content or structure.
 *
 * Uses split-id grouping over the whole subtree so prose/wrappers between row fragments
 * cannot prevent rejoin (fixes stacked mini-tables when a prior clause is long).
 * @param {string} html
 */
export function rejoinSplitTableHtml(html) {
    const raw = String(html || '').trim();
    if (!raw.includes('<table') || !raw.includes('data-ems-table-split')) return raw;
    if (typeof DOMParser === 'undefined') return raw;

    const doc = new DOMParser().parseFromString(
        `<div id="ems-rejoin-root">${raw}</div>`,
        'text/html'
    );
    const root = doc.getElementById('ems-rejoin-root');
    if (!root) return raw;

    const splitTables = [...root.querySelectorAll('table[data-ems-table-split="1"]')];
    if (splitTables.length === 0) return raw;

    /** @type {Map<string, { template: HTMLTableElement, rows: HTMLTableRowElement[], tables: HTMLTableElement[] }>} */
    const groups = new Map();
    /** @type {string[]} */
    const groupOrder = [];

    for (const table of splitTables) {
        const t = /** @type {HTMLTableElement} */ (table);
        const splitId = t.getAttribute('data-ems-split-id') || tableSplitSignature(t);
        if (!groups.has(splitId)) {
            groups.set(splitId, { template: t, rows: [], tables: [] });
            groupOrder.push(splitId);
        }
        const group = groups.get(splitId);
        group.rows.push(...getSplitTableBodyRows(t));
        group.tables.push(t);
    }

    for (const splitId of groupOrder) {
        const group = groups.get(splitId);
        if (!group?.rows.length || !group.tables.length) continue;

        const first = group.tables[0];
        const mergedHtml = buildRejoinedTableOuterHtml(doc, group.template, group.rows);
        const holder = doc.createElement('div');
        holder.innerHTML = mergedHtml;
        const mergedTable = holder.querySelector('table');
        if (!mergedTable) continue;

        first.replaceWith(mergedTable);
        group.tables.slice(1).forEach((tb) => tb.remove());
    }

    /* Always return full root — never drop prose (3.1 / payment terms) after a lone table fragment. */
    return root.innerHTML.trim() || raw;
}

/**
 * @param {Array<{ clause: object, content: string, listKey: string }>} activeClausesList
 * @param {(html: string, listKey: string, displayMajor: number) => string} formatBodyHtml
 * @param {ClausePackOptions & { splitListsPerItem?: boolean, splitTableMinRows?: number }} [options]
 * @returns {ClauseSegment[]}
 */
function isBlankPackHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return true;
    const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    return !plain;
}

/** Drop trailing blank-only parts so the next clause does not sit under a system gap. */
function trimTrailingBlankParts(parts) {
    if (!parts?.length) return parts || [];
    let end = parts.length;
    while (end > 0 && isBlankPackHtml(parts[end - 1])) end -= 1;
    return end < parts.length ? parts.slice(0, Math.max(end, 1)) : parts;
}

export function buildClauseSegmentsForPagination(activeClausesList, formatBodyHtml, options = {}) {
    /** @type {ClauseSegment[]} */
    const out = [];
    activeClausesList.forEach((clause, clauseIdx) => {
        const displayMajor = clauseIdx + 1;
        const bodyHtml = formatBodyHtml(clause.content, clause.listKey, displayMajor);
        const parts = trimTrailingBlankParts(splitClauseHtmlToSegments(bodyHtml, options));
        parts.forEach((html, partIdx) => {
            const key = `${clause.listKey ?? clause.key ?? clause.id ?? clauseIdx}-${partIdx}`;
            out.push({
                clauseIdx,
                clause,
                html,
                showHeading: partIdx === 0,
                displayMajor,
                key,
            });
        });
    });
    return out;
}

const SINGLE_ITEM_LIST_RE = /^<(ul|ol)(\s[^>]*)?>\s*(<li[\s\S]*?<\/li>)\s*<\/\1>$/i;
const PARA_SPLIT_CONT_RE =
    /^(.*)(<p\b[^>]*\bdata-ems-para-split=["']([^"']+)["'][^>]*>)([\s\S]*)<\/p>\s*$/i;
const PARA_CONTINUE_RE =
    /^<p\b[^>]*\bdata-ems-para-continue=["']?1["']?[^>]*\bdata-ems-para-split=["']([^"']+)["'][^>]*>([\s\S]*)<\/p>$/i;
const PARA_CONTINUE_RE_ALT =
    /^<p\b[^>]*\bdata-ems-para-split=["']([^"']+)["'][^>]*\bdata-ems-para-continue=["']?1["']?[^>]*>([\s\S]*)<\/p>$/i;

/** Merge consecutive single-&lt;li&gt; list fragments / paragraph split pieces on the same sheet. */
function appendSegmentHtmlToAcc(acc, html) {
    const prev = String(acc || '').trim();
    const next = String(html || '').trim();
    if (!prev) return next;
    if (!next) return prev;

    /* Seamlessly continue a split paragraph (no inserted paragraph break / gap). */
    const cont = next.match(PARA_CONTINUE_RE) || next.match(PARA_CONTINUE_RE_ALT);
    if (cont) {
        const splitId = cont[1];
        const contInner = cont[2];
        const prevPara = prev.match(PARA_SPLIT_CONT_RE);
        if (prevPara && prevPara[3] === splitId) {
            return `${prevPara[1]}${prevPara[2]}${prevPara[4]} ${contInner}</p>`;
        }
    }

    const nextMatch = next.match(SINGLE_ITEM_LIST_RE);
    if (!nextMatch) return prev + next;

    const tag = nextMatch[1].toLowerCase();
    const nextLi = nextMatch[3];
    const nextAttrs = nextMatch[2] || '';
    const prevSingle = prev.match(SINGLE_ITEM_LIST_RE);
    if (prevSingle && prevSingle[1].toLowerCase() === tag) {
        const attrs = prevSingle[2] || nextAttrs;
        return `<${tag}${attrs}>${prevSingle[3]}${nextLi}</${tag}>`;
    }

    const prevMulti = prev.match(new RegExp(`^<(${tag})(\\s[^>]*)?>([\\s\\S]*)<\\/\\1>$`, 'i'));
    if (prevMulti && prevMulti[1].toLowerCase() === tag) {
        const attrs = prevMulti[2] || nextAttrs;
        const inner = String(prevMulti[3] || '').trim();
        return `<${tag}${attrs}>${inner}${nextLi}</${tag}>`;
    }

    return prev + next;
}

/**
 * Merge consecutive segments from the same clause on one sheet into render blocks.
 * @param {number[]} segmentIndices global segment indices for this sheet
 * @param {ClauseSegment[]} segments
 */
/**
 * Mark the segment index on the row or block that will still exist after split
 * tables are joined back together. Packing then measures the painted page instead
 * of guessing a line count.
 * @param {string} html
 * @param {number} segIndex
 */
function stampPackSegmentHtml(html, segIndex) {
    const raw = String(html || '').trim();
    if (!raw) return raw;
    const attr = ` data-ems-pack-seg="${segIndex}"`;
    const splitId = readEmsSplitIdFromHtml(raw);
    const tableAttr = splitId ? ` data-ems-pack-table="${splitId}"` : '';
    const trAttr = ` data-ems-pack-seg="${segIndex}"${tableAttr}`;
    const tbodyCount = (raw.match(/<tbody\b/gi) || []).length;
    const trCount = (raw.match(/<tr\b/gi) || []).length;
    /* One body row and no nested table: stamp that row without a parse. */
    if (tbodyCount === 1 && trCount > 0 && trCount <= 3 && !/<tbody[\s\S]*<tbody/i.test(raw)) {
        return raw.replace(/<tbody(\s[^>]*)?>\s*<tr\b/i, (open) => open.replace(/<tr\b/i, `<tr${trAttr}`));
    }
    if (/<tr\b/i.test(raw) && typeof DOMParser !== 'undefined') {
        const doc = new DOMParser().parseFromString(`<div id="ems-stamp">${raw}</div>`, 'text/html');
        const root = doc.getElementById('ems-stamp');
        if (root) {
            const rows = [...root.querySelectorAll('tr')].filter((tr) => {
                if (tr.closest('thead')) return false;
                const table = tr.closest('table');
                return Boolean(table) && !table.parentElement?.closest('table');
            });
            if (rows.length) {
                rows.forEach((tr) => {
                    tr.setAttribute('data-ems-pack-seg', String(segIndex));
                    if (splitId) tr.setAttribute('data-ems-pack-table', splitId);
                });
                return root.innerHTML.trim();
            }
        }
    } else if (/<tr\b/i.test(raw)) {
        return raw.replace(/<tr\b/i, `<tr${trAttr}`);
    }
    if (/<li\b/i.test(raw)) {
        return raw.replace(/<li\b/gi, `<li${attr}`);
    }
    if (/^<[a-zA-Z]/.test(raw)) {
        return raw.replace(/^<([a-zA-Z0-9:-]+)/, `<$1${attr}`);
    }
    return `<div${attr}>${raw}</div>`;
}

export function mergeSegmentsIntoSheetBlocks(segmentIndices, segments) {
    /** @type {Array<{ clause: object, bodyHtml: string, showHeading: boolean, displayMajor: number, listKey: string }>} */
    const blocks = [];
    let curClauseIdx = -1;
    let acc = '';
    /** @type {ClauseSegment | null} */
    let head = null;

    const flush = () => {
        if (!head) return;
        const joined = String(acc || '').trim();
        blocks.push({
            clause: head.clause,
            bodyHtml: syncOfficePasteTableColumnsInHtmlString(rejoinSplitTableHtml(joined)),
            showHeading: Boolean(head.showHeading),
            displayMajor: head.displayMajor,
            listKey: head.clause.listKey ?? head.clause.key ?? head.clause.id,
        });
        curClauseIdx = -1;
        acc = '';
        head = null;
    };

    for (const si of segmentIndices) {
        const seg = segments[si];
        if (!seg) continue;
        const stamped = stampPackSegmentHtml(seg.html, si);
        if (seg.clauseIdx !== curClauseIdx) {
            flush();
            curClauseIdx = seg.clauseIdx;
            head = seg;
            acc = stamped;
        } else {
            acc = appendSegmentHtmlToAcc(acc, stamped);
        }
    }
    flush();
    return blocks;
}

function packDebugEnabled() {
    return false;
}

function packDebugLog() {
    /* debug logging removed after diagnosis */
}

/**
 * Pack segment indices using merged block heights (matches on-sheet render, not sum of parts).
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function packSegmentIndicesByMergedHeight(
    indices,
    measureMergedGroupPx,
    usablePx,
    options = {},
    segmentHeightsPx = null
) {
    if (!indices?.length) return [];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    const pages = [];
    let cur = [];
    let pageIdx = 0;
    const segments = options?.segments || null;

    for (const i of indices) {
        const tryGroup = [...cur, i];
        const usable = perPage
            ? resolvePackLimitForContinuationPage(pageIdx, usablePx, options)
            : resolvePackFillLimitPx(usablePx, options);
        const used =
            typeof measureMergedGroupPx === 'function' && cur.length
                ? measureMergedGroupPx(cur, pageIdx)
                : sumSegmentHeightsPx(cur, segmentHeightsPx);
        const nextH =
            typeof measureMergedGroupPx === 'function'
                ? Math.max(
                      0,
                      (measureMergedGroupPx(tryGroup, pageIdx) || 0) - (used || 0)
                  )
                : Math.max(segmentHeightsPx?.[i] || 0, 1);
        const remaining = Math.max(0, usable - (used || 0));
        const fits = groupFitsPackLimit(
            tryGroup,
            measureMergedGroupPx,
            usable,
            segmentHeightsPx,
            options,
            pageIdx
        );
        if (cur.length > 0 && !fits) {
            const unitTaller =
                typeof measureMergedGroupPx === 'function'
                    ? measureMergedGroupPx([i], pageIdx + 1) > usable
                    : Math.max(segmentHeightsPx?.[i] || 0, 1) > usable;
            const keepWith =
                groupEndsWithSubheading(cur, segments) ||
                Boolean(segments?.[cur[cur.length - 1]]?.showHeading);
            packDebugLog('break', {
                page: pageIdx,
                used,
                remaining,
                nextUnit: nextH,
                nextIdx: i,
                reason: unitTaller
                    ? 'unit-taller-than-page'
                    : keepWith
                      ? 'keep-together-block-does-not-fit'
                      : 'next-unit-does-not-fit',
            });
            pages.push(cur);
            pageIdx += 1;
            cur = [i];
        } else {
            cur = tryGroup;
        }
    }
    if (cur.length) {
        const usable = perPage
            ? resolvePackLimitForContinuationPage(pageIdx, usablePx, options)
            : resolvePackFillLimitPx(usablePx, options);
        const used =
            typeof measureMergedGroupPx === 'function'
                ? measureMergedGroupPx(cur, pageIdx)
                : sumSegmentHeightsPx(cur, segmentHeightsPx);
        packDebugLog('page-final', {
            page: pageIdx,
            used,
            remaining: Math.max(0, usable - (used || 0)),
            segs: cur.length,
            reason: 'end-of-content',
        });
        pages.push(cur);
    }
    return pages;
}

/**
 * If a page group is only prose (e.g. BOQ intro) and the next group starts the table, merge forward
 * so the intro is not stranded on an otherwise empty sheet.
 * Same clause only — never glue Scope bullets onto Pricing (that left one LI on a blank page).
 * @param {number[][]} groups
 * @param {ClauseSegment[]} segments
 */
export function mergeIntroOnlyGroupsForward(groups, segments) {
    if (!groups?.length || groups.length < 2) return groups;
    const out = [];
    let i = 0;
    while (i < groups.length) {
        const g = groups[i];
        const onlyProse =
            g.length > 0 &&
            g.every((idx) => {
                const seg = segments[idx];
                return seg && !segmentHtmlContainsTable(seg.html);
            });
        const next = groups[i + 1];
        const nextHasTable =
            next?.length &&
            next.some((idx) => {
                const seg = segments[idx];
                return seg && segmentHtmlContainsTable(seg.html);
            });
        const sameClause =
            g?.length &&
            next?.length &&
            segments[g[0]]?.clauseIdx != null &&
            segments[g[0]]?.clauseIdx === segments[next[0]]?.clauseIdx;
        if (onlyProse && nextHasTable && sameClause) {
            out.push([...g, ...next]);
            i += 2;
        } else {
            out.push(g);
            i += 1;
        }
    }
    return out.length ? out : groups;
}

/**
 * Greedy height split for one packed group (used when merged block still exceeds printable height).
 * @param {number[]} group
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usable
 * @returns {number[][]}
 */
function splitSegmentGroupByMergedHeight(
    group,
    measureMergedGroupPx,
    usable,
    segmentHeightsPx = null,
    options = {},
    startPageIdx = 0
) {
    if (!group?.length) return [];
    if (group.length <= 1) return [group];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    /** @type {number[][]} */
    const pages = [];
    let cur = [];
    let pageIdx = startPageIdx;
    for (const idx of group) {
        const tryGroup = [...cur, idx];
        const limit = perPage
            ? resolvePackLimitForContinuationPage(pageIdx, usable, options)
            : usable;
        const fits = groupFitsPackLimit(
            tryGroup,
            measureMergedGroupPx,
            limit,
            segmentHeightsPx,
            options,
            pageIdx
        );
        if (cur.length > 0 && !fits) {
            pages.push(cur);
            pageIdx += 1;
            cur = [idx];
        } else {
            cur = tryGroup;
        }
    }
    if (cur.length) pages.push(cur);
    return pages.length ? pages : [group];
}

/**
 * Split any group still taller than the printable area until every group fits or is a single segment.
 * @param {number[][]} groups
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function rebalanceSegmentPageGroups(
    groups,
    measureMergedGroupPx,
    usablePx,
    options = {},
    segmentHeightsPx = null
) {
    if (!groups?.length) return groups;
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    let pending = groups.map((g) => [...g]);
    for (let pass = 0; pass < 48; pass += 1) {
        /** @type {number[][]} */
        const next = [];
        let splitAny = false;
        for (let gi = 0; gi < pending.length; gi += 1) {
            const group = pending[gi];
            if (!group?.length) continue;
            const usable = perPage
                ? resolvePackLimitForContinuationPage(gi, usablePx, options)
                : resolvePackFillLimitPx(usablePx, options);
            if (
                groupFitsPackLimit(
                    group,
                    measureMergedGroupPx,
                    usable,
                    segmentHeightsPx,
                    options,
                    gi
                )
            ) {
                next.push(group);
                continue;
            }
            if (group.length <= 1) {
                next.push(group);
                continue;
            }
            const parts = splitSegmentGroupByMergedHeight(
                group,
                measureMergedGroupPx,
                usable,
                segmentHeightsPx,
                options,
                gi
            );
            if (parts.length <= 1 && parts[0]?.length === group.length) {
                const mid = Math.ceil(group.length / 2);
                next.push(group.slice(0, mid), group.slice(mid));
            } else {
                parts.forEach((p) => next.push(p));
            }
            splitAny = true;
        }
        pending = next;
        if (!splitAny) break;
    }
    return pending.length ? pending : groups;
}

/**
 * Ensure every segment index appears once and no packed group exceeds printable height.
 * @param {number[][]} groups
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
export function enforcePackedSegmentGroups(
    groups,
    indices,
    measureMergedGroupPx,
    usablePx,
    options = {},
    segmentHeightsPx = null
) {
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    const want = indices?.length ? [...indices] : [];
    const seen = new Set();
    /** @type {number[][]} */
    let result = (groups || []).map((g) => [...g]).filter((g) => g?.length);

    for (const group of result) {
        for (const idx of group) seen.add(idx);
    }
    for (const idx of want) {
        if (!seen.has(idx)) {
            if (result.length) result[result.length - 1].push(idx);
            else result.push([idx]);
            seen.add(idx);
        }
    }

    for (let pass = 0; pass < 64; pass += 1) {
        /** @type {number[][]} */
        const next = [];
        let changed = false;
        for (let gi = 0; gi < result.length; gi += 1) {
            const group = result[gi];
            if (!group?.length) continue;
            const usable = perPage
                ? resolvePackLimitForContinuationPage(gi, usablePx, options)
                : resolvePackFillLimitPx(usablePx, options);
            if (
                group.length <= 1 ||
                groupFitsPackLimit(
                    group,
                    measureMergedGroupPx,
                    usable,
                    segmentHeightsPx,
                    options,
                    gi
                )
            ) {
                next.push(group);
                continue;
            }
            const parts = splitSegmentGroupByMergedHeight(
                group,
                measureMergedGroupPx,
                usable,
                segmentHeightsPx,
                options,
                gi
            );
            if (parts.length > 1) {
                parts.forEach((p) => next.push(p));
                changed = true;
            } else {
                const mid = Math.ceil(group.length / 2);
                if (mid > 0 && mid < group.length) {
                    next.push(group.slice(0, mid), group.slice(mid));
                    changed = true;
                } else {
                    next.push(group);
                }
            }
        }
        result = next;
        if (!changed) break;
    }
    return result.length ? result : groups;
}

/**
 * Pull content from the next sheet group onto the previous when measured height still fits
 * (fixes short clause 4 + clause 5 exclusions fitting on one page).
 * @param {number[][]} groups
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 */
/** True for clause sub-heads like "4.3. Supply, Installation…" (not a list item). */
function isSubheadingLikeSegmentHtml(html) {
    const raw = String(html || '');
    if (/<li\b/i.test(raw) || /<table\b/i.test(raw)) return false;
    const plain = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain || plain.length > 220) return false;
    return /^\d+(?:\.\d+)+\.?\s+\S/.test(plain);
}

function groupEndsWithSubheading(group, segments) {
    if (!group?.length || !segments?.length) return false;
    const seg = segments[group[group.length - 1]];
    return Boolean(seg && isSubheadingLikeSegmentHtml(seg.html));
}

/**
 * If a sheet ends on a numbered subheading (4.3. …) and the next sheet continues the
 * same clause, pull following segments up — avoids a near-empty page under the heading.
 */
function fillOrphanSubheadingPageGroups(
    groups,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    if (!groups?.length || groups.length < 2 || !segments?.length) return groups || [];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    const result = groups.map((g) => [...g]);
    for (let i = 0; i < result.length - 1; i += 1) {
        if (!groupEndsWithSubheading(result[i], segments)) continue;
        const next = result[i + 1];
        if (!next?.length) continue;
        const headSeg = segments[result[i][result[i].length - 1]];
        const nextSeg = segments[next[0]];
        if (
            headSeg?.clauseIdx == null ||
            headSeg.clauseIdx !== nextSeg?.clauseIdx
        ) {
            continue;
        }
        const baseLimit = perPage
            ? resolvePackSlackLimitForContinuationPage(i, usablePx, options)
            : resolvePackFillLimitPxForFillPass(usablePx, options);
        /* Slightly freer pull after a subheading — still hard-capped by merged measure. */
        const limit = baseLimit + 24;
        let pulled = 0;
        while (next.length > 0 && pulled < 48) {
            const tryGroup = [...result[i], next[0]];
            if (
                !groupFitsPackLimit(
                    tryGroup,
                    measureMergedGroupPx,
                    limit,
                    segmentHeightsPx,
                    options,
                    i
                )
            ) {
                break;
            }
            result[i].push(next.shift());
            pulled += 1;
        }
        if (next.length === 0) {
            result.splice(i + 1, 1);
        }
    }
    /*
     * Still orphaned (heading last on page, body on next): keep heading with its body
     * by moving it to the next sheet rather than leaving a blank band under it.
     */
    for (let i = 0; i < result.length - 1; i += 1) {
        if (!groupEndsWithSubheading(result[i], segments)) continue;
        if (result[i].length <= 0) continue;
        const next = result[i + 1];
        if (!next?.length) continue;
        const headIdx = result[i][result[i].length - 1];
        const headSeg = segments[headIdx];
        const nextSeg = segments[next[0]];
        if (headSeg?.clauseIdx == null || headSeg.clauseIdx !== nextSeg?.clauseIdx) continue;
        /* Only move when the heading page would otherwise stay sparse (≤2 trailing blocks). */
        if (result[i].length > 3) continue;
        result[i].pop();
        result[i + 1] = [headIdx, ...next];
        if (result[i].length === 0) {
            result.splice(i, 1);
            i -= 1;
        }
    }
    return result.filter((g) => g.length > 0);
}

export function fillSegmentPageGroupsSlack(
    groups,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    if (!groups?.length || groups.length < 2) return groups || [];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    /** @type {number[][]} */
    const result = groups.map((g) => [...g]);
    let changed = true;
    let guard = 0;
    /* fastAlign: bounded pull-up sweeps — enough to clear blank bands without multi-second packs. */
    const maxGuard = options?.fastAlign
        ? Math.max(result.length * 12, 48)
        : result.length * 40;
    while (changed && guard < maxGuard) {
        guard += 1;
        changed = false;
        for (let i = 0; i < result.length - 1; i++) {
            const next = result[i + 1];
            if (!next?.length) continue;

            const orphanHead = groupEndsWithSubheading(result[i], segments);
            const limitBase = perPage
                ? resolvePackSlackLimitForContinuationPage(i, usablePx, options)
                : resolvePackFillLimitPxForFillPass(usablePx, options);
            const limit = orphanHead ? limitBase + 36 : limitBase;
            const mergedAll = [...result[i], ...next];
            if (
                groupFitsPackLimit(
                    mergedAll,
                    measureMergedGroupPx,
                    limit,
                    segmentHeightsPx,
                    options,
                    i
                )
            ) {
                result[i] = mergedAll;
                result.splice(i + 1, 1);
                changed = true;
                continue;
            }

            while (next.length > 0) {
                const nextIdx = next[0];
                const tryGroup = [...result[i], nextIdx];
                if (
                    groupFitsPackLimit(
                        tryGroup,
                        measureMergedGroupPx,
                        limit,
                        segmentHeightsPx,
                        options,
                        i
                    )
                ) {
                    result[i].push(next.shift());
                    changed = true;
                    continue;
                }
                break;
            }
            if (next.length === 0) {
                result.splice(i + 1, 1);
                changed = true;
            }
        }
    }
    return fillOrphanSubheadingPageGroups(
        result.filter((g) => g.length > 0),
        measureMergedGroupPx,
        usablePx,
        segments,
        options,
        segmentHeightsPx
    );
}

/**
 * Short clause tables (Terms: Delivery / Validity / Payment / Warranty) are 2 columns.
 * A last row that "fits" the limit still paints into the footer and overflow:hidden
 * hides it. Wide BOQ schedules are left to the normal limit so pages stay dense.
 * @param {{ html?: string } | null | undefined} seg
 */
function segmentIsFooterClipRiskRow(seg) {
    const html = String(seg?.html || '');
    if (!/data-ems-table-split\s*=\s*["']?1/i.test(html)) return false;
    const widthAttr = html.match(/data-ems-col-widths=["']([^"']+)["']/i);
    if (widthAttr) {
        const n = widthAttr[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean).length;
        if (n >= 4) return false;
    }
    const colTags = html.match(/<col\b/gi);
    if (colTags && colTags.length >= 4) return false;
    return true;
}

/**
 * Move trailing segments off pages that still measure over the limit so content
 * continues on the next sheet instead of being clipped into the footer.
 *
 * IMPORTANT: never peel from sum-of-fragment heights for row-split tables — each
 * fragment carries a thead, so the sum wildly overestimates and leaves half-empty
 * pages (Total/VAT on page N, Grand Total alone on N+1). Use rejoined merged measure.
 */
export function peelOverfullPageGroups(
    groups,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    if (!groups?.length) return groups || [];
    const perPage = typeof options?.usablePxForContinuationPage === 'function';
    /** @type {number[][]} */
    const result = groups.map((g) => [...g]);
    let guard = 0;
    const maxGuard = Math.max(result.length * 24, 96);
    /* Zero noise — any overshoot must peel so overflow:hidden never hides units. */
    const peelNoisePx = 0;
    while (guard < maxGuard) {
        guard += 1;
        let peeled = false;
        for (let i = 0; i < result.length; i += 1) {
            const group = result[i];
            if (!group?.length || group.length <= 1) continue;
            const limit = perPage
                ? resolvePackLimitForContinuationPage(i, usablePx, options)
                : resolvePackFillLimitPx(usablePx, options);
            const pageIdx = i;
            /*
             * Peel ONLY when rejoined content truly exceeds the content box.
             * Sum-of-segment peels double-counted list/clause margins and emptied
             * pages that still painted fine (enquiry 1515 half-empty sheets).
             */
            const merged =
                typeof measureMergedGroupPx === 'function'
                    ? measureMergedGroupPx(group, pageIdx)
                    : 0;
            const overMerged = merged > 0 && merged > limit + peelNoisePx;
            const overClip =
                typeof options?.overflowTestForPage === 'function' &&
                options.overflowTestForPage(i, group);
            if (!overMerged && !overClip) continue;

            /* Peel last segment onto the next page (create page if needed). */
            const moved = group.pop();
            if (moved == null) continue;
            if (i + 1 < result.length) {
                result[i + 1] = [moved, ...result[i + 1]];
            } else {
                result.push([moved]);
            }
            if (!group.length) {
                result.splice(i, 1);
            }
            peeled = true;
            break;
        }
        if (!peeled) break;
    }
    return result.filter((g) => g.length > 0);
}

/** @deprecated use peelOverfullPageGroups */
function peelOverfullSplitTableGroups(
    groups,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    return peelOverfullPageGroups(
        groups,
        measureMergedGroupPx,
        usablePx,
        segments,
        options,
        segmentHeightsPx
    );
}

/**
 * Pack clause segments onto continuation sheets (one .quote-a4-sheet per returned group).
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 * @param {ClauseSegment[]} segments
 */
/** Table body row that is a section label (e.g. "General") — keep with the next data row. */
function isTableSectionHeaderSegmentHtml(html) {
    const raw = String(html || '');
    if (!/data-ems-table-split\s*=\s*["']?1/i.test(raw)) return false;
    const plain = raw
        .replace(/<thead\b[\s\S]*?<\/thead>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain || plain.length > 48) return false;
    return /^(general|notes?|scope|exclusions?|assumptions?|terms?)\s*:?$/i.test(plain);
}

/** Note label(+first bullet) block — never leave it alone without its bullet. */
function isBoqNoteKeepSegmentHtml(html) {
    return /data-ems-boq-note\s*=\s*["']?1/i.test(String(html || ''));
}

/**
 * Keep-with applies only when the current unit does NOT already carry body content
 * (heading-only) OR is a table section / Note label that must glue the next row/bullet.
 * Gluing an extra segment onto showHeading segments that already include the first
 * body unit deferred Payment/OHS/References and left 40–110mm gaps (9-sheet regression).
 */
function segmentNeedsKeepWithNext(seg) {
    if (!seg) return false;
    if (isTableSectionHeaderSegmentHtml(seg.html)) return true;
    if (isBoqNoteKeepSegmentHtml(seg.html) && /data-ems-keep-with-next/i.test(String(seg.html || ''))) {
        /* Note block already includes first bullet — do not glue yet another unit. */
        return false;
    }
    if (!seg.showHeading) return false;
    const plain = String(seg.html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();
    /* Heading flag with no/minimal body — glue the real first unit. */
    return plain.length < 8;
}

/**
 * After greedy pack / live peel: never leave a heading (or General sub-header) alone
 * at the bottom. Move it onto the next sheet with its keep-with content.
 */
export function keepHeadingsWithFollowingContent(groups, segments) {
    if (!groups?.length || groups.length < 2 || !segments?.length) return groups || [];
    const result = groups.map((g) => [...g]);
    for (let i = 0; i < result.length - 1; i += 1) {
        const cur = result[i];
        if (!cur?.length) continue;
        const lastIdx = cur[cur.length - 1];
        const last = segments[lastIdx];
        const next = result[i + 1];
        if (!next?.length || !last) continue;
        const nextSeg = segments[next[0]];
        const sameClause =
            last.clauseIdx != null && nextSeg?.clauseIdx === last.clauseIdx;
        if (!sameClause) continue;
        const isClauseHead = Boolean(last.showHeading);
        const isSub = groupEndsWithSubheading(cur, segments);
        const isSectionRow = isTableSectionHeaderSegmentHtml(last.html);
        const headHasBody = String(last.html || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim().length >= 8;
        /*
         * Only move a true orphan heading (no body yet) or a General sub-header.
         * Moving a heading segment that already includes the first body unit opened
         * large blank bands on the previous sheet.
         */
        if (isSectionRow || isSub || (isClauseHead && !headHasBody)) {
            cur.pop();
            result[i + 1] = [lastIdx, ...next];
            if (!cur.length) {
                result.splice(i, 1);
                i -= 1;
            }
        }
    }
    return result.filter((g) => g.length > 0);
}

/** Drop leading blank spacer segments on a sheet (split artifact, not user intent at page top). */
function trimLeadingBlankSegmentsOnPages(groups, segments) {
    if (!groups?.length || !segments?.length) return groups || [];
    return groups
        .map((g, pageIdx) => {
            if (!g?.length || pageIdx === 0) return g;
            let start = 0;
            while (start < g.length) {
                const html = String(segments[g[start]]?.html || '');
                const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                const isBlank =
                    !plain &&
                    !segments[g[start]]?.showHeading &&
                    (/<br\s*\/?>/i.test(html) || /&nbsp;/i.test(html) || !html.trim());
                if (!isBlank) break;
                start += 1;
            }
            return start > 0 ? g.slice(start) : g;
        })
        .filter((g) => g.length > 0);
}

/**
 * Cheap integrity: every segment index appears exactly once.
 * @returns {{ ok: boolean, missing: number[], dupes: number[] }}
 */
export function assertSegmentPageGroupsIntegrity(groups, segmentCount) {
    const n = Math.max(0, segmentCount | 0);
    const seen = new Map();
    for (const g of groups || []) {
        for (const idx of g || []) {
            seen.set(idx, (seen.get(idx) || 0) + 1);
        }
    }
    /** @type {number[]} */
    const missing = [];
    /** @type {number[]} */
    const dupes = [];
    for (let i = 0; i < n; i += 1) {
        const c = seen.get(i) || 0;
        if (c === 0) missing.push(i);
        else if (c > 1) dupes.push(i);
    }
    return { ok: missing.length === 0 && dupes.length === 0, missing, dupes };
}

/** UI-only nodes that must never trip the pagination integrity gate. */
const PACK_GATE_UI_ONLY_SEL = [
    '.quote-content-area-mark',
    '.ems-table-col-resizer',
    '.ems-table-row-resizer',
    '.jodit-table-resizer',
    '.jodit-popup',
    '.jodit-dialog',
    '.jodit-toolbar',
    '.quote-preview-clause-edit-bar',
    '[role="alert"]',
    '.quote-digital-signature-stamp',
].join(', ');

function isPackGateUiOnlyElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest?.(PACK_GATE_UI_ONLY_SEL)) return true;
    if (el.classList?.contains?.('no-print')) return true;
    return false;
}

/** Preview zoom from .quote-preview-zoom-shell (1 when unzoomed). */
export function getQuotePreviewZoomFactor(el) {
    try {
        const shell = el?.closest?.('.quote-preview-zoom-shell');
        if (!shell) return 1;
        const cssVar = parseFloat(shell.style?.getPropertyValue?.('--quote-preview-zoom') || '');
        if (Number.isFinite(cssVar) && cssVar > 0.05) return cssVar;
        const t = typeof window !== 'undefined' ? window.getComputedStyle?.(shell)?.transform || '' : '';
        if (t && t !== 'none') {
            const m = t.match(/matrix\(([^)]+)\)/);
            if (m) {
                const a = parseFloat(String(m[1]).split(',')[0]);
                if (Number.isFinite(a) && a > 0.05) return a;
            }
        }
    } catch {
        /* ignore */
    }
    return 1;
}

/**
 * Shared fit measurement for packer + integrity gate.
 * Uses CSS/layout px (zoom-corrected from getBoundingClientRect).
 * Ignores UI-only elements. Fit = last real unit bottom from content top <= usable - reserve.
 *
 * @returns {{
 *   ok: boolean,
 *   usablePx: number,
 *   limitPx: number,
 *   zoom: number,
 *   scrollHeight: number,
 *   clientHeight: number,
 *   lastBottomPx: number,
 *   failures: Array<{
 *     seg: number,
 *     bottomPx: number,
 *     overshootPx: number,
 *     tag: string,
 *     reason: string,
 *     measurement: string,
 *   }>,
 * }}
 */
export function measureLiveContentFit(contentEl, options = {}) {
    const usable = Number.isFinite(options.usablePx)
        ? options.usablePx
        : EMS_QUOTE_CONT_USABLE_PX_FALLBACK;
    const reserve = Number.isFinite(options.reservePx)
        ? options.reservePx
        : PACK_HEIGHT_SAFETY_PX;
    const limitPx = Math.max(usable - reserve, 200);
    const empty = {
        ok: true,
        usablePx: usable,
        limitPx,
        zoom: 1,
        scrollHeight: 0,
        clientHeight: usable,
        lastBottomPx: 0,
        failures: [],
    };
    if (!contentEl || typeof contentEl.getBoundingClientRect !== 'function') return empty;

    /*
     * Temporarily unclip so getBoundingClientRect reports true bottoms of units that
     * overflow:hidden was truncating to the box edge (false "ok").
     */
    /** @type {{ overflow: string, maxHeight: string } | null} */
    let restoreClip = null;
    if (options.unclippedMeasure !== false) {
        try {
            restoreClip = {
                overflow: contentEl.style.overflow || '',
                maxHeight: contentEl.style.maxHeight || '',
            };
            contentEl.style.overflow = 'visible';
            contentEl.style.maxHeight = 'none';
        } catch {
            restoreClip = null;
        }
    }

    try {
        const zoom = Math.max(getQuotePreviewZoomFactor(contentEl) || 1, 0.05);
        const cRect = contentEl.getBoundingClientRect();
        const scrollHeight = contentEl.scrollHeight || 0;
        const clientHeight = contentEl.clientHeight || 0;

        const stamped = [...contentEl.querySelectorAll('[data-ems-pack-seg]')].filter(
            (el) => !isPackGateUiOnlyElement(el)
        );
        const blocks = [...contentEl.querySelectorAll('.quote-clause-block')].filter(
            (el) => !isPackGateUiOnlyElement(el)
        );
        const nodes = stamped.length ? stamped : blocks;

        /** @type {typeof empty.failures} */
        const failures = [];
        let lastBottomPx = 0;
        const eps = 1.5;

        nodes.forEach((el) => {
            const r = el.getBoundingClientRect();
            /* Convert zoomed viewport px → layout/CSS px (same space as usablePx / packer). */
            const topPx = (r.top - cRect.top) / zoom;
            const bottomPx = (r.bottom - cRect.top) / zoom;
            const heightPx = r.height / zoom;
            if (heightPx < 1 && r.width / zoom < 1) return;
            if (bottomPx > lastBottomPx) lastBottomPx = bottomPx;
            const segAttr = el.getAttribute('data-ems-pack-seg');
            const seg = segAttr != null ? parseInt(segAttr, 10) : -1;
            const tag = `${el.tagName?.toLowerCase?.() || '?'}${el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : ''}`;
            if (bottomPx > limitPx + eps) {
                failures.push({
                    seg,
                    bottomPx: Math.round(bottomPx * 10) / 10,
                    overshootPx: Math.round((bottomPx - limitPx) * 10) / 10,
                    tag,
                    reason: 'extends-below-content-end-reserve',
                    measurement: `getBoundingClientRect.bottom/zoom (zoom=${zoom.toFixed(3)})`,
                });
            } else if (topPx >= limitPx - eps) {
                failures.push({
                    seg,
                    bottomPx: Math.round(bottomPx * 10) / 10,
                    overshootPx: Math.round((bottomPx - limitPx) * 10) / 10,
                    tag,
                    reason: 'fully-below-content-end',
                    measurement: `getBoundingClientRect.top/zoom (zoom=${zoom.toFixed(3)})`,
                });
            } else if (topPx < -eps) {
                failures.push({
                    seg,
                    bottomPx: Math.round(bottomPx * 10) / 10,
                    overshootPx: Math.round((-topPx) * 10) / 10,
                    tag,
                    reason: 'extends-above-content-start',
                    measurement: `getBoundingClientRect.top/zoom (zoom=${zoom.toFixed(3)})`,
                });
            }
        });

        /*
         * scrollHeight is layout px (not zoomed). Compare to usable-reserve — NOT to
         * clientHeight alone (DEV overflow:visible + flex max-height caused false fails).
         */
        if (scrollHeight > limitPx + 2 && failures.length === 0 && nodes.length === 0) {
            failures.push({
                seg: -1,
                bottomPx: scrollHeight,
                overshootPx: scrollHeight - limitPx,
                tag: 'content-section',
                reason: 'content-scrollHeight-exceeds-limit',
                measurement: 'scrollHeight vs usable-reserve',
            });
        } else if (scrollHeight > limitPx + 8 && lastBottomPx <= limitPx + eps) {
            /* Stamped units fit but scrollHeight is tall — usually padding/UI; do not fail. */
        } else if (scrollHeight > limitPx + 8 && lastBottomPx > limitPx + eps) {
            /* Already covered by unit failures. */
        }

        return {
            ok: failures.length === 0,
            usablePx: usable,
            limitPx,
            zoom,
            scrollHeight,
            clientHeight,
            lastBottomPx: Math.round(lastBottomPx * 10) / 10,
            failures,
        };
    } finally {
        if (restoreClip) {
            try {
                contentEl.style.overflow = restoreClip.overflow;
                contentEl.style.maxHeight = restoreClip.maxHeight;
            } catch {
                /* ignore */
            }
        }
    }
}

/**
 * Visibility-aware integrity: each packed unit must be fully inside its sheet
 * content box (layout px: bottom <= usable - reserve). Zoom-corrected.
 * Ignores UI-only elements (resizers, CONTENT END marks, Jodit chrome, banners).
 * @returns {{ ok: boolean, clipped: Array<object>, missing: number[], dupes: number[], diagnostics?: object[] }}
 */
export function assertSegmentVisibilityOnSheets(
    previewRoot,
    groups,
    segmentCount,
    options = {}
) {
    const base = assertSegmentPageGroupsIntegrity(groups, segmentCount);
    /** @type {Array<object>} */
    const clipped = [];
    /** @type {object[]} */
    const diagnostics = [];
    if (!previewRoot || typeof previewRoot.querySelectorAll !== 'function') {
        return { ...base, clipped, diagnostics, ok: base.ok };
    }
    const reserve = Number.isFinite(options.reservePx)
        ? options.reservePx
        : PACK_HEIGHT_SAFETY_PX;
    const usableFallback = Number.isFinite(options.usablePx)
        ? options.usablePx
        : EMS_QUOTE_CONT_USABLE_PX_FALLBACK;
    const contSheets = [
        ...previewRoot.querySelectorAll(
            '.quote-a4-sheet--continuation:not(.quote-a4-sheet--clause-editing)'
        ),
    ];
    /** @type {Set<number>} */
    const paintedSegs = new Set();
    contSheets.forEach((sheet, si) => {
        const content = sheet.querySelector('.content-section');
        if (!content) return;
        content.querySelectorAll('[data-ems-pack-seg]').forEach((el) => {
            const n = parseInt(el.getAttribute('data-ems-pack-seg') || '', 10);
            if (Number.isInteger(n) && n >= 0) paintedSegs.add(n);
        });
        const usable = sheet.classList.contains('quote-a4-sheet--landscape')
            ? quoteContinuationContentPx(true)
            : usableFallback;
        const fit = measureLiveContentFit(content, {
            usablePx: usable,
            reservePx: reserve,
            /* Always unclip so overflow:hidden cannot hide true bottoms. */
            unclippedMeasure: true,
        });
        diagnostics.push({
            sheet: si + 1,
            zoom: fit.zoom,
            usablePx: fit.usablePx,
            limitPx: fit.limitPx,
            lastBottomPx: fit.lastBottomPx,
            scrollHeight: fit.scrollHeight,
            clientHeight: fit.clientHeight,
            failureCount: fit.failures.length,
        });
        fit.failures.forEach((f) => {
            clipped.push({
                seg: f.seg,
                sheet: si + 1,
                reason: f.reason,
                bottomPx: f.bottomPx,
                overshootPx: f.overshootPx,
                tag: f.tag,
                measurement: f.measurement,
                limitPx: fit.limitPx,
            });
        });
    });

    /* Packed indices that never painted (skipped sheet / bad rejoin) = missing content.
     * Only when stamping is active (some [data-ems-pack-seg] exist) — avoid false fails.
     * Skip blank units (they intentionally have no stamp). */
    /** @type {number[]} */
    const missingFromDom = [];
    const segments = options.segments || null;
    if (paintedSegs.size > 0) {
        const expected = new Set((groups || []).flat());
        expected.forEach((idx) => {
            if (paintedSegs.has(idx)) return;
            if (segments) {
                const plain = String(segments[idx]?.html || '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .replace(/\u00a0/g, ' ')
                    .trim();
                if (!plain) return;
            }
            missingFromDom.push(idx);
        });
        missingFromDom.sort((a, b) => a - b);
    }

    const isDev =
        typeof import.meta !== 'undefined' &&
        Boolean(import.meta.env?.DEV);
    if (isDev && (clipped.length || missingFromDom.length)) {
        console.info(
            '[EMS pack gate] failing units',
            clipped.map((c) => ({
                sheet: c.sheet,
                unitId: c.seg,
                bottomPx: c.bottomPx,
                limitPx: c.limitPx,
                overshootPx: c.overshootPx,
                element: c.tag,
                measurement: c.measurement,
                reason: c.reason,
            }))
        );
        if (missingFromDom.length) {
            console.info('[EMS pack gate] missing from DOM', missingFromDom);
        }
        console.info('[EMS pack gate] per-sheet', diagnostics);
    }

    const missing = [...new Set([...(base.missing || []), ...missingFromDom])].sort(
        (a, b) => a - b
    );
    return {
        ok: base.ok && clipped.length === 0 && missingFromDom.length === 0,
        missing,
        missingFromDom,
        dupes: base.dupes,
        clipped,
        diagnostics,
    };
}

/**
 * Deterministic pack: greedy place by measured unit heights, then verify-down only.
 * NEVER pulls content up after the first placement (fill/slack was hiding units).
 */
export function packClauseSegmentsForContinuationPages(
    indices,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    if (!indices?.length) return [];
    const packOpts = {
        ...options,
        segments,
        tightFit: false,
        fastAlign: true,
        /* Disable sum/estimate fast-paths that understate height and overpack. */
        preferMergedOnly: true,
    };
    const safety = Number.isFinite(options.packSafetyPx)
        ? Math.max(0, options.packSafetyPx)
        : PACK_HEIGHT_SAFETY_PX;
    const limit = Math.max((usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK) - safety, 200);

    /*
     * Phase 1 — greedy by per-unit heights (measured once by caller).
     * Prefer segmentHeightsPx; fall back to compact estimates only when missing.
     */
    const heights =
        segmentHeightsPx?.length === (segments?.length || 0)
            ? segmentHeightsPx.map((h) => Math.max(h || 0, 1))
            : compactPackHeightsPx(segments, segmentHeightsPx);

    /** @type {number[][]} */
    const pages = [];
    /** @type {number[]} */
    let cur = [];
    let sum = 0;
    let pageSplitId = '';
    const SPLIT_THEAD = 30;

    const cost = (idx, splitId) => {
        let h = Math.max(heights[idx] || 0, 1);
        const html = String(segments[idx]?.html || '');
        const sid = readEmsSplitIdFromHtml(html);
        if (sid && sid !== splitId) h += SPLIT_THEAD;
        return { h, sid };
    };

    for (let ii = 0; ii < indices.length; ii += 1) {
        const idx = indices[ii];
        const { h, sid } = cost(idx, pageSplitId);
        const seg = segments[idx];
        const nextIdx = indices[ii + 1];
        const nextSeg = nextIdx != null ? segments[nextIdx] : null;
        /*
         * Keep-with-next (same clause): only for heading-only / General row units.
         * Cap follow to ~2 lines (48px) or first table row (56px). Never glue a tall
         * next clause-row onto a showHeading segment that already carries body HTML —
         * that deferred Payment/OHS and left 40–70mm gaps (9-sheet regression).
         */
        const keepWithNext =
            segmentNeedsKeepWithNext(seg) &&
            nextSeg &&
            nextSeg.clauseIdx === seg.clauseIdx;
        let followH = 0;
        let followSid = '';
        let glueFollow = false;
        if (keepWithNext) {
            const followCost = cost(nextIdx, sid || pageSplitId);
            const cap = segmentHtmlContainsTable(nextSeg.html) ? 56 : 48;
            followH = followCost.h;
            followSid = followCost.sid || '';
            /* Only glue when the next unit is already a small "first 2 lines / first row". */
            glueFollow = followH <= cap + 16;
            if (!glueFollow) followH = 0;
        }
        const placeH = h + (glueFollow ? followH : 0);
        if (cur.length > 0 && sum + placeH > limit) {
            pages.push(cur);
            cur = [];
            sum = 0;
            pageSplitId = '';
            const again = cost(idx, '');
            cur.push(idx);
            sum = again.h;
            pageSplitId = again.sid || '';
            if (glueFollow) {
                const followAgain = cost(nextIdx, pageSplitId);
                cur.push(nextIdx);
                sum += followAgain.h;
                if (followAgain.sid) pageSplitId = followAgain.sid;
                ii += 1;
            }
            continue;
        }
        cur.push(idx);
        sum += h;
        if (sid) pageSplitId = sid;
        if (glueFollow) {
            cur.push(nextIdx);
            sum += followH;
            if (followSid) pageSplitId = followSid;
            ii += 1;
        }
    }
    if (cur.length) pages.push(cur);

    let groups = pages.filter((g) => g.length > 0);
    groups = keepHeadingsWithFollowingContent(groups, segments);

    /*
     * Phase 2 — verify DOWN only (max 3 sweeps). Move last unit to next sheet when
     * rejoined measure exceeds the content box. Never pull content back up.
     */
    for (let sweep = 0; sweep < 3; sweep += 1) {
        const before = groups.map((g) => g.join(',')).join('|');
        groups = peelOverfullPageGroups(
            groups,
            measureMergedGroupPx,
            usablePx,
            segments,
            packOpts,
            heights
        );
        groups = keepHeadingsWithFollowingContent(groups, segments);
        const after = groups.map((g) => g.join(',')).join('|');
        if (before === after) break;
    }

    groups = trimLeadingBlankSegmentsOnPages(groups, segments);
    groups = ensureSegmentPageGroupsCoverAll(groups, segments.length);

    const integrity = assertSegmentPageGroupsIntegrity(groups, segments.length);
    if (!integrity.ok) {
        console.error('[EMS pack] segment integrity failed — retrying with larger safety', integrity);
        /* One scratch re-pack with larger safety (no fill-up). */
        const limit2 = Math.max(limit - 40, 160);
        /** @type {number[][]} */
        const pages2 = [];
        let c2 = [];
        let s2 = 0;
        let split2 = '';
        for (const idx of indices) {
            const { h, sid } = cost(idx, split2);
            if (c2.length > 0 && s2 + h > limit2) {
                pages2.push(c2);
                c2 = [];
                s2 = 0;
                split2 = '';
                const again = cost(idx, '');
                c2.push(idx);
                s2 = again.h;
                split2 = again.sid || '';
                continue;
            }
            c2.push(idx);
            s2 += h;
            if (sid) split2 = sid;
        }
        if (c2.length) pages2.push(c2);
        groups = keepHeadingsWithFollowingContent(
            pages2.filter((g) => g.length > 0),
            segments
        );
        groups = peelOverfullPageGroups(
            groups,
            measureMergedGroupPx,
            usablePx,
            segments,
            packOpts,
            heights
        );
        groups = trimLeadingBlankSegmentsOnPages(groups, segments);
        groups = ensureSegmentPageGroupsCoverAll(groups, segments.length);
    }

    return groups.filter((group) => {
        if (!group?.length) return false;
        return group.some((idx) => {
            const seg = segments[idx];
            return seg && String(seg.html || '').trim().length > 0;
        });
    });
}

/** @deprecated Reserved in pack safety only — do not subtract from usable height (causes blank pages). */
export const EMS_QUOTE_PRINT_CONTENT_FOOTER_GAP_PX = 0;

/** Representative footer HTML so pack measure reserves the same band as rendered sheets. */
export function buildQuotePackMeasureFooterHtml(minHeight = '96px') {
    return `<div class="footer-section" style="width:100%;min-height:${minHeight};box-sizing:border-box;padding-top:3px;display:flex;flex-direction:column;align-items:stretch">
        <div class="quote-print-page-indicator" style="font-size:11px;font-weight:600;color:#64748b;padding-bottom:3px">Page 1 of 5</div>
        <hr class="quote-section-rule" style="margin:1px 0 1.5px;border:0;border-top:0.35px solid #94a3b8;height:0;width:100%" aria-hidden="true"/>
        <div class="quote-print-footer-wrap" style="display:block;width:50%;max-width:50%;margin-left:auto;text-align:right;box-sizing:border-box">
            <div class="quote-print-footer-company" style="font-size:11px;line-height:1.1;color:#64748b">
                <div>Sample Company W.L.L.</div>
                <div>CR No.: sample PO Box sample, Building sample, Road sample, Manama, Kingdom of Bahrain</div>
                <div>Tel: sample | Fax: sample</div>
            </div>
        </div>
    </div>`;
}

/**
 * Prose height from line count. Ignore baked row-heights here — those values
 * were treating a short paragraph as a full page and leaving the rest blank.
 * Blank lines the user typed still count as lines.
 * @param {{ showHeading?: boolean } | null | undefined} seg
 * @param {string} html
 * @returns {number | null}
 */
function estimateProseSegmentPx(seg, html) {
    /* Split BOQ rows stay on the compact row cost. A line-count here was leaving a gap under the table. */
    if (/data-ems-table-split\s*=\s*["']?1/i.test(html)) return null;
    const rows = (html.match(/<tr\b/gi) || []).length;
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    /* A short Word table around one paragraph is still prose. Tall row-heights were opening a new page. */
    if (/<table\b/i.test(html) && (rows > 4 || plain.length > 900)) return null;
    const paras = (html.match(/<p\b/gi) || []).length;
    const listItems = (html.match(/<li\b/gi) || []).length;
    const breaks = (html.match(/<br\s*\/?>/gi) || []).length;
    const linesFromText = Math.max(1, Math.ceil(plain.length / 90));
    /* Empty <br> and extra <p> tags were counted as full lines and closed the page early. */
    const lines = Math.max(
        linesFromText,
        Math.min(paras || 0, linesFromText + 1),
        Math.min(listItems || 0, linesFromText + 1),
        Math.min(breaks || 0, linesFromText)
    );
    let h = lines * 18 + 6;
    if (seg?.showHeading) h += 32;
    if (listItems) h += 4;
    /* Keep prose cheap so short Terms / Programme clauses cannot reserve a half page. */
    return Math.min(96, Math.max(plain ? 22 : 14, h));
}

/**
 * Rough per-segment height from HTML size (tables/lists weigh more than prose).
 * Split table row fragments (`data-ems-table-split`) must stay compact: the old
 * plain*0.42 + table*80 formula treated each 1-row mini-table as ~180px, so a
 * 7–10 row pricing/BOQ table exploded across 3–4 pages with large whitespace.
 * @param {ClauseSegment[]} segments
 */
export function estimateSegmentBlockHeightsPx(segments) {
    return (segments || []).map((seg) => {
        const html = String(seg?.html || '');
        const proseH = estimateProseSegmentPx(seg, html);
        if (proseH != null) return proseH;
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/data-ems-table-split\s*=\s*["']?1/i.test(html)) {
            /*
             * Prefer sliced data-ems-row-heights (thead…, body). Charge body only —
             * thead is shared after rejoin; counting it per row left pages half-empty
             * and pushed Total/VAT/payment lines to the next sheet.
             */
            const heightAttr = html.match(/data-ems-row-heights\s*=\s*["']([^"']+)["']/i);
            if (heightAttr) {
                const parts = String(heightAttr[1])
                    .split(',')
                    .map((s) => parseFloat(String(s).trim()) || 0)
                    .filter((n) => n > 0);
                const bodyH = parts.length ? parts[parts.length - 1] : 0;
                if (bodyH > 0) {
                    let h = Math.round(bodyH + 6);
                    if (seg?.showHeading) h += 36;
                    return Math.min(160, Math.max(28, h));
                }
            }
            const bodyPlain = plain
                .replace(/\bSl\.?\s*No\.?\b/gi, ' ')
                .replace(/\bDescription\b/gi, ' ')
                .replace(/\bAmount\s*\([^)]*\)/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const chars = Math.min((bodyPlain || plain).length, 240);
            let h = 28 + Math.round(chars * 0.2);
            if (seg?.showHeading) h += 36;
            return Math.min(140, Math.max(28, h));
        }
        /* Prefer baked row-height sum for intact pricing/BOQ tables (accurate + compact). */
        const heightAttr = html.match(/data-ems-row-heights\s*=\s*["']([^"']+)["']/i);
        if (heightAttr) {
            const sum = String(heightAttr[1])
                .split(',')
                .reduce((acc, s) => acc + (parseFloat(String(s).trim()) || 0), 0);
            if (sum > 0) {
                let h = Math.round(sum + 12);
                if (seg?.showHeading) h += 32;
                /*
                 * Excel row locks on a short paragraph were larger than the painted
                 * text, so the next clause started on a new page under a blank band.
                 */
                const rowCountHere = (html.match(/<tr\b/gi) || []).length;
                const rowFloor = Math.max(rowCountHere, 1) * 28 + (seg?.showHeading ? 36 : 0);
                const textH = Math.max(rowFloor, Math.ceil((plain.length || 1) / 80) * 20 + 12);
                if (plain.length < 1500 && h > textH * 1.8) h = textH;
                return Math.min(3200, Math.max(48, h));
            }
        }
        const listCount = (html.match(/<li\b/gi) || []).length;
        /* One list-item segment (paginated OL/UL) — multi-line Terms bullets need real height. */
        if (listCount === 1 && /<(?:ul|ol)\b/i.test(html)) {
            let h = 16 + Math.round(Math.min(plain.length, 320) * 0.22);
            if (seg?.showHeading) h += 32;
            return Math.min(160, Math.max(18, h));
        }
        const tableCount = (html.match(/<table\b/gi) || []).length;
        const rowCount = (html.match(/<tr\b/gi) || []).length;
        let h = Math.round(Math.min(plain.length, 600) * 0.22 + 22);
        h += tableCount * 36;
        h += Math.max(0, rowCount - tableCount * 3) * 16;
        h += listCount * 12;
        if (seg?.showHeading) h += 32;
        return Math.min(3200, Math.max(22, h));
    });
}

/** @param {string} html */
/**
 * One-line BOQ rows stay at 34px so a table split still fills the page.
 * A wrapped terms row (Payment 7.01 is several lines) must reserve that height,
 * or the following rows are painted past the content-end line and clipped.
 * @param {string} html
 */
function splitPackBodyPx(html) {
    const plain = String(html || '')
        .replace(/<thead\b[\s\S]*?<\/thead>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const lines = Math.max(1, Math.ceil(plain.length / 72));
    /* A second line must be reserved. Pricing it as one line pushed 2.01 through the content end and hid it. */
    if (lines <= 1) return 34;
    return Math.min(200, lines * 22 + 8);
}

function readEmsSplitIdFromHtml(html) {
    const m = String(html || '').match(/data-ems-split-id\s*=\s*["']([^"']+)["']/i);
    return m ? String(m[1] || '').trim() : '';
}

/**
 * Cap runaway Excel-baked row px for pack math only (does not rewrite table HTML).
 * Short BOQ lines are ~28–40px; 112px still left half-empty sheets (~7 rows/page).
 */
const PACK_MAX_SPLIT_BODY_ROW_PX = 44;
const PACK_MAX_SPLIT_THEAD_ROW_PX = 36;

/**
 * Body / thead px from sliced `data-ems-row-heights` on a 1-row split fragment.
 * @param {string} html
 * @returns {{ bodyH: number, theadH: number }}
 */
function readSplitFragmentRowHeightsPx(html) {
    const m = String(html || '').match(/data-ems-row-heights\s*=\s*["']([^"']+)["']/i);
    if (!m) return { bodyH: 40, theadH: 28 };
    const parts = String(m[1])
        .split(',')
        .map((s) => parseFloat(String(s).trim()) || 0);
    const positive = parts.filter((n) => n > 0);
    if (!positive.length) return { bodyH: 40, theadH: 28 };
    if (positive.length === 1) {
        return {
            bodyH: Math.min(positive[0], PACK_MAX_SPLIT_BODY_ROW_PX),
            theadH: 28,
        };
    }
    const bodyH = Math.min(positive[positive.length - 1], PACK_MAX_SPLIT_BODY_ROW_PX);
    const theadH = Math.min(
        positive.slice(0, -1).reduce((a, b) => a + b, 0) || 28,
        PACK_MAX_SPLIT_THEAD_ROW_PX
    );
    return { bodyH, theadH };
}

/**
 * Thead charged once per page for row-split BOQ/pricing fragments.
 * @param {number[]} group
 * @param {number[] | null} segmentHeightsPx
 * @param {ClauseSegment[] | null} segments
 */
function estimateSplitTableGroupHeightPx(group, segmentHeightsPx, segments) {
    if (!group?.length || !segments?.length) return 0;
    const BODY = 34;
    const THEAD = 30;
    let sum = 0;
    let chargedTheadFor = '';
    for (const gi of group) {
        const seg = segments[gi];
        const html = String(seg?.html || '');
        const splitId = readEmsSplitIdFromHtml(html);
        if (!splitId) {
            sum += Math.max(segmentHeightsPx?.[gi] || 0, 1);
            continue;
        }
        const headingH = seg?.showHeading ? 40 : 0;
        if (chargedTheadFor !== splitId) {
            sum += THEAD + headingH;
            chargedTheadFor = splitId;
        } else if (headingH) {
            sum += headingH;
        }
        sum += BODY + 4;
    }
    return Math.round(sum);
}

/**
 * Pack segments onto pages. Row-split tables (`data-ems-table-split`) pack by baked
 * row heights with thead charged once per page — not once per fragment — so a
 * 10-row pricing table fills one sheet instead of 1-row-per-page with blank space.
 * @param {ClauseSegment[]} segments
 * @param {number} usablePx
 */
/**
 * Pull following segments onto pages with leftover estimate height
 * (e.g. last Scope bullet alone → Pricing heading + first table rows).
 */
function fillEstimatedPageGroupsByHeights(pages, segmentHeightPx, limit, segments = null) {
    if (!pages?.length || pages.length < 2 || !segmentHeightPx?.length) return pages || [];
    const result = pages.map((g) => [...g]);
    let changed = true;
    let guard = 0;
    /*
     * Top to bottom only: pull following content into any leftover room on page i,
     * then page i+1, until nothing more fits. Do NOT push orphan headings down —
     * that opened blank bands on the page above.
     */
    while (changed && guard < result.length * 40) {
        guard += 1;
        changed = false;
        for (let pi = 0; pi < result.length - 1; pi += 1) {
            const next = result[pi + 1];
            if (!next?.length) continue;
            let sum = result[pi].reduce((s, idx) => s + Math.max(segmentHeightPx[idx] || 0, 1), 0);
            while (next.length > 0) {
                const h = Math.max(segmentHeightPx[next[0]] || 0, 1);
                if (sum + h > limit) break;
                result[pi].push(next.shift());
                sum += h;
                changed = true;
            }
            if (next.length === 0) {
                result.splice(pi + 1, 1);
                changed = true;
            }
        }
    }
    return result.filter((g) => g.length > 0);
}

export function packSegmentsOntoPagesByEstimatedHeight(segments, usablePx = EMS_QUOTE_CONT_USABLE_PX_FALLBACK) {
    if (!segments?.length) return [];
    const hasSplit = segments.some((s) => /data-ems-table-split\s*=\s*["']?1/i.test(String(s?.html || '')));
    if (!hasSplit) {
        const heights = estimateSegmentBlockHeightsPx(segments);
        const usable = Math.max(usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
        const packFudgePx = Math.min(20, Math.round(usable * 0.02));
        const limit = Math.max(usable - PACK_HEIGHT_SAFETY_PX, 200) + packFudgePx;
        const pages = [];
        let cur = [];
        let sum = 0;
        for (let i = 0; i < segments.length; i++) {
            const h = Math.max(heights[i] || 0, 1);
            if (cur.length > 0 && sum + h > limit) {
                pages.push(cur);
                cur = [];
                sum = 0;
            }
            cur.push(i);
            sum += h;
        }
        if (cur.length) pages.push(cur);
        return fillEstimatedPageGroupsByHeights(
            pages.filter((g) => g.length > 0),
            heights,
            limit,
            segments
        );
    }

    const fallbackHeights = estimateSegmentBlockHeightsPx(segments);
    const usable = Math.max(usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
    const limit = Math.max(usable - PACK_HEIGHT_SAFETY_PX, 200);
    /** @type {number[][]} */
    const pages = [];
    /** @type {number[]} */
    let cur = [];
    let sum = 0;
    /** @type {string} */
    let pageSplitId = '';
    let pageChargedTheadForSplit = false;

    /*
     * Ignore Excel-baked row px for split packing. Those values are often 5–10× the
     * painted row and leave ~3 short BOQ lines on an empty A4 page. Use compact
     * fixed costs; live paint-fill corrects any slight overshoot.
     */
    const SPLIT_PACK_BODY_PX = 34;
    const SPLIT_PACK_THEAD_PX = 30;

    const heightForIndexOnPage = (i, isNewPage) => {
        const seg = segments[i];
        const html = String(seg?.html || '');
        const splitId = readEmsSplitIdFromHtml(html);
        if (!splitId) {
            return Math.max(fallbackHeights[i] || 0, 1);
        }
        const headingH = seg?.showHeading ? 40 : 0;
        const chargeThead =
            isNewPage || !pageChargedTheadForSplit || pageSplitId !== splitId;
        const bodyPx = Math.max(SPLIT_PACK_BODY_PX, splitPackBodyPx(html));
        return Math.max(
            24,
            Math.round(bodyPx + (chargeThead ? SPLIT_PACK_THEAD_PX : 0) + headingH + 4)
        );
    };

    for (let i = 0; i < segments.length; i++) {
        const html = String(segments[i]?.html || '');
        const splitId = readEmsSplitIdFromHtml(html);
        let h = heightForIndexOnPage(i, cur.length === 0);
        if (cur.length > 0 && sum + h > limit) {
            pages.push(cur);
            cur = [];
            sum = 0;
            pageSplitId = '';
            pageChargedTheadForSplit = false;
            h = heightForIndexOnPage(i, true);
        }
        cur.push(i);
        sum += h;
        if (splitId) {
            pageSplitId = splitId;
            pageChargedTheadForSplit = true;
        }
    }
    if (cur.length) pages.push(cur);
    /* Body-only fixed heights for fill (thead already charged on the page). */
    const fillHeights = segments.map((seg, i) => {
        const html = String(seg?.html || '');
        if (!readEmsSplitIdFromHtml(html)) return Math.max(fallbackHeights[i] || 0, 1);
        const headingH = seg?.showHeading ? 40 : 0;
        const bodyPx = Math.max(SPLIT_PACK_BODY_PX, splitPackBodyPx(html));
        return Math.max(22, Math.round(bodyPx + headingH + 4));
    });
    return fillEstimatedPageGroupsByHeights(
        pages.filter((g) => g.length > 0),
        fillHeights,
        limit,
        segments
    );
}

/**
 * Estimated pack with per-continuation-page usable height (portrait vs landscape).
 * @param {ClauseSegment[]} segments
 * @param {(continuationPageIdx: number) => number} usablePxForPage
 */
export function packSegmentsOntoPagesByEstimatedHeightPerPage(
    segments,
    usablePxForPage
) {
    if (!segments?.length || typeof usablePxForPage !== 'function') {
        return packSegmentsOntoPagesByEstimatedHeight(segments);
    }
    const hasSplit = segments.some((s) =>
        /data-ems-table-split\s*=\s*["']?1/i.test(String(s?.html || ''))
    );
    if (!hasSplit) {
        const heights = estimateSegmentBlockHeightsPx(segments);
        const pages = [];
        let cur = [];
        let sum = 0;
        let pageIdx = 0;
        for (let i = 0; i < segments.length; i++) {
            const h = Math.max(heights[i] || 0, 1);
            const usable = Math.max(usablePxForPage(pageIdx) || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
            const packFudgePx = Math.min(20, Math.round(usable * 0.02));
            const pageLimit = Math.max(usable - PACK_HEIGHT_SAFETY_PX, 200) + packFudgePx;
            if (cur.length > 0 && sum + h > pageLimit) {
                pages.push(cur);
                pageIdx += 1;
                cur = [];
                sum = 0;
            }
            cur.push(i);
            sum += h;
        }
        if (cur.length) pages.push(cur);
        const u0 = Math.max(usablePxForPage(0) || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
        const limit0 = Math.max(u0 - PACK_HEIGHT_SAFETY_PX, 200) + 20;
        return fillEstimatedPageGroupsByHeights(
            pages.filter((g) => g.length > 0),
            heights,
            limit0,
            segments
        );
    }

    const fallbackHeights = estimateSegmentBlockHeightsPx(segments);
    /** @type {number[][]} */
    const pages = [];
    /** @type {number[]} */
    let cur = [];
    let sum = 0;
    let pageIdx = 0;
    let pageSplitId = '';
    let pageChargedTheadForSplit = false;

    const limitFor = (idx) =>
        Math.max(
            (usablePxForPage(idx) || EMS_QUOTE_CONT_USABLE_PX_FALLBACK) - PACK_HEIGHT_SAFETY_PX,
            200
        );

    const SPLIT_PACK_BODY_PX = 34;
    const SPLIT_PACK_THEAD_PX = 30;

    const heightForIndexOnPage = (i, isNewPage) => {
        const seg = segments[i];
        const html = String(seg?.html || '');
        const splitId = readEmsSplitIdFromHtml(html);
        if (!splitId) return Math.max(fallbackHeights[i] || 0, 1);
        const headingH = seg?.showHeading ? 40 : 0;
        const chargeThead =
            isNewPage || !pageChargedTheadForSplit || pageSplitId !== splitId;
        const bodyPx = Math.max(SPLIT_PACK_BODY_PX, splitPackBodyPx(html));
        return Math.max(
            24,
            Math.round(bodyPx + (chargeThead ? SPLIT_PACK_THEAD_PX : 0) + headingH + 4)
        );
    };

    for (let i = 0; i < segments.length; i++) {
        const splitId = readEmsSplitIdFromHtml(String(segments[i]?.html || ''));
        let h = heightForIndexOnPage(i, cur.length === 0);
        const limit = limitFor(pageIdx);
        if (cur.length > 0 && sum + h > limit) {
            pages.push(cur);
            pageIdx += 1;
            cur = [];
            sum = 0;
            pageSplitId = '';
            pageChargedTheadForSplit = false;
            h = heightForIndexOnPage(i, true);
        }
        cur.push(i);
        sum += h;
        if (splitId) {
            pageSplitId = splitId;
            pageChargedTheadForSplit = true;
        }
    }
    if (cur.length) pages.push(cur);
    const fillHeights = segments.map((seg, i) => {
        const html = String(seg?.html || '');
        if (!readEmsSplitIdFromHtml(html)) return Math.max(fallbackHeights[i] || 0, 1);
        const headingH = seg?.showHeading ? 40 : 0;
        const bodyPx = splitPackBodyPx(html);
        return Math.max(22, Math.round(bodyPx + headingH + 4));
    });
    return fillEstimatedPageGroupsByHeights(
        pages.filter((g) => g.length > 0),
        fillHeights,
        limitFor(0),
        segments
    );
}

const SPLIT_PACK_BODY_PX_EXPORT = 34;

/**
 * Prefer compact split-row costs. Inflated Excel / measure-host heights were leaving
 * half-empty pages and then clipping the rest under overflow:hidden.
 * @param {ClauseSegment[]} segments
 * @param {number[] | null | undefined} measuredPx
 * @returns {number[]}
 */
export function compactPackHeightsPx(segments, measuredPx = null) {
    return (segments || []).map((seg, i) => {
        const html = String(seg?.html || '');
        const measured = Math.max(measuredPx?.[i] || 0, 0);
        const heading = seg?.showHeading ? 40 : 0;
        if (/data-ems-table-split\s*=\s*["']?1/i.test(html)) {
            /* One-line BOQ stays 34; wrapped terms rows reserve real lines (cap 96). */
            const body = Math.min(96, Math.max(SPLIT_PACK_BODY_PX_EXPORT, splitPackBodyPx(html)));
            return Math.max(22, body + heading);
        }
        if (/<table\b/i.test(html)) {
            const theadHtml = html.match(/<thead\b[\s\S]*?<\/thead>/i)?.[0] || '';
            const theadRows = theadHtml ? (theadHtml.match(/<tr\b/gi) || []).length : 0;
            const allRows = (html.match(/<tr\b/gi) || []).length;
            const bodyRows = Math.max(1, allRows - theadRows);
            if (bodyRows <= 1) {
                const body = Math.min(96, Math.max(SPLIT_PACK_BODY_PX_EXPORT, splitPackBodyPx(html)));
                return Math.max(22, body + heading);
            }
            return Math.min(limitCssSafe(), bodyRows * SPLIT_PACK_BODY_PX_EXPORT + heading + 8);
        }
        const prose = estimateProseSegmentPx(seg, html);
        if (prose != null) {
            /* Prefer compact estimate over inflated measure-host heights. */
            const capped = Math.min(96, prose);
            if (measured > 0) return Math.min(measured, capped);
            return capped;
        }
        if (measured > 0) return Math.min(measured, 120);
        return Math.min(120, Math.max(estimateSegmentBlockHeightsPx([seg])[0] || 28, 1));
    });
}

function limitCssSafe() {
    return Math.max(EMS_QUOTE_CONT_USABLE_PX_FALLBACK - PACK_HEIGHT_SAFETY_PX, 200);
}

/**
 * Every segment index must appear on exactly one page. Dropped rows were vanishing
 * between page breaks (e.g. responsibility matrix 15–26).
 * @param {number[][]} groups
 * @param {number} segmentCount
 * @returns {number[][]}
 */
export function ensureSegmentPageGroupsCoverAll(groups, segmentCount) {
    const n = Math.max(0, segmentCount | 0);
    if (n < 1) return [];
    /** @type {number[][]} */
    const next = (groups || []).map((g) => g.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < n));
    const covered = new Set(next.flat());
    /** @type {number[]} */
    const missing = [];
    for (let i = 0; i < n; i += 1) {
        if (!covered.has(i)) missing.push(i);
    }
    if (!missing.length) return next.filter((g) => g.length > 0);
    if (!next.length) return [missing];
    next[next.length - 1] = [...next[next.length - 1], ...missing];
    return next.filter((g) => g.length > 0);
}

/**
 * Pack every continuation page from compact heights.
 * Top to bottom: fill each page until the next segment would cross the content-end
 * limit, then start a new page. Pulls leftover space on each page from the next.
 * @param {ClauseSegment[]} segments
 * @param {number[]} heightsPx
 * @param {number} [usablePx]
 * @returns {number[][]}
 */
export function packSegmentsOntoPagesByHeights(
    segments,
    heightsPx,
    usablePx = EMS_QUOTE_CONT_USABLE_PX_FALLBACK
) {
    return reflowContinuationPagesTopDown(segments, heightsPx, usablePx);
}

/**
 * Full top-down reflow: ignore prior page breaks, place every segment from the top,
 * fill each page to the content-end limit, then continue. Blank segments the user
 * typed stay in order (they keep their space); they do not block later content from
 * filling the rest of the page after them.
 * @param {ClauseSegment[]} segments
 * @param {number[] | null | undefined} [heightsPx]
 * @param {number} [usablePx]
 * @returns {number[][]}
 */
export function reflowContinuationPagesTopDown(
    segments,
    heightsPx = null,
    usablePx = EMS_QUOTE_CONT_USABLE_PX_FALLBACK
) {
    if (!segments?.length) return [];
    const usable = Math.max(usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
    const limit = Math.max(usable - PACK_HEIGHT_SAFETY_PX, 200);
    const SPLIT_THEAD = 30;
    const heights = compactPackHeightsPx(segments, heightsPx);
    /** Cost including thead once per split table per page. */
    const costOnPage = (i, pageSplitId) => {
        const html = String(segments[i]?.html || '');
        const splitId = readEmsSplitIdFromHtml(html);
        let h = Math.max(heights[i] || 0, 1);
        if (splitId && splitId !== pageSplitId) h += SPLIT_THEAD;
        return { h, splitId };
    };

    /** @type {number[][]} */
    const pages = [];
    /** @type {number[]} */
    let cur = [];
    let sum = 0;
    let pageSplitId = '';

    for (let i = 0; i < segments.length; i += 1) {
        const { h, splitId } = costOnPage(i, pageSplitId);
        if (cur.length > 0 && sum + h > limit) {
            pages.push(cur);
            cur = [];
            sum = 0;
            pageSplitId = '';
            const again = costOnPage(i, '');
            cur.push(i);
            sum = again.h;
            pageSplitId = again.splitId || '';
            continue;
        }
        cur.push(i);
        sum += h;
        if (splitId) pageSplitId = splitId;
    }
    if (cur.length) pages.push(cur);

    /* No pull-up fill — measured pack verifies DOWN only (avoids fill↔peel oscillation). */
    return ensureSegmentPageGroupsCoverAll(
        pages.filter((g) => g.length > 0),
        segments.length
    );
}

/**
 * @param {number[][]} groups
 * @param {number[][]} other
 */
export function segmentPageGroupsEqual(groups, other) {
    if (groups === other) return true;
    if (!groups || !other || groups.length !== other.length) return false;
    return groups.every((g, i) => {
        const o = other[i];
        if (!g || !o || g.length !== o.length) return false;
        return g.every((v, j) => v === o[j]);
    });
}

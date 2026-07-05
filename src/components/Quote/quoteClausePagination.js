/**
 * Split clause HTML into measurable segments and pack them across A4 continuation sheets.
 * User HTML is never restructured (no paragraph→table conversion, no cell splitting).
 * Large tables may be split one <tr> per segment for height packing only; segments are rejoined on render.
 */

/** @typedef {{ clauseIdx: number, clause: object, html: string, showHeading: boolean, displayMajor: number, key: string }} ClauseSegment */

const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

/** Extra px reserved so packed content never overlaps continuation logo/footer (PDF uses 13px/1.45 vs editor 12px). */
/** Reserve logo/footer band on continuation sheets (PDF font metrics vs measure). */
/** Reserve logo/footer + Chromium/Edge print metrics vs client measure host (~5% on Server PDF). */
const PACK_HEIGHT_SAFETY_PX = 48;
/** Tighter safety when user clicks Align Page (fills sheet slack without changing A4 / header / footer). */
const PACK_HEIGHT_SAFETY_PX_TIGHT = 12;
/** Measure vs print slack allowed when pulling the next segment up during Align Page. */
const PACK_ALIGN_FILL_SLACK_PX = 88;
/** Default slack when sum-of-segment heights says a group fits but merged DOM measure is high. */
const PACK_SUM_HEIGHT_FILL_SLACK_PX = 54;
/** Only split UL/OL into per-item segments when list is long (avoids one segment per bullet → 37 pages). */
const PACK_LIST_SPLIT_MIN_ITEMS = 10;

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

/** One packable segment: full list shell + single &lt;li&gt; (preserves bullet/number styling). */
function wrapSingleListItem(listEl, li) {
    const tag = listEl.tagName.toLowerCase();
    return `${getListOpenTag(listEl)}${li.outerHTML}</${tag}>`;
}

/**
 * @typedef {{ tightFit?: boolean }} ClausePackOptions
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

/** Pull-up fill pass — merged DOM height is checked; reserve only a small anti-clip tail. */
function resolvePackSlackFillLimitPx(usablePx, options) {
    if (options?.tightFit) return resolvePackFillLimitPx(usablePx, options);
    const antiClipTailPx = 44;
    return Math.max(usablePx - antiClipTailPx, 200);
}

function sumSegmentHeightsPx(group, segmentHeightsPx) {
    if (!segmentHeightsPx?.length || !group?.length) return 0;
    return group.reduce((s, gi) => s + Math.max(segmentHeightsPx[gi] || 0, 1), 0);
}

function resolvePackFillSlackPx(options) {
    return options?.tightFit ? 36 : PACK_SUM_HEIGHT_FILL_SLACK_PX;
}

/** Authoritative fit check — overflowTest mirrors continuation sheet overflow:hidden. */
function groupFitsPackLimit(group, measureMergedGroupPx, limit, segmentHeightsPx, options = {}) {
    if (!group?.length) return false;
    if (typeof options.overflowTest === 'function') {
        return !options.overflowTest(group);
    }
    const merged = measureMergedGroupPx(group);
    if (merged <= limit) return true;
    if (!segmentHeightsPx?.length) return false;
    const sumSlack = resolvePackFillSlackPx(options);
    if (merged > limit + Math.min(18, Math.round(sumSlack * 0.35))) return false;
    return sumSegmentHeightsPx(group, segmentHeightsPx) <= limit + sumSlack;
}

/** Same limit for initial pack and fill when overflowTest is used; else fill may use tighter tail. */
function resolvePackFillLimitPxForFillPass(usablePx, options) {
    if (typeof options?.overflowTest === 'function') {
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
 * BOQ rows with many stacked <p>/<div> in one cell are split into one <tr> per block so pagination can pack by height.
 * @param {HTMLTableRowElement} row
 * @returns {HTMLTableRowElement[]}
 */
function expandTableRowForPagination(row) {
    if (!row?.cells?.length) return [row];
    const cells = [...row.cells];
    let targetIdx = -1;
    let maxBlocks = 0;
    for (let i = 0; i < cells.length; i += 1) {
        const blocks = [...cells[i].children].filter(
            (c) =>
                c.nodeType === Node.ELEMENT_NODE &&
                /^(P|DIV|UL|OL|LI|H[1-6])$/i.test(c.tagName)
        );
        if (blocks.length > maxBlocks) {
            maxBlocks = blocks.length;
            targetIdx = i;
        }
    }
    if (targetIdx < 0 || maxBlocks <= 1) return [row];

    const targetCell = cells[targetIdx];
    const blocks = [...targetCell.children].filter(
        (c) =>
            c.nodeType === Node.ELEMENT_NODE &&
            /^(P|DIV|UL|OL|LI|H[1-6])$/i.test(c.tagName)
    );
    if (blocks.length <= 1) return [row];

    /** @type {HTMLTableRowElement[]} */
    const out = [];
    blocks.forEach((block, blockIdx) => {
        const tr = /** @type {HTMLTableRowElement} */ (row.cloneNode(true));
        const clonedCells = [...tr.cells];
        const cell = clonedCells[targetIdx];
        if (!cell) return;
        cell.innerHTML = block.outerHTML;
        if (blockIdx > 0) {
            for (let i = 0; i < targetIdx; i += 1) {
                const c = clonedCells[i];
                if (String(c.textContent || '').trim()) c.textContent = '';
            }
        }
        out.push(tr);
    });
    return out.length ? out : [row];
}

/**
 * Split one HTML table into one segment per body row (never recurses — safe for fallback passes).
 * @param {HTMLTableElement} table
 * @returns {string[]}
 */
function splitTableToRowSegmentHtml(table) {
    const tableAttrs = [...table.attributes]
        .map((a) => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`)
        .join(' ');

    let theadHtml = '';
    /** @type {HTMLTableRowElement | null} */
    let headerRowPromotedToThead = null;
    const thead = table.querySelector('thead');
    if (thead) {
        theadHtml = thead.outerHTML;
    } else {
        const firstTr = table.querySelector('tbody tr, tr');
        if (firstTr && firstTr.querySelector('th')) {
            theadHtml = `<thead>${firstTr.outerHTML}</thead>`;
            headerRowPromotedToThead = /** @type {HTMLTableRowElement} */ (firstTr);
        }
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')].filter(
        (tr) => tr !== headerRowPromotedToThead
    );
    const allRows =
        bodyRows.length > 0
            ? bodyRows
            : [...table.querySelectorAll('tr')].filter((tr) => {
                  if (tr === headerRowPromotedToThead) return false;
                  if (theadHtml && tr.querySelector('th')) return false;
                  return true;
              });

    if (!allRows.length) return [table.outerHTML];

    const tableId = String(table.id || table.getAttribute('id') || '').trim();
    const keepWhole =
        tableId === EMS_AUTO_PRICE_SUMMARY_TABLE_ID && allRows.length <= 12;
    if (keepWhole) return [table.outerHTML];

    const splitId = `ems-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const splitOpen = tableAttrs
        ? `<table ${tableAttrs} data-ems-table-split="1" data-ems-split-id="${splitId}">`
        : `<table data-ems-table-split="1" data-ems-split-id="${splitId}">`;

    /** @type {string[]} */
    const out = [];
    for (const row of allRows) {
        for (const rowPart of expandTableRowForPagination(row)) {
            out.push(`${splitOpen}${theadHtml}<tbody>${rowPart.outerHTML}</tbody></table>`);
        }
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

    const tables = [...root.querySelectorAll('table')];
    if (tables.length !== 1) return segments;

    const table = /** @type {HTMLTableElement} */ (tables[0]);
    const rowCount = table.querySelectorAll('tbody tr, tr').length;
    const minRows = Number.isFinite(options.splitTableMinRows)
        ? Math.max(1, options.splitTableMinRows)
        : 4;
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
        items.forEach((li) => {
            push(wrapSingleListItem(listEl, li));
        });
    };

    const tableSplitMinRows = Number.isFinite(options.splitTableMinRows)
        ? Math.max(1, options.splitTableMinRows)
        : 4;

    const countTableBodyRows = (table) => {
        const thead = table.querySelector('thead');
        const tbodyRows = table.querySelectorAll('tbody tr');
        if (tbodyRows.length) {
            return [...tbodyRows].filter((tr) => !thead?.contains(tr)).length || tbodyRows.length;
        }
        return [...table.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th')).length;
    };

    const processElement = (el) => {
        const tag = el.tagName;
        if (tag === 'TABLE') {
            const table = /** @type {HTMLTableElement} */ (el);
            if (countTableBodyRows(table) >= tableSplitMinRows) {
                splitTable(table);
            } else {
                push(table.outerHTML);
            }
            return;
        }
        if (tag === 'UL' || tag === 'OL') {
            splitListToItemSegments(el);
            return;
        }
        if (tag === 'DIV' || tag === 'FIGURE' || tag === 'SECTION' || tag === 'ARTICLE') {
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
                    items.forEach((li) => out.push(wrapSingleListItem(listEl, li)));
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

/** Split multi-paragraph blobs for Align Page — never rewrite lists or strip inline formatting. */
function expandParagraphListSegments(htmlParts) {
    if (!htmlParts?.length || typeof DOMParser === 'undefined') return htmlParts || [];
    /** @type {string[]} */
    const out = [];
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
        const allP = children.length > 1 && children.every((c) => /^P$/i.test(c.tagName));
        if (allP) {
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
                out.push(h);
            }
            continue;
        }
        out.push(t);
    }
    return out.length ? out : htmlParts;
}

function packIndicesByHeightSum(indices, heights, usablePx, options = {}) {
    if (!indices?.length) return [];
    const usable = resolvePackFillLimitPx(usablePx, options);
    const fudge = options?.tightFit ? 28 : 24;
    /** @type {number[][]} */
    const pages = [];
    let cur = [];
    let sum = 0;
    for (const i of indices) {
        const h = Math.max(heights[i] || 0, 1);
        if (cur.length > 0 && sum + h > usable + fudge) {
            pages.push(cur);
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
    if (splitTables.length === 1) {
        const only = /** @type {HTMLTableElement} */ (splitTables[0]);
        const rows = getSplitTableBodyRows(only);
        return buildRejoinedTableOuterHtml(doc, only, rows);
    }

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

    return root.innerHTML.trim() || raw;
}

/**
 * @param {Array<{ clause: object, content: string, listKey: string }>} activeClausesList
 * @param {(html: string, listKey: string, displayMajor: number) => string} formatBodyHtml
 * @param {ClausePackOptions & { splitListsPerItem?: boolean, splitTableMinRows?: number }} [options]
 * @returns {ClauseSegment[]}
 */
export function buildClauseSegmentsForPagination(activeClausesList, formatBodyHtml, options = {}) {
    /** @type {ClauseSegment[]} */
    const out = [];
    activeClausesList.forEach((clause, clauseIdx) => {
        const displayMajor = clauseIdx + 1;
        const bodyHtml = formatBodyHtml(clause.content, clause.listKey, displayMajor);
        const parts = splitClauseHtmlToSegments(bodyHtml, options);
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

/** Merge consecutive single-&lt;li&gt; list fragments into one list when rendered on the same sheet. */
function appendSegmentHtmlToAcc(acc, html) {
    const prev = String(acc || '').trim();
    const next = String(html || '').trim();
    if (!prev) return next;
    if (!next) return prev;

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
            bodyHtml: rejoinSplitTableHtml(joined),
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
        if (seg.clauseIdx !== curClauseIdx) {
            flush();
            curClauseIdx = seg.clauseIdx;
            head = seg;
            acc = seg.html;
        } else {
            acc = appendSegmentHtmlToAcc(acc, seg.html);
        }
    }
    flush();
    return blocks;
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
    const usable = resolvePackFillLimitPx(usablePx, options);
    const pages = [];
    let cur = [];

    for (const i of indices) {
        const tryGroup = [...cur, i];
        const fits = groupFitsPackLimit(
            tryGroup,
            measureMergedGroupPx,
            usable,
            segmentHeightsPx,
            options
        );
        if (cur.length > 0 && !fits) {
            pages.push(cur);
            cur = [i];
        } else {
            cur = tryGroup;
        }
    }
    if (cur.length) pages.push(cur);
    return pages;
}

/**
 * If a page group is only prose (e.g. BOQ intro) and the next group starts the table, merge forward
 * so the intro is not stranded on an otherwise empty sheet.
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
        if (onlyProse && nextHasTable) {
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
    options = {}
) {
    if (!group?.length) return [];
    if (group.length <= 1) return [group];
    /** @type {number[][]} */
    const pages = [];
    let cur = [];
    for (const idx of group) {
        const tryGroup = [...cur, idx];
        const fits = groupFitsPackLimit(
            tryGroup,
            measureMergedGroupPx,
            usable,
            segmentHeightsPx,
            options
        );
        if (cur.length > 0 && !fits) {
            pages.push(cur);
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
    const usable = resolvePackFillLimitPx(usablePx, options);
    let pending = groups.map((g) => [...g]);
    for (let pass = 0; pass < 48; pass += 1) {
        /** @type {number[][]} */
        const next = [];
        let splitAny = false;
        for (const group of pending) {
            if (!group?.length) continue;
            if (
                groupFitsPackLimit(
                    group,
                    measureMergedGroupPx,
                    usable,
                    segmentHeightsPx,
                    options
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
                options
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
    const usable = resolvePackFillLimitPx(usablePx, options);
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
        for (const group of result) {
            if (!group?.length) continue;
            if (
                group.length <= 1 ||
                groupFitsPackLimit(
                    group,
                    measureMergedGroupPx,
                    usable,
                    segmentHeightsPx,
                    options
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
                options
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
export function fillSegmentPageGroupsSlack(
    groups,
    measureMergedGroupPx,
    usablePx,
    segments,
    options = {},
    segmentHeightsPx = null
) {
    if (!groups?.length || groups.length < 2) return groups || [];
    const limit = resolvePackFillLimitPxForFillPass(usablePx, options);
    /** @type {number[][]} */
    const result = groups.map((g) => [...g]);
    let changed = true;
    let guard = 0;
    while (changed && guard < result.length * 12) {
        guard += 1;
        changed = false;
        for (let i = 0; i < result.length - 1; i++) {
            if (groupEndsWithManualBlankSpacers(result[i], segments)) continue;
            const next = result[i + 1];
            if (!next?.length) continue;

            const mergedAll = [...result[i], ...next];
            if (
                groupFitsPackLimit(
                    mergedAll,
                    measureMergedGroupPx,
                    limit,
                    segmentHeightsPx,
                    options
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
                        options
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
    return result.filter((g) => g.length > 0);
}

/**
 * Pack clause segments onto continuation sheets (one .quote-a4-sheet per returned group).
 * @param {number[]} indices
 * @param {(groupIndices: number[]) => number} measureMergedGroupPx
 * @param {number} usablePx
 * @param {ClauseSegment[]} segments
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
    const limit = resolvePackFillLimitPx(usablePx, options);
    let groups;
    if (segmentHeightsPx?.length) {
        groups = packIndicesByHeightSum(indices, segmentHeightsPx, usablePx, options);
        groups = groups.flatMap((group) => {
            if (!group?.length) return [];
            if (
                groupFitsPackLimit(
                    group,
                    measureMergedGroupPx,
                    limit,
                    segmentHeightsPx,
                    options
                )
            ) {
                return [group];
            }
            if (group.length <= 1) return [group];
            return splitSegmentGroupByMergedHeight(
                group,
                measureMergedGroupPx,
                limit,
                segmentHeightsPx,
                options
            );
        });
    } else {
        groups = packSegmentIndicesByMergedHeight(
            indices,
            measureMergedGroupPx,
            usablePx,
            options,
            segmentHeightsPx
        );
    }
    groups = mergeIntroOnlyGroupsForward(groups, segments);
    groups = fillSegmentPageGroupsSlack(
        groups,
        measureMergedGroupPx,
        usablePx,
        segments,
        options,
        segmentHeightsPx
    );
    groups = rebalanceSegmentPageGroups(
        groups,
        measureMergedGroupPx,
        usablePx,
        options,
        segmentHeightsPx
    );
    groups = fillSegmentPageGroupsSlack(
        groups,
        measureMergedGroupPx,
        usablePx,
        segments,
        options,
        segmentHeightsPx
    );
    if (options?.tightFit) {
        groups = fillSegmentPageGroupsSlack(
            groups,
            measureMergedGroupPx,
            usablePx,
            segments,
            options,
            segmentHeightsPx
        );
    }
    groups = enforcePackedSegmentGroups(
        groups,
        indices,
        measureMergedGroupPx,
        usablePx,
        options,
        segmentHeightsPx
    );
    groups = fillSegmentPageGroupsSlack(
        groups,
        measureMergedGroupPx,
        usablePx,
        segments,
        options,
        segmentHeightsPx
    );
    return groups.filter((group) => {
        if (!group?.length) return false;
        return group.some((idx) => {
            const seg = segments[idx];
            return seg && String(seg.html || '').trim().length > 0;
        });
    });
}

/** Continuation body height when DOM measure is not ready yet (~A4 inner minus logo/footer). */
export const EMS_QUOTE_CONT_USABLE_PX_FALLBACK = 772;

/** @deprecated Reserved in pack safety only — do not subtract from usable height (causes blank pages). */
export const EMS_QUOTE_PRINT_CONTENT_FOOTER_GAP_PX = 0;

/** Representative footer HTML so pack measure reserves the same band as rendered sheets. */
export function buildQuotePackMeasureFooterHtml(minHeight = '72px') {
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
 * Rough per-segment height from HTML size (tables/lists weigh more than prose).
 * @param {ClauseSegment[]} segments
 */
export function estimateSegmentBlockHeightsPx(segments) {
    return (segments || []).map((seg) => {
        const html = String(seg?.html || '');
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const tableCount = (html.match(/<table\b/gi) || []).length;
        const rowCount = (html.match(/<tr\b/gi) || []).length;
        const listCount = (html.match(/<li\b/gi) || []).length;
        let h = Math.round(plain.length * 0.42 + 48);
        h += tableCount * 80;
        h += Math.max(0, rowCount - tableCount * 3) * 22;
        h += listCount * 18;
        return Math.min(3200, Math.max(80, h));
    });
}

/**
 * Pack segment indices onto continuation pages using estimated heights.
 * Used when measure DOM is not ready yet so preview never sticks at cover-only.
 * @param {ClauseSegment[]} segments
 * @param {number} usablePx
 */
export function packSegmentsOntoPagesByEstimatedHeight(segments, usablePx = EMS_QUOTE_CONT_USABLE_PX_FALLBACK) {
    if (!segments?.length) return [];
    const heights = estimateSegmentBlockHeightsPx(segments);
    const usable = Math.max(usablePx || EMS_QUOTE_CONT_USABLE_PX_FALLBACK, 240);
    const packFudgePx = Math.min(22, Math.round(usable * 0.02));
    const pages = [];
    let cur = [];
    let sum = 0;
    for (let i = 0; i < segments.length; i++) {
        const h = Math.max(heights[i] || 0, 1);
        if (cur.length > 0 && sum + h > usable + packFudgePx) {
            pages.push(cur);
            cur = [];
            sum = 0;
        }
        cur.push(i);
        sum += h;
    }
    if (cur.length) pages.push(cur);
    return pages.filter((g) => g.length > 0);
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

/**
 * Keep clause editor tables uniform when rows/columns are added via Jodit popup.
 */

import { normalizeSize } from 'jodit/esm/core/helpers/normalize/normalize-size.js';
import {
    EMS_QUOTE_PRICING_TABLE_WIDTH,
    EMS_QUOTE_PRICING_TABLE_CELL_PADDING,
    EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH,
    EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH,
    EMS_QUOTE_PRICING_TABLE_HEADER_BG,
    EMS_QUOTE_PRICING_TABLE_HEADER_COLOR,
    EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER,
} from '../../constants/emsTheme';

/** Same commands Jodit `selectCells` handles when cell selection is enabled. */
const TABLE_STRUCTURE_CMD_RE =
    /table(splitv|splitg|merge|empty|bin|binrow|bincolumn|addcolumn|addrow)/i;

const EMS_TABLE_CELL_SELECTED_CLASS = 'ems-table-cell-selected';

const TABLE_FORMAT_CMD_RE =
    /^(bold|italic|underline|strikethrough|superscript|subscript|forecolor|background|fontsize|fontname|applylineheight|justify(left|center|right|full)|eraser)$/i;

function getJoditTableModule(jodit) {
    try {
        return jodit.getInstance?.('Table', jodit.o) || null;
    } catch {
        return null;
    }
}

function getActiveTableCell(jodit, getEditorBody) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    /*
     * Prefer the last clicked cell (__emsActiveTableCell). Caret often stays in Description
     * after clicking Amount (cell-select / drag), so caret-first made Ctrl+C copy Description.
     */
    if (jodit.__emsActiveTableCell?.isConnected) {
        if (!root || root.contains(jodit.__emsActiveTableCell)) {
            return jodit.__emsActiveTableCell;
        }
    }

    const range = jodit.s?.range;
    let node = range?.startContainer;
    if (!node) {
        node = root?.ownerDocument?.getSelection?.()?.anchorNode;
    }
    const fromCaret = getTableCellFromNode(node);
    if (fromCaret && (!root || root.contains(fromCaret))) return fromCaret;

    const tableModule = getJoditTableModule(jodit);
    const selected = tableModule?.getAllSelectedCells?.() || [];
    if (selected.length === 1) return selected[0];
    return null;
}

function setActiveTableCell(jodit, cell) {
    jodit.__emsActiveTableCell = cell || null;
}

function getSelectedTableCells(jodit) {
    const tableModule = getJoditTableModule(jodit);
    const fromMod = [...(tableModule?.getAllSelectedCells?.() || [])];
    const root = jodit?.editor || jodit?.__emsClauseEditorBody?.();
    const fromClass = [...(root?.querySelectorAll?.(`.${EMS_TABLE_CELL_SELECTED_CLASS}`) || [])];
    const fromStaged = [...(jodit?.__emsFormatTableCells || [])].filter((c) => c?.isConnected);
    const fromSplit = [...(jodit?.__emsSplitTableCells || [])].filter((c) => c?.isConnected);
    /*
     * ALWAYS union sources. Right-click often leaves only 1 cell in Jodit's map while
     * the other selected cells still have EMS blue boxes / staged format — returning
     * fromMod alone made Split vertically affect only the first cell.
     */
    const out = [];
    const seen = new Set();
    [...fromSplit, ...fromStaged, ...fromClass, ...fromMod].forEach((c) => {
        if (!c?.isConnected || seen.has(c)) return;
        seen.add(c);
        out.push(c);
    });
    return out;
}

/**
 * Cells to operate on for split/merge — Jodit map, staged format block, or EMS class.
 * Context-menu clicks often clear Jodit selection before execCommand runs.
 */
function resolveTableStructureWorkCells(jodit, getEditorBody, table) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit?.editor ||
        null;
    const buckets = [
        jodit?.__emsSplitTableCells,
        jodit?.__emsFormatTableCells,
        getSelectedTableCells(jodit),
        root ? [...root.querySelectorAll(`.${EMS_TABLE_CELL_SELECTED_CLASS}`)] : [],
        table ? [...table.querySelectorAll(`.${EMS_TABLE_CELL_SELECTED_CLASS}`)] : [],
    ];
    const out = [];
    const seen = new Set();
    buckets.forEach((list) => {
        (list || []).forEach((c) => {
            if (!c?.isConnected || seen.has(c)) return;
            if (table && c.closest?.('table') !== table) return;
            seen.add(c);
            out.push(c);
        });
    });
    return out;
}

/** Keep only cells that share the same formal column as `anchor` (multi-row Description split). */
function filterCellsSameFormalColumn(tableModule, table, cells, anchor) {
    if (!tableModule || !table || !anchor || !cells?.length) return cells || [];
    const ac = tableModule.formalCoordinate(table, anchor);
    const anchorCol = Array.isArray(ac) ? ac[1] : ac?.col;
    if (anchorCol == null) return cells;
    return cells.filter((c) => {
        const coord = tableModule.formalCoordinate(table, c);
        const col = Array.isArray(coord) ? coord[1] : coord?.col;
        return col === anchorCol;
    });
}

function clearEmsTableCellSelectionClasses(jodit) {
    const root = jodit?.editor || jodit?.__emsClauseEditorBody?.();
    root?.querySelectorAll?.(`.${EMS_TABLE_CELL_SELECTED_CLASS}`).forEach((el) => {
        el.classList.remove(EMS_TABLE_CELL_SELECTED_CLASS);
    });
}

function syncEmsTableCellSelectionClasses(jodit) {
    const root = jodit?.editor || jodit?.__emsClauseEditorBody?.();
    if (!root) return;
    const selected = new Set(getSelectedTableCells(jodit));
    /* Never strip blue boxes down to a single Jodit-map cell when a block is staged. */
    const staged = (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
    if (staged.length >= 2) {
        staged.forEach((c) => selected.add(c));
    }
    root.querySelectorAll(`.${EMS_TABLE_CELL_SELECTED_CLASS}`).forEach((el) => {
        if (!selected.has(el)) el.classList.remove(EMS_TABLE_CELL_SELECTED_CLASS);
    });
    selected.forEach((cell) => {
        if (cell?.isConnected) cell.classList.add(EMS_TABLE_CELL_SELECTED_CLASS);
    });
}

function clearAllTableCellSelection(jodit) {
    const tableModule = getJoditTableModule(jodit);
    tableModule?.getAllSelectedCells?.().forEach((td) => tableModule.removeSelection(td));
    clearEmsTableCellSelectionClasses(jodit);
    const root = jodit.editor || jodit.__emsClauseEditorBody?.();
    root?.querySelectorAll?.('table[data-ems-cell-selecting="1"]').forEach((table) => {
        table.removeAttribute('data-ems-cell-selecting');
    });
}

/** EMS drag-select (replaces disabled Jodit selectCells plugin). */
function selectTableCellRange(jodit, table, cellA, cellB) {
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule || !table || !cellA || !cellB) return [];
    clearAllTableCellSelection(jodit);
    const bound = tableModule.getSelectedBound(table, [cellA, cellB]);
    const box = tableModule.formalMatrix(table);
    const picked = [];
    for (let i = bound[0][0]; i <= bound[1][0]; i += 1) {
        for (let j = bound[0][1]; j <= bound[1][1]; j += 1) {
            const cell = box[i]?.[j];
            if (cell) {
                tableModule.addSelection(cell);
                picked.push(cell);
            }
        }
    }
    syncEmsTableCellSelectionClasses(jodit);
    return picked;
}

function getSelectedCellsBounds(cells) {
    if (!cells?.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    cells.forEach((cell) => {
        const r = cell.getBoundingClientRect();
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
    });
    return {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

function selectionContainsCell(jodit, cell) {
    if (!cell) return false;
    return getSelectedTableCells(jodit).includes(cell);
}

function getStagedTableFormatCells(jodit) {
    return (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
}

function markTableCellSelectingAttribute(cells) {
    const tables = new Set();
    cells.forEach((cell) => {
        const table = cell?.closest?.('table');
        if (table) tables.add(table);
    });
    tables.forEach((table) => table.setAttribute('data-ems-cell-selecting', '1'));
}

/** One cell = caret only; two or more = keep Jodit blue selection for merge / multi-cell ops. */
function syncTableSelectionVisual(jodit, getEditorBody) {
    if (jodit.__emsSkipTableSelSync) return;
    if (jodit.__emsPreserveMultiTableSelect) return;

    const staged = getStagedTableFormatCells(jodit);
    if (staged.length >= 2) {
        restoreTableCellSelection(jodit, staged);
        markTableCellSelectingAttribute(staged);
        jodit.__emsActiveTableCell = staged[0];
        return;
    }

    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    const sel = root?.ownerDocument?.getSelection?.();
    const anchor = sel?.anchorNode;
    const anchorCell = getTableCellFromNode(anchor);

    const cells = getSelectedTableCells(jodit);
    if (cells.length <= 1) {
        tableModule.getAllSelectedCells().forEach((td) => tableModule.removeSelection(td));
        clearEmsTableCellSelectionClasses(jodit);
        const cell = cells[0] || anchorCell;
        if (cell && (!root || root.contains(cell))) {
            jodit.__emsActiveTableCell = cell;
        } else {
            jodit.__emsActiveTableCell = null;
            jodit.__emsFormatTableCells = null;
        }
        return;
    }
    jodit.__emsActiveTableCell = cells[0];
}

function scheduleTableSelectionSync(jodit, getEditorBody) {
    if (jodit.__emsTableSelSyncTimer) {
        window.clearTimeout(jodit.__emsTableSelSyncTimer);
    }
    jodit.__emsTableSelSyncTimer = window.setTimeout(() => {
        jodit.__emsTableSelSyncTimer = null;
        requestAnimationFrame(() => syncTableSelectionVisual(jodit, getEditorBody));
    }, 0);
}

function hasCollapsedCaretInTableCell(jodit, getEditorBody) {
    if (!isCaretInTableCell(jodit, getEditorBody)) return false;
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit?.editor ||
        null;
    const sel = root?.ownerDocument?.getSelection?.();
    return Boolean(sel?.rangeCount && sel.isCollapsed);
}

function snapshotTableEditorHistory(jodit) {
    try {
        if (jodit?.history?.updateStack) {
            jodit.history.updateStack();
        }
        jodit?.e?.fire?.('change');
    } catch {
        /* ignore */
    }
}

function resolveFocusCellAfterStructureInsert(table, anchorCell, subCmd) {
    const { grid: beforeGrid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(beforeGrid, anchorCell);
    if (!pos) return anchorCell;
    const { grid } = buildTableCellGrid(table);
    switch (subCmd) {
        case 'addrowafter':
            return grid[pos.row + 1]?.[pos.col] || anchorCell;
        case 'addrowbefore':
            return grid[pos.row]?.[pos.col] || anchorCell;
        case 'addcolumnafter':
            return grid[pos.row]?.[pos.col + 1] || anchorCell;
        case 'addcolumnbefore':
            return grid[pos.row]?.[pos.col] || anchorCell;
        default:
            return anchorCell;
    }
}

function focusCellAfterTableStructureChange(jodit, getEditorBody, table, anchorCell, subCmd) {
    let focusCell = anchorCell;
    if (/^add(row|column)/.test(subCmd)) {
        focusCell = resolveFocusCellAfterStructureInsert(table, anchorCell, subCmd);
    } else if (subCmd === 'bin') {
        return;
    } else if (subCmd === 'binrow' || subCmd === 'bincolumn') {
        focusCell =
            getActiveTableCell(jodit, getEditorBody) ||
            table.querySelector('td, th') ||
            anchorCell;
    }
    if (!focusCell?.isConnected) return;
    jodit.__emsSkipTableSelSync = true;
    clearAllTableCellSelection(jodit);
    jodit.__emsFormatTableCells = null;
    jodit.__emsToolbarCellFormat = false;
    setActiveTableCell(jodit, focusCell);
    jodit.__emsTableSelAnchor = focusCell;
    focusTableCell(focusCell, jodit, false);
    requestAnimationFrame(() => {
        jodit.__emsSkipTableSelSync = false;
    });
}

function isCaretInTableCell(jodit, getEditorBody) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit?.editor ||
        null;
    if (!root) return false;
    try {
        const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
        if (!sel?.rangeCount) return false;
        let node = sel.getRangeAt(0).startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        return Boolean(node?.closest?.('table'));
    } catch {
        return false;
    }
}

/** True when the user highlighted characters (toolbar should use Jodit inline formatting). */
function hasActiveTextRangeSelection(jodit, getEditorBody) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit?.editor ||
        null;
    const sel = root?.ownerDocument?.getSelection?.();
    if (!sel || sel.isCollapsed) return false;
    if (!String(sel).trim()) return false;
    const anchor = sel.anchorNode;
    return Boolean(anchor && root?.contains(anchor));
}

/** Union Jodit blue selection with EMS Ctrl+A / toolbar stash (Jodit often omits th / edge cells). */
function resolveTableFormatCellTargets(jodit, getEditorBody, { allowActiveCellFallback = false } = {}) {
    if (hasActiveTextRangeSelection(jodit, getEditorBody)) {
        return [];
    }

    const live = getSelectedTableCells(jodit).filter((c) => c?.isConnected);
    const stashed = (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
    const merged = [];
    const seen = new Set();
    const push = (cell) => {
        if (!cell?.isConnected || seen.has(cell)) return;
        seen.add(cell);
        merged.push(cell);
    };
    stashed.forEach(push);
    live.forEach(push);

    if (merged.length) {
        jodit.__emsFormatTableCells = merged;
        jodit.__emsToolbarCellFormat = true;
        return merged;
    }

    if (allowActiveCellFallback) {
        const cell = getActiveTableCell(jodit, getEditorBody);
        return cell?.isConnected ? [cell] : [];
    }
    return [];
}

/** Multi-cell table selection clears the text range — toolbar formatting needs a target. */
function getCellsForTableFormatting(jodit, getEditorBody) {
    if (hasActiveTextRangeSelection(jodit, getEditorBody)) {
        jodit.__emsFormatTableCells = null;
        jodit.__emsToolbarCellFormat = false;
        return [];
    }
    const cells = resolveTableFormatCellTargets(jodit, getEditorBody, {
        allowActiveCellFallback: isCaretInTableCell(jodit, getEditorBody),
    });
    if (cells.length) return cells;
    jodit.__emsFormatTableCells = null;
    jodit.__emsToolbarCellFormat = false;
    return [];
}

/** Table cells to format at cell level (background fill, vertical align) — not inline text spans. */
function getTableCellsForCellLevelFormat(jodit, getEditorBody) {
    return resolveTableFormatCellTargets(jodit, getEditorBody, { allowActiveCellFallback: true });
}

function restoreTableCellSelection(jodit, cells) {
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule || !cells?.length) return;
    tableModule.getAllSelectedCells().forEach((td) => {
        if (!cells.includes(td)) {
            tableModule.removeSelection(td);
        }
    });
    cells.forEach((td) => {
        if (td.isConnected) {
            tableModule.addSelection(td);
        }
    });
    syncEmsTableCellSelectionClasses(jodit);
}

function clearEditorTextSelection(jodit) {
    try {
        jodit.s?.sel?.removeAllRanges?.();
        const root = jodit.editor || jodit.__emsClauseEditorBody?.();
        root?.ownerDocument?.getSelection?.()?.removeAllRanges?.();
    } catch {
        /* ignore */
    }
}

function unwrapElement(el) {
    const parent = el?.parentNode;
    if (!parent) return;
    while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
}

function isBoldWeight(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v || v === 'normal' || v === '400') return false;
    if (v === 'bold' || v === 'bolder') return true;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 600;
}

function nodeHasInlineBold(node) {
    if (!node || node.nodeType !== 1) return false;
    if (/^(strong|b)$/i.test(node.tagName)) return true;
    return isBoldWeight(node.style?.fontWeight);
}

function isThDefaultBold(cell) {
    if (!/^th$/i.test(cell?.tagName || '')) return false;
    const fw = (cell.style?.getPropertyValue('font-weight') || '').trim().toLowerCase();
    return fw !== 'normal' && fw !== '400';
}

function isCellBold(cell) {
    if (!cell) return false;
    if (isThDefaultBold(cell)) return true;
    if (cell.querySelector('strong, b')) return true;
    if (nodeHasInlineBold(cell)) return true;
    return [...cell.querySelectorAll('span, p, div, font, li, h1, h2, h3, h4, h5, h6')].some((el) =>
        nodeHasInlineBold(el)
    );
}

const OFFICE_BOLD_STYLE_PROPS = ['font-weight', 'mso-ansi-font-weight', 'mso-bidi-font-weight'];

function clearCellBold(cell) {
    if (!cell) return;
    cell.querySelectorAll('strong, b').forEach((el) => unwrapElement(el));
    const nodes = [cell, ...cell.querySelectorAll('*')];
    for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (!cell.contains(el)) continue;
        OFFICE_BOLD_STYLE_PROPS.forEach((prop) => el.style.removeProperty(prop));
        el.style.setProperty('font-weight', 'normal', 'important');
    }
}

function removeBoldFromCell(cell) {
    clearCellBold(cell);
}

function isCellItalic(cell) {
    if (!cell) return false;
    if (cell.querySelector('em, i')) return true;
    const check = (el) => {
        const v = (el.style?.fontStyle || '').toLowerCase();
        return v === 'italic' || v === 'oblique';
    };
    return check(cell) || [...cell.querySelectorAll('span, p, div, font, li')].some(check);
}

function removeItalicFromCell(cell) {
    if (!cell) return;
    cell.querySelectorAll('em, i').forEach((el) => unwrapElement(el));
    cell.style.removeProperty('font-style');
    cell.querySelectorAll('span, p, div, font, li').forEach((el) => {
        el.style.removeProperty('font-style');
    });
}

function decorationIncludes(value, token) {
    return String(value || '')
        .toLowerCase()
        .split(/\s+/)
        .includes(token);
}

function isCellUnderline(cell) {
    if (!cell) return false;
    if (cell.querySelector('u')) return true;
    const check = (el) =>
        decorationIncludes(el.style?.textDecoration, 'underline') ||
        decorationIncludes(el.style?.textDecorationLine, 'underline');
    return check(cell) || [...cell.querySelectorAll('span, p, div, font, li, u')].some(check);
}

function removeUnderlineFromCell(cell) {
    if (!cell) return;
    const table = cell.closest?.('table');
    if (table) {
        stripStrikethroughFromQuoteTable(table);
        return;
    }
    cell.querySelectorAll('u').forEach((el) => unwrapElement(el));
    [cell, ...cell.querySelectorAll('span, p, div, font, li')].forEach((el) => {
        const line =
            el.style?.getPropertyValue('text-decoration-line') ||
            el.style?.getPropertyValue('text-decoration') ||
            el.style?.textDecorationLine ||
            el.style?.textDecoration ||
            '';
        if (!/underline/i.test(line)) return;
        if (/line-through/i.test(line)) {
            el.style.setProperty('text-decoration', 'line-through', 'important');
            el.style.setProperty('text-decoration-line', 'line-through', 'important');
        } else {
            el.style.setProperty('text-decoration', 'none', 'important');
            el.style.setProperty('text-decoration-line', 'none', 'important');
        }
    });
}

function elementHasLineThrough(el) {
    if (!el || el.nodeType !== 1) return false;
    if (/^(S|STRIKE|DEL)$/i.test(el.tagName || '')) return true;
    const line =
        el.style?.getPropertyValue('text-decoration-line') ||
        el.style?.getPropertyValue('text-decoration') ||
        el.style?.textDecorationLine ||
        el.style?.textDecoration ||
        '';
    if (/line-through/i.test(line)) return true;
    const raw = String(el.getAttribute?.('style') || '');
    /* Word/Excel: mso-strike:single paints a second line our icon used to miss. */
    if (/mso-strike\s*:\s*single/i.test(raw)) return true;
    if (/text-line-through\s*:\s*single/i.test(raw)) return true;
    return false;
}

/** Strike can sit on the td, a nested span, or the tr/table (Office paste). */
function isCellStrikethrough(cell) {
    if (!cell) return false;
    if (cell.querySelector('s, strike, del')) return true;
    if (elementHasLineThrough(cell)) return true;
    if (
        [...cell.querySelectorAll('span, p, div, font, li, b, strong, i, em, u')].some(
            elementHasLineThrough
        )
    ) {
        return true;
    }
    let anc = cell.parentElement;
    while (anc && !/^(BODY|HTML)$/i.test(anc.tagName || '')) {
        if (/^(TR|TBODY|THEAD|TFOOT|TABLE)$/i.test(anc.tagName || '') && elementHasLineThrough(anc)) {
            return true;
        }
        if (/^(TABLE)$/i.test(anc.tagName || '')) break;
        anc = anc.parentElement;
    }
    return false;
}

function stripLineThroughFromElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (/^(S|STRIKE|DEL)$/i.test(el.tagName || '')) {
        unwrapElement(el);
        return;
    }
    const line =
        el.style?.getPropertyValue('text-decoration-line') ||
        el.style?.getPropertyValue('text-decoration') ||
        el.style?.textDecorationLine ||
        el.style?.textDecoration ||
        '';
    let raw = String(el.getAttribute?.('style') || '');
    const hadStrike =
        /line-through/i.test(line) ||
        /mso-strike\s*:/i.test(raw) ||
        /text-line-through\s*:/i.test(raw);
    if (!hadStrike) return;
    const keepUnderline = /underline/i.test(line) || /underline/i.test(raw);
    if (/mso-strike\s*:/i.test(raw) || /text-line-through\s*:/i.test(raw)) {
        raw = raw
            .replace(/mso-strike\s*:[^;]*;?/gi, '')
            .replace(/text-line-through\s*:[^;]*;?/gi, '');
        if (raw.trim()) el.setAttribute('style', raw.replace(/;;+/g, ';').replace(/^;|;$/g, ''));
        else el.removeAttribute('style');
    }
    if (keepUnderline) {
            el.style.setProperty('text-decoration', 'underline', 'important');
            el.style.setProperty('text-decoration-line', 'underline', 'important');
        } else {
        el.style.setProperty('text-decoration', 'none', 'important');
        el.style.setProperty('text-decoration-line', 'none', 'important');
    }
    el.style.removeProperty('text-decoration-thickness');
    el.style.removeProperty('text-decoration-color');
    el.style.removeProperty('text-decoration-style');
}

function removeStrikethroughFromCell(cell) {
    if (!cell) return;
    cell.querySelectorAll('s, strike, del').forEach((el) => unwrapElement(el));
    const nodes = [
        cell,
        ...cell.querySelectorAll('span, p, div, font, li, b, strong, i, em, u, a'),
    ];
    nodes.forEach(stripLineThroughFromElement);
    /* Office often puts the leftover strike on the row / table, not the cell. */
    let anc = cell.parentElement;
    while (anc && !/^(BODY|HTML)$/i.test(anc.tagName || '')) {
        if (/^(TR|TBODY|THEAD|TFOOT|TABLE)$/i.test(anc.tagName || '')) {
            stripLineThroughFromElement(anc);
        }
        if (/^(TABLE)$/i.test(anc.tagName || '')) break;
        anc = anc.parentElement;
    }
}

/** Office-pasted cells often keep inline styles on nested spans that override commitStyle. */
function reinforceCellDescendantStyle(cell, prop, value) {
    if (!cell || !prop || value == null || value === '') return;
    try {
        cell.style.setProperty(prop, value, 'important');
        const nodes = cell.querySelectorAll('span, p, div, font, li');
        for (let i = 0; i < nodes.length; i += 1) {
            nodes[i].style.setProperty(prop, value, 'important');
        }
        if (prop === 'color') {
            cell.querySelectorAll('font[color]').forEach((el) => {
                el.removeAttribute('color');
                el.style.setProperty('color', value, 'important');
            });
            if (cell.tagName === 'TD' || cell.tagName === 'TH') {
                cell.setAttribute('data-ems-cell-color', value);
            }
        }
        if (prop === 'font-family') {
            cell.querySelectorAll('font[face]').forEach((el) => {
                el.removeAttribute('face');
                el.style.setProperty('font-family', value, 'important');
            });
        }
    } catch {
        /* ignore */
    }
}

function clearCellDescendantStyle(cell, prop) {
    if (!cell || !prop) return;
    try {
        cell.style.removeProperty(prop);
        const nodes = cell.querySelectorAll('span, p, div, font, li');
        for (let i = 0; i < nodes.length; i += 1) {
            nodes[i].style.removeProperty(prop);
        }
        if (prop === 'color') {
            cell.querySelectorAll('font[color]').forEach((el) => el.removeAttribute('color'));
            if (cell.tagName === 'TD' || cell.tagName === 'TH') {
                cell.removeAttribute('data-ems-cell-color');
            }
        }
        if (prop === 'font-family') {
            cell.querySelectorAll('font[face]').forEach((el) => el.removeAttribute('face'));
        }
    } catch {
        /* ignore */
    }
}

/** Fast whole-cell styling — avoids per-cell selectRange + commitStyle (slow on large tables). */
function applyFastStyleToTableCells(cells, prop, value) {
    cells.forEach((cell) => {
        if (value) {
            reinforceCellDescendantStyle(cell, prop, value);
        } else {
            clearCellDescendantStyle(cell, prop);
        }
    });
}

function applyCommitStyleToEachCell(jodit, cells, styleOptions, reinforce) {
    if (reinforce) {
        applyFastStyleToTableCells(cells, reinforce.prop, reinforce.value);
    } else {
        cells.forEach((cell) => {
            try {
                const range = cell.ownerDocument.createRange();
                range.selectNodeContents(cell);
                jodit.s.selectRange(range);
                jodit.s.commitStyle(styleOptions);
            } catch {
                /* ignore */
            }
        });
    }
    clearEditorTextSelection(jodit);
    restoreTableCellSelection(jodit, cells);
}

function applyToggleFormatToCells(jodit, cells, format) {
    const connected = cells.filter((c) => c?.isConnected);
    if (!connected.length) return;

    const specs = {
        bold: {
            isActive: isCellBold,
            apply: (cell) => reinforceCellDescendantStyle(cell, 'font-weight', 'bold'),
            remove: removeBoldFromCell,
        },
        italic: {
            isActive: isCellItalic,
            apply: (cell) => reinforceCellDescendantStyle(cell, 'font-style', 'italic'),
            remove: removeItalicFromCell,
        },
        underline: {
            isActive: isCellUnderline,
            apply: (cell) => reinforceCellDescendantStyle(cell, 'text-decoration', 'underline'),
            remove: removeUnderlineFromCell,
        },
        strikethrough: {
            isActive: isCellStrikethrough,
            apply: (cell) => reinforceCellDescendantStyle(cell, 'text-decoration', 'line-through'),
            remove: removeStrikethroughFromCell,
        },
    };

    const spec = specs[format];
    if (!spec) return;
    const anyActive = connected.some((cell) => spec.isActive(cell));
    connected.forEach((cell) => {
        if (anyActive) spec.remove(cell);
        else spec.apply(cell);
    });
    clearEditorTextSelection(jodit);
    restoreTableCellSelection(jodit, connected);
}

function getTableFormatCellsForToolbar(jodit) {
    const getEditorBody =
        typeof jodit.__emsClauseEditorBody === 'function'
            ? jodit.__emsClauseEditorBody
            : () => jodit.editor || null;
    return resolveTableFormatCellTargets(jodit, getEditorBody);
}

/** `true` / `false` for table cells; `null` = use Jodit default (text selection). */
export function getTableFormatToolbarActiveState(jodit, format) {
    const cells = getTableFormatCellsForToolbar(jodit);
    if (!cells.length) return null;
    const checks = {
        bold: isCellBold,
        italic: isCellItalic,
        underline: isCellUnderline,
        strikethrough: isCellStrikethrough,
    };
    const probe = checks[format];
    if (!probe) return null;
    const states = cells.map((cell) => probe(cell));
    return states.every(Boolean);
}

/** Apply toolbar format to highlighted table cells (returns true when handled). */
export function tryApplyTableCellFormatCommand(jodit, getEditorBody, command, value) {
    if (!jodit) return false;
    const getter =
        typeof getEditorBody === 'function' ? getEditorBody : () => jodit.editor || null;
    return tryApplyFormatToMultiSelectedCells(jodit, getter, command, value);
}

/** Read a uniform inline style from highlighted table cells (for toolbar indicators). */
export function readUniformTableCellStyle(jodit, cssProp) {
    const cells = getTableFormatCellsForToolbar(jodit);
    if (!cells.length) return null;

    const readCell = (cell) => {
        const inline = cell.style?.getPropertyValue(cssProp);
        if (inline) return inline.trim();
        for (const el of cell.querySelectorAll('span, p, div, font, li')) {
            const v = el.style?.getPropertyValue(cssProp);
            if (v) return v.trim();
        }
        return '';
    };

    const values = cells.map(readCell);
    if (!values.length) return null;
    const first = values[0];
    return values.every((v) => v === first) ? first || null : null;
}

export function buildTableFormatToolbarControlOverrides() {
    const withTableActive = (format) => ({
        isActive: (editor) => {
            const state = getTableFormatToolbarActiveState(editor, format);
            return state === null ? undefined : state;
        },
    });
    return {
        bold: withTableActive('bold'),
        italic: withTableActive('italic'),
        underline: withTableActive('underline'),
        strikethrough: withTableActive('strikethrough'),
    };
}

/** True when toolbar formatting should target highlighted cells, not a text range. */
/** Remember highlighted table cells before toolbar / dropdown steals focus. */
export function armTableToolbarCellStash(jodit, getEditorBody) {
    if (!jodit) return;
    const getter =
        typeof getEditorBody === 'function' ? getEditorBody : () => jodit.editor || null;
    if (hasActiveTextRangeSelection(jodit, getter)) return;

    const cells = resolveTableFormatCellTargets(jodit, getter);
    if (!cells.length) return;

    jodit.__emsFormatTableCells = cells;
    jodit.__emsToolbarCellFormat = true;
    jodit.__emsTableToolbarInteracting = true;
    if (jodit.__emsTableToolbarArmTimer) {
        window.clearTimeout(jodit.__emsTableToolbarArmTimer);
    }
    jodit.__emsTableToolbarArmTimer = window.setTimeout(() => {
        jodit.__emsTableToolbarArmTimer = null;
        jodit.__emsTableToolbarInteracting = false;
    }, 2000);
}

export function preserveTableFormatCellSelection(jodit) {
    const staged = getStagedTableFormatCells(jodit);
    if (staged.length) {
        scheduleTableCellSelectionKeepAlive(jodit, staged, { light: true });
    }
}

export function shouldSkipToolbarTextRestoreForTableCells(jodit, getEditorBody) {
    if (jodit.__emsSkipToolbarSelRestore) return true;
    if (isCaretInTableCell(jodit, getEditorBody)) return true;
    const staged = getStagedTableFormatCells(jodit);
    if (staged.length >= 1) return true;
    if (hasActiveTextRangeSelection(jodit, getEditorBody)) return false;
    const live = getSelectedTableCells(jodit);
    if (live.length >= 1) return true;
    return Boolean(jodit.__emsToolbarCellFormat && staged.length >= 1);
}

function restoreStagedTableCellSelection(jodit, cells, { refreshToolbar = false } = {}) {
    const connected = (cells || getStagedTableFormatCells(jodit)).filter((c) => c?.isConnected);
    if (!connected.length) return [];
    jodit.__emsFormatTableCells = connected;
    jodit.__emsToolbarCellFormat = true;
    clearEditorTextSelection(jodit);
    restoreTableCellSelection(jodit, connected);
    markTableCellSelectingAttribute(connected);
    if (refreshToolbar) {
        jodit.e?.fire?.('updateToolbar');
    }
    return connected;
}

function scheduleTableCellSelectionKeepAlive(jodit, cells, { light = false } = {}) {
    const connected = restoreStagedTableCellSelection(jodit, cells);
    if (!connected.length) return;

    if (jodit.__emsTableSelKeepAliveTimer) {
        window.clearTimeout(jodit.__emsTableSelKeepAliveTimer);
    }

    jodit.__emsPreserveMultiTableSelect = true;

    if (light) {
        jodit.__emsTableSelKeepAliveTimer = window.setTimeout(() => {
            jodit.__emsTableSelKeepAliveTimer = null;
            jodit.__emsPreserveMultiTableSelect = false;
        }, 60);
        return;
    }

    requestAnimationFrame(() => {
        restoreStagedTableCellSelection(jodit, connected);
        jodit.__emsTableSelKeepAliveTimer = window.setTimeout(() => {
            jodit.__emsTableSelKeepAliveTimer = null;
            jodit.__emsPreserveMultiTableSelect = false;
        }, 80);
    });
}

function applyTextAlignToCells(cells, command) {
    const cmd = String(command || '').toLowerCase();
    let align = '';
    if (cmd === 'justifyfull') align = 'justify';
    else if (cmd === 'justifyright') align = 'right';
    else if (cmd === 'justifyleft') align = 'left';
    else if (cmd === 'justifycenter') align = 'center';
    if (!align) return;
    cells.forEach((cell) => {
        /* Must beat pricing default CSS (text-align: … !important). */
        cell.setAttribute('data-ems-align-custom', '1');
        cell.setAttribute('data-ems-align', align);
        cell.setAttribute('align', align);
        cell.style.setProperty('text-align', align, 'important');
        cell.querySelectorAll('p, div, span, li').forEach((el) => {
            el.style.setProperty('text-align', 'inherit', 'important');
        });
    });
}

function applyInlineStyleToCells(cells, styleProp, value) {
    cells.forEach((cell) => {
        if (value === '' || value == null) {
            cell.style.removeProperty(styleProp);
        } else {
            cell.style[styleProp] = value;
        }
    });
}

function isTransparentCellBackground(value) {
    const v = String(value ?? '').trim().toLowerCase();
    return !v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'inherit' || v === 'none';
}

function clearDescendantBackgrounds(cell) {
    cell.querySelectorAll('span, font, p, div, li').forEach((el) => {
        if (el === cell) return;
        el.style?.removeProperty('background-color');
        el.style?.removeProperty('background');
    });
}

const OFFICE_FILL_STYLE_PROPS = [
    'background',
    'background-color',
    'mso-background-source',
    'mso-pattern',
    'mso-shading',
];

function clearElementOfficeFill(el) {
    if (!el?.style) return;
    OFFICE_FILL_STYLE_PROPS.forEach((prop) => el.style.removeProperty(prop));
    el.removeAttribute?.('bgcolor');
}

const TABLE_CELL_NO_FILL_COLOR = '#ffffff';

/** Strip Excel/Word cell shading from the cell and every nested node. */
function clearCellBackgroundFill(cell) {
    if (!cell) return;
    const nodes = [cell, ...cell.querySelectorAll('*')];
    for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (!cell.contains(el)) continue;
        clearElementOfficeFill(el);
    }
}

/** Word-style “No Color” — opaque white cell beats Jodit selection tint and Excel row fills. */
function resetTableCellBackgroundFill(cell) {
    if (!cell) return;
    clearCellBackgroundFill(cell);
    cell.style.setProperty('background-color', TABLE_CELL_NO_FILL_COLOR, 'important');
    cell.style.setProperty('background', TABLE_CELL_NO_FILL_COLOR, 'important');
    cell.querySelectorAll('*').forEach((child) => {
        if (!cell.contains(child)) return;
        clearElementOfficeFill(child);
        child.style.setProperty('background-color', 'transparent', 'important');
        child.style.setProperty('background', 'transparent', 'important');
    });
}

/** Excel often paints header rows on <tr> / <col> — clearing td/th alone leaves the row tint. */
function clearTableRowAndColFillsForCells(cells) {
    const tables = new Set();
    (cells || []).forEach((cell) => {
        const table = cell?.closest?.('table');
        if (table) tables.add(table);
    });
    tables.forEach((table) => {
        const selected = (cells || []).filter((c) => table.contains(c));
        const allCells = table.querySelectorAll('td, th');
        const fullTable = selected.length >= allCells.length;
        const rows = fullTable
            ? table.querySelectorAll('tr')
            : [...new Set(selected.map((c) => c.closest('tr')).filter(Boolean))];
        rows.forEach((tr) => {
            clearElementOfficeFill(tr);
            tr.style.setProperty('background-color', TABLE_CELL_NO_FILL_COLOR, 'important');
            tr.style.setProperty('background', TABLE_CELL_NO_FILL_COLOR, 'important');
            tr.querySelectorAll('td, th').forEach((inner) => resetTableCellBackgroundFill(inner));
        });
        if (fullTable) {
            table.querySelectorAll('colgroup col').forEach((col) => clearElementOfficeFill(col));
        }
    });
}

/** Full cell fill — not highlight behind selected characters. */
function applyCellBackgroundColor(cells, value) {
    const clear = isTransparentCellBackground(value);
    cells.forEach((cell) => {
        if (clear) {
            resetTableCellBackgroundFill(cell);
            cell.removeAttribute('data-ems-cell-fill');
            cell.removeAttribute('data-ems-cell-bg');
            cell.setAttribute('data-ems-bg-none', '1');
        } else {
            cell.style.setProperty('background-color', value, 'important');
            cell.style.setProperty('background', value, 'important');
            cell.setAttribute('data-ems-cell-fill', '1');
            cell.setAttribute('data-ems-cell-bg', value);
            cell.removeAttribute('data-ems-bg-none');
            clearDescendantBackgrounds(cell);
            cell.querySelectorAll('*').forEach((child) => {
                if (!cell.contains(child)) return;
                child.style.setProperty('background-color', 'transparent', 'important');
                child.style.setProperty('background', 'transparent', 'important');
            });
        }
    });
    if (clear) {
        clearTableRowAndColFillsForCells(cells);
    }
}

function applyVerticalAlignToCells(cells, align) {
    const val = align === 'top' || align === 'middle' || align === 'bottom' ? align : '';
    cells.forEach((cell) => {
        if (val) {
            cell.setAttribute('data-ems-valign', val);
            cell.style.setProperty('vertical-align', val, 'important');
            cell.setAttribute('valign', val);
        } else {
            cell.removeAttribute('data-ems-valign');
            cell.style.removeProperty('vertical-align');
            cell.removeAttribute('valign');
        }
    });
}

function singleCellTextRange(jodit) {
    const root =
        (typeof jodit?.__emsClauseEditorBody === 'function' && jodit.__emsClauseEditorBody()) ||
        jodit?.editor ||
        null;
    let range = null;
    try {
        const sel = root?.ownerDocument?.getSelection?.() || jodit?.s?.sel;
        if (sel?.rangeCount && !sel.isCollapsed && String(sel).trim()) {
            range = sel.getRangeAt(0);
        }
    } catch {
        range = null;
    }
    if ((!range || range.collapsed) && jodit?.s?.range && !jodit.s.range.collapsed) {
        range = jodit.s.range;
    }
    if (!range || range.collapsed) return null;
    const startEl =
        range.startContainer?.nodeType === 1
            ? range.startContainer
            : range.startContainer?.parentElement;
    const endEl =
        range.endContainer?.nodeType === 1 ? range.endContainer : range.endContainer?.parentElement;
    const startCell = startEl?.closest?.('td, th');
    const endCell = endEl?.closest?.('td, th');
    if (!startCell || startCell !== endCell) return null;
    if (!startCell.contains(range.startContainer) || !startCell.contains(range.endContainer)) {
        return null;
    }
    return range;
}

/** Nearest explicit style wins. An older bold wrapper outside an unbold span must not count. */
function rangeNodeHasFormat(node, format) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el) {
        const atCell = /^(TD|TH)$/i.test(el.tagName || '');
        if (format === 'bold') {
            if (atCell) break;
            const fw = (el.style?.getPropertyValue('font-weight') || '').trim();
            if (fw) return isBoldWeight(fw);
            if (/^(STRONG|B)$/i.test(el.tagName || '')) return true;
        } else if (format === 'italic') {
            if (atCell) break;
            const fs = (el.style?.getPropertyValue('font-style') || '').trim();
            if (fs) return /italic|oblique/i.test(fs);
            if (/^(I|EM)$/i.test(el.tagName || '')) return true;
        } else if (format === 'underline' || format === 'strikethrough') {
            const deco = (
                el.style?.getPropertyValue('text-decoration-line') ||
                el.style?.getPropertyValue('text-decoration') ||
                ''
            ).trim();
            /* "none" is explicit — keep walking so a parent line-through still counts. */
            if (deco && !/^none$/i.test(deco)) {
                if (format === 'underline') return /underline/i.test(deco);
                return /line-through/i.test(deco);
            }
            if (format === 'underline' && /^U$/i.test(el.tagName || '')) return true;
            if (format === 'strikethrough' && /^(S|STRIKE|DEL)$/i.test(el.tagName || '')) return true;
            if (atCell) break;
        } else if (atCell) {
            break;
        }
        el = el.parentElement;
    }
    return false;
}

function nearestTextDecoration(node) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el) {
        const deco = (
            el.style?.getPropertyValue('text-decoration-line') ||
            el.style?.getPropertyValue('text-decoration') ||
            ''
        ).trim();
        if (deco && !/^none$/i.test(deco)) return deco;
        if (/^U$/i.test(el.tagName || '')) return 'underline';
        if (/^(S|STRIKE|DEL)$/i.test(el.tagName || '')) return 'line-through';
        if (/^(TD|TH)$/i.test(el.tagName || '')) break;
        el = el.parentElement;
    }
    return '';
}

/** Keep underline and strike independent. Turning one off must not lock the other off. */
function decorationAfterToggle(current, format, turnOff) {
    let underline = /underline/i.test(current);
    let strike = /line-through/i.test(current);
    if (format === 'underline') underline = !turnOff;
    if (format === 'strikethrough') strike = !turnOff;
    const parts = [];
    if (underline) parts.push('underline');
    if (strike) parts.push('line-through');
    return parts.join(' ') || 'none';
}

function selectInsertedFormatSpan(span, jodit) {
    const doc = span?.ownerDocument;
    if (!doc) return;
    try {
        const next = doc.createRange();
        next.selectNodeContents(span);
        const sel = doc.getSelection?.() || doc.defaultView?.getSelection?.();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(next);
        }
        if (jodit?.s?.selectRange) jodit.s.selectRange(next);
    } catch {
        /* ignore */
    }
}

/**
 * Paint the highlighted run. !important replaces an older lock on the same words
 * so bold / italic / underline / strike / color can be changed again.
 */
function applyInlinePaintToTableCellRange(range, paint, jodit, tagName = 'span') {
    const doc = range?.startContainer?.ownerDocument;
    if (!doc || typeof paint !== 'function') return false;
    let frag;
    try {
        frag = range.extractContents();
    } catch {
        return false;
    }
    if (!String(frag?.textContent || '').replace(/\u00a0/g, ' ').trim()) {
        if (frag) range.insertNode(frag);
        return false;
    }
    const span = doc.createElement(tagName || 'span');
    const walk = (el) => {
        if (!el || el.nodeType !== 1) return;
        paint(el);
        [...el.children].forEach(walk);
    };
    paint(span);
    [...frag.childNodes].forEach(walk);
    span.appendChild(frag);
    range.insertNode(span);
    selectInsertedFormatSpan(span, jodit);
    return true;
}

function decorationTagsFor(format) {
    return format === 'underline' ? ['U'] : ['S', 'STRIKE', 'DEL'];
}

function clearDecorationOnElement(el, format) {
    if (!el || el.nodeType !== 1) return;
    const tags = decorationTagsFor(format);
    if (tags.includes(String(el.tagName || '').toUpperCase())) {
        unwrapElement(el);
        return;
    }
    const deco = (
        el.style?.getPropertyValue('text-decoration-line') ||
        el.style?.getPropertyValue('text-decoration') ||
        ''
    ).trim();
    if (!deco) return;
    const token = format === 'underline' ? 'underline' : 'line-through';
    if (!new RegExp(token, 'i').test(deco) && !/^none$/i.test(deco)) return;
    const next = decorationAfterToggle(deco, format, true);
    el.style.setProperty('text-decoration', next === 'none' ? 'none' : next, 'important');
    el.style.setProperty('text-decoration-line', next === 'none' ? 'none' : next, 'important');
}

/** Remove underline or strike from the highlighted run, including wrappers and the cell. */
function clearTableCellDecoration(range, format) {
    const doc = range?.startContainer?.ownerDocument;
    if (!doc) return false;
    const tags = decorationTagsFor(format);
    const token = format === 'underline' ? 'underline' : 'line-through';
    let frag;
    try {
        frag = range.extractContents();
    } catch {
        return false;
    }
    if (!String(frag?.textContent || '').replace(/\u00a0/g, ' ').trim()) {
        if (frag) range.insertNode(frag);
        return false;
    }
    const stripEl = (el) => {
        if (!el || el.nodeType !== 1) return;
        [...el.children].forEach(stripEl);
        clearDecorationOnElement(el, format);
    };
    [...frag.childNodes].forEach(stripEl);
    const holder = doc.createElement('span');
    /* Cancel parent decoration that CSS still paints through children. */
    holder.style.setProperty('text-decoration', 'none', 'important');
    holder.style.setProperty('text-decoration-line', 'none', 'important');
    holder.appendChild(frag);
    range.insertNode(holder);
    let parent = holder.parentElement;
    const cell = parent?.closest?.('td, th');
    while (parent && parent !== cell) {
        const next = parent.parentElement;
        const deco = (
            parent.style?.getPropertyValue('text-decoration-line') ||
            parent.style?.getPropertyValue('text-decoration') ||
            ''
        );
        const hasToken =
            tags.includes(String(parent.tagName || '').toUpperCase()) ||
            new RegExp(token, 'i').test(deco);
        if (hasToken) {
            if (tags.includes(String(parent.tagName || '').toUpperCase())) {
                unwrapElement(parent);
            } else {
                clearDecorationOnElement(parent, format);
            }
        }
        parent = next;
    }
    if (cell) {
        /* Parent decoration paints through children — clear it on the cell box itself. */
        clearDecorationOnElement(cell, format);
    }
    if (holder.isConnected) unwrapElement(holder);
    return true;
}

/** Bold/italic/underline/strike on the highlighted run only. */
function applyInlineFormatToTableCellRange(range, format, jodit) {
    const turnOff = rangeNodeHasFormat(range.startContainer, format);
    if (format === 'bold') {
        const weight = turnOff ? '400' : '700';
        return applyInlinePaintToTableCellRange(
            range,
            (el) => el.style.setProperty('font-weight', weight, 'important'),
            jodit
        );
    }
    if (format === 'italic') {
        const style = turnOff ? 'normal' : 'italic';
        return applyInlinePaintToTableCellRange(
            range,
            (el) => el.style.setProperty('font-style', style, 'important'),
            jodit
        );
    }
    if (format === 'underline' || format === 'strikethrough') {
        const line = format === 'underline' ? 'underline' : 'line-through';
        const tag = format === 'underline' ? 'u' : 's';
        const startEl =
            range.startContainer?.nodeType === 1
                ? range.startContainer
                : range.startContainer?.parentElement;
        const cell = startEl?.closest?.('td, th');
        /*
         * Strike may live on the tr/table (Office) while the selection only sees
         * clear spans — still treat as turn-off so we never stack a second line.
         */
        const cellHasStrike = format === 'strikethrough' && cell && isCellStrikethrough(cell);
        const cellHasUnderline = format === 'underline' && cell && isCellUnderline(cell);
        if (turnOff || cellHasStrike || cellHasUnderline) {
            if (cellHasStrike) {
                removeStrikethroughFromCell(cell);
                return true;
            }
            if (cellHasUnderline) {
                removeUnderlineFromCell(cell);
                return true;
            }
            return clearTableCellDecoration(range, format);
        }
        return applyInlinePaintToTableCellRange(
            range,
            (el) => {
                el.style.setProperty('text-decoration', line, 'important');
                el.style.setProperty('text-decoration-line', line, 'important');
                el.style.setProperty('text-decoration-thickness', '1px', 'important');
                if (format === 'underline') {
                    el.style.setProperty('text-underline-offset', '0.08em', 'important');
                    el.style.setProperty('text-decoration-skip-ink', 'none', 'important');
                }
            },
            jodit,
            tag
        );
    }
    return false;
}

function isClearedTextBackground(value) {
    const v = String(value ?? '').trim().toLowerCase().replace(/\s/g, '');
    return !v || v === 'transparent' || v === 'none' || v === 'inherit' || v === 'rgba(0,0,0,0)';
}

function finishInlineTableTextFormat(jodit, cmd) {
    jodit.__emsFormatTableCells = null;
    jodit.__emsToolbarCellFormat = false;
    try {
        if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
        jodit.e?.fire?.('afterCommand', cmd);
        jodit.e?.fire?.('updateToolbar');
    } catch {
        /* ignore */
    }
}

function tryApplyFormatToMultiSelectedCells(jodit, getEditorBody, command, value) {
    const cmd = String(command || '').toLowerCase();
    const textRange = singleCellTextRange(jodit);
    if (textRange && /^(bold|italic|underline|strikethrough)$/.test(cmd)) {
        if (applyInlineFormatToTableCellRange(textRange, cmd, jodit)) {
            finishInlineTableTextFormat(jodit, cmd);
            return true;
        }
    }
    if (textRange && (cmd === 'forecolor' || cmd === 'emsforecolor') && value) {
        const color = String(value);
        if (
            applyInlinePaintToTableCellRange(
                textRange,
                (el) => el.style.setProperty('color', color, 'important'),
                jodit
            )
        ) {
            finishInlineTableTextFormat(jodit, cmd);
            return true;
        }
    }
    if (textRange && (cmd === 'background' || cmd === 'emsbackground')) {
        const clear = isClearedTextBackground(value);
        const color = clear ? 'transparent' : String(value);
        if (
            applyInlinePaintToTableCellRange(
                textRange,
                (el) => {
                    el.style.removeProperty('background');
                    el.style.setProperty('background-color', color, 'important');
                },
                jodit
            )
        ) {
            finishInlineTableTextFormat(jodit, cmd);
            return true;
        }
    }
    const cellLevelOnly = cmd === 'background';
    const cells = cellLevelOnly
        ? getTableCellsForCellLevelFormat(jodit, getEditorBody)
        : getCellsForTableFormatting(jodit, getEditorBody);
    if (!cells.length) return false;

    jodit.__emsSkipTableSelSync = true;
    jodit.__emsSkipToolbarSelRestore = true;

    try {
        switch (cmd) {
            case 'bold':
                applyToggleFormatToCells(jodit, cells, 'bold');
                break;
            case 'italic':
                applyToggleFormatToCells(jodit, cells, 'italic');
                break;
            case 'underline':
                applyToggleFormatToCells(jodit, cells, 'underline');
                break;
            case 'strikethrough':
                applyToggleFormatToCells(jodit, cells, 'strikethrough');
                break;
            case 'superscript':
                applyCommitStyleToEachCell(jodit, cells, { element: 'sup' });
                break;
            case 'subscript':
                applyCommitStyleToEachCell(jodit, cells, { element: 'sub' });
                break;
            case 'forecolor':
                applyFastStyleToTableCells(cells, 'color', value || '');
                clearEditorTextSelection(jodit);
                restoreTableCellSelection(jodit, cells);
                break;
            case 'background':
                applyCellBackgroundColor(cells, value);
                clearEditorTextSelection(jodit);
                restoreTableCellSelection(jodit, cells);
                break;
            case 'fontsize': {
                let size = value != null ? String(value) : '';
                if (size && !/px|pt|em|rem|%$/i.test(size)) {
                    size = normalizeSize(size, jodit.o?.defaultFontSizePoints || 'pt');
                }
                /* Jodit leaves decimals unitless ("10.5") — invalid CSS; force pt/px. */
                if (size && !/px|pt|em|rem|%$/i.test(size) && /^-?[\d.]+$/i.test(size)) {
                    const unit = String(jodit.o?.defaultFontSizePoints || 'pt').replace(/[^a-z%]/gi, '') || 'pt';
                    size = `${size}${unit}`;
                }
                applyFastStyleToTableCells(cells, 'font-size', size);
                clearEditorTextSelection(jodit);
                restoreTableCellSelection(jodit, cells);
                break;
            }
            case 'fontname':
                applyFastStyleToTableCells(cells, 'font-family', value || '');
                clearEditorTextSelection(jodit);
                restoreTableCellSelection(jodit, cells);
                break;
            case 'applylineheight':
                applyInlineStyleToCells(cells, 'lineHeight', value != null ? String(value) : '');
                break;
            case 'justifyleft':
            case 'justifycenter':
            case 'justifyright':
            case 'justifyfull':
                applyTextAlignToCells(cells, cmd);
                break;
            case 'eraser':
                cells.forEach((cell) => {
                    cell.removeAttribute('style');
                    cell.removeAttribute('data-ems-valign');
                    cell.removeAttribute('valign');
                    cell.removeAttribute('data-ems-align-custom');
                    cell.removeAttribute('data-ems-align');
                    cell.removeAttribute('align');
                    cell.querySelectorAll('[style]').forEach((el) => {
                        el.removeAttribute('style');
                    });
                });
                break;
            default:
                return false;
        }
    } finally {
        const connected = cells.filter((c) => c?.isConnected);
        if (connected.length >= 2) {
            restoreStagedTableCellSelection(jodit, connected);
        } else {
            clearTableCellBlockSelectionForTextEdit(jodit, getEditorBody);
        }
        jodit.__emsSkipTableSelSync = false;
    }

    const stagedAfter = getStagedTableFormatCells(jodit);
    if (stagedAfter.length >= 2) {
        scheduleTableCellSelectionKeepAlive(jodit, stagedAfter);
    }
    window.setTimeout(() => {
        jodit.__emsSkipToolbarSelRestore = false;
    }, 120);
    try {
        if (typeof jodit.synchronizeValues === 'function') {
            jodit.synchronizeValues();
        }
        jodit.e?.fire?.('afterCommand', cmd);
        jodit.e?.fire?.('updateToolbar');
    } catch {
        /* ignore */
    }
    return true;
}

/** Re-apply blue cell highlights after Jodit syncs DOM/selection post-format. */
function registerTableFormatSelectionKeeper(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableFmtSelKeeper) return;
    jodit.__emsTableFmtSelKeeper = true;

    const maybeRestore = () => {
        if (
            jodit.__emsPreserveMultiTableSelect ||
            jodit.__emsSkipTableSelSync ||
            jodit.__emsTableToolbarInteracting
        ) {
            return;
        }
        const staged = getStagedTableFormatCells(jodit);
        if (!staged.length || staged.length < 2) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const sel = root?.ownerDocument?.getSelection?.();
        const hasRealTextSel = sel && !sel.isCollapsed && String(sel).trim();
        if (hasRealTextSel) return;
        restoreStagedTableCellSelection(jodit, staged);
    };

    jodit.e.on('afterCommand.emsTableFmtKeepSel', (command) => {
        if (!TABLE_FORMAT_CMD_RE.test(String(command || '').toLowerCase())) return;
        maybeRestore();
    });
}

/** Toolbar commands while multiple table cells are selected (bold, colors, align, etc.). */
function registerTableMultiCellFormatting(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableMultiFormat) return;
    jodit.__emsTableMultiFormat = true;

    jodit.e.on('beforeCommand.emsMultiCellFmt', (command, _ui, value) => {
        if (TABLE_STRUCTURE_CMD_RE.test(String(command || ''))) {
            return;
        }
        if (tryApplyFormatToMultiSelectedCells(jodit, getEditorBody, command, value)) {
            return false;
        }
    });

    const onToolbarPointerDown = (e) => {
        const target = e.target;
        if (!target?.closest) return;
        if (
            target.closest(
                '.jodit-toolbar, .jodit-toolbar__box, .jodit-popup, .jodit-toolbar-select, .jodit-toolbar-button, .jodit-color-picker'
            )
        ) {
            armTableToolbarCellStash(jodit, getEditorBody);
        }
    };

    jodit.events.on('mousedown', onToolbarPointerDown, true);

    const attachDocToolbarStash = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const doc = root?.ownerDocument || document;
        if (!doc || doc.__emsTableToolbarStashBound) return;
        doc.__emsTableToolbarStashBound = true;
        doc.addEventListener('mousedown', onToolbarPointerDown, true);
        jodit.e.on('beforeDestruct', () => {
            doc.removeEventListener('mousedown', onToolbarPointerDown, true);
        });
    };
    jodit.e.on('afterInit', attachDocToolbarStash);
    attachDocToolbarStash();
}

function clearTableCellBlockSelectionForTextEdit(jodit, getEditorBody) {
    if (!hasCollapsedCaretInTableCell(jodit, getEditorBody)) return false;
    const selected = getSelectedTableCells(jodit);
    if (!selected.length) return false;
    jodit.__emsFormatTableCells = null;
    jodit.__emsToolbarCellFormat = false;
    clearAllTableCellSelection(jodit);
    return true;
}

/** When the user selects text inside a cell, drop multi-cell stash so forecolor/background work. */
function registerTableTextSelectionGuard(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableTextSelGuard) return;
    jodit.__emsTableTextSelGuard = true;

    const onSelectionChange = () => {
        if (jodit.__emsTableCellDragActive) return;
        if (jodit.__emsPreserveMultiTableSelect || jodit.__emsSkipTableSelSync) return;
        if (jodit.__emsTableStructureJustRan) return;
        if (jodit.__emsTableHistorySync || jodit.__emsForceCaretRestore) return;

        const collapsedInCell = hasCollapsedCaretInTableCell(jodit, getEditorBody);
        const staged = getStagedTableFormatCells(jodit);
        if (jodit.__emsTableToolbarInteracting && staged.length >= 1) {
            if (collapsedInCell) {
                jodit.__emsFormatTableCells = null;
                jodit.__emsToolbarCellFormat = false;
                clearAllTableCellSelection(jodit);
                return;
            }
            if (staged.length >= 2) {
                restoreStagedTableCellSelection(jodit, staged);
            }
            return;
        }

        if (staged.length >= 2) {
            if (hasActiveTextRangeSelection(jodit, getEditorBody) || collapsedInCell) {
                jodit.__emsFormatTableCells = null;
                jodit.__emsToolbarCellFormat = false;
                clearAllTableCellSelection(jodit);
                return;
            }
            restoreStagedTableCellSelection(jodit, staged);
            return;
        }
        if (staged.length === 1 && collapsedInCell) {
            jodit.__emsFormatTableCells = null;
            jodit.__emsToolbarCellFormat = false;
            clearAllTableCellSelection(jodit);
            return;
        }

        if (jodit.__emsToolbarCellFormat) return;
        if (hasActiveTextRangeSelection(jodit, getEditorBody)) {
            jodit.__emsFormatTableCells = null;
            clearAllTableCellSelection(jodit);
            return;
        }
        if (collapsedInCell && getSelectedTableCells(jodit).length >= 1) {
            jodit.__emsFormatTableCells = null;
            jodit.__emsToolbarCellFormat = false;
            clearAllTableCellSelection(jodit);
            return;
        }
        if (getSelectedTableCells(jodit).length < 1) {
            jodit.__emsFormatTableCells = null;
        }
    };

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableTextSelGuardBound) return;
        root.__emsTableTextSelGuardBound = true;
        const doc = root.ownerDocument || document;
        const onTextEditKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.defaultPrevented) return;
            const key = e.key || '';
            const isPrintable =
                key.length === 1 ||
                key === 'Backspace' ||
                key === 'Delete' ||
                key === 'Enter' ||
                key === 'Tab';
            if (!isPrintable) return;
            /* Multi-cell / selecting lock blocks caret typing — clear on any text edit. */
            const staged = getStagedTableFormatCells(jodit);
            const selected = getSelectedTableCells(jodit);
            if (staged.length >= 2 || selected.length >= 2) {
                jodit.__emsFormatTableCells = null;
                jodit.__emsToolbarCellFormat = false;
                clearAllTableCellSelection(jodit);
            } else {
                clearTableCellBlockSelectionForTextEdit(jodit, getEditorBody);
            }
        };
        doc.addEventListener('selectionchange', onSelectionChange);
        root.addEventListener('keydown', onTextEditKeyDown, true);
        jodit.e.on('beforeDestruct', () => {
            doc.removeEventListener('selectionchange', onSelectionChange);
            root.removeEventListener('keydown', onTextEditKeyDown, true);
        });
    };
    jodit.e.on('afterInit', attach);
    attach();
}

/**
 * Delete / Backspace clears content of EMS-selected table cells (Word-like).
 * Native ranges are cleared during multi-cell select, so the browser cannot delete for us.
 */
function resolveTableCellsForContentClear(jodit, getEditorBody) {
    let cells = getSelectedTableCells(jodit).filter((c) => c?.isConnected);
    if (cells.length < 1) {
        cells = getStagedTableFormatCells(jodit);
    }
    if (cells.length < 1) {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        cells = [...(root?.querySelectorAll?.(`.${EMS_TABLE_CELL_SELECTED_CLASS}`) || [])];
    }
    return cells;
}

function registerTableCellClearOnDelete(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableCellClearOnDelete) return;
    jodit.__emsTableCellClearOnDelete = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableCellClearOnDeleteBound) return;
        root.__emsTableCellClearOnDeleteBound = true;

        const onKeyDown = (e) => {
            if (e.key !== 'Backspace' && e.key !== 'Delete') return;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if (jodit.__emsTableCellDragActive) return;

            /* Let normal typing delete selected text inside a single cell. */
            if (hasActiveTextRangeSelection(jodit, getEditorBody)) return;

            const cells = resolveTableCellsForContentClear(jodit, getEditorBody);
            if (cells.length < 1) return;

            /*
             * Single cell with a caret: browser/Jodit should delete characters normally.
             * Multi-cell (or one cell block-selected without a caret) → clear contents.
             */
            if (cells.length === 1 && hasCollapsedCaretInTableCell(jodit, getEditorBody)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }

            jodit.__emsPreserveMultiTableSelect = true;
            cells.forEach((td) => {
                if (td?.isConnected) td.innerHTML = '<br>';
            });
            restoreStagedTableCellSelection(jodit, cells);
            scheduleTableCellSelectionKeepAlive(jodit, cells, { light: true });
            if (typeof jodit.synchronizeValues === 'function') {
                jodit.synchronizeValues();
            }
            snapshotTableEditorHistory(jodit);
        };

        root.addEventListener('keydown', onKeyDown, true);
        jodit.e.on('beforeDestruct', () => {
            root.removeEventListener('keydown', onKeyDown, true);
        });
    };

    jodit.e.on('afterInit.emsTableCellClearOnDelete', attach);
    attach();
}

const JODIT_TABLE_COMMANDS = [
    'tableaddrowafter',
    'tableaddrowbefore',
    'tableaddcolumnafter',
    'tableaddcolumnbefore',
    'tablebin',
    'tablebinrow',
    'tablebincolumn',
    'tablemerge',
    'tableempty',
    'tablesplitv',
    'tablesplitg',
];

function joditBeforeCommandEventName(command) {
    const cmd = String(command || '').toLowerCase();
    return `beforeCommand${cmd.charAt(0).toUpperCase()}${cmd.slice(1)}`;
}

/** Create an empty table cell matching the editor document. */
function createEmptyTableCell(jodit, cell) {
    const doc = cell?.ownerDocument || jodit?.editor?.ownerDocument || document;
    const tag = String(cell?.tagName || 'TD').toLowerCase() === 'th' ? 'th' : 'td';
    const td =
        typeof jodit?.createInside?.element === 'function'
            ? jodit.createInside.element(tag)
            : doc.createElement(tag);
    td.appendChild(doc.createElement('br'));
    return td;
}

function setCellSpanAttr(cell, attrName, value) {
    if (!cell) return;
    if (value > 1) cell.setAttribute(attrName, String(value));
    else cell.removeAttribute(attrName);
}

/** Clear Jodit % / stale px width locks so a fresh col model can apply cleanly. */
function clearTableCellWidthLocks(table) {
    if (!table?.querySelectorAll) return;
    table.querySelectorAll('td, th').forEach((cell) => {
        cell.style.removeProperty('width');
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        if (cell.hasAttribute('width')) cell.removeAttribute('width');
    });
}

/** True when stored col model looks like % parts (10,62,8,…) not real CSS px. */
function storedColumnWidthsLookPercentLike(widths, a4W = 680) {
    if (!widths?.length) return true;
    const sum = widths.reduce((s, w) => s + (w > 0 ? w : 0), 0);
    if (!(sum > 0)) return true;
    if (sum < Math.max(220, Math.round((a4W || 680) * 0.45))) return true;
    /* 5+ schedules only — 4-col clause tables may legitimately keep a 24px "-" column. */
    if (widths.length >= 5 && widths.slice(-3).some((w) => w > 0 && w < 48)) return true;
    return false;
}

/**
 * Measure live logical column widths from the formal grid (colspan-aware).
 * Physical cell indexes are wrong once any row has colspan — never use those for BOQ.
 * @param {{ allowStoredFallback?: boolean }} [opts]
 */
function measureLogicalColumnWidthsLivePx(table, opts = {}) {
    const rows = getTableRows(table);
    if (!rows.length) return { widths: [], colCount: 0 };
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return { widths: [], colCount: 0 };
    const { grid } = buildTableCellGrid(table);
    const widths = new Array(colCount).fill(0);

    for (let j = 0; j < colCount; j += 1) {
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[j];
            if (!cell) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos || pos.col !== j) continue;
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (span !== 1) continue;
            const w = Math.round(cell.getBoundingClientRect?.().width || 0);
            if (w >= MIN_TABLE_COLUMN_WIDTH) {
                widths[j] = w;
                break;
            }
        }
    }

    /* Columns only covered by a colspan parent — divide that cell's width evenly. */
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] > 0) continue;
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[j];
            if (!cell) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos) continue;
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (j < pos.col || j >= pos.col + span) continue;
            const total = Math.round(cell.getBoundingClientRect?.().width || 0);
            if (total < MIN_TABLE_COLUMN_WIDTH) continue;
            const each = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(total / span));
            for (let k = pos.col; k < pos.col + span && k < colCount; k += 1) {
                if (widths[k] <= 0) widths[k] = each;
            }
            break;
        }
    }

    /*
     * Never fill gaps from percent-like stored models (10,62,8…) — that re-scrambled
     * enter-edit. Column drag works because it strips locks then measures paint.
     */
    if (opts.allowStoredFallback !== false) {
        const a4W = getA4InnerContentWidthPx(table.ownerDocument) || 680;
        const stored = readColumnWidthsPx(table, rows, colCount);
        if (!storedColumnWidthsLookPercentLike(stored, a4W)) {
            for (let j = 0; j < colCount; j += 1) {
                if (widths[j] <= 0) {
                    widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(stored[j] || 0));
                }
            }
        }
    }
    return { widths, colCount };
}

/**
 * Browse-mode paint (looks correct) → enter-edit (was scrambling).
 * Capture logical widths from .clause-content BEFORE React swaps in Jodit.
 */
let __emsPendingBrowseColWidths = null;

export function captureBrowseScheduleColumnWidthsFromRoot(root) {
    if (!root?.querySelectorAll) {
        __emsPendingBrowseColWidths = null;
        return;
    }
    const list = [];
    root.querySelectorAll('table').forEach((table) => {
        if (isEmsPricingSummaryTable(table)) return;
        if (table.getAttribute('data-ems-cell-split') === 'v') return;
        if (table.getAttribute('data-ems-cell-split') === 'h') return;
        if (table.closest?.('.ems-cell-split-v, .ems-cell-split-h')) return;
        const rows = getTableRows(table);
        if (!rows.length) return;
        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (colCount < 4) return;
        const zoom = getQuotePreviewZoomFactor(table) || 1;
        const z = zoom > 0.05 ? zoom : 1;
        const a4W = getA4InnerContentWidthPx(table.ownerDocument) || 680;
        const measured = measureLogicalColumnWidthsLivePx(table, { allowStoredFallback: false });
        const widths = (measured.widths || []).map((w) =>
            Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round((w || 0) / z))
        );
        while (widths.length < colCount) widths.push(DEFAULT_TABLE_COLUMN_WIDTH);
        if (storedColumnWidthsLookPercentLike(widths.slice(0, colCount), a4W)) {
            list.push(bootstrapBoqLikeColumnWidthsPx(colCount, a4W));
        } else {
            list.push(widths.slice(0, colCount));
        }
    });
    __emsPendingBrowseColWidths = list.length ? { list, at: Date.now() } : null;
}

function peekPendingBrowseScheduleColumnWidths() {
    const p = __emsPendingBrowseColWidths;
    if (!p?.list?.length) return null;
    if (Date.now() - p.at > 10000) {
        __emsPendingBrowseColWidths = null;
        return null;
    }
    return p.list;
}

/**
 * Apply browse-captured (or A4 bootstrap) widths — never re-measure the scrambled editor paint.
 * Column drag "fixes" it because it rewrites widths; enter-edit must do the same with known-good px.
 */
export function unscrambleOfficeScheduleTableLikeColumnDrag(table, browseWidths) {
    if (!table) return false;
    demoteMisTaggedBoqFromPricingSummary(table);
    if (isEmsPricingSummaryTable(table)) return false;
    if (isTableStructureResizeActiveForTable(table)) return false;
    const rows = getTableRows(table);
    if (!rows.length) return false;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (colCount < 4) return false;

    if (!isOfficePasteTableEl(table)) {
        table.setAttribute('data-ems-paste-source', 'office');
        table.classList.add('ems-office-paste-table');
    }

    /*
     * A finished column drag is the layout the user wants in edit and in browse.
     * Clearing it here was what reset Description / Amount after leaving edit.
     */
    const keptCustom = table.getAttribute('data-ems-col-widths-custom') === '1';
    const keptStored = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0);
    if (keptCustom && keptStored.length) {
        syncOfficePasteTableColumnLayout(table);
        table.setAttribute('data-ems-col-widths-custom', '1');
        table.setAttribute('data-ems-edit-cols-locked', '1');
        return true;
    }

    /* Full clear — leftover th widths vs new td widths is the header/body misalignment. */
    clearTableColumnWidthArtifacts(table);
    table.querySelectorAll('colgroup').forEach((cg) => cg.remove());
    stripOfficeMergeWidthArtifacts(table);
    table.querySelectorAll?.('col, td, th')?.forEach((el) => {
        el.style?.removeProperty?.('max-width');
    });
    table.style.setProperty('max-width', 'none', 'important');

    const zoom = getQuotePreviewZoomFactor(table) || 1;
    const z = zoom > 0.05 ? zoom : 1;
    const a4W = getA4InnerContentWidthPx(table.ownerDocument) || 680;
    /* Always fit to A4 — early editor host width is often too narrow and crushed Amount. */
    const availableW = a4W;

    let widths = null;
    if (
        Array.isArray(browseWidths) &&
        browseWidths.length >= colCount &&
        !storedColumnWidthsLookPercentLike(browseWidths.slice(0, colCount), a4W)
    ) {
        widths = browseWidths.slice(0, colCount).map((w) =>
            Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w || 0))
        );
    }
    if (!widths) {
        widths = bootstrapBoqLikeColumnWidthsPx(colCount, availableW);
    }

    fitColumnWidthsToMaxPx(widths, availableW);
    applyColumnWidths(table, rows, widths.slice(), { flexibleMin: true });
    forceSyncRowCellWidthsToColumnModel(table, widths);
    table.setAttribute('data-ems-col-widths-custom', '1');
    table.setAttribute('data-ems-edit-cols-locked', '1');
    table.style.setProperty('max-width', '100%', 'important');
    return true;
}

/** Walk every row by colspan and force the same px model on th and td (fixes header≠body). */
function forceSyncRowCellWidthsToColumnModel(table, widths) {
    if (!table || !widths?.length) return;
    const colCount = widths.length;
    table.querySelectorAll('tr').forEach((tr) => {
        let logical = 0;
        [...(tr.cells || [])].forEach((cell) => {
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (logical >= colCount) return;
            if (span === 1) {
                const floor = getColumnWidthFloor(colCount, logical);
                const px = Math.max(floor, Math.round(widths[logical] || floor));
                cell.style.setProperty('box-sizing', 'border-box', 'important');
                cell.style.setProperty('width', `${px}px`, 'important');
                cell.style.setProperty('min-width', `${floor}px`, 'important');
                cell.style.removeProperty('max-width');
                cell.setAttribute('width', String(px));
            } else {
                let sum = 0;
                for (let k = 0; k < span && logical + k < colCount; k += 1) {
                    sum += Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(widths[logical + k] || 0));
                }
                cell.removeAttribute('width');
                cell.style.removeProperty('width');
                cell.style.removeProperty('min-width');
                cell.style.removeProperty('max-width');
                if (sum > 0) {
                    cell.style.setProperty('width', `${sum}px`, 'important');
                }
            }
            logical += span;
        });
    });
}

export function unscrambleOfficeScheduleTablesInRootLikeColumnDrag(root) {
    if (!root?.querySelectorAll) return;
    const pending = peekPendingBrowseScheduleColumnWidths();
    const tables = root.matches?.('table')
        ? [root]
        : [...root.querySelectorAll('table')];
    let scheduleIdx = 0;
    tables.forEach((table) => {
        if (isEmsPricingSummaryTable(table)) return;
        if (table.getAttribute('data-ems-cell-split') === 'v') return;
        if (table.getAttribute('data-ems-cell-split') === 'h') return;
        if (table.closest?.('.ems-cell-split-v, .ems-cell-split-h')) return;
        const rows = getTableRows(table);
        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (colCount < 4) return;
        const snap = pending?.[scheduleIdx] || null;
        scheduleIdx += 1;
        unscrambleOfficeScheduleTableLikeColumnDrag(table, snap);
    });
}

/**
 * After vertical split inserts one logical column: half the source column width
 * for each half; leave every other column width unchanged (total table width same).
 */
function restoreColumnWidthsAfterVerticalCellSplit(table, splitColIndex, preWidths) {
    if (!table || !preWidths?.length || splitColIndex < 0 || splitColIndex >= preWidths.length) {
        return;
    }
    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;

    const srcW = Math.max(
        MIN_TABLE_COLUMN_WIDTH * 2,
        Math.round(preWidths[splitColIndex] || MIN_TABLE_COLUMN_WIDTH * 2)
    );
    const leftW = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.floor(srcW / 2));
    const rightW = Math.max(MIN_TABLE_COLUMN_WIDTH, srcW - leftW);

    /** @type {number[]} */
    const bisected = [];
    for (let j = 0; j < preWidths.length; j += 1) {
        if (j === splitColIndex) bisected.push(leftW, rightW);
        else bisected.push(Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(preWidths[j] || 0)));
    }

    /** @type {number[]} */
    let next;
    if (colCount === bisected.length) {
        next = bisected;
    } else if (colCount === preWidths.length) {
        /* Merged-cell colspan split — keep prior widths. */
        next = preWidths.map((w) => Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w || 0)));
    } else if (colCount > bisected.length) {
        next = bisected.slice();
        while (next.length < colCount) next.push(MIN_TABLE_COLUMN_WIDTH);
    } else {
        next = bisected.slice(0, colCount);
    }

    table.style.setProperty('table-layout', 'fixed', 'important');
    clearTableCellWidthLocks(table);
    applyColumnWidths(table, rows, next);
    table.setAttribute('data-ems-preserve-col-widths', '1');
    /* Re-apply on next frame after office/harmonize can fight widths. */
    requestAnimationFrame(() => {
        if (!table.isConnected) return;
        const reread = getTableRows(table);
        if (!reread.length) return;
        table.style.setProperty('table-layout', 'fixed', 'important');
        clearTableCellWidthLocks(table);
        applyColumnWidths(table, reread, next);
        table.setAttribute('data-ems-preserve-col-widths', '1');
    });
}

/**
 * Split a merged cell at the nearest internal boundary to the click,
 * or place the new half before/after a normal cell based on click side.
 */
function emsSplitTableCellAtPoint(jodit, tableModule, table, cell, direction, clientX, clientY) {
    if (!table || !cell || !tableModule) return false;
    const vertical = direction === 'vertical';
    const rect = cell.getBoundingClientRect();
    const colSpan = Math.max(1, cell.colSpan || 1);
    const rowSpan = Math.max(1, cell.rowSpan || 1);
    const coord = tableModule.formalCoordinate(table, cell);
    const startRow = Array.isArray(coord) ? coord[0] : 0;
    const startCol = Array.isArray(coord) ? coord[1] : 0;

    if (vertical && colSpan > 1) {
        const { widths: preWidths } = measureLogicalColumnWidthsLivePx(table);
        const unit = rect.width / colSpan;
        const rel = Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2;
        let splitAfter = Math.round(rel / unit);
        splitAfter = Math.max(1, Math.min(colSpan - 1, splitAfter));
        const leftSpan = splitAfter;
        const rightSpan = colSpan - splitAfter;
        const td = createEmptyTableCell(jodit, cell);
        setCellSpanAttr(cell, 'colspan', leftSpan);
        setCellSpanAttr(td, 'colspan', rightSpan);
        if (rowSpan > 1) setCellSpanAttr(td, 'rowspan', rowSpan);
        cell.after(td);
        tableModule.normalizeTable?.(table);
        restoreColumnWidthsAfterVerticalCellSplit(table, startCol, preWidths);
        return true;
    }

    if (!vertical && rowSpan > 1) {
        const unit = rect.height / rowSpan;
        const rel = Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2;
        let splitAfter = Math.round(rel / unit);
        splitAfter = Math.max(1, Math.min(rowSpan - 1, splitAfter));
        const topSpan = splitAfter;
        const bottomSpan = rowSpan - splitAfter;
        const insertRowIndex = startRow + topSpan;
        const box = tableModule.formalMatrix(table);
        const insertRow = table.rows[insertRowIndex];
        if (!insertRow) return false;

        const td = createEmptyTableCell(jodit, cell);
        setCellSpanAttr(cell, 'rowspan', topSpan);
        setCellSpanAttr(td, 'rowspan', bottomSpan);
        if (colSpan > 1) setCellSpanAttr(td, 'colspan', colSpan);

        /* Insert into the target row at the formal column hole this span covered. */
        let after = null;
        for (let j = 0; j < startCol; j += 1) {
            const prev = box[insertRowIndex]?.[j];
            if (prev && prev !== cell && prev.parentNode === insertRow) {
                after = prev;
            }
        }
        if (after) {
            after.after(td);
        } else {
            let next = null;
            for (
                let j = startCol + colSpan;
                j < (box[insertRowIndex]?.length || 0);
                j += 1
            ) {
                const n = box[insertRowIndex][j];
                if (n && n !== cell && n.parentNode === insertRow) {
                    next = n;
                    break;
                }
            }
            if (next) insertRow.insertBefore(td, next);
            else insertRow.appendChild(td);
        }
        tableModule.normalizeTable?.(table);
        return true;
    }

    /*
     * In-cell flex splits — full cell height/width; no outer column/row model changes.
     */
    clearAllTableCellSelection(jodit);
    tableModule.addSelection(cell);
    if (vertical) {
        emsSplitCellVerticalInPlaceFlex(jodit, cell);
    } else {
        emsSplitCellHorizontalInPlaceFlex(jodit, cell);
    }
    return true;
}

/**
 * Mark host td/th for in-cell split. Never set max-width — that blocked column resize.
 * Outer width stays controlled by colgroup / data-ems-col-widths (table-layout:fixed).
 */
function markHostCellForInPlaceSplit(host, axis = 'v') {
    if (!host?.style) return;
    host.style.removeProperty('max-width');
    host.style.setProperty('overflow', 'hidden', 'important');
    host.style.setProperty('vertical-align', 'top', 'important');
    host.style.setProperty('position', 'relative', 'important');
    /* Zero padding so split lines meet the cell border; height:1px = fill-row trick. */
    host.style.setProperty('padding', '0', 'important');
    host.style.setProperty('height', '1px', 'important');
    const prev = String(host.getAttribute('data-ems-split-host') || '');
    const next = prev.includes(axis) ? prev : prev ? `${prev}${axis}` : axis;
    host.setAttribute('data-ems-split-host', next || axis);
}

/** Apply left-pane % (10–90) to a vertical flex split wrap. */
function applyEmsCellSplitRatio(wrap, leftPct) {
    if (!wrap) return;
    const pct = Math.max(10, Math.min(90, Math.round(leftPct)));
    wrap.setAttribute('data-ems-split-pct', String(pct));
    wrap.style.setProperty('--ems-split-left', `${pct}%`);
    /* Host is the absolute gutter's containing block — keep the var there too. */
    const host = wrap.closest?.('td, th');
    if (host) host.style.setProperty('--ems-split-left', `${pct}%`);
    const panes = wrap.querySelectorAll(':scope > .ems-cell-split-v__pane');
    if (panes[0]) {
        panes[0].style.setProperty('flex', `0 0 ${pct}%`, 'important');
        panes[0].style.removeProperty('width');
        panes[0].style.removeProperty('max-width');
        /* Visible full-height line is host ::after; pane border would be content-short. */
        panes[0].style.setProperty('border-right', 'none', 'important');
    }
    if (panes[1]) {
        panes[1].style.setProperty('flex', '1 1 0', 'important');
        panes[1].style.setProperty('min-width', '0', 'important');
        panes[1].style.removeProperty('width');
        panes[1].style.removeProperty('max-width');
    }
}

/** Natural content height of an H-split (capped — never page/viewport tall). */
function measureEmsCellSplitHContentHeight(wrap) {
    if (!wrap) return 32;
    const panes = [...(wrap.querySelectorAll?.(':scope > .ems-cell-split-h__pane') || [])];
    let sum = 0;
    panes.forEach((p) => {
        sum += Math.max(p.scrollHeight || 0, p.offsetHeight || 0, 14);
    });
    if (!(sum > 0)) sum = wrap.getBoundingClientRect?.().height || 32;
    return Math.max(32, Math.min(Math.round(sum), 240));
}

/**
 * Definite wrap height for % flex + gutter.
 * Prefer explicit preferred / stored — never remeasure content on every hover.
 */
function resolveEmsCellSplitHHeight(wrap, preferredPx = 0) {
    const preferred = Number(preferredPx) > 8 ? Math.round(Number(preferredPx)) : 0;
    if (preferred) return Math.max(32, Math.min(preferred, 240));
    const stored = parseFloat(wrap?.getAttribute?.('data-ems-split-h-px') || '0') || 0;
    if (stored > 8 && stored <= 240) return Math.round(stored);
    if (stored > 240) wrap?.removeAttribute?.('data-ems-split-h-px');
    return measureEmsCellSplitHContentHeight(wrap);
}

/**
 * Apply top/bottom split ratio (10–90) on flex-div H-split.
 * Mirrors V: also stamps --ems-split-top on the host td so browse CSS can paint the line.
 */
function applyEmsCellSplitRatioH(wrap, topPct, preferredHeightPx = 0) {
    if (!wrap || wrap.tagName === 'TABLE') return;
    const pct = Math.max(10, Math.min(90, Math.round(topPct)));
    const h = resolveEmsCellSplitHHeight(wrap, preferredHeightPx);
    const topPx = Math.max(8, Math.round((pct / 100) * h));
    const botPx = Math.max(8, h - topPx);
    wrap.setAttribute('data-ems-split-pct', String(pct));
    wrap.setAttribute('data-ems-split-h-px', String(h));
    wrap.style.setProperty('--ems-split-top', `${pct}%`);
    wrap.style.setProperty('height', `${h}px`, 'important');
    wrap.style.setProperty('min-height', `${h}px`, 'important');
    wrap.style.removeProperty('max-height');
    wrap.style.setProperty('width', '100%', 'important');
    /* Host paints the persistent line (same pattern as V --ems-split-left + ::after). */
    const host = wrap.closest?.('td, th');
    if (host) {
        host.style.setProperty('--ems-split-top', `${pct}%`);
        host.setAttribute('data-ems-split-h-pct', String(pct));
        host.setAttribute('data-ems-split-h-px', String(h));
        markHostCellForInPlaceSplit(host, 'h');
    }
    const panes = wrap.querySelectorAll(':scope > .ems-cell-split-h__pane');
    if (panes[0]) {
        panes[0].style.setProperty('flex', `0 0 ${topPx}px`, 'important');
        panes[0].style.setProperty('height', `${topPx}px`, 'important');
        panes[0].style.setProperty('min-height', '0', 'important');
        panes[0].style.removeProperty('max-height');
        panes[0].style.setProperty('border-bottom', '1px solid #64748b', 'important');
        panes[0].setAttribute('data-ems-split-h-line', '1');
    }
    if (panes[1]) {
        panes[1].style.setProperty('flex', `0 0 ${botPx}px`, 'important');
        panes[1].style.setProperty('height', `${botPx}px`, 'important');
        panes[1].style.setProperty('min-height', '0', 'important');
        panes[1].style.removeProperty('max-height');
    }
}

/** Flatten mistaken nested-table H-splits back to flex divs (no nested tables). */
function flattenNestedTableHSplit(wrap) {
    if (!wrap?.classList?.contains('ems-cell-split-h') || wrap.tagName !== 'TABLE') return wrap;
    const panes = [
        ...(wrap.querySelectorAll?.(
            ':scope > tbody > tr > .ems-cell-split-h__pane, :scope > tr > .ems-cell-split-h__pane'
        ) || []),
    ];
    if (panes.length < 2) return wrap;
    const doc = wrap.ownerDocument || document;
    const pct = parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
    const stripGutter = (pane) => {
        const clone = pane.cloneNode(true);
        clone.querySelectorAll?.('.ems-cell-split-h__gutter').forEach((g) => g.remove());
        return String(clone.innerHTML || '').trim() || '<br>';
    };
    const next = buildEmsCellSplitFlexH(doc, stripGutter(panes[0]), stripGutter(panes[1]), pct);
    const group = wrap.getAttribute('data-ems-split-h-group');
    if (group) next.setAttribute('data-ems-split-h-group', group);
    wrap.replaceWith(next);
    return next;
}

function createEmsCellSplitGutter(doc, axis) {
    const gutter = doc.createElement('div');
    gutter.className = axis === 'h' ? 'ems-cell-split-h__gutter' : 'ems-cell-split-v__gutter';
    gutter.setAttribute('data-ems-split-gutter', axis === 'h' ? 'h' : 'v');
    gutter.setAttribute('contenteditable', 'false');
    gutter.setAttribute('title', 'Drag to resize split');
    /* Non-empty so Jodit cleanHTML does not strip the handle. */
    gutter.appendChild(doc.createTextNode('\u200b'));
    return gutter;
}

/**
 * Ensure drag gutters exist.
 * @param {{ reapply?: boolean }} [opts] reapply:true bakes ratios/borders (exit-edit / browse).
 *   Leave false for hover hit-testing so dragged positions do not oscillate.
 */
function ensureEmsCellSplitGutters(root, opts = {}) {
    if (!root?.querySelectorAll) return;
    const reapply = !!opts.reapply;
    const doc = root.ownerDocument || document;
    root.querySelectorAll('.ems-cell-split-v').forEach((wrap) => {
        const pct = parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
        if (!wrap.querySelector?.(':scope > .ems-cell-split-v__gutter')) {
            const panes = [...(wrap.querySelectorAll(':scope > .ems-cell-split-v__pane') || [])];
            if (panes.length < 2) return;
            wrap.insertBefore(createEmsCellSplitGutter(doc, 'v'), panes[1]);
            const host = wrap.closest?.('td, th');
            if (host) markHostCellForInPlaceSplit(host, 'v');
            applyEmsCellSplitRatio(wrap, pct);
            return;
        }
        if (reapply) applyEmsCellSplitRatio(wrap, pct);
    });
    root.querySelectorAll('.ems-cell-split-h').forEach((wrap) => {
        const target = wrap.tagName === 'TABLE' ? flattenNestedTableHSplit(wrap) : wrap;
        if (!target?.classList?.contains('ems-cell-split-h')) return;
        const panes = [...(target.querySelectorAll(':scope > .ems-cell-split-h__pane') || [])];
        const pct = parseFloat(target.getAttribute('data-ems-split-pct') || '50') || 50;
        let gutter = target.querySelector?.(':scope > .ems-cell-split-h__gutter');
        if (gutter) {
            gutter.setAttribute('title', 'Drag to resize split');
            if (!gutter.getAttribute('data-ems-split-gutter')) {
                gutter.setAttribute('data-ems-split-gutter', 'h');
            }
            if (!gutter.textContent) gutter.appendChild(doc.createTextNode('\u200b'));
        } else if (panes.length >= 2) {
            gutter = createEmsCellSplitGutter(doc, 'h');
            target.insertBefore(gutter, panes[1]);
            const host = target.closest?.('td, th');
            if (host) markHostCellForInPlaceSplit(host, 'h');
        }
        if (reapply || !gutter) {
            applyEmsCellSplitRatioH(target, pct);
        }
    });
}

/** Bake H/V split host vars + pane borders into DOM before commit / after browse paint. */
export function bakeEmsCellSplitsInRoot(root) {
    if (!root?.querySelectorAll) return;
    /* No nested tables — flatten any mistaken table H-splits back to flex divs. */
    [...root.querySelectorAll('table.ems-cell-split-h')].forEach((wrap) => {
        flattenNestedTableHSplit(wrap);
    });
    ensureEmsCellSplitGutters(root, { reapply: true });
}

/** Build flex left | gutter | right inside a host cell (no nested table). */
function buildEmsCellSplitFlex(doc, leftHtml, rightHtml, leftPct = 50) {
    const wrap = doc.createElement('div');
    wrap.className = 'ems-cell-split-v';
    wrap.setAttribute('data-ems-cell-split', 'v');

    const left = doc.createElement('div');
    left.className = 'ems-cell-split-v__pane';
    left.innerHTML = leftHtml || '<br>';

    const gutter = createEmsCellSplitGutter(doc, 'v');

    const right = doc.createElement('div');
    right.className = 'ems-cell-split-v__pane';
    right.innerHTML = rightHtml || '<br>';

    wrap.appendChild(left);
    wrap.appendChild(gutter);
    wrap.appendChild(right);
    applyEmsCellSplitRatio(wrap, leftPct);
    /* Fill host cell; the absolute gutter paints the full-height divider on the td. */
    left.style.setProperty('min-height', '100%', 'important');
    right.style.setProperty('min-height', '100%', 'important');
    wrap.style.setProperty('height', '100%', 'important');
    wrap.style.setProperty('min-height', '100%', 'important');
    wrap.style.setProperty('position', 'static', 'important');
    return wrap;
}

/** Build flex top / gutter / bottom inside a host (no nested table). */
function buildEmsCellSplitFlexH(doc, topHtml, bottomHtml, topPct = 50) {
    const wrap = doc.createElement('div');
    wrap.className = 'ems-cell-split-h';
    wrap.setAttribute('data-ems-cell-split', 'h');
    wrap.setAttribute('data-ems-split-pct', String(Math.max(10, Math.min(90, Math.round(topPct)))));

    const top = doc.createElement('div');
    top.className = 'ems-cell-split-h__pane';
    top.setAttribute('data-ems-split-h-line', '1');
    top.innerHTML = topHtml || '<br>';

    const gutter = createEmsCellSplitGutter(doc, 'h');

    const bottom = doc.createElement('div');
    bottom.className = 'ems-cell-split-h__pane';
    bottom.innerHTML = bottomHtml || '<br>';

    wrap.appendChild(top);
    wrap.appendChild(gutter);
    wrap.appendChild(bottom);
    applyEmsCellSplitRatioH(wrap, topPct);
    return wrap;
}

/**
 * Replace a pane (or cell) contents with a vertical flex split.
 * When `target` is already a pane, nest the split inside that pane (full height of pane).
 */
function emsReplaceWithVerticalSplit(doc, target, leftHtml, rightHtml) {
    if (!target) return false;
    const prev = String(target.innerHTML || '').trim() || '<br>';
    const left = leftHtml != null ? leftHtml : prev;
    const right = rightHtml != null ? rightHtml : '<br>';
    target.innerHTML = '';
    target.appendChild(buildEmsCellSplitFlex(doc, left, right, 50));
    const host = /^T[DH]$/i.test(target.tagName) ? target : target.closest?.('td, th');
    if (host) markHostCellForInPlaceSplit(host, 'v');
    return true;
}

/** Replace a pane/cell with a horizontal flex split (supports repeated splits). */
function emsReplaceWithHorizontalSplit(doc, target, topHtml, bottomHtml) {
    if (!target) return false;
    const prev = String(target.innerHTML || '').trim() || '<br>';
    const top = topHtml != null ? topHtml : prev;
    const bottom = bottomHtml != null ? bottomHtml : '<br>';
    target.innerHTML = '';
    target.appendChild(buildEmsCellSplitFlexH(doc, top, bottom, 50));
    const host = /^T[DH]$/i.test(target.tagName) ? target : target.closest?.('td, th');
    if (host) markHostCellForInPlaceSplit(host, 'h');
    const wrap =
        target.querySelector?.(':scope > .ems-cell-split-h') || target.closest?.('.ems-cell-split-h');
    if (wrap) applyEmsCellSplitRatioH(wrap, 50);
    return true;
}

/**
 * Sync split % across every in-cell split in the same formal column (column-like resize).
 */
function syncEmsCellSplitRatioInColumn(table, hostCell, leftPct) {
    if (!table || !hostCell) {
        applyEmsCellSplitRatio(hostCell?.querySelector?.(':scope > .ems-cell-split-v'), leftPct);
        return;
    }
    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, hostCell);
    applyEmsCellSplitRatio(hostCell.querySelector?.(':scope > .ems-cell-split-v'), leftPct);
    if (!pos) return;
    const seen = new Set([hostCell]);
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[pos.col];
        if (!cell || seen.has(cell)) continue;
        seen.add(cell);
        const wrap = cell.querySelector?.(':scope > .ems-cell-split-v');
        if (wrap) applyEmsCellSplitRatio(wrap, leftPct);
    }
}

/**
 * Sync horizontal split % (+ shared content-capped height) across a group/row.
 */
function syncEmsCellSplitRatioInRow(table, hostCell, topPct, heightPx = 0) {
    const hostWrap =
        hostCell?.querySelector?.(':scope > .ems-cell-split-h') ||
        hostCell?.closest?.('.ems-cell-split-h__pane')?.closest?.('.ems-cell-split-h') ||
        null;
    const pct = Math.max(10, Math.min(90, Math.round(topPct)));
    const tr = hostCell?.closest?.('tr');
    const group =
        hostWrap?.getAttribute?.('data-ems-split-h-group') ||
        hostCell?.getAttribute?.('data-ems-split-h-group') ||
        '';

    const targets = [];
    if (group && table) {
        table.querySelectorAll(`.ems-cell-split-h[data-ems-split-h-group="${group}"]`).forEach((w) => {
            targets.push(w);
        });
    }
    if (!targets.length && tr) {
        tr.querySelectorAll(':scope > td, :scope > th').forEach((cell) => {
            const wrap = cell.querySelector?.(':scope > .ems-cell-split-h');
            if (wrap) targets.push(wrap);
        });
    }
    if (!targets.length && hostWrap) targets.push(hostWrap);

    let sharedH = Number(heightPx) > 8 ? Number(heightPx) : 0;
    if (!(sharedH > 8) && targets.length) {
        sharedH = Math.max(...targets.map((w) => resolveEmsCellSplitHHeight(w)), 32);
    }
    sharedH = Math.max(32, Math.min(Math.round(sharedH || 32), 240));

    targets.forEach((wrap) => {
        if (group) wrap.setAttribute('data-ems-split-h-group', group);
        applyEmsCellSplitRatioH(wrap, pct, sharedH);
        const host = wrap.closest?.('td, th');
        if (host) {
            if (group) host.setAttribute('data-ems-split-h-group', group);
            markHostCellForInPlaceSplit(host, 'h');
        }
    });
}

function newEmsCellSplitHGroupId() {
    return `hg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Split one cell (or pane) into two editable halves with flex — full cell height.
 * Not a nested table; does not change the outer BOQ column model.
 */
function emsSplitCellVerticalInPlaceFlex(jodit, cell) {
    if (!cell?.isConnected) return false;
    const doc = cell.ownerDocument || jodit?.editor?.ownerDocument || document;

    /* Pane under caret — nest another vertical split inside that pane (full pane height). */
    if (cell.classList?.contains('ems-cell-split-v__pane') || cell.classList?.contains('ems-cell-split-h__pane')) {
        const prevHtml = String(cell.innerHTML || '').trim() || '<br>';
        return emsReplaceWithVerticalSplit(doc, cell, prevHtml, '<br>');
    }

    const hostTd = /^T[DH]$/i.test(cell.tagName)
        ? cell
        : cell.closest?.('td, th') || cell;
    if (!hostTd) return false;

    /* Legacy nested-table split → convert to flex without touching outer cols. */
    const nested = hostTd.querySelector?.(':scope > table[data-ems-cell-split="v"]');
    if (nested) {
        const nestCells = [...nested.querySelectorAll('td, th')];
        const leftHtml = String(nestCells[0]?.innerHTML || '').trim() || '<br>';
        const rightHtml = String(nestCells[1]?.innerHTML || '').trim() || '<br>';
        return emsReplaceWithVerticalSplit(doc, hostTd, leftHtml, rightHtml);
    }

    /* Already split — split the half under the caret (nested), not recurse on host. */
    const existingV = hostTd.querySelector?.(':scope > .ems-cell-split-v');
    const existingH = hostTd.querySelector?.(':scope > .ems-cell-split-h');
    const existing = existingV || existingH;
    if (existing) {
        if (existingV && !existingV.querySelector?.(':scope > .ems-cell-split-v__gutter')) {
            const panes = existingV.querySelectorAll(':scope > .ems-cell-split-v__pane');
            if (panes.length >= 2) {
                existingV.insertBefore(createEmsCellSplitGutter(doc, 'v'), panes[1]);
                const pct = parseFloat(existingV.getAttribute('data-ems-split-pct') || '50') || 50;
                applyEmsCellSplitRatio(existingV, pct);
            }
        }
        const sel = doc.getSelection?.();
        const pane =
            sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
                ? sel.anchorNode.closest?.('.ems-cell-split-v__pane, .ems-cell-split-h__pane')
                : sel?.anchorNode?.parentElement?.closest?.(
                      '.ems-cell-split-v__pane, .ems-cell-split-h__pane'
                  );
        if (pane && existing.contains(pane)) {
            const prevHtml = String(pane.innerHTML || '').trim() || '<br>';
            return emsReplaceWithVerticalSplit(doc, pane, prevHtml, '<br>');
        }
        /* No pane focus — split the first pane. */
        const firstPane = existing.querySelector?.(
            ':scope > .ems-cell-split-v__pane, :scope > .ems-cell-split-h__pane'
        );
        if (firstPane) {
            const prevHtml = String(firstPane.innerHTML || '').trim() || '<br>';
            return emsReplaceWithVerticalSplit(doc, firstPane, prevHtml, '<br>');
        }
        return false;
    }

    const prevHtml = String(hostTd.innerHTML || '').trim() || '<br>';
    return emsReplaceWithVerticalSplit(doc, hostTd, prevHtml, '<br>');
}

/**
 * In-cell horizontal split (top/bottom). Can be repeated for multiple horizontal lines.
 */
function emsSplitCellHorizontalInPlaceFlex(jodit, cell) {
    if (!cell?.isConnected) return false;
    const doc = cell.ownerDocument || jodit?.editor?.ownerDocument || document;

    if (cell.classList?.contains('ems-cell-split-v__pane') || cell.classList?.contains('ems-cell-split-h__pane')) {
        const prevHtml = String(cell.innerHTML || '').trim() || '<br>';
        return emsReplaceWithHorizontalSplit(doc, cell, prevHtml, '<br>');
    }

    const hostTd = /^T[DH]$/i.test(cell.tagName)
        ? cell
        : cell.closest?.('td, th') || cell;
    if (!hostTd) return false;

    const existingV = hostTd.querySelector?.(':scope > .ems-cell-split-v');
    const existingH = hostTd.querySelector?.(':scope > .ems-cell-split-h');
    const existing = existingH || existingV;
    if (existing) {
        const sel = doc.getSelection?.();
        const pane =
            sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
                ? sel.anchorNode.closest?.('.ems-cell-split-v__pane, .ems-cell-split-h__pane')
                : sel?.anchorNode?.parentElement?.closest?.(
                      '.ems-cell-split-v__pane, .ems-cell-split-h__pane'
                  );
        const target =
            pane && existing.contains(pane)
                ? pane
                : existing.querySelector?.(
                      ':scope > .ems-cell-split-h__pane, :scope > .ems-cell-split-v__pane'
                  );
        if (target) {
            const prevHtml = String(target.innerHTML || '').trim() || '<br>';
            return emsReplaceWithHorizontalSplit(doc, target, prevHtml, '<br>');
        }
        return false;
    }

    const prevHtml = String(hostTd.innerHTML || '').trim() || '<br>';
    return emsReplaceWithHorizontalSplit(doc, hostTd, prevHtml, '<br>');
}

function restoreFrozenTableColWidths(hostTable, widthsCsv, tableWidthCss) {
    if (!hostTable || !widthsCsv) return;
    const rows = getTableRows(hostTable);
    const widths = widthsCsv
        .split(',')
        .map((s) => parseFloat(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (!(widths.length && rows.length)) return;
    applyColumnWidths(hostTable, rows, widths);
    if (tableWidthCss) {
        hostTable.style.setProperty('width', tableWidthCss, 'important');
        hostTable.style.setProperty('min-width', tableWidthCss, 'important');
    }
    hostTable.style.setProperty('max-width', 'none', 'important');
    hostTable.setAttribute('data-ems-preserve-col-widths', '1');
}

function emsSplitSelectedCellsHorizontal(jodit, tableModule, table, cells) {
    if (!cells?.length) return false;
    const unique = [];
    const seen = new Set();
    cells.forEach((c) => {
        if (!c?.isConnected || seen.has(c)) return;
        if (table && c.closest?.('table') !== table) return;
        const host = c.classList?.contains?.('ems-cell-split-v__pane')
            ? c.closest?.('td, th')
            : c.classList?.contains?.('ems-cell-split-h__pane')
              ? c.closest?.('td, th')
              : c.classList?.contains?.('ems-cell-split-v') ||
                  c.classList?.contains?.('ems-cell-split-h')
                ? c.closest?.('td, th')
                : c;
        if (!host || seen.has(host)) return;
        seen.add(host);
        unique.push(host);
    });
    if (!unique.length) return false;

    /* Freeze outer column model — H-split must not rewrite table widths (same as V). */
    const hostTable = table || unique[0]?.closest?.('table');
    const widthsCsv = hostTable?.getAttribute?.('data-ems-col-widths') || '';
    const tableWidthCss = hostTable?.style?.getPropertyValue?.('width') || '';
    if (jodit) jodit.__emsSkipTableHarmonize = true;

    let any = false;
    unique.forEach((cell) => {
        if (emsSplitCellHorizontalInPlaceFlex(jodit, cell)) any = true;
    });
    /*
     * Multi-cell H split: one shared group + one shared row height so the divider is
     * continuous, and one drag moves every cell (like vertical column sync).
     */
    if (any && unique.length) {
        const groupId = newEmsCellSplitHGroupId();
        unique.forEach((cell) => {
            const wrap = cell.querySelector?.(':scope > .ems-cell-split-h');
            if (!wrap) return;
            wrap.setAttribute('data-ems-split-h-group', groupId);
            cell.setAttribute('data-ems-split-h-group', groupId);
            markHostCellForInPlaceSplit(cell, 'h');
            applyEmsCellSplitRatioH(wrap, 50);
        });
        if (unique[0]) syncEmsCellSplitRatioInRow(hostTable, unique[0], 50);
        restoreFrozenTableColWidths(hostTable, widthsCsv, tableWidthCss);
        try {
            (unique[0]?.ownerDocument?.defaultView || window).requestAnimationFrame?.(() => {
                restoreFrozenTableColWidths(hostTable, widthsCsv, tableWidthCss);
            });
        } catch {
            /* ignore */
        }
    } else if (any && hostTable && widthsCsv) {
        restoreFrozenTableColWidths(hostTable, widthsCsv, tableWidthCss);
    }
    if (jodit) {
        window.setTimeout(() => {
            jodit.__emsSkipTableHarmonize = false;
        }, 400);
    }
    return any;
}

/**
 * Split one cell into two real table cells; expand other rows' colspan so the
 * outer grid stays aligned. Bisects only the split column's px width.
 * Empty half is always inserted AFTER the content cell (content stays left-aligned).
 */
function emsSplitCellVerticalReal(jodit, tableModule, table, cell, _preferBefore, startCol) {
    return emsSplitCellsVerticalSameColumn(
        jodit,
        tableModule,
        table,
        [cell],
        false,
        startCol
    );
}

/**
 * Remember which visual column + rows the user multi-selected.
 * Survives right-click collapsing Jodit's live selection to 1 cell.
 */
function storeSplitColumnHint(jodit, table, cells) {
    if (!jodit || !table || !cells?.length) return;
    const live = [];
    const seen = new Set();
    cells.forEach((c) => {
        if (!c?.isConnected || c.closest?.('table') !== table || seen.has(c)) return;
        seen.add(c);
        live.push(c);
    });
    if (live.length < 2) return;
    const rows = getTableRows(table);
    const rowIndexes = [];
    let sumMid = 0;
    let n = 0;
    live.forEach((c) => {
        const ri = rows.indexOf(c.parentElement);
        if (ri >= 0) rowIndexes.push(ri);
        const r = c.getBoundingClientRect();
        if (r.width > 0) {
            sumMid += (r.left + r.right) / 2;
            n += 1;
        }
    });
    jodit.__emsSplitColumnHint = {
        table,
        midX: n ? sumMid / n : 0,
        rowIndexes: [...new Set(rowIndexes)].sort((a, b) => a - b),
        cellRefs: live,
    };
    jodit.__emsLastMultiCellBlock = live;
    jodit.__emsFormatTableCells = live;
    jodit.__emsSplitTableCells = live;
}

/** Re-find cells for a stored multi-row column selection (by ref, then by geometry). */
function resolveCellsFromSplitColumnHint(jodit, table, anchor) {
    if (!jodit || !table) return null;
    const hint = jodit.__emsSplitColumnHint;
    const fromRefs = (list) =>
        (list || []).filter((c) => c?.isConnected && c.closest?.('table') === table);

    const refs = fromRefs(hint?.table === table ? hint.cellRefs : null);
    if (refs.length > 1) return refs;
    const block = fromRefs(jodit.__emsLastMultiCellBlock);
    if (block.length > 1) return block;

    if (!hint || hint.table !== table || !hint.rowIndexes?.length) return null;
    const rows = getTableRows(table);
    const ar = anchor?.getBoundingClientRect?.();
    const midX =
        hint.midX ||
        (ar && ar.width > 0 ? (ar.left + ar.right) / 2 : 0);
    if (!(midX > 0)) return null;
    const out = [];
    hint.rowIndexes.forEach((ri) => {
        const row = rows[ri];
        if (!row) return;
        let best = null;
        let bestDist = Infinity;
        [...row.cells].forEach((c) => {
            const r = c.getBoundingClientRect();
            if (r.width <= 0) return;
            if (midX < r.left - 2 || midX > r.right + 2) return;
            const dist = Math.abs((r.left + r.right) / 2 - midX);
            if (dist < bestDist) {
                best = c;
                bestDist = dist;
            }
        });
        if (best) out.push(best);
    });
    return out.length > 1 ? out : null;
}

/**
 * Split every selected cell in one visual column into two real &lt;td&gt;s at once.
 * Non-selected rows covering that X get colspan+1 (once). Uses geometry — not Jodit
 * formal columns — so BOQ rows with uneven colspans still split together.
 */
function emsSplitCellsVerticalSameColumn(
    jodit,
    tableModule,
    table,
    cells,
    preferBefore,
    startCol
) {
    if (!table || !cells?.length) return false;
    const live = [];
    const seen = new Set();
    cells.forEach((c) => {
        if (!c?.isConnected || c.closest?.('table') !== table || seen.has(c)) return;
        seen.add(c);
        live.push(c);
    });
    if (!live.length) return false;

    let sumMid = 0;
    let midN = 0;
    let maxW = 0;
    live.forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.width > 0) {
            sumMid += (r.left + r.right) / 2;
            midN += 1;
            if (r.width > maxW) maxW = r.width;
        }
    });
    const midX = midN ? sumMid / midN : 0;

    const { widths: preWidths } = measureLogicalColumnWidthsLivePx(table);
    let colIndex = startCol;
    if (!(colIndex >= 0) && tableModule) {
        const coord = tableModule.formalCoordinate(table, live[0]);
        colIndex = Array.isArray(coord) ? coord[1] : 0;
    }
    if (maxW > 0 && colIndex >= 0 && colIndex < preWidths.length) {
        preWidths[colIndex] = Math.max(MIN_TABLE_COLUMN_WIDTH * 2, Math.round(maxW));
    }

    const selectedSet = new Set(live);
    const selectedRows = new Set(live.map((c) => c.parentElement));

    /*
     * Unwrap any previous nested split tables inside these cells (legacy path).
     * Vertical split must be real <td>s — never a table-inside-cell.
     */
    live.forEach((cell) => {
        const nest = cell.querySelector?.(':scope > table[data-ems-cell-split="v"]');
        if (!nest) return;
        const keep =
            nest.querySelector('td, th')?.innerHTML ||
            String(cell.innerHTML || '');
        cell.innerHTML = keep || '<br>';
    });

    /* Insert empty half AFTER content — text stays left, aligned with unsplit rows. */
    live.forEach((cell) => {
        if (!cell?.isConnected) return;
        const td = createEmptyTableCell(jodit, cell);
        const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
        if (rowSpan > 1) setCellSpanAttr(td, 'rowspan', rowSpan);
        copyCellLayoutStyles(cell, td);
        cell.after(td);
    });

    /* Other rows: colspan+1 on the cell covering this column so Unit/Qty do not shift. */
    if (midX > 0) {
        getTableRows(table).forEach((row) => {
            if (selectedRows.has(row)) return;
            const cover = [...row.cells].find((c) => {
                if (selectedSet.has(c)) return false;
                const r = c.getBoundingClientRect();
                return r.width > 0 && midX >= r.left - 2 && midX <= r.right + 2;
            });
            if (cover) {
                setCellSpanAttr(
                    cover,
                    'colspan',
                    Math.max(1, Number(cover.colSpan) || 1) + 1
                );
            }
        });
    }

    ensureAllRowsMatchColumnCountAfterSplit(table, jodit, colIndex >= 0 ? colIndex : 0);
    restoreColumnWidthsAfterVerticalCellSplit(table, colIndex >= 0 ? colIndex : 0, preWidths);
    table.setAttribute('data-ems-splitv-widths', table.getAttribute('data-ems-col-widths') || '');
    table.setAttribute('data-ems-preserve-col-widths', '1');
    return true;
}

/**
 * Vertical-split each selected cell in place (flex halves inside the cell).
 * Outer BOQ column widths and neighbor rows are untouched.
 */
function emsSplitSelectedCellsVertical(jodit, tableModule, table, cells, _preferBefore) {
    if (!cells?.length) return false;
    const unique = [];
    const seen = new Set();
    cells.forEach((c) => {
        if (!c?.isConnected || seen.has(c)) return;
        if (table && c.closest?.('table') !== table) return;
        /* Prefer the host td, not an inner pane. */
        const host = c.classList?.contains?.('ems-cell-split-v__pane')
            ? c.closest?.('td, th')
            : c.classList?.contains?.('ems-cell-split-v')
              ? c.closest?.('td, th')
              : c;
        if (!host || seen.has(host)) return;
        seen.add(host);
        unique.push(host);
    });
    if (!unique.length) return false;

    /* Freeze outer column model — never let post-split harmonize rewrite widths. */
    const hostTable = table || unique[0]?.closest?.('table');
    const widthsCsv = hostTable?.getAttribute?.('data-ems-col-widths') || '';
    const tableWidthCss = hostTable?.style?.getPropertyValue?.('width') || '';
    if (jodit) jodit.__emsSkipTableHarmonize = true;

    let any = false;
    unique.forEach((cell) => {
        if (emsSplitCellVerticalInPlaceFlex(jodit, cell)) any = true;
    });

    if (any) {
        unique.forEach((cell) => {
            cell?.style?.removeProperty?.('max-width');
            markHostCellForInPlaceSplit(cell, 'v');
        });
        if (hostTable) ensureEmsCellSplitGutters(hostTable);
    }

    if (any && hostTable && widthsCsv) {
        restoreFrozenTableColWidths(hostTable, widthsCsv, tableWidthCss);
    }

    if (jodit) {
        window.setTimeout(() => {
            jodit.__emsSkipTableHarmonize = false;
        }, 400);
    }
    return any;
}

/** Make every row span the same logical column count after a vertical split. */
function ensureAllRowsMatchColumnCountAfterSplit(table, jodit, splitColIndex) {
    const rows = getTableRows(table);
    if (!rows.length) return;
    const target = Math.max(
        ...rows.map((row) =>
            [...row.cells].reduce((n, c) => n + Math.max(1, Number(c.colSpan) || 1), 0)
        )
    );
    if (target < 2) return;

    rows.forEach((row) => {
        let logical = [...row.cells].reduce(
            (n, c) => n + Math.max(1, Number(c.colSpan) || 1),
            0
        );
        if (logical >= target) return;

        /* Prefer expanding the cell that covers the split column. */
        let col = 0;
        let cover = null;
        for (const c of row.cells) {
            const span = Math.max(1, Number(c.colSpan) || 1);
            if (col <= splitColIndex && splitColIndex < col + span) {
                cover = c;
                break;
            }
            col += span;
        }
        if (cover) {
            const need = target - logical;
            setCellSpanAttr(cover, 'colspan', Math.max(1, Number(cover.colSpan) || 1) + need);
            return;
        }
        /* Fallback: insert empty cells before the last cell. */
        while (logical < target) {
            const pad = createEmptyTableCell(jodit, row.cells[0] || null);
            const last = row.cells[row.cells.length - 1];
            if (last) row.insertBefore(pad, last);
            else row.appendChild(pad);
            logical += 1;
        }
    });
}

/**
 * Run add/delete row/column etc. Jodit selectCells returns false even when no cells
 * are selected (after our single-cell visual sync), which blocks the command — handle
 * on the per-command beforeCommand* events that fire first.
 */
function executeTableStructureCommand(jodit, getEditorBody, command) {
    const cmd = String(command || '').toLowerCase();
    if (!TABLE_STRUCTURE_CMD_RE.test(cmd)) return false;

    const subCmd = cmd.replace(/table/gi, '');
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return false;

    const splitHint = jodit.__emsTableCtxSplit;
    /* Prefer the cell the user right-clicked so split lands where they asked. */
    const hintCell =
        splitHint?.cell?.isConnected && (subCmd === 'splitv' || subCmd === 'splitg')
            ? splitHint.cell
            : null;
    const hintTable = hintCell?.closest?.('table') || splitHint?.table || null;
    let workCells = resolveTableStructureWorkCells(jodit, getEditorBody, hintTable);
    const cell =
        hintCell ||
        workCells[0] ||
        getActiveTableCell(jodit, getEditorBody);
    if (!cell) return false;

    const table = cell.closest('table');
    if (!table) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    workCells = resolveTableStructureWorkCells(jodit, getEditorBody, table);
    if (!workCells.length) {
        workCells = [cell];
    }
    /* If right-click cell is in the selection column/block, keep the whole block. */
    if (
        (subCmd === 'splitv' || subCmd === 'splitg') &&
        hintCell &&
        !workCells.includes(hintCell)
    ) {
        workCells = [...workCells, hintCell];
    }

    /*
     * Jodit split/merge read Table.__selectedByTable only — not the caret /
     * __emsActiveTableCell. Single-cell right-click clears that map on purpose
     * (caret-only UX), so ensure work cells are selected before those ops.
     */
    if (subCmd === 'splitv' || subCmd === 'splitg' || subCmd === 'merge') {
        const already = new Set(getSelectedTableCells(jodit));
        workCells.forEach((td) => {
            if (td?.isConnected && !already.has(td)) {
                tableModule.addSelection(td);
            }
        });
        jodit.__emsFormatTableCells = workCells;
        jodit.__emsSplitTableCells = workCells;
        /* Keep sync from wiping selection while the command runs. */
        jodit.__emsSkipTableSelSync = true;
        jodit.__emsPreserveMultiTableSelect = true;
    }

    switch (subCmd) {
        case 'splitv': {
            const anchor =
                hintCell && workCells.includes(hintCell) ? hintCell : workCells[0] || cell;
            let splitCells = filterCellsSameFormalColumn(
                tableModule,
                table,
                workCells.filter((c) => c?.isConnected && c.closest?.('table') === table),
                anchor
            );
            const fromHint = resolveCellsFromSplitColumnHint(jodit, table, anchor);
            if (fromHint && fromHint.length > splitCells.length) splitCells = fromHint;
            if (!splitCells.length) splitCells = [anchor];
            /* In-cell 50|50 — content left; never add outer columns. */
            emsSplitSelectedCellsVertical(jodit, tableModule, table, splitCells, false);
            jodit.__emsTableCtxSplit = null;
            jodit.__emsSplitTableCells = null;
            break;
        }
        case 'splitg': {
            const hCells = workCells.filter(
                (c) => c?.isConnected && c.closest?.('table') === table
            );
            const merged = hCells.find((c) => Math.max(1, c.rowSpan || 1) > 1);
            if (merged) {
                emsSplitTableCellAtPoint(
                    jodit,
                    tableModule,
                    table,
                    merged,
                    'horizontal',
                    splitHint?.clientX,
                    splitHint?.clientY
                );
            } else {
                emsSplitSelectedCellsHorizontal(
                    jodit,
                    tableModule,
                    table,
                    hCells.length ? hCells : [cell]
                );
            }
            jodit.__emsTableCtxSplit = null;
            break;
        }
        case 'merge':
            tableModule.mergeSelected(table);
            break;
        case 'empty':
            workCells.forEach((td) => {
                td.innerHTML = '<br>';
            });
            break;
        case 'bin':
            table.remove();
            break;
        case 'binrow':
            new Set(workCells.map((td) => td.parentNode)).forEach((row) => {
                if (row && typeof row.rowIndex === 'number') {
                    tableModule.removeRow(table, row.rowIndex);
                }
            });
            break;
        case 'bincolumn': {
            const columnsSet = new Set();
            const columns = [];
            workCells.forEach((td) => {
                const coord = tableModule.formalCoordinate(table, td);
                const col = Array.isArray(coord) ? coord[1] : coord?.col;
                if (col == null || columnsSet.has(col)) return;
                columns.push(col);
                columnsSet.add(col);
            });
            columns
                .sort((a, b) => b - a)
                .forEach((col) => tableModule.removeColumn(table, col));
            break;
        }
        case 'addcolumnafter':
        case 'addcolumnbefore': {
            const coord = tableModule.formalCoordinate(table, cell);
            const refCol = Array.isArray(coord) ? coord[1] : coord?.col;
            tableModule.appendColumn(table, cell, subCmd === 'addcolumnafter');
            if (refCol != null) {
                const sourceCol = subCmd === 'addcolumnbefore' ? refCol + 1 : refCol;
                const destCol = subCmd === 'addcolumnbefore' ? refCol : refCol + 1;
                copyColumnDimensionsFromReference(table, sourceCol, destCol);
            }
            /* Keep navy header on newly inserted pricing-table columns. */
            restyleEmsPricingTableHeaderCells(table);
            break;
        }
        case 'addrowafter':
        case 'addrowbefore': {
            const refRow = cell.parentNode;
            tableModule.appendRow(table, refRow, subCmd === 'addrowafter');
            const newRow =
                subCmd === 'addrowafter' ? refRow.nextElementSibling : refRow.previousElementSibling;
            copyRowDimensionsFromReference(table, refRow, newRow);
            break;
        }
        default:
            return false;
    }

    jodit.__emsTableStructureJustRan = true;
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    const finishStructureCmd = () => {
        jodit.__emsTableStructureJustRan = false;
        if (subCmd === 'splitv' || subCmd === 'splitg' || subCmd === 'merge') {
            jodit.__emsSkipTableSelSync = false;
            jodit.__emsPreserveMultiTableSelect = false;
            jodit.__emsSplitTableCells = null;
            /* Split removes Jodit selection; return to caret-only active cell. */
            syncTableSelectionVisual(jodit, getEditorBody);
        }
    };
    if (root) {
        requestAnimationFrame(() => {
            /* In-place flex splits — never harmonize / bootstrap column widths. */
            if (subCmd !== 'splitv' && subCmd !== 'splitg') {
            harmonizeInsertedTableCells(root);
            }
            focusCellAfterTableStructureChange(jodit, getEditorBody, table, cell, subCmd);
            snapshotTableEditorHistory(jodit);
            requestAnimationFrame(finishStructureCmd);
        });
    } else {
        focusCellAfterTableStructureChange(jodit, getEditorBody, table, cell, subCmd);
        snapshotTableEditorHistory(jodit);
        requestAnimationFrame(finishStructureCmd);
    }
    return true;
}

function registerTableStructureCommands(jodit, getEditorBody) {
    if (!jodit) return;

    const run = (command) => {
        const cmd = String(command || '').toLowerCase();
        /* Prefer frozen menu snapshot for splitv (selection is often 1 cell at exec time). */
        if (cmd === 'tablesplitv' || cmd === 'splitv') {
            const table =
                jodit.__emsTableCtxSplit?.table ||
                jodit.__emsMenuSnapSplitCells?.[0]?.closest?.('table') ||
                getSelectedTableCells(jodit)[0]?.closest?.('table');
            const snap =
                jodit.__emsMenuSnapSplitCells ||
                jodit.__emsSplitTableCells ||
                jodit.__emsLastMultiCellBlock ||
                null;
            if (table && snap?.length > 1) {
                runSplitVerticalFromContextMenu(jodit, table, snap);
                return false;
            }
        }
        if (!executeTableStructureCommand(jodit, getEditorBody, command)) {
            return;
        }
        return false;
    };

    /* Rebind on HMR so split always uses the latest snapshot path. */
    jodit.e.off('.emsTableCmd');
    jodit.e.off('.emsTableCmdAll');
    JODIT_TABLE_COMMANDS.forEach((command) => {
        jodit.e.on(`${joditBeforeCommandEventName(command)}.emsTableCmd`, () => run(command));
    });
    jodit.e.on('beforeCommand.emsTableCmdAll', (command) => {
        const cmd = String(command || '').toLowerCase();
        if (!TABLE_STRUCTURE_CMD_RE.test(cmd)) return;
        return run(cmd);
    });
    jodit.__emsTableStructureCmd = true;
}

function isCellEffectivelyEmpty(cell) {
    if (!cell) return true;
    const text = String(cell.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    return !cell.querySelector('img, table, svg');
}

const MIN_TABLE_COLUMN_WIDTH = 24;
const MIN_TABLE_ROW_HEIGHT = 18;

/**
 * Min px when resizing / fitting columns.
 * 5+ col schedules keep a higher floor on Qty/Unit/Amount; 4-col clause tables
 * (e.g. Sr / Item / "-" / Make) must allow the narrow "-" column down to MIN.
 */
function getColumnWidthFloor(colCount, colIndex) {
    if (colCount >= 5 && colIndex >= colCount - 3) return 48;
    return MIN_TABLE_COLUMN_WIDTH;
}

/** Clause 4 auto pricing summary — same id as QuoteForm EMS_AUTO_PRICE_SUMMARY_TABLE_ID. */
export const EMS_AUTO_PRICE_SUMMARY_TABLE_ID = 'ems-auto-price-summary-table';

/**
 * Shared Excel/Word pasted table presentation — keep editor + preview read/edit identical.
 * @param {string} scope CSS scope prefix (e.g. `.clause-content` or `#quote-preview .clause-content`)
 */
export const EMS_OFFICE_PASTE_TABLE_SELECTOR =
    'table[data-ems-paste-source="office"], table.ems-office-paste-table, table[data-ems-paste-formatted="1"], table[data-ems-word-paste="1"], table[data-ems-excel-paste="1"], table[data-ems-col-widths]';

/** Tables with a locked row px model — inline heights must not be overridden by office paste CSS. */
export const EMS_TABLE_ROW_HEIGHT_LOCKED_SELECTOR =
    'table[data-ems-row-heights], table[data-ems-row-heights-custom]';

export function buildEmsOfficePasteTablePresentationCss(scope) {
    const s = scope || '.clause-content';
    const officeTableRaw = `${s} ${EMS_OFFICE_PASTE_TABLE_SELECTOR.split(', ').join(`, ${s} `)}`;
    // Pricing option tables must stay at EMS_QUOTE_PRICING_TABLE_WIDTH — never treat as office fluid.
    const officeTable = `${officeTableRaw}:not([id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"]):not([data-ems-pricing-cols="fixed"])`;
    const officeTableFluidRows = `${officeTable}:not([data-ems-row-heights]):not([data-ems-row-heights-custom])`;
    const officeCell = `${officeTable} th:not([data-ems-valign]), ${officeTable} td:not([data-ems-valign])`;
    const officeInner = `${officeTable} td *, ${officeTable} th *`;
    const officeP = `${officeTable} td p, ${officeTable} th p`;
    const officeBlock = `${officeTable} td p, ${officeTable} th p, ${officeTable} td div, ${officeTable} th div, ${officeTable} td li, ${officeTable} th li`;

    return `
    ${officeTable} {
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        table-layout: fixed !important;
        /* No !important on width — applyColumnWidths sets inline px !important. */
        width: auto;
        margin-top: 4px !important;
        margin-bottom: 4px !important;
        line-height: 1.25 !important;
        page-break-inside: auto !important;
    }
    /* Locked col model: never force max-width:none — that ignored resize px locks. */
    ${officeTable}[data-ems-col-widths] {
        table-layout: fixed !important;
    }
    ${officeCell} {
        box-sizing: border-box !important;
        /* Fixed px: Selawik's larger glyph metrics made ratio line-heights taller than Arial (R8). */
        font-size: 12.5px !important;
        line-height: 15px !important;
        vertical-align: middle !important;
        white-space: normal !important;
        /* visible so underline / strike are not clipped by the cell box */
        overflow: visible !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        word-break: normal !important;
        padding: 1px 3px !important;
    }
    ${officeTable} td[colspan],
    ${officeTable} th[colspan] {
        overflow: visible !important;
        word-wrap: normal !important;
        overflow-wrap: normal !important;
    }
    ${officeTable} td[data-ems-cell-fill],
    ${officeTable} th[data-ems-cell-fill],
    ${officeTable} td[data-ems-cell-color],
    ${officeTable} th[data-ems-cell-color] {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    ${officeTableFluidRows} tr {
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
    }
    ${officeTableFluidRows} tr td,
    ${officeTableFluidRows} tr th {
        padding: 1px 3px !important;
        font-size: 12.5px !important;
        line-height: 15px !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
    }
    ${officeInner} {
        white-space: normal !important;
        overflow-wrap: break-word !important;
        word-break: normal !important;
    }
    ${officeP} {
        text-align: inherit !important;
        margin-left: 0 !important;
        text-indent: 0 !important;
    }
    ${officeBlock} {
        margin: 0 !important;
        padding: 0 !important;
        line-height: 15px !important;
        overflow: visible !important;
    }
    ${officeTable} td p + p,
    ${officeTable} th p + p,
    ${officeTable} td > * + *,
    ${officeTable} th > * + * {
        margin-top: 0 !important;
    }
    ${officeTable} td img,
    ${officeTable} th img,
    ${officeTable} img[data-ems-office-paste-img] {
        max-width: 100% !important;
        height: auto !important;
        display: inline-block !important;
        vertical-align: middle !important;
        object-fit: contain !important;
    }
    ${officeTable} td[data-ems-split-host],
    ${officeTable} th[data-ems-split-host],
    ${officeTable} td:has(> .ems-cell-split-v),
    ${officeTable} th:has(> .ems-cell-split-v),
    ${officeTable} td:has(> .ems-cell-split-h),
    ${officeTable} th:has(> .ems-cell-split-h) {
        overflow: hidden !important;
    }
`;
}

/**
 * Normal/read preview — hide Excel hairline gridlines and default cell fills unless the
 * user explicitly applied a background color (data-ems-cell-fill).
 */
export function buildEmsOfficePasteTableNormalModeCss(scope) {
    const s = scope || '.clause-content';
    /* Live Jodit body also uses .clause-content — keep full Excel formatting while editing. */
    const scoped = `${s}:not(.jodit-wysiwyg)`;
    const officeTable = `${scoped} table[data-ems-paste-source="office"]:not([id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"]):not([data-ems-pricing-cols="fixed"]), ${scoped} table[data-ems-col-widths]:not([id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"]):not([data-ems-pricing-cols="fixed"])`;
    return `
    ${officeTable} tr {
        background: transparent !important;
        background-color: transparent !important;
    }
    ${officeTable} td:not([data-ems-cell-fill]):not([data-ems-cell-border]):not(.ems-table-cell-selected),
    ${officeTable} th:not([data-ems-cell-fill]):not([data-ems-cell-border]):not(.ems-table-cell-selected),
    ${officeTable} td[data-ems-cell-border="none"],
    ${officeTable} th[data-ems-cell-border="none"] {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
    }
    ${officeTable} td:not([data-ems-cell-fill])[data-ems-cell-border]:not([data-ems-cell-border="none"]),
    ${officeTable} th:not([data-ems-cell-fill])[data-ems-cell-border]:not([data-ems-cell-border="none"]) {
        background: transparent !important;
        background-color: transparent !important;
    }`;
}

export const EMS_OFFICE_PASTE_TABLE_PRESENTATION_CSS =
    buildEmsOfficePasteTablePresentationCss('.clause-content');
export const EMS_OFFICE_PASTE_TABLE_NORMAL_MODE_CSS =
    buildEmsOfficePasteTableNormalModeCss('.clause-content');
export const EMS_OFFICE_PASTE_TABLE_EDITOR_CSS = buildEmsOfficePasteTablePresentationCss(
    '.clause-editor-wrapper .jodit-wysiwyg'
);
export const EMS_OFFICE_PASTE_TABLE_PREVIEW_READ_CSS =
    buildEmsOfficePasteTablePresentationCss('#quote-preview .clause-content');
export const EMS_OFFICE_PASTE_TABLE_PREVIEW_EDIT_CSS = buildEmsOfficePasteTablePresentationCss(
    '#quote-preview .quote-clause-inline-editor .jodit-wysiwyg'
);

/**
 * Classic BOQ / schedule (SL.NO · Description · Qty · Unit · Amount).
 * Must win over a mis-tagged pricing-summary id — otherwise enter-edit skips
 * unscramble, strips col widths, and restyle wipes header cell widths (header≠body).
 */
export function tableLooksLikeBoqOrMultiColumnSchedule(table) {
    if (!table) return false;
    const rows = [...(table.querySelectorAll?.('tr') || [])];
    if (!rows.length) return false;
    const maxCells = Math.max(0, ...rows.map((r) => r.cells?.length || 0));
    const logical = getLogicalColumnCount(rows) || maxCells;
    const headerText = String(
        table.querySelector?.('thead')?.textContent || rows[0]?.textContent || ''
    )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (/\bsl\.?\s*no\b/.test(headerText) && Math.max(maxCells, logical) >= 4) return true;
    if (
        (/\bqty\b|\bquantity\b/.test(headerText) && /\bunit\b/.test(headerText)) &&
        Math.max(maxCells, logical) >= 4
    ) {
        return true;
    }
    return false;
}

/** If a BOQ was wrongly tagged as EMS pricing summary, strip those attrs so schedule repair runs. */
export function demoteMisTaggedBoqFromPricingSummary(table) {
    if (!table || !tableLooksLikeBoqOrMultiColumnSchedule(table)) return false;
    let changed = false;
    const id = String(table.id || '');
    if (
        id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        id.startsWith(`${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--`)
    ) {
        table.removeAttribute('id');
        changed = true;
    }
    if (table.getAttribute('data-ems-pricing-cols') === 'fixed') {
        table.removeAttribute('data-ems-pricing-cols');
        changed = true;
    }
    return changed;
}

export function isEmsPricingSummaryTable(table) {
    if (!table) return false;
    /* BOQ / SL.NO schedules are never the 2-col pricing footer summary. */
    if (tableLooksLikeBoqOrMultiColumnSchedule(table)) return false;
    const id = String(table.id || '');
    return (
        id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        id.startsWith(`${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--`) ||
        table.getAttribute?.('data-ems-pricing-cols') === 'fixed'
    );
}

/** Apply navy header fill to every header cell (incl. columns just inserted). */
function restyleEmsPricingTableHeaderCells(table) {
    if (!isEmsPricingSummaryTable(table)) return;
    const headerRow =
        table.querySelector('thead tr')
        || [...table.querySelectorAll('tr')].find((r) => r.querySelector('th'))
        || table.querySelector('tr');
    if (!headerRow) return;
    [...headerRow.cells].forEach((cell) => {
        /* Never replace the whole style attr — that wiped width locks and scrambled BOQ headers. */
        cell.style.setProperty('background', EMS_QUOTE_PRICING_TABLE_HEADER_BG, 'important');
        cell.style.setProperty('background-color', EMS_QUOTE_PRICING_TABLE_HEADER_BG, 'important');
        cell.style.setProperty('color', EMS_QUOTE_PRICING_TABLE_HEADER_COLOR, 'important');
        cell.style.setProperty('font-weight', '600', 'important');
        cell.style.setProperty('border', EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER, 'important');
    });
}

function getEmsPricingTableWidthRatio() {
    const raw = String(EMS_QUOTE_PRICING_TABLE_WIDTH || '80%');
    const pct = parseFloat(raw);
    if (raw.includes('%') && pct > 0) return pct / 100;
    return 0.8;
}

function readPricingSummaryDefaultWidthsPx(table, rows, colCount) {
    if (colCount === 2) {
        let totalW = Math.round(table.getBoundingClientRect?.().width || 0);
        if (totalW < 80) {
            totalW = Math.round(
                (getA4InnerContentWidthPx(table?.ownerDocument) || 680) * getEmsPricingTableWidthRatio()
            );
        }
        const w0 = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(totalW * 0.72));
        const w1 = Math.max(MIN_TABLE_COLUMN_WIDTH, totalW - w0);
        return [w0, w1];
    }
    return readColumnWidthsPx(table, rows, colCount);
}

function normalizeEmsPricingSummaryTableCellPadding(table) {
    if (!table) return;
    table.querySelectorAll('td, th').forEach((cell) => {
        cell.style.setProperty('padding', EMS_QUOTE_PRICING_TABLE_CELL_PADDING, 'important');
        cell.style.setProperty('line-height', '1.25', 'important');
        cell.style.setProperty('vertical-align', 'middle', 'important');
            cell.setAttribute('data-ems-valign', 'middle');
        const idx = cell.cellIndex;
        const row = cell.parentElement;
        const rowKind = String(row?.getAttribute?.('data-ems-row') || '').toLowerCase();
        const isFooter = /^(total|vat|grand|grand-vat|discount|final-discounted)$/.test(rowKind);
        const cellsInRow = row?.cells?.length || 0;
        const isLastInRow = cellsInRow > 0 && idx === cellsInRow - 1;
        const userAlign = String(cell.getAttribute('data-ems-align') || '').toLowerCase();
        const userCustom = cell.getAttribute('data-ems-align-custom') === '1';
        let align = 'left';
        if (userCustom && /^(left|center|right|justify)$/.test(userAlign)) {
            align = userAlign;
        } else {
            const isAmount =
                cell.hasAttribute('data-ems-amount') ||
                (cellsInRow >= 2 && isLastInRow);
            const isSlNo = cellsInRow === 3 && idx === 0 && !isFooter;
            const isFooterLabel = isFooter && idx === 0;
            if (isAmount || isFooterLabel) align = 'right';
            else if (isSlNo) align = 'center';
            else align = 'left';
        }
        cell.style.setProperty('text-align', align, 'important');
        cell.setAttribute('align', align);
        /* Inner nodes inherit; strip Word/editor boxes that looked like alignment glitches. */
        cell.querySelectorAll('p, div, span, font').forEach((el) => {
            el.style.setProperty('text-align', 'inherit', 'important');
            el.style.removeProperty('border');
            el.style.removeProperty('border-width');
            el.style.removeProperty('border-style');
            el.style.removeProperty('border-color');
            el.style.removeProperty('outline');
            el.style.removeProperty('box-shadow');
            if (!el.classList?.contains?.('ems-spell-mark')) {
                el.style.removeProperty('background');
                el.style.removeProperty('background-color');
                el.style.removeProperty('background-image');
            }
        });
    });
}

/** Bake Sl.No/Desc/Amount text-align into pricing HTML (survives missing colgroup CSS). */
export function normalizeEmsPricingTableTextAlignInHtml(html) {
    const raw = String(html || '');
    if (
        !raw ||
        typeof DOMParser === 'undefined' ||
        (!raw.includes(EMS_AUTO_PRICE_SUMMARY_TABLE_ID) &&
            !raw.includes('data-ems-pricing-cols="fixed"'))
    ) {
        return raw;
    }
    try {
        const doc = new DOMParser().parseFromString(
            `<div id="__ems_align_bake">${raw}</div>`,
            'text/html'
        );
        const wrap = doc.getElementById('__ems_align_bake');
        if (!wrap) return raw;
        let changed = false;
        wrap
            .querySelectorAll(
                `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
            )
            .forEach((table) => {
                normalizeEmsPricingSummaryTableCellPadding(table);
                changed = true;
            });
        return changed ? wrap.innerHTML : raw;
    } catch {
        return raw;
    }
}

/**
 * Prep pricing rows so Description text can wrap, then measure and fit heights:
 * single-line → 24px, multi-line → natural content height (no max-height clip).
 */
function unlockEmsPricingSummaryTableRowsForWrap(table) {
    if (!table || !isEmsPricingSummaryTable(table)) return;
    table.removeAttribute('data-ems-row-heights');
    table.removeAttribute('height');
    getTableRows(table).forEach((row) => {
        clearRowHeightInlineLocks(row);
        row.removeAttribute('data-ems-pricing-row-h');
        row.style.setProperty('min-height', `${DEFAULT_TABLE_ROW_HEIGHT}px`, 'important');
        row.style.setProperty('height', 'auto', 'important');
        row.style.setProperty('max-height', 'none', 'important');
        row.style.setProperty('overflow', 'visible', 'important');
        row.querySelectorAll('td, th').forEach((cell) => {
            cell.style.setProperty('min-height', `${DEFAULT_TABLE_ROW_HEIGHT}px`, 'important');
            cell.style.setProperty('height', 'auto', 'important');
            cell.style.setProperty('max-height', 'none', 'important');
            cell.style.setProperty('overflow', 'visible', 'important');
            cell.style.setProperty('white-space', 'normal', 'important');
            cell.style.setProperty('overflow-wrap', 'anywhere', 'important');
            cell.style.setProperty('word-break', 'break-word', 'important');
        });
    });
}

/** Fallback chars/line when column px width is unknown (~11px font in ~340px desc col). */
const EMS_PRICING_DESC_CHARS_PER_LINE = 48;

function pricingDescCharsPerLine(table) {
    const raw = String(table?.getAttribute?.('data-ems-col-widths') || '')
        .split(',')
        .map((s) => parseFloat(String(s).trim()))
        .filter((n) => n > 0);
    const descPx = raw[0] || 0;
    if (descPx >= 40) {
        // ~6.5px/char at 11px — less aggressive so estimate does not invent multi-line rows.
        return Math.max(16, Math.floor((descPx - 20) / 6.5));
    }
    return EMS_PRICING_DESC_CHARS_PER_LINE;
}

function estimatePricingRowHeightPxFromText(row, table) {
    if (!row || isRowAllEmpty(row)) return DEFAULT_TABLE_ROW_HEIGHT;
    if (isPricingFooterOrHeaderRow(row)) return DEFAULT_TABLE_ROW_HEIGHT;
    if (isRowMultiline(row)) return estimateStaticRowHeightPx(row);
    const charsPerLine = pricingDescCharsPerLine(table);
    let maxLines = 1;
    row.querySelectorAll('td, th').forEach((cell, idx) => {
        if (isCellEffectivelyEmpty(cell)) return;
        // Description is col 0; amount column rarely wraps.
        if (idx > 0 && cell.cellIndex > 0) return;
        const text = String(cell.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return;
        maxLines = Math.max(maxLines, Math.ceil(text.length / charsPerLine));
    });
    return DEFAULT_TABLE_ROW_HEIGHT * Math.max(1, maxLines);
}

function isPricingFooterOrHeaderRow(row) {
    if (!row) return false;
    if (row.parentElement?.tagName === 'THEAD' || row.querySelector('th')) return true;
    const kind = String(row.getAttribute('data-ems-row') || '').toLowerCase();
    if (
        kind === 'total' ||
        kind === 'vat' ||
        kind === 'grand' ||
        kind === 'grand-vat' ||
        kind === 'discount' ||
        kind === 'final-discounted'
    ) {
        return true;
    }
    // Fallback when Jodit strips data-ems-row — keep Total/VAT/Grand at 24px.
    const label = String(row.cells?.[0]?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    return /^(Total(\s*\([^)]*\))?|VAT\s*[\d.]+%|Grand Total|Discount(\s*\([\d.]+%\))?|Final Discounted)/i.test(
        label
    );
}

function normalizePricingCellProseForRowHeight(row) {
    row?.querySelectorAll?.('td, th').forEach((cell) => {
        // Drop trailing empty blocks that inflate measured / rendered row height.
        [...cell.querySelectorAll('p, div')].forEach((el) => {
            const text = String(el.textContent || '')
                .replace(/\u00a0/g, ' ')
                .trim();
            if (!text && !el.querySelector('img, table')) {
                if (el.parentElement === cell) el.remove();
            }
        });
        cell.querySelectorAll('p, div, span, font, b, strong').forEach((el) => {
            el.style.setProperty('margin', '0', 'important');
            el.style.setProperty('padding', '0', 'important');
            el.style.setProperty('line-height', '1.25', 'important');
            el.style.setProperty('min-height', '0', 'important');
            el.style.setProperty('max-height', 'none', 'important');
        });
    });
}

/**
 * Single-line / footer → hard 24px (max-height + overflow hidden).
 * Multi-line → measured height with wrap enabled (no clip).
 */
function applyPricingLockedRowHeights(table, rows, heights) {
    rows.forEach((row, i) => {
        const footer = isPricingFooterOrHeaderRow(row);
        let px = Math.max(DEFAULT_TABLE_ROW_HEIGHT, Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT));
        if (footer) px = DEFAULT_TABLE_ROW_HEIGHT;
        heights[i] = px;
        normalizePricingCellProseForRowHeight(row);
        const single = footer || px <= DEFAULT_TABLE_ROW_HEIGHT;
        const h = `${px}px`;
        row.setAttribute('data-ems-pricing-row-h', single ? '24' : String(px));
        row.setAttribute('height', String(px));
        row.style.setProperty('box-sizing', 'border-box');
        row.style.setProperty('height', h, 'important');
        row.style.setProperty('min-height', h, 'important');
        row.style.setProperty('max-height', single ? h : 'none', 'important');
        row.style.setProperty('overflow', single ? 'hidden' : 'visible', 'important');
        row.querySelectorAll('td, th').forEach((cell) => {
            cell.style.setProperty('box-sizing', 'border-box');
            cell.style.setProperty('height', h, 'important');
            cell.style.setProperty('min-height', h, 'important');
            cell.style.setProperty('max-height', single ? h : 'none', 'important');
            cell.style.setProperty('overflow', single ? 'hidden' : 'visible', 'important');
            cell.style.setProperty('line-height', '1.25', 'important');
            cell.style.setProperty('padding', EMS_QUOTE_PRICING_TABLE_CELL_PADDING, 'important');
            cell.style.setProperty('white-space', 'normal', 'important');
            cell.style.setProperty('overflow-wrap', 'anywhere', 'important');
            cell.style.setProperty('word-break', 'break-word', 'important');
        });
    });
    table.setAttribute('data-ems-row-heights', heights.join(','));
}

function pricingRowLooksMultiline(row) {
    if (!row || isRowAllEmpty(row)) return false;
    if (isPricingFooterOrHeaderRow(row)) return false;
    if (isRowMultiline(row)) return true;
    let maxScroll = 0;
    row.querySelectorAll('td, th').forEach((cell) => {
        if (isCellEffectivelyEmpty(cell)) return;
        maxScroll = Math.max(maxScroll, cell.scrollHeight || 0);
    });
    // Require a clear second line (padding + 11px/1.25 ≈ 18–24 for one line).
    return maxScroll > DEFAULT_TABLE_ROW_HEIGHT + 8;
}

export function fitEmsPricingSummaryTableRowHeights(table, { allowMeasure = true } = {}) {
    if (!table || !isEmsPricingSummaryTable(table)) return;
    normalizeEmsPricingSummaryTableCellPadding(table);
    unlockEmsPricingSummaryTableRowsForWrap(table);

    const rows = getTableRows(table);
    if (!rows.length) return;

    if (allowMeasure) {
        // Force layout with current col widths before measuring wrap.
        void table.offsetWidth;
        void table.offsetHeight;
        rows.forEach((row) => {
            void row.offsetHeight;
            row.querySelectorAll('td, th').forEach((cell) => {
                void cell.scrollHeight;
            });
        });
    }

    const heights = rows.map((row) => {
        if (isRowAllEmpty(row) || isPricingFooterOrHeaderRow(row)) {
            return DEFAULT_TABLE_ROW_HEIGHT;
        }
        const estimated = estimatePricingRowHeightPxFromText(row, table);
        if (!allowMeasure) {
            return estimated <= DEFAULT_TABLE_ROW_HEIGHT + 8
                ? DEFAULT_TABLE_ROW_HEIGHT
                : estimated;
        }
        // Live layout wins over char-width estimate (estimate false-positives after col resize).
        if (estimated > DEFAULT_TABLE_ROW_HEIGHT + 8 || pricingRowLooksMultiline(row)) {
            const natural = measureRowNaturalHeightPx(row);
            if (natural <= DEFAULT_TABLE_ROW_HEIGHT + 8) return DEFAULT_TABLE_ROW_HEIGHT;
            return natural;
        }
        return DEFAULT_TABLE_ROW_HEIGHT;
    });

    applyPricingLockedRowHeights(table, rows, heights);
}

function bootstrapEmsPricingSummaryTableRowHeights(table) {
    if (!table || !isEmsPricingSummaryTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    normalizeEmsPricingSummaryTableCellPadding(table);

    // Already fitted (incl. after exit): re-lock stored px — do NOT unlock+refit (that re-inflated rows).
    if (
        table.hasAttribute('data-ems-row-heights-custom') ||
        table.hasAttribute('data-ems-row-heights')
    ) {
        reapplyStoredTableRowHeights(table);
        return;
    }

    fitEmsPricingSummaryTableRowHeights(table, { allowMeasure: true });
}

/** Enable EMS column/row drag-resize on the Clause 4 pricing table (px model, syncs to preview via saved HTML). */
/** EMS auto Total/Discount/VAT table by id only (never BOQ / SL.NO schedules). */
function isEmsAutoPriceSummaryTableById(table) {
    if (!table) return false;
    const id = String(table.id || '');
    return (
        id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        id.startsWith(`${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}--`)
    );
}

/**
 * True for EMS auto-price summary — Description|Amount only (not BOQ / SL.NO tables).
 */
function isStrictTwoColumnPricingSummaryTable(table) {
    if (!isEmsAutoPriceSummaryTableById(table)) return false;
    const rows = getTableRows(table);
    if (!rows.length) return false;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    /* Staff / Price/Head / Amount tables are 4 columns — never rebuild them as 72/28. */
    if (colCount !== 2) return false;
    const headerText = String(rows[0]?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (/\bsl\.?\s*no\b|\bqty\b|\bunit\b|\bquantity\b/.test(headerText)) return false;
    return true;
}

/**
 * Restore Description|Amount on EMS auto-price summary only.
 * Collapses accidental extra cells that cause overlapping "Total Total" labels.
 * Never touches BOQ / multi-column clause tables.
 */
export function normalizeEmsPricingSummaryTableStructure(table) {
    if (!isStrictTwoColumnPricingSummaryTable(table)) return false;
    /* Never delete cells — BOQ tables mis-tagged as summary lost Description/Qty/Unit. */
    let changed = false;
    const doc = table.ownerDocument || document;
    let cg = table.querySelector('colgroup');
    if (!cg) {
        cg = doc.createElement('colgroup');
        table.insertBefore(cg, table.firstChild);
        changed = true;
    }
    const cols = [...cg.querySelectorAll('col')];
    const userResized = table.getAttribute('data-ems-col-widths-custom') === '1';
    const stored = String(table.getAttribute('data-ems-col-widths') || '')
        .split(',')
        .map((s) => parseFloat(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (!userResized || stored.length !== 2) {
        table.removeAttribute('data-ems-col-widths');
        table.removeAttribute('data-ems-col-widths-custom');
        while (cg.firstChild) cg.removeChild(cg.firstChild);
        const c1 = doc.createElement('col');
        c1.style.width = String(EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH || '72%');
        const c2 = doc.createElement('col');
        c2.style.width = String(EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH || '28%');
        cg.appendChild(c1);
        cg.appendChild(c2);
        changed = true;
    } else if (cols.length !== 2) {
        while (cg.firstChild) cg.removeChild(cg.firstChild);
        stored.forEach((w) => {
            const col = doc.createElement('col');
            col.style.width = `${Math.round(w)}px`;
            col.setAttribute('width', String(Math.round(w)));
            cg.appendChild(col);
        });
        changed = true;
    }
    return changed;
}

export function initializeEmsPricingSummaryTableColumns(table) {
    demoteMisTaggedBoqFromPricingSummary(table);
    if (!isEmsPricingSummaryTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    /* Only touch colgroup on real 2-col summary tables — never strip BOQ columns. */
    normalizeEmsPricingSummaryTableStructure(table);
    normalizeEmsPricingSummaryTableCellPadding(table);

    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;

    applyTableLayoutDefaults(table);

    // Accidental px locks (no user-resize flag) must not widen the table — restore 80% default.
    const userResized = table.getAttribute('data-ems-col-widths-custom') === '1';
    if (!userResized) {
        table.removeAttribute('data-ems-col-widths');
        table.removeAttribute('data-ems-col-widths-custom');
        normalizeDefaultPricingTableWidthInDom(table);
        bootstrapEmsPricingSummaryTableRowHeights(table);
        return;
    }

    if (!table.getAttribute('data-ems-col-widths')) {
        table.style.setProperty('width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
        table.style.setProperty('max-width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
        bootstrapEmsPricingSummaryTableRowHeights(table);
        return;
    }

    const widths = readColumnWidthsPx(table, rows, colCount);
    if (widths.length) applyColumnWidths(table, rows, widths);
    bootstrapEmsPricingSummaryTableRowHeights(table);
}

export function initializeAllEmsPricingSummaryTableColumns(root) {
    if (!root?.querySelectorAll) return;
    /* Demote mis-tagged BOQs first so they are not selected / width-stripped as summary. */
    root.querySelectorAll('table').forEach((table) => {
        demoteMisTaggedBoqFromPricingSummary(table);
    });
    root
        .querySelectorAll(
            `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
        )
        .forEach((table) => {
            initializeEmsPricingSummaryTableColumns(table);
        });
}

function applyTableLayoutDefaults(table) {
    if (!table) return;
    table.style.tableLayout = 'fixed';
    if (isEmsPricingSummaryTable(table)) {
        if (!table.getAttribute('data-ems-col-widths')) {
            table.style.setProperty('width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
            table.style.setProperty('max-width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
        }
        return;
    }
    const w = (table.style.width || '').trim();
    if (!w || w === '100%') {
        table.style.removeProperty('width');
    }
}

function getTableRows(table) {
    return [...table.querySelectorAll('tr')];
}

function getColumnCount(rows) {
    return Math.max(0, ...rows.map((r) => r.cells?.length || 0));
}

/** Account for colspan when Excel merges header cells. */
function getLogicalColumnCount(rows) {
    let max = 0;
    rows.forEach((row) => {
        let cols = 0;
        [...row.cells].forEach((cell) => {
            cols += Math.max(1, Number(cell.colSpan) || 1);
        });
        max = Math.max(max, cols);
    });
    return max;
}

/** Measure rendered column widths once after an Excel/Word paste (before EMS col model exists). */
function readOfficeTableColumnWidthsPx(table, rows, colCount) {
    const widths = new Array(colCount).fill(0);

    // 1. Try colgroup <col> inline widths (set by our iframe inlineComputedOfficeTableStyles).
    const cg = table.querySelector('colgroup');
    if (cg) {
        const cols = [...cg.querySelectorAll('col')];
        cols.forEach((col, j) => {
            if (j >= colCount || widths[j] > 0) return;
            const w = parseCssPx(col.style.width) ||
                parseFloat(col.getAttribute('width') || '0');
            if (w > 0) widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w));
        });
    }

    // 2. Try inline style.width on the first row's cells.
    const firstRow = rows[0];
    if (firstRow) {
        for (let j = 0; j < colCount; j += 1) {
            if (widths[j] > 0) continue;
            for (const row of rows) {
                const cell = row.cells[j];
                if (!cell) continue;
                const w = parseCssPx(cell.style.width);
                if (w > 0) {
                    const span = Math.max(1, Number(cell.colSpan) || 1);
                    const slice = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w / span));
                    for (let k = 0; k < span && j + k < colCount; k += 1) {
                        if (widths[j + k] <= 0) widths[j + k] = slice;
                    }
                    break;
                }
            }
        }
    }

    // 3. Fall back to table.style.width split evenly across columns if still missing.
    const tableStyleW = parseCssPx(table.style.width);
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] <= 0) {
            widths[j] = tableStyleW > 0
                ? Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(tableStyleW / colCount))
                : DEFAULT_TABLE_COLUMN_WIDTH;
        }
    }

    // 4. Fit-to-container: scale to A4 inner width so editor + preview match.
    const availableW = getA4InnerContentWidthPx(table.ownerDocument) || 0;
    const totalW = widths.reduce((s, w) => s + (w || 0), 0);
    if (availableW > 0 && totalW > availableW * 1.02) {
        const ratio = availableW / totalW;
        let newTotal = 0;
        for (let j = 0; j < colCount; j += 1) {
            widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round((widths[j] || 0) * ratio));
            newTotal += widths[j];
        }
        // Correct rounding drift so sum ~= availableW.
        const drift = Math.round(availableW - newTotal);
        if (drift !== 0 && colCount) {
            widths[colCount - 1] = Math.max(
                MIN_TABLE_COLUMN_WIDTH,
                Math.round((widths[colCount - 1] || 0) + drift)
            );
        }
    }

    return widths;
}

function parseStoredOfficeTableColumnWidths(table) {
    const stored = String(table?.getAttribute?.('data-ems-col-widths') || '').trim();
    if (!stored) return [];
    return stored.split(',').map((part) => {
        const n = parseFloat(String(part).trim());
        return n > 0 ? Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(n)) : 0;
    });
}

/** Re-apply the saved px column model exactly — never re-measure from page-local rows. */
export function syncOfficePasteTableColumnLayout(table) {
    if (!table || !isOfficePasteTableEl(table)) return;
    /* Pricing summary is Description|Amount only — never apply multi-col office paste widths. */
    if (isEmsPricingSummaryTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;
    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;
    const userResized =
        table.getAttribute('data-ems-col-widths-custom') === '1' ||
        table.getAttribute('data-ems-edit-cols-locked') === '1';
    let widths = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0);
    /*
     * Percent-like / truncated models (e.g. "10,62,8,8,12") sum far below A4 width and
     * scramble Qty/Unit/Amount to ~1 character in the editor under table-layout:fixed.
     */
    const sum = widths.reduce((s, w) => s + w, 0);
    const a4W = getA4InnerContentWidthPx(table.ownerDocument) || 680;
    const tooNarrow =
        !widths.length ||
        widths.length < colCount ||
        sum < Math.max(220, Math.round(a4W * 0.45)) ||
        (colCount >= 5 && widths.slice(-3).some((w) => w > 0 && w < 48));
    if (userResized && widths.length) {
        /*
         * Keep the drag. Do not replace it with the 6-col bootstrap — that is the
         * browse reset (Description shrinks, Amount grows) after exit-edit.
         * Same px list on every page fragment so split headers stay aligned.
         */
        while (widths.length < colCount) {
            widths.push(widths[widths.length - 1] || DEFAULT_TABLE_COLUMN_WIDTH);
        }
        if (widths.length > colCount) widths = widths.slice(0, colCount);
        fitColumnWidthsToMaxPx(widths, a4W);
    } else if (tooNarrow) {
        /* Drop collapsed col/cell px so read/bootstrap cannot echo the scramble. */
        clearTableColumnWidthArtifacts(table);
        widths = bootstrapBoqLikeColumnWidthsPx(colCount, a4W);
    }
    if (!widths.length) return;
    while (widths.length < colCount) widths.push(DEFAULT_TABLE_COLUMN_WIDTH);
    applyColumnWidths(table, rows, widths.slice(0, colCount));
    if (userResized) {
        table.setAttribute('data-ems-col-widths-custom', '1');
        table.setAttribute('data-ems-edit-cols-locked', '1');
    }
}

function buildLeadCellFromHtml(doc, html) {
    const wrap = doc.createElement('div');
    wrap.innerHTML = String(html || '').trim();
    const cell = wrap.querySelector('td, th');
    if (!cell) return createPaginationPadCell(doc);
    const next = clonePaddedTableCell(cell);
    next.removeAttribute('rowspan');
    next.removeAttribute('colspan');
    next.rowSpan = 1;
    next.colSpan = 1;
    return next;
}

function rebuildRowWithLeadingCells(tr, leadCells, colCount, doc) {
    const newTr = /** @type {HTMLTableRowElement} */ (doc.createElement('tr'));
    if (tr.getAttribute('style')) newTr.setAttribute('style', tr.getAttribute('style'));
    [...tr.attributes].forEach((attr) => {
        if (attr.name === 'style' || attr.name === 'data-ems-rowspan-leads') return;
        newTr.setAttribute(attr.name, attr.value);
    });
    leadCells.forEach((cell) => newTr.appendChild(cell));
    [...tr.cells].forEach((cell) => newTr.appendChild(cell.cloneNode(true)));
    while (newTr.cells.length < colCount) {
        newTr.appendChild(createPaginationPadCell(doc));
    }
    return newTr;
}

/** Stamp rowspan anchor cell HTML on split rows so page breaks can restore SL/LOCATION columns. */
export function annotateOfficePasteSplitRowRowspanLeads(tr, rowIndex, grid) {
    if (!tr || !grid || rowIndex < 0) return tr;
    if (rowHasMergedSpans(tr)) return tr;
    if (!isRowspanContinuationRow(rowIndex, grid)) return tr;

    const ownedStart = getRowFirstOwnedLogicalColumn(rowIndex, grid, tr);
    if (ownedStart <= 0) return tr;

    /** @type {string[]} */
    const leadHtmls = [];
    for (let c = 0; c < ownedStart; c += 1) {
        const anchor = grid[rowIndex]?.[c];
        if (!anchor) continue;
        const pos = findCellGridPosition(grid, anchor);
        if (pos && pos.row < rowIndex) leadHtmls.push(anchor.outerHTML);
    }
    if (leadHtmls.length) {
        tr.setAttribute('data-ems-rowspan-leads', encodeURIComponent(JSON.stringify(leadHtmls)));
    }
    return tr;
}

/** Restore SL/LOCATION (or other rowspan anchors) when a page starts mid-item group. */
function repairOrphanedRowspanLeadCells(table) {
    if (!table || !isOfficePasteTableEl(table)) return;

    const doc = table.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    const theadRows = new Set([...table.querySelectorAll('thead tr')]);
    const { rows, grid, colCount } = getOfficePasteTablePaginationGrid(table);

    let lastLeadsKey = '';

    rows.forEach((tr, rowIndex) => {
        if (theadRows.has(tr)) return;

        if (isRowspanContinuationRow(rowIndex, grid)) {
            lastLeadsKey = '';
            return;
        }

        const leadsRaw = tr.getAttribute('data-ems-rowspan-leads');
        if (!leadsRaw) return;

        tr.removeAttribute('data-ems-rowspan-leads');

        /** @type {string[]} */
        let leadHtmls = [];
        try {
            leadHtmls = JSON.parse(decodeURIComponent(leadsRaw));
        } catch {
            return;
        }
        if (!Array.isArray(leadHtmls) || !leadHtmls.length) return;

        const useEmptyPad = leadsRaw === lastLeadsKey;
        lastLeadsKey = leadsRaw;

        const leadCells = leadHtmls.map((html) =>
            useEmptyPad ? createPaginationPadCell(doc) : buildLeadCellFromHtml(doc, html)
        );
        const rebuilt = rebuildRowWithLeadingCells(tr, leadCells, colCount, doc);
        tr.replaceWith(rebuilt);
    });
}

function padSingleRowIsolatedOfficePasteTable(table) {
    if (!table || !isOfficePasteTableEl(table)) return;

    const theadRows = new Set([...table.querySelectorAll('thead tr')]);
    const bodyRows = getTableRows(table).filter((tr) => !theadRows.has(tr));
    if (bodyRows.length !== 1) return;

    const row = bodyRows[0];
    if (rowHasMergedSpans(row)) return;

    const { rows, grid, colCount } = getOfficePasteTablePaginationGrid(table);
    const rowIndex = rows.indexOf(row);
    const padded = padIsolatedOfficePasteTableRow(
        row,
        rowIndex >= 0 ? rowIndex : 0,
        grid,
        colCount
    );
    if (padded !== row) row.replaceWith(padded);
}

/** Apply stored office-paste column widths to every table in an HTML fragment (pagination rejoin). */
export function syncOfficePasteTableColumnsInHtmlString(html) {
    const raw = String(html || '').trim();
    if (!raw || !/<table/i.test(raw) || typeof DOMParser === 'undefined') return raw;
    try {
        const doc = new DOMParser().parseFromString(
            `<div id="__ems_office_col_sync">${raw}</div>`,
            'text/html'
        );
        const root = doc.getElementById('__ems_office_col_sync');
        if (!root) return raw;
        root.querySelectorAll(EMS_OFFICE_PASTE_TABLE_SELECTOR).forEach((table) => {
            if (!isOfficePasteTableEl(table)) return;
            repairOrphanedRowspanLeadCells(table);
            padSingleRowIsolatedOfficePasteTable(table);
            syncOfficePasteTableColumnLayout(table);
        });
        return root.innerHTML.trim() || raw;
    } catch {
        return raw;
    }
}

/** Enable EMS column drag-resize on Excel/Word pasted tables without stripping their colors. */
export function initializeOfficePastedTableColumns(table) {
    if (!table || !isOfficePasteTableEl(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    const rows = getTableRows(table);
    if (!rows.length) return;

    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    const userResizedCols =
        table.getAttribute('data-ems-col-widths-custom') === '1' ||
        table.getAttribute('data-ems-edit-cols-locked') === '1';
    /* Dragged columns are already in the HTML — do not rewrite them on every page pack. */
    if (userResizedCols && table.getAttribute('data-ems-col-widths')) {
        const storedCount = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0).length;
        const colEls = table.querySelectorAll('colgroup col').length;
        if (storedCount > 0 && colEls === storedCount && !table.closest?.('.jodit-wysiwyg')) {
            return;
        }
        syncOfficePasteTableColumnLayout(table);
        return;
    }
    /* Multi-col BOQ in editor: never sync a scrambled stored model — that locked enter-edit. */
    if (colCount >= 4 && table.closest?.('.jodit-wysiwyg')) {
        unscrambleOfficeScheduleTableLikeColumnDrag(table);
        return;
    }

    if (table.getAttribute('data-ems-col-widths')) {
        syncOfficePasteTableColumnLayout(table);
        return;
    }

    if (!colCount) return;
    const widths = readOfficeTableColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
}

/**
 * Live last-3 schedule columns must be wide enough (Qty/Unit/Amount).
 * Stored attr alone is not enough — locks may be missing while data-ems-col-widths remains.
 */
function scheduleTableColumnsLookHealthy(table) {
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (colCount < 4) return true;
    const stored = String(table.getAttribute('data-ems-col-widths') || '')
        .split(',')
        .map((s) => parseFloat(s.trim()) || 0);
    if (stored.length < colCount) return false;
    if (stored.slice(-3).some((w) => w > 0 && w < 48)) return false;
    /* Colgroup must actually carry the px locks (resize path always writes these). */
    const cols = [...(table.querySelectorAll('colgroup col') || [])];
    if (cols.length < colCount) return false;
    let lockedCols = 0;
    cols.slice(0, colCount).forEach((col) => {
        const w = parseCssPx(col.style.width) || parseFloat(col.getAttribute('width') || '0');
        if (w >= 48) lockedCols += 1;
    });
    if (lockedCols < Math.min(3, colCount)) return false;

    const { grid } = buildTableCellGrid(table);
    let measured = 0;
    for (let j = colCount - 3; j < colCount; j += 1) {
        let best = 0;
        for (let r = 0; r < Math.min(grid.length, 4); r += 1) {
            const cell = grid[r]?.[j];
            if (!cell) continue;
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (span !== 1) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos || pos.col !== j) continue;
            const cw = Math.round(cell.getBoundingClientRect?.().width || 0);
            if (cw > best) best = cw;
        }
        if (best > 0) {
            measured += 1;
            if (best < 44) return false;
        }
    }
    /* Not laid out yet — keep retrying (do not mark done on attr alone). */
    return measured >= 2;
}

/**
 * Zero-delta column-resize path — identical to the manual drag that unscrambles BOQ.
 * Enter-edit must use this; sync/bootstrap-from-stored was locking the scramble in.
 */
export function forceRepairOfficeScheduleTableColumnsInRoot(root) {
    unscrambleOfficeScheduleTablesInRootLikeColumnDrag(root);
}

let __emsScheduleColRepairGen = 0;

/**
 * Wait until the editor has a real width, then apply the zero-delta resize path.
 * Retries until live Qty/Unit/Amount columns look healthy (not just stored attrs).
 */
export function scheduleForceRepairOfficeScheduleTableColumns(getRoot, jodit) {
    /* Never schedule a rewrite while the user is (or just finished) resizing columns. */
    if (
        jodit?.__emsColResizing ||
        (jodit?.__emsUserColResizeUntil && Date.now() < jodit.__emsUserColResizeUntil)
    ) {
        return;
    }
    const gen = ++__emsScheduleColRepairGen;
    let done = false;
    const run = () => {
        if (done || gen !== __emsScheduleColRepairGen) return true;
        if (
            jodit?.__emsColResizing ||
            (jodit?.__emsUserColResizeUntil && Date.now() < jodit.__emsUserColResizeUntil)
        ) {
            return true;
        }
        const root = typeof getRoot === 'function' ? getRoot() : getRoot;
        if (!root) return false;
        const w = Math.round(root.getBoundingClientRect?.().width || 0);
        if (w < 200) return false;
        forceRepairOfficeScheduleTableColumnsInRoot(root);
        let ok = true;
        let sawSchedule = false;
        root.querySelectorAll('table').forEach((table) => {
            if (isEmsPricingSummaryTable(table)) return;
            const rows = getTableRows(table);
            const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
            if (colCount < 4) return;
            sawSchedule = true;
            if (!scheduleTableColumnsLookHealthy(table)) ok = false;
        });
        if (sawSchedule && ok) {
            done = true;
            try {
                if (jodit && typeof jodit.synchronizeValues === 'function') {
                    jodit.synchronizeValues();
                }
            } catch {
                /* ignore */
            }
        }
        return sawSchedule ? ok : true;
    };
    let tries = 0;
    const tick = () => {
        if (gen !== __emsScheduleColRepairGen) return;
        tries += 1;
        if (run() || tries > 60) return;
        window.setTimeout(tick, 50);
    };
    requestAnimationFrame(() => {
        requestAnimationFrame(tick);
    });
    window.setTimeout(tick, 100);
    window.setTimeout(tick, 250);
    window.setTimeout(tick, 500);
    window.setTimeout(tick, 900);
    window.setTimeout(tick, 1400);
}

export function initializeAllOfficePastedTableColumns(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(EMS_OFFICE_PASTE_TABLE_SELECTOR).forEach((table) => {
        if (table.getAttribute('data-ems-edit-cols-locked') === '1') return;
        initializeOfficePastedTableColumns(table);
    });
}

const DEFAULT_TABLE_COLUMN_WIDTH = 96;
let EMS_A4_INNER_WIDTH_PX_CACHE = null;

function getA4InnerContentWidthPx(doc) {
    if (EMS_A4_INNER_WIDTH_PX_CACHE != null) return EMS_A4_INNER_WIDTH_PX_CACHE;
    try {
        const d = doc || (typeof document !== 'undefined' ? document : null);
        if (!d?.createElement) return null;
        const el = d.createElement('div');
        // A4 is 210mm wide; preview uses 15mm padding both sides → 180mm inner width.
        el.style.cssText =
            'position:fixed;left:-99999px;top:0;width:180mm;height:1px;opacity:0;pointer-events:none';
        d.body?.appendChild?.(el);
        const w = Math.round(el.getBoundingClientRect().width || 0);
        el.remove();
        EMS_A4_INNER_WIDTH_PX_CACHE = w > 0 ? w : null;
        return EMS_A4_INNER_WIDTH_PX_CACHE;
    } catch {
        EMS_A4_INNER_WIDTH_PX_CACHE = null;
        return null;
    }
}

function parseCssPx(value) {
    if (!value) return 0;
    const m = String(value).trim().match(/^([\d.]+)px$/i);
    return m ? parseFloat(m[1]) : 0;
}

function getOrSyncColgroup(table, colCount) {
    const doc = table.ownerDocument || document;
    let cg = table.querySelector('colgroup');
    if (!cg) {
        cg = doc.createElement('colgroup');
        table.insertBefore(cg, table.firstChild);
    }
    let cols = [...cg.querySelectorAll('col')];
    while (cols.length < colCount) {
        cg.appendChild(doc.createElement('col'));
        cols.push(cg.lastElementChild);
    }
    while (cols.length > colCount) {
        cols.pop()?.remove();
    }
    return { colgroup: cg, cols: [...cg.querySelectorAll('col')] };
}

function getManualTableContainerWidthPx(table) {
    return (
        getA4InnerContentWidthPx(table.ownerDocument) ||
        Math.round(table.closest('.jodit-wysiwyg, .clause-content')?.getBoundingClientRect?.().width || 0) ||
        Math.round(table.parentElement?.getBoundingClientRect?.().width || 0) ||
        0
    );
}

/**
 * Bootstrap unset column widths from the live layout (manual insert / column-resize start).
 * Stored models and inline px still win — getBoundingClientRect is only for missing slots.
 */
function bootstrapUnsetColumnWidthsPx(table, rows, colCount, widths) {
    if (!table || !rows?.length || !colCount) return;
    if (!widths.some((w) => w <= 0)) return;

    const isFirstBootstrap = !table.getAttribute('data-ems-col-widths');

    // First bootstrap: never trust per-cell rects — collapsed tables measure ~96px/cell on re-entry.
    if (!isFirstBootstrap) {
        const firstRow = rows[0];
        let measuredAny = false;
        for (let j = 0; j < colCount; j += 1) {
            if (widths[j] > 0) continue;
            const cell = firstRow?.cells[j];
            if (!cell) continue;
            const cw = Math.round(cell.getBoundingClientRect?.().width || 0);
            if (cw >= MIN_TABLE_COLUMN_WIDTH) {
                widths[j] = cw;
                measuredAny = true;
            }
        }
        if (measuredAny) return;
    }

    let totalW = Math.round(table.getBoundingClientRect?.().width || 0);
    const availableW = getManualTableContainerWidthPx(table);
    if (isFirstBootstrap) {
        if (availableW > totalW) totalW = availableW;
    } else if (totalW <= 0) {
        totalW = availableW;
    }
    if (totalW <= 0) return;

    const even = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(totalW / colCount));
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] <= 0) widths[j] = even;
    }
}

/** Read stored px widths — bootstrap from layout when no model exists yet. */
function readColumnWidthsPx(table, rows, colCount) {
    const widths = new Array(colCount).fill(0);
    const stored = table.getAttribute('data-ems-col-widths');
    if (stored) {
        const parts = stored.split(',').map((s) => parseFloat(s.trim()));
        for (let j = 0; j < colCount; j += 1) {
            if (parts[j] > 0) widths[j] = parts[j];
        }
    }
    const { cols } = getOrSyncColgroup(table, colCount);
    cols.forEach((col, j) => {
        if (j >= colCount || widths[j] > 0) return;
        const w = parseCssPx(col.style.width) || parseFloat(col.getAttribute('width') || '0');
        if (w > 0) widths[j] = w;
    });
    const firstRow = rows[0];
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] > 0) continue;
        const w = parseCssPx(firstRow?.cells[j]?.style?.width);
        if (w > 0) widths[j] = w;
    }
    if (widths.some((w) => w <= 0)) {
        bootstrapUnsetColumnWidthsPx(table, rows, colCount, widths);
    }
    for (let j = 0; j < colCount; j += 1) {
        if (widths[j] <= 0) widths[j] = DEFAULT_TABLE_COLUMN_WIDTH;
    }
    return widths;
}

function isColumnAllEmpty(rows, colIndex) {
    for (const row of rows) {
        const cell = row.cells[colIndex];
        if (cell && !isCellEffectivelyEmpty(cell)) return false;
    }
    return true;
}

function isLogicalColumnAllEmpty(grid, colIndex) {
    if (!grid?.length) return true;
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[colIndex];
        if (cell && !isCellEffectivelyEmpty(cell)) return false;
    }
    return true;
}

const DEFAULT_TABLE_ROW_HEIGHT = 24;

function measureRowHeightPx(row) {
    if (!row) return 0;
    const styleH = parseCssPx(row.style.height) || parseCssPx(row.style.minHeight);
    if (styleH > 0) return styleH;
    let maxCell = 0;
    row.querySelectorAll('td, th').forEach((cell) => {
        const ch =
            parseCssPx(cell.style.height) ||
            parseCssPx(cell.style.minHeight) ||
            parseFloat(cell.getAttribute('height') || '0');
        if (ch > maxCell) maxCell = ch;
    });
    if (maxCell > 0) return maxCell;
    try {
        const rect = row.getBoundingClientRect();
        if (rect.height > 0) return Math.round(rect.height);
    } catch {
        /* ignore */
    }
    return 0;
}

function copyCellLayoutStyles(fromCell, toCell) {
    if (!fromCell || !toCell) return;
    [
        'paddingTop',
        'paddingBottom',
        'paddingLeft',
        'paddingRight',
        'verticalAlign',
        'lineHeight',
        'fontSize',
        'fontFamily',
    ].forEach((prop) => {
        const val = fromCell.style[prop];
        if (val) toCell.style[prop] = val;
    });
    const heightAttr = fromCell.getAttribute('height');
    if (heightAttr) toCell.setAttribute('height', heightAttr);
}

/** Match a newly inserted row to the row the user had selected (height + cell padding). */
function copyRowDimensionsFromReference(table, referenceRow, newRow) {
    if (!table || !referenceRow?.isConnected || !newRow?.isConnected) return;
    const px = measureRowHeightPx(referenceRow);
    if (px <= 0) return;

    const rows = getTableRows(table);
    const rowHeights = readRowHeightsPx(table, rows);
    const refIdx = rows.indexOf(referenceRow);
    const newIdx = rows.indexOf(newRow);
    if (refIdx >= 0) rowHeights[refIdx] = Math.max(rowHeights[refIdx] || 0, px);
    if (newIdx >= 0) rowHeights[newIdx] = px;
    applyRowHeights(table, rows, rowHeights);

    const refCells = [...referenceRow.cells];
    const newCells = [...newRow.cells];
    const len = Math.min(refCells.length, newCells.length);
    for (let i = 0; i < len; i += 1) {
        copyCellLayoutStyles(refCells[i], newCells[i]);
    }
}

/** Match a newly inserted logical column to the selected column width. */
function copyColumnDimensionsFromReference(table, sourceColIndex, destColIndex) {
    if (!table || sourceColIndex < 0 || destColIndex < 0 || sourceColIndex === destColIndex) return;

    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount || sourceColIndex >= colCount) return;

    let widths = readColumnWidthsPx(table, rows, colCount);
    if (widths[sourceColIndex] > 0) {
        widths[destColIndex] = widths[sourceColIndex];
    } else {
        const { grid } = buildTableCellGrid(table);
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[sourceColIndex];
            if (!cell) continue;
            const w =
                parseCssPx(cell.style.width) ||
                Math.round(cell.getBoundingClientRect().width || 0);
            if (w > 0) {
                widths[destColIndex] = w;
                break;
            }
        }
    }
    if (widths[destColIndex] > 0) {
        applyColumnWidths(table, rows, widths);
    }
}

function isRowAllEmpty(row) {
    const cells = [...row.querySelectorAll('td, th')];
    return cells.length > 0 && cells.every(isCellEffectivelyEmpty);
}

function clearRowHeightInlineLocks(row) {
    if (!row) return;
    ['height', 'min-height', 'max-height'].forEach((prop) => row.style.removeProperty(prop));
    row.removeAttribute('height');
    row.querySelectorAll('td, th').forEach((cell) => {
        ['height', 'min-height', 'max-height'].forEach((prop) => cell.style.removeProperty(prop));
        cell.removeAttribute('height');
    });
}

/** Natural content height with locks cleared — used for multiline fit and detection. */
function measureRowNaturalHeightPx(row) {
    if (!row) return DEFAULT_TABLE_ROW_HEIGHT;
    clearRowHeightInlineLocks(row);
    let maxH = 0;
    row.querySelectorAll('td, th').forEach((cell) => {
        maxH = Math.max(maxH, cell.scrollHeight, cell.offsetHeight);
    });
    maxH = Math.max(maxH, row.scrollHeight, row.offsetHeight);
    return Math.max(DEFAULT_TABLE_ROW_HEIGHT, Math.round(maxH));
}

function isRowMultiline(row) {
    if (!row || isRowAllEmpty(row)) return false;
    for (const cell of row.querySelectorAll('td, th')) {
        if (isCellEffectivelyEmpty(cell)) continue;
        if (cell.querySelector('br')) return true;
        const blocks = [...cell.querySelectorAll(':scope > p, :scope > div, :scope > li')];
        if (blocks.filter((b) => !isCellEffectivelyEmpty(b)).length > 1) return true;
    }
    return false;
}

function applyFitRowHeight(tr, px) {
    if (!tr) return;
    const rounded = Math.max(DEFAULT_TABLE_ROW_HEIGHT, Math.round(px));
    const h = `${rounded}px`;
    tr.style.setProperty('box-sizing', 'border-box');
    tr.style.setProperty('height', h, 'important');
    tr.style.setProperty('min-height', h, 'important');
    tr.style.removeProperty('max-height');
    tr.setAttribute('height', String(rounded));
    tr.querySelectorAll('td, th').forEach((cell) => {
        cell.style.setProperty('box-sizing', 'border-box');
        cell.style.setProperty('height', h, 'important');
        cell.style.setProperty('min-height', h, 'important');
        cell.style.removeProperty('max-height');
    });
}

function readRowHeightsPx(table, rows) {
    const heights = new Array(rows.length).fill(0);
    const stored = table.getAttribute('data-ems-row-heights');
    if (stored) {
        const parts = stored.split(',').map((s) => parseFloat(s.trim()));
        for (let i = 0; i < rows.length; i += 1) {
            if (parts[i] > 0) heights[i] = parts[i];
        }
    }
    rows.forEach((row, i) => {
        if (heights[i] > 0) return;
        const attrH = parseFloat(row.getAttribute('height') || '0');
        if (attrH > 0) {
            heights[i] = attrH;
            return;
        }
        const h = parseCssPx(row.style.height);
        if (h > 0) heights[i] = h;
    });
    for (let i = 0; i < rows.length; i += 1) {
        if (heights[i] > 0) continue;
        const row = rows[i];
        if (isRowAllEmpty(row)) {
            heights[i] = DEFAULT_TABLE_ROW_HEIGHT;
        } else if (table?.hasAttribute('data-ems-row-heights-custom')) {
            const measured = measureRowHeightPx(row);
            heights[i] = measured > 0 ? measured : DEFAULT_TABLE_ROW_HEIGHT;
        } else if (isRowMultiline(row)) {
            heights[i] = measureRowNaturalHeightPx(row);
        } else {
            heights[i] = DEFAULT_TABLE_ROW_HEIGHT;
        }
    }
    return heights;
}

function lockRowHeight(tr, px) {
    if (!tr) return;
    const rounded = Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(px));
    const h = `${rounded}px`;
    tr.style.setProperty('box-sizing', 'border-box');
    tr.style.setProperty('height', h, 'important');
    tr.style.setProperty('min-height', h, 'important');
    tr.style.setProperty('max-height', h, 'important');
    tr.setAttribute('height', String(rounded));
    tr.querySelectorAll('td, th').forEach((cell) => {
        cell.style.setProperty('box-sizing', 'border-box');
        cell.style.setProperty('height', h, 'important');
        cell.style.setProperty('min-height', h, 'important');
        cell.style.setProperty('max-height', h, 'important');
    });
}

export function applyTableRowHeightModel(table) {
    if (!table) return;
    if (
        table.hasAttribute('data-ems-row-heights-custom') ||
        table.hasAttribute('data-ems-row-heights')
    ) {
        reapplyStoredTableRowHeights(table);
        return;
    }
    const isOfficePainted =
        isOfficePasteTableEl(table) ||
        Boolean(table.querySelector?.('td[data-ems-cell-bg], th[data-ems-cell-bg]'));
    if (isOfficePainted) return;
    ensureTableRowHeightModel(table);
}

function applyRowHeights(table, rows, heights) {
    rows.forEach((row, i) => {
        const px = Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT));
        heights[i] = px;
        lockRowHeight(row, px);
    });
    table.setAttribute('data-ems-row-heights', heights.join(','));
}

/** Re-lock row px from `data-ems-row-heights` only — no neighbor harmonization (safe after user resize). */
export function reapplyStoredTableRowHeights(table) {
    if (!table) return;
    const rows = getTableRows(table);
    if (!rows.length || !table.hasAttribute('data-ems-row-heights')) return;
    const heights = readRowHeightsPx(table, rows);
    if (isEmsPricingSummaryTable(table) && !table.hasAttribute('data-ems-row-heights-custom')) {
        const next = rows.map((row, i) => {
            if (isPricingFooterOrHeaderRow(row)) return DEFAULT_TABLE_ROW_HEIGHT;
            const h = Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT);
            // Keep stored live heights; do not inflate 24px with char-width estimate.
            return h <= DEFAULT_TABLE_ROW_HEIGHT + 8
                ? DEFAULT_TABLE_ROW_HEIGHT
                : Math.max(DEFAULT_TABLE_ROW_HEIGHT, h);
        });
        applyPricingLockedRowHeights(table, rows, next);
        return;
    }
    rows.forEach((row, i) => {
        const px = Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT));
        heights[i] = px;
        lockRowHeight(row, px);
    });
    table.setAttribute('data-ems-row-heights', heights.join(','));
}

/**
 * Locked office-paste rows (max-height + overflow:hidden) clip wrapped headers such as
 * "Unit Price in BHD" / "Total Price in BHD". Grow only the clipped row — A4 and footer stay put.
 * @param {ParentNode|null|undefined} root
 */
export function expandClippedOfficeTableRowHeights(root, { includePackMeasure = false } = {}) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(EMS_OFFICE_PASTE_TABLE_SELECTOR).forEach((table) => {
        if (isEmsPricingSummaryTable(table)) return;
        if (!includePackMeasure && table.closest?.('.quote-clause-measure-host, [data-pack-merge-measure], [data-ems-pack-measure]')) {
            return;
        }
        if (
            !table.hasAttribute('data-ems-row-heights') &&
            !table.hasAttribute('data-ems-row-heights-custom')
        ) {
            return;
        }
        const rows = getTableRows(table);
        if (!rows.length) return;
        const stored = String(table.getAttribute('data-ems-row-heights') || '')
            .split(',')
            .map((s) => parseFloat(String(s).trim()) || 0);
        const heights = rows.map((row, i) => {
            if (stored[i] > 0) return stored[i];
            return parseCssPx(row.style.maxHeight) || parseCssPx(row.style.height) || 0;
        });
        let changed = false;
        rows.forEach((row, i) => {
            const locked = Math.round(heights[i] || 0);
            if (!(locked > 0)) return;
            // Most saved rows already fit. Avoid relayout of every row for each
            // candidate page; only lift locks when the cell actually clips.
            if (![...row.cells].some(cell => cell.scrollHeight > cell.clientHeight + 1)) return;
            const natural = measureRowUnclippedHeightPx(row);
            if (!(natural > locked + 1)) return;
            const next = Math.max(MIN_TABLE_ROW_HEIGHT, natural);
            heights[i] = next;
            lockRowHeight(row, next);
            changed = true;
        });
        if (!changed) return;
        table.setAttribute(
            'data-ems-row-heights',
            heights.map((n) => Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(n || MIN_TABLE_ROW_HEIGHT))).join(',')
        );
        const tableH = parseCssPx(table.style.height);
        const sum = heights.reduce((acc, n) => acc + (Number(n) || 0), 0);
        if (tableH > 0 && sum > tableH + 1) {
            table.style.setProperty('height', 'auto', 'important');
            table.style.setProperty('max-height', 'none', 'important');
        }
    });
}

/** Content height with row/cell max-height locks lifted, then styles restored. */
function measureRowUnclippedHeightPx(row) {
    if (!row) return 0;
    const table = row.closest?.('table');
    const tableStyle = table?.getAttribute?.('style') ?? null;
    const cells = [...row.querySelectorAll('td, th')];
    const rowStyle = row.getAttribute('style');
    const cellStyles = cells.map((cell) => cell.getAttribute('style'));
    if (table) {
        table.style.setProperty('height', 'auto', 'important');
        table.style.setProperty('max-height', 'none', 'important');
    }
    row.style.setProperty('max-height', 'none', 'important');
    row.style.setProperty('height', 'auto', 'important');
    row.style.setProperty('overflow', 'visible', 'important');
    cells.forEach((cell) => {
        cell.style.setProperty('max-height', 'none', 'important');
        cell.style.setProperty('height', 'auto', 'important');
        cell.style.setProperty('overflow', 'visible', 'important');
    });
    let h = 0;
    cells.forEach((cell) => {
        const cs = cell.ownerDocument?.defaultView?.getComputedStyle(cell);
        const borderY = cs
            ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
            : 0;
        h = Math.max(h, Math.ceil((cell.scrollHeight || 0) + borderY), Math.ceil(cell.offsetHeight || 0));
    });
    if (table) {
        if (tableStyle == null) table.removeAttribute('style');
        else table.setAttribute('style', tableStyle);
    }
    if (rowStyle == null) row.removeAttribute('style');
    else row.setAttribute('style', rowStyle);
    cells.forEach((cell, i) => {
        if (cellStyles[i] == null) cell.removeAttribute('style');
        else cell.setAttribute('style', cellStyles[i]);
    });
    return h;
}

/**
 * Strip locked row px for clause page-pack measurement only (Align Page tight fit).
 * Preview/PDF keep stored row heights; packer must not treat empty rows as full-page tall.
 */
/** Excel/Word pasted tables render slightly taller in Chromium PDF than on-screen measure — pack with headroom. */
export const EMS_OFFICE_PASTE_PDF_MEASURE_HEIGHT_FACTOR = 1.15;

export function clauseMeasureRootHasOfficePasteTable(root) {
    if (!root?.querySelector) return false;
    return !!root.querySelector(
        'table[data-ems-paste-source="office"], table[data-ems-col-widths], table[data-ems-excel-paste="1"], table[data-ems-word-paste="1"], table.ems-office-paste-table'
    );
}

/** @param {number} heightPx @param {ParentNode|null|undefined} root */
export function applyOfficePasteMeasureHeightPadding(heightPx, root) {
    const h = Math.max(0, Math.round(Number(heightPx) || 0));
    if (!h || !clauseMeasureRootHasOfficePasteTable(root)) return h;
    return Math.round(h * EMS_OFFICE_PASTE_PDF_MEASURE_HEIGHT_FACTOR);
}

/**
 * Strip row-height locks for clause page-pack measurement only (including custom).
 * Preview/PDF keep baked heights; packer must measure natural content height so rows
 * pack densely and following prose can fill leftover sheet space.
 */
export function relaxTableRowHeightsForClausePackMeasure(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table').forEach((table) => {
        table.removeAttribute('data-ems-row-heights');
        table.removeAttribute('data-ems-row-heights-custom');
        table.querySelectorAll('tr').forEach((row) => {
            row.style.removeProperty('height');
            row.style.removeProperty('min-height');
            row.style.removeProperty('max-height');
            row.removeAttribute('height');
            row.removeAttribute('data-ems-pricing-row-h');
            row.querySelectorAll('td, th').forEach((cell) => {
                cell.style.removeProperty('height');
                cell.style.removeProperty('min-height');
                cell.style.removeProperty('max-height');
                cell.removeAttribute('height');
            });
        });
    });
}

/** Apply row-height model to every table in an editor/preview root (after columns are initialized). */
/**
 * Read px column widths from a live pricing table.
 * Only when the user has resized columns (data-ems-col-widths-custom).
 * Measuring default 80% layout and baking those px on exit made the table jump wider.
 */
function readLivePricingColWidthsCsv(table) {
    if (!table || !isEmsPricingSummaryTable(table)) return '';
    if (table.getAttribute('data-ems-col-widths-custom') !== '1') return '';
    const attr = String(table.getAttribute('data-ems-col-widths') || '').trim();
    if (attr && attr.split(',').some((s) => parseFloat(String(s).trim()) > 0)) return attr;
    return '';
}

function pricingColWidthsCsvHasPx(csv) {
    return String(csv || '')
        .split(',')
        .some((s) => parseFloat(String(s).trim()) > 0);
}

/**
 * Force data-ems-col-widths + px colgroup/cell locks into HTML.
 * preferHtml: keep committed widths (exit bake). Otherwise live editor wins (commit).
 * Pricing tables without a prior user resize stay at EMS_QUOTE_PRICING_TABLE_WIDTH (no px invent).
 */
export function bakePricingColWidthsFromLiveDom(root, html, { preferHtml = false } = {}) {
    const raw = String(html || '');
    if (!raw || !root?.querySelectorAll || typeof DOMParser === 'undefined') return raw;
    const liveById = new Map();
    root
        .querySelectorAll(
            `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
        )
        .forEach((table) => {
            const id = String(table.id || '').trim();
            const csv = readLivePricingColWidthsCsv(table);
            if (id && csv) liveById.set(id, csv);
        });
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_col_bake">${raw}</div>`, 'text/html');
        const wrap = doc.getElementById('__ems_col_bake');
        if (!wrap) return raw;
        let changed = false;
        wrap
            .querySelectorAll(
                `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
            )
            .forEach((table) => {
                const id = String(table.id || '').trim();
                const htmlCsv = table.getAttribute('data-ems-col-widths') || '';
                const liveCsv = (id && liveById.get(id)) || '';
                const liveHadCustom = pricingColWidthsCsvHasPx(liveCsv);
                const htmlHadCustom = pricingColWidthsCsvHasPx(htmlCsv);
                const htmlMarkedCustom =
                    table.getAttribute('data-ems-col-widths-custom') === '1';
                /*
                 * Never strip committed user widths just because the browse DOM has not
                 * painted custom yet (exit-edit bakeAfterExit wiped resized tables).
                 */
                if (
                    !preferHtml &&
                    !liveHadCustom &&
                    !htmlHadCustom &&
                    !htmlMarkedCustom
                ) {
                    table.removeAttribute('data-ems-col-widths');
                    table.removeAttribute('data-ems-col-widths-custom');
                    normalizeDefaultPricingTableWidthInDom(table);
                    changed = true;
                    return;
                }
                const csv = preferHtml
                    ? htmlHadCustom
                        ? htmlCsv
                        : liveCsv
                    : liveHadCustom
                      ? liveCsv
                      : htmlCsv;
                if (!pricingColWidthsCsvHasPx(csv)) {
                    if (htmlMarkedCustom && htmlHadCustom) {
                        /* keep attrs — fall through with htmlCsv below */
                    } else if (!htmlMarkedCustom && !htmlHadCustom) {
                    if (normalizeDefaultPricingTableWidthInDom(table)) changed = true;
                    return;
                }
                }
                const useCsv = pricingColWidthsCsvHasPx(csv) ? csv : htmlCsv;
                const widths = String(useCsv || '')
                    .split(',')
                    .map((s) => parseFloat(s.trim()))
                    .filter((n) => n > 0);
                if (!widths.length) return;
                table.setAttribute('data-ems-col-widths-custom', '1');
                applyColumnWidths(table, getTableRows(table), widths);
                changed = true;
            });
        return changed ? wrap.innerHTML : raw;
    } catch {
        return raw;
    }
}

/** Restore default Clause-4 pricing table width when the user never resized columns. */
function normalizeDefaultPricingTableWidthInDom(table) {
    if (!table || !isEmsPricingSummaryTable(table)) return false;
    if (table.getAttribute('data-ems-col-widths-custom') === '1') return false;
    let changed = false;
    table.removeAttribute('data-ems-col-widths');
    table.removeAttribute('data-ems-col-widths-custom');
    const style = String(table.getAttribute('style') || '');
    const targetW = String(EMS_QUOTE_PRICING_TABLE_WIDTH || '80%');
    // Drop px width/min-width locks left by a prior bad bake; keep other inline styles.
    let nextStyle = style
        .replace(/(?:^|;)\s*width\s*:\s*[\d.]+px\s*(?:!important)?\s*/gi, ';')
        .replace(/(?:^|;)\s*min-width\s*:\s*[\d.]+px\s*(?:!important)?\s*/gi, ';')
        .replace(/(?:^|;)\s*max-width\s*:\s*100%\s*(?:!important)?\s*/gi, ';')
        .replace(/;;+/g, ';')
        .replace(/^;|;$/g, '')
        .trim();
    if (!/width\s*:/i.test(nextStyle)) {
        nextStyle = `${nextStyle ? `${nextStyle};` : ''}width:${targetW} !important;max-width:${targetW} !important`;
        changed = true;
    } else if (style !== nextStyle) {
        changed = true;
    }
    if (changed || style !== nextStyle) {
        table.setAttribute('style', nextStyle);
        table.style.setProperty('width', targetW, 'important');
        table.style.setProperty('max-width', targetW, 'important');
        table.style.removeProperty('min-width');
        changed = true;
    }
    /* Clear cell px locks so percent colgroup matches edit mode. */
    table.querySelectorAll('td, th').forEach((cell) => {
        cell.style.removeProperty('width');
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        cell.removeAttribute('width');
    });
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    const headerText = String(
        table.querySelector('thead')?.textContent || rows[0]?.textContent || ''
    )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const doc = table.ownerDocument || document;
    let cg = table.querySelector('colgroup');
    if (!cg) {
        cg = doc.createElement('colgroup');
        table.insertBefore(cg, table.firstChild);
        changed = true;
    }
    const pctWidths =
        colCount === 3 && /\bsl\.?\s*no\b/.test(headerText)
            ? ['10%', '62%', '28%']
            : colCount === 2
              ? [
                    String(EMS_QUOTE_PRICING_TABLE_DESC_COL_WIDTH || '72%'),
                    String(EMS_QUOTE_PRICING_TABLE_AMOUNT_COL_WIDTH || '28%'),
                ]
              : null;
    if (pctWidths) {
        while (cg.firstChild) cg.removeChild(cg.firstChild);
        pctWidths.forEach((w) => {
            const col = doc.createElement('col');
            col.style.width = w;
            cg.appendChild(col);
        });
        changed = true;
    }
    return changed;
}

/**
 * After exit-edit: keep committed column widths, live-fit row heights on the painted
 * preview, then merge only height locks into the HTML (never replace table outerHTML).
 */
export function fitPricingTablesInRootAndBakeIntoHtml(root, html) {
    const raw = String(html || '');
    if (!root?.querySelectorAll || typeof DOMParser === 'undefined') return raw;

    /*
     * preferHtml:true after exit-edit — committed HTML (with data-ems-col-widths-custom)
     * is authoritative; browse DOM may still show default 80% until re-applied.
     */
    const withCols = bakePricingColWidthsFromLiveDom(root, raw, { preferHtml: true });
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_row_bake">${withCols}</div>`, 'text/html');
        const wrap = doc.getElementById('__ems_row_bake');
        if (!wrap) return withCols;

        // Sync user-resized col widths onto live preview before measuring rows.
        wrap
            .querySelectorAll(
                `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
            )
            .forEach((parsed) => {
                const id = String(parsed.id || '').trim();
                const live = id ? root.querySelector(`table#${id}`) : null;
                if (!live) return;
                const custom =
                    parsed.getAttribute('data-ems-col-widths-custom') === '1' ||
                    live.getAttribute('data-ems-col-widths-custom') === '1' ||
                    pricingColWidthsCsvHasPx(parsed.getAttribute('data-ems-col-widths'));
                if (!custom) {
                    live.removeAttribute('data-ems-col-widths');
                    live.removeAttribute('data-ems-col-widths-custom');
                    normalizeDefaultPricingTableWidthInDom(live);
                    return;
                }
                const csv =
                    parsed.getAttribute('data-ems-col-widths') ||
                    live.getAttribute('data-ems-col-widths') ||
                    '';
                if (!csv) return;
                    const widths = csv
                        .split(',')
                        .map((s) => parseFloat(s.trim()))
                        .filter((n) => n > 0);
                    if (widths.length) {
                    live.setAttribute('data-ems-col-widths-custom', '1');
                    parsed.setAttribute('data-ems-col-widths-custom', '1');
                        applyColumnWidths(live, getTableRows(live), widths);
                }
            });

        // Live-fit row heights at browse width (clears edit-time inflation / blank bands).
        wrap
            .querySelectorAll(
                `table#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}, table[id^="${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}"], table[data-ems-pricing-cols="fixed"]`
            )
            .forEach((parsed) => {
                const id = String(parsed.id || '').trim();
                const live = id ? root.querySelector(`table#${id}`) : null;
                if (!live) return;

                const keepRowCustom =
                    live.hasAttribute('data-ems-row-heights-custom') &&
                    live.getAttribute('data-ems-col-widths-custom') === '1';
                if (keepRowCustom) {
                    reapplyStoredTableRowHeights(live);
                } else {
                    live.removeAttribute('data-ems-row-heights-custom');
                    fitEmsPricingSummaryTableRowHeights(live, { allowMeasure: true });
                }

                const colCsv =
                    parsed.getAttribute('data-ems-col-widths') ||
                    live.getAttribute('data-ems-col-widths') ||
                    '';
                const keepColCustom =
                    live.getAttribute('data-ems-col-widths-custom') === '1' ||
                    parsed.getAttribute('data-ems-col-widths-custom') === '1' ||
                    pricingColWidthsCsvHasPx(colCsv);
                if (colCsv && keepColCustom) {
                    const widths = colCsv
                        .split(',')
                        .map((s) => parseFloat(s.trim()))
                        .filter((n) => n > 0);
                    if (widths.length) {
                        parsed.setAttribute('data-ems-col-widths-custom', '1');
                        applyColumnWidths(parsed, getTableRows(parsed), widths);
                    }
                } else {
                    parsed.removeAttribute('data-ems-col-widths');
                    parsed.removeAttribute('data-ems-col-widths-custom');
                    normalizeDefaultPricingTableWidthInDom(parsed);
                }

                const rowH = live.getAttribute('data-ems-row-heights');
                if (!rowH) return;
                const heights = rowH.split(',').map((s) => parseFloat(s.trim()));
                if (keepRowCustom) {
                    parsed.setAttribute('data-ems-row-heights-custom', '1');
                } else {
                    parsed.removeAttribute('data-ems-row-heights-custom');
                }
                applyPricingLockedRowHeights(parsed, getTableRows(parsed), heights);
            });

        return wrap.innerHTML;
    } catch {
        return withCols;
    }
}

export function applyAllTableRowHeightsInRoot(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table').forEach((table) => {
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            return;
        }
        if (
            table.hasAttribute('data-ems-row-heights') ||
            table.hasAttribute('data-ems-row-heights-custom')
        ) {
            reapplyStoredTableRowHeights(table);
            return;
        }
        applyTableRowHeightModel(table);
    });
    /* Restore H/V gutters + H borders so split lines stay visible after exit-edit. */
    bakeEmsCellSplitsInRoot(root);
}

/**
 * Align Page measure path: only re-lock tables that already have baked row heights.
 * Skips full fit/measure (that was the multi-page Align bottleneck).
 */
export function applyStoredTableRowHeightsInRoot(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table').forEach((table) => {
        if (
            table.hasAttribute('data-ems-row-heights') ||
            table.hasAttribute('data-ems-row-heights-custom')
        ) {
            reapplyStoredTableRowHeights(table);
        }
    });
}

/** Jodit may strip inline row heights after load — re-apply on several ticks until layout settles. */
export function scheduleApplyAllTableRowHeightsInEditor(getBody) {
    const run = () => {
        const root = typeof getBody === 'function' ? getBody() : getBody;
        applyAllTableRowHeightsInRoot(root);
    };
    run();
    requestAnimationFrame(() => {
        run();
        requestAnimationFrame(() => {
            run();
            window.setTimeout(run, 0);
            window.setTimeout(run, 50);
            window.setTimeout(run, 150);
            window.setTimeout(run, 350);
        });
    });
}

/**
 * Lock every row to the stored px model so edit mode matches read/preview (empty rows stay 24px).
 * Re-applies inline heights after normalization strips them.
 */
export function ensureTableRowHeightModel(table) {
    if (!table) return;
    const isOfficePainted =
        isOfficePasteTableEl(table) || Boolean(table.querySelector?.('td[data-ems-cell-bg], th[data-ems-cell-bg]'));
    if (isOfficePainted && !table.hasAttribute('data-ems-row-heights-custom')) return;
    const rows = getTableRows(table);
    if (!rows.length) return;

    if (table.hasAttribute('data-ems-row-heights-custom')) {
        reapplyStoredTableRowHeights(table);
        return;
    }

    const storedParts = (table.getAttribute('data-ems-row-heights') || '')
        .split(',')
        .map((s) => parseFloat(s.trim()));

    const heights = new Array(rows.length).fill(0);
    rows.forEach((row, i) => {
        if (storedParts[i] > 0) {
            heights[i] = storedParts[i];
            return;
        }
        if (isRowAllEmpty(row)) {
            heights[i] = DEFAULT_TABLE_ROW_HEIGHT;
        } else if (isRowMultiline(row)) {
            heights[i] = measureRowNaturalHeightPx(row);
        } else {
            heights[i] = DEFAULT_TABLE_ROW_HEIGHT;
        }
    });
    applyRowHeights(table, rows, heights);
}

function estimateStaticRowHeightPx(row) {
    if (isRowAllEmpty(row)) return DEFAULT_TABLE_ROW_HEIGHT;
    if (!isRowMultiline(row)) return DEFAULT_TABLE_ROW_HEIGHT;
    let lines = 1;
    row.querySelectorAll('td, th').forEach((cell) => {
        const brCount = cell.querySelectorAll('br').length;
        const blockCount = [...cell.querySelectorAll(':scope > p, :scope > div, :scope > li')].filter(
            (b) => !isCellEffectivelyEmpty(b)
        ).length;
        lines = Math.max(lines, brCount + 1, blockCount);
    });
    return DEFAULT_TABLE_ROW_HEIGHT * Math.max(1, lines);
}

/** Apply 24px / multiline-fit row model to tables inside an HTML fragment (preview sync without live layout). */
export function applyTableRowHeightModelInHtmlString(html) {
    const raw = String(html || '');
    if (!raw || !/<table/i.test(raw) || typeof DOMParser === 'undefined') return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_row_h_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_row_h_root');
        if (!root) return raw;
        root.querySelectorAll('table').forEach((table) => {
            if (
                isOfficePasteTableEl(table) &&
                !table.hasAttribute('data-ems-row-heights-custom')
            ) {
                return;
            }
            if (isEmsPricingSummaryTable(table)) {
                if (!table.getAttribute('data-ems-col-widths')) {
                    table.style.setProperty('width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
                    table.style.setProperty('max-width', EMS_QUOTE_PRICING_TABLE_WIDTH, 'important');
                }
                const rows = getTableRows(table);
                if (!rows.length) return;
                if (table.hasAttribute('data-ems-row-heights-custom')) {
                    reapplyStoredTableRowHeights(table);
                    return;
                }
                // Prefer stored live-measured heights. Char estimate only fills missing values —
                // never inflate a stored 24px lock (that was the resize→exit tall-row bug).
                if (table.hasAttribute('data-ems-row-heights')) {
                    const stored = (table.getAttribute('data-ems-row-heights') || '')
                        .split(',')
                        .map((s) => parseFloat(s.trim()));
                    const heights = rows.map((row, i) => {
                        if (isPricingFooterOrHeaderRow(row)) return DEFAULT_TABLE_ROW_HEIGHT;
                        const h = stored[i];
                        if (h > DEFAULT_TABLE_ROW_HEIGHT + 8) {
                            return Math.max(DEFAULT_TABLE_ROW_HEIGHT, Math.round(h));
                        }
                        if (h > 0) return DEFAULT_TABLE_ROW_HEIGHT;
                        const estimated = estimatePricingRowHeightPxFromText(row, table);
                        return estimated <= DEFAULT_TABLE_ROW_HEIGHT + 8
                            ? DEFAULT_TABLE_ROW_HEIGHT
                            : estimated;
                    });
                    applyPricingLockedRowHeights(table, rows, heights);
                } else {
                    fitEmsPricingSummaryTableRowHeights(table, { allowMeasure: false });
                }
                table.querySelectorAll('td, th').forEach((cell) => {
                    cell.style.padding = EMS_QUOTE_PRICING_TABLE_CELL_PADDING;
                    cell.style.lineHeight = '1.25';
                });
                return;
            }
            if (table.hasAttribute('data-ems-row-heights-custom')) {
                reapplyStoredTableRowHeights(table);
                return;
            }
            const rows = getTableRows(table);
            if (!rows.length) return;
            const heights = rows.map((row) => estimateStaticRowHeightPx(row));
            applyRowHeights(table, rows, heights);
        });
        return root.innerHTML;
    } catch {
        return raw;
    }
}

export function isTableRowResizeActive(root) {
    return !!root?.querySelector?.('table[data-ems-row-resizing="1"]');
}

export function isTableStructureResizeActive(root) {
    return isTableColumnResizeActive(root) || isTableRowResizeActive(root);
}

function lockCellColumnWidth(cell, px) {
    if (!cell?.style) return;
    const w = `${px}px`;
    cell.style.setProperty('box-sizing', 'border-box', 'important');
    cell.style.setProperty('width', w, 'important');
    cell.style.setProperty('min-width', w, 'important');
    /*
     * Never lock max-width — a bad/collapsed px with max-width:!important cannot be
     * rescued by CSS and forces Qty/Unit/Amount to wrap one character per line.
     * Also clears leftover split-host pins so outer column drag can grow again.
     */
    cell.style.removeProperty('max-width');
}

/** Clear stale col/cell px locks so a rebuild cannot re-read collapsed 24px columns. */
function clearTableColumnWidthArtifacts(table) {
    if (!table) return;
    table.removeAttribute('data-ems-col-widths');
    table.removeAttribute('data-ems-col-widths-custom');
    table.querySelectorAll('colgroup col').forEach((col) => {
        col.style.removeProperty('width');
        col.style.removeProperty('min-width');
        col.style.removeProperty('max-width');
        col.removeAttribute('width');
    });
    table.querySelectorAll('td, th').forEach((cell) => {
        if (!cell?.style) return;
        cell.style.removeProperty('width');
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        cell.removeAttribute('width');
    });
    table.style.removeProperty('width');
    table.style.removeProperty('min-width');
    table.style.removeProperty('max-width');
}

/** Sensible A4 schedule widths when stored/colgroup model is collapsed (edit scramble). */
function bootstrapBoqLikeColumnWidthsPx(colCount, availableW) {
    const total = Math.max(320, Math.round(availableW || 680));
    const pct =
        colCount === 5
            ? [0.08, 0.5, 0.12, 0.1, 0.2]
            : colCount === 6
              ? [0.07, 0.42, 0.1, 0.1, 0.13, 0.18]
              : colCount === 4
                ? [0.1, 0.55, 0.15, 0.2]
                : null;
    if (pct) {
        const widths = pct.map((p) => Math.max(48, Math.round(total * p)));
        const drift = total - widths.reduce((s, w) => s + w, 0);
        widths[widths.length - 1] = Math.max(48, widths[widths.length - 1] + drift);
        return widths;
    }
    const even = Math.max(48, Math.round(total / Math.max(1, colCount)));
    return new Array(colCount).fill(even);
}

/** Max content width so a resized pricing table does not spill past the quote frame. */
function getPricingTableMaxContentWidthPx(table) {
    const parent = table?.parentElement;
    let parentW = Math.round(parent?.getBoundingClientRect?.().width || 0);
    if (parentW < 80) {
        parentW = Math.round(getA4InnerContentWidthPx(table?.ownerDocument) || 680);
    }
    return Math.max(MIN_TABLE_COLUMN_WIDTH * 2, parentW);
}

/**
 * BOQ / office tables must stay within the A4 content column — wider tables are cropped
 * by .quote-a4-sheet / .content-section overflow:hidden (looks like footer clipping).
 */
function getBoqTableMaxContentWidthPx(table) {
    const a4 = getA4InnerContentWidthPx(table?.ownerDocument) || 680;
    const host =
        table?.closest?.(
            '.content-section, .jodit-wysiwyg, .clause-content, .quote-sheet-main-flex'
        ) || table?.parentElement;
    const zoom = getQuotePreviewZoomFactor(table) || 1;
    const z = zoom > 0.05 ? zoom : 1;
    const hostW = Math.round(host?.getBoundingClientRect?.().width || 0);
    const fromHost = hostW > 160 ? Math.round(hostW / z) : 0;
    /* Prefer the tighter of A4 inner width and the live content host. */
    if (fromHost > 160) return Math.max(320, Math.min(a4, fromHost));
    return Math.max(320, a4);
}

/** Shrink columns proportionally so sum fits maxW (keeps last-3 schedule floors). */
function fitColumnWidthsToMaxPx(widths, maxW) {
    const colCount = widths?.length || 0;
    if (!colCount || !(maxW > 0)) return widths;
    let sum = 0;
    for (let j = 0; j < colCount; j += 1) {
        const floor = getColumnWidthFloor(colCount, j);
        widths[j] = Math.max(floor, Math.round(widths[j] || floor));
        sum += widths[j];
    }
    if (sum <= maxW) return widths;
    const floors = widths.map((_, j) => getColumnWidthFloor(colCount, j));
    const floorSum = floors.reduce((s, f) => s + f, 0);
    if (floorSum >= maxW) {
        for (let j = 0; j < colCount; j += 1) widths[j] = floors[j];
        return widths;
    }
    const flexible = sum - floorSum;
    const budget = maxW - floorSum;
    const scale = flexible > 0 ? budget / flexible : 0;
    let used = 0;
    for (let j = 0; j < colCount; j += 1) {
        const extra = Math.max(0, widths[j] - floors[j]);
        widths[j] =
            j === colCount - 1
                ? Math.max(floors[j], maxW - used)
                : Math.max(floors[j], floors[j] + Math.round(extra * scale));
        used += widths[j];
    }
    return widths;
}

/**
 * Word/BOQ schedules: never pin min-width=width — intrinsic content then fights the drag
 * and the column visually "resets" on mouseup. Pricing summary can keep hard locks.
 */
function tableUsesSoftColumnMinWidth(table, colCount) {
    if (!table) return false;
    if (isEmsPricingSummaryTable(table)) return false;
    return (
        colCount >= 4 ||
        isOfficePasteTableEl(table) ||
        !!table.querySelector?.(
            '.ems-cell-split-v, .ems-cell-split-h, [data-ems-split-host]'
        )
    );
}

/**
 * Fixed px per column (colgroup + every cell); table width = sum.
 * @param {{ flexibleMin?: boolean }} [opts] flexibleMin: soft min-width (floor only).
 *   BOQ/Word tables default to soft — hard min-width=width caused post-drag snap-back.
 */
function applyColumnWidths(table, rows, widths, opts = {}) {
    const colCount = widths.length;
    if (!colCount) return;
    const softMin =
        opts.flexibleMin != null
            ? !!opts.flexibleMin
            : tableUsesSoftColumnMinWidth(table, colCount);
    /*
     * Only fit-to-page when explicitly requested (end of column drag).
     * Fitting on every apply scrambled Word BOQ tables on enter-edit while the
     * editor host width was still settling.
     */
    if (
        opts.fitToPage &&
        !isEmsPricingSummaryTable(table) &&
        tableUsesSoftColumnMinWidth(table, colCount)
    ) {
        fitColumnWidthsToMaxPx(widths, getBoqTableMaxContentWidthPx(table));
    }

    applyTableLayoutDefaults(table);
    table.style.setProperty('table-layout', 'fixed', 'important');

    const { cols } = getOrSyncColgroup(table, colCount);
    const { grid } = buildTableCellGrid(table);
    let sum = 0;

    for (let j = 0; j < colCount; j += 1) {
        /* 5+ col schedules: Qty/Unit/Amount ≥48px. Narrower clause tables may go to MIN. */
        const floor = getColumnWidthFloor(colCount, j);
        const px = Math.max(floor, Math.round(widths[j] || 0));
        widths[j] = px;
        sum += px;
        if (cols[j]) {
            cols[j].style.setProperty('width', `${px}px`, 'important');
            cols[j].style.setProperty('min-width', `${softMin ? floor : px}px`, 'important');
            /* Never max-width on cols — that blocked dragging columns wider again. */
            cols[j].style.removeProperty('max-width');
            cols[j].setAttribute('width', String(px));
        }
        }

    /*
     * Lock span=1 cells only. Merged (colspan) Word cells must not keep a fixed width —
     * that freezes the whole merge and blocks column drag.
     * Never cell max-width on BOQ — it made shrink work but increase impossible.
     */
        const seen = new Set();
        for (let r = 0; r < grid.length; r += 1) {
        for (let j = 0; j < colCount; j += 1) {
            const cell = grid[r]?.[j];
            if (!cell || seen.has(cell)) continue;
            seen.add(cell);
            const pos = findCellGridPosition(grid, cell);
            if (!pos) continue;
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (pos.col !== j) continue;
            if (span !== 1) {
                cell.removeAttribute('width');
                cell.style.removeProperty('width');
                cell.style.removeProperty('min-width');
                cell.style.removeProperty('max-width');
                continue;
            }
            const floor = getColumnWidthFloor(colCount, j);
            const px = widths[j];
            cell.style.setProperty('box-sizing', 'border-box', 'important');
            cell.style.setProperty('width', `${px}px`, 'important');
            cell.style.setProperty('min-width', `${softMin ? floor : px}px`, 'important');
            cell.style.removeProperty('max-width');
            if (softMin) {
                cell.style.setProperty('overflow', 'hidden', 'important');
                cell.style.setProperty('white-space', 'normal', 'important');
            }
            cell.setAttribute('width', String(px));
        }
    }

    table.setAttribute('data-ems-col-widths', widths.join(','));
    table.setAttribute('data-ems-col-resize-build', '8');
    if (sum > 0) {
        const w = `${sum}px`;
        /* Explicit px table width — always ≤ A4 content so footer does not clip. */
            table.style.setProperty('width', w, 'important');
        table.style.setProperty('min-width', '0', 'important');
        if (isEmsPricingSummaryTable(table)) {
            table.setAttribute('data-ems-col-widths-custom', '1');
            table.style.setProperty('max-width', '100%', 'important');
        } else {
            table.style.setProperty('max-width', '100%', 'important');
        }
    }
}

export function isTableColumnResizeActive(root) {
    return !!root?.querySelector?.('table[data-ems-col-resizing="1"]');
}

function isTableStructureResizeActiveForTable(table) {
    return (
        table?.getAttribute('data-ems-col-resizing') === '1' ||
        table?.getAttribute('data-ems-row-resizing') === '1'
    );
}

export function normalizeTableColumnWidths(table) {
    if (!table) return;
    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getColumnCount(rows);
    if (!colCount) return;
    const widths = readColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
}

/** Match newly inserted empty rows/columns to the neighbor above/below or left/right. */
export function harmonizeInsertedTableCells(root) {
    if (!root?.querySelectorAll) return;
    if (isTableStructureResizeActive(root)) return;
    const joditHost =
        root.closest?.('.jodit-container')?.jodit ||
        root.__jodit ||
        null;
    if (joditHost?.__emsSkipTableHarmonize) return;

    root.querySelectorAll('table').forEach((table) => {
        if (isTableStructureResizeActiveForTable(table)) return;
        /* Nested in-cell vertical splits — never resize as a top-level BOQ/office table. */
        if (table.getAttribute('data-ems-cell-split') === 'v') return;
        if (table.getAttribute('data-ems-cell-split') === 'h') return;
        if (table.closest?.('.ems-cell-split-v, .ems-cell-split-h')) return;
        const rowsEarly = getTableRows(table);
        const userColCustom =
            table.getAttribute('data-ems-col-widths-custom') === '1' ||
            table.getAttribute('data-ems-edit-cols-locked') === '1';
        const storedCsv = String(table.getAttribute('data-ems-col-widths') || '')
            .split(',')
            .map((s) => parseFloat(String(s).trim()))
            .filter((n) => Number.isFinite(n) && n > 0);

        /*
         * User-resized / locked / flex-split BOQ — do not re-apply stored csv here.
         * Percent-like or stale stored models scrambled enter-edit; unscramble owns this.
         */
        if (
            userColCustom ||
            table.querySelector?.(
                '.ems-cell-split-v, .ems-cell-split-h, [data-ems-split-host]'
            )
        ) {
            applyTableRowHeightModel(table);
            applyDefaultManualTableBordersIfEmpty(table);
            return;
        }

        const preserveSplitWidths = table.getAttribute('data-ems-preserve-col-widths') === '1';
        if (preserveSplitWidths && rowsEarly.length) {
            table.removeAttribute('data-ems-preserve-col-widths');
            /* Vertical split already locked widths — do not office-remeasure / expand cols. */
            if (storedCsv.length) {
                clearTableCellWidthLocks(table);
                applyColumnWidths(table, rowsEarly, storedCsv);
            }
            applyTableRowHeightModel(table);
            applyDefaultManualTableBordersIfEmpty(table);
            return;
        }

        if (isOfficePasteTable(table)) {
            /*
             * Do not sync/bootstrap column widths here — that scrambled enter-edit.
             * Column layout is restored by unscrambleOfficeScheduleTableLikeColumnDrag
             * (same path as a 0px column drag).
             */
            applyTableRowHeightModel(table);
            return;
        }
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            restyleEmsPricingTableHeaderCells(table);
            return;
        }
        if (isTableStructureResizeActiveForTable(table)) return;

        const rows = getTableRows(table);
        if (!rows.length) return;

        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (!colCount) return;

        /*
         * Multi-col schedules in the editor — never rewrite widths on harmonize.
         * Enter-edit unscramble (strip → measure → apply) owns the column model.
         */
        if (colCount >= 4 && table.closest?.('.jodit-wysiwyg')) {
            applyTableRowHeightModel(table);
            applyDefaultManualTableBordersIfEmpty(table);
            return;
        }

        let widths = readColumnWidthsPx(table, rows, colCount);

        applyTableLayoutDefaults(table);

        const { grid } = buildTableCellGrid(table);

        // New empty column from Insert Column: match neighbor width.
        // Never duplicate full neighbor width after a vertical split (that scrambles BOQ grids).
        for (let j = 0; j < colCount; j += 1) {
            if (!isLogicalColumnAllEmpty(grid, j)) continue;
            const refJ = j > 0 ? j - 1 : j + 1;
            if (refJ >= 0 && refJ < colCount && widths[refJ] > 0) {
                if (widths[j] !== widths[refJ]) {
                    widths[j] = widths[refJ];
                }
            }
        }

        // Only lock px widths after user resize / prior export — keep manual tables fluid (width:100% in preview).
        if (table.getAttribute('data-ems-col-widths')) {
            applyColumnWidths(table, rows, widths);
        }

        applyTableRowHeightModel(table);

        applyDefaultManualTableBordersIfEmpty(table);
    });
}

function getTableCellFromNode(node) {
    let el = node;
    if (el?.nodeType === 3) el = el.parentElement;
    return el?.closest?.('td, th') || null;
}

/** Logical row/col grid (handles colspan/rowspan). grid[row][col] -> cell element. */
function buildTableCellGrid(table) {
    const rows = [...table.querySelectorAll('tr')];
    /** @type {Array<Array<Element|null>>} */
    const grid = [];

    rows.forEach((tr, rowIndex) => {
        if (!grid[rowIndex]) grid[rowIndex] = [];
        let col = 0;
        [...tr.cells].forEach((cell) => {
            while (grid[rowIndex][col]) col += 1;
            const colSpan = Math.max(1, Number(cell.colSpan) || 1);
            const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
            for (let r = 0; r < rowSpan; r += 1) {
                const ri = rowIndex + r;
                if (!grid[ri]) grid[ri] = [];
                for (let c = 0; c < colSpan; c += 1) {
                    grid[ri][col + c] = cell;
                }
            }
            col += colSpan;
        });
    });

    return { rows, grid };
}

function findCellGridPosition(grid, cell) {
    for (let r = 0; r < grid.length; r += 1) {
        const row = grid[r] || [];
        for (let c = 0; c < row.length; c += 1) {
            if (row[c] === cell) return { row: r, col: c };
        }
    }
    return null;
}

function createPaginationPadCell(doc, tagName = 'td') {
    const cell = doc.createElement(tagName);
    cell.innerHTML = '<p>\u00a0</p>';
    cell.setAttribute('data-ems-pagination-pad', '1');
    return cell;
}

function clonePaddedTableCell(cell) {
    const doc = cell.ownerDocument || document;
    const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const next = doc.createElement(tag);
    next.innerHTML = cell.innerHTML;
    if (cell.getAttribute('style')) next.setAttribute('style', cell.getAttribute('style'));
    ['data-ems-valign', 'data-ems-cell-fill', 'data-ems-cell-border', 'data-ems-cell-color', 'class'].forEach(
        (attr) => {
            if (cell.hasAttribute(attr)) next.setAttribute(attr, cell.getAttribute(attr));
        }
    );
    if (cell.hasAttribute('colspan')) next.setAttribute('colspan', cell.getAttribute('colspan'));
    if (cell.hasAttribute('rowspan')) next.setAttribute('rowspan', cell.getAttribute('rowspan'));
    return next;
}

function inferLeadingPadCellsForShortRow(tr, colCount) {
    const physical = tr?.cells?.length || 0;
    if (physical <= 0 || physical >= colCount) return 0;

    const first = String(tr.cells[0]?.textContent || '')
        .replace(/\u00a0/g, ' ')
        .trim();
    if (/^\d+$/.test(first)) return 0;

    // Excel omits leading blank cells on accessory/continuation lines (typically SL + LOCATION).
    return Math.max(0, colCount - physical);
}

function rowHasMergedSpans(tr) {
    return [...(tr?.cells || [])].some((cell) => {
        const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
        const colSpan = Math.max(1, Number(cell.colSpan) || 1);
        return rowSpan > 1 || colSpan > 1;
    });
}

function getRowFirstOwnedLogicalColumn(rowIndex, grid, tr) {
    const rowGrid = grid[rowIndex] || [];
    for (let c = 0; c < rowGrid.length; c += 1) {
        const cell = rowGrid[c];
        if (!cell || !tr.contains(cell)) continue;
        const pos = findCellGridPosition(grid, cell);
        if (pos && pos.row === rowIndex) return pos.col;
    }
    return 0;
}

function isRowspanContinuationRow(rowIndex, grid) {
    const rowGrid = grid[rowIndex] || [];
    for (let c = 0; c < rowGrid.length; c += 1) {
        const cell = rowGrid[c];
        if (!cell) continue;
        const pos = findCellGridPosition(grid, cell);
        if (pos && pos.row < rowIndex) return true;
    }
    return false;
}

function getIsolatedRowLeadingPad(tr, rowIndex, grid, colCount) {
    if (rowHasMergedSpans(tr)) return 0;
    const physical = tr?.cells?.length || 0;
    if (physical <= 0 || physical >= colCount) return 0;

    const ownedStart = getRowFirstOwnedLogicalColumn(rowIndex, grid, tr);
    if (ownedStart > 0) return ownedStart;

    return inferLeadingPadCellsForShortRow(tr, colCount);
}

/** Pad a single-row pagination fragment when Excel omitted leading blank cells. */
export function padIsolatedOfficePasteTableRow(tr, rowIndex, grid, colCount) {
    if (!tr || !grid || colCount <= 0) return tr;
    if (rowHasMergedSpans(tr)) return tr;

    const doc = tr.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return tr;

    const physicalCells = [...tr.cells];
    if (physicalCells.length >= colCount) return tr;

    const leadingPad = getIsolatedRowLeadingPad(tr, rowIndex, grid, colCount);
    if (leadingPad <= 0 && physicalCells.length >= colCount) return tr;

    const newTr = /** @type {HTMLTableRowElement} */ (doc.createElement('tr'));
    if (tr.getAttribute('style')) newTr.setAttribute('style', tr.getAttribute('style'));
    [...tr.attributes].forEach((attr) => {
        if (attr.name === 'style') return;
        newTr.setAttribute(attr.name, attr.value);
    });

    for (let c = 0; c < colCount; c += 1) {
        if (c < leadingPad) {
            newTr.appendChild(createPaginationPadCell(doc));
            continue;
        }
        const physicalIdx = c - leadingPad;
        if (physicalIdx < physicalCells.length) {
            newTr.appendChild(clonePaddedTableCell(physicalCells[physicalIdx]));
        } else {
            newTr.appendChild(createPaginationPadCell(doc));
        }
    }

    return newTr;
}

/** Grid + column count snapshot before pagination splits (do not mutate table first). */
export function getOfficePasteTablePaginationGrid(table) {
    const { rows, grid } = buildTableCellGrid(table);
    const storedCount = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0).length;
    const colCount = Math.max(
        storedCount,
        getLogicalColumnCount(rows),
        getColumnCount(rows)
    );
    return { rows, grid, colCount };
}

export function officePasteTableRowHasMergedSpans(tr) {
    return rowHasMergedSpans(tr);
}

export function officePasteTableRowIsSpanContinuation(rowIndex, grid) {
    return isRowspanContinuationRow(rowIndex, grid);
}

/**
 * @deprecated Use padIsolatedOfficePasteTableRow at pagination split time only.
 * Full-table padding breaks rowspan continuation rows (shifts accessory lines right).
 */
export function materializeOfficePasteTableRowsForPagination(table) {
    if (!table || !isOfficePasteTableEl(table)) return;

    const doc = table.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    const { rows, grid } = buildTableCellGrid(table);
    if (!rows.length) return;

    const storedCount = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0).length;
    const colCount = Math.max(
        storedCount,
        getLogicalColumnCount(rows),
        getColumnCount(rows)
    );
    if (colCount <= 0) return;

    const theadRows = new Set([...table.querySelectorAll('thead tr')]);

    rows.forEach((tr, rowIndex) => {
        if (theadRows.has(tr)) return;
        if (rowHasMergedSpans(tr)) return;
        if (isRowspanContinuationRow(rowIndex, grid)) return;

        const physicalCells = [...tr.cells];
        if (physicalCells.length >= colCount) return;

        const leadingPad = inferLeadingPadCellsForShortRow(tr, colCount);
        if (leadingPad <= 0) return;

        const newTr = /** @type {HTMLTableRowElement} */ (doc.createElement('tr'));
        if (tr.getAttribute('style')) newTr.setAttribute('style', tr.getAttribute('style'));
        [...tr.attributes].forEach((attr) => {
            if (attr.name === 'style') return;
            newTr.setAttribute(attr.name, attr.value);
        });

        for (let c = 0; c < colCount; c += 1) {
            if (c < leadingPad) {
                newTr.appendChild(createPaginationPadCell(doc));
                continue;
            }
            const physicalIdx = c - leadingPad;
            if (physicalIdx < physicalCells.length) {
                newTr.appendChild(clonePaddedTableCell(physicalCells[physicalIdx]));
            } else {
                newTr.appendChild(createPaginationPadCell(doc));
            }
        }

        tr.replaceWith(newTr);
    });
}

/**
 * Find a span=1 cell whose right edge is logical column `colIndex`.
 * Never use physical row.cells[i] — Word/Excel merges make that index wrong.
 */
function findCellAtColumnRightEdge(table, colIndex) {
    const { grid } = buildTableCellGrid(table);
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[colIndex];
        if (!cell) continue;
        const pos = findCellGridPosition(grid, cell);
        if (!pos) continue;
        const span = Math.max(1, Number(cell.colSpan) || 1);
        /* Prefer unmerged cells — their right edge IS the column boundary. */
        if (span === 1 && pos.col === colIndex) return cell;
    }
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[colIndex];
        if (!cell) continue;
        const pos = findCellGridPosition(grid, cell);
        if (!pos) continue;
        const span = Math.max(1, Number(cell.colSpan) || 1);
        if (pos.col + span - 1 === colIndex) return cell;
    }
    return null;
}

/**
 * Viewport X for the right edge of logical column `colIndex`.
 * Prefer live cells; always fall back to measured/col widths so hit-test never goes dead.
 */
function getColumnRightEdgeX(table, colIndex) {
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount || colIndex < 0 || colIndex >= colCount) return null;

    const edgeCell = findCellAtColumnRightEdge(table, colIndex);
    if (edgeCell) {
        const right = edgeCell.getBoundingClientRect().right;
        if (Number.isFinite(right) && right > 0) return right;
    }

    /* Next column's left edge = this column's right (when only the next cell is span=1). */
    if (colIndex + 1 < colCount) {
        const { grid } = buildTableCellGrid(table);
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[colIndex + 1];
            if (!cell) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos || pos.col !== colIndex + 1) continue;
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (span !== 1) continue;
            const left = cell.getBoundingClientRect().left;
            if (Number.isFinite(left) && left > 0) return left;
        }
    }

    /* Live logical widths are already viewport px from getBoundingClientRect. */
    const measured = measureLogicalColumnWidthsLivePx(table);
    const live = measured.widths || [];
    if (live.length && live.some((w) => w > 0)) {
        const tableLeft = table.getBoundingClientRect().left;
            let offset = 0;
        for (let j = 0; j <= colIndex && j < live.length; j += 1) {
            offset += Math.max(1, live[j] || 0);
        }
        return tableLeft + offset;
    }

    /* Last resort: stored/colgroup content px × preview zoom. */
    return getColumnEdgeXFromWidths(
        table,
        readColumnWidthsPx(table, rows, colCount),
        colIndex,
        getQuotePreviewZoomFactor(table) || 1
    );
}

/** Cumulative content-px widths → viewport X (for smooth handle tracking while dragging). */
function getColumnEdgeXFromWidths(table, widths, colIndex, zoom = 1) {
    if (!table || !widths?.length || colIndex < 0) return null;
    const tableLeft = table.getBoundingClientRect().left;
    const z = zoom > 0.05 ? zoom : 1;
    let offset = 0;
    for (let j = 0; j <= colIndex && j < widths.length; j += 1) {
        offset += Math.max(MIN_TABLE_COLUMN_WIDTH, widths[j] || 0) * z;
    }
    return tableLeft + offset;
}

/**
 * Strip Word/Excel width attributes that fight colgroup resize after merges.
 * Keeps colspan/rowspan; only clears width locks.
 */
function stripOfficeMergeWidthArtifacts(table) {
    if (!table?.querySelectorAll) return;
    table.querySelectorAll('td, th').forEach((cell) => {
        if (!cell) return;
        cell.removeAttribute('width');
        if (!cell.style) return;
        cell.style.removeProperty('width');
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        /* Word often leaves width in the style attribute as 197.65pt */
        const css = String(cell.getAttribute('style') || '');
        if (/width\s*:/i.test(css)) {
            cell.style.cssText = css
                .replace(/(?:^|;)\s*width\s*:\s*[^;]+;?/gi, ';')
                .replace(/(?:^|;)\s*min-width\s*:\s*[^;]+;?/gi, ';')
                .replace(/(?:^|;)\s*max-width\s*:\s*[^;]+;?/gi, ';');
        }
    });
}

function isOfficePasteTable(table) {
    return isOfficePasteTableEl(table);
}

function focusTableCell(cell, jodit, atEnd = false) {
    if (!cell) return false;
    const doc = cell.ownerDocument;
    const root = cell.closest('.jodit-wysiwyg') || jodit?.editor || null;
    const existing = getEditorSelectionRange(jodit, root);
    if (
        !atEnd &&
        existing?.collapsed &&
        cell.contains(existing.startContainer)
    ) {
        setActiveTableCell(jodit, cell);
        return true;
    }
    const range = doc.createRange();

    const placeInElement = (el, collapseEnd) => {
        if (!el) return false;
        const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let firstText = null;
        let lastText = null;
        let n;
        while ((n = walker.nextNode())) {
            if (!firstText) firstText = n;
            lastText = n;
        }
        if (collapseEnd && lastText) {
            range.setStart(lastText, lastText.length);
            range.collapse(true);
            return true;
        }
        if (!collapseEnd && firstText) {
            range.setStart(firstText, 0);
            range.collapse(true);
            return true;
        }
        if (el.tagName === 'P' || el.tagName === 'DIV') {
            if (!el.firstChild) {
                el.innerHTML = '<br>';
            }
            range.setStart(el, 0);
            range.collapse(true);
            return true;
        }
        return false;
    };

    if (!placeInElement(cell.querySelector('p, div') || cell, atEnd)) {
        range.selectNodeContents(cell);
        range.collapse(!atEnd);
    }

    try {
        if (jodit?.s?.selectRange) {
            jodit.s.selectRange(range);
            return true;
        }
    } catch {
        /* fall through */
    }
    const sel = doc.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
}

function getEditorSelectionRange(jodit, root) {
    try {
        if (jodit?.s?.range) return jodit.s.range;
    } catch {
        /* ignore */
    }
    const sel = root?.ownerDocument?.getSelection?.();
    if (sel?.rangeCount > 0) return sel.getRangeAt(0);
    return null;
}

/** True when a collapsed caret is flush with the start or end of cell text (allows in-cell ←/→). */
function isCollapsedRangeAtCellEdge(cell, range, edge) {
    if (!cell || !range || !range.collapsed) return false;
    if (!cell.contains(range.startContainer)) return false;
    const doc = cell.ownerDocument;
    const probe = doc.createRange();
    try {
        if (edge === 'start') {
            probe.selectNodeContents(cell);
            probe.setEnd(range.startContainer, range.startOffset);
            return probe.toString().length === 0;
        }
        if (edge === 'end') {
            probe.selectNodeContents(cell);
            probe.setStart(range.startContainer, range.startOffset);
            return probe.toString().length === 0;
        }
    } catch {
        return false;
    }
    return false;
}

function shouldNavigateTableCellHorizontally(cell, range, key) {
    if (key === 'ArrowLeft') return isCollapsedRangeAtCellEdge(cell, range, 'start');
    if (key === 'ArrowRight') return isCollapsedRangeAtCellEdge(cell, range, 'end');
    return true;
}

function moveTableCellFocus(root, cell, key, jodit, getEditorBody) {
    const table = cell.closest('table');
    if (!table) return false;

    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, cell);
    if (!pos) return false;

    let nextRow = pos.row;
    let nextCol = pos.col;
    if (key === 'ArrowUp') nextRow -= 1;
    else if (key === 'ArrowDown') nextRow += 1;
    else if (key === 'ArrowLeft') nextCol -= 1;
    else if (key === 'ArrowRight') nextCol += 1;
    else return false;

    const targetCell = grid[nextRow]?.[nextCol];
    if (!targetCell || !root.contains(targetCell)) return false;

    const atEnd = key === 'ArrowRight' || key === 'ArrowDown';
    const moved = focusTableCell(targetCell, jodit, atEnd);
    if (moved) {
        setActiveTableCell(jodit, targetCell);
        syncTableSelectionVisual(jodit, getEditorBody);
    }
    return moved;
}

function bindTableArrowNavigation(root, jodit, getEditorBody) {
    if (!root || root.__emsTableArrowBound) return;
    root.__emsTableArrowBound = true;

    const onKeyDown = (e) => {
        const key = e.key;
        if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
            return;
        }

        const range = getEditorSelectionRange(jodit, root);
        if (range && !range.collapsed) return;

        let node = range?.startContainer;
        if (!node) {
            node = root.ownerDocument?.getSelection?.()?.anchorNode;
        }
        const cell = getTableCellFromNode(node);
        if (!cell || !root.contains(cell)) return;

        if (
            (key === 'ArrowLeft' || key === 'ArrowRight')
            && !shouldNavigateTableCellHorizontally(cell, range, key)
        ) {
            return;
        }

        if (!moveTableCellFocus(root, cell, key, jodit, getEditorBody)) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof jodit.synchronizeValues === 'function') {
            jodit.synchronizeValues();
        }
    };

    root.addEventListener('keydown', onKeyDown, true);
}

/** Ctrl+A inside a table selects every cell in that table (Word-like). */
function registerTableSelectAll(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableSelectAll) return;
    jodit.__emsTableSelectAll = true;

    const onKeyDown = (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key !== 'a' && e.key !== 'A') return;

        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;

        const cell = getActiveTableCell(jodit, getEditorBody);
        if (!cell || !root.contains(cell)) return;

        const table = cell.closest('table');
        if (!table || !root.contains(table)) return;

        const tableModule = getJoditTableModule(jodit);
        if (!tableModule) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        clearAllTableCellSelection(jodit);
        table.querySelectorAll('td, th').forEach((td) => {
            if (td.isConnected) tableModule.addSelection(td);
        });
        table.setAttribute('data-ems-cell-selecting', '1');
        jodit.__emsFormatTableCells = [...table.querySelectorAll('td, th')];
        jodit.__emsToolbarCellFormat = true;
        clearEditorTextSelection(jodit);

        if (typeof jodit.synchronizeValues === 'function') {
            jodit.synchronizeValues();
        }
        jodit.e?.fire?.('updateToolbar');
    };

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableSelectAllBound) return;
        root.__emsTableSelectAllBound = true;
        root.addEventListener('keydown', onKeyDown, true);
        jodit.e.on('beforeDestruct', () => {
            root.removeEventListener('keydown', onKeyDown, true);
        });
    };

    jodit.e.on('afterInit', attach);
    attach();
}

const tablePopupListCommand = (control) => {
    const args = control?.args;
    return args && typeof args[0] === 'string' ? args[0].toLowerCase() : '';
};

const EMS_TABLE_DELETE_ROW_COL_CONTROL = {
    name: 'emsTableDeleteRowCol',
    icon: 'bin',
    text: 'Delete row/column',
    list: {
        tablebinrow: 'Delete row',
        tablebincolumn: 'Delete column',
    },
    exec: (editor, table, { control }) => {
        const command = tablePopupListCommand(control);
        if (!command) return false;
        editor.execCommand(command, false, table);
        editor.e?.fire?.('hidePopup');
        return false;
    },
    tooltip: 'Delete row or column',
};

/** Right-click table menu items — plain text list (not Jodit icon toolbar). */
const EMS_TABLE_CELLS_MENU_ITEMS = [
    { label: 'Copy', command: 'emsCopySelection' },
    { type: 'separator' },
    { label: 'Insert row above', command: 'tableaddrowbefore' },
    { label: 'Insert row below', command: 'tableaddrowafter' },
    { label: 'Insert column before', command: 'tableaddcolumnbefore' },
    { label: 'Insert column after', command: 'tableaddcolumnafter' },
    { type: 'separator' },
    { label: 'Delete row', command: 'tablebinrow' },
    { label: 'Delete column', command: 'tablebincolumn' },
    { label: 'Delete table', command: 'tablebin' },
    { type: 'separator' },
    { label: 'Merge cells', command: 'tablemerge' },
    { type: 'separator' },
    { label: 'Split vertically', command: 'tablesplitv' },
    { label: 'Split horizontally', command: 'tablesplitg' },
];

function getInlinePopupPlugin(jodit) {
    return jodit?.__plugins?.['inline-popup'] || null;
}

function resetInlineCellsPopupState(jodit) {
    const plugin = getInlinePopupPlugin(jodit);
    if (!plugin) return;
    try {
        if (plugin.popup?.isOpened) {
            plugin.hidePopup?.('cells');
        }
        const content = plugin.popup?.getElm?.('content');
        if (content) {
            content.textContent = '';
        }
        if (plugin.popup?.allChildren?.length) {
            plugin.popup.clear?.();
        }
    } catch (_err) {
        /* ignore */
    }
    plugin.type = null;
    plugin.previousTarget = undefined;
}

function dedupeTableCellsContextPopups() {
    const menus = Array.from(document.querySelectorAll('.ems-table-cells-context-menu'));
    if (menus.length <= 1) return;
    menus.slice(0, -1).forEach((menu) => {
        menu.closest('.jodit-popup')?.remove();
    });
}

function openTableCellsContextMenu(jodit, table, getPosition) {
    if (!jodit || !table) return;

    try {
        resetInlineCellsPopupState(jodit);
    } catch (_err) {
        /* never block menu open */
    }

    /*
     * Rebind menu builder on every open so a long-lived editor / HMR cannot keep a
     * stale Split handler that ignored multi-cell snapshots.
     */
    jodit.o.popup = jodit.o.popup || {};
    jodit.o.popup.cells = (editor, t, close) => {
        const content = getInlinePopupPlugin(editor)?.popup?.getElm?.('content');
        if (content) content.textContent = '';
        return buildTableCellsContextMenu(editor, t, close);
    };

    jodit.__emsAllowTableCellPopup = true;
    jodit.e.fire('showPopup', table, getPosition, 'cells');
}

/**
 * Snapshot cells for Split at menu-open time (not menu-click time).
 * Right-click / menu focus often collapses Jodit selection to 1 cell before execCommand.
 */
function snapshotCellsForTableMenu(jodit, table, anchorCell) {
    const tableModule = getJoditTableModule(jodit);
    const anchor =
        (anchorCell?.isConnected && anchorCell) ||
        jodit?.__emsTableCtxSplit?.cell ||
        null;

    /* Drag-range hint wins — survives selection collapsing to 1 cell on right-click. */
    const fromHint = resolveCellsFromSplitColumnHint(jodit, table, anchor);
    if (fromHint?.length > 1) return fromHint;

    const buckets = [
        jodit?.__emsSplitTableCells,
        jodit?.__emsFormatTableCells,
        jodit?.__emsLastMultiCellBlock,
        getSelectedTableCells(jodit),
        table ? [...table.querySelectorAll(`.${EMS_TABLE_CELL_SELECTED_CLASS}`)] : [],
    ];
    const all = [];
    const seen = new Set();
    buckets.forEach((list) => {
        (list || []).forEach((c) => {
            if (!c?.isConnected || seen.has(c)) return;
            if (table && c.closest?.('table') !== table) return;
            seen.add(c);
            all.push(c);
        });
    });
    const useAnchor = anchor || all[0] || null;
    if (!useAnchor) return [];
    if (all.length <= 1) return [useAnchor];

    if (tableModule && table) {
        const sameCol = filterCellsSameFormalColumn(tableModule, table, all, useAnchor);
        if (sameCol.length > 1) return sameCol;
    }

    const ar = useAnchor.getBoundingClientRect();
    const midX = (ar.left + ar.right) / 2;
    const geo = all.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && midX >= r.left - 4 && midX <= r.right + 4;
    });
    if (geo.length > 1) return geo;
    return all.includes(useAnchor) ? all : [useAnchor, ...all];
}

/** Run vertical split from the context menu using the frozen snapshot. */
function runSplitVerticalFromContextMenu(jodit, table, snapCells) {
    const tableModule = getJoditTableModule(jodit);
    if (!jodit || !table || !tableModule) return false;
    const hint = jodit.__emsTableCtxSplit;
    const anchor =
        (hint?.cell?.isConnected && hint.cell.closest?.('table') === table
            ? hint.cell
            : null) ||
        snapCells?.[0] ||
        null;
    if (!anchor) return false;

    let cells = (snapCells?.length ? snapCells : [anchor]).filter(
        (c) => c?.isConnected && c.closest?.('table') === table
    );
    const fromHint = resolveCellsFromSplitColumnHint(jodit, table, anchor);
    if (fromHint && fromHint.length > cells.length) {
        cells = fromHint;
    }
    if (cells.length < 2) {
        const again = snapshotCellsForTableMenu(jodit, table, anchor);
        if (again.length > cells.length) cells = again;
    }

    jodit.__emsSkipTableSelSync = true;
    jodit.__emsPreserveMultiTableSelect = true;
    jodit.__emsTableStructureJustRan = true;

    const ok = emsSplitSelectedCellsVertical(
        jodit,
        tableModule,
        table,
        cells.length ? cells : [anchor],
        false
    );

    jodit.__emsTableCtxSplit = null;
    jodit.__emsSplitTableCells = null;
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    const root = jodit.editor || null;
    if (root) {
        requestAnimationFrame(() => {
            /* In-place flex split — never rewrite outer BOQ column widths. */
            jodit.__emsTableStructureJustRan = false;
            jodit.__emsSkipTableSelSync = false;
            jodit.__emsPreserveMultiTableSelect = false;
            syncTableSelectionVisual(jodit, () => jodit.editor);
            snapshotTableEditorHistory(jodit);
        });
    } else {
        jodit.__emsTableStructureJustRan = false;
        jodit.__emsSkipTableSelSync = false;
        jodit.__emsPreserveMultiTableSelect = false;
    }
    return ok;
}

function buildTableCellsContextMenu(editor, table, close) {
    const doc = editor?.editor?.ownerDocument || editor?.od?.ownerDocument || document;
    const root = doc.createElement('div');
    root.className = 'ems-table-cells-context-menu';
    root.setAttribute('role', 'menu');

    /* Freeze selection NOW — click handler must not re-read a collapsed selection. */
    const snapCells = snapshotCellsForTableMenu(
        editor,
        table,
        editor.__emsTableCtxSplit?.cell
    );
    editor.__emsMenuSnapSplitCells = snapCells;
    if (snapCells.length > 1) {
        storeSplitColumnHint(editor, table, snapCells);
    }

    EMS_TABLE_CELLS_MENU_ITEMS.forEach((item) => {
        if (item.type === 'separator') {
            const sep = doc.createElement('div');
            sep.className = 'ems-table-cells-context-menu__sep';
            sep.setAttribute('role', 'separator');
            root.appendChild(sep);
            return;
        }
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ems-table-cells-context-menu__item';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cmd = String(item.command || '');
            if (cmd === 'tablesplitv') {
                const cells =
                    editor.__emsMenuSnapSplitCells?.length
                        ? editor.__emsMenuSnapSplitCells
                        : snapshotCellsForTableMenu(
                              editor,
                              table,
                              editor.__emsTableCtxSplit?.cell
                          );
                runSplitVerticalFromContextMenu(editor, table, cells);
            } else {
                editor.execCommand(cmd, false, table);
            }
            editor.e?.fire?.('hidePopup', 'cells');
            if (typeof close === 'function') close();
        });
        root.appendChild(btn);
    });

    return root;
}

function configureTableCellsContextMenu(jodit) {
    if (!jodit) return;

    if (!jodit.o.controls.emsTableDeleteRowCol) {
        jodit.o.controls.emsTableDeleteRowCol = EMS_TABLE_DELETE_ROW_COL_CONTROL;
    }

    jodit.o.popup = jodit.o.popup || {};
    /* Always rebind — HMR left a stale menu builder that ignored multi-cell snapshots. */
    jodit.o.popup.cells = (editor, table, close) => {
        const content = getInlinePopupPlugin(editor)?.popup?.getElm?.('content');
        if (content) content.textContent = '';
        return buildTableCellsContextMenu(editor, table, close);
    };

    if (jodit.__emsCellsContextMenu) return;
    jodit.__emsCellsContextMenu = true;

    jodit.e.on('afterOpenPopup.emsCellsMenu', (popup) => {
        const host = popup?.container || popup?.getElm?.('content')?.parentElement;
        if (host?.querySelector?.('.ems-table-cells-context-menu')) {
            host.classList.add('ems-table-cells-context-popup');
            dedupeTableCellsContextPopups();
        }
    });
    jodit.e.on('beforeClose.emsCellsMenu', (popup) => {
        const host = popup?.container || popup?.getElm?.('content')?.parentElement;
        host?.classList?.remove?.('ems-table-cells-context-popup');
        /* Menu closed without a structure command — drop preserve so caret sync resumes. */
        if (!jodit.__emsTableStructureJustRan) {
            jodit.__emsPreserveMultiTableSelect = false;
        }
    });
}

/** Table cell toolbar (fill, borders, merge, delete) — right-click only, not on normal click. */
function registerTablePopupContextMenuOnly(jodit, getEditorBody) {
    if (!jodit) return;

    if (!jodit.__emsTablePopupCtxOnly) {
        jodit.__emsTablePopupCtxOnly = true;
    jodit.e.on('showPopup.tableCtxOnly', (table, getPosition, type) => {
        if (type !== 'cells') return;
        if (!jodit.__emsAllowTableCellPopup) {
            jodit.e.fire('hidePopup', 'cells');
        } else {
            jodit.__emsAllowTableCellPopup = false;
        }
    });
    }

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;

        /* Always re-bind contextmenu so Split uses the latest multi-cell snapshot path. */
        if (root.__emsTableCtxMenuHandler) {
            root.removeEventListener('contextmenu', root.__emsTableCtxMenuHandler, true);
            root.removeEventListener('mousedown', root.__emsTableCtxMenuMouseDown, true);
        }

        const onMouseDown = (e) => {
            if (e.button === 2) {
                /* Keep multi-cell block when opening the context menu. */
                const multi = getSelectedTableCells(jodit);
                const stagedMulti = (jodit.__emsFormatTableCells || []).filter(
                    (c) => c?.isConnected
                );
                if (multi.length > 1 || stagedMulti.length > 1) {
                    jodit.__emsPreserveMultiTableSelect = true;
                    jodit.__emsSkipTableSelSync = true;
                    const block = stagedMulti.length > multi.length ? stagedMulti : multi;
                    if (block.length > 1) {
                        jodit.__emsFormatTableCells = block;
                        jodit.__emsSplitTableCells = block;
                    }
                    e.stopImmediatePropagation();
                }
                return;
            }
            jodit.__emsAllowTableCellPopup = false;
            jodit.e.fire('hidePopup', 'cells');
        };

        const onContextMenu = (e) => {
            const cell = getTableCellFromNode(e.target);
            if (!cell || !root.contains(cell)) return;

            const table = cell.closest('table');
            if (!table) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const selected = resolveTableStructureWorkCells(jodit, getEditorBody, table);
            const classInTable = [
                ...table.querySelectorAll(`.${EMS_TABLE_CELL_SELECTED_CLASS}`),
            ];
            const staged = (jodit.__emsFormatTableCells || []).filter(
                (c) => c?.isConnected && c.closest?.('table') === table
            );
            /* Richest multi-cell block — never collapse to the right-click cell alone. */
            let block = selected;
            if (classInTable.length > block.length) block = classInTable;
            if (staged.length > block.length) block = staged;
            const multiKeep =
                block.length > 1 &&
                (block.includes(cell) ||
                    selectionContainsCell(jodit, cell) ||
                    filterCellsSameFormalColumn(
                        getJoditTableModule(jodit),
                        table,
                        block,
                        cell
                    ).length > 1);

            jodit.__emsSkipTableSelSync = true;
            jodit.__emsPreserveMultiTableSelect = true;

            /* Remember click point so Split can cut at that place in the cell. */
            jodit.__emsTableCtxSplit = {
                cell,
                table,
                clientX: e.clientX,
                clientY: e.clientY,
            };

            let stagedBlock = [cell];
            if (!multiKeep) {
                setActiveTableCell(jodit, cell);
                focusTableCell(cell, jodit, false);
                jodit.__emsFormatTableCells = [cell];
                jodit.__emsSplitTableCells = [cell];
            } else {
                /* Stage the block — menu click often clears Jodit selection before split runs. */
                const sameCol = filterCellsSameFormalColumn(
                    getJoditTableModule(jodit),
                    table,
                    block,
                    cell
                );
                stagedBlock = sameCol.length > 1 ? sameCol : block;
                jodit.__emsActiveTableCell = stagedBlock[0];
                storeSplitColumnHint(jodit, table, stagedBlock);
                restoreTableCellSelection(jodit, stagedBlock);
                syncEmsTableCellSelectionClasses(jodit);
            }

            openTableCellsContextMenu(jodit, table, () =>
                multiKeep
                    ? getSelectedCellsBounds(stagedBlock)
                    : (() => {
                          const r = cell.getBoundingClientRect();
                          return {
                              left: r.left,
                              top: r.top,
                              width: r.width,
                              height: r.height,
                          };
                      })()
            );

            /* Keep multi-select staged while the menu is open (do not clear on next tick). */
            window.setTimeout(() => {
                jodit.__emsSkipTableSelSync = false;
            }, 0);
        };

        root.__emsTableCtxMenuHandler = onContextMenu;
        root.__emsTableCtxMenuMouseDown = onMouseDown;
        root.__emsTableCtxMenuJodit = jodit;

        root.addEventListener('mousedown', onMouseDown, true);
        root.addEventListener('contextmenu', onContextMenu, true);

        jodit.e.on('beforeDestruct.emsTableCtxMenu', () => {
            root.removeEventListener('contextmenu', onContextMenu, true);
            root.removeEventListener('mousedown', onMouseDown, true);
            if (root.__emsTableCtxMenuJodit === jodit) {
                delete root.__emsTableCtxMenuHandler;
                delete root.__emsTableCtxMenuMouseDown;
                delete root.__emsTableCtxMenuJodit;
            }
        });
    };

    jodit.e.on('afterInit', attach);
    attach();
}

function registerTableArrowNavigation(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableArrowNav) return;
    jodit.__emsTableArrowNav = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        bindTableArrowNavigation(root, jodit, getEditorBody);
    };

    jodit.e.on('afterInit', attach);
    attach();
}

/** Add-line floaters only — keep Jodit image resizer handles. */
const FLOATING_CHROME_SELECTOR = '.jodit-add-new-line';

const TABLE_EDGE_NEAR = 8;
/** Hit zone at cell left/right edge for column resize (px, viewport). */
/* Keep moderate — too tight (5) made borders hard to grab; too wide steals text select. */
const TABLE_COL_EDGE_NEAR = 8;
const TABLE_SPLIT_PANE_EDGE_NEAR = 10;
/** Pixels from row bottom before the resize handle appears (keep tight for caret placement). */
const TABLE_ROW_EDGE_NEAR = 3;
/** Invisible grab area for the row resize handle (visual line stays thin). */
const TABLE_ROW_RESIZER_HIT_HEIGHT = 14;

/**
 * True when a Jodit instance is safe to touch. Destroyed / mid-destruct instances
 * throw on getters like defaultTimeout / ed (reading '.document' on undefined).
 */
function isJoditInstanceUsable(jodit) {
    if (!jodit) return false;
    try {
        if (jodit.isDestructed === true || jodit.isInDestruct === true) return false;
        const container = jodit.container;
        if (container && container.isConnected === false) return false;
        return true;
    } catch {
        return false;
    }
}

/** Resolve ownerDocument from a live container/editor element — never via destroyed jodit.ed. */
function getJoditOwnerDocument(jodit) {
    try {
        const el = jodit?.container || jodit?.editor || null;
        if (el?.ownerDocument) return el.ownerDocument;
        if (el?.isConnected === false) return null;
    } catch {
        /* ignore */
    }
    return typeof document !== 'undefined' ? document : null;
}

function setBodyCursor(jodit, cursor) {
    try {
        if (jodit && !isJoditInstanceUsable(jodit)) return;
        const doc = getJoditOwnerDocument(jodit) || (typeof document !== 'undefined' ? document : null);
        if (doc?.body?.style) {
            if (!cursor) doc.body.style.removeProperty('cursor');
            else doc.body.style.cursor = cursor;
        }
        const root = jodit?.editor;
        if (root?.style) {
            if (!cursor) root.style.removeProperty('cursor');
            else root.style.cursor = cursor;
        }
    } catch {
        /* ignore */
    }
}

function clearRowResizeHoverMarkers(table) {
    if (!table) return;
    table.removeAttribute('data-ems-row-resize-active');
    getTableRows(table).forEach((row) => row.removeAttribute('data-ems-row-resize-target'));
}

function markRowResizeHoverTarget(table, rowIndex) {
    if (!table) return;
    clearRowResizeHoverMarkers(table);
    const rows = getTableRows(table);
    const tr = rows[rowIndex];
    if (!tr) return;
    table.setAttribute('data-ems-row-resize-active', '1');
    tr.setAttribute('data-ems-row-resize-target', '1');
}

function getEditorWorkplace(jodit) {
    return jodit.workplace || jodit.container?.querySelector('.jodit-workplace') || null;
}

function getEmsTableResizeHandleParent(jodit) {
    if (!isJoditInstanceUsable(jodit)) {
        return typeof document !== 'undefined' ? document.body : null;
    }
    const doc = getJoditOwnerDocument(jodit);
    return doc?.body || (typeof document !== 'undefined' ? document.body : null);
}

function getEmsTableResizeListenerRoot(jodit, getEditorBody) {
    if (!isJoditInstanceUsable(jodit)) return null;
    try {
        return (
            jodit.container ||
            getEditorWorkplace(jodit) ||
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null
        );
    } catch {
        return null;
    }
}

function isEmsTableResizeHandle(el) {
    return Boolean(
        el?.classList?.contains('ems-table-col-resizer') ||
        el?.classList?.contains('ems-table-row-resizer') ||
        el?.classList?.contains('ems-cell-split-v__gutter') ||
        el?.classList?.contains('ems-cell-split-h__gutter') ||
        el?.closest?.('.ems-cell-split-v__gutter, .ems-cell-split-h__gutter')
    );
}

export function hideTableResizeHandles(jodit, { force = false } = {}) {
    /* Stale editor after re-pack / remount — never throw. */
    if (jodit && !isJoditInstanceUsable(jodit)) {
        const doc =
            getJoditOwnerDocument(jodit) ||
            (typeof document !== 'undefined' ? document : null);
        hideAllEmsTableResizeHandles(doc);
        return;
    }
    /* Never strip handles mid-drag (blur / scroll cleanup used to abort resize). */
    if (jodit?.__emsColResizing || jodit?.__emsRowResizing) return;
    if (jodit) {
        try {
            jodit.__emsColResizeHide?.(force);
        } catch {
            /* ignore stale hideHandle */
        }
        try {
            jodit.__emsRowResizeHide?.(force);
        } catch {
            /* ignore */
        }
        try {
            jodit.__emsColResizeHover = false;
            jodit.__emsRowResizeHover = false;
            setBodyCursor(jodit, '');
        } catch {
            /* ignore */
        }
    }
    const doc =
        getJoditOwnerDocument(jodit) ||
        (typeof document !== 'undefined' ? document : null);
    hideAllEmsTableResizeHandles(doc);
    if (jodit && isJoditInstanceUsable(jodit)) {
        try {
            const workplace = getEditorWorkplace(jodit);
            workplace?.querySelector('.jodit-table-resizer')?.remove();
        } catch {
            /* ignore */
        }
    }
}

/** Remove stray table resize chrome (handles are appended to document.body). */
export function hideAllEmsTableResizeHandles(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
    /* Keep active drag chrome if any editor is mid-resize. */
    try {
        if (doc.querySelector?.('table[data-ems-col-resizing="1"], table[data-ems-row-resizing="1"]')) {
            return;
        }
    } catch {
        /* ignore */
    }
    doc.querySelectorAll('.ems-table-col-resizer, .ems-table-row-resizer, .jodit-table-resizer').forEach((el) => {
        el.remove();
    });
    doc.querySelectorAll('table[data-ems-row-resize-active]').forEach((table) => {
        clearRowResizeHoverMarkers(table);
    });
}

function detectColumnResizeIndex(cell, clientX) {
    if (!cell || clientX == null) return -1;
    const table = cell.closest('table');
    if (!table) return -1;
    const byTable = detectColumnResizeNearPoint(table, clientX);
    if (byTable >= 0) return byTable;
    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, cell);
    if (!pos) return -1;
    const rect = cell.getBoundingClientRect();
    const x = clientX - rect.left;
    const w = rect.width;
    if (w <= 0) return -1;
    const span = Math.max(1, Number(cell.colSpan) || 1);
    if (x >= w - TABLE_COL_EDGE_NEAR) return pos.col + span - 1;
    if (x <= TABLE_COL_EDGE_NEAR && pos.col > 0) return pos.col - 1;
    return -1;
}

/** Preview zoom scale (transform on .quote-preview-zoom-shell) — 1 when not zoomed. */
function getQuotePreviewZoomFactor(el) {
    try {
        const shell = el?.closest?.('.quote-preview-zoom-shell');
        if (!shell) return 1;
        const cssVar = parseFloat(shell.style?.getPropertyValue?.('--quote-preview-zoom') || '');
        if (Number.isFinite(cssVar) && cssVar > 0.05) return cssVar;
        const t = window.getComputedStyle?.(shell)?.transform || '';
        if (t && t !== 'none') {
            const m = t.match(/matrix\(([^)]+)\)/);
            if (m) {
                const a = parseFloat(String(m[1]).split(',')[0]);
                if (Number.isFinite(a) && a > 0.05) return a;
            }
            const m3 = t.match(/matrix3d\(([^)]+)\)/);
            if (m3) {
                const a = parseFloat(String(m3[1]).split(',')[0]);
                if (Number.isFinite(a) && a > 0.05) return a;
            }
        }
    } catch {
        /* ignore */
    }
    return 1;
}

/**
 * Nearest logical column right-edge within hit distance.
 * Prefers the cell under the pointer (stable on Word merges / zoom), then table-wide scan.
 */
function detectColumnResizeNearPoint(table, clientX, clientY = null) {
    if (!table || clientX == null) return -1;
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return -1;

    /* 1) Cell under pointer — most accurate on zoomed preview + merged BOQ rows. */
    if (clientY != null) {
        try {
            const el = table.ownerDocument?.elementFromPoint?.(clientX, clientY);
            const cell = el?.closest?.('td, th');
            if (cell && table.contains(cell)) {
                /* Pane gutter is mid-cell — never treat as a column edge. */
                if (el?.closest?.('.ems-cell-split-v__gutter')) {
                    /* fall through to table-wide edges */
                } else {
                    const { grid } = buildTableCellGrid(table);
                    const pos = findCellGridPosition(grid, cell);
                    if (pos) {
                        const rect = cell.getBoundingClientRect();
                        const span = Math.max(1, Number(cell.colSpan) || 1);
                        const nearRight = Math.abs(clientX - rect.right) <= TABLE_COL_EDGE_NEAR;
                        const nearLeft = Math.abs(clientX - rect.left) <= TABLE_COL_EDGE_NEAR;
                        if (nearRight) {
                            return Math.min(colCount - 1, pos.col + span - 1);
                        }
                        if (nearLeft && pos.col > 0) {
                            return pos.col - 1;
                        }
                    }
                }
            }
        } catch {
            /* fall through */
        }
    }

    /* 2) Table-wide live edges only (no stale width-model fallback). */
    let best = -1;
    let bestDist = TABLE_COL_EDGE_NEAR;
    for (let j = 0; j < colCount; j += 1) {
        const edgeX = getColumnRightEdgeX(table, j);
        if (edgeX == null || !Number.isFinite(edgeX)) continue;
        const dist = Math.abs(clientX - edgeX);
        if (dist <= bestDist) {
            bestDist = dist;
            best = j;
        }
    }
    return best;
}

/**
 * Live content-px widths from rendered edges, corrected for preview zoom.
 * getBoundingClientRect is viewport-scaled; colgroup widths are unscaled CSS px.
 */
function readLiveColumnWidthsFromEdges(table, colCount) {
    const widths = new Array(colCount).fill(0);
    if (!table || !colCount) return widths;
    const zoom = getQuotePreviewZoomFactor(table) || 1;
    const tableLeft = table.getBoundingClientRect().left;
    let prev = tableLeft;
    for (let j = 0; j < colCount; j += 1) {
        const edge = getColumnRightEdgeX(table, j);
        if (edge == null || !Number.isFinite(edge)) {
            widths[j] = DEFAULT_TABLE_COLUMN_WIDTH;
            prev += widths[j] * zoom;
            continue;
        }
        const viewportW = Math.max(1, edge - prev);
        widths[j] = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(viewportW / zoom));
        prev = edge;
    }
    return widths;
}

/**
 * Hit-test in-cell flex split divider (vertical or horizontal).
 * Returns { wrap, host, table, gutter, axis: 'v'|'h' } or null.
 */
function detectInCellSplitResize(table, clientX, clientY) {
    if (!table || clientX == null) return null;
    ensureEmsCellSplitGutters(table);

    let el = null;
    try {
        el = table.ownerDocument?.elementFromPoint?.(clientX, clientY) || null;
    } catch {
        el = null;
    }

    /* Prefer explicit gutter under the pointer. */
    const gutterEl = el?.closest?.('.ems-cell-split-v__gutter, .ems-cell-split-h__gutter');
    if (gutterEl && table.contains(gutterEl)) {
        const wrap = gutterEl.closest?.('.ems-cell-split-v, .ems-cell-split-h');
        const host = wrap?.closest?.('td, th');
        if (wrap && host) {
            const axis = wrap.classList.contains('ems-cell-split-h') ? 'h' : 'v';
            return { wrap, host, table, gutter: gutterEl, axis };
        }
    }

    const vWraps = [...table.querySelectorAll('.ems-cell-split-v')];
    const hWraps = [...table.querySelectorAll('.ems-cell-split-h')];
    if (!vWraps.length && !hWraps.length) return null;

    const fromPointV = el?.closest?.('.ems-cell-split-v');
    const fromPointH = el?.closest?.('.ems-cell-split-h');
    const vCandidates =
        fromPointV && table.contains(fromPointV) ? [fromPointV] : vWraps;
    const hCandidates =
        fromPointH && table.contains(fromPointH) ? [fromPointH] : hWraps;

    /* Score V and H independently so a nearby vertical gutter can't block horizontal. */
    let bestV = null;
    let bestVD = TABLE_SPLIT_PANE_EDGE_NEAR;
    let bestH = null;
    let bestHD = TABLE_SPLIT_PANE_EDGE_NEAR;

    for (const wrap of vCandidates) {
        const rect = wrap.getBoundingClientRect();
        if (!(rect.width > 8) || !(rect.height > 0)) continue;
        if (clientY != null && (clientY < rect.top - 2 || clientY > rect.bottom + 2)) continue;
        const pct = parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
        const gutter = wrap.querySelector?.(':scope > .ems-cell-split-v__gutter');
        const gutterRect = gutter?.getBoundingClientRect?.();
        const dividerX = gutterRect
            ? (gutterRect.left + gutterRect.right) / 2
            : rect.left + (rect.width * pct) / 100;
        const dist = Math.abs(clientX - dividerX);
        if (dist > bestVD) continue;
        const host = wrap.closest?.('td, th');
        if (!host) continue;
        const hostRight = host.getBoundingClientRect().right;
        if (Math.abs(clientX - hostRight) <= TABLE_COL_EDGE_NEAR) continue;
        bestVD = dist;
        bestV = { wrap, host, table, gutter: gutter || null, axis: 'v' };
    }

    if (clientY != null) {
        for (const wrap of hCandidates) {
            const rect = wrap.getBoundingClientRect();
            if (!(rect.width > 0) || !(rect.height > 8)) continue;
            if (clientX < rect.left - 2 || clientX > rect.right + 2) continue;
            const pct = parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
            const gutter = wrap.querySelector?.(':scope > .ems-cell-split-h__gutter');
            const gutterRect = gutter?.getBoundingClientRect?.();
            const dividerY =
                gutterRect && gutterRect.height > 2
                    ? (gutterRect.top + gutterRect.bottom) / 2
                    : rect.top + (rect.height * pct) / 100;
            const dist = Math.abs(clientY - dividerY);
            if (dist > bestHD) continue;
            const host = wrap.closest?.('td, th');
            if (!host) continue;
            bestHD = dist;
            bestH = { wrap, host, table, gutter: gutter || null, axis: 'h' };
        }
    }

    let best = null;
    let bestGutterDist = TABLE_SPLIT_PANE_EDGE_NEAR;
    if (bestV && bestH) {
        best = bestVD <= bestHD ? bestV : bestH;
        bestGutterDist = bestVD <= bestHD ? bestVD : bestHD;
    } else if (bestV) {
        best = bestV;
        bestGutterDist = bestVD;
    } else if (bestH) {
        best = bestH;
        bestGutterDist = bestHD;
    }

    if (!best) return null;

    if (best.axis === 'v') {
        const colHit = detectColumnResizeNearPoint(table, clientX);
        if (colHit >= 0) {
            const colEdge = getColumnRightEdgeX(table, colHit);
            if (colEdge != null && Math.abs(clientX - colEdge) <= bestGutterDist) {
                return null;
            }
        }
    }
    return best;
}

/**
 * One document capture listener for all clause editors — avoids stacked HMR
 * pointerdown handlers that stopImmediatePropagation and freeze resize.
 * Handlers must no-op when the owning Jodit was destroyed (re-pack / remount).
 */
let __emsActiveColResizePointerDown = null;
let __emsActiveColResizeMoveHover = null;
let __emsActiveColResizeOwner = null;
function emsGlobalColResizePointerDown(e) {
    if (!isJoditInstanceUsable(__emsActiveColResizeOwner)) {
        __emsActiveColResizePointerDown = null;
        __emsActiveColResizeMoveHover = null;
        __emsActiveColResizeOwner = null;
        return;
    }
    try {
        __emsActiveColResizePointerDown?.(e);
    } catch {
        /* ignore stale editor */
    }
}
function emsGlobalColResizeMoveHover(e) {
    if (!isJoditInstanceUsable(__emsActiveColResizeOwner)) {
        __emsActiveColResizePointerDown = null;
        __emsActiveColResizeMoveHover = null;
        __emsActiveColResizeOwner = null;
        return;
    }
    try {
        __emsActiveColResizeMoveHover?.(e);
    } catch {
        /* ignore stale editor */
    }
}
function ensureEmsGlobalColResizeDocListeners(doc) {
    if (!doc || doc.__emsColResizeGlobalBound) return;
    doc.__emsColResizeGlobalBound = true;
    doc.addEventListener('pointerdown', emsGlobalColResizePointerDown, true);
    doc.addEventListener('mousemove', emsGlobalColResizeMoveHover, true);
}

/** Only the dragged column changes width; others stay fixed (colgroup px). */
function registerEmsTableColumnResize(jodit, getEditorBody) {
    /* Allow HMR / remount rebind — tear down prior listeners. */
    if (jodit?.__emsTableColResizeCleanup) {
        try {
            jodit.__emsTableColResizeCleanup();
        } catch {
            /* ignore */
        }
    }
    if (!jodit) return;
    jodit.__emsTableColResize = true;

    let handle = null;
    let hideTimeout = 0;
    let drag = false;
    let startX = 0;
    let startWidths = null;
    let lastWidths = null;
    let resizeCol = -1;
    let workTable = null;
    let zoom = 1;
    let moveRoot = null;
    let boundDoc = null;
    let activeMove = null;
    let activeUp = null;
    let pendingDelta = null;
    let rafId = 0;

    const getHandleParent = () => getEmsTableResizeHandleParent(jodit);

    const clearHideTimeout = () => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = 0;
        }
    };

    const hideHandle = (force = false) => {
        /* Never destroy the handle while dragging — blur used to force-remove it mid-drag. */
        if (drag) return;
        if (!isJoditInstanceUsable(jodit)) {
            clearHideTimeout();
            handle?.remove();
            handle = null;
            return;
        }
        if (jodit.__emsColResizing) return;
        clearHideTimeout();
        try {
            jodit.__emsColResizeHover = false;
            if (!jodit.__emsRowResizeHover) {
                setBodyCursor(jodit, '');
            }
        } catch {
            /* ignore */
        }
        if (force) {
            handle?.remove();
            handle = null;
            return;
        }
        /* Fixed delay — never read jodit.defaultTimeout (throws after destruct). */
        hideTimeout = window.setTimeout(() => {
            if (drag) return;
            if (!isJoditInstanceUsable(jodit) || jodit.__emsColResizing) {
                handle?.remove();
                handle = null;
                return;
            }
            handle?.remove();
            handle = null;
        }, 80);
    };

    jodit.__emsColResizeHide = hideHandle;

    const setColResizingFlag = (table, active) => {
        if (active) {
            if (table) table.setAttribute('data-ems-col-resizing', '1');
            jodit.__emsColResizing = true;
        } else {
            table?.removeAttribute?.('data-ems-col-resizing');
            jodit.__emsColResizing = false;
        }
    };

    const positionHandle = (table, colIndex, edgeOverride) => {
        const parent = getHandleParent();
        if (!parent || !table || colIndex < 0) return;
        const edgeX =
            edgeOverride != null && Number.isFinite(edgeOverride)
                ? edgeOverride
                : getColumnRightEdgeX(table, colIndex);
        const anchorCell = findCellAtColumnRightEdge(table, colIndex);
        if (edgeX == null && !anchorCell) return;
        if (!handle) {
            if (!isJoditInstanceUsable(jodit)) return;
            const doc = getJoditOwnerDocument(jodit) || document;
            handle = doc.createElement('div');
            handle.className = 'ems-table-col-resizer';
            handle.setAttribute('title', 'Drag to resize column');
            handle.setAttribute('data-ems-col-resizer', '1');
            handle.style.cssText =
                'position:fixed;z-index:2147483000;width:8px;margin-left:-4px;cursor:col-resize;' +
                'pointer-events:auto;display:block;touch-action:none;user-select:none;';
            handle.addEventListener('pointerdown', onHandlePointerDown, true);
            handle.addEventListener('mouseenter', clearHideTimeout);
        }
        const tableRect = table.getBoundingClientRect();
        const edge = edgeX ?? anchorCell?.getBoundingClientRect().right;
        if (edge == null) return;
        /*
         * Prefer clipping to the workplace, but quote-preview hosts sometimes report a
         * workplace rect with no overlap — that hid every blue line. Fall back to the table.
         */
        const clipRoot =
            jodit.workplace ||
            jodit.editor?.parentElement ||
            jodit.container ||
            null;
        const clipRect = clipRoot?.getBoundingClientRect?.();
        let top = tableRect.top;
        let bottom = tableRect.bottom;
        if (clipRect && Number.isFinite(clipRect.top) && Number.isFinite(clipRect.bottom)) {
            const clippedTop = Math.max(tableRect.top, clipRect.top);
            const clippedBottom = Math.min(tableRect.bottom, clipRect.bottom);
            if (clippedBottom - clippedTop > 2) {
                top = clippedTop;
                bottom = clippedBottom;
            }
        }
        const height = Math.max(0, bottom - top);
        if (!(height > 2)) {
            hideHandle();
            return;
        }
        /* 8px hit target centered on the border; 2px blue guide painted inline (always visible). */
        handle.style.left = `${Math.round(edge)}px`;
        handle.style.top = `${Math.round(top)}px`;
        handle.style.setProperty('width', '8px', 'important');
        handle.style.setProperty('margin-left', '-4px', 'important');
        handle.style.height = `${Math.round(height)}px`;
        handle.style.setProperty('z-index', '2147483000', 'important');
        handle.style.setProperty('display', 'block', 'important');
        handle.style.setProperty('pointer-events', 'auto', 'important');
        handle.style.setProperty('visibility', 'visible', 'important');
        handle.style.setProperty('opacity', '1', 'important');
        handle.style.setProperty('cursor', 'col-resize', 'important');
        handle.style.setProperty(
            'background',
            'linear-gradient(to right, transparent 3px, rgba(30,136,229,0.85) 3px, rgba(30,136,229,0.85) 5px, transparent 5px)',
            'important'
        );
        clearHideTimeout();
        if (handle.parentNode !== parent) parent.appendChild(handle);
        workTable = table;
        resizeCol = colIndex;
        jodit.__emsColResizeHover = true;
        setBodyCursor(jodit, 'col-resize');
    };

    /**
     * Middle columns: pair-resize with the next column (table width stays stable).
     * Last column: solo resize so dragging left shrinks Make and the table width.
     * If still over A4 after a grow, steal from other columns.
     */
    const computeNextWidths = (delta) => {
        if (!startWidths || resizeCol < 0) return null;
        const colCount = startWidths.length;
        const next = startWidths.slice();
        const floor = (j) => getColumnWidthFloor(colCount, j);
        const leftFloor = floor(resizeCol);
        const startLeft = Math.max(leftFloor, startWidths[resizeCol] || DEFAULT_TABLE_COLUMN_WIDTH);
        const isLastCol = resizeCol === colCount - 1;
        const neighbor = resizeCol + 1 < colCount ? resizeCol + 1 : -1;

        if (!isLastCol && neighbor >= 0) {
            const nFloor = floor(neighbor);
            const startN = Math.max(nFloor, startWidths[neighbor] || DEFAULT_TABLE_COLUMN_WIDTH);
            const pairSum = startLeft + startN;
            const maxLeft = Math.max(leftFloor, pairSum - nFloor);
            const desired = Math.max(leftFloor, Math.min(maxLeft, Math.round(startLeft + delta)));
            next[resizeCol] = desired;
            next[neighbor] = Math.max(nFloor, pairSum - desired);
        } else {
            next[resizeCol] = Math.max(leftFloor, Math.round(startLeft + delta));
        }

        const maxTable =
            workTable && isEmsPricingSummaryTable(workTable)
                ? getPricingTableMaxContentWidthPx(workTable)
                : getBoqTableMaxContentWidthPx(workTable);

        let sum = next.reduce((s, w, i) => s + Math.max(floor(i), w || 0), 0);
        if (sum > maxTable) {
            let need = sum - maxTable;
            for (let j = 0; j < colCount && need > 0; j += 1) {
                if (j === resizeCol) continue;
                const f = floor(j);
                const canGive = Math.max(0, (next[j] || 0) - f);
                const take = Math.min(canGive, need);
                next[j] = (next[j] || 0) - take;
                need -= take;
            }
            if (need > 0) {
                next[resizeCol] = Math.max(leftFloor, (next[resizeCol] || 0) - need);
            }
        }
        return next;
    };

    const flushResize = () => {
        rafId = 0;
        if (!drag || pendingDelta == null || !workTable || !startWidths) return;
        const delta = pendingDelta;
        pendingDelta = null;
        const next = computeNextWidths(delta);
        if (!next) return;
        const rows = getTableRows(workTable);
        /* No fitToPage mid-drag — it fought shrink and scrambled pair widths. */
        applyColumnWidths(workTable, rows, next, { flexibleMin: true, fitToPage: false });
        /* Belt-and-suspenders: force colgroup even if cell grid walk skipped cells. */
        const { cols } = getOrSyncColgroup(workTable, next.length);
        let sum = 0;
        next.forEach((w, j) => {
            const px = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(w || 0));
            sum += px;
            if (cols[j]) {
                cols[j].style.setProperty('width', `${px}px`, 'important');
                cols[j].style.setProperty('min-width', '24px', 'important');
                cols[j].style.removeProperty('max-width');
                cols[j].setAttribute('width', String(px));
            }
        });
        if (sum > 0) {
            workTable.style.setProperty('width', `${sum}px`, 'important');
            workTable.style.setProperty('min-width', '0', 'important');
            workTable.style.setProperty('max-width', '100%', 'important');
            workTable.style.setProperty('table-layout', 'fixed', 'important');
        }
        workTable.setAttribute('data-ems-col-widths', next.join(','));
        workTable.setAttribute('data-ems-col-widths-custom', '1');
        workTable.setAttribute('data-ems-edit-cols-locked', '1');
        lastWidths = next;
        const edge = getColumnEdgeXFromWidths(workTable, next, resizeCol, zoom || 1);
        positionHandle(workTable, resizeCol, edge);
    };

    const applyResize = (delta) => {
        if (!workTable || resizeCol < 0 || !startWidths) return;
        pendingDelta = delta;
        if (!rafId) rafId = window.requestAnimationFrame(flushResize);
    };

    const endColResizeDrag = () => {
        if (!drag) return;
            const finishedTable = workTable;
        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
        }
        /* Final frame while drag is still true (flushResize requires it). */
        if (pendingDelta != null) flushResize();
            drag = false;
        setColResizingFlag(finishedTable, false);
            handle?.classList.remove('ems-table-col-resizer_moved');
        if (activeMove) {
            window.removeEventListener('pointermove', activeMove, true);
            window.removeEventListener('mousemove', activeMove, true);
            document.removeEventListener('pointermove', activeMove, true);
            document.removeEventListener('mousemove', activeMove, true);
        }
        if (activeUp) {
            window.removeEventListener('pointerup', activeUp, true);
            window.removeEventListener('pointercancel', activeUp, true);
            window.removeEventListener('mouseup', activeUp, true);
            document.removeEventListener('pointerup', activeUp, true);
            document.removeEventListener('pointercancel', activeUp, true);
            document.removeEventListener('mouseup', activeUp, true);
        }
        activeMove = null;
        activeUp = null;
        /* Re-lock min-width=width after drag so columns stay stable. */
        if (finishedTable?.isConnected) {
            const rows = getTableRows(finishedTable);
            const finalWidths =
                lastWidths ||
                String(finishedTable.getAttribute('data-ems-col-widths') || '')
                    .split(',')
                    .map((s) => parseFloat(String(s).trim()))
                    .filter((n) => Number.isFinite(n) && n > 0);
            if (finalWidths.length && rows.length) {
                /* Soft min for BOQ — fit to page only after a real user drag. */
                applyColumnWidths(finishedTable, rows, finalWidths.slice(), { fitToPage: true });
            }
            finishedTable.setAttribute('data-ems-col-widths-custom', '1');
            finishedTable.setAttribute('data-ems-edit-cols-locked', '1');
            /* Block forceRepair/harmonize bootstrap wipe for a few seconds after drag. */
            jodit.__emsUserColResizeUntil = Date.now() + 8000;
        }
            startWidths = null;
        lastWidths = null;
        pendingDelta = null;
            setBodyCursor(jodit, '');
            document.body.style.removeProperty('user-select');
        document.body.style.removeProperty('cursor');
        try {
            handle?.releasePointerCapture?.(handle.__emsPointerId);
        } catch {
            /* ignore */
        }
        /* Persist into Jodit value after layout settles — repair must see custom flag. */
        window.setTimeout(() => {
            if (!finishedTable?.isConnected) return;
            const rows = getTableRows(finishedTable);
            const csv = String(finishedTable.getAttribute('data-ems-col-widths') || '')
                .split(',')
                .map((s) => parseFloat(String(s).trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (csv.length && rows.length) {
                applyColumnWidths(finishedTable, rows, csv, { fitToPage: true });
                finishedTable.setAttribute('data-ems-col-widths-custom', '1');
                finishedTable.setAttribute('data-ems-edit-cols-locked', '1');
            }
            if (
                isEmsPricingSummaryTable(finishedTable) &&
                !finishedTable.hasAttribute('data-ems-row-heights-custom')
            ) {
                        fitEmsPricingSummaryTableRowHeights(finishedTable, { allowMeasure: true });
            }
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
        }, 0);
        /* Second paint — catches late office/normalize passes that strip cell locks. */
        window.setTimeout(() => {
            if (!finishedTable?.isConnected) return;
            const rows = getTableRows(finishedTable);
            const csv = String(finishedTable.getAttribute('data-ems-col-widths') || '')
                .split(',')
                .map((s) => parseFloat(String(s).trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (!csv.length || !rows.length) return;
            applyColumnWidths(finishedTable, rows, csv, { fitToPage: true });
            finishedTable.setAttribute('data-ems-col-widths-custom', '1');
            finishedTable.setAttribute('data-ems-edit-cols-locked', '1');
        }, 120);
    };

    const beginColResizeDrag = (table, colIndex, clientX) => {
        if (!table || colIndex < 0 || drag) return;
        /* Do NOT jodit.lock — lock + blur cleanup was killing the drag handle. */
        if (jodit.isLocked) {
            try {
                jodit.unlock();
            } catch {
                /* ignore */
            }
        }
        try {
            jodit.e.fire('hidePopup');
        } catch {
            /* ignore */
        }
        jodit.__emsRowResizeHide?.(true);

        workTable = table;
        resizeCol = colIndex;
        /* Word/Excel merges leave width= / pt locks that freeze columns — strip before drag. */
        stripOfficeMergeWidthArtifacts(workTable);
        /* Leftover max-width pins make "increase" impossible after a prior shrink. */
        workTable.querySelectorAll?.('col, td, th')?.forEach((el) => {
            el.style?.removeProperty?.('max-width');
        });
        workTable.style.setProperty('max-width', 'none', 'important');
        const rows = getTableRows(workTable);
        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        const stored = readColumnWidthsPx(workTable, rows, colCount);
        zoom = getQuotePreviewZoomFactor(workTable) || 1;
        /* Logical-grid measure (merge-aware) — never physical cells[i]. */
        const measured = measureLogicalColumnWidthsLivePx(workTable);
        const liveViewport = measured.widths || [];
        const live = liveViewport.map((w) =>
            Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round((w || 0) / (zoom || 1)))
        );
        /*
         * Always start from painted widths. Stale Word/bootstrap models caused the table
         * to snap on mousedown then "reset" after mouseup when repair re-applied stored.
         */
        startWidths = new Array(colCount).fill(DEFAULT_TABLE_COLUMN_WIDTH);
        for (let j = 0; j < colCount; j += 1) {
            if (live[j] > 0) startWidths[j] = live[j];
            else if (stored[j] > 0) startWidths[j] = stored[j];
        }
        if (!(startWidths[resizeCol] > 0)) {
            startWidths[resizeCol] = Math.max(
                MIN_TABLE_COLUMN_WIDTH,
                live[resizeCol] || stored[resizeCol] || DEFAULT_TABLE_COLUMN_WIDTH
            );
        }
        jodit.__emsUserColResizeUntil = Date.now() + 8000;
        /* Cancel any in-flight schedule repair that could rewrite columns mid-drag. */
        __emsScheduleColRepairGen += 1;
        /* Seed colgroup once (not every frame). */
        applyColumnWidths(workTable, rows, startWidths.slice(), { flexibleMin: true });
            workTable.setAttribute('data-ems-col-widths-custom', '1');
        workTable.setAttribute('data-ems-edit-cols-locked', '1');
        lastWidths = startWidths.slice();
        startX = clientX;
        drag = true;
        pendingDelta = null;
        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
        }
        setColResizingFlag(workTable, true);
        const startEdge = getColumnEdgeXFromWidths(workTable, startWidths, resizeCol, zoom);
        positionHandle(workTable, resizeCol, startEdge);
        handle?.classList.add('ems-table-col-resizer_moved');
        setBodyCursor(jodit, 'col-resize');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        activeMove = (ev) => {
            if (!drag) return;
            const x = ev.clientX ?? ev.touches?.[0]?.clientX;
            if (x == null) return;
            if (ev.cancelable) ev.preventDefault();
            applyResize((x - startX) / (zoom || 1));
        };
        activeUp = () => endColResizeDrag();

        window.addEventListener('pointermove', activeMove, true);
        window.addEventListener('pointerup', activeUp, true);
        window.addEventListener('pointercancel', activeUp, true);
        window.addEventListener('mousemove', activeMove, true);
        window.addEventListener('mouseup', activeUp, true);
        document.addEventListener('pointermove', activeMove, true);
        document.addEventListener('pointerup', activeUp, true);
        document.addEventListener('pointercancel', activeUp, true);
        document.addEventListener('mousemove', activeMove, true);
        document.addEventListener('mouseup', activeUp, true);
    };

    const onHandlePointerDown = (e) => {
        if (e.button != null && e.button !== 0) return;
        if (!workTable || resizeCol < 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
            if (e.pointerId != null) {
                handle.__emsPointerId = e.pointerId;
                handle.setPointerCapture?.(e.pointerId);
            }
        } catch {
            /* ignore */
        }
        beginColResizeDrag(workTable, resizeCol, e.clientX);
    };

    const resolveTableFromEvent = (event) => {
        const t = event.target;
        if (t?.closest?.('.ems-table-col-resizer')) {
            return workTable?.isConnected ? workTable : null;
        }
        const table = t?.closest?.('table');
        if (!table) return null;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (root?.contains?.(table)) return table;
        if (jodit.editor?.contains?.(table)) return table;
        if (jodit.workplace?.contains?.(table)) return table;
        if (jodit.container?.contains?.(table)) return table;
        return null;
    };

    const onEditorMouseMove = (event) => {
        if (!isJoditInstanceUsable(jodit)) {
            hideHandle(true);
            return;
        }
        if (drag || jodit.__emsRowResizing || jodit.__emsColResizing) return;
        if (event.target?.closest?.('.ems-cell-split-v__gutter, .ems-cell-split-h__gutter')) {
            hideHandle();
            return;
        }
        if (event.target?.closest?.('.ems-table-col-resizer')) return;
        const table = resolveTableFromEvent(event);
        if (!table) {
            hideHandle();
            return;
        }
        const splitHit = detectInCellSplitResize(table, event.clientX, event.clientY);
        if (splitHit) {
            hideHandle();
            setBodyCursor(jodit, splitHit.axis === 'h' ? 'row-resize' : 'col-resize');
            return;
        }
        const colIndex = detectColumnResizeNearPoint(table, event.clientX, event.clientY);
        if (colIndex < 0) {
            hideHandle();
            return;
        }
        positionHandle(table, colIndex);
    };

    const onColEdgePointerDown = (e) => {
        if (!isJoditInstanceUsable(jodit)) return;
        if (drag) return;
        if (e.button != null && e.button !== 0) return;
        if (e.target?.closest?.('.ems-cell-split-v__gutter, .ems-cell-split-h__gutter')) return;
        /* Handle has its own listener. */
        if (e.target?.closest?.('.ems-table-col-resizer')) return;
        const table = resolveTableFromEvent(e);
        if (!table) return;
        if (detectInCellSplitResize(table, e.clientX, e.clientY)) return;
        const colIndex = detectColumnResizeNearPoint(table, e.clientX, e.clientY);
        if (colIndex < 0) return;
        e.preventDefault();
        e.stopPropagation();
        beginColResizeDrag(table, colIndex, e.clientX);
    };

    const onMoveLeave = (event) => {
        if (drag) return;
        if (!isJoditInstanceUsable(jodit)) {
            hideHandle(true);
            return;
        }
        const related = event.relatedTarget;
        if (isEmsTableResizeHandle(related)) return;
        if (related && moveRoot?.contains?.(related)) return;
        hideHandle();
    };

    const attachColResizeListeners = () => {
        if (!isJoditInstanceUsable(jodit)) return;
        const listenerRoot = getEmsTableResizeListenerRoot(jodit, getEditorBody);
        /* Resolve document from the live container at call time (not cached jodit.ed). */
        const doc =
            listenerRoot?.ownerDocument ||
            getJoditOwnerDocument(jodit) ||
            (typeof document !== 'undefined' ? document : null);
        if (!doc || (listenerRoot && listenerRoot.isConnected === false)) return;

        if (moveRoot && moveRoot !== listenerRoot) {
            moveRoot.removeEventListener('mouseleave', onMoveLeave);
        }
        moveRoot = listenerRoot || null;
        if (moveRoot) {
            moveRoot.removeEventListener('mouseleave', onMoveLeave);
            moveRoot.addEventListener('mouseleave', onMoveLeave);
        }

        boundDoc = doc;
        ensureEmsGlobalColResizeDocListeners(doc);
        /* Point globals at THIS editor's live closures (latest HMR wins). */
        __emsActiveColResizePointerDown = onColEdgePointerDown;
        __emsActiveColResizeMoveHover = onEditorMouseMove;
        __emsActiveColResizeOwner = jodit;
        doc.__emsColResizeOwner = jodit;
    };

    jodit.__emsTableColResizeCleanup = () => {
        try {
            endColResizeDrag();
        } catch {
            /* ignore */
        }
        hideHandle(true);
        clearHideTimeout();
        if (moveRoot) {
            moveRoot.removeEventListener('mouseleave', onMoveLeave);
            moveRoot = null;
        }
        if (__emsActiveColResizePointerDown === onColEdgePointerDown) {
            __emsActiveColResizePointerDown = null;
        }
        if (__emsActiveColResizeMoveHover === onEditorMouseMove) {
            __emsActiveColResizeMoveHover = null;
        }
        if (__emsActiveColResizeOwner === jodit) {
            __emsActiveColResizeOwner = null;
        }
        if (boundDoc?.__emsColResizeOwner === jodit) {
            boundDoc.__emsColResizeOwner = null;
        }
        boundDoc = null;
        try {
            jodit.__emsTableColResize = false;
            jodit.__emsTableColResizeCleanup = null;
            jodit.__emsColResizeHide = null;
            jodit.__emsBindColResizeListeners = null;
        } catch {
            /* ignore */
        }
    };

    jodit.__emsBindColResizeListeners = attachColResizeListeners;
    try {
        jodit.e.off('afterInit.emsColResizeBind');
        jodit.e.off('afterSetMode.emsColResizeBind');
        jodit.e.off('beforeDestruct.emsColResizeBind');
        jodit.e.on('afterInit.emsColResizeBind', () => {
            if (!isJoditInstanceUsable(jodit)) return;
            requestAnimationFrame(attachColResizeListeners);
        });
        jodit.e.on('afterSetMode.emsColResizeBind', () => {
            if (!isJoditInstanceUsable(jodit)) return;
            requestAnimationFrame(attachColResizeListeners);
        });
        jodit.e.on('beforeDestruct.emsColResizeBind', () => {
            try {
                jodit.__emsTableColResizeCleanup?.();
            } catch {
                /* ignore */
            }
        });
    } catch {
        /* ignore */
    }
    requestAnimationFrame(() => {
        if (isJoditInstanceUsable(jodit)) attachColResizeListeners();
    });
}

/**
 * Drag the in-cell split gutter to resize left/right panes (same formal column synced).
 * Does not change outer BOQ column widths.
 */
function registerEmsCellSplitPaneResize(jodit, getEditorBody) {
    if (jodit?.__emsCellSplitPaneResizeCleanup) {
        try {
            jodit.__emsCellSplitPaneResizeCleanup();
        } catch {
            /* ignore */
        }
    }
    if (!jodit) return;
    jodit.__emsCellSplitPaneResize = true;

    let drag = null;
    let boundRoot = null;

    const endDrag = () => {
        if (!drag) return;
        const {
            onMove,
            onUp,
            wrap,
            axis,
            host,
            table,
            lockedH,
            lastPct,
            doc: dragDoc,
            win: dragWin,
        } = drag;
        drag.gutter?.removeAttribute?.('data-ems-dragging');
        try {
            if (drag.pointerId != null && drag.gutter?.releasePointerCapture) {
                drag.gutter.releasePointerCapture(drag.pointerId);
            }
        } catch {
            /* ignore */
        }
        /* Bake final H ratio from last drag pct — do not re-read a stale attribute. */
        if (axis === 'h' && wrap) {
            const pct = Number.isFinite(lastPct)
                ? lastPct
                : parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
            const keepH = lockedH || resolveEmsCellSplitHHeight(wrap);
            const clearDragFlag = (w) => w?.removeAttribute?.('data-ems-split-h-dragging');
            clearDragFlag(wrap);
            const group = wrap.getAttribute('data-ems-split-h-group');
            if (group && table) {
                table
                    .querySelectorAll(`.ems-cell-split-h[data-ems-split-h-group="${group}"]`)
                    .forEach(clearDragFlag);
            }
            syncEmsCellSplitRatioInRow(table, host, pct, keepH);
        }
        setBodyCursor(jodit, '');
        document.body.style.removeProperty('user-select');
        document.body.style.removeProperty('cursor');
        const docs = [...new Set([document, dragDoc].filter(Boolean))];
        const wins = [...new Set([window, dragWin].filter(Boolean))];
        if (onMove) {
            wins.forEach((w) => {
                w.removeEventListener('pointermove', onMove, true);
                w.removeEventListener('mousemove', onMove, true);
            });
            docs.forEach((d) => {
                d.removeEventListener('pointermove', onMove, true);
                d.removeEventListener('mousemove', onMove, true);
            });
        }
        if (onUp) {
            wins.forEach((w) => {
                w.removeEventListener('pointerup', onUp, true);
                w.removeEventListener('pointercancel', onUp, true);
                w.removeEventListener('mouseup', onUp, true);
            });
            docs.forEach((d) => {
                d.removeEventListener('pointerup', onUp, true);
                d.removeEventListener('pointercancel', onUp, true);
                d.removeEventListener('mouseup', onUp, true);
            });
        }
        drag = null;
        /* Sync while still marked resizing so React/history do not overwrite with stale HTML. */
        try {
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
        } finally {
            jodit.__emsSplitPaneResizing = false;
        }
    };

    const beginSplitPaneDrag = (hit, clientX, clientY, pointerId = null) => {
        const { wrap, host, table, gutter, axis } = hit;
        if (!wrap || !host) return;
        if (jodit.isLocked) {
            try {
                jodit.unlock();
            } catch {
                /* ignore */
            }
        }
        try {
            jodit.e.fire('hidePopup');
        } catch {
            /* ignore */
        }
        jodit.__emsColResizeHide?.(true);
        jodit.__emsRowResizeHide?.(true);
        jodit.__emsSplitPaneResizing = true;

        const dragAxis = axis === 'h' ? 'h' : 'v';
        let wrapRect = wrap.getBoundingClientRect();
        let lockedH = 0;
        if (dragAxis === 'h') {
            const tr = host.closest?.('tr');
            if (!wrap.getAttribute('data-ems-split-h-group') && tr) {
                const siblingWraps = [
                    ...tr.querySelectorAll(':scope > td > .ems-cell-split-h, :scope > th > .ems-cell-split-h'),
                ];
                if (siblingWraps.length > 1) {
                    const gid =
                        siblingWraps
                            .find((w) => w.getAttribute('data-ems-split-h-group'))
                            ?.getAttribute('data-ems-split-h-group') || newEmsCellSplitHGroupId();
                    siblingWraps.forEach((w) => {
                        w.setAttribute('data-ems-split-h-group', gid);
                        w.closest?.('td, th')?.setAttribute?.('data-ems-split-h-group', gid);
                    });
                }
            }
            lockedH = resolveEmsCellSplitHHeight(
                wrap,
                Math.max(wrapRect.height, measureEmsCellSplitHContentHeight(wrap))
            );
            const pct0 = parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50;
            syncEmsCellSplitRatioInRow(table, host, pct0, lockedH);
            const group = wrap.getAttribute('data-ems-split-h-group');
            const markDragging = (w) => w?.setAttribute?.('data-ems-split-h-dragging', '1');
            markDragging(wrap);
            if (group && table) {
                table
                    .querySelectorAll(`.ems-cell-split-h[data-ems-split-h-group="${group}"]`)
                    .forEach(markDragging);
            }
            wrapRect = wrap.getBoundingClientRect();
            lockedH = resolveEmsCellSplitHHeight(wrap, wrapRect.height || lockedH);
        }

        gutter?.setAttribute?.('data-ems-dragging', '1');
        const cursor = dragAxis === 'h' ? 'row-resize' : 'col-resize';
        setBodyCursor(jodit, cursor);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = cursor;

        const ownerDoc = wrap.ownerDocument || document;
        const ownerWin = ownerDoc.defaultView || window;

        const onMove = (ev) => {
            if (!drag) return;
            if (ev.cancelable) ev.preventDefault();
            if (drag.axis === 'h') {
                const y = ev.clientY ?? ev.touches?.[0]?.clientY;
                if (y == null) return;
                const h = drag.lockedH || drag.wrapH;
                if (!(h > 8)) return;
                /* Use locked top/height — live rect shifts during apply and caused snap/oscillation. */
                const pct = Math.max(10, Math.min(90, ((y - drag.wrapTop) / h) * 100));
                drag.lastPct = pct;
                syncEmsCellSplitRatioInRow(drag.table, drag.host, pct, h);
            } else {
                const x = ev.clientX ?? ev.touches?.[0]?.clientX;
                if (x == null) return;
                const live = drag.wrap.getBoundingClientRect();
                const w = live.width || drag.wrapW;
                if (!(w > 8)) return;
                const pct = ((x - live.left) / w) * 100;
                drag.lastPct = pct;
                syncEmsCellSplitRatioInColumn(drag.table, drag.host, pct);
            }
        };
        const onUp = () => endDrag();

        drag = {
            gutter,
            wrap,
            host,
            table,
            axis: dragAxis,
            startX: clientX,
            startY: clientY,
            wrapLeft: wrapRect.left,
            wrapTop: wrapRect.top,
            wrapW: wrapRect.width,
            wrapH: wrapRect.height,
            lockedH,
            lastPct: parseFloat(wrap.getAttribute('data-ems-split-pct') || '50') || 50,
            pointerId,
            doc: ownerDoc,
            win: ownerWin,
            onMove,
            onUp,
        };

        if (pointerId != null && gutter?.setPointerCapture) {
            try {
                gutter.setPointerCapture(pointerId);
            } catch {
                /* ignore */
            }
        }
        /* Apply once so the divider jumps under the pointer immediately (parity with V). */
        onMove({ clientX, clientY, cancelable: false, preventDefault() {} });

        [...new Set([ownerWin, window].filter(Boolean))].forEach((w) => {
            w.addEventListener('pointermove', onMove, true);
            w.addEventListener('pointerup', onUp, true);
            w.addEventListener('pointercancel', onUp, true);
            w.addEventListener('mousemove', onMove, true);
            w.addEventListener('mouseup', onUp, true);
        });
        [...new Set([ownerDoc, document].filter(Boolean))].forEach((d) => {
            d.addEventListener('pointermove', onMove, true);
            d.addEventListener('pointerup', onUp, true);
            d.addEventListener('pointercancel', onUp, true);
            d.addEventListener('mousemove', onMove, true);
            d.addEventListener('mouseup', onUp, true);
        });
    };

    const onSplitPointerDown = (e) => {
        if (drag) return;
        if (e.button != null && e.button !== 0) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;
        const table = e.target?.closest?.('table');
        if (!table || !root.contains(table)) return;

        /* Geometry hit — works even if gutter node was stripped / hard to click. */
        const hit = detectInCellSplitResize(table, e.clientX, e.clientY);
        if (!hit) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        beginSplitPaneDrag(hit, e.clientX, e.clientY, e.pointerId);
    };

    const onSplitMouseMove = (e) => {
        if (drag || jodit.__emsSplitPaneResizing || jodit.__emsColResizing || jodit.__emsRowResizing) {
            return;
        }
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;
        const table = e.target?.closest?.('table');
        if (!table || !root.contains(table)) return;
        const hit = detectInCellSplitResize(table, e.clientX, e.clientY);
        if (!hit) return;
        setBodyCursor(jodit, hit.axis === 'h' ? 'row-resize' : 'col-resize');
        document.body.style.cursor = hit.axis === 'h' ? 'row-resize' : 'col-resize';
    };

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;
        ensureEmsCellSplitGutters(root);
        if (boundRoot && boundRoot !== root) {
            boundRoot.removeEventListener('mousedown', onSplitPointerDown, true);
            boundRoot.removeEventListener('mousemove', onSplitMouseMove, true);
            boundRoot.__emsSplitPaneResizeBound = false;
        }
        boundRoot = root;
        if (root.__emsSplitPaneResizeBound) {
            /* Rebind mousemove even if mousedown already bound (HMR). */
            root.removeEventListener('mousemove', onSplitMouseMove, true);
            root.addEventListener('mousemove', onSplitMouseMove, true);
            return;
        }
        root.__emsSplitPaneResizeBound = true;
        root.addEventListener('mousedown', onSplitPointerDown, true);
        root.addEventListener('mousemove', onSplitMouseMove, true);
    };

    jodit.__emsCellSplitPaneResizeCleanup = () => {
        endDrag();
        if (boundRoot) {
            boundRoot.removeEventListener('mousedown', onSplitPointerDown, true);
            boundRoot.removeEventListener('mousemove', onSplitMouseMove, true);
            boundRoot.__emsSplitPaneResizeBound = false;
            boundRoot = null;
        }
        jodit.__emsCellSplitPaneResize = false;
        jodit.__emsCellSplitPaneResizeCleanup = null;
    };

    jodit.e.on('afterInit.emsSplitPaneBind', () => requestAnimationFrame(attach));
    jodit.e.on('afterSetMode.emsSplitPaneBind', () => requestAnimationFrame(attach));
    requestAnimationFrame(attach);
}

function detectRowResizeIndex(cell, clientX, clientY) {
    if (!cell || clientX == null || clientY == null) return -1;
    if (detectColumnResizeIndex(cell, clientX) >= 0) return -1;

    const tr = cell.closest('tr');
    const table = tr?.closest('table');
    if (!tr || !table) return -1;

    const rowRect = tr.getBoundingClientRect();
    if (rowRect.height <= 0) return -1;
    if (clientY < rowRect.bottom - TABLE_ROW_EDGE_NEAR) return -1;

    const rows = getTableRows(table);
    const idx = rows.indexOf(tr);
    return idx >= 0 ? idx : -1;
}

function isTableResizeEdgeAtPoint(jodit, cell, clientX, clientY) {
    if (!cell) return false;
    if (!jodit?.__emsColResizeHover && !jodit?.__emsRowResizeHover) return false;
    if (detectColumnResizeIndex(cell, clientX) >= 0) return true;
    return false;
}

/** Reliable cell hit-test while dragging (handles fast moves / nested tags). */
function getTableCellAtClientPoint(doc, clientX, clientY, table) {
    if (!doc?.elementFromPoint || !table) return null;
    const cell = getTableCellFromNode(doc.elementFromPoint(clientX, clientY));
    if (!cell || !table.contains(cell)) return null;
    return cell;
}

const EMS_TABLE_CELL_DRAG_THRESHOLD_PX = 3;

function applyTableCellRangeSelection(jodit, table, startCell, endCell) {
    if (!table || !startCell || !endCell) return [];
    jodit.__emsSkipTableSelSync = true;
    const picked = selectTableCellRange(jodit, table, startCell, endCell);
    jodit.__emsSkipTableSelSync = false;
    if (picked.length >= 2) {
        storeSplitColumnHint(jodit, table, picked);
        jodit.__emsActiveTableCell = startCell;
        table.setAttribute('data-ems-cell-selecting', '1');
        try {
            jodit.s?.sel?.removeAllRanges?.();
        } catch {
            /* ignore */
        }
    } else {
        jodit.__emsFormatTableCells = null;
        jodit.__emsSplitTableCells = null;
        jodit.__emsLastMultiCellBlock = null;
        jodit.__emsSplitColumnHint = null;
        table.removeAttribute('data-ems-cell-selecting');
        clearAllTableCellSelection(jodit);
    }
    return picked;
}

function getSelectedTableRows(jodit, getEditorBody) {
    const live = getSelectedTableCells(jodit);
    const stashed = (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
    /** @type {HTMLTableCellElement[]} */
    const cells = [];
    const seenCell = new Set();
    [...stashed, ...live].forEach((cell) => {
        if (cell?.isConnected && !seenCell.has(cell)) {
            seenCell.add(cell);
            cells.push(cell);
        }
    });
  /** @type {HTMLTableRowElement[]} */
    const rows = [];
    const seen = new Set();

    if (cells.length) {
        cells.forEach((cell) => {
            const tr = cell.closest('tr');
            if (tr && !seen.has(tr)) {
                seen.add(tr);
                rows.push(tr);
            }
        });
    } else {
        const cell = getActiveTableCell(jodit, getEditorBody);
        const tr = cell?.closest('tr');
        if (tr) rows.push(tr);
    }

    const table = rows[0]?.closest('table');
    if (!table) return rows;

    const order = getTableRows(table);
    return rows.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Row indices to resize together — all selected rows in the table, or just the dragged row. */
function resolveRowResizeTargetIndices(jodit, getEditorBody, table, primaryRowIndex) {
    const rows = getTableRows(table);
    const primaryRow = rows[primaryRowIndex];
    if (!primaryRow) return [primaryRowIndex];

    const selectedRows = getSelectedTableRows(jodit, getEditorBody).filter(
        (tr) => tr.closest('table') === table
    );
    if (selectedRows.length <= 1 || !selectedRows.includes(primaryRow)) {
        return [primaryRowIndex];
    }

    return selectedRows.map((tr) => rows.indexOf(tr)).filter((i) => i >= 0);
}

function markRowResizeTargetRows(table, rowIndices) {
    if (!table) return;
    clearRowResizeHoverMarkers(table);
    const rows = getTableRows(table);
    table.setAttribute('data-ems-row-resize-active', '1');
    rowIndices.forEach((i) => {
        const tr = rows[i];
        if (tr) tr.setAttribute('data-ems-row-resize-target', '1');
    });
}

/** Dragged row sets height; when multiple rows are selected, all selected rows match that height. */
function registerTableRowResize(jodit, getEditorBody) {
    if (!jodit) return;
    /* Allow remount rebind — tear down prior listeners on the same instance. */
    if (jodit.__emsTableRowResizeCleanup) {
        try {
            jodit.__emsTableRowResizeCleanup();
        } catch {
            /* ignore */
        }
    }
    jodit.__emsTableRowResize = true;

    let handle = null;
    let hideTimeout = 0;
    let drag = false;
    let startY = 0;
    let startHeights = null;
    let resizeRow = -1;
    let resizeRowIndices = [];
    let workTable = null;
    let hoverCell = null;
    /** @type {Array<{ el: Element, type: string, fn: EventListener }>} */
    let boundMoves = [];

    const getHandleParent = () => getEmsTableResizeHandleParent(jodit);

    const clearHideTimeout = () => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = 0;
        }
    };

    const clearRowResizeHover = () => {
        hoverCell = null;
    };

    const hideHandle = (force = false) => {
        if (drag && !force) return;
        clearHideTimeout();
        clearRowResizeHover();
        if (!isJoditInstanceUsable(jodit)) {
            handle?.remove();
            handle = null;
            if (workTable) clearRowResizeHoverMarkers(workTable);
            return;
        }
        try {
            jodit.__emsRowResizeHover = false;
            if (workTable) clearRowResizeHoverMarkers(workTable);
            if (!jodit.__emsColResizeHover) {
                setBodyCursor(jodit, '');
            }
        } catch {
            /* ignore */
        }
        if (force) {
            handle?.remove();
            handle = null;
            return;
        }
        hideTimeout = window.setTimeout(() => {
            handle?.remove();
            handle = null;
        }, 80);
    };

    jodit.__emsRowResizeHide = hideHandle;

    const beginRowResizeDrag = (clientY) => {
        if (!workTable || resizeRow < 0 || jodit.isLocked) return;
        try {
            jodit.e.fire('hidePopup');
        } catch {
            /* ignore */
        }
        jodit.__emsColResizeHide?.();
        const rows = getTableRows(workTable);
        startHeights = readRowHeightsPx(workTable, rows);
        resizeRowIndices = resolveRowResizeTargetIndices(jodit, getEditorBody, workTable, resizeRow);
        markRowResizeTargetRows(workTable, resizeRowIndices);
        startY = clientY;
        drag = true;
        setRowResizingFlag(workTable, true);
        handle?.classList.add('ems-table-row-resizer_moved');
        jodit.lock('ems-table-row-resize');
        setBodyCursor(jodit, 'row-resize');
        document.body.style.userSelect = 'none';

        const onMove = (ev) => applyResize(ev.clientY - startY);
        const onUp = () => {
            drag = false;
            setRowResizingFlag(workTable, false);
            handle?.classList.remove('ems-table-row-resizer_moved');
            if (workTable) {
                clearRowResizeHoverMarkers(workTable);
                workTable.setAttribute('data-ems-row-heights-custom', '1');
                const rows = getTableRows(workTable);
                const heights = readRowHeightsPx(workTable, rows);
                applyRowHeights(workTable, rows, heights);
            }
            jodit.unlock();
            jodit.e?.off(jodit.ew, 'mousemove.emsRowResize touchmove.emsRowResize', onMove);
            jodit.e?.off(jodit.ow, 'mouseup.emsRowResize touchend.emsRowResize', onUp);
            startHeights = null;
            resizeRowIndices = [];
            setBodyCursor(jodit, '');
            document.body.style.removeProperty('user-select');
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            jodit.s?.focus?.();
        };

        jodit.e.on(jodit.ew, 'mousemove.emsRowResize touchmove.emsRowResize', onMove);
        jodit.e.on(jodit.ow, 'mouseup.emsRowResize touchend.emsRowResize', onUp);
    };

    const ensureHandle = () => {
        if (handle) return;
        if (!isJoditInstanceUsable(jodit)) return;
        const doc = getJoditOwnerDocument(jodit) || document;
        handle = doc.createElement('div');
        handle.className = 'ems-table-row-resizer';
        handle.setAttribute('title', 'Drag to resize row');
        handle.addEventListener('mousedown', onHandleMouseDown, true);
        handle.addEventListener('mouseenter', clearHideTimeout);
    };

    const positionHandleForRow = (table, rowIndex) => {
        const rows = getTableRows(table);
        const tr = rows[rowIndex];
        if (!tr) return;
        ensureHandle();
        const tableRect = table.getBoundingClientRect();
        const rowRect = tr.getBoundingClientRect();
        const lineY = rowRect.bottom;
        handle.style.position = 'fixed';
        handle.style.left = `${Math.round(tableRect.left)}px`;
        handle.style.top = `${Math.round(lineY - TABLE_ROW_RESIZER_HIT_HEIGHT / 2)}px`;
        handle.style.width = `${Math.max(tableRect.width, 20)}px`;
        handle.style.height = `${TABLE_ROW_RESIZER_HIT_HEIGHT}px`;
        handle.style.display = 'block';
        clearHideTimeout();
        getHandleParent()?.appendChild(handle);
        workTable = table;
        resizeRow = rowIndex;
        jodit.__emsRowResizeHover = true;
    };

    const applyResize = (delta) => {
        if (!workTable || resizeRow < 0 || !startHeights) return;
        const rows = getTableRows(workTable);
        const next = [...startHeights];
        const newHeight = Math.max(
            MIN_TABLE_ROW_HEIGHT,
            startHeights[resizeRow] + delta
        );
        const targets =
            resizeRowIndices.length > 0
                ? resizeRowIndices
                : resolveRowResizeTargetIndices(jodit, getEditorBody, workTable, resizeRow);
        targets.forEach((i) => {
            next[i] = newHeight;
        });
        applyRowHeights(workTable, rows, next);
        workTable.setAttribute('data-ems-row-heights-custom', '1');
        markRowResizeTargetRows(workTable, targets);
        positionHandleForRow(workTable, resizeRow);
    };

    const setRowResizingFlag = (table, active) => {
        if (!table) return;
        if (active) {
            table.setAttribute('data-ems-row-resizing', '1');
            jodit.__emsRowResizing = true;
        } else {
            table.removeAttribute('data-ems-row-resizing');
            jodit.__emsRowResizing = false;
        }
    };

    const onHandleMouseDown = (e) => {
        if (!workTable || resizeRow < 0 || jodit.isLocked) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        beginRowResizeDrag(e.clientY);
    };

    const onEditorMouseMove = (event) => {
        if (!isJoditInstanceUsable(jodit)) {
            hideHandle(true);
            return;
        }
        if (jodit.isLocked || drag || jodit.__emsColResizing) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const cell = event.target?.closest?.('td, th');
        if (!cell || !root?.contains(cell)) {
            hideHandle();
            return;
        }
        const table = cell.closest('table');
        if (!table) {
            hideHandle();
            return;
        }
        /* In-cell horizontal/vertical split gutters own the cursor — not row resize. */
        const splitHit = detectInCellSplitResize(table, event.clientX, event.clientY);
        if (splitHit || isEmsTableResizeHandle(event.target)) {
            hideHandle();
            if (splitHit) {
                setBodyCursor(jodit, splitHit.axis === 'h' ? 'row-resize' : 'col-resize');
            }
            return;
        }
        const rowIndex = detectRowResizeIndex(cell, event.clientX, event.clientY);
        if (rowIndex < 0) {
            hideHandle();
            return;
        }
        if (hoverCell !== cell) {
            hoverCell = cell;
        }
        positionHandleForRow(table, rowIndex);
    };

    const onRowMoveLeave = (el) => (event) => {
        if (!isJoditInstanceUsable(jodit)) {
            hideHandle(true);
            return;
        }
        const related = event.relatedTarget;
        if (isEmsTableResizeHandle(related)) return;
        if (related && el.contains(related)) return;
        hideHandle();
    };

    const attachRowResizeListeners = () => {
        if (!isJoditInstanceUsable(jodit)) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const listenerRoot = getEmsTableResizeListenerRoot(jodit, getEditorBody);
        if (listenerRoot && listenerRoot.isConnected === false) return;
        const bindMove = (el) => {
            if (!el || el.__emsRowResizeMoveBound) return;
            el.__emsRowResizeMoveBound = true;
            const leaveFn = onRowMoveLeave(el);
            el.addEventListener('mousemove', onEditorMouseMove);
            el.addEventListener('mouseleave', leaveFn);
            boundMoves.push(
                { el, type: 'mousemove', fn: onEditorMouseMove },
                { el, type: 'mouseleave', fn: leaveFn }
            );
        };
        bindMove(listenerRoot);
        if (root && root !== listenerRoot) bindMove(root);
    };

    jodit.__emsTableRowResizeCleanup = () => {
        clearHideTimeout();
        hideHandle(true);
        boundMoves.forEach(({ el, type, fn }) => {
            try {
                el.removeEventListener(type, fn);
                if (type === 'mousemove') el.__emsRowResizeMoveBound = false;
            } catch {
                /* ignore */
            }
        });
        boundMoves = [];
        try {
            jodit.__emsTableRowResize = false;
            jodit.__emsTableRowResizeCleanup = null;
            jodit.__emsRowResizeHide = null;
            jodit.__emsBindRowResizeListeners = null;
        } catch {
            /* ignore */
        }
    };

    jodit.__emsBindRowResizeListeners = attachRowResizeListeners;
    try {
        jodit.e.off('afterInit.emsRowResizeBind');
        jodit.e.off('beforeDestruct.emsRowResizeBind');
        jodit.e.on('afterInit.emsRowResizeBind', () => {
            if (!isJoditInstanceUsable(jodit)) return;
            requestAnimationFrame(attachRowResizeListeners);
        });
        jodit.e.on('beforeDestruct.emsRowResizeBind', () => {
            try {
                jodit.__emsTableRowResizeCleanup?.();
            } catch {
                /* ignore */
            }
        });
    } catch {
        /* ignore */
    }
    requestAnimationFrame(() => {
        if (isJoditInstanceUsable(jodit)) attachRowResizeListeners();
    });
}

function purgeWorkplaceFloatingChrome(jodit) {
    try {
        jodit.e.fire('hideResizer');
        jodit.e.fire('hideHelpers');
        jodit.e.fire('hidePopup');
    } catch {
        /* ignore */
    }
    const roots = new Set();
    if (jodit.workplace) roots.add(jodit.workplace);
    if (jodit.container) roots.add(jodit.container);
    const workplace = jodit.workplace || jodit.container?.querySelector('.jodit-workplace');
    if (workplace) roots.add(workplace);
    roots.forEach((root) => {
        root.querySelectorAll(FLOATING_CHROME_SELECTOR).forEach((el) => el.remove());
    });
}

/**
 * Word-style table selection:
 * - drag inside one cell → text selection (browser default)
 * - drag across cells → live rectangular cell block (blue)
 * - Shift+click → extend block from anchor cell
 * - click inside an existing multi-cell block → edit text (caret), clear blue boxes
 */
const EMS_CONDITIONAL_TABLE_SEL_VER = 2;

function registerConditionalTableSelection(jodit, getEditorBody) {
    if (!jodit) return;
    const existingRoot =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (
        jodit.__emsConditionalTableSelVer === EMS_CONDITIONAL_TABLE_SEL_VER &&
        existingRoot?.__emsConditionalTableSelBound
    ) {
        return;
    }
    if (jodit.__emsConditionalTableSelCleanup) {
        try {
            jodit.__emsConditionalTableSelCleanup();
        } catch {
            /* ignore */
        }
        jodit.__emsConditionalTableSelCleanup = null;
    }
    jodit.__emsConditionalTableSel = true;
    jodit.__emsConditionalTableSelVer = EMS_CONDITIONAL_TABLE_SEL_VER;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsConditionalTableSelBound) return;
        root.__emsConditionalTableSelBound = true;

        const doc = root.ownerDocument || document;

        const endCellDrag = () => {
            jodit.__emsTableDragTable?.removeAttribute?.('data-ems-cell-selecting');
            jodit.__emsTableCellDragActive = false;
            jodit.__emsTableDragActive = false;
            jodit.__emsTableDragStartCell = null;
            jodit.__emsTableDragTable = null;
            jodit.__emsTableDragCrossedCell = false;
            jodit.__emsTableDragMode = null;
            doc.removeEventListener('mousemove', onDocumentMouseMove, true);
            doc.removeEventListener('mouseup', onDocumentMouseUp, true);
        };

        const onDocumentMouseMove = (e) => {
            if (!jodit.__emsTableCellDragActive || e.buttons !== 1) return;
            if (jodit.__emsColResizing || jodit.__emsRowResizing) return;

            const startCell = jodit.__emsTableDragStartCell;
            const table = jodit.__emsTableDragTable;
            if (!startCell || !table) return;

            const dx = Math.abs(e.clientX - (jodit.__emsTableDragStartX || 0));
            const dy = Math.abs(e.clientY - (jodit.__emsTableDragStartY || 0));
            if (
                jodit.__emsTableDragMode === 'pending' &&
                dx <= EMS_TABLE_CELL_DRAG_THRESHOLD_PX &&
                dy <= EMS_TABLE_CELL_DRAG_THRESHOLD_PX
            ) {
                return;
            }

            const overCell =
                getTableCellAtClientPoint(doc, e.clientX, e.clientY, table) ||
                getTableCellFromNode(e.target);

            if (!overCell) return;

            if (overCell !== startCell) {
                jodit.__emsTableDragMode = 'cells';
                jodit.__emsTableDragCrossedCell = true;
                applyTableCellRangeSelection(jodit, table, startCell, overCell);
            } else if (jodit.__emsTableDragMode === 'pending') {
                jodit.__emsTableDragMode = 'text';
            }
        };

        const onDocumentMouseUp = (e) => {
            if (e.button !== 0) return;
            if (!jodit.__emsTableCellDragActive) return;
            if (jodit.__emsPreserveMultiTableSelect || jodit.__emsSkipTableSelSync) {
                endCellDrag();
                return;
            }

            const startCell = jodit.__emsTableDragStartCell;
            const table = jodit.__emsTableDragTable;
            const endCell =
                (table &&
                    (getTableCellAtClientPoint(doc, e.clientX, e.clientY, table) ||
                        getTableCellFromNode(e.target))) ||
                null;

            if (jodit.__emsTableDragMode === 'cells' && startCell && endCell && table) {
                applyTableCellRangeSelection(jodit, table, startCell, endCell);
            } else if (jodit.__emsTableDragMode !== 'cells') {
                jodit.__emsFormatTableCells = null;
                clearAllTableCellSelection(jodit);
            }

            endCellDrag();
        };

        const startCellDrag = (cell, table, clientX, clientY) => {
            jodit.__emsTableCellDragActive = true;
            jodit.__emsTableDragActive = true;
            jodit.__emsTableDragStartCell = cell;
            jodit.__emsTableDragTable = table;
            jodit.__emsTableDragStartX = clientX;
            jodit.__emsTableDragStartY = clientY;
            jodit.__emsTableDragMode = 'pending';
            jodit.__emsTableDragCrossedCell = false;
            doc.addEventListener('mousemove', onDocumentMouseMove, true);
            doc.addEventListener('mouseup', onDocumentMouseUp, true);
        };

        const onMouseDown = (e) => {
                if (e.button === 2) {
                    const multi = getSelectedTableCells(jodit);
                    const stagedMulti = (jodit.__emsFormatTableCells || []).filter(
                        (c) => c?.isConnected
                    );
                    if (multi.length > 1 || stagedMulti.length > 1) {
                        jodit.__emsPreserveMultiTableSelect = true;
                        jodit.__emsSkipTableSelSync = true;
                        if (stagedMulti.length > 1) {
                            jodit.__emsSplitTableCells = stagedMulti;
                        } else if (multi.length > 1) {
                            jodit.__emsFormatTableCells = multi;
                            jodit.__emsSplitTableCells = multi;
                        }
                        e.stopImmediatePropagation();
                    }
                    return;
                }
                if (e.button !== 0) return;

                const cell = getTableCellFromNode(e.target);
                if (!cell || !root.contains(cell)) {
                    endCellDrag();
                    jodit.__emsActiveTableCell = null;
                    jodit.__emsFormatTableCells = null;
                    jodit.__emsTableSelAnchor = null;
                    clearAllTableCellSelection(jodit);
                    return;
                }

                if (isTableResizeEdgeAtPoint(jodit, cell, e.clientX, e.clientY)) {
                    return;
                }

                const table = cell.closest('table');
                if (!table) return;

                const selected = getSelectedTableCells(jodit);

                // Shift+click: extend rectangular selection from anchor (Word-style).
                if (e.shiftKey && jodit.__emsTableSelAnchor) {
                    const anchor = jodit.__emsTableSelAnchor;
                    if (anchor.isConnected && anchor.closest('table') === table) {
                        e.preventDefault();
                        applyTableCellRangeSelection(jodit, table, anchor, cell);
                        setActiveTableCell(jodit, cell);
                        return;
                    }
                }

                // Click inside highlighted block → place caret and edit text.
                // Keep __emsSplitColumnHint so Split vertically still hits the full block.
                if (
                    selected.length >= 2 &&
                    selectionContainsCell(jodit, cell) &&
                    !e.shiftKey &&
                    !e.ctrlKey &&
                    !e.metaKey
                ) {
                    clearAllTableCellSelection(jodit);
                    jodit.__emsFormatTableCells = null;
                    jodit.__emsTableSelAnchor = cell;
                    setActiveTableCell(jodit, cell);
                    return;
                }

                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    /* Drop stale Description selection when clicking Amount (or any other cell). */
                    clearAllTableCellSelection(jodit);
                    jodit.__emsFormatTableCells = null;
                    jodit.__emsSplitColumnHint = null;
                    jodit.__emsLastMultiCellBlock = null;
                }

                jodit.__emsTableSelAnchor = cell;
                setActiveTableCell(jodit, cell);
                startCellDrag(cell, table, e.clientX, e.clientY);
        };

        root.addEventListener('mousedown', onMouseDown, true);
        jodit.__emsConditionalTableSelCleanup = () => {
            root.removeEventListener('mousedown', onMouseDown, true);
            root.__emsConditionalTableSelBound = false;
            endCellDrag();
        };
    };

    jodit.e.on('afterInit', attach);
    jodit.e.on('afterCommand.emsTableSelSync', (command) => {
        if (TABLE_STRUCTURE_CMD_RE.test(String(command || ''))) {
            scheduleTableSelectionSync(jodit, getEditorBody);
        }
    });
    attach();
}

/** On scroll, hide resize handles so they do not cover the scrollbar (reappear on hover). */
function registerEditorScrollCleanup(jodit, getEditorBody) {
    if (!jodit || jodit.__emsEditorScrollCleanup) return;
    jodit.__emsEditorScrollCleanup = true;

    const hideFloatingHandles = () => {
        purgeWorkplaceFloatingChrome(jodit);
        hideTableResizeHandles(jodit, { force: true });
    };

    const bind = () => {
        const workplace = jodit.container?.querySelector('.jodit-workplace');
        const wysiwyg =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (workplace && !workplace.__emsScrollCleanupBound) {
            workplace.__emsScrollCleanupBound = true;
            workplace.addEventListener('scroll', hideFloatingHandles, { passive: true });
        }
        if (wysiwyg && wysiwyg !== workplace && !wysiwyg.__emsScrollCleanupBound) {
            wysiwyg.__emsScrollCleanupBound = true;
            wysiwyg.addEventListener('scroll', hideFloatingHandles, { passive: true });
        }
    };

    jodit.e.on('afterInit', bind);
    bind();
}

function isRowInThead(tr) {
    return Boolean(tr?.closest?.('thead'));
}

function getTableBodyRows(table) {
    const tbody = table.querySelector('tbody');
    if (tbody) return [...tbody.querySelectorAll(':scope > tr')];
    return [...table.querySelectorAll('tr')].filter((tr) => !tr.closest('thead'));
}

function ensureTableSections(table) {
    const doc = table.ownerDocument || document;
    let thead = table.querySelector('thead');
    let tbody = table.querySelector('tbody');

    const looseRows = [...table.children].filter((el) => el.tagName === 'TR');

    if (!tbody) {
        tbody = doc.createElement('tbody');
        table.appendChild(tbody);
    }

    looseRows.forEach((tr) => {
        if (!tr.closest('thead') && !tr.closest('tbody')) {
            tbody.appendChild(tr);
        }
    });

    if (!thead) {
        thead = doc.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    return { thead, tbody };
}

function convertCellToTh(cell) {
    if (!cell || cell.tagName === 'TH') return cell;
    const th = cell.ownerDocument.createElement('th');
    [...cell.attributes].forEach((a) => th.setAttribute(a.name, a.value));
    th.innerHTML = cell.innerHTML;
    cell.replaceWith(th);
    return th;
}

function convertCellToTd(cell) {
    if (!cell || cell.tagName === 'TD') return cell;
    const td = cell.ownerDocument.createElement('td');
    [...cell.attributes].forEach((a) => td.setAttribute(a.name, a.value));
    td.innerHTML = cell.innerHTML;
    cell.replaceWith(td);
    return td;
}

function convertRowCellsToHeader(tr) {
    [...tr.cells].forEach(convertCellToTh);
}

function convertRowCellsToBody(tr) {
    [...tr.cells].forEach(convertCellToTd);
}

function canToggleRepeatHeaderRows(jodit, getEditorBody) {
    return getSelectedTableRows(jodit, getEditorBody).length > 0;
}

function isRepeatHeaderSelectionActive(jodit, getEditorBody) {
    const rows = getSelectedTableRows(jodit, getEditorBody);
    if (!rows.length) return false;
  /** Active when every selected row is already in thead (Word-style toggle). */
    return rows.every(isRowInThead);
}

function syncRepeatHeaderAttribute(table) {
    if (!table) return;
    if (table.querySelector('thead tr')) {
        table.setAttribute('data-ems-repeat-header', '1');
    } else {
        table.removeAttribute('data-ems-repeat-header');
    }
}

/** Move selected top row(s) into <thead> for print/PDF repeat — like Word “Repeat header rows”. */
export function toggleRepeatHeaderRows(jodit, getEditorBody) {
    const rows = getSelectedTableRows(jodit, getEditorBody);
    if (!rows.length) return false;

    const table = rows[0].closest('table');
    if (!table) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    const { thead, tbody } = ensureTableSections(table);
    const allSelectedInThead = rows.every(isRowInThead);

    if (allSelectedInThead) {
        [...rows].forEach((tr) => {
            convertRowCellsToBody(tr);
            tbody.insertBefore(tr, tbody.firstChild);
        });
        if (!thead.querySelector('tr')) {
            thead.remove();
        }
        syncRepeatHeaderAttribute(table);
    } else {
        const bodyRows = getTableBodyRows(table);
        const indices = rows.map((r) => bodyRows.indexOf(r));
        if (indices.some((i) => i < 0)) {
            window.alert('Select row(s) at the top of the table body to repeat as header.');
            return false;
        }
        indices.sort((a, b) => a - b);
        if (indices[0] !== 0) {
            window.alert('Header rows must start at the first row below any existing header.');
            return false;
        }
        for (let i = 1; i < indices.length; i += 1) {
            if (indices[i] !== indices[i - 1] + 1) {
                window.alert('Select consecutive rows at the top of the table.');
                return false;
            }
        }
        rows.forEach((tr) => {
            convertRowCellsToHeader(tr);
            thead.appendChild(tr);
        });
        syncRepeatHeaderAttribute(table);
    }

    harmonizeInsertedTableCells(root || table.parentElement);
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

/** Unwrap `<p>/<div>` that only contain a table — Jodit adds spacing that shifts layout on exit. */
export function unwrapClauseEditorTablesForExport(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('p, div').forEach((wrapper) => {
        if (wrapper.closest('td, th')) return;
        if (wrapper.childElementCount !== 1) return;
        const only = wrapper.firstElementChild;
        if (only?.tagName !== 'TABLE') return;
        wrapper.replaceWith(only);
    });
}

/** Keep table px model + margins stable when syncing editor HTML to preview. */
export function stabilizeClauseEditorTablesForExport(root) {
    if (!root?.querySelectorAll) return;
    unwrapClauseEditorTablesForExport(root);
    root.querySelectorAll('table').forEach((table) => {
        const keepUserCols =
            table.getAttribute('data-ems-col-widths-custom') === '1' ||
            table.getAttribute('data-ems-edit-cols-locked') === '1';
        table.removeAttribute('data-ems-edit-cols-locked');
        const rows = getTableRows(table);
        if (!rows.length) return;
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            // Always re-fit from live layout so single-line rows bake as 24px into saved HTML.
            if (!table.hasAttribute('data-ems-row-heights-custom')) {
                fitEmsPricingSummaryTableRowHeights(table, { allowMeasure: true });
            } else {
                applyTableRowHeightModel(table);
            }
            return;
        }
        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (keepUserCols) {
            const stored = parseStoredOfficeTableColumnWidths(table).filter((w) => w > 0);
            if (stored.length) {
                const model =
                    colCount > 0 && stored.length >= colCount
                        ? stored.slice(0, colCount)
                        : stored.slice();
                applyColumnWidths(table, rows, model);
                table.setAttribute('data-ems-col-widths-custom', '1');
            }
        } else if (colCount && table.getAttribute('data-ems-col-widths')) {
            const widths = readColumnWidthsPx(table, rows, colCount);
            applyColumnWidths(table, rows, widths);
        }
        /* Office rows already have a baked height model — rewriting every row on exit is the stall. */
        if (
            !table.hasAttribute('data-ems-row-heights') &&
            !table.hasAttribute('data-ems-row-heights-custom')
        ) {
        applyTableRowHeightModel(table);
        }
        const mt = table.style.marginTop;
        const mb = table.style.marginBottom;
        if (!mt) table.style.marginTop = '4px';
        if (!mb) table.style.marginBottom = '4px';
    });
    /* Bake H/V split gutters + H pane borders into committed HTML (survive exit-edit). */
    bakeEmsCellSplitsInRoot(root);
}

/** Read live computed type from a source cell (must be attached in the editor). */
function readCellTypography(src) {
    const win = src?.ownerDocument?.defaultView;
    if (!src || !win?.getComputedStyle) return null;
    try {
        const cs = win.getComputedStyle(src);
        return {
            fontSize: (cs.fontSize || '').trim(),
            fontFamily: (cs.fontFamily || '').trim(),
            color: (cs.color || '').trim(),
            fontWeight: (cs.fontWeight || '').trim(),
            fontStyle: (cs.fontStyle || '').trim(),
            textAlign: (cs.textAlign || '').trim(),
            verticalAlign: (cs.verticalAlign || '').trim(),
            lineHeight: (cs.lineHeight || '').trim(),
        };
    } catch {
        return null;
    }
}

/** Apply source typography onto dest cell + text runs so paste matches the copied row. */
function applyTypographyToCell(dest, typo) {
    if (!dest || !typo) return;
    const apply = (el, asCell) => {
        if (!el?.style) return;
        if (typo.fontSize) el.style.setProperty('font-size', typo.fontSize);
        if (typo.fontFamily) el.style.setProperty('font-family', typo.fontFamily);
        if (typo.color) el.style.setProperty('color', typo.color);
        if (typo.lineHeight && typo.lineHeight !== 'normal') {
            el.style.setProperty('line-height', typo.lineHeight);
        }
        if (asCell) {
            if (typo.fontWeight && typo.fontWeight !== '400' && typo.fontWeight !== 'normal') {
                el.style.setProperty('font-weight', typo.fontWeight);
            }
            if (typo.fontStyle && typo.fontStyle !== 'normal') {
                el.style.setProperty('font-style', typo.fontStyle);
            }
            if (typo.textAlign && typo.textAlign !== 'start') {
                el.style.setProperty('text-align', typo.textAlign);
            }
            if (typo.verticalAlign && typo.verticalAlign !== 'baseline') {
                el.style.setProperty('vertical-align', typo.verticalAlign);
            }
        }
    };
    apply(dest, true);
    dest.querySelectorAll?.('p, div, span, font, li, b, strong, i, em, u, a').forEach((el) => {
        apply(el, false);
    });
}

/** Bake live computed type into a clipboard clone so OS HTML keeps the source size. */
function bakeLiveCellTypography(src, clone) {
    const typo = readCellTypography(src);
    if (typo) applyTypographyToCell(clone, typo);
}

function sanitizeClonedTableCell(cell) {
    const clone = cell.cloneNode(true);
    if (clone.classList) {
        clone.classList.remove('jodit-table__selected-cell', 'jodit_selected_cell', EMS_TABLE_CELL_SELECTED_CLASS);
    }
    clone.removeAttribute?.('data-jodit-selected-cell');
    /* Drop selection overlay styles so Amount paste does not look like a navy header block. */
    if (clone.style) {
        clone.style.removeProperty('outline');
        clone.style.removeProperty('outline-offset');
        clone.style.removeProperty('box-shadow');
        const bg = String(clone.style.backgroundColor || clone.style.background || '').toLowerCase();
        if (/rgba?\(\s*30\s*,\s*136\s*,\s*229/i.test(bg) || /#1e88e5|#1565c0/i.test(bg)) {
            clone.style.removeProperty('background');
            clone.style.removeProperty('background-color');
        }
    }
    bakeLiveCellTypography(cell, clone);
    return clone;
}

/** True when selection is a single logical cell (copy Amount → paste Amount). */
function isSingleCellTableSelection(ctx) {
    if (!ctx?.bound || !ctx.cells?.length) return false;
    const [r0, c0] = ctx.bound[0];
    const [r1, c1] = ctx.bound[1];
    return r0 === r1 && c0 === c1;
}

function escapeHtmlPlain(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildSingleCellClipboardPayload(cell) {
    if (!cell) return null;
    const clone = sanitizeClonedTableCell(cell);
    const plain = String(cell.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const inner = clone.innerHTML || '';
    /* Not a <table> — paste must not take the office-table insert path (nested navy block). */
    const html = `<html xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><!--StartFragment--><div data-ems-cell-clip="1">${inner}</div><!--EndFragment--></body></html>`;
    return { html, plain, inner };
}

/**
 * Paste a multi-cell clipboard into the existing table grid (Excel-style).
 * Avoids nested tables and keeps font size/color matched to neighboring body cells.
 */
export function pasteClipboardTableIntoActiveTable(
    jodit,
    getEditorBody,
    clipboardData,
    eventTarget = null
) {
    if (!jodit || !clipboardData) return false;
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
    const fromEvent = getTableCellFromNode(eventTarget);
    const anchor =
        (fromEvent && (!root || root.contains(fromEvent)) && fromEvent) ||
        getActiveTableCell(jodit, getEditorBody);
    if (!anchor || (root && !root.contains(anchor))) return false;
    const table = anchor.closest('table');
    if (!table) return false;

    const htmlRaw = String(clipboardData.getData?.('text/html') || '');
    const plain = String(clipboardData.getData?.('text/plain') || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    if (htmlRaw.includes('data-ems-cell-clip')) return false;

    const gridCells = parseClipboardHtmlToCellGrid(htmlRaw) || parseClipboardTsvToCellGrid(plain);
    if (!gridCells?.length) return false;
    if (gridCells.length === 1 && gridCells[0].length === 1) return false;

    const { grid } = buildTableCellGrid(table);
    const pos = findCellGridPosition(grid, anchor);
    if (!pos) return false;

    /* Prefer exact live snapshot from last EMS copy (same font size/format as source). */
    const liveGrid = jodit.__emsLastGridClip;
    const useLive =
        liveGrid?.cells?.length &&
        Date.now() - (liveGrid.at || 0) < 120000 &&
        liveGrid.cells.length === gridCells.length &&
        liveGrid.cells[0]?.length === gridCells[0]?.length;

    const touched = [];
    for (let r = 0; r < gridCells.length; r += 1) {
        const row = gridCells[r];
        for (let c = 0; c < row.length; c += 1) {
            const dest = grid[pos.row + r]?.[pos.col + c];
            const src = row[c];
            if (!dest || !src) continue;
            const live = useLive ? liveGrid.cells[r]?.[c] : null;
            dest.innerHTML = live?.innerHTML != null ? live.innerHTML : src.innerHTML;
            const styleAttr = live?.styleAttr || src.styleAttr || '';
            if (styleAttr) dest.setAttribute('style', styleAttr);
            else dest.removeAttribute('style');
            ['align', 'valign', 'data-ems-valign'].forEach((attr) => {
                const val = live?.attrs?.[attr] ?? src.attrs?.[attr];
                if (val != null) dest.setAttribute(attr, val);
            });
            if (live?.typo) applyTypographyToCell(dest, live.typo);
            touched.push(dest);
        }
    }
    if (!touched.length) return false;

    jodit.__emsSkipHeavyPasteCleanup = true;
    setActiveTableCell(jodit, touched[touched.length - 1] || anchor);
    try {
        focusTableCell(touched[touched.length - 1] || anchor, jodit, true);
    } catch {
        /* ignore */
    }
    if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
    jodit.e?.fire?.('change');
    return true;
}

function parseClipboardHtmlToCellGrid(htmlRaw) {
    if (!htmlRaw || !/<table[\s>]/i.test(htmlRaw)) return null;
    try {
        const doc = new DOMParser().parseFromString(
            `<div id="__ems_table_paste_grid">${htmlRaw}</div>`,
            'text/html'
        );
        const wrap = doc.getElementById('__ems_table_paste_grid');
        const tables = [...(wrap?.querySelectorAll?.('table') || [])];
        if (!tables.length) return null;
        const srcTable = tables[0];
        const rows = [...srcTable.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
        if (!rows.length) return null;
        const grid = rows.map((tr) =>
            [...tr.cells].map((cell) => ({
                innerHTML: cell.innerHTML || '',
                styleAttr: cell.getAttribute('style') || '',
                attrs: {
                    align: cell.getAttribute('align'),
                    valign: cell.getAttribute('valign'),
                    'data-ems-valign': cell.getAttribute('data-ems-valign'),
                },
            }))
        );
        const maxCols = Math.max(0, ...grid.map((r) => r.length));
        if (!maxCols || (grid.length === 1 && maxCols === 1)) return null;
        return grid;
    } catch {
        return null;
    }
}

/** Full inner HTML of an EMS cell copy. A regex stops at the first nested </div> and pastes nothing. */
function extractEmsCellClipInner(htmlRaw) {
    if (!htmlRaw || !/data-ems-cell-clip/i.test(htmlRaw)) return '';
    try {
        const doc = new DOMParser().parseFromString(String(htmlRaw), 'text/html');
        const clip = doc.querySelector('[data-ems-cell-clip]');
        return clip ? String(clip.innerHTML || '') : '';
    } catch {
        return '';
    }
}

function plainTextMatchesCellClip(plain, clipPlain) {
    const norm = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const a = norm(plain);
    const b = norm(clipPlain);
    return Boolean(a && b && a === b);
}

function parseClipboardTsvToCellGrid(plain) {
    const text = String(plain || '').trim();
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return null;
    const lines = text.split('\n').filter((line) => line.length);
    if (!lines.length) return null;
    const grid = lines.map((line) =>
        line.split('\t').map((value) => ({
            innerHTML: escapeHtmlPlain(value.trim()),
            styleAttr: '',
            attrs: {},
        }))
    );
    if (grid.length === 1 && grid[0].length === 1) return null;
    return grid;
}

/**
 * Insert pasted HTML at the caret inside the cell.
 * If text is selected, replace only that selection; the rest of the cell stays.
 * Collapsed caret: insert at the caret without clearing the cell.
 */
function insertHtmlAtCellCaret(cell, html, jodit) {
    const doc = cell?.ownerDocument;
    if (!doc || !html) return false;
    const win = doc.defaultView || window;
    const sel = win.getSelection?.();
    let range = null;
    if (sel && sel.rangeCount) {
        const current = sel.getRangeAt(0);
        const node = current.commonAncestorContainer;
        const el = node?.nodeType === 1 ? node : node?.parentNode;
        if (el && cell.contains(el)) range = current.cloneRange();
    }
    if (!range) {
        range = doc.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
    } else if (!range.collapsed) {
        /* Replace the highlighted run only — do not clear the whole cell. */
        range.deleteContents();
    }
    const holder = doc.createElement('div');
    holder.innerHTML = html;
    if (!holder.childNodes.length) return false;
    const frag = doc.createDocumentFragment();
    let last = null;
    while (holder.firstChild) {
        last = holder.firstChild;
        frag.appendChild(last);
    }
    range.insertNode(frag);
    if (last && sel) {
        const after = doc.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
    }
    if (jodit) setActiveTableCell(jodit, cell);
    return true;
}

/** Paste clipboard HTML/text into one cell (replace selection, or insert at caret). */
export function pasteClipboardIntoActiveTableCell(
    jodit,
    getEditorBody,
    clipboardData,
    eventTarget = null
) {
    if (!jodit || !clipboardData) return false;
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
    /* Paste event target wins — more reliable than stale caret when clicking Amount then Ctrl+V. */
    const fromEvent = getTableCellFromNode(eventTarget);
    const cell =
        (fromEvent && (!root || root.contains(fromEvent)) && fromEvent) ||
        getActiveTableCell(jodit, getEditorBody);
    if (!cell) return false;
    if (root && !root.contains(cell)) return false;

    /* Multi-cell / row paste into the same table — keep format via grid fill. */
    if (pasteClipboardTableIntoActiveTable(jodit, getEditorBody, clipboardData, eventTarget)) {
        return true;
    }

    const htmlRaw = String(clipboardData.getData?.('text/html') || '');
    const plain = String(clipboardData.getData?.('text/plain') || '')
        .replace(/\u00a0/g, ' ')
        .trim();
    const lastClip = jodit.__emsLastCellClip;
    const lastClipFresh =
        lastClip &&
        typeof lastClip.plain === 'string' &&
        Date.now() - (lastClip.at || 0) < 120000;
    const tdCount = (htmlRaw.match(/<t[dh][\s>]/gi) || []).length;
    const looksLikeMultiCellTable =
        /<table[\s>]/i.test(htmlRaw) && tdCount > 1;

    let inner = extractEmsCellClipInner(htmlRaw);
    if (
        !inner &&
        lastClipFresh &&
        (!plain || plainTextMatchesCellClip(plain, lastClip.plain))
    ) {
        /* Keep source formatting (red / bold). Nested cell HTML is not on the plain clipboard. */
        inner = lastClip.inner || escapeHtmlPlain(lastClip.plain || '');
    } else if (!inner && htmlRaw && /<table[\s>]/i.test(htmlRaw) && tdCount === 1) {
        try {
            const doc = new DOMParser().parseFromString(
                `<div id="__ems_cell_paste">${htmlRaw}</div>`,
                'text/html'
            );
            const wrap = doc.getElementById('__ems_cell_paste');
            const tables = [...(wrap?.querySelectorAll?.('table') || [])];
            const tds = tables.length === 1 ? [...tables[0].querySelectorAll('td, th')] : [];
            if (tds.length === 1) {
                inner = tds[0].innerHTML || '';
            }
        } catch {
            /* fall through */
        }
    }

    if (!inner) {
        const lines = plain.split(/\r?\n/).filter((line) => line.trim().length);
        const multiColumn = plain.includes('\t') || (looksLikeMultiCellTable && lines.length > 1);
        /* A whole-row / multi-cell clipboard may insert a table. One cell, even with several lines, stays in this cell. */
        if (!plain || multiColumn) {
            if (lastClipFresh && (looksLikeMultiCellTable || plainTextMatchesCellClip(plain, lastClip.plain))) {
                inner = lastClip.inner || escapeHtmlPlain(lastClip.plain || '');
            } else {
                return false;
            }
        } else {
            inner = escapeHtmlPlain(plain).replace(/\r?\n/g, '<br>');
        }
    }
    if (!inner) return false;

    if (!insertHtmlAtCellCaret(cell, inner, jodit)) return false;
    jodit.__emsSkipHeavyPasteCleanup = true;
    try {
        focusTableCell(cell, jodit, false);
    } catch {
        /* ignore */
    }
    if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
    jodit.e?.fire?.('change');
    return true;
}

function cloneTableRowForClipboard(tr) {
    const doc = tr.ownerDocument;
    const clone = doc.createElement('tr');
    [...tr.attributes].forEach((attr) => {
        if (attr.name === 'class' && /jodit/i.test(attr.value)) return;
        clone.setAttribute(attr.name, attr.value);
    });
    [...tr.cells].forEach((cell) => {
        clone.appendChild(sanitizeClonedTableCell(cell));
    });
    return clone;
}

function copyCellPresentation(src, dest) {
    if (!src || !dest) return;
    dest.innerHTML = src.innerHTML;
    if (src.getAttribute('style')) {
        dest.setAttribute('style', src.getAttribute('style'));
    } else {
        dest.removeAttribute('style');
    }
    ['colspan', 'rowspan', 'data-ems-valign', 'valign', 'align'].forEach((attr) => {
        const val = src.getAttribute(attr);
        if (val != null) dest.setAttribute(attr, val);
        else dest.removeAttribute(attr);
    });
}

function getTableSelectionBounds(jodit, getEditorBody) {
    const activeCell = getActiveTableCell(jodit, getEditorBody);
    const cells = getSelectedTableCells(jodit);
    let workCells = cells;
    /*
     * Prefer the clicked/active cell for single-cell copy. Keep true multi-cell blocks.
     * If a stale Description selection remains while Amount was clicked, copy Amount.
     */
    if (activeCell) {
        if (cells.length <= 1) {
            workCells = [activeCell];
        } else if (!cells.includes(activeCell)) {
            workCells = [activeCell];
        }
    } else if (!workCells.length) {
        return null;
    }
    const table = workCells[0]?.closest?.('table');
    if (!table) return null;
    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return null;
    const bound = tableModule.getSelectedBound(table, workCells);
    const { grid } = buildTableCellGrid(table);
    const rowCount = grid.length;
    const colCount = Math.max(0, ...grid.map((row) => row.length));
    if (!rowCount || !colCount) return null;
    const fullRows =
        cells.length >= 2 && bound[0][1] === 0 && bound[1][1] >= colCount - 1;
    const fullColumns =
        cells.length >= 2 && bound[0][0] === 0 && bound[1][0] >= rowCount - 1;
    return {
        table,
        cells: workCells,
        bound,
        rowCount,
        colCount,
        grid,
        fullRows,
        fullColumns,
    };
}

function cloneTableShellForClipboard(srcTable, doc) {
    const out = doc.createElement('table');
    ['style', 'border', 'cellpadding', 'cellspacing', 'width', 'data-ems-paste-source', 'data-ems-pricing-cols'].forEach(
        (attr) => {
            const val = srcTable.getAttribute(attr);
            if (val != null) out.setAttribute(attr, val);
        }
    );
    const colgroup = srcTable.querySelector(':scope > colgroup');
    if (colgroup) out.appendChild(colgroup.cloneNode(true));
    return out;
}

function buildTableFragmentFromSelection(ctx) {
    const { table, bound, grid } = ctx;
    const [rowStart, colStart] = bound[0];
    const [rowEnd, colEnd] = bound[1];
    if (rowStart > rowEnd || colStart > colEnd) return null;

    const doc = table.ownerDocument || document;
    const outTable = cloneTableShellForClipboard(table, doc);

    for (let r = rowStart; r <= rowEnd; r += 1) {
        const srcRow = grid[r]?.[colStart]?.closest?.('tr') || grid[r]?.[0]?.closest?.('tr');
        const tr = doc.createElement('tr');
        if (srcRow) {
            [...srcRow.attributes].forEach((attr) => {
                if (attr.name === 'class' && /jodit/i.test(attr.value)) return;
                tr.setAttribute(attr.name, attr.value);
            });
        }

        for (let c = colStart; c <= colEnd; c += 1) {
            const cell = grid[r]?.[c];
            if (!cell) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos) continue;

            const emitRow = Math.max(pos.row, rowStart);
            const emitCol = Math.max(pos.col, colStart);
            if (r !== emitRow || c !== emitCol) continue;

            const clone = sanitizeClonedTableCell(cell);
            const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
            const colSpan = Math.max(1, Number(cell.colSpan) || 1);
            const effRowSpan = Math.min(rowEnd - emitRow + 1, pos.row + rowSpan - emitRow);
            const effColSpan = Math.min(colEnd - emitCol + 1, pos.col + colSpan - emitCol);

            if (effRowSpan > 1) clone.setAttribute('rowspan', String(effRowSpan));
            else clone.removeAttribute('rowspan');
            if (effColSpan > 1) clone.setAttribute('colspan', String(effColSpan));
            else clone.removeAttribute('colspan');

            tr.appendChild(clone);
        }

        if (tr.cells.length) outTable.appendChild(tr);
    }

    if (!outTable.querySelector('tr')) return null;
    applyDefaultManualTableBordersIfEmpty(outTable);
    return outTable;
}

function escapeTsvCell(text) {
    const t = String(text ?? '');
    if (/[\t\n\r"]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
}

function buildTableSelectionTsv(ctx) {
    const { bound, grid } = ctx;
    const [rowStart, colStart] = bound[0];
    const [rowEnd, colEnd] = bound[1];
    const lines = [];
    for (let r = rowStart; r <= rowEnd; r += 1) {
        const cols = [];
        for (let c = colStart; c <= colEnd; c += 1) {
            const cell = grid[r]?.[c];
            if (!cell) {
                cols.push('');
                continue;
            }
            const pos = findCellGridPosition(grid, cell);
            if (pos && pos.row === r && pos.col === c) {
                cols.push(
                    escapeTsvCell(String(cell.textContent || '').replace(/\u00a0/g, ' ').trim())
                );
            } else {
                cols.push('');
            }
        }
        lines.push(cols.join('\t'));
    }
    return lines.join('\n');
}

function wrapClipboardHtml(tableHtml) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><!--StartFragment-->${tableHtml}<!--EndFragment--></body></html>`;
}

function buildTableClipboardPayload(ctx, win) {
    if (isSingleCellTableSelection(ctx)) {
        const cell =
            ctx.cells[0] ||
            ctx.grid?.[ctx.bound[0][0]]?.[ctx.bound[0][1]] ||
            null;
        const single = buildSingleCellClipboardPayload(cell);
        if (single) return single;
    }

    const fragment = buildTableFragmentFromSelection(ctx);
    if (!fragment) return null;

    const wrapper = fragment.ownerDocument.createElement('div');
    wrapper.appendChild(fragment);
    stabilizeClauseEditorTablesForExport(wrapper);
    /* Skip finalize on tiny clips — it treated the only row as a pricing header (navy/white). */
    if (!isSingleCellTableSelection(ctx)) {
    finalizeAllOfficePasteTablesFormatting(wrapper, win || window);
    }

    const tableHtml = fragment.outerHTML;
    return {
        html: wrapClipboardHtml(tableHtml),
        plain: buildTableSelectionTsv(ctx),
    };
}

function shouldUseNativeTextCopy(jodit, getEditorBody, ctx) {
    if (!ctx || ctx.cells.length !== 1) return false;
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit?.editor || null;
    const win = root?.ownerDocument?.defaultView || window;
    const sel = win.getSelection?.();
    if (!sel || sel.isCollapsed || !String(sel.toString() || '').length) return false;
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    const cell = ctx.cells[0];
    if (!range || !cell) return false;
    return cell.contains(range.commonAncestorContainer);
}

function writeTableClipboardPayload(payload, clipboardData) {
    if (!payload) return false;
    if (clipboardData) {
        clipboardData.setData('text/html', payload.html);
        clipboardData.setData('text/plain', payload.plain);
        return true;
    }
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        navigator.clipboard
            .write([
                new ClipboardItem({
                    'text/html': new Blob([payload.html], { type: 'text/html' }),
                    'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
                }),
            ])
            .catch((err) => {
                console.warn('[EMS] Table clipboard write failed:', err);
            });
        return true;
    }
    return false;
}

function copyTableSelectionToOsClipboard(jodit, getEditorBody, clipboardData) {
    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit?.editor || null;
    const ctx = getTableSelectionBounds(jodit, getEditorBody);
    if (!ctx || !root) return false;
    if (shouldUseNativeTextCopy(jodit, getEditorBody, ctx)) {
        const srcCell = ctx.cells?.[0] || null;
        const sel = (root.ownerDocument?.defaultView || window).getSelection?.();
        const text = String(sel?.toString() || '');
        jodit.__emsLastCellClip = {
            plain: text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(),
            inner: escapeHtmlPlain(text).replace(/\r?\n/g, '<br>'),
            typo: srcCell ? readCellTypography(srcCell) : null,
            at: Date.now(),
        };
        jodit.__emsLastGridClip = null;
        jodit.__emsTableClipboard = null;
        return false;
    }

    const win = root.ownerDocument?.defaultView || window;
    const payload = buildTableClipboardPayload(ctx, win);
    if (!payload) return false;

    if (isSingleCellTableSelection(ctx) || payload.html?.includes?.('data-ems-cell-clip')) {
        const srcCell = ctx.cells?.[0] || null;
        jodit.__emsLastCellClip = {
            plain: payload.plain || '',
            inner: payload.inner != null ? payload.inner : payload.plain || '',
            typo: srcCell ? readCellTypography(srcCell) : null,
            at: Date.now(),
        };
        jodit.__emsLastGridClip = null;
        /* A leftover row copy must not turn the next Ctrl+V into a new table row. */
        jodit.__emsTableClipboard = null;
    } else {
        /* Multi-cell / row copy must not reuse a prior Amount single-cell clip. */
        jodit.__emsLastCellClip = null;
        jodit.__emsLastGridClip = snapshotGridClipFromSelection(ctx);
    }

    if (clipboardData) {
        return writeTableClipboardPayload(payload, clipboardData);
    }
    return writeTableClipboardPayload(payload, null);
}

/** Live DOM snapshot for in-table paste — HTML + computed font size/format from source. */
function snapshotGridClipFromSelection(ctx) {
    if (!ctx?.bound || !ctx.grid) return null;
    const [rowStart, colStart] = ctx.bound[0];
    const [rowEnd, colEnd] = ctx.bound[1];
    const cells = [];
    for (let r = rowStart; r <= rowEnd; r += 1) {
        const row = [];
        for (let c = colStart; c <= colEnd; c += 1) {
            const cell = ctx.grid[r]?.[c];
            if (!cell) {
                row.push(null);
                continue;
            }
            const clone = sanitizeClonedTableCell(cell);
            row.push({
                innerHTML: clone.innerHTML || '',
                styleAttr: clone.getAttribute('style') || '',
                typo: readCellTypography(cell),
                attrs: {
                    align: cell.getAttribute('align'),
                    valign: cell.getAttribute('valign'),
                    'data-ems-valign': cell.getAttribute('data-ems-valign'),
                },
            });
        }
        cells.push(row);
    }
    return { cells, at: Date.now() };
}

function extractRowsForClipboard(table, rowStart, rowEnd) {
    const rows = getTableRows(table);
    const out = [];
    for (let i = rowStart; i <= rowEnd; i += 1) {
        const tr = rows[i];
        if (tr) out.push(cloneTableRowForClipboard(tr));
    }
    return out;
}

function extractColumnsForClipboard(table, colStart, colEnd) {
    const { grid } = buildTableCellGrid(table);
    const slices = [];
    for (let c = colStart; c <= colEnd; c += 1) {
        const columnCells = [];
        const seen = new Set();
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[c];
            if (!cell || seen.has(cell)) continue;
            const pos = findCellGridPosition(grid, cell);
            if (!pos || pos.col !== c) continue;
            seen.add(cell);
            columnCells.push(sanitizeClonedTableCell(cell));
        }
        slices.push(columnCells);
    }
    return slices;
}

function setTableClipboard(jodit, payload) {
    jodit.__emsTableClipboard = payload;
}

function getTableClipboard(jodit) {
    return jodit.__emsTableClipboard || null;
}

function copyTableRows(jodit, getEditorBody, cut = false) {
    const ctx = getTableSelectionBounds(jodit, getEditorBody);
    if (!ctx) return false;
    const [rowStart] = ctx.bound[0];
    const [rowEnd] = ctx.bound[1];
    const useRows =
        ctx.fullRows || (ctx.cells.length === 1 && rowStart === rowEnd);
    if (!useRows) return false;

    const rowClones = extractRowsForClipboard(ctx.table, rowStart, rowEnd);
    if (!rowClones.length) return false;

    setTableClipboard(jodit, {
        kind: 'rows',
        rowClones,
        colWidths: ctx.table.getAttribute('data-ems-col-widths') || '',
    });

    if (cut) {
        const tm = getJoditTableModule(jodit);
        const rows = getTableRows(ctx.table);
        for (let i = rowEnd; i >= rowStart; i -= 1) {
            if (rows[i]) tm?.removeRow(ctx.table, i);
        }
        clearAllTableCellSelection(jodit);
        harmonizeInsertedTableCells(
            (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor
        );
    }

    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

function copyTableColumns(jodit, getEditorBody, cut = false) {
    const ctx = getTableSelectionBounds(jodit, getEditorBody);
    if (!ctx) return false;
    const [, colStart] = ctx.bound[0];
    const [, colEnd] = ctx.bound[1];
    const useCols =
        ctx.fullColumns || (ctx.cells.length === 1 && colStart === colEnd);
    if (!useCols) return false;

    const columnSlices = extractColumnsForClipboard(ctx.table, colStart, colEnd);
    if (!columnSlices.length) return false;

    setTableClipboard(jodit, {
        kind: 'columns',
        columnSlices,
    });

    if (cut) {
        const tm = getJoditTableModule(jodit);
        for (let c = colEnd; c >= colStart; c -= 1) {
            tm?.removeColumn(ctx.table, c);
        }
        clearAllTableCellSelection(jodit);
        harmonizeInsertedTableCells(
            (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor
        );
    }

    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

function pasteTableRows(jodit, getEditorBody) {
    const clip = getTableClipboard(jodit);
    if (!clip?.kind || clip.kind !== 'rows' || !clip.rowClones?.length) return false;

    const cell = getActiveTableCell(jodit, getEditorBody);
    const table = cell?.closest?.('table');
    const anchorRow = cell?.closest?.('tr');
    if (!table || !anchorRow) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    let insertAfter = anchorRow;
    const inserted = [];
    clip.rowClones.forEach((rowClone) => {
        const next = rowClone.cloneNode(true);
        insertAfter.parentNode?.insertBefore(next, insertAfter.nextSibling);
        insertAfter = next;
        inserted.push(next);
    });
    jodit.__emsSkipHeavyPasteCleanup = true;

    harmonizeInsertedTableCells(root || table.parentElement);
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

function pasteTableColumns(jodit, getEditorBody) {
    const clip = getTableClipboard(jodit);
    if (!clip?.kind || clip.kind !== 'columns' || !clip.columnSlices?.length) return false;

    const anchorCell = getActiveTableCell(jodit, getEditorBody);
    const table = anchorCell?.closest?.('table');
    if (!table || !anchorCell) return false;

    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    let refCell = anchorCell;
    clip.columnSlices.forEach((columnCells) => {
        tableModule.appendColumn(table, refCell, true);
        const { grid } = buildTableCellGrid(table);
        const pos = findCellGridPosition(grid, refCell);
        if (!pos) return;
        const newCol = pos.col + 1;
        columnCells.forEach((src, offset) => {
            const dest = grid[pos.row + offset]?.[newCol];
            if (dest && src) copyCellPresentation(src, dest);
        });
        refCell = grid[pos.row]?.[newCol] || refCell;
    });

    harmonizeInsertedTableCells(root || table.parentElement);
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return true;
}

function runTableClipboardCommand(jodit, getEditorBody, action) {
    jodit.e?.fire?.('hidePopup');
    switch (action) {
        case 'copyRow':
            return copyTableRows(jodit, getEditorBody, false);
        case 'cutRow':
            return copyTableRows(jodit, getEditorBody, true);
        case 'pasteRow':
            return pasteTableRows(jodit, getEditorBody);
        case 'copyColumn':
            return copyTableColumns(jodit, getEditorBody, false);
        case 'cutColumn':
            return copyTableColumns(jodit, getEditorBody, true);
        case 'pasteColumn':
            return pasteTableColumns(jodit, getEditorBody);
        default:
            return false;
    }
}

function createTableClipboardControl(name, tooltip, action, isDisabled) {
    return {
        name,
        tooltip,
        exec: (editor) => {
            runTableClipboardCommand(editor, resolveJoditEditorBody(editor), action);
            return false;
        },
        isDisabled,
    };
}

const EMS_TABLE_COPY_ROW_CONTROL = createTableClipboardControl(
    'emsCopyRow',
    'Copy row',
    'copyRow',
    (editor) => !getActiveTableCell(editor, resolveJoditEditorBody(editor))
);
const EMS_TABLE_CUT_ROW_CONTROL = createTableClipboardControl(
    'emsCutRow',
    'Cut row',
    'cutRow',
    (editor) => !getActiveTableCell(editor, resolveJoditEditorBody(editor))
);
const EMS_TABLE_PASTE_ROW_CONTROL = createTableClipboardControl(
    'emsPasteRow',
    'Paste row',
    'pasteRow',
    (editor) => getTableClipboard(editor)?.kind !== 'rows'
);
const EMS_TABLE_COPY_COLUMN_CONTROL = createTableClipboardControl(
    'emsCopyColumn',
    'Copy column',
    'copyColumn',
    (editor) => !getActiveTableCell(editor, resolveJoditEditorBody(editor))
);
const EMS_TABLE_CUT_COLUMN_CONTROL = createTableClipboardControl(
    'emsCutColumn',
    'Cut column',
    'cutColumn',
    (editor) => !getActiveTableCell(editor, resolveJoditEditorBody(editor))
);
const EMS_TABLE_PASTE_COLUMN_CONTROL = createTableClipboardControl(
    'emsPasteColumn',
    'Paste column',
    'pasteColumn',
    (editor) => getTableClipboard(editor)?.kind !== 'columns'
);

function resolveJoditEditorBody(editor) {
    return typeof editor?.__emsClauseEditorBody === 'function'
        ? editor.__emsClauseEditorBody
        : () => editor?.editor || null;
}

const EMS_TABLE_ROW_COL_CLIP_VER = 6;

function registerTableRowColumnClipboard(jodit, getEditorBody) {
    if (!jodit) return;
    const existingRoot =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (
        jodit.__emsTableRowColClipVer === EMS_TABLE_ROW_COL_CLIP_VER &&
        existingRoot?.__emsTableRowColClipBound
    ) {
        return;
    }
    if (jodit.__emsTableRowColClipCleanup) {
        try {
            jodit.__emsTableRowColClipCleanup();
        } catch {
            /* ignore */
        }
        jodit.__emsTableRowColClipCleanup = null;
    }
    jodit.__emsTableRowColClipboard = true;
    jodit.__emsTableRowColClipVer = EMS_TABLE_ROW_COL_CLIP_VER;

    const controls = {
        emsCopyRow: EMS_TABLE_COPY_ROW_CONTROL,
        emsCutRow: EMS_TABLE_CUT_ROW_CONTROL,
        emsPasteRow: EMS_TABLE_PASTE_ROW_CONTROL,
        emsCopyColumn: EMS_TABLE_COPY_COLUMN_CONTROL,
        emsCutColumn: EMS_TABLE_CUT_COLUMN_CONTROL,
        emsPasteColumn: EMS_TABLE_PASTE_COLUMN_CONTROL,
    };
    Object.entries(controls).forEach(([name, control]) => {
        if (!jodit.o.controls[name]) {
            jodit.o.controls[name] = control;
        }
    });
    jodit.registerCommand('emsCopySelection', () => {
        copyTableSelectionToOsClipboard(jodit, getEditorBody);
        return false;
    });
    jodit.registerCommand('emsCopyRow', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'copyRow');
        return false;
    });
    jodit.registerCommand('emsCutRow', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'cutRow');
        return false;
    });
    jodit.registerCommand('emsPasteRow', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'pasteRow');
        return false;
    });
    jodit.registerCommand('emsCopyColumn', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'copyColumn');
        return false;
    });
    jodit.registerCommand('emsCutColumn', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'cutColumn');
        return false;
    });
    jodit.registerCommand('emsPasteColumn', () => {
        runTableClipboardCommand(jodit, getEditorBody, 'pasteColumn');
        return false;
    });

    const onKeyDown = (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const key = String(e.key || '').toLowerCase();
        if (key !== 'c' && key !== 'x' && key !== 'v') return;

        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;

        const cell = getActiveTableCell(jodit, getEditorBody);
        if (!cell || !root.contains(cell)) return;

        const ctx = getTableSelectionBounds(jodit, getEditorBody);
        if (!ctx) return;

        if (key === 'v') {
            const cellClip = jodit.__emsLastCellClip;
            const cellClipFresh =
                cellClip && Date.now() - (cellClip.at || 0) < 120000;
            /* Cell copy must paste into the target cell, not insert a row. */
            if (cellClipFresh) return;
            const clip = getTableClipboard(jodit);
            if (!clip) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (clip.kind === 'rows') pasteTableRows(jodit, getEditorBody);
            else if (clip.kind === 'columns') pasteTableColumns(jodit, getEditorBody);
            return;
        }

        const cut = key === 'x';
        if (ctx.fullRows) {
            e.preventDefault();
            e.stopImmediatePropagation();
            copyTableRows(jodit, getEditorBody, cut);
            copyTableSelectionToOsClipboard(jodit, getEditorBody);
        } else if (ctx.fullColumns) {
            e.preventDefault();
            e.stopImmediatePropagation();
            copyTableColumns(jodit, getEditorBody, cut);
            copyTableSelectionToOsClipboard(jodit, getEditorBody);
        }
    };

    const onCopy = (e) => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;

        const fromTarget = getTableCellFromNode(e.target);
        if (fromTarget && root.contains(fromTarget)) {
            setActiveTableCell(jodit, fromTarget);
        }

        const cell = getActiveTableCell(jodit, getEditorBody);
        if (!cell || !root.contains(cell)) return;

        if (copyTableSelectionToOsClipboard(jodit, getEditorBody, e.clipboardData)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    const onPaste = (e) => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || !e?.clipboardData) return;
        const fromTarget = getTableCellFromNode(e.target);
        if (fromTarget && root.contains(fromTarget)) {
            setActiveTableCell(jodit, fromTarget);
        }
        if (!getActiveTableCell(jodit, getEditorBody)) return;
        if (pasteClipboardIntoActiveTableCell(jodit, getEditorBody, e.clipboardData, e.target)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsTableRowColClipBound) return;
        root.__emsTableRowColClipBound = true;
        root.addEventListener('keydown', onKeyDown, true);
        root.addEventListener('copy', onCopy, true);
        root.addEventListener('paste', onPaste, true);
        const cleanup = () => {
            root.removeEventListener('keydown', onKeyDown, true);
            root.removeEventListener('copy', onCopy, true);
            root.removeEventListener('paste', onPaste, true);
            root.__emsTableRowColClipBound = false;
        };
        jodit.__emsTableRowColClipCleanup = cleanup;
        jodit.e.on('beforeDestruct', cleanup);
    };

    jodit.e.on('afterInit', attach);
    attach();
}

const EMS_TABLE_CELL_BORDER_STYLE = '1px solid #64748b';
export const EMS_TABLE_CELL_BORDER_NONE = 'none';
const EMS_TABLE_BORDER_SIDE_PROPS = ['border-top', 'border-right', 'border-bottom', 'border-left'];
const EMS_TABLE_BORDER_SIDE_NAMES = ['top', 'right', 'bottom', 'left'];

/** Cells/tables explicitly cleared via toolbar "No border" — must beat default clause table grid CSS. */
export const EMS_TABLE_NO_BORDER_CELL_OVERRIDE_CSS = `
td[data-ems-cell-border="none"],
th[data-ems-cell-border="none"] {
    border: none !important;
    border-top: none !important;
    border-right: none !important;
    border-bottom: none !important;
    border-left: none !important;
}
table[data-ems-table-border="none"] {
    border: none !important;
}`;

/**
 * In-cell vertical split (flex panes) — stays inside one BOQ cell width.
 * No nested table; outer column model unchanged.
 */
export const EMS_CELL_SPLIT_TABLE_CSS = `
/*
 * Host cell: zero padding so split lines meet the cell border.
 * height:1px is the table-cell fill trick — row still sizes normally; % children fill it.
 */
td[data-ems-split-host],
th[data-ems-split-host],
td:has(> .ems-cell-split-v),
th:has(> .ems-cell-split-v),
td:has(> .ems-cell-split-h),
th:has(> .ems-cell-split-h) {
    position: relative !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    vertical-align: top !important;
    padding: 0 !important;
}
/* Table-cell fill trick — V-split only (H must stay content-height or rows explode). */
td:has(> .ems-cell-split-v),
th:has(> .ems-cell-split-v),
td[data-ems-split-host="v"],
th[data-ems-split-host="v"],
td[data-ems-split-host="vh"],
th[data-ems-split-host="vh"],
td[data-ems-split-host="hv"],
th[data-ems-split-host="hv"] {
    height: 1px !important;
    /* Clip absolute gutter to this cell — never paint over app menus. */
    overflow: hidden !important;
    contain: paint !important;
}
/*
 * Full-height divider painted on the host cell (always edge-to-edge, no content gaps).
 * --ems-split-left is set on the host in applyEmsCellSplitRatio.
 */
td:has(> .ems-cell-split-v)::after,
th:has(> .ems-cell-split-v)::after,
td[data-ems-split-host="v"]::after,
th[data-ems-split-host="v"]::after,
td[data-ems-split-host="vh"]::after,
th[data-ems-split-host="vh"]::after,
td[data-ems-split-host="hv"]::after,
th[data-ems-split-host="hv"]::after {
    content: '' !important;
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    left: var(--ems-split-left, 50%) !important;
    width: 1px !important;
    margin-left: -0.5px !important;
    background: #64748b !important;
    pointer-events: none !important;
    z-index: 5 !important;
}
.ems-cell-split-v,
div[data-ems-cell-split="v"] {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    /* static so the drag gutter's absolute CB is the host td (full cell height). */
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    gap: 0 !important;
    overflow: visible !important;
    --ems-split-left: 50%;
}
.ems-cell-split-v__pane {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 100% !important;
    height: auto !important;
    align-self: stretch !important;
    box-sizing: border-box !important;
    padding: 2px 4px !important;
    overflow: hidden !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    white-space: normal !important;
    /* Do not create a containing block for the gutter (keep CB = host td). */
    position: static !important;
}
.ems-cell-split-v > .ems-cell-split-v__pane:first-of-type {
    flex: 0 0 var(--ems-split-left) !important;
    border-right: none !important;
    padding-right: 4px !important;
}
.ems-cell-split-v > .ems-cell-split-v__pane:last-of-type {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    padding-left: 4px !important;
}
/* Absolute vs host td (full cell). Host overflow:hidden clips — cannot reach menus. */
.ems-cell-split-v__gutter {
    flex: 0 0 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    left: var(--ems-split-left, 50%) !important;
    transform: translateX(-50%) !important;
    width: 8px !important;
    max-width: 8px !important;
    min-width: 8px !important;
    height: auto !important;
    cursor: col-resize !important;
    z-index: 6 !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    pointer-events: auto !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
    overflow: hidden !important;
}
.ems-cell-split-v__gutter::before {
    content: '' !important;
    position: absolute !important;
    left: 50% !important;
    top: 0 !important;
    bottom: 0 !important;
    width: 1px !important;
    margin-left: -0.5px !important;
    /* Transparent by default — host ::after is the 1px line (same weight as H border-bottom). */
    background: transparent !important;
}
/* Nested V has no host ::after at this offset — show the same 1px line on the gutter. */
.ems-cell-split-v__pane .ems-cell-split-v > .ems-cell-split-v__gutter::before,
.ems-cell-split-h__pane .ems-cell-split-v > .ems-cell-split-v__gutter::before {
    background: #64748b !important;
}
.ems-cell-split-v__gutter:hover,
.ems-cell-split-v__gutter[data-ems-dragging="1"] {
    background: rgba(30, 136, 229, 0.18) !important;
}
.ems-cell-split-v__gutter:hover::before,
.ems-cell-split-v__gutter[data-ems-dragging="1"]::before {
    background: #1e88e5 !important;
    width: 1px !important;
}
.ems-cell-split-v__pane,
.ems-cell-split-v__pane * {
    max-width: 100% !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}
/*
 * In-cell horizontal split — flex divs only (no nested table).
 * Persistent line is painted on the host td via ::before (same idea as V ::after).
 */
.ems-cell-split-h,
div[data-ems-cell-split="h"] {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    align-self: stretch !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    gap: 0 !important;
    overflow: hidden !important;
    position: relative !important;
}
.ems-cell-split-h__pane {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 2px 4px !important;
    overflow: hidden !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    white-space: normal !important;
}
.ems-cell-split-h > .ems-cell-split-h__pane:first-of-type,
.ems-cell-split-h__pane[data-ems-split-h-line="1"] {
    border-bottom: 1px solid #64748b !important;
    min-height: 0 !important;
}
/*
 * Host H line — survives exit-edit like V's host ::after.
 * --ems-split-top is stamped on the td in applyEmsCellSplitRatioH.
 */
td[data-ems-split-h-pct]::before,
th[data-ems-split-h-pct]::before,
td[data-ems-split-host="h"]::before,
th[data-ems-split-host="h"]::before,
td[data-ems-split-host="vh"]::before,
th[data-ems-split-host="vh"]::before,
td[data-ems-split-host="hv"]::before,
th[data-ems-split-host="hv"]::before {
    content: '' !important;
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    top: var(--ems-split-top, 50%) !important;
    height: 1px !important;
    margin-top: -0.5px !important;
    background: #64748b !important;
    pointer-events: none !important;
    z-index: 5 !important;
}
/* Drag handle between panes */
.ems-cell-split-h__gutter {
    flex: 0 0 0 !important;
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    top: var(--ems-split-top, 50%) !important;
    transform: translateY(-50%) !important;
    width: 100% !important;
    height: 12px !important;
    min-height: 12px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
    cursor: row-resize !important;
    box-sizing: border-box !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    z-index: 8 !important;
    pointer-events: auto !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
    overflow: hidden !important;
}
.ems-cell-split-h__gutter::before {
    content: '' !important;
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    top: 50% !important;
    height: 1px !important;
    margin-top: -0.5px !important;
    background: transparent !important;
    pointer-events: none !important;
}
.ems-cell-split-h__gutter:hover,
.ems-cell-split-h__gutter[data-ems-dragging="1"] {
    background: rgba(30, 136, 229, 0.18) !important;
}
.ems-cell-split-h__gutter:hover::before,
.ems-cell-split-h__gutter[data-ems-dragging="1"]::before {
    background: #1e88e5 !important;
    height: 2px !important;
    margin-top: -1px !important;
}
.ems-cell-split-h__pane .ems-cell-split-v,
.ems-cell-split-v__pane .ems-cell-split-h,
.ems-cell-split-v__pane .ems-cell-split-v,
.ems-cell-split-h__pane .ems-cell-split-h {
    min-height: 100% !important;
    height: 100% !important;
}
/* H panes (and nested split hosts) need a positioning context; V panes stay static (see above). */
.ems-cell-split-h__pane {
    position: relative !important;
}
.ems-cell-split-v__pane .ems-cell-split-v,
.ems-cell-split-h__pane .ems-cell-split-v {
    position: relative !important;
    overflow: hidden !important;
}
.ems-cell-split-v__pane .ems-cell-split-v__gutter,
.ems-cell-split-h__pane .ems-cell-split-v__gutter {
    /* Nested V: contain gutter to the pane wrap, not the outer td. */
    position: absolute !important;
}
/* Legacy nested-table splits (older docs) — keep compact if present. */
table[data-ems-cell-split="v"] {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    border: none !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
    box-sizing: border-box !important;
}
table[data-ems-cell-split="v"] td,
table[data-ems-cell-split="v"] th {
    width: 50% !important;
    max-width: 50% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    vertical-align: top !important;
    overflow: hidden !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}
`;

function isVisibleBorderCssValue(val) {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    if (!v || v === 'none' || v === 'hidden' || v === 'initial') return false;
    if (/^0(px|pt|em|rem|%)?(\s|$)/.test(v)) return false;
    if (v.includes('none') && !/(solid|dashed|dotted|double|groove|ridge|inset|outset)/.test(v)) {
        return false;
    }
    return /(solid|dashed|dotted|double|groove|ridge|inset|outset|\d)/.test(v);
}

/** True when a cell carries a real border from paste or toolbar formatting. */
export function cellHasVisibleBorderStyle(cell, win) {
    if (!cell) return false;
    const borderMark = cell.getAttribute?.('data-ems-cell-border');
    if (borderMark === EMS_TABLE_CELL_BORDER_NONE) return false;
    const borderAttr = cell.getAttribute?.('border');
    if (borderAttr && borderAttr !== '0') return true;
    if (borderMark) return true;
    if (!cell.style) return false;

    if (isVisibleBorderCssValue(cell.style.getPropertyValue('border'))) return true;
    for (const side of EMS_TABLE_BORDER_SIDE_NAMES) {
        if (isVisibleBorderCssValue(cell.style.getPropertyValue(`border-${side}`))) return true;
    }

    if (win?.getComputedStyle) {
        const cs = win.getComputedStyle(cell);
        for (const side of EMS_TABLE_BORDER_SIDE_NAMES) {
            const width = parseFloat(cs.getPropertyValue(`border-${side}-width`));
            const style = cs.getPropertyValue(`border-${side}-style`);
            if (Number.isFinite(width) && width > 0 && style && style !== 'none' && style !== 'hidden') {
                return true;
            }
        }
    }
    return false;
}

function collectOfficePasteTables(root) {
    if (!root) return [];
    if (/^TABLE$/i.test(root.tagName || '')) {
        return isOfficePasteTableEl(root) ? [root] : [];
    }
    if (!root.querySelectorAll) return [];
    return [...root.querySelectorAll(EMS_OFFICE_PASTE_TABLE_QUERY)].filter(
        (table) => isOfficePasteTableEl(table)
    );
}

/** Copy per-side computed borders onto inline styles (Excel often uses class rules, not shorthand). */
export function inlineOfficeTableCellBorders(doc, win, scopeRoot) {
    if (!win?.getComputedStyle) return;
    const tables = scopeRoot ? collectOfficePasteTables(scopeRoot) : [];
    const cells = tables.length
        ? tables.flatMap((table) => [...table.querySelectorAll('td, th')])
        : [...((doc?.body || doc)?.querySelectorAll?.('table td, table th') || [])];
    cells.forEach((cell) => {
        const cs = win.getComputedStyle(cell);
        EMS_TABLE_BORDER_SIDE_NAMES.forEach((side) => {
            const prop = `border-${side}`;
            if (isVisibleBorderCssValue(cell.style.getPropertyValue(prop))) return;
            const width = cs.getPropertyValue(`${prop}-width`).trim();
            const style = cs.getPropertyValue(`${prop}-style`).trim();
            const color = cs.getPropertyValue(`${prop}-color`).trim();
            const w = parseFloat(width);
            if (!width || !Number.isFinite(w) || w <= 0) return;
            if (!style || style === 'none' || style === 'hidden') return;
            cell.style.setProperty(prop, `${width} ${style} ${color}`);
        });
    });
}

export function isExcelPasteTable(table) {
    return table?.getAttribute?.('data-ems-excel-paste') === '1';
}

export const EMS_OFFICE_PASTE_TABLE_QUERY = EMS_OFFICE_PASTE_TABLE_SELECTOR;

export function isOfficePasteTableEl(table) {
    if (!table) return false;
    // Resized Clause-4 pricing tables also carry data-ems-col-widths — never treat as Office paste
    // (compactOfficePasteTableSpacing would strip data-ems-row-heights → tall rows after exit).
    if (isEmsPricingSummaryTable(table)) return false;
    // Word pastes frequently use <o:p> and MsoNormal classes without `data-ems-paste-source`.
    if (table.getElementsByTagName('o:p').length || table.querySelector?.('.MsoNormal, [style*="mso-"]')) return true;
    return (
        table.getAttribute?.('data-ems-paste-source') === 'office' ||
        table.classList?.contains?.('ems-office-paste-table') ||
        table.getAttribute?.('data-ems-paste-formatted') === '1' ||
        table.getAttribute?.('data-ems-excel-paste') === '1' ||
        Boolean(table.getAttribute?.('data-ems-col-widths'))
    );
}

const OFFICE_PASTE_PRESERVE_PROPS = [
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-align',
    'vertical-align',
    'background-color',
    'background',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
];

const OFFICE_PASTE_INNER_SELECTOR =
    'span, p, div, font, b, strong, i, em, u, a, li, h1, h2, h3, h4, h5, h6';

function shouldPreserveOfficeComputedStyle(prop, val) {
    if (!val) return false;
    const v = String(val).trim();
    if (!v || v === 'initial' || v === 'auto' || v === 'inherit') return false;
    if (prop.includes('border')) {
        return isVisibleBorderCssValue(v);
    }
    if (prop.includes('background')) {
        const compact = v.replace(/\s/g, '').toLowerCase();
        if (!compact || compact === 'transparent' || compact === 'rgba(0,0,0,0)') return false;
        return true;
    }
    if (prop === 'font-weight') {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n >= 600 : /bold/i.test(v);
    }
    if (prop === 'font-style') {
        return v !== 'normal';
    }
    if (prop === 'text-decoration') {
        /* Never bake Excel underline / strike into quote tables. */
        return false;
    }
    if (prop === 'color') {
        const compact = v.replace(/\s/g, '').toLowerCase();
        return (
            compact &&
            compact !== 'transparent' &&
            compact !== 'rgb(0,0,0)' &&
            compact !== '#000000' &&
            compact !== '#000' &&
            compact !== 'black' &&
            compact !== 'windowtext'
        );
    }
    if (prop === 'font-size' || prop === 'font-family') {
        return !!v && v !== '0px';
    }
    if (prop === 'text-align' || prop === 'vertical-align') {
        return !!v && v !== 'start' && v !== 'baseline';
    }
    return v !== 'normal' && v !== '0px';
}

function inlineOfficeElementPresentation(el, win) {
    if (!el?.style || !win?.getComputedStyle) return;
    const cs = win.getComputedStyle(el);
    OFFICE_PASTE_PRESERVE_PROPS.forEach((prop) => {
        const val = cs.getPropertyValue(prop).trim();
        if (!shouldPreserveOfficeComputedStyle(prop, val)) return;
        el.style.setProperty(prop, val, 'important');
    });
}

/** True when a pasted cell has a non-default background fill. */
export function cellHasVisibleBackgroundFill(cell, win) {
    if (!cell) return false;
    if (cell.hasAttribute?.('data-ems-cell-fill')) return true;
    if (cell.hasAttribute?.('data-ems-cell-bg')) return true;
    const bgAttr = cell.getAttribute?.('bgcolor');
    if (bgAttr && bgAttr.replace(/\s/g, '').toLowerCase() !== 'transparent') return true;
    if (cell.style) {
        const bg = cell.style.getPropertyValue('background-color') || cell.style.getPropertyValue('background');
        if (shouldPreserveOfficeComputedStyle('background-color', bg)) return true;
    }
    if (win?.getComputedStyle) {
        const cs = win.getComputedStyle(cell);
        const bg = cs.getPropertyValue('background-color').trim();
        if (shouldPreserveOfficeComputedStyle('background-color', bg)) return true;
    }
    return false;
}

/** Restore or snapshot cell background/text paint into inline styles + data attrs for browse/PDF. */
export function snapshotOfficePasteCellPaint(cell, win) {
    if (!cell) return;

    if (cell.hasAttribute('data-ems-bg-none')) {
        cell.removeAttribute('data-ems-cell-fill');
        cell.removeAttribute('data-ems-cell-bg');
    } else {
        const inlineBg = (
            cell.style.getPropertyValue('background-color') ||
            cell.style.getPropertyValue('background') ||
            ''
        ).trim();
        if (shouldPreserveOfficeComputedStyle('background-color', inlineBg)) {
            cell.setAttribute('data-ems-cell-fill', '1');
            cell.setAttribute('data-ems-cell-bg', inlineBg);
            cell.style.setProperty('background-color', inlineBg, 'important');
            cell.style.setProperty('background', inlineBg, 'important');
            cell.removeAttribute('data-ems-bg-none');
        } else {
            const storedBg = cell.getAttribute('data-ems-cell-bg');
            if (storedBg) {
                cell.style.setProperty('background-color', storedBg, 'important');
                cell.style.setProperty('background', storedBg, 'important');
                cell.setAttribute('data-ems-cell-fill', '1');
                cell.removeAttribute('data-ems-bg-none');
            } else {
                const bg = resolveOfficePasteBackgroundColor(cell, win);
                if (bg && shouldPreserveOfficeComputedStyle('background-color', bg)) {
                    cell.setAttribute('data-ems-cell-fill', '1');
                    cell.setAttribute('data-ems-cell-bg', bg);
                    cell.style.setProperty('background-color', bg, 'important');
                    cell.style.setProperty('background', bg, 'important');
                    cell.removeAttribute('data-ems-bg-none');
                }
            }
        }
    }

    const inlineColor = (cell.style.getPropertyValue('color') || '').trim();
    if (shouldPreserveOfficeComputedStyle('color', inlineColor)) {
        cell.setAttribute('data-ems-cell-color', inlineColor);
        cell.style.setProperty('color', inlineColor, 'important');
    } else {
        const storedColor = cell.getAttribute('data-ems-cell-color');
        if (storedColor) {
            cell.style.setProperty('color', storedColor, 'important');
        } else {
            const color =
                cell.style.getPropertyValue('color') ||
                (win?.getComputedStyle ? win.getComputedStyle(cell).getPropertyValue('color').trim() : '');
            if (shouldPreserveOfficeComputedStyle('color', color)) {
                cell.setAttribute('data-ems-cell-color', color);
                cell.style.setProperty('color', color, 'important');
            }
        }
    }
    const weight =
        cell.style.getPropertyValue('font-weight') ||
        (win?.getComputedStyle ? win.getComputedStyle(cell).getPropertyValue('font-weight').trim() : '');
    if (shouldPreserveOfficeComputedStyle('font-weight', weight)) {
        cell.style.setProperty('font-weight', weight, 'important');
    }
}

export function markOfficePasteCellFills(root, win) {
    collectOfficePasteTables(root).forEach((table) => {
        propagateOfficePasteRowBackgroundsToCells(table, win);
        table.querySelectorAll('td, th').forEach((cell) => snapshotOfficePasteCellPaint(cell, win));
    });
}

/** Apply a full grid when Excel/Word clipboard omitted border CSS. */
export function applyDefaultOfficeTableBordersIfEmpty(table) {
    if (!table?.querySelectorAll || !isOfficePasteTableEl(table)) return;
    const cells = table.querySelectorAll('td, th');
    if (!cells.length) return;
    const hasBorder = [...cells].some((cell) => cellHasVisibleBorderStyle(cell));
    if (hasBorder) return;
    cells.forEach((cell) => {
        if (cell.getAttribute('data-ems-cell-border') === EMS_TABLE_CELL_BORDER_NONE) return;
        cell.style.setProperty('border', EMS_TABLE_CELL_BORDER_STYLE, 'important');
        cell.setAttribute('data-ems-cell-border', '1');
    });
    if (!table.style.borderCollapse) {
        table.style.borderCollapse = 'collapse';
    }
}

/** Apply a full grid when a manually inserted table has no border styling yet. */
export function applyDefaultManualTableBordersIfEmpty(table) {
    if (!table?.querySelectorAll) return;
    if (isOfficePasteTableEl(table)) return;
    if (isEmsPricingSummaryTable(table)) return;
    const cells = table.querySelectorAll('td, th');
    if (!cells.length) return;
    let applied = false;
    cells.forEach((cell) => {
        if (cell.getAttribute('data-ems-cell-border') === EMS_TABLE_CELL_BORDER_NONE) return;
        if (cellHasVisibleBorderStyle(cell)) return;
        cell.style.setProperty('border', EMS_TABLE_CELL_BORDER_STYLE, 'important');
        cell.setAttribute('data-ems-cell-border', '1');
        applied = true;
    });
    if (applied && !table.style.borderCollapse) {
        table.style.borderCollapse = 'collapse';
    }
}

/** @deprecated use applyDefaultOfficeTableBordersIfEmpty */
export function applyDefaultExcelTableBordersIfEmpty(table) {
    applyDefaultOfficeTableBordersIfEmpty(table);
}

/** Inline fonts, colors, borders, fills from computed styles and mark preserve attributes. */
/** Resolve a pasted cell/row background from inline attrs, style, or computed paint. */
function resolveOfficePasteBackgroundColor(el, win) {
    if (!el) return '';
    const bgAttr = el.getAttribute?.('bgcolor');
    if (bgAttr && bgAttr.replace(/\s/g, '').toLowerCase() !== 'transparent') {
        return bgAttr.trim();
    }
    if (el.style) {
        const bg =
            el.style.getPropertyValue('background-color') || el.style.getPropertyValue('background');
        if (shouldPreserveOfficeComputedStyle('background-color', bg)) return bg.trim();
    }
    if (win?.getComputedStyle) {
        const bg = win.getComputedStyle(el).getPropertyValue('background-color').trim();
        if (shouldPreserveOfficeComputedStyle('background-color', bg)) return bg;
    }
    return '';
}

/** Excel often paints header fills on <tr> — copy onto each cell so browse/export keep them. */
export function propagateOfficePasteRowBackgroundsToCells(table, win) {
    if (!table?.querySelectorAll || !isOfficePasteTableEl(table)) return;
    table.querySelectorAll('tr').forEach((tr) => {
        const rowBg = resolveOfficePasteBackgroundColor(tr, win);
        if (!rowBg) return;
        tr.querySelectorAll(':scope > td, :scope > th').forEach((cell) => {
            if (cellHasVisibleBackgroundFill(cell, win)) return;
            cell.style.setProperty('background-color', rowBg, 'important');
            cell.style.setProperty('background', rowBg, 'important');
            cell.setAttribute('data-ems-cell-fill', '1');
            cell.removeAttribute('data-ems-bg-none');
        });
        tr.style.removeProperty('background');
        tr.style.removeProperty('background-color');
        tr.removeAttribute('bgcolor');
    });
}

/** Remove Excel trailing blank columns (common when copying a used range). */
export function trimTrailingEmptyOfficeTableColumns(table) {
    if (!table?.querySelectorAll || !isOfficePasteTableEl(table)) return;
    /* Never trim schedule tables — empty Qty on some rows deleted Amount/Unit cols in edit. */
    const rows = [...table.querySelectorAll('tr')];
    if (!rows.length) return;
    let colCount = 0;
    rows.forEach((row) => {
        colCount = Math.max(colCount, row.cells?.length || 0);
    });
    if (colCount >= 4) return;
    while (colCount > 1) {
        const columnEmpty = rows.every((row) => {
            const cell = row.cells?.[colCount - 1];
            return !cell || isCellEffectivelyEmpty(cell);
        });
        if (!columnEmpty) break;
        rows.forEach((row) => {
            const cell = row.cells?.[colCount - 1];
            cell?.remove();
        });
        colCount -= 1;
    }
}

function officePasteNodeHasDistinctTextColor(node, win) {
    if (!node) return false;
    const inline = (node.style?.getPropertyValue('color') || '').trim();
    if (shouldPreserveOfficeComputedStyle('color', inline)) return true;
    if (node.tagName === 'FONT' && node.getAttribute('color')) return true;
    if (win?.getComputedStyle) {
        const computed = win.getComputedStyle(node).getPropertyValue('color').trim();
        const compact = computed.replace(/\s/g, '').toLowerCase();
        if (
            shouldPreserveOfficeComputedStyle('color', computed) &&
            compact !== 'rgb(0,0,0)' &&
            compact !== '#000000' &&
            compact !== '#000'
        ) {
            return true;
        }
    }
    return false;
}

/** If Excel shipped light header text without a preserved fill, keep text readable. */
function ensureOfficePasteCellTextVisible(cell, win) {
    if (!cell || !win?.getComputedStyle) return;
    if (cell.hasAttribute('data-ems-cell-color')) return;
    const text = String(cell.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (!text) return;
    if (
        [...cell.querySelectorAll('span, p, div, font, b, strong, i, em, u')].some((child) =>
            officePasteNodeHasDistinctTextColor(child, win)
        )
    ) {
        return;
    }
    const cs = win.getComputedStyle(cell);
    const color = cs.getPropertyValue('color').trim();
    const bg = cs.getPropertyValue('background-color').trim();
    const parseRgb = (s) => {
        const m = String(s || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3] };
    };
    const fg = parseRgb(color);
    const bk = parseRgb(bg);
    const fgLight = fg ? (fg.r + fg.g + fg.b) / 3 > 210 : false;
    const bgLight =
        !bk || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || (bk.r + bk.g + bk.b) / 3 > 210;
    if (fgLight && bgLight) {
        cell.style.setProperty('color', '#000000', 'important');
    }
}

function isOfficePasteCellContentEmpty(el) {
    return !el || !String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

const OFFICE_PASTE_CELL_BLOCK_TAGS = new Set(['P', 'DIV']);

function isOfficePasteCellBlockWrapper(el) {
    return OFFICE_PASTE_CELL_BLOCK_TAGS.has(el?.tagName || '');
}

function removeEmptyOfficePasteCellBlocks(cell) {
    if (!cell?.querySelectorAll) return;
    let changed = true;
    while (changed) {
        changed = false;
        cell.querySelectorAll('o\\:p').forEach((el) => {
            if (isOfficePasteCellContentEmpty(el)) {
                el.remove();
                changed = true;
            }
        });
        [...cell.children].forEach((el) => {
            if (!isOfficePasteCellBlockWrapper(el)) return;
            if (el.querySelector?.('table, ul, ol, img')) return;
            if (isOfficePasteCellContentEmpty(el)) {
                el.remove();
                changed = true;
            }
        });
    }
}

function forceOfficePasteCellInnerSpacing(cell) {
    if (!cell?.querySelectorAll) return;
    cell.querySelectorAll('p, div, span, font, li, o\\:p').forEach((el) => {
        if (!el.style) return;
        [
            'margin',
            'margin-top',
            'margin-bottom',
            'margin-left',
            'margin-right',
            'padding',
            'padding-top',
            'padding-bottom',
            'line-height',
            'min-height',
            'height',
            'mso-line-height-alt',
            'mso-line-height-rule',
            'mso-margin-top-alt',
            'mso-margin-bottom-alt',
        ].forEach((prop) => el.style.removeProperty(prop));
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('line-height', '1.1', 'important');
    });
}

function unwrapOfficePasteCellParagraphs(cell) {
    if (!cell?.querySelectorAll) return;

    removeEmptyOfficePasteCellBlocks(cell);

    for (let guard = 0; guard < 16; guard += 1) {
        const blocks = [...cell.children].filter(
            (el) =>
                isOfficePasteCellBlockWrapper(el) && !el.querySelector?.('table, ul, ol, img')
        );
        if (!blocks.length) break;

        const empty = blocks.find((block) => isOfficePasteCellContentEmpty(block));
        if (empty) {
            empty.remove();
            continue;
        }

        const block = blocks[0];
        if (blocks.length > 1) {
            for (let i = blocks.length - 1; i >= 1; i -= 1) {
                const next = blocks[i];
                if (isOfficePasteCellContentEmpty(next)) {
                    next.remove();
                    continue;
                }
                const br = cell.ownerDocument.createElement('br');
                cell.insertBefore(br, next);
                while (next.firstChild) cell.insertBefore(next.firstChild, next);
                next.remove();
            }
        }

        while (block.firstChild) cell.insertBefore(block.firstChild, block);
        block.remove();
    }

    removeEmptyOfficePasteCellBlocks(cell);
}

/** Word/Excel→Word pastes inflate rows via locked heights, cell padding, and <p>/<o:p> noise. */
export function compactOfficePasteTableSpacing(table) {
    if (!table?.querySelectorAll) return;
    // Belt-and-suspenders: resized pricing tables carry data-ems-col-widths like Office pastes.
    if (isEmsPricingSummaryTable(table)) return;
    if (!isOfficePasteTableEl(table)) return;

    if (!table.hasAttribute('data-ems-row-heights-custom')) {
        table.removeAttribute('data-ems-row-heights');
    }
    table.setAttribute('cellspacing', '0');
    table.setAttribute('cellpadding', '0');
    table.style.setProperty('border-collapse', 'collapse', 'important');
    table.style.setProperty('border-spacing', '0', 'important');

    table.querySelectorAll('o\\:p').forEach((el) => {
        if (isOfficePasteCellContentEmpty(el)) el.remove();
    });

    const keepRowHeights = table.hasAttribute('data-ems-row-heights-custom');
    if (!keepRowHeights) {
        table.querySelectorAll('tr').forEach((tr) => {
            ['height', 'min-height', 'max-height'].forEach((prop) => tr.style.removeProperty(prop));
            tr.removeAttribute('height');
            tr.style.setProperty('height', 'auto', 'important');
            tr.style.setProperty('min-height', '0', 'important');
            tr.style.setProperty('max-height', 'none', 'important');
        });

        table.querySelectorAll('td, th').forEach((cell) => {
            ['height', 'min-height', 'max-height', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'line-height'].forEach((prop) => {
                cell.style.removeProperty(prop);
            });
            cell.removeAttribute('height');
            cell.removeAttribute('valign');

            unwrapOfficePasteCellParagraphs(cell);

            let last = cell.lastElementChild;
            while (last) {
                const empty =
                    isOfficePasteCellContentEmpty(last) &&
                    (last.tagName === 'BR' ||
                        last.tagName === 'P' ||
                        last.tagName === 'DIV' ||
                        last.tagName === 'O:P');
                if (!empty) break;
                const prev = last.previousElementSibling;
                last.remove();
                last = prev;
            }

            forceOfficePasteCellInnerSpacing(cell);

            if (cell.children.length === 1) {
                const only = cell.firstElementChild;
                if (
                    only?.tagName === 'P' &&
                    isOfficePasteCellContentEmpty(only) &&
                    only.querySelector('br')
                ) {
                    only.innerHTML = '<br>';
                }
            }

            cell.style.setProperty('padding', '0 3px', 'important');
            cell.style.setProperty('line-height', '1.1', 'important');
            cell.style.setProperty('vertical-align', 'middle', 'important');
            cell.style.setProperty('height', 'auto', 'important');
            cell.style.setProperty('min-height', '0', 'important');
            cell.style.setProperty('max-height', 'none', 'important');
        });
    } else {
        reapplyStoredTableRowHeights(table);
    }
}

export function finalizeOfficePasteTableFormatting(table, win) {
    if (!table || isEmsPricingSummaryTable(table) || !isOfficePasteTableEl(table)) return;

    trimTrailingEmptyOfficeTableColumns(table);
    propagateOfficePasteRowBackgroundsToCells(table, win);

    table.querySelectorAll('td, th').forEach((cell) => {
        const align = cell.getAttribute('align');
        if (align) cell.style.setProperty('text-align', align, 'important');
        const valign = cell.getAttribute('valign');
        if (valign) cell.style.setProperty('vertical-align', valign, 'important');
        const bgAttr = cell.getAttribute('bgcolor');
        if (bgAttr) {
            cell.style.setProperty('background-color', bgAttr, 'important');
            cell.style.setProperty('background', bgAttr, 'important');
        }
        if (win) {
            inlineOfficeElementPresentation(cell, win);
            cell.querySelectorAll(OFFICE_PASTE_INNER_SELECTOR).forEach((child) => {
                inlineOfficeElementPresentation(child, win);
            });
        }
    });

    if (win) {
        inlineOfficeTableCellBorders(table.ownerDocument, win, table);
    }
    markOfficePasteCellFills(table, win);
    markOfficePasteTableBorders(table, win);
    applyDefaultOfficeTableBordersIfEmpty(table);
    table.querySelectorAll('td, th').forEach((cell) => {
        ensureOfficePasteCellTextVisible(cell, win);
    });
    if (win) {
        inlineExcelPasteFontColors(table, win);
    }
    reinforceOfficeTableCellRichText(table);
    compactOfficePasteTableSpacing(table);
    table.setAttribute('data-ems-paste-formatted', '1');
}

export function finalizeAllOfficePasteTablesFormatting(root, win) {
    collectOfficePasteTables(root).forEach((table) => {
        finalizeOfficePasteTableFormatting(table, win);
    });
    /* Also clear strike on any other quote tables (saved HTML still carrying Excel strike). */
    stripStrikethroughFromQuoteTablesInRoot(root);
}

/** Inline Word/Excel text paint on prose/list nodes (after pseudo-table → <ul>/<ol> conversion). */
export function inlineOfficePasteRichTextFormatting(root, win) {
    if (!root?.querySelectorAll || !win?.getComputedStyle) return;
    root.querySelectorAll(OFFICE_PASTE_INNER_SELECTOR).forEach((el) => {
        inlineOfficeElementPresentation(el, win);
    });
    root.querySelectorAll('font[color]').forEach((font) => {
        const c = font.getAttribute('color');
        if (!c) return;
        font.style.setProperty('color', c, 'important');
        font.removeAttribute('color');
    });
}

export function finalizeOfficePasteListFormatting(root, win) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('ul > li, ol > li').forEach((li) => {
        inlineOfficePasteRichTextFormatting(li, win);
    });
}

/**
 * Strip Excel/Word strike + underline from quote tables (td → tr → table).
 * Pasted BOQ often locked both on every cell; clearing strike alone left underline.
 */
export function stripStrikethroughFromQuoteTable(table) {
    if (!table?.querySelectorAll) return;
    table.querySelectorAll('s, strike, del, u').forEach((el) => unwrapElement(el));
    const nodes = [
        table,
        ...table.querySelectorAll('tr, td, th, span, p, div, font, li, b, strong, i, em, a'),
    ];
    nodes.forEach((el) => {
        if (!el || el.nodeType !== 1) return;
        let raw = String(el.getAttribute?.('style') || '');
        if (
            /mso-strike\s*:/i.test(raw) ||
            /text-line-through\s*:/i.test(raw) ||
            /text-underline\s*:/i.test(raw) ||
            /mso-text-underline\s*:/i.test(raw)
        ) {
            raw = raw
                .replace(/mso-strike\s*:[^;]*;?/gi, '')
                .replace(/text-line-through\s*:[^;]*;?/gi, '')
                .replace(/text-underline\s*:[^;]*;?/gi, '')
                .replace(/mso-text-underline\s*:[^;]*;?/gi, '');
            if (raw.trim()) el.setAttribute('style', raw.replace(/;;+/g, ';').replace(/^;|;$/g, ''));
            else el.removeAttribute('style');
        }
        const line =
            el.style?.getPropertyValue('text-decoration-line') ||
            el.style?.getPropertyValue('text-decoration') ||
            el.style?.textDecorationLine ||
            el.style?.textDecoration ||
            '';
        const hadDeco =
            /line-through|underline|overline/i.test(line) ||
            /mso-strike|text-line-through|text-underline|mso-text-underline/i.test(
                String(el.getAttribute?.('style') || '')
            );
        if (!hadDeco) return;
        el.style.setProperty('text-decoration', 'none', 'important');
        el.style.setProperty('text-decoration-line', 'none', 'important');
        el.style.removeProperty('text-decoration-thickness');
        el.style.removeProperty('text-decoration-color');
        el.style.removeProperty('text-decoration-style');
        el.style.removeProperty('text-underline-offset');
    });
}

export function stripStrikethroughFromQuoteTablesInRoot(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table').forEach((table) => stripStrikethroughFromQuoteTable(table));
}

export function stripStrikethroughFromQuoteTablesInHtml(html) {
    const raw = String(html || '');
    if (!raw || !/<table\b/i.test(raw)) return raw;
    if (
        !/line-through/i.test(raw) &&
        !/mso-strike/i.test(raw) &&
        !/text-line-through/i.test(raw) &&
        !/text-underline/i.test(raw) &&
        !/mso-text-underline/i.test(raw) &&
        !/text-decoration[^;]*underline/i.test(raw) &&
        !/<\s*(s|strike|del|u)\b/i.test(raw)
    ) {
        return raw;
    }
    if (typeof DOMParser === 'undefined') return raw;
    try {
        const doc = new DOMParser().parseFromString(
            `<div id="ems-strip-strike">${raw}</div>`,
            'text/html'
        );
        const root = doc.getElementById('ems-strip-strike');
        if (!root) return raw;
        stripStrikethroughFromQuoteTablesInRoot(root);
        return root.innerHTML;
    } catch {
        return raw;
    }
}

/** Lock bold/color on nested runs inside pasted table cells (not underline/strike). */
export function reinforceOfficeTableCellRichText(table) {
    if (!table?.querySelectorAll) return;
    stripStrikethroughFromQuoteTable(table);
    table.querySelectorAll('td, th').forEach((cell) => {
        const cellColor = (cell.style.getPropertyValue('color') || cell.getAttribute('data-ems-cell-color') || '').trim();
        if (cellColor && cellColor !== 'windowtext') {
            cell.style.setProperty('color', cellColor, 'important');
        }
        cell.querySelectorAll('font[color]').forEach((font) => {
            const c = font.getAttribute('color');
            if (c) {
                font.style.setProperty('color', c, 'important');
                font.removeAttribute('color');
            }
        });
        cell.querySelectorAll('b, strong').forEach((el) => {
            el.style.setProperty('font-weight', '700', 'important');
        });
        cell.querySelectorAll('i, em').forEach((el) => {
            el.style.setProperty('font-style', 'italic', 'important');
        });
        cell.querySelectorAll('span[style], font[style], p[style]').forEach((el) => {
            const color = (el.style.getPropertyValue('color') || '').trim();
            if (color && color !== 'windowtext') {
                el.style.setProperty('color', color, 'important');
            }
            const weight = (el.style.getPropertyValue('font-weight') || '').trim();
            if (weight && weight !== 'normal' && weight !== '400') {
                el.style.setProperty('font-weight', weight, 'important');
            }
            const fontStyle = (el.style.getPropertyValue('font-style') || '').trim();
            if (fontStyle && fontStyle !== 'normal') {
                el.style.setProperty('font-style', fontStyle, 'important');
            }
            const deco = (el.style.getPropertyValue('text-decoration') || '').trim();
            if (/underline|line-through|overline/i.test(deco)) {
                el.style.setProperty('text-decoration', 'none', 'important');
                el.style.setProperty('text-decoration-line', 'none', 'important');
            }
        });
    });
}

const EXCEL_PASTE_FONT_COLOR_SELECTOR =
    'td, th, td span, td font, td p, td div, td b, td strong, td i, td em, th span, th font, th p, th div, th b, th strong, th i, th em';

function isDefaultOfficePasteTextColor(color) {
    const compact = String(color || '').replace(/\s/g, '').toLowerCase();
    return (
        !compact ||
        compact === 'transparent' ||
        compact === 'inherit' ||
        compact === 'initial' ||
        compact === 'windowtext' ||
        compact === 'windowframe' ||
        compact === 'black' ||
        compact === '#000' ||
        compact === '#000000' ||
        compact === 'rgb(0,0,0)' ||
        compact === 'rgba(0,0,0,0)'
    );
}

/** Excel encodes font color in xl* CSS classes — inline computed paint before classes are stripped. */
export function inlineExcelPasteFontColors(table, win) {
    if (!table?.querySelectorAll || !win?.getComputedStyle) return;
    table.querySelectorAll(EXCEL_PASTE_FONT_COLOR_SELECTOR).forEach((el) => {
        const inline = (el.style?.getPropertyValue('color') || '').trim();
        if (!isDefaultOfficePasteTextColor(inline)) {
            el.style.setProperty('color', inline, 'important');
            if (/^(TD|TH)$/i.test(el.tagName || '')) {
                el.setAttribute('data-ems-cell-color', inline);
            }
            return;
        }
        const computed = win.getComputedStyle(el).getPropertyValue('color').trim();
        if (isDefaultOfficePasteTextColor(computed)) return;
        el.style.setProperty('color', computed, 'important');
        if (/^(TD|TH)$/i.test(el.tagName || '')) {
            el.setAttribute('data-ems-cell-color', computed);
        }
    });
    table.querySelectorAll('font[color]').forEach((font) => {
        const c = font.getAttribute('color');
        if (!c) return;
        font.style.setProperty('color', c, 'important');
        font.removeAttribute('color');
    });
}

/** Remove Excel xl* / font* classes after their paint has been inlined. */
export function stripOfficePasteTableClassNames(table) {
    if (!table?.querySelectorAll) return;
    table.querySelectorAll('[class]').forEach((el) => {
        if (el === table) return;
        const keep = [...el.classList].filter((cls) => cls.startsWith('ems-'));
        if (keep.length) {
            el.className = keep.join(' ');
        } else {
            el.removeAttribute('class');
        }
    });
}

/** Tag pasted cells that have borders so preview/sanitizer do not strip Excel gridlines. */
export function markOfficePasteTableBorders(root, win) {
    collectOfficePasteTables(root).forEach((table) => {
        table.querySelectorAll('td, th').forEach((cell) => {
            if (!cellHasVisibleBorderStyle(cell, win)) return;
            cell.setAttribute('data-ems-cell-border', '1');
            EMS_TABLE_BORDER_SIDE_NAMES.forEach((side) => {
                const prop = `border-${side}`;
                const val = cell.style.getPropertyValue(prop);
                if (isVisibleBorderCssValue(val)) {
                    cell.style.setProperty(prop, val, 'important');
                }
            });
            const shorthand = cell.style.getPropertyValue('border');
            if (isVisibleBorderCssValue(shorthand)) {
                cell.style.setProperty('border', shorthand, 'important');
            }
        });

        const borderAttr = table.getAttribute('border');
        if (borderAttr && borderAttr !== '0') {
            const cells = table.querySelectorAll('td, th');
            const anyMarked = [...cells].some((c) => c.hasAttribute('data-ems-cell-border'));
            if (!anyMarked) {
                cells.forEach((cell) => {
                    cell.style.setProperty('border', EMS_TABLE_CELL_BORDER_STYLE, 'important');
                    cell.setAttribute('data-ems-cell-border', '1');
                });
                if (!table.style.borderCollapse) {
                    table.style.borderCollapse = 'collapse';
                }
            }
        }

        applyDefaultOfficeTableBordersIfEmpty(table);
    });
}

const EMS_TABLE_BORDER_MAP = {
    emsTableBorderAll: 'all',
    emsTableBorderOutside: 'outside',
    emsTableBorderInside: 'inside',
    emsTableBorderTop: 'top',
    emsTableBorderBottom: 'bottom',
    emsTableBorderLeft: 'left',
    emsTableBorderRight: 'right',
    emsTableBorderNone: 'none',
};

function clearTableCellBorders(cell) {
    if (!cell?.style) return;
    cell.style.setProperty('border', 'none', 'important');
    EMS_TABLE_BORDER_SIDE_PROPS.forEach((prop) => cell.style.setProperty(prop, 'none', 'important'));
    cell.setAttribute('data-ems-cell-border', EMS_TABLE_CELL_BORDER_NONE);
    cell.removeAttribute('border');
}

function clearTableBorders(table) {
    if (!table?.style) return;
    table.style.setProperty('border', 'none', 'important');
    table.setAttribute('data-ems-table-border', EMS_TABLE_CELL_BORDER_NONE);
    table.removeAttribute('border');
}

function setTableCellBorderSide(cell, side, style = EMS_TABLE_CELL_BORDER_STYLE) {
    if (!cell?.style || !side) return;
    cell.setAttribute('data-ems-cell-border', '1');
    if (side === 'all') {
        cell.style.setProperty('border', style, 'important');
    } else {
        cell.style.setProperty(`border-${side}`, style, 'important');
    }
    const table = cell.closest('table');
    if (table) {
        table.removeAttribute('data-ems-table-border');
        if (!table.style.borderCollapse) {
            table.style.borderCollapse = 'collapse';
        }
    }
}

function getCellSpanInSelectionBox(box, cell, rMin, rMax, cMin, cMax) {
    let ri0 = Infinity;
    let ri1 = -1;
    let cj0 = Infinity;
    let cj1 = -1;
    for (let i = rMin; i <= rMax; i += 1) {
        for (let j = cMin; j <= cMax; j += 1) {
            if (box[i]?.[j] === cell) {
                ri0 = Math.min(ri0, i);
                ri1 = Math.max(ri1, i);
                cj0 = Math.min(cj0, j);
                cj1 = Math.max(cj1, j);
            }
        }
    }
    if (ri0 === Infinity) return null;
    return { ri0, ri1, cj0, cj1 };
}

function applyTableBorderModeToCells(jodit, cells, mode) {
    const connected = (cells || []).filter((c) => c?.isConnected);
    if (!connected.length || !mode) return false;

    const tableModule = getJoditTableModule(jodit);
    if (!tableModule) return false;

    const byTable = new Map();
    connected.forEach((cell) => {
        const table = cell.closest('table');
        if (!table) return;
        if (!byTable.has(table)) byTable.set(table, new Set());
        byTable.get(table).add(cell);
    });

    byTable.forEach((cellSet, table) => {
        const box = tableModule.formalMatrix(table);
        let rMin = Infinity;
        let rMax = -1;
        let cMin = Infinity;
        let cMax = -1;
        for (let i = 0; i < box.length; i += 1) {
            for (let j = 0; j < (box[i]?.length || 0); j += 1) {
                const cell = box[i][j];
                if (!cell || !cellSet.has(cell)) continue;
                rMin = Math.min(rMin, i);
                rMax = Math.max(rMax, i);
                cMin = Math.min(cMin, j);
                cMax = Math.max(cMax, j);
            }
        }
        if (!Number.isFinite(rMin)) return;

        if (mode === 'none') {
            clearTableBorders(table);
        }

        const seen = new Set();
        for (let i = rMin; i <= rMax; i += 1) {
            for (let j = cMin; j <= cMax; j += 1) {
                const cell = box[i]?.[j];
                if (!cell || !cellSet.has(cell) || seen.has(cell)) continue;
                seen.add(cell);

                if (mode === 'none') {
                    clearTableCellBorders(cell);
                    continue;
                }

                const span = getCellSpanInSelectionBox(box, cell, rMin, rMax, cMin, cMax);
                if (!span) continue;

                if (mode === 'all') {
                    setTableCellBorderSide(cell, 'all');
                    continue;
                }

                if (mode === 'outside' || mode === 'top') {
                    if (span.ri0 === rMin) setTableCellBorderSide(cell, 'top');
                }
                if (mode === 'outside' || mode === 'bottom') {
                    if (span.ri1 === rMax) setTableCellBorderSide(cell, 'bottom');
                }
                if (mode === 'outside' || mode === 'left') {
                    if (span.cj0 === cMin) setTableCellBorderSide(cell, 'left');
                }
                if (mode === 'outside' || mode === 'right') {
                    if (span.cj1 === cMax) setTableCellBorderSide(cell, 'right');
                }
                if (mode === 'inside') {
                    if (span.cj1 < cMax) setTableCellBorderSide(cell, 'right');
                    if (span.ri1 < rMax) setTableCellBorderSide(cell, 'bottom');
                }
            }
        }
    });

    return true;
}

const EMS_TABLE_VALIGN_MAP = {
    emsTableValignTop: 'top',
    emsTableValignMiddle: 'middle',
    emsTableValignBottom: 'bottom',
};

export const EMS_TABLE_BORDER_CONTROL = {
    name: 'emsTableBorder',
    template: () =>
        `<span class="ems-toolbar-table-border-icon" aria-hidden="true"><svg viewBox="0 0 22 20" width="20" height="18" focusable="false" aria-hidden="true"><rect x="3.5" y="3.5" width="15" height="13" fill="none" stroke="#334155" stroke-width="1.1"/><line x1="11" y1="3.5" x2="11" y2="16.5" stroke="#334155" stroke-width="0.9"/><line x1="3.5" y1="10" x2="18.5" y2="10" stroke="#334155" stroke-width="0.9"/></svg></span>`,
    tooltip: 'Cell borders',
    list: {
        emsTableBorderAll: 'All borders',
        emsTableBorderOutside: 'Outside borders',
        emsTableBorderInside: 'Inside borders',
        emsTableBorderTop: 'Top border',
        emsTableBorderBottom: 'Bottom border',
        emsTableBorderLeft: 'Left border',
        emsTableBorderRight: 'Right border',
        emsTableBorderNone: 'No border',
    },
    exec: (editor, _current, { control }) => {
        const mode = EMS_TABLE_BORDER_MAP[control?.name];
        if (!mode) return false;
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        armTableToolbarCellStash(editor, getBody);
        const cells = resolveTableFormatCellTargets(editor, getBody);
        if (!cells.length) return false;
        applyTableBorderModeToCells(editor, cells, mode);
        if (typeof editor.synchronizeValues === 'function') {
            editor.synchronizeValues();
        }
        clearEditorTextSelection(editor);
        restoreTableCellSelection(editor, cells);
        scheduleTableCellSelectionKeepAlive(editor, cells);
        editor.e?.fire?.('hidePopup');
        return false;
    },
    isDisabled: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return resolveTableFormatCellTargets(editor, getBody).length === 0;
    },
};

export const EMS_TABLE_VALIGN_CONTROL = {
    name: 'emsValign',
    icon: 'valign',
    tooltip: 'Vertical align (table cells)',
    list: {
        emsTableValignTop: 'Top',
        emsTableValignMiddle: 'Middle',
        emsTableValignBottom: 'Bottom',
    },
    exec: (editor, _current, { control }) => {
        const align = EMS_TABLE_VALIGN_MAP[control?.name];
        if (!align) return;
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        const cells = getTableCellsForCellLevelFormat(editor, getBody);
        if (!cells.length) return false;
        applyVerticalAlignToCells(cells, align);
        if (typeof editor.synchronizeValues === 'function') {
            editor.synchronizeValues();
        }
        return false;
    },
    isDisabled: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return getTableCellsForCellLevelFormat(editor, getBody).length === 0;
    },
};

export const EMS_TABLE_REPEAT_HEADER_CONTROL = {
    name: 'emsRepeatHeader',
    icon: 'th-list',
    tooltip: 'Repeat header row at top of each page',
    exec: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        toggleRepeatHeaderRows(editor, getBody);
        editor.e?.fire('hidePopup');
        return false;
    },
    isActive: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return isRepeatHeaderSelectionActive(editor, getBody);
    },
    isDisabled: (editor) => {
        const getBody =
            typeof editor.__emsClauseEditorBody === 'function'
                ? editor.__emsClauseEditorBody
                : () => editor.editor || null;
        return !canToggleRepeatHeaderRows(editor, getBody);
    },
};

function registerTableBorderControl(jodit, getEditorBody) {
    if (!jodit || jodit.__emsBorderControl) return;
    jodit.__emsBorderControl = true;

    if (!jodit.o.controls.emsTableBorder) {
        jodit.o.controls.emsTableBorder = EMS_TABLE_BORDER_CONTROL;
    }

    Object.keys(EMS_TABLE_BORDER_MAP).forEach((name) => {
        const mode = EMS_TABLE_BORDER_MAP[name];
        jodit.registerCommand(name, () => {
            const cells = resolveTableFormatCellTargets(jodit, getEditorBody);
            if (!cells.length) return false;
            applyTableBorderModeToCells(jodit, cells, mode);
            if (typeof jodit.synchronizeValues === 'function') {
                jodit.synchronizeValues();
            }
            restoreTableCellSelection(jodit, cells);
            return false;
        });
    });
}

function registerTableValignControl(jodit, getEditorBody) {
    if (!jodit || jodit.__emsValignControl) return;
    jodit.__emsValignControl = true;

    if (!jodit.o.controls.emsValign) {
        jodit.o.controls.emsValign = EMS_TABLE_VALIGN_CONTROL;
    }

    Object.keys(EMS_TABLE_VALIGN_MAP).forEach((name) => {
        const align = EMS_TABLE_VALIGN_MAP[name];
        jodit.registerCommand(name, () => {
            const cells = getTableCellsForCellLevelFormat(jodit, getEditorBody);
            if (!cells.length) return false;
            applyVerticalAlignToCells(cells, align);
            if (typeof jodit.synchronizeValues === 'function') {
                jodit.synchronizeValues();
            }
            return false;
        });
    });
}

function registerTableRepeatHeaderControl(jodit, getEditorBody) {
    if (!jodit || jodit.__emsRepeatHeaderControl) return;
    jodit.__emsRepeatHeaderControl = true;

    jodit.registerCommand('emsTableRepeatHeader', () => {
        toggleRepeatHeaderRows(jodit, getEditorBody);
        return false;
    });

    if (!jodit.o.controls.emsRepeatHeader) {
        jodit.o.controls.emsRepeatHeader = EMS_TABLE_REPEAT_HEADER_CONTROL;
    }

}

function tableRowHeightsNeedRelock(table) {
    if (
        !table?.hasAttribute?.('data-ems-row-heights') &&
        !table?.hasAttribute?.('data-ems-row-heights-custom')
    ) {
        return false;
    }
    const rows = getTableRows(table);
    if (!rows.length) return false;
    const stored = (table.getAttribute('data-ems-row-heights') || '')
        .split(',')
        .map((s) => parseFloat(s.trim()));
    return rows.some((row, i) => {
        const expected = stored[i] > 0 ? stored[i] : DEFAULT_TABLE_ROW_HEIGHT;
        const actual = parseCssPx(row.style.height);
        if (actual <= 0) return true;
        return Math.abs(actual - expected) > 1;
    });
}

function registerTableRowHeightStyleGuard(jodit, getEditorBody) {
    if (jodit.__emsRowHeightStyleGuard) return;
    jodit.__emsRowHeightStyleGuard = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root || root.__emsRowHeightStyleGuardObs) return;
        root.__emsRowHeightStyleGuardObs = true;

        let timer = 0;
        const scheduleRelock = () => {
            if (jodit.__emsRowResizing || jodit.__emsColResizing) return;
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = 0;
                let needs = false;
                root.querySelectorAll('table').forEach((table) => {
                    if (tableRowHeightsNeedRelock(table)) needs = true;
                });
                if (needs) applyAllTableRowHeightsInRoot(root);
            }, 32);
        };

        const obs = new MutationObserver((records) => {
            const touched = records.some((r) => {
                if (r.type !== 'attributes' || r.attributeName !== 'style') return false;
                const el = r.target;
                if (!(el instanceof Element)) return false;
                if (el.tagName !== 'TR' && el.tagName !== 'TD' && el.tagName !== 'TH') return false;
                return !!el.closest('table[data-ems-row-heights], table[data-ems-row-heights-custom]');
            });
            if (touched) scheduleRelock();
        });
        obs.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
        jodit.e.on('beforeDestruct', () => {
            obs.disconnect();
            if (timer) window.clearTimeout(timer);
        });
    };

    jodit.e.on('afterInit.emsRowHeightStyleGuard', attach);
    attach();
}

export function registerClauseEditorTableHooks(jodit, getEditorBody, options = {}) {
    if (!jodit) return;
    const { toolbarOnly = false } = options;
    /*
     * Always refresh menu + structure commands (HMR / re-entry). Other hooks stay once-only
     * so we do not stack duplicate mousedown listeners.
     */
    configureTableCellsContextMenu(jodit);
    registerTableStructureCommands(jodit, getEditorBody);
    /* Always rebind resize (HMR / remount) — cleanup inside each register tears down old listeners. */
    registerEmsTableColumnResize(jodit, getEditorBody);
    registerEmsCellSplitPaneResize(jodit, getEditorBody);
    /* Amount copy/paste + cell-click active cell — versioned rebind on focus/HMR. */
    registerConditionalTableSelection(jodit, getEditorBody);
    registerTableRowColumnClipboard(jodit, getEditorBody);
    if (!toolbarOnly) {
        registerTablePopupContextMenuOnly(jodit, getEditorBody);
    }
    if (jodit.__emsTableHooks) return;
    jodit.__emsTableHooks = true;

    jodit.e.on('afterInit.emsTablePx', () => {
        requestAnimationFrame(() => {
            const root =
                (typeof getEditorBody === 'function' && getEditorBody()) ||
                jodit.editor ||
                null;
            if (root) harmonizeInsertedTableCells(root);
        });
    });

    jodit.e.on('afterOpenPopup.emsTableInserter', (popup) => {
        const form = popup?.querySelector?.('.jodit-form__inserter');
        if (!form) return;
        form.querySelectorAll('.jodit-form__options input.jodit-checkbox').forEach((input) => {
            if (String(input.value || '').includes('table-bordered')) {
                input.checked = true;
            }
        });
    });

    registerTableStructureCommands(jodit, getEditorBody);
    registerTableMultiCellFormatting(jodit, getEditorBody);
    registerTableFormatSelectionKeeper(jodit, getEditorBody);
    registerTableCellClearOnDelete(jodit, getEditorBody);
    registerTableTextSelectionGuard(jodit, getEditorBody);
    registerConditionalTableSelection(jodit, getEditorBody);
    registerEditorScrollCleanup(jodit, getEditorBody);
    registerTableBorderControl(jodit, getEditorBody);
    registerTableValignControl(jodit, getEditorBody);
    registerTableRepeatHeaderControl(jodit, getEditorBody);
    if (!toolbarOnly) {
        registerTablePopupContextMenuOnly(jodit, getEditorBody);
        configureTableCellsContextMenu(jodit);
    }
    registerTableRowColumnClipboard(jodit, getEditorBody);
    registerTableArrowNavigation(jodit, getEditorBody);
    registerTableSelectAll(jodit, getEditorBody);
    registerTableRowResize(jodit, getEditorBody);
    registerTableRowHeightStyleGuard(jodit, getEditorBody);

    const observeWorkplace = () => {
        const workplace = jodit.workplace || jodit.container?.querySelector('.jodit-workplace');
        if (!workplace || workplace.__emsFloaterObs) return;
        workplace.__emsFloaterObs = true;
        const obs = new MutationObserver(() => {
            workplace.querySelectorAll(FLOATING_CHROME_SELECTOR).forEach((el) => el.remove());
            jodit.container
                ?.querySelectorAll(FLOATING_CHROME_SELECTOR)
                .forEach((el) => el.remove());
        });
        obs.observe(workplace, { childList: true });
        jodit.e.on('beforeDestruct', () => obs.disconnect());
    };
    jodit.e.on('afterInit', observeWorkplace);
    observeWorkplace();

    jodit.e.on('beforeDestruct.emsTableResizeCleanup', () => {
        try {
            jodit.__emsTableColResizeCleanup?.();
        } catch {
            /* ignore */
        }
        try {
            jodit.__emsTableRowResizeCleanup?.();
        } catch {
            /* ignore */
        }
        hideTableResizeHandles(jodit, { force: true });
    });
    jodit.e.on('blur.emsTableResizeCleanup', () => {
        /* Clicking the body-mounted col/row handle blurs the editor — do not kill an active drag. */
        if (!isJoditInstanceUsable(jodit)) return;
        if (jodit.__emsColResizing || jodit.__emsRowResizing) return;
        window.setTimeout(() => {
            if (!isJoditInstanceUsable(jodit)) return;
            if (jodit.__emsColResizing || jodit.__emsRowResizing) return;
            const ae = document.activeElement;
            if (ae?.closest?.('.ems-table-col-resizer, .ems-table-row-resizer')) return;
            hideTableResizeHandles(jodit, { force: false });
        }, 0);
    });

    let scheduled = false;
    const runHarmonize = () => {
        scheduled = false;
        if (jodit.__emsColResizing || jodit.__emsRowResizing) return;
        if (jodit.__emsSkipTableHarmonize) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;
        if (!jodit.__emsTableStructureJustRan && isCaretInTableCell(jodit, getEditorBody)) {
            root.querySelectorAll('table').forEach((table) => {
                applyTableRowHeightModel(table);
            });
            return;
        }
        harmonizeInsertedTableCells(root);
    };

    const scheduleHarmonize = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                runHarmonize();
                window.setTimeout(runHarmonize, 0);
            });
        });
    };

    jodit.e.on('afterCommand', (command) => {
        const cmd = String(command || '').toLowerCase();
        if (TABLE_STRUCTURE_CMD_RE.test(cmd)) {
            scheduleHarmonize();
        }
    });

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
    if (root && typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver((records) => {
            const touched = records.some((r) => {
                for (const node of r.addedNodes || []) {
                    if (node.nodeType !== 1) continue;
                    const el = /** @type {Element} */ (node);
                    if (el.tagName === 'TABLE') return true;
                    if (el.tagName === 'TR' || el.tagName === 'TD' || el.tagName === 'TH') return true;
                    if (el.querySelector?.('table, tr, td, th')) return true;
                }
                return false;
            });
            if (touched) {
                scheduleHarmonize();
                jodit.__emsBindColResizeListeners?.();
                jodit.__emsBindRowResizeListeners?.();
            }
        });
        obs.observe(root, { childList: true, subtree: true });
        jodit.e.on('beforeDestruct', () => obs.disconnect());
    }
}

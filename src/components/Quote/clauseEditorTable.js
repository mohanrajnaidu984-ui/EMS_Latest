/**
 * Keep clause editor tables uniform when rows/columns are added via Jodit popup.
 */

import { normalizeSize } from 'jodit/esm/core/helpers/normalize/normalize-size.js';
import {
    EMS_QUOTE_PRICING_TABLE_WIDTH,
    EMS_QUOTE_PRICING_TABLE_CELL_PADDING,
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
    const tableModule = getJoditTableModule(jodit);
    const selected = tableModule?.getAllSelectedCells?.() || [];
    if (selected.length) return selected[0];

    if (jodit.__emsActiveTableCell) {
        return jodit.__emsActiveTableCell;
    }

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    const range = jodit.s?.range;
    let node = range?.startContainer;
    if (!node) {
        node = root?.ownerDocument?.getSelection?.()?.anchorNode;
    }
    return getTableCellFromNode(node);
}

function setActiveTableCell(jodit, cell) {
    jodit.__emsActiveTableCell = cell || null;
}

function getSelectedTableCells(jodit) {
    const tableModule = getJoditTableModule(jodit);
    return [...(tableModule?.getAllSelectedCells?.() || [])];
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
    cell.querySelectorAll('u').forEach((el) => unwrapElement(el));
    [cell, ...cell.querySelectorAll('span, p, div, font, li')].forEach((el) => {
        const line = el.style.textDecorationLine || el.style.textDecoration || '';
        if (!decorationIncludes(line, 'underline')) return;
        if (decorationIncludes(line, 'line-through')) {
            el.style.setProperty('text-decoration', 'line-through', 'important');
            el.style.setProperty('text-decoration-line', 'line-through', 'important');
        } else {
            el.style.removeProperty('text-decoration');
            el.style.removeProperty('text-decoration-line');
        }
    });
}

function isCellStrikethrough(cell) {
    if (!cell) return false;
    if (cell.querySelector('s, strike, del')) return true;
    const check = (el) =>
        decorationIncludes(el.style?.textDecoration, 'line-through') ||
        decorationIncludes(el.style?.textDecorationLine, 'line-through');
    return check(cell) || [...cell.querySelectorAll('span, p, div, font, li, s, strike, del')].some(check);
}

function removeStrikethroughFromCell(cell) {
    if (!cell) return;
    cell.querySelectorAll('s, strike, del').forEach((el) => unwrapElement(el));
    [cell, ...cell.querySelectorAll('span, p, div, font, li')].forEach((el) => {
        const line = el.style.textDecorationLine || el.style.textDecoration || '';
        if (!decorationIncludes(line, 'line-through')) return;
        if (decorationIncludes(line, 'underline')) {
            el.style.setProperty('text-decoration', 'underline', 'important');
            el.style.setProperty('text-decoration-line', 'underline', 'important');
        } else {
            el.style.removeProperty('text-decoration');
            el.style.removeProperty('text-decoration-line');
        }
    });
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
        cell.style.textAlign = align;
        cell.setAttribute('align', align);
        cell.querySelectorAll('p, div, span, li').forEach((el) => {
            el.style.textAlign = align;
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

function tryApplyFormatToMultiSelectedCells(jodit, getEditorBody, command, value) {
    const cmd = String(command || '').toLowerCase();
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
            if (e.key !== 'Backspace' && e.key !== 'Delete') return;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            /* Multi-cell clear is handled by registerTableCellClearOnDelete. */
            if (e.defaultPrevented) return;
            clearTableCellBlockSelectionForTextEdit(jodit, getEditorBody);
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

    let workCells = getSelectedTableCells(jodit);
    const cell = workCells[0] || getActiveTableCell(jodit, getEditorBody);
    if (!cell) return false;

    const table = cell.closest('table');
    if (!table) return false;

    const root =
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null;
    if (root && !root.contains(table)) return false;

    if (!workCells.length) {
        workCells = [cell];
    }

    switch (subCmd) {
        case 'splitv':
            tableModule.splitVertical(table);
            break;
        case 'splitg':
            tableModule.splitHorizontal(table);
            break;
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
    if (root) {
        requestAnimationFrame(() => {
            harmonizeInsertedTableCells(root);
            focusCellAfterTableStructureChange(jodit, getEditorBody, table, cell, subCmd);
            snapshotTableEditorHistory(jodit);
            requestAnimationFrame(() => {
                jodit.__emsTableStructureJustRan = false;
            });
        });
    } else {
        focusCellAfterTableStructureChange(jodit, getEditorBody, table, cell, subCmd);
        snapshotTableEditorHistory(jodit);
        requestAnimationFrame(() => {
            jodit.__emsTableStructureJustRan = false;
        });
    }
    return true;
}

function registerTableStructureCommands(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableStructureCmd) return;
    jodit.__emsTableStructureCmd = true;

    const run = (command) => {
        if (!executeTableStructureCommand(jodit, getEditorBody, command)) {
            return;
        }
        return false;
    };

    JODIT_TABLE_COMMANDS.forEach((command) => {
        jodit.e.on(`${joditBeforeCommandEventName(command)}.emsTableCmd`, () => run(command));
    });
}

function isCellEffectivelyEmpty(cell) {
    if (!cell) return true;
    const text = String(cell.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    return !cell.querySelector('img, table, svg');
}

const MIN_TABLE_COLUMN_WIDTH = 24;
const MIN_TABLE_ROW_HEIGHT = 18;

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
    const officeTable = `${s} ${EMS_OFFICE_PASTE_TABLE_SELECTOR.split(', ').join(`, ${s} `)}`;
    const officeTableFluidRows = `${officeTable}:not([data-ems-row-heights]):not([data-ems-row-heights-custom]):not(#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}):not([data-ems-pricing-cols="fixed"])`;
    const officeCell = `${officeTable} th:not([data-ems-valign]), ${officeTable} td:not([data-ems-valign])`;
    const officeInner = `${officeTable} td *, ${officeTable} th *`;
    const officeP = `${officeTable} td p, ${officeTable} th p`;
    const officeBlock = `${officeTable} td p, ${officeTable} th p, ${officeTable} td div, ${officeTable} th div, ${officeTable} td li, ${officeTable} th li`;

    return `
    ${officeTable} {
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        table-layout: fixed !important;
        width: auto !important;
        max-width: none !important;
        margin-top: 4px !important;
        margin-bottom: 4px !important;
        line-height: 1.25 !important;
        page-break-inside: auto !important;
    }
    ${officeCell} {
        box-sizing: border-box !important;
        line-height: 1.15 !important;
        vertical-align: middle !important;
        white-space: normal !important;
        overflow: hidden !important;
        word-wrap: break-word !important;
        overflow-wrap: anywhere !important;
        padding: 0 3px !important;
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
        padding: 0 3px !important;
        line-height: 1.1 !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
    }
    ${officeInner} {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
    }
    ${officeP} {
        text-align: inherit !important;
        margin-left: 0 !important;
        text-indent: 0 !important;
    }
    ${officeBlock} {
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.1 !important;
    }
    ${officeTable} td p + p,
    ${officeTable} th p + p,
    ${officeTable} td > * + *,
    ${officeTable} th > * + * {
        margin-top: 0 !important;
    }`;
}

/**
 * Normal/read preview — hide Excel hairline gridlines and default cell fills unless the
 * user explicitly applied a background color (data-ems-cell-fill).
 */
export function buildEmsOfficePasteTableNormalModeCss(scope) {
    const s = scope || '.clause-content';
    /* Live Jodit body also uses .clause-content — keep full Excel formatting while editing. */
    const scoped = `${s}:not(.jodit-wysiwyg)`;
    const officeTable = `${scoped} table[data-ems-paste-source="office"], ${scoped} table[data-ems-col-widths]`;
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

export function isEmsPricingSummaryTable(table) {
    return (
        table?.id === EMS_AUTO_PRICE_SUMMARY_TABLE_ID ||
        table?.getAttribute?.('data-ems-pricing-cols') === 'fixed'
    );
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
    });
}

function bootstrapEmsPricingSummaryTableRowHeights(table) {
    if (!table || !isEmsPricingSummaryTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    normalizeEmsPricingSummaryTableCellPadding(table);

    if (table.hasAttribute('data-ems-row-heights-custom')) {
        reapplyStoredTableRowHeights(table);
        return;
    }

    const rows = getTableRows(table);
    if (!rows.length) return;

    const storedParts = (table.getAttribute('data-ems-row-heights') || '')
        .split(',')
        .map((s) => parseFloat(s.trim()));

    const heights = rows.map((row, i) => {
        if (storedParts[i] > 0) return storedParts[i];
        if (isRowAllEmpty(row)) return DEFAULT_TABLE_ROW_HEIGHT;
        if (isRowMultiline(row)) return measureRowNaturalHeightPx(row);
        return DEFAULT_TABLE_ROW_HEIGHT;
    });

    applyRowHeights(table, rows, heights);
}

/** Enable EMS column/row drag-resize on the Clause 4 pricing table (px model, syncs to preview via saved HTML). */
export function initializeEmsPricingSummaryTableColumns(table) {
    if (!isEmsPricingSummaryTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;

    applyTableLayoutDefaults(table);

    if (!table.getAttribute('data-ems-col-widths')) {
        table.style.width = EMS_QUOTE_PRICING_TABLE_WIDTH;
        table.style.maxWidth = EMS_QUOTE_PRICING_TABLE_WIDTH;
        bootstrapEmsPricingSummaryTableRowHeights(table);
        return;
    }

    const widths = readColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
    bootstrapEmsPricingSummaryTableRowHeights(table);
}

export function initializeAllEmsPricingSummaryTableColumns(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(`#${EMS_AUTO_PRICE_SUMMARY_TABLE_ID}`).forEach((table) => {
        initializeEmsPricingSummaryTableColumns(table);
    });
}

function applyTableLayoutDefaults(table) {
    if (!table) return;
    table.style.tableLayout = 'fixed';
    if (isEmsPricingSummaryTable(table)) {
        if (!table.getAttribute('data-ems-col-widths')) {
            table.style.width = EMS_QUOTE_PRICING_TABLE_WIDTH;
            table.style.maxWidth = EMS_QUOTE_PRICING_TABLE_WIDTH;
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

/** Enable EMS column drag-resize on Excel/Word pasted tables without stripping their colors. */
export function initializeOfficePastedTableColumns(table) {
    if (!table || !isOfficePasteTable(table)) return;
    if (isTableStructureResizeActiveForTable(table)) return;

    const rows = getTableRows(table);
    if (!rows.length) return;
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount) return;

    if (table.getAttribute('data-ems-col-widths')) {
        const widths = readColumnWidthsPx(table, rows, colCount);
        applyColumnWidths(table, rows, widths);
        return;
    }

    const widths = readOfficeTableColumnWidthsPx(table, rows, colCount);
    applyColumnWidths(table, rows, widths);
}

export function initializeAllOfficePastedTableColumns(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table[data-ems-paste-source="office"], table.ems-office-paste-table').forEach((table) => {
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
    rows.forEach((row, i) => {
        const px = Math.max(MIN_TABLE_ROW_HEIGHT, Math.round(heights[i] || DEFAULT_TABLE_ROW_HEIGHT));
        heights[i] = px;
        lockRowHeight(row, px);
    });
    table.setAttribute('data-ems-row-heights', heights.join(','));
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

export function relaxTableRowHeightsForClausePackMeasure(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('table').forEach((table) => {
        table.querySelectorAll('tr').forEach((row) => {
            row.style.removeProperty('height');
            row.style.removeProperty('min-height');
            row.style.removeProperty('max-height');
            row.querySelectorAll('td, th').forEach((cell) => {
                cell.style.removeProperty('height');
                cell.style.removeProperty('min-height');
                cell.style.removeProperty('max-height');
            });
        });
    });
}

/** Apply row-height model to every table in an editor/preview root (after columns are initialized). */
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
                table.style.width = EMS_QUOTE_PRICING_TABLE_WIDTH;
                table.style.maxWidth = EMS_QUOTE_PRICING_TABLE_WIDTH;
                const rows = getTableRows(table);
                if (!rows.length) return;
                if (table.hasAttribute('data-ems-row-heights-custom')) {
                    reapplyStoredTableRowHeights(table);
                    return;
                }
                const heights = rows.map((row) =>
                    isRowAllEmpty(row) ? DEFAULT_TABLE_ROW_HEIGHT : DEFAULT_TABLE_ROW_HEIGHT
                );
                applyRowHeights(table, rows, heights);
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
    cell.style.boxSizing = 'border-box';
    cell.style.width = w;
    cell.style.minWidth = w;
    cell.style.maxWidth = w;
}

/** Fixed px per column (colgroup + every cell); table width = sum — does not stretch to page. */
function applyColumnWidths(table, rows, widths) {
    const colCount = widths.length;
    if (!colCount) return;

    applyTableLayoutDefaults(table);
    const { cols } = getOrSyncColgroup(table, colCount);
    const { grid } = buildTableCellGrid(table);
    let sum = 0;

    for (let j = 0; j < colCount; j += 1) {
        const px = Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(widths[j] || 0));
        widths[j] = px;
        sum += px;
        if (cols[j]) {
            cols[j].style.width = `${px}px`;
            cols[j].setAttribute('width', String(px));
        }

        const seen = new Set();
        for (let r = 0; r < grid.length; r += 1) {
            const cell = grid[r]?.[j];
            if (!cell || seen.has(cell)) continue;
            seen.add(cell);
            const pos = findCellGridPosition(grid, cell);
            const span = Math.max(1, Number(cell.colSpan) || 1);
            if (pos && pos.col === j && span === 1) {
                lockCellColumnWidth(cell, px);
            } else if (pos && pos.col === j && span > 1) {
                let total = 0;
                for (let k = j; k < j + span && k < colCount; k += 1) total += widths[k] || 0;
                lockCellColumnWidth(cell, total);
            }
        }
        rows.forEach((row) => {
            const cell = row.cells[j];
            if (cell && !seen.has(cell)) lockCellColumnWidth(cell, px);
        });
    }

    table.setAttribute('data-ems-col-widths', widths.join(','));
    if (sum > 0) {
        const w = `${sum}px`;
        if (isEmsPricingSummaryTable(table)) {
            table.style.width = EMS_QUOTE_PRICING_TABLE_WIDTH;
            table.style.maxWidth = EMS_QUOTE_PRICING_TABLE_WIDTH;
            table.style.minWidth = '';
        } else {
            table.style.width = w;
            table.style.minWidth = w;
            table.style.maxWidth = w;
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

    root.querySelectorAll('table').forEach((table) => {
        if (isTableStructureResizeActiveForTable(table)) return;

        if (isOfficePasteTable(table)) {
            initializeOfficePastedTableColumns(table);
        }
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            return;
        }
        if (isTableStructureResizeActiveForTable(table)) return;

        const rows = getTableRows(table);
        if (!rows.length) return;

        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (!colCount) return;

        let widths = readColumnWidthsPx(table, rows, colCount);

        applyTableLayoutDefaults(table);

        const { grid } = buildTableCellGrid(table);

        // New empty column: copy width from column to the left (or right if first).
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

/** Find a cell whose right edge aligns with logical column `colIndex` (handles merged Excel headers). */
function findCellAtColumnRightEdge(table, colIndex) {
    const { grid } = buildTableCellGrid(table);
    for (let r = 0; r < grid.length; r += 1) {
        const cell = grid[r]?.[colIndex];
        if (!cell) continue;
        const pos = findCellGridPosition(grid, cell);
        if (!pos) continue;
        const span = Math.max(1, Number(cell.colSpan) || 1);
        if (pos.col + span - 1 === colIndex) return cell;
    }
    return getTableRows(table).find((row) => row.cells[colIndex])?.cells[colIndex] || null;
}

function getColumnRightEdgeX(table, colIndex) {
    const rows = getTableRows(table);
    const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
    if (!colCount || colIndex < 0 || colIndex >= colCount) return null;

    /* Use rendered cell edges — stored px widths drift when CSS stretches the table. */
    const cell = findCellAtColumnRightEdge(table, colIndex);
    if (cell) return cell.getBoundingClientRect().right;

    const tableRect = table.getBoundingClientRect();
    const stored = table.getAttribute('data-ems-col-widths');
    if (stored) {
        const widths = stored.split(',').map((s) => parseFloat(s.trim()) || 0);
        if (widths.length >= colCount) {
            let offset = 0;
            for (let j = 0; j <= colIndex; j += 1) offset += widths[j] || 0;
            return tableRect.left + offset;
        }
    }

    return null;
}

function isOfficePasteTable(table) {
    return (
        table?.getAttribute?.('data-ems-paste-source') === 'office' ||
        table?.classList?.contains?.('ems-office-paste-table')
    );
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

    jodit.__emsAllowTableCellPopup = true;
    jodit.e.fire('showPopup', table, getPosition, 'cells');
}

function buildTableCellsContextMenu(editor, table, close) {
    const doc = editor?.editor?.ownerDocument || editor?.od?.ownerDocument || document;
    const root = doc.createElement('div');
    root.className = 'ems-table-cells-context-menu';
    root.setAttribute('role', 'menu');

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
            editor.execCommand(item.command, false, table);
            editor.e?.fire?.('hidePopup', 'cells');
            if (typeof close === 'function') close();
        });
        root.appendChild(btn);
    });

    return root;
}

function configureTableCellsContextMenu(jodit) {
    if (!jodit || jodit.__emsCellsContextMenu) return;
    jodit.__emsCellsContextMenu = true;

    if (!jodit.o.controls.emsTableDeleteRowCol) {
        jodit.o.controls.emsTableDeleteRowCol = EMS_TABLE_DELETE_ROW_COL_CONTROL;
    }

    jodit.o.popup = jodit.o.popup || {};
    jodit.o.popup.cells = (editor, table, close) => {
        const content = getInlinePopupPlugin(editor)?.popup?.getElm?.('content');
        if (content) content.textContent = '';
        return buildTableCellsContextMenu(editor, table, close);
    };

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
    });
}

/** Table cell toolbar (fill, borders, merge, delete) — right-click only, not on normal click. */
function registerTablePopupContextMenuOnly(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTablePopupCtxOnly) return;
    jodit.__emsTablePopupCtxOnly = true;

    jodit.e.on('showPopup.tableCtxOnly', (table, getPosition, type) => {
        if (type !== 'cells') return;
        if (!jodit.__emsAllowTableCellPopup) {
            jodit.e.fire('hidePopup', 'cells');
        } else {
            jodit.__emsAllowTableCellPopup = false;
        }
    });

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        if (!root) return;

        if (root.__emsTableCtxMenuJodit === jodit) return;

        if (root.__emsTableCtxMenuHandler) {
            root.removeEventListener('contextmenu', root.__emsTableCtxMenuHandler, true);
            root.removeEventListener('mousedown', root.__emsTableCtxMenuMouseDown, true);
        }

        const onMouseDown = (e) => {
            if (e.button === 2) {
                /* Keep multi-cell block when opening the context menu. */
                if (getSelectedTableCells(jodit).length > 1) {
                    jodit.__emsPreserveMultiTableSelect = true;
                    jodit.__emsSkipTableSelSync = true;
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

            const selected = getSelectedTableCells(jodit);
            const multiKeep =
                selected.length > 1 && selectionContainsCell(jodit, cell);

            jodit.__emsSkipTableSelSync = true;

            if (!multiKeep) {
                setActiveTableCell(jodit, cell);
                focusTableCell(cell, jodit, false);
            } else {
                jodit.__emsActiveTableCell = selected[0];
            }

            openTableCellsContextMenu(jodit, table, () =>
                multiKeep
                    ? getSelectedCellsBounds(selected)
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

            window.setTimeout(() => {
                jodit.__emsSkipTableSelSync = false;
                jodit.__emsPreserveMultiTableSelect = false;
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
/** Hit zone at cell left/right edge for column resize (px). */
// Keep this tight — otherwise normal caret selection near the cell edge turns into resize.
// Word’s resize zone is only a few pixels.
const TABLE_COL_EDGE_NEAR = 6;
/** Pixels from row bottom before the resize handle appears (keep tight for caret placement). */
const TABLE_ROW_EDGE_NEAR = 3;
/** Invisible grab area for the row resize handle (visual line stays thin). */
const TABLE_ROW_RESIZER_HIT_HEIGHT = 14;

function setBodyCursor(jodit, cursor) {
    try {
        const doc = jodit?.ed?.ownerDocument || document;
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
    return jodit.ed?.ownerDocument?.body || document.body;
}

function getEmsTableResizeListenerRoot(jodit, getEditorBody) {
    return (
        jodit.container ||
        getEditorWorkplace(jodit) ||
        (typeof getEditorBody === 'function' && getEditorBody()) ||
        jodit.editor ||
        null
    );
}

function isEmsTableResizeHandle(el) {
    return Boolean(
        el?.classList?.contains('ems-table-col-resizer') ||
        el?.classList?.contains('ems-table-row-resizer')
    );
}

export function hideTableResizeHandles(jodit, { force = false } = {}) {
    if (jodit) {
        jodit.__emsColResizeHide?.(force);
        jodit.__emsRowResizeHide?.(force);
        jodit.__emsColResizeHover = false;
        jodit.__emsRowResizeHover = false;
        if (!jodit.__emsColResizing && !jodit.__emsRowResizing) {
            setBodyCursor(jodit, '');
        }
    }
    const doc = jodit?.ed?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    hideAllEmsTableResizeHandles(doc);
    if (jodit) {
        const workplace = getEditorWorkplace(jodit);
        workplace?.querySelector('.jodit-table-resizer')?.remove();
    }
}

/** Remove stray table resize chrome (handles are appended to document.body). */
export function hideAllEmsTableResizeHandles(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
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

/** Only the dragged column changes width; others stay fixed (colgroup px). */
function registerEmsTableColumnResize(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableColResize) return;
    jodit.__emsTableColResize = true;

    let handle = null;
    let hideTimeout = 0;
    let drag = false;
    let startX = 0;
    let startWidths = null;
    let resizeCol = -1;
    let workTable = null;
    let hoverCell = null;

    const getHandleParent = () => getEmsTableResizeHandleParent(jodit);

    const clearHideTimeout = () => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = 0;
        }
    };

    const clearColResizeHover = () => {
        hoverCell = null;
    };

    const hideHandle = (force = false) => {
        if (drag && !force) return;
        clearHideTimeout();
        clearColResizeHover();
        jodit.__emsColResizeHover = false;
        if (!jodit.__emsRowResizeHover) {
            setBodyCursor(jodit, '');
        }
        if (force) {
            handle?.remove();
            handle = null;
            return;
        }
        hideTimeout = window.setTimeout(() => {
            handle?.remove();
            handle = null;
        }, jodit.defaultTimeout || 80);
    };

    jodit.__emsColResizeHide = hideHandle;

    const ensureHandle = () => {
        if (handle) return;
        const doc = jodit.ed?.ownerDocument || document;
        handle = doc.createElement('div');
        handle.className = 'ems-table-col-resizer';
        handle.setAttribute('title', 'Drag to resize column');
        handle.addEventListener('mousedown', onHandleMouseDown, true);
        handle.addEventListener('mouseenter', clearHideTimeout);
    };

    const beginColResizeDrag = (clientX) => {
        if (!workTable || resizeCol < 0 || jodit.isLocked) return;
        try {
            jodit.e.fire('hidePopup');
        } catch {
            /* ignore */
        }
        jodit.__emsRowResizeHide?.();
        const rows = getTableRows(workTable);
        startWidths = readColumnWidthsPx(
            workTable,
            rows,
            getLogicalColumnCount(rows) || getColumnCount(rows)
        );
        startX = clientX;
        drag = true;
        setColResizingFlag(workTable, true);
        handle?.classList.add('ems-table-col-resizer_moved');
        jodit.lock('ems-table-col-resize');
        setBodyCursor(jodit, 'col-resize');
        document.body.style.userSelect = 'none';

        const onMove = (ev) => applyResize(ev.clientX - startX);
        const onUp = () => {
            drag = false;
            setColResizingFlag(workTable, false);
            handle?.classList.remove('ems-table-col-resizer_moved');
            jodit.unlock();
            jodit.e?.off(jodit.ew, 'mousemove.emsColResize touchmove.emsColResize', onMove);
            jodit.e?.off(jodit.ow, 'mouseup.emsColResize touchend.emsColResize', onUp);
            startWidths = null;
            setBodyCursor(jodit, '');
            document.body.style.removeProperty('user-select');
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            jodit.s?.focus?.();
        };

        jodit.e.on(jodit.ew, 'mousemove.emsColResize touchmove.emsColResize', onMove);
        jodit.e.on(jodit.ow, 'mouseup.emsColResize touchend.emsColResize', onUp);
    };

    const positionHandle = (table, colIndex) => {
        const parent = getHandleParent();
        if (!parent || !table || colIndex < 0) return;
        const edgeX = getColumnRightEdgeX(table, colIndex);
        const anchorCell = findCellAtColumnRightEdge(table, colIndex);
        if (edgeX == null && !anchorCell) return;
        ensureHandle();
        const tableRect = table.getBoundingClientRect();
        const edge = edgeX ?? anchorCell?.getBoundingClientRect().right;
        if (edge == null) return;
        handle.style.position = 'fixed';
        handle.style.left = `${Math.round(edge)}px`;
        handle.style.top = `${Math.round(tableRect.top)}px`;
        handle.style.height = `${Math.max(tableRect.height, anchorCell?.getBoundingClientRect().height || 0)}px`;
        handle.style.display = 'block';
        clearHideTimeout();
        parent.appendChild(handle);
        workTable = table;
        resizeCol = colIndex;
        jodit.__emsColResizeHover = true;
        setBodyCursor(jodit, 'col-resize');
    };

    const applyResize = (delta) => {
        if (!workTable || resizeCol < 0 || !startWidths) return;
        const rows = getTableRows(workTable);
        const next = [...startWidths];
        next[resizeCol] = Math.max(
            MIN_TABLE_COLUMN_WIDTH,
            Math.round(startWidths[resizeCol] + delta)
        );
        applyColumnWidths(workTable, rows, next);
        positionHandle(workTable, resizeCol);
    };

    const setColResizingFlag = (table, active) => {
        if (!table) return;
        if (active) {
            table.setAttribute('data-ems-col-resizing', '1');
            jodit.__emsColResizing = true;
        } else {
            table.removeAttribute('data-ems-col-resizing');
            jodit.__emsColResizing = false;
        }
    };

    const onHandleMouseDown = (e) => {
        if (!workTable || resizeCol < 0 || jodit.isLocked) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        beginColResizeDrag(e.clientX);
    };

    const onEditorMouseMove = (event) => {
        if (jodit.isLocked || drag || jodit.__emsRowResizing) return;
        if (isEmsTableResizeHandle(event.target)) return;
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
        const colIndex = detectColumnResizeIndex(cell, event.clientX);
        if (colIndex < 0) {
            hideHandle();
            return;
        }
        if (hoverCell !== cell) {
            hoverCell = cell;
        }
        positionHandle(table, colIndex);
    };

    const onColEdgeMouseDown = (e) => {
        if (e.button !== 0 || jodit.isLocked || drag) return;
        if (!jodit.__emsColResizeHover) return;
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const cell = e.target?.closest?.('td, th');
        if (!cell || !root?.contains(cell)) return;
        const table = cell.closest('table');
        if (!table) return;
        const colIndex = detectColumnResizeIndex(cell, e.clientX);
        if (colIndex < 0) return;
        e.preventDefault();
        e.stopPropagation();
        positionHandle(table, colIndex);
        beginColResizeDrag(e.clientX);
    };

    const attachColResizeListeners = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const listenerRoot = getEmsTableResizeListenerRoot(jodit, getEditorBody);
        if (!listenerRoot || listenerRoot.__emsColResizeMoveBound) return;
        listenerRoot.__emsColResizeMoveBound = true;
        listenerRoot.addEventListener('mousemove', onEditorMouseMove);
        listenerRoot.addEventListener('mouseleave', (event) => {
            const related = event.relatedTarget;
            if (isEmsTableResizeHandle(related)) return;
            if (related && listenerRoot.contains(related)) return;
            hideHandle();
        });
        if (root && !root.__emsColResizeEdgeBound) {
            root.__emsColResizeEdgeBound = true;
            root.addEventListener('mousedown', onColEdgeMouseDown, true);
        }
    };

    jodit.__emsBindColResizeListeners = attachColResizeListeners;
    jodit.e.on('afterInit', () => requestAnimationFrame(attachColResizeListeners));
    requestAnimationFrame(attachColResizeListeners);
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
        jodit.__emsFormatTableCells = picked;
        jodit.__emsActiveTableCell = startCell;
        table.setAttribute('data-ems-cell-selecting', '1');
        try {
            jodit.s?.sel?.removeAllRanges?.();
        } catch {
            /* ignore */
        }
    } else {
        jodit.__emsFormatTableCells = null;
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
    if (!jodit || jodit.__emsTableRowResize) return;
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
        jodit.__emsRowResizeHover = false;
        if (workTable) clearRowResizeHoverMarkers(workTable);
        if (!jodit.__emsColResizeHover) {
            setBodyCursor(jodit, '');
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
        const doc = jodit.ed?.ownerDocument || document;
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
        if (jodit.isLocked || drag || jodit.__emsColResizing) return;
        if (isEmsTableResizeHandle(event.target)) return;
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

    const attachRowResizeListeners = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) ||
            jodit.editor ||
            null;
        const listenerRoot = getEmsTableResizeListenerRoot(jodit, getEditorBody);
        const bindMove = (el) => {
            if (!el || el.__emsRowResizeMoveBound) return;
            el.__emsRowResizeMoveBound = true;
            el.addEventListener('mousemove', onEditorMouseMove);
            el.addEventListener('mouseleave', (event) => {
                const related = event.relatedTarget;
                if (isEmsTableResizeHandle(related)) return;
                if (related && el.contains(related)) return;
                hideHandle();
            });
        };
        bindMove(listenerRoot);
        if (root && root !== listenerRoot) bindMove(root);
    };

    jodit.__emsBindRowResizeListeners = attachRowResizeListeners;
    jodit.e.on('afterInit', () => requestAnimationFrame(attachRowResizeListeners));
    requestAnimationFrame(attachRowResizeListeners);
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
function registerConditionalTableSelection(jodit, getEditorBody) {
    if (!jodit || jodit.__emsConditionalTableSel) return;
    jodit.__emsConditionalTableSel = true;

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

        root.addEventListener(
            'mousedown',
            (e) => {
                if (e.button === 2) {
                    if (getSelectedTableCells(jodit).length > 1) {
                        jodit.__emsPreserveMultiTableSelect = true;
                        jodit.__emsSkipTableSelSync = true;
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

                if (!e.shiftKey && selected.length >= 2) {
                    clearAllTableCellSelection(jodit);
                    jodit.__emsFormatTableCells = null;
                }

                jodit.__emsTableSelAnchor = cell;
                setActiveTableCell(jodit, cell);
                startCellDrag(cell, table, e.clientX, e.clientY);
            },
            true
        );
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
        const rows = getTableRows(table);
        if (!rows.length) return;
        if (isEmsPricingSummaryTable(table)) {
            initializeEmsPricingSummaryTableColumns(table);
            applyTableRowHeightModel(table);
            return;
        }
        const colCount = getLogicalColumnCount(rows) || getColumnCount(rows);
        if (colCount && table.getAttribute('data-ems-col-widths')) {
            const widths = readColumnWidthsPx(table, rows, colCount);
            applyColumnWidths(table, rows, widths);
        }
        applyTableRowHeightModel(table);
        const mt = table.style.marginTop;
        const mb = table.style.marginBottom;
        if (!mt) table.style.marginTop = '4px';
        if (!mb) table.style.marginBottom = '4px';
    });
}

function sanitizeClonedTableCell(cell) {
    const clone = cell.cloneNode(true);
    if (clone.classList) {
        clone.classList.remove('jodit-table__selected-cell', 'jodit_selected_cell', EMS_TABLE_CELL_SELECTED_CLASS);
    }
    clone.removeAttribute?.('data-jodit-selected-cell');
    return clone;
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
    const cells = getSelectedTableCells(jodit);
    let workCells = cells;
    if (!workCells.length) {
        const cell = getActiveTableCell(jodit, getEditorBody);
        if (!cell) return null;
        workCells = [cell];
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
    clip.rowClones.forEach((rowClone) => {
        const next = rowClone.cloneNode(true);
        insertAfter.parentNode?.insertBefore(next, insertAfter.nextSibling);
        insertAfter = next;
    });

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

function registerTableRowColumnClipboard(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableRowColClipboard) return;
    jodit.__emsTableRowColClipboard = true;

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
        } else if (ctx.fullColumns) {
            e.preventDefault();
            e.stopImmediatePropagation();
            copyTableColumns(jodit, getEditorBody, cut);
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
        jodit.e.on('beforeDestruct', () => {
            root.removeEventListener('keydown', onKeyDown, true);
        });
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
    return [...root.querySelectorAll(EMS_OFFICE_PASTE_TABLE_QUERY)];
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
    // Word pastes frequently use <o:p> and MsoNormal classes without `data-ems-paste-source`.
    if (table.querySelector?.('o\\:p, .MsoNormal, [style*="mso-"]')) return true;
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
        return v !== 'none' && /(underline|line-through|overline)/i.test(v);
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
    const rows = [...table.querySelectorAll('tr')];
    if (!rows.length) return;
    let colCount = 0;
    rows.forEach((row) => {
        colCount = Math.max(colCount, row.cells?.length || 0);
    });
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
    if (!table?.querySelectorAll || !isOfficePasteTableEl(table)) return;

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
    if (!table || !isOfficePasteTableEl(table)) return;

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

/** Lock bold/color/underline on nested runs inside pasted table cells. */
export function reinforceOfficeTableCellRichText(table) {
    if (!table?.querySelectorAll) return;
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
        cell.querySelectorAll('u').forEach((el) => {
            el.style.setProperty('text-decoration', 'underline', 'important');
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
            if (deco && deco !== 'none') {
                el.style.setProperty('text-decoration', deco, 'important');
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
    if (!jodit || jodit.__emsTableHooks) return;
    jodit.__emsTableHooks = true;
    const { toolbarOnly = false } = options;

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
    registerEmsTableColumnResize(jodit, getEditorBody);
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
        hideTableResizeHandles(jodit, { force: true });
    });
    jodit.e.on('blur.emsTableResizeCleanup', () => {
        hideTableResizeHandles(jodit, { force: true });
    });

    let scheduled = false;
    const runHarmonize = () => {
        scheduled = false;
        if (jodit.__emsColResizing || jodit.__emsRowResizing) return;
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

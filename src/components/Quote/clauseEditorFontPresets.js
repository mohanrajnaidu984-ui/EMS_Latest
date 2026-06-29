/**
 * Clause editor font family list — aligned with quote preview / PDF (Segoe UI).
 */

import { normalizeSize } from 'jodit/esm/core/helpers/normalize/normalize-size.js';
import { Dom } from 'jodit/esm/core/dom/dom.js';
import { css } from 'jodit/esm/core/helpers/utils/css.js';
import { QUOTE_PREVIEW_FONT_STACK } from './quotePrintDocumentHtml';
import {
    restoreClauseEditorFormatSelection,
    closeListToolbarPopup,
    captureClauseEditorSelectionBookmark,
    scheduleClauseEditorSelectionRestore,
} from './clauseEditorListPresets';
import {
    tryApplyToolbarCommandToEditableClauseHeading,
    readEditableClauseHeadingFontFamily,
    readEditableClauseHeadingFontSizePt,
    getActiveEditableClauseHeading,
    shouldDeferClauseFormatToBody,
} from './clauseEditorExternalHeading';
import {
    tryApplyTableCellFormatCommand,
    readUniformTableCellStyle,
    armTableToolbarCellStash,
} from './clauseEditorTable';

export const EMS_CLAUSE_EDITOR_FONT_STACK = QUOTE_PREVIEW_FONT_STACK;

/** Word-like point sizes for the toolbar font-size dropdown. */
export const EMS_CLAUSE_EDITOR_FONT_SIZE_LIST = [
    8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
];

/** Clause body default (13px CSS ≈ 9pt). */
export const EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT = 9;

function cssSizeToPtNumber(sizeValue) {
    const match = String(sizeValue || '')
        .trim()
        .match(/^([\d.]+)(px|pt)$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num)) return null;
    if (match[2].toLowerCase() === 'pt') return num;
    return num * 0.75;
}

function formatPtForToolbar(pt) {
    if (!Number.isFinite(pt)) return '';
    return Number.isInteger(pt) ? String(pt) : String(Math.round(pt * 2) / 2);
}

function snapFontSizePtForToolbar(pt) {
    if (!Number.isFinite(pt)) return String(EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT);
    if (Math.abs(pt - EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT) <= 0.85) {
        return String(EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT);
    }
    let best = EMS_CLAUSE_EDITOR_FONT_SIZE_LIST[0];
    let bestDiff = Math.abs(pt - best);
    for (const item of EMS_CLAUSE_EDITOR_FONT_SIZE_LIST) {
        const diff = Math.abs(pt - item);
        if (diff < bestDiff) {
            best = item;
            bestDiff = diff;
        }
    }
    return formatPtForToolbar(best);
}

/** Default body size from the editor root computed style (falls back to 9pt). */
export function getClauseEditorDefaultFontSizePt(editor) {
    const root = editor?.editor;
    if (!root) return String(EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT);
    const computed = css(root, 'font-size', false);
    const pt = cssSizeToPtNumber(computed);
    return pt != null ? snapFontSizePtForToolbar(pt) : String(EMS_CLAUSE_EDITOR_DEFAULT_FONT_SIZE_PT);
}

/** Jodit font dropdown: stack key → display label. */
export const EMS_CLAUSE_EDITOR_FONT_LIST = {
    [EMS_CLAUSE_EDITOR_FONT_STACK]: 'Segoe UI',
    'Arial, Helvetica, sans-serif': 'Arial',
    "'Courier New', Courier, monospace": 'Courier New',
    'Georgia, Palatino, serif': 'Georgia',
    "'Lucida Sans Unicode', 'Lucida Grande', sans-serif": 'Lucida Sans Unicode',
    'Tahoma, Geneva, sans-serif': 'Tahoma',
    "'Times New Roman', Times, serif": 'Times New Roman',
    "'Trebuchet MS', Helvetica, sans-serif": 'Trebuchet MS',
    'Helvetica, sans-serif': 'Helvetica',
    'Impact, Charcoal, sans-serif': 'Impact',
    'Verdana, Geneva, sans-serif': 'Verdana',
};

const normalizeFontFamily = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/['"]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

/** Map computed font-family to a list key for Jodit font select. */
export function resolveClauseEditorFontListKey(fontFamily) {
    const norm = normalizeFontFamily(fontFamily);
    if (!norm) return EMS_CLAUSE_EDITOR_FONT_STACK;
    if (norm.includes('segoe ui')) return EMS_CLAUSE_EDITOR_FONT_STACK;

    for (const stack of Object.keys(EMS_CLAUSE_EDITOR_FONT_LIST)) {
        const stackNorm = normalizeFontFamily(stack);
        const first = stackNorm.split(',')[0].trim();
        if (norm === stackNorm || norm.startsWith(`${first},`) || norm === first) {
            return stack;
        }
    }

    return EMS_CLAUSE_EDITOR_FONT_STACK;
}

/** Human label shown in the toolbar font dropdown (e.g. Segoe UI). */
export function resolveClauseEditorFontToolbarLabel(fontFamily) {
    const key = resolveClauseEditorFontListKey(fontFamily);
    if (EMS_CLAUSE_EDITOR_FONT_LIST[key]) return EMS_CLAUSE_EDITOR_FONT_LIST[key];
    const first = String(fontFamily || '')
        .split(',')[0]
        .replace(/['"]+/g, '')
        .trim();
    return first || 'Segoe UI';
}

export function readClauseEditorSelectionFontFamily(editor) {
    const tableFamily = readUniformTableCellStyle(editor, 'font-family');
    if (tableFamily) return tableFamily;

    const current = editor?.s?.current?.();
    if (!current || !editor?.editor) return '';
    let foundInline = '';
    let foundComputed = '';
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            const inline = css(node, 'font-family', true);
            if (inline) {
                foundInline = inline.toString();
                return true;
            }
            if (!foundComputed) {
                const computed = css(node, 'font-family', false);
                if (computed) foundComputed = computed.toString();
            }
        },
        editor.editor
    );
    if (foundInline) return foundInline;
    if (foundComputed) return foundComputed;
    const box = Dom.closest(current, Dom.isElement, editor.editor) || editor.editor;
    const inline = css(box, 'font-family', true);
    if (inline) return inline.toString();
    const computed = css(box, 'font-family', false);
    return computed ? computed.toString() : '';
}

/** Selection font size as pt for the toolbar (inline first, then computed). */
export function readClauseEditorSelectionFontSizePt(editor) {
    const tableSize = readUniformTableCellStyle(editor, 'font-size');
    if (tableSize) {
        const pt = cssSizeToPtNumber(tableSize);
        if (pt != null) return snapFontSizePtForToolbar(pt);
    }

    const current = editor?.s?.current?.();
    if (!current || !editor?.editor) return '';

    let inlinePt = null;
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            const val = css(node, 'font-size', true);
            if (val) {
                inlinePt = cssSizeToPtNumber(val);
                return true;
            }
        },
        editor.editor
    );
    if (inlinePt != null) return snapFontSizePtForToolbar(inlinePt);

    let computedPt = null;
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            const val = css(node, 'font-size', false);
            if (val) {
                computedPt = cssSizeToPtNumber(val);
                return true;
            }
        },
        editor.editor
    );
    if (computedPt != null) return snapFontSizePtForToolbar(computedPt);

    return getClauseEditorDefaultFontSizePt(editor);
}

const fontNormalize = (v) =>
    String(v || '')
        .toLowerCase()
        .replace(/['"]+/g, '')
        .replace(/[^a-z0-9-]+/g, ',');

const fontSizeNormalize = (v) => String(v).replace(/(px|pt)$/i, '');

const applyFontStyleWithSpanFallback = (editor, styleKey, styleValue) => {
    const root = editor?.editor;
    if (!root) return false;
    const doc = root.ownerDocument;
    const sel = doc?.getSelection?.();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return false;

    const span = doc.createElement('span');
    span.style[styleKey] = styleValue;
    try {
        range.surroundContents(span);
    } catch {
        const extracted = range.extractContents();
        span.appendChild(extracted);
        range.insertNode(span);
        sel.removeAllRanges();
        const next = doc.createRange();
        next.selectNodeContents(span);
        sel.addRange(next);
    }
    return true;
};

const selectionHasNonCollapsedRange = (editor) => {
    const range = editor?.s?.range;
    if (range && !range.collapsed) return true;
    const sel = editor?.editor?.ownerDocument?.getSelection?.();
    return Boolean(sel?.rangeCount && !sel.getRangeAt(0).collapsed);
};

const selectionHasInlineFontFamily = (editor) => {
    const current = editor?.s?.current?.();
    if (!current || !editor?.editor) return false;
    let found = false;
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            if (css(node, 'font-family', true)) {
                found = true;
                return true;
            }
        },
        editor.editor
    );
    return found;
};

const applyFontCommand = (editor, command, rawValue) => {
    if (rawValue == null || rawValue === '') return false;

    if (
        tryApplyToolbarCommandToEditableClauseHeading(
            command,
            rawValue,
            editor?.o?.defaultFontSizePoints || 'pt',
            editor
        )
    ) {
        editor?.e?.fire?.('change');
        editor?.e?.fire?.('updateToolbar');
        return true;
    }

    const getBody =
        typeof editor?.__emsClauseEditorBody === 'function'
            ? editor.__emsClauseEditorBody
            : () => editor?.editor || null;
    armTableToolbarCellStash(editor, getBody);
    if (tryApplyTableCellFormatCommand(editor, getBody, command, rawValue)) {
        editor?.e?.fire?.('change');
        return true;
    }

    if (!editor?.editor) return false;

    const selectionBookmark = captureClauseEditorSelectionBookmark(editor);
    restoreClauseEditorFormatSelection(editor);
    try {
        editor.s?.focus?.();
    } catch {
        /* ignore */
    }
    if (!selectionHasNonCollapsedRange(editor)) {
        restoreClauseEditorFormatSelection(editor);
    }
    if (!selectionHasNonCollapsedRange(editor)) return false;

    const value =
        command === 'fontsize'
            ? normalizeSize(rawValue, editor?.o?.defaultFontSizePoints || 'pt')
            : rawValue;

    const style =
        command === 'fontsize' ? { fontSize: value } : { fontFamily: value };
    const styleKey = command === 'fontsize' ? 'fontSize' : 'fontFamily';

    let applied = false;
    try {
        editor.s?.commitStyle?.({
            attributes: { style },
        });
        applied = true;
    } catch {
        applied = false;
    }

    if (
        !applied ||
        (command === 'fontname' && !selectionHasInlineFontFamily(editor))
    ) {
        if (applyFontStyleWithSpanFallback(editor, styleKey, value)) {
            applied = true;
        }
    }

    if (!applied) return false;

    const range = editor.s?.range;
    if (range && !range.collapsed) {
        editor.__emsLastGoodListRange = range.cloneRange();
    }

    if (typeof editor.synchronizeValues === 'function') {
        editor.synchronizeValues();
    }
    editor.e?.fire?.('change');
    editor.e?.fire?.('updateToolbar');
    scheduleClauseEditorSelectionRestore(editor, selectionBookmark);
    return true;
};

const resolveFontControlArg = (control) => control?.args?.[0];

/** Apply font on list-item pick only — parent button click opens the dropdown. */
const runFontToolbarChildExec = (editor, command, control, button) => {
    applyFontCommand(editor, command, resolveFontControlArg(control));
    closeListToolbarPopup(editor, button);
};

/** Jodit font-family toolbar control — shows selected text font name. */
export const EMS_FONT_TOOLBAR_CONTROL = {
    component: 'select',
    command: 'fontname',
    list: EMS_CLAUSE_EDITOR_FONT_LIST,
    tooltip: 'Font family',
    childExec: (editor, _current, { control, button }) => {
        runFontToolbarChildExec(editor, 'fontname', control, button);
    },
    data: {
        cssRule: 'font-family',
        normalize: fontNormalize,
    },
    textTemplate: (_editor, value) => {
        const raw = String(value || '');
        if (EMS_CLAUSE_EDITOR_FONT_LIST[raw]) return EMS_CLAUSE_EDITOR_FONT_LIST[raw];
        return resolveClauseEditorFontToolbarLabel(raw) || 'Segoe UI';
    },
    value: (editor) => {
        if (getActiveEditableClauseHeading() && !shouldDeferClauseFormatToBody(editor)) {
            const headingFamily = readEditableClauseHeadingFontFamily();
            if (headingFamily) return resolveClauseEditorFontListKey(headingFamily);
        }
        const family = readClauseEditorSelectionFontFamily(editor);
        return family ? resolveClauseEditorFontListKey(family) : EMS_CLAUSE_EDITOR_FONT_STACK;
    },
    isChildActive: (editor, button) => {
        const value = button.state.value;
        const normalize = button.control.data?.normalize ?? ((v) => v);
        return Boolean(
            value && button.control.args && normalize(button.control.args[0].toString()) === normalize(value.toString())
        );
    },
    isActive: (editor, button) => {
        const value = button.state.value;
        if (!value) return false;
        const normalize = button.control.data?.normalize ?? ((v) => v);
        const list = button.control.list;
        const keys = Array.isArray(list) ? list.map((n) => normalize(String(n))) : Object.keys(list).map(normalize);
        return keys.includes(normalize(value.toString()));
    },
};

/** Jodit font-size toolbar control — shows selected text size in pt. */
export const EMS_FONTSIZE_TOOLBAR_CONTROL = {
    component: 'select',
    command: 'fontsize',
    list: EMS_CLAUSE_EDITOR_FONT_SIZE_LIST,
    tooltip: 'Font size',
    childExec: (editor, _current, { control, button }) => {
        runFontToolbarChildExec(editor, 'fontsize', control, button);
    },
    data: {
        cssRule: 'font-size',
        normalize: fontSizeNormalize,
    },
    textTemplate: (_editor, value) => String(value ?? ''),
    childTemplate: (editor, _key, value) => `${value}${editor.o.defaultFontSizePoints}`,
    value: (editor) => {
        if (getActiveEditableClauseHeading() && !shouldDeferClauseFormatToBody(editor)) {
            const headingSize = readEditableClauseHeadingFontSizePt();
            if (headingSize) return headingSize;
        }
        return readClauseEditorSelectionFontSizePt(editor) || getClauseEditorDefaultFontSizePt(editor);
    },
    isChildActive: (editor, button) => {
        const value = button.state.value;
        const normalize = button.control.data?.normalize ?? ((v) => v);
        return Boolean(
            value && button.control.args && normalize(button.control.args[0].toString()) === normalize(value.toString())
        );
    },
    isActive: (editor, button) => {
        const value = button.state.value;
        if (!value) return false;
        const normalize = button.control.data?.normalize ?? ((v) => v);
        const list = button.control.list;
        const keys = Array.isArray(list) ? list.map((n) => normalize(String(n))) : Object.keys(list).map(normalize);
        return keys.includes(normalize(value.toString()));
    },
};

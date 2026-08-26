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

/**
 * Jodit normalizeSize('10.5', 'pt') returns bare "10.5" (no unit) — invalid CSS,
 * so the size is ignored and text keeps inherited ~9pt. Always finish with a unit.
 */
function ensureFontSizeCssValue(size, defaultUnit = 'pt') {
    const s = String(size ?? '').trim();
    if (!s) return s;
    if (/(-?[\d.]+)(px|pt|em|rem|%)$/i.test(s)) return s;
    if (/^-?[\d.]+$/i.test(s)) {
        const unit = String(defaultUnit || 'pt').replace(/[^a-z%]/gi, '') || 'pt';
        return `${s}${unit}`;
    }
    return s;
}

const TYPO_REINFORCE_SELECTOR =
    'span, font, p, div, li, td, th, b, i, u, strong, em, a, h1, h2, h3, h4, h5, h6, label, sub, sup';

function rangesIntersect(a, b) {
    try {
        return (
            a.compareBoundaryPoints(Range.END_TO_START, b) < 0 &&
            a.compareBoundaryPoints(Range.START_TO_END, b) > 0
        );
    } catch {
        return false;
    }
}

function elementIntersectsRange(el, range, doc) {
    if (!el || !range) return false;
    try {
        if (typeof range.intersectsNode === 'function') {
            return range.intersectsNode(el);
        }
    } catch {
        /* falls through */
    }
    try {
        const probe = doc.createRange();
        probe.selectNodeContents(el);
        return rangesIntersect(range, probe);
    } catch {
        return false;
    }
}

/**
 * Force font-size / font-family onto elements in the selection.
 * commitStyle alone often wraps a parent span while nested Word/paste spans keep
 * their own font-size — so only part of the selection appears to change.
 * @param {object} editor
 * @param {string} cssProp
 * @param {string} cssValue
 * @param {Range|null} [lockedRange] — capture before commitStyle; selection often collapses after.
 */
function reinforceTypographyInSelection(editor, cssProp, cssValue, lockedRange = null) {
    const root = editor?.editor;
    if (!root || !cssProp || cssValue == null || cssValue === '') return false;
    const doc = root.ownerDocument;
    let range = lockedRange;
    if (!range) {
        const sel = doc?.getSelection?.();
        if (!sel?.rangeCount) return false;
        range = sel.getRangeAt(0);
    }
    if (!range || range.collapsed) return false;

    let workingRange;
    try {
        workingRange = range.cloneRange();
    } catch {
        workingRange = range;
    }

    const ancestorNode = workingRange.commonAncestorContainer;
    const ancestorEl =
        ancestorNode?.nodeType === 3 ? ancestorNode.parentElement : ancestorNode;
    if (!ancestorEl || !root.contains(ancestorEl)) return false;

    const elementFullyInRange = (el) => {
        try {
            const probe = doc.createRange();
            probe.selectNode(el);
            return (
                workingRange.compareBoundaryPoints(Range.START_TO_START, probe) <= 0 &&
                workingRange.compareBoundaryPoints(Range.END_TO_END, probe) >= 0
            );
        } catch {
            try {
                const probe = doc.createRange();
                probe.selectNodeContents(el);
                return (
                    workingRange.compareBoundaryPoints(Range.START_TO_START, probe) <= 0 &&
                    workingRange.compareBoundaryPoints(Range.END_TO_END, probe) >= 0
                );
            } catch {
                return false;
            }
        }
    };

    const hasOwnTypo = (el) => {
        if (!el?.style && el?.tagName !== 'FONT') return false;
        if (cssProp === 'font-size') {
            if (el.style?.fontSize || el.style?.getPropertyValue?.('font-size')) return true;
            if (el.tagName === 'FONT' && el.getAttribute('size')) return true;
            const styleAttr = el.getAttribute?.('style') || '';
            if (/font-size\s*:/i.test(styleAttr)) return true;
            return false;
        }
        if (el.style?.fontFamily || el.style?.getPropertyValue?.('font-family')) return true;
        if (el.tagName === 'FONT' && el.getAttribute('face')) return true;
        return false;
    };

    const seen = new Set();
    const targets = [];
    const consider = (el) => {
        if (!el || seen.has(el) || !root.contains(el) || el === root) return;
        if (!elementIntersectsRange(el, workingRange, doc)) return;
        /*
         * Font-size: force onto every intersecting carrier. Nested Word/paste spans
         * (often 9pt / 12px) must not keep a different size inside the selection.
         * Font-family: keep the narrower rule to avoid restyling unselected siblings.
         */
        if (cssProp === 'font-size') {
            seen.add(el);
            targets.push(el);
            return;
        }
        if (!elementFullyInRange(el) && !hasOwnTypo(el)) return;
        seen.add(el);
        targets.push(el);
    };

    if (ancestorEl !== root && ancestorEl.nodeType === 1) {
        consider(ancestorEl);
    }
    const scope = ancestorEl.nodeType === 1 ? ancestorEl : root;
    scope.querySelectorAll?.(TYPO_REINFORCE_SELECTOR).forEach(consider);
    if (cssProp === 'font-size') {
        scope.querySelectorAll?.('[style*="font-size"], font[size]').forEach(consider);
    }
    /* Ctrl+A: common ancestor is often the editor root — still walk all typography nodes. */
    if (scope === root || !targets.length) {
        root.querySelectorAll?.(TYPO_REINFORCE_SELECTOR).forEach(consider);
        if (cssProp === 'font-size') {
            root.querySelectorAll?.('[style*="font-size"], font[size]').forEach(consider);
        }
    }

    /* Text nodes in the selection whose parents were missed — climb and force size. */
    if (cssProp === 'font-size') {
        try {
            const walker = doc.createTreeWalker(
                workingRange.commonAncestorContainer,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (!node?.nodeValue || !String(node.nodeValue).replace(/\u00a0/g, ' ').trim()) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        try {
                            return workingRange.intersectsNode(node)
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_REJECT;
                        } catch {
                            return NodeFilter.FILTER_REJECT;
                        }
                    },
                }
            );
            let textNode = walker.nextNode();
            while (textNode) {
                let el = textNode.parentElement;
                while (el && el !== root) {
                    if (el.nodeType === 1) consider(el);
                    el = el.parentElement;
                }
                textNode = walker.nextNode();
            }
        } catch {
            /* ignore walker failures */
        }
    }

    if (!targets.length) {
        return applyFontStyleWithSpanFallback(
            editor,
            cssProp === 'font-size' ? 'fontSize' : 'fontFamily',
            cssValue
        );
    }

    targets.forEach((el) => {
        try {
            el.style?.setProperty(cssProp, cssValue, 'important');
            if (cssProp === 'font-size' && el.tagName === 'FONT') {
                el.removeAttribute('size');
            }
            if (cssProp === 'font-family' && el.tagName === 'FONT') {
                el.removeAttribute('face');
            }
        } catch {
            /* ignore */
        }
    });
    return true;
}

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
            ? ensureFontSizeCssValue(
                  normalizeSize(rawValue, editor?.o?.defaultFontSizePoints || 'pt'),
                  editor?.o?.defaultFontSizePoints || 'pt'
              )
            : rawValue;

    const style =
        command === 'fontsize' ? { fontSize: value } : { fontFamily: value };
    const styleKey = command === 'fontsize' ? 'fontSize' : 'fontFamily';
    const cssProp = command === 'fontsize' ? 'font-size' : 'font-family';

    /* Capture selection before commitStyle — it often collapses the live selection. */
    let lockedRange = null;
    try {
        const live = editor.s?.range;
        if (live && !live.collapsed) {
            lockedRange = live.cloneRange();
        } else {
            const sel = editor.editor?.ownerDocument?.getSelection?.();
            if (sel?.rangeCount) {
                const r = sel.getRangeAt(0);
                if (r && !r.collapsed) lockedRange = r.cloneRange();
            }
        }
    } catch {
        lockedRange = null;
    }

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

    /* Always reinforce nested spans/fonts so Word/paste inline sizes cannot win. */
    if (reinforceTypographyInSelection(editor, cssProp, value, lockedRange)) {
        applied = true;
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

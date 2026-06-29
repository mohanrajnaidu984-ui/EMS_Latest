/**
 * Clause section heading (outside Jodit) — toolbar formatting while editing.
 */

import { normalizeSize } from 'jodit/esm/core/helpers/normalize/normalize-size.js';
import { stripClauseEditorExportEmptyNodes } from './clauseEditorExportHtml';

export const EMS_EDITABLE_CLAUSE_HEADING_SELECTOR =
    '.quote-clause-block--editing .quote-clause-heading-panel h3[data-ems-clause-heading-edit]';

let headingSavedRange = null;
let lastGoodHeadingRange = null;

const styleKeyToCssProp = (styleKey) =>
    String(styleKey).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Typography set on the h3 during toolbar edits — must be embedded in innerHTML on save. */
const HEADING_SERIALIZE_PROPS = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'color',
    'line-height',
    'text-decoration',
];

const escapeHtmlAttr = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function readHeadingInlineTypography(heading) {
    const out = [];
    for (const prop of HEADING_SERIALIZE_PROPS) {
        const val = heading.style.getPropertyValue(prop);
        if (!val || !String(val).trim()) continue;
        out.push({
            prop,
            val: String(val).trim(),
            important: heading.style.getPropertyPriority(prop) === 'important',
        });
    }
    return out;
}

function headingHasCustomFormatting(heading) {
    if (!heading) return false;
    const hasInline = HEADING_SERIALIZE_PROPS.some((prop) => {
        const val = heading.style.getPropertyValue(prop);
        return val && String(val).trim();
    });
    if (hasInline) return true;
    return Boolean(heading.querySelector('[style]'));
}

/** User-changed heading font only — avoid embedding full computed stack (causes layout jump on exit). */
const HEADING_USER_TYPO_PROPS = ['font-family', 'font-size'];

function readHeadingUserTypographyForPersist(heading) {
    const out = [];
    for (const prop of HEADING_USER_TYPO_PROPS) {
        const val = heading.style.getPropertyValue(prop);
        if (!val || !String(val).trim()) continue;
        out.push({
            prop,
            val: String(val).trim(),
            important: heading.style.getPropertyPriority(prop) === 'important',
        });
    }
    if (out.length) return out;

    const styled = heading.querySelector(':scope > span[style], :scope > font[style]');
    if (!styled?.style) return out;
    for (const prop of HEADING_USER_TYPO_PROPS) {
        const val = styled.style.getPropertyValue(prop);
        if (!val || !String(val).trim()) continue;
        out.push({
            prop,
            val: String(val).trim(),
            important: styled.style.getPropertyPriority(prop) === 'important',
        });
    }
    return out;
}

export function clauseHeadingPlainText(html) {
    if (!html) return '';
    if (typeof document === 'undefined') {
        return String(html)
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    const el = document.createElement('div');
    el.innerHTML = html;
    return String(el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function clauseHeadingHtmlHasCustomTypography(html) {
    if (!html || !String(html).trim()) return false;
    const s = String(html);
    if (!/<[a-z][\s\S]*>/i.test(s)) return false;
    return /\bstyle\s*=\s*["'][^"']*\b(font-family|font-size|font-weight|font-style|color|line-height|text-decoration)\s*:/i.test(
        s
    );
}

function typographyToStyleAttr(entries) {
    return entries
        .map(({ prop, val, important }) => `${prop}: ${val}${important ? ' !important' : ''}`)
        .join('; ');
}

function mergeTypographyIntoSpanStyle(existingStyle, entries) {
    let style = String(existingStyle || '').trim();
    for (const { prop, val, important } of entries) {
        const chunk = `${prop}: ${val}${important ? ' !important' : ''}`;
        const re = new RegExp(`(?:^|;)\\s*${prop.replace(/-/g, '\\$&')}\\s*:[^;]*`, 'i');
        if (re.test(style)) {
            style = style.replace(re, chunk);
        } else {
            if (style && !style.endsWith(';')) style += ';';
            style += ` ${chunk}`;
        }
    }
    return style.trim();
}

function syncHeadingUserTypographyToInnerContent(heading) {
    const typography = readHeadingUserTypographyForPersist(heading);
    if (!typography.length) return;

    const onlySpan = heading.querySelector(':scope > span:only-child');
    if (onlySpan?.tagName === 'SPAN') {
        onlySpan.setAttribute('style', mergeTypographyIntoSpanStyle(onlySpan.getAttribute('style'), typography));
        return;
    }
    if (!heading.childNodes.length) return;

    const span = heading.ownerDocument.createElement('span');
    span.setAttribute('style', typographyToStyleAttr(typography));
    while (heading.firstChild) {
        span.appendChild(heading.firstChild);
    }
    heading.appendChild(span);
}

export function getActiveEditableClauseHeading() {
    if (typeof document === 'undefined') return null;
    return document.querySelector(EMS_EDITABLE_CLAUSE_HEADING_SELECTOR);
}

/** Read formatted heading HTML from the active preview edit session (for persistence on exit). */
export function readEditableClauseHeadingInnerHtml() {
    const heading = getActiveEditableClauseHeading();
    if (!heading) return '';

    const inner = stripClauseEditorExportEmptyNodes(String(heading.innerHTML || '').trim());
    if (!inner) return '';

    const typography = readHeadingUserTypographyForPersist(heading);
    if (!typography.length) return inner;

    const onlySpan = heading.querySelector(':scope > span:only-child');
    if (onlySpan?.tagName === 'SPAN') {
        const merged = mergeTypographyIntoSpanStyle(onlySpan.getAttribute('style'), typography);
        return `<span style="${escapeHtmlAttr(merged)}">${onlySpan.innerHTML}</span>`;
    }

    return `<span style="${escapeHtmlAttr(typographyToStyleAttr(typography))}">${inner}</span>`;
}

export function isSelectionInEditableClauseHeading(sel = document.getSelection?.()) {
    const heading = getActiveEditableClauseHeading();
    if (!heading || !sel?.anchorNode) return false;
    return heading.contains(sel.anchorNode);
}

export function stashEditableClauseHeadingSelection() {
    const heading = getActiveEditableClauseHeading();
    const sel = document.getSelection?.();
    if (!heading || !sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!heading.contains(range.commonAncestorContainer)) return;
    headingSavedRange = range.cloneRange();
    lastGoodHeadingRange = range.cloneRange();
}

export function clearEditableClauseHeadingSelectionStash() {
    headingSavedRange = null;
    lastGoodHeadingRange = null;
}

function isRangeInsideHeading(heading, range) {
    if (!heading || !range) return false;
    try {
        return heading.contains(range.commonAncestorContainer);
    } catch {
        return false;
    }
}

function isClauseBodySelectionActive() {
    const wys = document.querySelector('#quote-preview .quote-clause-inline-editor .jodit-wysiwyg');
    if (!wys) return false;
    const sel = document.getSelection?.();
    if (sel?.anchorNode && wys.contains(sel.anchorNode)) return true;
    return Boolean(wys.contains(document.activeElement));
}

/** Stash heading selection before toolbar steals focus (capture phase). */
export function stashEditableClauseHeadingForToolbar() {
    const heading = getActiveEditableClauseHeading();
    if (!heading) return;
    if (isClauseBodySelectionActive()) {
        const sel = document.getSelection?.();
        if (sel?.anchorNode && !heading.contains(sel.anchorNode)) {
            clearEditableClauseHeadingSelectionStash();
            return;
        }
    }
    const sel = document.getSelection?.();
    if (sel?.rangeCount && !sel.isCollapsed && heading.contains(sel.anchorNode)) {
        stashEditableClauseHeadingSelection();
        return;
    }
    if (lastGoodHeadingRange && isRangeInsideHeading(heading, lastGoodHeadingRange)) {
        headingSavedRange = lastGoodHeadingRange.cloneRange();
    }
}

function isClauseHeadingFormattingIntent() {
    const heading = getActiveEditableClauseHeading();
    if (!heading) return false;
    if (isSelectionInEditableClauseHeading()) return true;
    if (heading.contains(document.activeElement)) return true;
    if (isClauseBodySelectionActive()) {
        const sel = document.getSelection?.();
        if (sel?.anchorNode && !heading.contains(sel.anchorNode)) return false;
    }
    const range = headingSavedRange || lastGoodHeadingRange;
    return isRangeInsideHeading(heading, range);
}

export function shouldDeferClauseFormatToBody(jodit) {
    if (isClauseHeadingFormattingIntent()) return false;
    if (jodit?.__emsSavedListRange || jodit?.__emsListToolbarSelStashed) return true;
    return isClauseBodySelectionActive();
}

export function restoreEditableClauseHeadingSelection() {
    const heading = getActiveEditableClauseHeading();
    if (!heading || !headingSavedRange) return false;
    try {
        heading.focus({ preventScroll: true });
        const sel = document.getSelection?.();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(headingSavedRange.cloneRange());
        return !sel.isCollapsed;
    } catch {
        return false;
    }
}

function ensureEditableClauseHeadingSelectionForFormat() {
    if (restoreEditableClauseHeadingSelection()) return true;
    if (lastGoodHeadingRange) {
        headingSavedRange = lastGoodHeadingRange.cloneRange();
        if (restoreEditableClauseHeadingSelection()) return true;
    }
    const sel = document.getSelection?.();
    if (sel?.rangeCount && !sel.isCollapsed && isSelectionInEditableClauseHeading(sel)) {
        stashEditableClauseHeadingSelection();
        return true;
    }
    return false;
}

function isClauseHeadingFormatTarget() {
    return isClauseHeadingFormattingIntent();
}

function selectEntireEditableClauseHeadingContents(heading = getActiveEditableClauseHeading()) {
    if (!heading) return false;
    try {
        heading.focus({ preventScroll: true });
        const sel = document.getSelection?.();
        if (!sel) return false;
        const range = heading.ownerDocument.createRange();
        range.selectNodeContents(heading);
        sel.removeAllRanges();
        sel.addRange(range);
        headingSavedRange = range.cloneRange();
        lastGoodHeadingRange = range.cloneRange();
        return true;
    } catch {
        return false;
    }
}

/** Font name / size apply to the full heading line (serial no. + clause title). */
function applyTypographyToEntireEditableHeading(styleKey, styleValue) {
    const heading = getActiveEditableClauseHeading();
    if (!heading || !isClauseHeadingFormatTarget()) return false;
    restoreEditableClauseHeadingSelection();
    if (!isSelectionInEditableClauseHeading()) {
        selectEntireEditableClauseHeadingContents(heading);
    }
    const prop = styleKeyToCssProp(styleKey);
    const val = String(styleValue);
    const onlySpan = heading.querySelector(':scope > span:only-child');
    if (onlySpan?.tagName === 'SPAN') {
        onlySpan.style.setProperty(prop, val, 'important');
    } else {
        heading.style.setProperty(prop, val, 'important');
        heading.querySelectorAll('span, font').forEach((el) => {
            if (el.style) el.style.setProperty(prop, val, 'important');
        });
    }
    syncHeadingUserTypographyToInnerContent(heading);
    return true;
}

function readHeadingStyleProperty(heading, prop) {
    if (!heading) return '';
    const inline = heading.style?.[prop] || heading.style?.getPropertyValue?.(styleKeyToCssProp(prop));
    if (inline && String(inline).trim()) return String(inline).trim();

    const styled = heading.querySelector('span[style], font[style]');
    if (styled?.style) {
        const fromChild = styled.style[prop] || styled.style.getPropertyValue(styleKeyToCssProp(prop));
        if (fromChild && String(fromChild).trim()) return String(fromChild).trim();
    }

    if (typeof window !== 'undefined') {
        const computed = window.getComputedStyle(heading).getPropertyValue(styleKeyToCssProp(prop));
        if (computed && String(computed).trim()) return String(computed).trim();
    }
    return '';
}

/** Font family for the clause heading toolbar (when focus/selection is in the heading). */
export function readEditableClauseHeadingFontFamily() {
    const heading = getActiveEditableClauseHeading();
    if (!heading) return '';
    return readHeadingStyleProperty(heading, 'fontFamily');
}

/** Font size in pt for the clause heading toolbar. */
export function readEditableClauseHeadingFontSizePt() {
    const heading = getActiveEditableClauseHeading();
    if (!heading) return '';
    const raw = readHeadingStyleProperty(heading, 'fontSize');
    if (!raw) return '';
    const match = String(raw).trim().match(/^([\d.]+)(px|pt|em|rem|%)?$/i);
    if (!match) return '';
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num)) return '';
    const unit = (match[2] || 'px').toLowerCase();
    if (unit === 'pt') {
        return Number.isInteger(num) ? String(num) : String(Math.round(num * 2) / 2);
    }
    if (unit === 'px') {
        const pt = num * 0.75;
        return Number.isInteger(pt) ? String(Math.round(pt)) : String(Math.round(pt * 2) / 2);
    }
    return '';
}

function applyInlineStyleToHeadingSelection(styleKey, styleValue) {
    const heading = getActiveEditableClauseHeading();
    if (!heading || !ensureEditableClauseHeadingSelectionForFormat()) return false;
    heading.focus({ preventScroll: true });
    const sel = document.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return false;

    const doc = heading.ownerDocument;
    const span = doc.createElement('span');
    span.style.setProperty(styleKeyToCssProp(styleKey), String(styleValue), 'important');
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
    if (sel.rangeCount && !sel.isCollapsed) {
        headingSavedRange = sel.getRangeAt(0).cloneRange();
        lastGoodHeadingRange = headingSavedRange.cloneRange();
    }
    return true;
}

function runHeadingExecCommand(command, value) {
    const heading = getActiveEditableClauseHeading();
    if (!heading || !ensureEditableClauseHeadingSelectionForFormat()) return false;
    heading.focus({ preventScroll: true });
    try {
        const ok = document.execCommand(command, false, value ?? null);
        const sel = document.getSelection?.();
        if (sel?.rangeCount && !sel.isCollapsed) {
            headingSavedRange = sel.getRangeAt(0).cloneRange();
            lastGoodHeadingRange = headingSavedRange.cloneRange();
        }
        return ok;
    } catch {
        return false;
    }
}

/** Apply toolbar command when the selection is in the clause heading panel (not Jodit body). */
export function tryApplyToolbarCommandToEditableClauseHeading(
    command,
    value,
    defaultFontSizePoints = 'pt',
    jodit = null
) {
    if (!getActiveEditableClauseHeading()) return false;
    if (shouldDeferClauseFormatToBody(jodit)) return false;

    const cmd = String(command || '').toLowerCase();

    if (cmd === 'formatblock') {
        return true;
    }

    if (cmd === 'fontname') {
        if (!isClauseHeadingFormatTarget()) return false;
        return applyTypographyToEntireEditableHeading('fontFamily', value || '');
    }

    if (cmd === 'fontsize') {
        if (!isClauseHeadingFormatTarget()) return false;
        const size = normalizeSize(value, defaultFontSizePoints);
        return applyTypographyToEntireEditableHeading('fontSize', size);
    }

    if (!ensureEditableClauseHeadingSelectionForFormat()) return false;

    if (cmd === 'forecolor' || cmd === 'emsforecolor') {
        return applyInlineStyleToHeadingSelection('color', value || '');
    }

    if (cmd === 'background' || cmd === 'emsbackground') {
        return applyInlineStyleToHeadingSelection('backgroundColor', value || '');
    }

    if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'strikethrough') {
        return runHeadingExecCommand(cmd);
    }

    if (
        cmd === 'justifyleft' ||
        cmd === 'justifycenter' ||
        cmd === 'justifyright' ||
        cmd === 'justifyfull'
    ) {
        return runHeadingExecCommand(cmd);
    }

    if (cmd === 'removeformat' || cmd === 'eraser') {
        const heading = getActiveEditableClauseHeading();
        const sel = document.getSelection?.();
        if (!heading || !sel?.rangeCount || sel.isCollapsed) return true;
        const range = sel.getRangeAt(0);
        const frag = range.extractContents();
        const text = frag.textContent || '';
        range.insertNode(heading.ownerDocument.createTextNode(text));
        return true;
    }

    return false;
}

export function registerEditableClauseHeadingSelectionHooks() {
    if (typeof document === 'undefined' || document.__emsClauseHeadingSelBound) return;
    document.__emsClauseHeadingSelBound = true;

    const rememberSelectionContext = () => {
        if (isSelectionInEditableClauseHeading()) {
            stashEditableClauseHeadingSelection();
            return;
        }
        const wys = document.querySelector('#quote-preview .quote-clause-inline-editor .jodit-wysiwyg');
        const sel = document.getSelection?.();
        if (wys && sel?.anchorNode && wys.contains(sel.anchorNode) && !sel.isCollapsed) {
            headingSavedRange = null;
            lastGoodHeadingRange = null;
        }
    };

    document.addEventListener('mouseup', rememberSelectionContext, true);
    document.addEventListener('keyup', rememberSelectionContext, true);
    document.addEventListener('selectionchange', rememberSelectionContext, true);

    document.addEventListener(
        'focusin',
        (e) => {
            if (e.target?.closest?.('.jodit-wysiwyg')) {
                headingSavedRange = null;
            }
        },
        true
    );
}

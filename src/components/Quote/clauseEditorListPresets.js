/**
 * MS Word–style bullet & numbering presets for ClauseEditor (Jodit).
 * Classes are persisted in saved HTML so print/PDF must include CLAUSE_LIST_STYLES_CSS.
 */

import {
    stashEditableClauseHeadingForToolbar,
    clearEditableClauseHeadingSelectionStash,
    isSelectionInEditableClauseHeading,
    getActiveEditableClauseHeading,
} from './clauseEditorExternalHeading';
import {
    armTableToolbarCellStash,
    shouldSkipToolbarTextRestoreForTableCells,
} from './clauseEditorTable';
import { stripClauseEditorExportEmptyNodes } from './clauseEditorExportHtml';

/** Jodit deep-merges `control.list` — mark atomic so base keys like `default` are not kept. */
function markJoditConfigAtom(value) {
    Object.defineProperty(value, 'isAtom', {
        enumerable: false,
        value: true,
        configurable: false,
    });
    return value;
}

/** Array list menu — avoids Jodit `for…in` picking inherited `default` / `lower-greek` keys. */
function emsToolbarListMenu(entries) {
    return markJoditConfigAtom(
        entries.map(([id, label]) => ({ title: id, value: label }))
    );
}

export const BULLET_LIST_MENU = emsToolbarListMenu([
    ['none', 'None'],
    ['disc', '●  Solid round'],
    ['circle', '○  Hollow round'],
    ['square', '■  Solid square'],
    ['check', '✓  Tick'],
    ['arrow', '➤  Arrow'],
    ['diamond', '◆  Diamond'],
]);

export const NUMBER_LIST_MENU = emsToolbarListMenu([
    ['none', 'None'],
    ['decimal', '1.  2.  3.'],
    ['decimal-paren', '1)  2)  3)'],
    ['upper-roman', 'I.  II.  III.'],
    ['upper-alpha', 'A.  B.  C.'],
    ['lower-alpha-paren', 'a)  b)  c)'],
    ['lower-alpha', 'a.  b.  c.'],
    ['lower-roman', 'i.  ii.  iii.'],
]);

/** @deprecated Use BULLET_LIST_MENU — kept for any external imports. */
export const BULLET_LIST_OPTIONS = BULLET_LIST_MENU;

/** @deprecated Use NUMBER_LIST_MENU — kept for any external imports. */
export const NUMBER_LIST_OPTIONS = NUMBER_LIST_MENU;

const BULLET_CLASS_NAMES = [
    'ems-bullet-disc',
    'ems-bullet-circle',
    'ems-bullet-square',
    'ems-bullet-check',
    'ems-bullet-arrow',
    'ems-bullet-diamond',
];

const OL_CLASS_NAMES = [
    'ems-num-decimal',
    'ems-num-decimal-paren',
    'ems-num-upper-roman',
    'ems-num-upper-alpha',
    'ems-num-lower-alpha-paren',
    'ems-num-lower-alpha',
    'ems-num-lower-roman',
];

const UL_PRESETS = {
    disc: { listStyleType: 'disc', classes: ['ems-bullet-disc'], native: true },
    circle: { listStyleType: 'circle', classes: ['ems-bullet-circle'], native: true },
    square: { listStyleType: 'square', classes: ['ems-bullet-square'], native: true },
    check: { listStyleType: 'none', classes: ['ems-bullet-check'] },
    arrow: { listStyleType: 'none', classes: ['ems-bullet-arrow'] },
    diamond: { listStyleType: 'none', classes: ['ems-bullet-diamond'] },
};

const OL_PRESETS = {
    /** Browser-native 1. 2. 3. — avoids custom counters that break when Jodit uses multiple <ol>. */
    decimal: { listStyleType: 'decimal', classes: ['ems-num-decimal'], native: true },
    'decimal-paren': { classes: ['ems-num-decimal-paren'] },
    'upper-roman': { classes: ['ems-num-upper-roman'] },
    'upper-alpha': { classes: ['ems-num-upper-alpha'] },
    'lower-alpha-paren': { classes: ['ems-num-lower-alpha-paren'] },
    'lower-alpha': { classes: ['ems-num-lower-alpha'] },
    'lower-roman': { classes: ['ems-num-lower-roman'] },
};

/** Only strip obvious duplicate markers (e.g. placeholder "1. Warranty"), not values like "1.5". */
const LEADING_LIST_MARKER_RE = /^\s*(?:\d+[\.\)]\s+)(?=[A-Za-z\[])/;

/** Clause sub-number prefixes in plain <p> lines (1.1., 4.3.2., etc.). */
const CLAUSE_PLAIN_NUMBER_RE = /^\s*(\d{1,2}(?:\.\d{1,2})*)\.\s*/;
const CLAUSE_PLAIN_BULLET_RE = /^\s*([\u2022●○■➤◆▪▸►\-*])\s+/;
/** Non-collapsing gap after a plain clause marker on an empty line (trailing spaces hide the caret). */
const CLAUSE_MARKER_BODY_GAP = '\u00a0';

function plainClauseBodyIsEmpty(body) {
    return !String(body || '').replace(/\u00a0/g, ' ').trim();
}

function plainClauseEmptyMarkerText(prefix) {
    return `${prefix}${CLAUSE_MARKER_BODY_GAP}`;
}

/** Marker column + gap before list text (≈ two character spaces). */
const EMS_LIST_MARKER_GAP = '2ch';
const EMS_BULLET_MARKER_WIDTH = '0.55em';
const EMS_NUM_MARKER_WIDTH = '1.45em';
const EMS_LINE_INDENT_STEP_PX = 24;
const EMS_LINE_INDENT_MAX_PX = 240;

function stripPlainClausePrefixFromText(text) {
    let s = String(text || '').replace(/\u00a0/g, ' ');
    const numMatch = s.match(CLAUSE_PLAIN_NUMBER_RE);
    if (numMatch) return s.slice(numMatch[0].length).replace(/^\s+/, '');
    const bulletMatch = s.match(CLAUSE_PLAIN_BULLET_RE);
    if (bulletMatch) return s.slice(bulletMatch[0].length).replace(/^\s+/, '');
    return s;
}

/** Remove manual clause numbers/bullets before list CSS markers take over. */
function stripPlainClausePrefixFromLineHtml(html) {
    const s = String(html || '').trim();
    if (!s) return s;
    if (typeof document === 'undefined') {
        const plain = s.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
        const stripped = stripPlainClausePrefixFromText(plain);
        return stripped !== plain ? stripped : s;
    }
    const holder = document.createElement('div');
    holder.innerHTML = s;
    const firstText = getFirstTextNode(holder);
    if (firstText) {
        const plain = firstText.textContent.replace(/\u00a0/g, ' ');
        const stripped = stripPlainClausePrefixFromText(plain);
        if (stripped !== plain) {
            firstText.textContent = stripped;
        }
    }
    const out = holder.innerHTML.trim();
    return out || s;
}

export function closeListToolbarPopup(jodit, button) {
    if (!jodit?.e?.fire) return;
    // List-style toolbar buttons keep the dropdown on `openedPopup`; they listen to
    // `closeAllPopups`, not `hidePopup` (inline-popup plugin only).
    if (button) {
        let node = button.parentElement;
        while (node) {
            const owner = node.component;
            if (owner?.openedPopup) {
                owner.__closePopup?.();
                break;
            }
            node = node.parentElement;
        }
        const host = button.container || button.button;
        const popupRoot = host?.closest?.('.jodit-popup');
        const popupOwner = popupRoot?.parentElement;
        if (popupOwner?.__closePopup) {
            popupOwner.__closePopup();
        }
    }
    jodit.e.fire('closeAllPopups');
    jodit.e.fire('hidePopup');
    requestAnimationFrame(() => {
        jodit.e.fire('closeAllPopups');
        jodit.e.fire('hidePopup');
    });
}

/** Contenteditable root — must match ClauseEditor `getEditorBody()` (not Jodit chrome wrapper). */
export function getWysiwygEditor(jodit) {
    if (!jodit) return null;
    if (typeof jodit.__emsClauseEditorBody === 'function') {
        const fromWrapper = jodit.__emsClauseEditorBody();
        if (fromWrapper?.querySelectorAll) return fromWrapper;
    }
    let root = jodit.editor?.editor || jodit.editor || null;
    if (root && !root.classList?.contains('jodit-wysiwyg')) {
        const wys = root.querySelector?.('.jodit-wysiwyg');
        if (wys) root = wys;
    }
    if (!root?.querySelectorAll) {
        let node = jodit.s?.range?.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        while (node) {
            if (node.classList?.contains('jodit-wysiwyg')) return node;
            node = node.parentElement;
        }
        root = jodit.container?.querySelector?.('.jodit-wysiwyg') || root;
    }
    return root;
}

function stripClasses(el, names) {
    names.forEach((c) => el.classList.remove(c));
}

function getFirstTextNode(el) {
    if (!el) return null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    return walk.nextNode();
}

/** Remove typed "1. " / "1) " / clause "1.1." prefixes so list markers come only from CSS. */
function stripLeadingListMarkers(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('ol > li, ul > li').forEach((li) => {
        const textNode = getFirstTextNode(li);
        if (!textNode) return;
        let next = textNode.textContent.replace(LEADING_LIST_MARKER_RE, '');
        next = stripPlainClausePrefixFromText(next);
        if (next !== textNode.textContent) textNode.textContent = next;
    });
}

/** Fingerprint so adjacent lists merge only when the same bullet/number style. */
function listStyleFingerprint(list) {
    if (!list) return '';
    const cls = String(list.className || '').trim();
    const lst = String(list.style?.listStyleType || '').trim();
    const styleAttr = String(list.getAttribute('style') || '').trim();
    return `${list.tagName}|${cls}|${lst}|${styleAttr}`;
}

function rangeIntersectsNode(range, node) {
    if (!range || !node) return false;
    try {
        const doc = node.ownerDocument;
        const lr = doc.createRange();
        lr.selectNodeContents(node);
        return (
            range.compareBoundaryPoints(Range.END_TO_START, lr) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, lr) > 0
        );
    } catch {
        return false;
    }
}

function rangeFullyContainsNode(range, node) {
    if (!range || !node) return false;
    try {
        const doc = node.ownerDocument;
        const lr = doc.createRange();
        lr.selectNodeContents(node);
        return (
            range.compareBoundaryPoints(Range.START_TO_START, lr) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, lr) >= 0
        );
    } catch {
        return false;
    }
}

/** Tables/images must never be wiped by a whole-editor list rebuild. */
function editorHasProtectedStructures(root) {
    if (!root?.querySelector) return false;
    return !!root.querySelector('table, img, video, iframe, object, embed');
}

const PROTECTED_STRUCTURE_SELECTOR = 'table, img, video, iframe, object, embed';

/** True when node contains a table/image that is not part of the current selection. */
function nodeHasProtectedDescendantOutsideRange(node, range) {
    if (!node?.querySelector || !range) return false;
    for (const el of node.querySelectorAll(PROTECTED_STRUCTURE_SELECTOR)) {
        if (!rangeIntersectsNode(range, el)) return true;
    }
    return false;
}

/** Clone tables before list edits so we can re-insert them if DOM surgery drops them. */
function snapshotEditorTables(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('table')].map((t) => t.cloneNode(true));
}

function restoreMissingEditorTables(root, tableClones) {
    if (!root || !tableClones.length) return;
    const existing = root.querySelectorAll('table').length;
    if (existing >= tableClones.length) return;
    tableClones.forEach((clone) => {
        root.appendChild(clone.cloneNode(true));
    });
}

/** Re-append tables if list logic removed them; sync DOM → Jodit without setEditorValue. */
function clauseElementIsVisuallyBlank(el) {
    if (!el) return true;
    const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    const stripped = String(el.innerHTML || '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .trim();
    return !stripped;
}

/** True when a plain block contributes real text to the current list selection. */
function plainBlockHasSelectedTextForList(block, range) {
    if (!block || !range || !rangeIntersectsNode(range, block)) return false;
    if (clauseElementIsVisuallyBlank(block)) return false;
    return getLineHtmlsFromElementInRange(block, range).some(lineHtmlHasText);
}

/** Jodit/contenteditable list rows often use <br> placeholders — keep them while editing. */
function listItemHasEditablePlaceholder(li) {
    if (!li || li.tagName !== 'LI') return false;
    if (li.querySelector(':scope > br')) return true;
    const inner = li.firstElementChild;
    if (
        inner &&
        (inner.tagName === 'P' || inner.tagName === 'DIV') &&
        inner.querySelector('br')
    ) {
        return true;
    }
    return false;
}

/** Text in the <li> label only — excludes nested <ul>/<ol> item text (e.g. "BMS:" category headers). */
function getListItemDirectText(li) {
    if (!li || li.tagName !== 'LI') return '';
    let parts = [];
    for (const child of li.childNodes) {
        if (child.nodeType === 3) {
            parts.push(child.textContent || '');
        } else if (child.nodeType === 1) {
            const tag = child.tagName;
            if (tag === 'UL' || tag === 'OL') continue;
            parts.push(child.textContent || '');
        }
    }
    return parts.join('').replace(/\u00a0/g, ' ').trim();
}

function getListItemNestedList(li) {
    return li?.querySelector?.(':scope > ul, :scope > ol') || null;
}

function isListItemLabelEmpty(li) {
    return !getListItemDirectText(li);
}

/** Promote nested list rows to the parent list and remove the empty category <li> shell. */
function hoistNestedListOutOfListItem(li) {
    const nested = getListItemNestedList(li);
    const parent = li?.parentElement;
    if (!nested || !parent || nested.parentNode !== li) return false;
    while (nested.firstChild) {
        parent.insertBefore(nested.firstChild, li);
    }
    nested.remove();
    li.remove();
    return true;
}

function findListItemContainingRange(root, range) {
    if (!root || !range) return null;
    let node = range.commonAncestorContainer;
    if (node?.nodeType === 3) node = node.parentElement;
    const li = node?.closest?.('li');
    if (!li || !root.contains(li)) return null;
    return li;
}

function isCaretInListItemLabel(li, range) {
    const nested = getListItemNestedList(li);
    if (!nested) return true;
    let node = range?.commonAncestorContainer;
    if (node?.nodeType === 3) node = node.parentElement;
    return node && !nested.contains(node);
}

function isRangeWithinListItemLabel(li, range) {
    return isCaretInListItemLabel(li, range);
}

function removeListItemRow(jodit, li) {
    const root = getWysiwygEditor(jodit);
    const list = li?.parentElement;
    if (!li || !list) return { firstHoisted: null, prevLi: null, nextLi: null };
    const nested = getListItemNestedList(li);
    const prevLi = li.previousElementSibling?.tagName === 'LI' ? li.previousElementSibling : null;
    const nextLi = li.nextElementSibling?.tagName === 'LI' ? li.nextElementSibling : null;
    const firstHoisted = nested?.querySelector?.(':scope > li') || null;
    pinClauseEditorScrollDuring(root, () => {
        if (nested) {
            hoistNestedListOutOfListItem(li);
        } else {
            li.remove();
            if (!list.querySelector(':scope > li')) {
                list.remove();
            }
        }
    });
    return { firstHoisted, prevLi, nextLi };
}

function placeCaretAfterListItemRowDelete(jodit, { firstHoisted, prevLi, nextLi }) {
    if (firstHoisted?.isConnected) {
        placeCaretInBlock(jodit, getListItemLineBlock(firstHoisted) || firstHoisted, 0);
        return;
    }
    if (prevLi?.isConnected) {
        placeCaretAtEndOfLi(jodit, prevLi);
        return;
    }
    if (nextLi?.isConnected) {
        placeCaretInBlock(jodit, getListItemLineBlock(nextLi) || nextLi, 0);
    }
}

function runClauseListDeleteCleanup(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root || jodit.__emsDeleteKeyLock || isClauseEditorSelectionInTable(jodit)) return false;
    let fixed = false;
    preserveClauseEditorSelectionDuring(jodit, () => {
        if (dedupeAllMergedNumberPrefixes(root)) fixed = true;
        if (cleanupNestedAndEmptyListItems(root)) fixed = true;
        if (stripClauseEditorSpuriousBlankRows(root)) fixed = true;
    });
    if (fixed) jodit.e?.fire?.('change');
    return fixed;
}

function normalizeListItemInnerHtml(li) {
    if (!li || li.tagName !== 'LI') return;
    const soleBrPlaceholder =
        li.childNodes.length === 1 &&
        li.firstChild?.nodeType === 1 &&
        li.firstChild.tagName === 'BR';
    if (!soleBrPlaceholder) {
        while (li.lastChild?.nodeType === 1 && li.lastChild.tagName === 'BR') {
            li.lastChild.remove();
        }
    }
    while (
        li.lastChild?.nodeType === 3 &&
        !String(li.lastChild.textContent || '').replace(/\u00a0/g, ' ').trim()
    ) {
        li.lastChild.remove();
    }
    while (
        li.childNodes.length === 1 &&
        li.firstElementChild?.tagName === 'P' &&
        clauseElementIsVisuallyBlank(li.firstElementChild)
    ) {
        const p = li.firstElementChild;
        while (p.firstChild) li.insertBefore(p.firstChild, p);
        p.remove();
    }
    while (li.lastElementChild?.tagName === 'P' && clauseElementIsVisuallyBlank(li.lastElementChild)) {
        li.lastElementChild.remove();
    }
}

function isEmptyClauseBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('table')) return false;
    const tag = el.tagName;
    if (tag === 'LI') {
        normalizeListItemInnerHtml(el);
        if (listItemHasEditablePlaceholder(el)) return false;
    }
    if (tag === 'UL' || tag === 'OL') {
        [...el.children].filter((c) => c.tagName === 'LI').forEach(normalizeListItemInnerHtml);
        const items = [...el.children].filter((c) => c.tagName === 'LI');
        if (!items.length) return true;
        return items.every((li) => isEmptyClauseBlock(li));
    }
    if (!clauseElementIsVisuallyBlank(el)) return false;
    if (el.querySelector('img, table, ul, ol, video, iframe, object, embed')) return false;
    return true;
}

function clauseEditorRootHasRealContent(root) {
    if (!root?.childNodes) return false;
    return [...root.childNodes].some((n) => {
        if (n.nodeType === 3) return String(n.textContent || '').replace(/\u00a0/g, ' ').trim().length > 0;
        if (n.nodeType !== 1) return false;
        if (n.tagName === 'TABLE') return true;
        if (n.tagName === 'UL' || n.tagName === 'OL') {
            return [...n.children].some((li) => li.tagName === 'LI' && !isEmptyClauseBlock(li));
        }
        return !isEmptyClauseBlock(n);
    });
}

function pruneEmptyListTrees(root) {
    if (!root?.querySelectorAll) return false;
    let changed = false;
    root.querySelectorAll('ul, ol').forEach((list) => {
        if (list.closest('table')) return;
        [...list.querySelectorAll(':scope > li')].forEach((li) => {
            normalizeListItemInnerHtml(li);
            if (isEmptyClauseBlock(li)) {
                li.remove();
                changed = true;
            }
        });
        if (!list.querySelector(':scope > li')) {
            list.remove();
            changed = true;
        }
    });
    return changed;
}

/** Jodit often leaves empty blocks after list toggles — strip trailing / in-between noise. */
export function stripClauseEditorSpuriousBlankRows(root) {
    if (!root?.childNodes || !clauseEditorRootHasRealContent(root)) return false;
    let changed = false;

    root.querySelectorAll('ul, ol').forEach((list) => {
        if (list.closest('table')) return;

        /* Preserve blank <p>/<div> rows after lists — intentional spacing below bullets. */

        list.querySelectorAll(':scope > li').forEach((li) => {
            if (listItemHasEditablePlaceholder(li)) return;
            normalizeListItemInnerHtml(li);
            while (li.lastElementChild?.tagName === 'P' && isEmptyClauseBlock(li.lastElementChild)) {
                li.lastElementChild.remove();
                changed = true;
            }
        });

        for (;;) {
            const lastLi = list.lastElementChild;
            if (
                !lastLi ||
                lastLi.tagName !== 'LI' ||
                listItemHasEditablePlaceholder(lastLi) ||
                !isEmptyClauseBlock(lastLi)
            ) {
                break;
            }
            lastLi.remove();
            changed = true;
        }
    });

    if (pruneEmptyListTrees(root)) changed = true;

    if (cleanupNestedAndEmptyListItems(root)) changed = true;

    return changed;
}

function syncListApplyToJodit(jodit, root) {
    if (!root) return;
    stripClauseEditorSpuriousBlankRows(root);
    if (jodit.__emsListApplyLock) return;
    const cleaned = root.innerHTML;
    // Mutate DOM in place only — reassigning innerHTML destroys the live selection/caret.
    if (cleaned !== jodit.value) {
        jodit.value = cleaned;
    }
    /* synchronizeValues() re-inserts <p><br></p> after <ol> when the caret sits past the list. */
}

function scheduleDeferredListBlankRowCleanup(jodit) {
    const run = () => {
        const root = getWysiwygEditor(jodit);
        if (!root) return false;
        const changed = stripClauseEditorSpuriousBlankRows(root);
        if (changed) {
            syncListApplyToJodit(jodit, root);
            jodit.e?.fire?.('change');
        }
        return changed;
    };
    requestAnimationFrame(run);
}

function clearListToolbarSelectionStash(jodit) {
    jodit.__emsSavedListRange = null;
    jodit.__emsListToolbarSelStashed = false;
    jodit.__emsLastGoodListRange = null;
    jodit.__emsPendingFormatBookmark = null;
}

/** Text offset in root before list DOM surgery — maps to the matching <li> after apply. */
function captureListApplyCaretOffset(jodit, root) {
    if (!root) return null;
    const range = getEffectiveListRange(jodit);
    if (!range) return null;
    try {
        return range.collapsed
            ? textOffsetInRoot(root, range.startContainer, range.startOffset)
            : textOffsetInRoot(root, range.endContainer, range.endOffset);
    } catch {
        return null;
    }
}

function rememberListApplyCaretTarget(jodit, listOrLi) {
    if (!listOrLi) return;
    let li = null;
    if (listOrLi.tagName === 'LI') {
        li = listOrLi;
    } else {
        const items = listOrLi.querySelectorAll?.(':scope > li');
        if (items?.length) li = items[items.length - 1];
    }
    if (li) jodit.__emsListApplyCaretLi = li;
}

function getListItemLineBlock(li) {
    if (!li || li.tagName !== 'LI') return li;
    return li.querySelector(':scope > p') || li;
}

function placeCaretAtEndOfLi(jodit, li) {
    if (!li?.ownerDocument) return false;
    const doc = li.ownerDocument;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    let lastText = null;
    let node;
    while ((node = walker.nextNode())) lastText = node;
    if (lastText) {
        range.setStart(lastText, lastText.textContent?.length ?? 0);
        range.collapse(true);
    } else {
        range.selectNodeContents(li);
        range.collapse(false);
    }
    return selectClauseEditorRange(jodit, range);
}

/** Caret in the body column after EMS CSS list markers (not flush on the counter). */
function placeCaretInListItemBodyStart(jodit, li) {
    if (!li?.isConnected) return false;
    const line = getListItemLineBlock(li);
    if (listItemHasEditablePlaceholder(li) || line?.querySelector?.(':scope > br')) {
        placeCaretInEmptyBlock(jodit, line);
        return true;
    }
    const text = (line.textContent || '').replace(/\u00a0/g, ' ');
    if (!text.trim()) {
        if (!text.length) {
            line.appendChild(line.ownerDocument.createTextNode(CLAUSE_MARKER_BODY_GAP));
        }
        placeCaretInBlock(jodit, line, (line.textContent || '').length);
        return true;
    }
    return placeCaretAtEndOfLi(jodit, li);
}

function placeCaretAfterListPresetApply(jodit, tagName, caretOffset) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const pinned = jodit.__emsListApplyCaretLi;
    if (pinned?.isConnected) {
        return placeCaretAtEndOfLi(jodit, pinned);
    }

    if (typeof caretOffset === 'number') {
        try {
            const pos = resolveTextOffsetInRoot(root, caretOffset);
            const range = root.ownerDocument.createRange();
            range.setStart(pos.node, pos.offset);
            range.collapse(true);
            if (selectClauseEditorRange(jodit, range)) return true;
        } catch {
            /* fall through */
        }
    }

    let block = null;
    const range = jodit.s?.range;
    if (range) {
        block = getEditableLineBlock(root, range);
    }
    if (!block || block.tagName !== 'LI') {
        const lists = [...root.querySelectorAll(tagName)].filter((l) => !l.closest('table'));
        const list = lists[lists.length - 1];
        block =
            list?.querySelector(':scope > li:last-child') ||
            list?.querySelector(':scope > li') ||
            null;
    }
    if (!block || block.tagName !== 'LI') return false;

    const len = (block.textContent || '').replace(/\u00a0/g, ' ').length;
    placeCaretInBlock(jodit, block, len);
    return true;
}

function beginListPresetApply(jodit) {
    jodit.__emsListApplyLock = (jodit.__emsListApplyLock || 0) + 1;
    jodit.__emsSkipToolbarSelRestore = true;
}

function scheduleListApplyCaretStabilize(jodit, tagName, caretOffset, selectionBookmark, onDone) {
    jodit.__emsSkipToolbarSelRestore = true;
    const stabilize = () => {
        if (selectionBookmark && restoreTextRangeBookmark(jodit, selectionBookmark)) {
            jodit.__emsListApplyCaretLi = null;
            return;
        }
        const placed = placeCaretAfterListPresetApply(jodit, tagName, caretOffset);
        if (placed) jodit.__emsListApplyCaretLi = null;
    };
    const finish = () => {
        stabilize();
        jodit.__emsListApplyCaretLi = null;
        jodit.__emsSkipToolbarSelRestore = false;
        jodit.__emsListApplyLock = Math.max(0, (jodit.__emsListApplyLock || 1) - 1);
        try {
            onDone?.();
        } finally {
            if (jodit.__emsPendingPricingRecalc) {
                jodit.__emsPendingPricingRecalc = false;
                jodit.e?.fire?.('change');
            }
        }
    };
    stabilize();
    requestAnimationFrame(() => {
        stabilize();
        requestAnimationFrame(() => {
            setTimeout(finish, 60);
        });
    });
}

function finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName = null, caretOffset = null) {
    const afterRoot = getWysiwygEditor(jodit);
    if (afterRoot) {
        restoreMissingEditorTables(afterRoot, tableSnapshots);
        stripClauseEditorSpuriousBlankRows(afterRoot);
    }
    clearListToolbarSelectionStash(jodit);
    closeListToolbarPopup(jodit);

    if (tagName) {
        scheduleListApplyCaretStabilize(jodit, tagName, caretOffset, selectionBookmark, () => {
            const root = getWysiwygEditor(jodit);
            if (root && typeof jodit.synchronizeValues === 'function') {
                jodit.synchronizeValues();
            }
            jodit.e?.fire?.('change');
        });
        return;
    }

    jodit.__emsSkipToolbarSelRestore = true;
    scheduleClauseEditorSelectionRestore(jodit, selectionBookmark);
    requestAnimationFrame(() => {
        jodit.__emsSkipToolbarSelRestore = false;
        jodit.__emsListApplyLock = Math.max(0, (jodit.__emsListApplyLock || 1) - 1);
        jodit.e?.fire?.('change');
    });
}

/** Text-offset bookmark survives list rebuilds (same text, new <li> nodes). */
function captureTextRangeBookmark(root, range) {
    if (!root || !range || range.collapsed) return null;
    try {
        const clipped = clampRangeExcludingProtectedStructures(root, range);
        if (clipped.collapsed) return null;
        const start = textOffsetInRoot(root, clipped.startContainer, clipped.startOffset);
        const end = textOffsetInRoot(root, clipped.endContainer, clipped.endOffset);
        if (end <= start) return null;
        return { start, end };
    } catch {
        return null;
    }
}

function textOffsetInRoot(root, node, offset) {
    const r = root.ownerDocument.createRange();
    r.selectNodeContents(root);
    r.setEnd(node, offset);
    return r.toString().length;
}

function captureCollapsedCaretOffset(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root || jodit.__emsListApplyLock) return null;
    if (isCaretInEmptyClauseBlock(jodit)) return null;
    try {
        const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
        if (!sel?.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!range.collapsed || !root.contains(range.startContainer)) return null;
        return textOffsetInRoot(root, range.startContainer, range.startOffset);
    } catch {
        return null;
    }
}

/** Empty spacer rows (<p><br></p>) have no text — text-offset bookmarks collapse to the previous line. */
export function isCaretInEmptyClauseBlock(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;
    try {
        const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
        if (!sel?.rangeCount) return false;
        const range = sel.getRangeAt(0);
        if (!range.collapsed || !root.contains(range.startContainer)) return false;
        const block = getEditableLineBlock(root, range);
        return Boolean(block && isEmptyClauseBlock(block));
    } catch {
        return false;
    }
}

function shouldSkipClauseEditorTextCaretRestore(jodit) {
    if (!jodit) return false;
    if (jodit.__emsListApplyLock) return true;
    if (jodit.__emsEnterContinueCaretBlock?.isConnected) return true;
    return isCaretInEmptyClauseBlock(jodit);
}

export function isClauseEditorSelectionInTable(jodit) {
    const root = getWysiwygEditor(jodit);
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

/** Keep table edits on Jodit's stack even when undo briefly drops the text selection. */
export function shouldUseJoditTableHistory(jodit) {
    if (!jodit) return false;
    const root = getWysiwygEditor(jodit);
    if (!root?.querySelector?.('table')) return false;
    if (jodit.__emsTableHistorySync) return true;
    if (isClauseEditorSelectionInTable(jodit)) return true;
    const active = jodit.__emsActiveTableCell;
    return Boolean(active?.isConnected && root.contains(active));
}

function restoreJoditHistoryExternalBlock(jodit) {
    const snap = jodit?.history?.snapshot;
    if (!snap?.__block) return;
    if ((jodit.__emsOfficePasteSnapshotBlockDepth || 0) > 0) {
        snap.__block(true);
    }
}

/** Prevent DOM normalization from pushing junk entries onto Jodit's undo stack. */
export function withJoditHistoryBlocked(jodit, fn) {
    if (!jodit || typeof fn !== 'function') return undefined;
    const snapshot = jodit.history?.snapshot;
    if (snapshot?.transaction) {
        let result;
        snapshot.transaction(() => {
            result = fn();
        });
        restoreJoditHistoryExternalBlock(jodit);
        return result;
    }
    return fn();
}

export async function withJoditHistoryBlockedAsync(jodit, fn) {
    if (!jodit || typeof fn !== 'function') return undefined;
    const snapshot = jodit.history?.snapshot;
    if (snapshot?.__block) {
        const depth = jodit.__emsOfficePasteSnapshotBlockDepth || 0;
        snapshot.__block(true);
        try {
            return await fn();
        } finally {
            if (depth > 0) {
                snapshot.__block(true);
            } else {
                snapshot.__block(false);
            }
        }
    }
    return fn();
}

export function rememberTableCellCaretBookmark(jodit) {
    if (!isClauseEditorSelectionInTable(jodit)) return;
    const bookmark = captureTableCellCaretBookmark(jodit);
    if (bookmark?.kind === 'cell') {
        jodit.__emsLastTableCellCaret = bookmark;
    }
}

function textOffsetInSubtree(root, node, offset) {
    try {
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(root);
        r.setEnd(node, offset);
        return r.toString().length;
    } catch {
        return 0;
    }
}

function getTextLengthInSubtree(root) {
    try {
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(root);
        return r.toString().length;
    } catch {
        return 0;
    }
}

/** Cell-relative caret bookmark — survives table row height / format passes after undo. */
export function captureTableCellCaretBookmark(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return null;
    try {
        const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
        if (!sel?.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return null;
        if (!range.collapsed) {
            const start = textOffsetInRoot(root, range.startContainer, range.startOffset);
            const end = textOffsetInRoot(root, range.endContainer, range.endOffset);
            if (end <= start) return null;
            return { kind: 'range', start, end };
        }
        let node = range.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        const cell = node?.closest?.('td, th');
        if (!cell || !root.contains(cell)) return null;
        const table = cell.closest('table');
        if (!table) return null;
        const tables = [...root.querySelectorAll('table')];
        const tableIndex = tables.indexOf(table);
        if (tableIndex < 0) return null;
        const rowIndex = cell.parentElement?.rowIndex ?? -1;
        const cellIndex = cell.cellIndex ?? -1;
        if (rowIndex < 0 || cellIndex < 0) return null;
        return {
            kind: 'cell',
            tableIndex,
            rowIndex,
            cellIndex,
            offsetInCell: textOffsetInSubtree(cell, range.startContainer, range.startOffset),
        };
    } catch {
        return null;
    }
}

export function restoreTableCellCaretBookmark(jodit, bookmark) {
    if (!bookmark) return false;
    const root = getWysiwygEditor(jodit);
    if (!root) return false;
    try {
        if (bookmark.kind === 'range') {
            const start = resolveTextOffsetInRoot(root, bookmark.start);
            const end = resolveTextOffsetInRoot(root, bookmark.end);
            const range = root.ownerDocument.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            jodit.__emsForceCaretRestore = true;
            try {
                return selectClauseEditorRange(jodit, range);
            } finally {
                jodit.__emsForceCaretRestore = false;
            }
        }
        const table = root.querySelectorAll('table')[bookmark.tableIndex];
        const cell = table?.rows?.[bookmark.rowIndex]?.cells?.[bookmark.cellIndex];
        if (!cell) return false;
        const max = getTextLengthInSubtree(cell);
        const clamped = Math.max(0, Math.min(bookmark.offsetInCell, max));
        const resolved = resolveTextOffsetInRoot(cell, clamped);
        const range = root.ownerDocument.createRange();
        range.setStart(resolved.node, resolved.offset);
        range.collapse(true);
        jodit.__emsForceCaretRestore = true;
        try {
            const ok = selectClauseEditorRange(jodit, range);
            if (ok) jodit.__emsActiveTableCell = cell;
            return ok;
        } finally {
            jodit.__emsForceCaretRestore = false;
        }
    } catch {
        return false;
    }
}

export { tryClauseEditorHistoryCommand, tryJoditTableHistoryCommand, installClauseEditorUndoHooks, bindClauseEditorUndoHotkeys, beginOfficePastePostProcess, checkpointHistoryAfterOfficePaste, isOfficePastePostProcessActive, isOfficePasteHistoryPaused, bindOfficePasteHistoryGuard } from './clauseEditorTableHistory';

export function clauseEditorHtmlContainsTable(html) {
    return /<table[\s>]/i.test(String(html || ''));
}

export function captureClauseEditorCaretOffset(jodit) {
    return captureCollapsedCaretOffset(jodit);
}

export function restoreClauseEditorCaretOffset(jodit, offset) {
    return restoreCollapsedCaretOffset(jodit, offset);
}

export function restoreClauseEditorSelectionBookmark(jodit, bookmark) {
    return restoreTextRangeBookmark(jodit, bookmark);
}

/** Preserve table/cell markup — only strip export noise, do not merge lists. */
export function normalizeClauseHtmlPreservingTables(html) {
    const raw = String(html ?? '');
    if (!raw) return raw;
    if (clauseEditorHtmlContainsTable(raw)) {
        return stripClauseEditorExportEmptyNodes(raw);
    }
    return stripClauseEditorExportEmptyNodes(normalizeClauseListHtmlInString(raw));
}

function getTotalTextLengthInRoot(root) {
    try {
        const r = root.ownerDocument.createRange();
        r.selectNodeContents(root);
        return r.toString().length;
    } catch {
        return 0;
    }
}

function isClauseEditorBodyFocused(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root || typeof document === 'undefined') return false;
    const active = document.activeElement;
    return Boolean(active && (active === root || root.contains(active)));
}

function restoreCollapsedCaretOffset(jodit, offset) {
    const root = getWysiwygEditor(jodit);
    if (!root || offset == null || jodit.__emsListApplyLock) return false;
    if (shouldSkipClauseEditorTextCaretRestore(jodit)) return false;
    if (!jodit.__emsForceCaretRestore && isClauseEditorBodyFocused(jodit)) {
        const current = captureCollapsedCaretOffset(jodit);
        if (current != null && current !== offset) return false;
    }
    try {
        const clamped = Math.max(0, Math.min(offset, getTotalTextLengthInRoot(root)));
        const resolved = resolveTextOffsetInRoot(root, clamped);
        const range = root.ownerDocument.createRange();
        range.setStart(resolved.node, resolved.offset);
        range.collapse(true);
        return selectClauseEditorRange(jodit, range);
    } catch {
        return false;
    }
}

/** Run DOM cleanup without losing the typing caret (Backspace/Delete sync paths). */
export function preserveClauseEditorSelectionDuring(jodit, fn) {
    const skipRestore = shouldSkipClauseEditorTextCaretRestore(jodit);
    const useTableBookmark =
        !skipRestore &&
        (isClauseEditorSelectionInTable(jodit) || jodit.__emsTableHistorySync);
    const tableBookmark = useTableBookmark ? captureTableCellCaretBookmark(jodit) : null;
    const offset = skipRestore || tableBookmark ? null : captureCollapsedCaretOffset(jodit);
    const result = fn();
    if (tableBookmark) {
        const restore = () => {
            jodit.__emsForceCaretRestore = true;
            try {
                restoreTableCellCaretBookmark(jodit, tableBookmark);
            } finally {
                jodit.__emsForceCaretRestore = false;
            }
        };
        restore();
        requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(restore);
        });
    } else if (offset != null) {
        const restore = () => {
            jodit.__emsForceCaretRestore = true;
            try {
                restoreCollapsedCaretOffset(jodit, offset);
            } finally {
                jodit.__emsForceCaretRestore = false;
            }
        };
        restore();
        requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(restore);
        });
    }
    return result;
}

/** True while the user is mid keystroke / IME compose — block DOM surgery. */
export function isClauseEditorTypingActive(jodit) {
    return Boolean(jodit?.__emsTypingLock || jodit?.__emsDeleteKeyLock || jodit?.__emsListApplyLock);
}

/** Bind keydown/keyup guard so async passes never mutate the editor mid-keystroke. */
export function bindClauseEditorTypingCaretGuard(jodit, getEditorBody, onTypingIdle) {
    const root = typeof getEditorBody === 'function' ? getEditorBody() : null;
    if (!jodit || !root || root.__emsTypingCaretGuardBound) return;
    root.__emsTypingCaretGuardBound = true;

    let releaseTimer = null;
    const arm = () => {
        if (releaseTimer) {
            clearTimeout(releaseTimer);
            releaseTimer = null;
        }
        jodit.__emsTypingLock = true;
    };
    const release = () => {
        if (releaseTimer) clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => {
            releaseTimer = null;
            jodit.__emsTypingLock = false;
            if (typeof onTypingIdle === 'function') onTypingIdle();
        }, 120);
    };

    root.addEventListener('keydown', arm, true);
    root.addEventListener('compositionstart', arm, true);
    root.addEventListener('keyup', release, true);
    root.addEventListener('compositionend', release, true);
    root.addEventListener('input', arm, true);
    root.addEventListener('input', release, true);
}

function resolveTextOffsetInRoot(root, targetOffset) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let counted = 0;
    let node;
    let lastText = null;
    while ((node = walker.nextNode())) {
        lastText = node;
        const len = node.textContent?.length ?? 0;
        if (counted + len >= targetOffset) {
            return { node, offset: Math.max(0, Math.min(len, targetOffset - counted)) };
        }
        counted += len;
    }
    if (lastText) {
        return { node: lastText, offset: lastText.textContent?.length ?? 0 };
    }
    return { node: root, offset: 0 };
}

function selectClauseEditorRange(jodit, range) {
    if (!range || !jodit?.s) return false;
    try {
        if (jodit.s.focus) jodit.s.focus();
        if (jodit.s.selectRange) jodit.s.selectRange(range);
        else {
            const sel = range.startContainer?.ownerDocument?.defaultView?.getSelection?.();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
        jodit.__emsLastGoodListRange = range.cloneRange();
        return true;
    } catch {
        return false;
    }
}

function restoreTextRangeBookmark(jodit, bookmark) {
    const root = getWysiwygEditor(jodit);
    if (!root || !bookmark) return false;
    try {
        const start = resolveTextOffsetInRoot(root, bookmark.start);
        const end = resolveTextOffsetInRoot(root, bookmark.end);
        const range = root.ownerDocument.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return selectClauseEditorRange(jodit, range);
    } catch {
        return false;
    }
}

export function scheduleClauseEditorSelectionRestore(jodit, selectionBookmark) {
    if (jodit.__emsListApplyLock) return;
    if (isClauseEditorSelectionInTable(jodit)) return;
    const run = () => {
        if (jodit.__emsListApplyLock) return;
        if (isClauseEditorSelectionInTable(jodit)) return;
        const root = getWysiwygEditor(jodit);
        if (root?.querySelector?.('table')) return;
        if (root && stripClauseEditorSpuriousBlankRows(root)) {
            syncListApplyToJodit(jodit, root);
        }
        if (selectionBookmark && restoreTextRangeBookmark(jodit, selectionBookmark)) return;
        restoreListToolbarSelection(jodit);
        const afterRestore = getWysiwygEditor(jodit);
        if (afterRestore && stripClauseEditorSpuriousBlankRows(afterRestore)) {
            syncListApplyToJodit(jodit, afterRestore);
        }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
}

export function captureClauseEditorSelectionBookmark(jodit) {
    if (!jodit.__emsListApplyLock && !jodit.__emsListSelRestoredForApply) {
        restoreListToolbarSelection(jodit);
    }
    const root = getWysiwygEditor(jodit);
    let range = jodit.s?.range;
    if ((!range || range.collapsed) && jodit.__emsLastGoodListRange) {
        range = jodit.__emsLastGoodListRange;
    }
    if (!range || range.collapsed) {
        range = getEffectiveListRange(jodit);
    }
    if (!root || !range || range.collapsed) return null;
    return captureTextRangeBookmark(root, range);
}

/** Lines from a block, clipped to the active range (avoids bulleting unselected <br> rows). */
function getLineHtmlsFromElementInRange(el, range) {
    if (!el || !range || !rangeIntersectsNode(range, el)) return [];
    const allLines = getLineHtmlsFromElement(el);
    if (!allLines.length) return [];
    if (allLines.length === 1 || rangeFullyContainsNode(range, el)) return allLines;

    const doc = el.ownerDocument;
    try {
        const blockRange = doc.createRange();
        blockRange.selectNodeContents(el);
        const clipped = doc.createRange();
        clipped.setStart(
            range.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0
                ? range.startContainer
                : blockRange.startContainer,
            range.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0
                ? range.startOffset
                : blockRange.startOffset
        );
        clipped.setEnd(
            range.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0
                ? range.endContainer
                : blockRange.endContainer,
            range.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0
                ? range.endOffset
                : blockRange.endOffset
        );
        const holder = doc.createElement('div');
        holder.appendChild(clipped.cloneContents());
        const fromClip = expandLineHtmlsForList(getLineHtmlsFromElement(holder));
        if (fromClip.length) return fromClip;
    } catch {
        /* fall through */
    }
    return allLines;
}

function getLineHtmlsFromElement(el) {
    let html = String(el?.innerHTML || '');
    html = html
        .replace(/^(\s|&nbsp;|<br\s*\/?>)+/gi, '')
        .replace(/(\s|&nbsp;|<br\s*\/?>)+$/gi, '');
    if (!html.trim()) return [];
    if (/<br\s*\/?>/i.test(html)) {
        return html
            .split(/<br\s*\/?>/gi)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    return [html];
}

function lineHtmlHasText(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .trim().length > 0;
}

/** Flatten collected lines; split any entry that still contains <br> into separate list rows. */
function expandLineHtmlsForList(lines) {
    /** @type {string[]} */
    const out = [];
    lines.forEach((html) => {
        const parts = getLineHtmlsFromElement({ innerHTML: html });
        if (parts.length > 1) parts.forEach((p) => out.push(p));
        else out.push(html);
    });
    return out.filter(lineHtmlHasText).map(stripPlainClausePrefixFromLineHtml);
}

/** Fallback when block-walk misses lines inside a partial DOM selection. */
function collectLineHtmlsFromRangeFragment(root, range) {
    if (!root || !range || range.collapsed) return [];
    const doc = root.ownerDocument;
    let fragment;
    try {
        fragment = range.cloneContents();
    } catch {
        return [];
    }
    if (!fragment) return [];

    const holder = doc.createElement('div');
    holder.appendChild(fragment);

    /** @type {string[]} */
    const lines = [];
    const pushEl = (el) => {
        getLineHtmlsFromElement(el).forEach((h) => lines.push(h));
    };

    holder.querySelectorAll('li').forEach((li) => {
        if (clauseElementIsVisuallyBlank(li) && !listItemHasEditablePlaceholder(li)) return;
        pushEl(li);
    });
    [...holder.children].forEach((node) => {
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') return;
        if (tag === 'LI') return;
        if (clauseElementIsVisuallyBlank(node)) return;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
            pushEl(node);
        }
    });
    if (!lines.length) {
        getLineHtmlsFromElement(holder).forEach((h) => lines.push(h));
    }
    return expandLineHtmlsForList(lines);
}

/** All visual lines in the current selection (block walk + fragment fallback). */
function collectSelectedLineHtmls(root, range) {
    let lines = expandLineHtmlsForList(collectLineHtmlsInRange(root, range));
    if (lines.length < 2) {
        const fromFragment = collectLineHtmlsFromRangeFragment(root, range);
        if (fromFragment.length > lines.length) lines = fromFragment;
    }
    return lines;
}

/** Collect every visual line in the selection (lists, paragraphs, or <br>-split blocks). */
function collectLineHtmlsInRange(root, range) {
    /** @type {string[]} */
    const lines = [];

    const pushBlock = (el) => {
        if (!el || !rangeIntersectsNode(range, el)) return;
        if (el.tagName === 'LI') {
            if (clauseElementIsVisuallyBlank(el) && !listItemHasEditablePlaceholder(el)) {
                return;
            }
        } else if (clauseElementIsVisuallyBlank(el)) {
            return;
        }
        getLineHtmlsFromElementInRange(el, range).forEach((h) => lines.push(h));
    };

    const walk = (parent) => {
        if (!parent?.childNodes) return;
        [...parent.childNodes].forEach((node) => {
            if (node.nodeType !== 1) return;
            const tag = node.tagName;
            if (tag === 'TABLE') return;
            if (tag === 'UL' || tag === 'OL') {
                [...node.children].forEach((c) => {
                    if (c.tagName === 'LI') pushBlock(c);
                });
                return;
            }
            if (tag === 'LI') {
                pushBlock(node);
                return;
            }
            if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return;
            if (node.closest('ul, ol, table')) return;
            const hasInnerBlocks = node.querySelector(':scope > p, :scope > div, :scope > ul, :scope > ol');
            if (tag === 'DIV' && hasInnerBlocks) {
                walk(node);
                return;
            }
            pushBlock(node);
        });
    };

    walk(root);
    return lines;
}

/** Every visual line in document order (nested <p>, <li>, <br> splits — not only direct children). */
function collectAllBlockLinesInOrder(root) {
    if (!root?.ownerDocument) return [];
    /** @type {string[]} */
    const lines = [];
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            const tag = node.tagName;
            if (!tag) return NodeFilter.FILTER_SKIP;
            if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TR') {
                return NodeFilter.FILTER_REJECT;
            }
            if (tag === 'UL' || tag === 'OL') return NodeFilter.FILTER_SKIP;
            if (tag === 'LI') return NodeFilter.FILTER_ACCEPT;
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
                if (node.closest('ul, ol, li, table')) return NodeFilter.FILTER_SKIP;
                if (node.querySelector(':scope > p, :scope > div, :scope > ul, :scope > ol')) {
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        },
    });

    while (walker.nextNode()) {
        const el = /** @type {Element} */ (walker.currentNode);
        getLineHtmlsFromElement(el).forEach((h) => {
            const t = h.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim();
            if (t) lines.push(h);
        });
    }
    return lines;
}

function isPerLineBulletLayout(root, allLines) {
    if (!root || allLines.length < 2) return false;
    const lists = [...root.querySelectorAll('ul, ol')].filter((l) => !l.closest('table'));
    const singleLiLists = lists.filter((l) => l.querySelectorAll(':scope > li').length === 1);
    return singleLiLists.length >= 2 && singleLiLists.length >= allLines.length - 1;
}

function shouldRebuildAllLinesAsOneList(jodit, root, allLines) {
    if (!root || allLines.length < 2) return false;
    if (isPerLineBulletLayout(root, allLines)) return false;
    /* Never replace the whole editor body when tables/media are present. */
    if (editorHasProtectedStructures(root)) return false;

    const range = getEffectiveListRange(jodit);
    const hasSelection = range && !range.collapsed;

    /* Full rebuild only when the selection truly covers every text line in the clause. */
    if (hasSelection) {
        const selLines = collectSelectedLineHtmls(root, range);
        if (selLines.length < 2) return false;
        return selLines.length >= allLines.length;
    }

    /* Toolbar click collapsed the native range — never guess full rebuild if a table exists. */
    if (editorHasProtectedStructures(root)) return false;

    /* No stashed selection: only rebuild mixed layouts when the whole clause has no table. */
    if (editorNeedsFullListRebuild(root)) return true;
    return false;
}

function isPartialLineSelection(jodit, root, allLines) {
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !root) return false;
    const selLines = collectSelectedLineHtmls(root, range);
    return selLines.length >= 2 && selLines.length < allLines.length;
}

/** Apply bullets/numbers to the current partial line selection only. */
function tryApplyListToSelectedLines(
    jodit,
    editorRoot,
    tagName,
    preset,
    clearClassNames,
    oppositeClearClassNames
) {
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !editorRoot) return false;

    const selLines = collectSelectedLineHtmls(editorRoot, range);
    if (selLines.length < 2) return false;

    const oppClear = oppositeClearClassNames || (tagName === 'ul' ? OL_CLASS_NAMES : BULLET_CLASS_NAMES);

    /* Second apply: selection is already <ul>/<ol> — restyle in place, never deleteContents rebuild. */
    if (getPlainBlocksInRange(jodit).length === 0) {
        const hasList =
            getListsIntersectingRange(jodit, tagName).length > 0 ||
            getListsIntersectingRange(jodit, tagName === 'ul' ? 'ol' : 'ul').length > 0;
        if (hasList) {
            applyListPresetInPlace(jodit, editorRoot, tagName, preset, clearClassNames, oppClear);
            const styled = getListsToStyle(jodit, tagName);
            rememberListApplyCaretTarget(jodit, styled[styled.length - 1] || styled[0]);
            return true;
        }
    }

    let rebuilt =
        replaceSelectedBlocksWithList(
            jodit,
            tagName,
            selLines,
            preset,
            clearClassNames,
            oppositeClearClassNames
        ) ||
        replaceSelectionWithSingleList(
            jodit,
            tagName,
            preset,
            clearClassNames,
            oppositeClearClassNames
        );

    if (!rebuilt) {
        const wrapped = wrapPlainBlocksInList(
            jodit,
            tagName,
            preset,
            clearClassNames,
            oppositeClearClassNames
        );
        rebuilt = wrapped[0] || null;
    }

    if (!rebuilt) {
        if (tagName === 'ul') {
            convertListsInScope(jodit, 'ol', 'ul', oppClear);
        } else {
            convertListsInScope(jodit, 'ul', 'ol', oppClear);
        }
        let lists = getListsToStyle(jodit, tagName);
        if (!lists.length) {
            lists = getListsIntersectingRange(jodit, tagName);
        }
        if (lists.length) {
            lists.forEach((list) =>
                applyPresetToListElement(list, preset, clearClassNames, oppClear)
            );
            rebuilt = lists[0];
        }
    }

    if (!rebuilt) return false;

    const after = getWysiwygEditor(jodit);
    if (after) {
        cleanupNestedAndEmptyListItems(after);
        mergeAdjacentLists(after, 'ul');
        mergeAdjacentLists(after, 'ol');
        stripLeadingListMarkers(after);
        stripClauseInlineFontSizes(after);
    }
    rememberListApplyCaretTarget(jodit, rebuilt);
    return true;
}

function buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames) {
    const list = doc.createElement(tagName);
    lineHtmls.forEach((html) => {
        const li = doc.createElement('li');
        li.innerHTML = stripPlainClausePrefixFromLineHtml(html);
        if (!String(li.textContent || '').replace(/\u00a0/g, ' ').trim() && !li.querySelector('br')) {
            li.appendChild(doc.createElement('br'));
        }
        li.style.removeProperty('margin-left');
        li.style.removeProperty('padding-left');
        li.style.removeProperty('text-indent');
        list.appendChild(li);
    });
    applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames);
    return list;
}

/** Push live DOM to Jodit value/onChange without setEditorValue (that can strip tables). */
function syncEditorFromDom(jodit) {
    if (!jodit || jodit.__emsListApplyLock) return;
    /* Never assign jodit.value during live edits — it resets the typing caret. */
    jodit.e?.fire?.('change');
}

function notifyEditorContentChange(jodit) {
    if (!jodit) return;
    jodit.e?.fire?.('change');
}

/** Replace entire editor HTML — only for select-all rebuilds with no tables below. */
function setJoditEditorHtml(jodit, html) {
    const root = getWysiwygEditor(jodit);
    if (root) root.innerHTML = html;
    if (jodit.__emsListApplyLock) return;
    if (typeof jodit.setEditorValue === 'function') {
        jodit.setEditorValue(html);
    } else if (jodit.editor != null) {
        jodit.value = html;
    }
    syncEditorFromDom(jodit);
}

/** Non-collapsed text range in the clause body (survives toolbar focus steal). */
function getClauseEditorActiveTextRange(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return null;

    let range = null;
    try {
        const docSel = root.ownerDocument?.getSelection?.();
        if (docSel && !docSel.isCollapsed && docSel.anchorNode) {
            const anchorIn = root.contains(docSel.anchorNode);
            const focusIn = docSel.focusNode ? root.contains(docSel.focusNode) : anchorIn;
            if (anchorIn && focusIn && String(docSel).trim()) {
                range = docSel.getRangeAt(0);
            }
        }
    } catch {
        /* ignore */
    }

    if (
        (!range || range.collapsed) &&
        jodit.s?.isInsideArea &&
        jodit.s?.range &&
        !jodit.s.range.collapsed
    ) {
        range = jodit.s.range;
    }

    if (!range || range.collapsed) return null;
    const clipped = clampRangeExcludingProtectedStructures(root, range);
    return clipped.collapsed ? null : clipped;
}

/** Shrink a range so it never includes tables/media (prevents deleteContents wiping them). */
function clampRangeExcludingProtectedStructures(root, range) {
    if (!root || !range || range.collapsed) return range;
    const doc = root.ownerDocument;
    let clipped = range.cloneRange();

    root.querySelectorAll('table, img, video, iframe, object, embed').forEach((node) => {
        try {
            const nodeRange = doc.createRange();
            if (node.tagName === 'TABLE') {
                nodeRange.selectNode(node);
                if (node.contains(clipped.startContainer) && node.contains(clipped.endContainer)) {
                    return;
                }
            } else {
                nodeRange.selectNode(node);
            }
            const intersects =
                clipped.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
                clipped.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
            if (!intersects) return;

            const next = doc.createRange();
            if (clipped.compareBoundaryPoints(Range.START_TO_START, nodeRange) >= 0 &&
                clipped.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) {
                next.setStartAfter(node);
            } else {
                next.setStart(clipped.startContainer, clipped.startOffset);
            }
            if (clipped.compareBoundaryPoints(Range.END_TO_END, nodeRange) <= 0 &&
                clipped.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) {
                next.setEndBefore(node);
            } else {
                next.setEnd(clipped.endContainer, clipped.endOffset);
            }
            if (!next.collapsed) clipped = next;
        } catch {
            /* ignore */
        }
    });

    return clipped.collapsed ? range : clipped;
}

/**
 * Replace selected plain blocks with one list (one <li> per visual line).
 * More reliable than range.deleteContents() across multiple <p>/<div> siblings.
 */
function replaceSelectedBlocksWithList(jodit, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames) {
    if (lineHtmls.length < 2) return null;
    const doc = getWysiwygEditor(jodit)?.ownerDocument;
    if (!doc) return null;

    const range = getEffectiveListRange(jodit);
    const blocks = getPlainBlocksInRange(jodit).filter(
        (block) => !nodeHasProtectedDescendantOutsideRange(block, range)
    );
    if (!blocks.length) return null;

    const list = buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames);
    const first = blocks[0];
    const parent = first.parentNode;
    if (!parent) return null;

    parent.insertBefore(list, first);
    blocks.forEach((block) => {
        if (block.parentNode && !nodeHasProtectedDescendantOutsideRange(block, range)) {
            block.remove();
        }
    });
    splitListItemsOnBr(list);
    return list;
}

/**
 * Select-all + bullet: replace the whole selection with one list (one <li> per line).
 * Avoids Jodit leaving plain/indented lines outside <ul>.
 */
function replaceSelectionWithSingleList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const root = getWysiwygEditor(jodit);
    const range = getEffectiveListRange(jodit);
    if (!range || range.collapsed || !root) return null;

    const lineHtmls = collectSelectedLineHtmls(root, range);
    if (lineHtmls.length < 2) return null;

    if (getPlainBlocksInRange(jodit).length === 0) {
        const hasLi = [...root.querySelectorAll('li')].some((li) => rangeIntersectsNode(range, li));
        if (hasLi) return null;
    }

    const fromBlocks = replaceSelectedBlocksWithList(
        jodit,
        tagName,
        lineHtmls,
        preset,
        clearClassNames,
        oppositeClearClassNames
    );
    if (fromBlocks) return fromBlocks;

    const doc = root.ownerDocument;
    const list = buildListElement(doc, tagName, lineHtmls, preset, clearClassNames, oppositeClearClassNames);
    splitListItemsOnBr(list);

    try {
        range.deleteContents();
        range.insertNode(list);
        stripClauseEditorSpuriousBlankRows(root);
        const lastLi = list.querySelector(':scope > li:last-child');
        if (lastLi && !jodit.__emsListApplyLock) {
            placeCaretInBlock(jodit, lastLi, (lastLi.textContent || '').length);
        } else if (!lastLi) {
            range.setStartAfter(list);
            range.collapse(true);
            if (jodit.s?.selectRange) jodit.s.selectRange(range);
        }
    } catch {
        return null;
    }
    return list;
}

function getEditorLineSummary(root) {
    if (!root) {
        return { totalLines: 0, liCount: 0, listCount: 0, singleLiListCount: 0 };
    }
    const doc = root.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(root);
    const totalLines = collectLineHtmlsInRange(root, range).length;
    const lists = [...root.querySelectorAll('ul, ol')].filter((l) => !l.closest('table'));
    const liCount = lists.reduce(
        (n, l) => n + l.querySelectorAll(':scope > li').length,
        0
    );
    const singleLiListCount = lists.filter(
        (l) => l.querySelectorAll(':scope > li').length === 1
    ).length;
    return { totalLines, liCount, listCount: lists.length, singleLiListCount };
}

/**
 * Partial apply: e.g. 2 bullets + 8 plain lines. Does not trigger for per-line bullets
 * (many separate single-item lists).
 */
function editorNeedsFullListRebuild(root) {
    const { totalLines, liCount, listCount, singleLiListCount } = getEditorLineSummary(root);
    if (totalLines < 2 || liCount === 0) return false;
    if (liCount >= totalLines) return false;
    if (singleLiListCount >= 2 && singleLiListCount >= totalLines - 1) return false;
    if (listCount >= 2 && singleLiListCount === listCount) return false;
    return true;
}

/** Full rebuild when user selected most/all plain lines (select-all + bullet). */
function selectionCoversMostEditorLines(jodit, root) {
    const range = jodit.s?.range;
    if (!range || range.collapsed) return false;
    const doc = root.ownerDocument;
    const full = doc.createRange();
    full.selectNodeContents(root);
    const totalLines = collectLineHtmlsInRange(root, full).length;
    const selLines = collectLineHtmlsInRange(root, range).length;
    if (totalLines < 2 || selLines < 2) return false;
    return selLines >= totalLines - 1 || selLines >= Math.ceil(totalLines * 0.75);
}

function shouldUseFullEditorListRebuild(jodit, root) {
    if (!root) return false;
    if (editorNeedsFullListRebuild(root)) return true;
    const { totalLines, liCount } = getEditorLineSummary(root);
    if (totalLines >= 2 && liCount === 0 && selectionCoversMostEditorLines(jodit, root)) {
        return true;
    }
    return false;
}

/** Rebuild entire clause editor body as one list (fallback when toolbar click drops selection). */
function replaceEditorBodyWithSingleList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const root = getWysiwygEditor(jodit);
    if (!root) return null;

    const doc = root.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(root);
    const lineHtmls = collectLineHtmlsInRange(root, range);
    if (lineHtmls.length < 2) return null;

    const list = doc.createElement(tagName);
    lineHtmls.forEach((html) => {
        const li = doc.createElement('li');
        li.innerHTML = html;
        list.appendChild(li);
    });
    applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames);
    root.innerHTML = '';
    root.appendChild(list);
    return list;
}

/** Remember the last non-empty editor selection (opening the bullet menu often collapses it). */
function rememberEditorListSelection(jodit) {
    try {
        if (isClauseEditorSelectionInTable(jodit)) return;
        const activeRange = getClauseEditorActiveTextRange(jodit);
        if (activeRange) {
            jodit.__emsLastGoodListRange = activeRange.cloneRange();
        }
    } catch {
        /* ignore */
    }
}

/** Toolbar list menus steal focus — stash selection before the click (clone only, no visible re-select). */
function stashListToolbarSelection(jodit) {
    try {
        const activeRange = getClauseEditorActiveTextRange(jodit);
        if (activeRange) {
            jodit.__emsSavedListRange = activeRange.cloneRange();
            jodit.__emsLastGoodListRange = activeRange.cloneRange();
            jodit.__emsListToolbarSelStashed = true;
            return;
        }
        if (jodit.__emsLastGoodListRange) {
            jodit.__emsSavedListRange = jodit.__emsLastGoodListRange.cloneRange();
            jodit.__emsListToolbarSelStashed = true;
        }
    } catch {
        /* ignore */
    }
}

function restoreListToolbarSelection(jodit) {
    if (isClauseEditorSelectionInTable(jodit)) return false;
    let restored = false;
    let restoredFromSavedRange = false;
    if (jodit.__emsSavedListRange) {
        try {
            if (selectClauseEditorRange(jodit, jodit.__emsSavedListRange)) {
                restored = true;
                restoredFromSavedRange = true;
            }
        } catch {
            /* ignore */
        }
        jodit.__emsSavedListRange = null;
    }
    if (jodit.__emsListToolbarSelStashed) {
        if (!restoredFromSavedRange) {
            try {
                if (jodit.s?.restore?.()) restored = true;
                if (jodit.s?.range && !jodit.s.range.collapsed) {
                    jodit.__emsLastGoodListRange = jodit.s.range.cloneRange();
                }
            } catch {
                /* ignore */
            }
        }
        jodit.__emsListToolbarSelStashed = false;
    }
    if (!restored && jodit.__emsLastGoodListRange) {
        try {
            if (selectClauseEditorRange(jodit, jodit.__emsLastGoodListRange)) restored = true;
        } catch {
            /* ignore */
        }
    }
    return restored;
}

/** Restore stashed text selection before toolbar formatting (font, color, bold, etc.). */
export function restoreClauseEditorFormatSelection(jodit) {
    return restoreListToolbarSelection(jodit);
}

/** Stash current selection before toolbar steals focus. */
export function stashClauseEditorFormatSelection(jodit) {
    stashListToolbarSelection(jodit);
}

const EMS_TOOLBAR_UI_SELECTOR =
    '.jodit-toolbar, .jodit-toolbar__box, .jodit-popup, .jodit-toolbar-button, .jodit-toolbar-select';

function isClauseEditorToolbarUiTarget(target) {
    return Boolean(target?.closest?.(EMS_TOOLBAR_UI_SELECTOR));
}

function popupBelongsToJodit(popupEl, jodit) {
    if (!popupEl || !jodit) return false;
    const owner = popupEl.jodit;
    return Boolean(owner && (owner === jodit || owner.id === jodit.id));
}

function stashClauseEditorToolbarPointerDown(e, jodit) {
    if (!jodit || !isClauseEditorToolbarUiTarget(e.target)) return;
    const popup = e.target?.closest?.('.jodit-popup');
    // Never intercept dropdown / color-picker menus — Jodit opens and handles these.
    if (popup) return;

    const heading = getActiveEditableClauseHeading();
    const wys = getWysiwygEditor(jodit);
    const active = document.activeElement;
    const headingActive = Boolean(heading?.contains(active));
    const bodyActive = Boolean(wys?.contains(active));

    if (isSelectionInEditableClauseHeading() || headingActive) {
        clearEditableClauseHeadingSelectionStash();
        stashEditableClauseHeadingForToolbar();
    } else {
        clearEditableClauseHeadingSelectionStash();
        const getBody =
            typeof jodit.__emsClauseEditorBody === 'function'
                ? jodit.__emsClauseEditorBody
                : () => wys || jodit.editor || null;
        armTableToolbarCellStash(jodit, getBody);
        const hasBodyTextSel = Boolean(getClauseEditorActiveTextRange(jodit));
        if (
            bodyActive ||
            hasBodyTextSel ||
            (jodit.s?.isInsideArea && jodit.s?.range && !jodit.s.range.collapsed)
        ) {
            stashClauseEditorFormatSelection(jodit);
        }
    }
    // Do not preventDefault — it blocks Jodit dropdown triggers (font/size/color).
    // saveSelectionOnBlur in ClauseEditor config preserves the text selection.
}

/** External toolbar lives outside the editor DOM — stash selection on its mousedown. */
export function registerClauseEditorExternalToolbarSelection(jodit, toolbarHostId) {
    if (!jodit || !toolbarHostId) return;

    const bindActiveEditor = () => {
        const host = document.getElementById(toolbarHostId);
        if (!host) return;
        // Readonly toolbar keeper must not become the command target while editing.
        if (!jodit.o?.readonly) {
            host.__emsActiveClauseEditorJodit = jodit;
        }

        if (!host.__emsToolbarSelHostBound) {
            host.__emsToolbarSelHostBound = true;
            host.addEventListener(
                'mousedown',
                (e) => stashClauseEditorToolbarPointerDown(e, host.__emsActiveClauseEditorJodit),
                true
            );
        }

        if (!host.__emsToolbarDocSelBound) {
            host.__emsToolbarDocSelBound = true;
            document.addEventListener(
                'mousedown',
                (e) => {
                    const active = host.__emsActiveClauseEditorJodit;
                    if (!active) return;
                    if (e.target?.closest?.('.jodit-popup, .jodit-color-picker')) return;
                    if (!isClauseEditorToolbarUiTarget(e.target)) return;
                    if (host.contains(e.target)) return;
                    stashClauseEditorToolbarPointerDown(e, active);
                },
                true
            );
        }
    };

    bindActiveEditor();
    jodit.e.on('afterInit', bindActiveEditor);

    if (!jodit.__emsExternalToolbarActiveBound) {
        jodit.__emsExternalToolbarActiveBound = true;
        jodit.e.on('beforeDestruct', () => {
            const host = document.getElementById(toolbarHostId);
            if (host?.__emsActiveClauseEditorJodit === jodit) {
                host.__emsActiveClauseEditorJodit = null;
            }
        });
    }
}

function registerListToolbarSelectionHooks(jodit) {
    if (!jodit || jodit.__emsListToolbarSelHooks) return;
    jodit.__emsListToolbarSelHooks = true;

    const onEditorSelectionActivity = () => {
        if (jodit.__emsListApplyLock) return;
        const staged = (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
        if (staged.length >= 1 || jodit.__emsTableToolbarInteracting) return;
        rememberEditorListSelection(jodit);
    };

    jodit.events.on('mouseup', onEditorSelectionActivity);
    jodit.events.on('keyup', onEditorSelectionActivity);
    jodit.events.on('changeSelection', onEditorSelectionActivity);

    jodit.events.on(
        'mousedown',
        (e) => {
            const t = e.target;
            if (!t?.closest) return;
            const wysiwyg = t.closest('.jodit-wysiwyg');
            if (wysiwyg) {
                rememberEditorListSelection(jodit);
                return;
            }
            stashClauseEditorToolbarPointerDown(e, jodit);
        },
        true
    );

    const root = getWysiwygEditor(jodit);
    const doc = root?.ownerDocument;
    if (doc && !doc.__emsListSelChangeBound) {
        doc.__emsListSelChangeBound = true;
        doc.addEventListener('selectionchange', () => {
            if (jodit.__emsListApplyLock) return;
            const staged = (jodit.__emsFormatTableCells || []).filter((c) => c?.isConnected);
            if (staged.length >= 1 || jodit.__emsTableToolbarInteracting) return;
            rememberEditorListSelection(jodit);
        });
    }

    jodit.e.on('beforeCommand.emsToolbarSelRestore', (command) => {
        const c = String(command || '').toLowerCase();
        if (c === 'insertunorderedlist' || c === 'insertorderedlist') return;
        if (/^table/.test(c)) return;
        if (
            c === 'backspacebutton' ||
            c === 'backspace' ||
            c === 'deletebutton' ||
            c === 'delete'
        ) {
            return;
        }
        if (isClauseEditorSelectionInTable(jodit)) {
            jodit.__emsPendingFormatBookmark = null;
            return;
        }
        const getBody =
            typeof jodit.__emsClauseEditorBody === 'function'
                ? jodit.__emsClauseEditorBody
                : null;
        if (getBody && shouldSkipToolbarTextRestoreForTableCells(jodit, getBody)) {
            jodit.__emsPendingFormatBookmark = null;
            return;
        }
        jodit.__emsPendingFormatBookmark = captureClauseEditorSelectionBookmark(jodit);
        restoreListToolbarSelection(jodit);
    });

    jodit.e.on('beforeCommand.emsFontApply', (command) => {
        const c = String(command || '').toLowerCase();
        if (c !== 'fontname' && c !== 'fontsize') return;
        restoreListToolbarSelection(jodit);
    });

    jodit.e.on('afterExec.emsToolbarSelRestore', () => {
        if (jodit.__emsSkipToolbarSelRestore || jodit.__emsListApplyLock) {
            jodit.__emsSkipToolbarSelRestore = false;
            jodit.__emsPendingFormatBookmark = null;
            return;
        }
        if (isClauseEditorSelectionInTable(jodit)) {
            jodit.__emsPendingFormatBookmark = null;
            return;
        }
        scheduleClauseEditorSelectionRestore(jodit, jodit.__emsPendingFormatBookmark || null);
        jodit.__emsPendingFormatBookmark = null;
    });
}

function getSelectedListItems(list, range) {
    if (!list || !range) return [];
    return [...list.children].filter((c) => {
        if (c.tagName !== 'LI') return false;
        if (!rangeIntersectsNode(range, c)) return false;
        if (clauseElementIsVisuallyBlank(c) && !listItemHasEditablePlaceholder(c)) {
            return getLineHtmlsFromElementInRange(c, range).some(lineHtmlHasText);
        }
        return true;
    });
}

/**
 * Split one <ul>/<ol> so only selected <li> items move into their own list(s).
 * Unselected segments keep the original list styling.
 */
function splitListPreserveStyles(list, selectedLis) {
    const allItems = [...list.children].filter((c) => c.tagName === 'LI');
    if (!selectedLis.length || selectedLis.length === allItems.length || !list.parentNode) {
        return [list];
    }

    const parent = list.parentNode;
    const doc = list.ownerDocument;
    const tag = list.tagName.toLowerCase();
    /** @type {Array<{ selected: boolean, items: Element[] }>} */
    const segments = [];
    let cur = null;

    for (const li of allItems) {
        const sel = selectedLis.includes(li);
        if (!cur || cur.selected !== sel) {
            cur = { selected: sel, items: [] };
            segments.push(cur);
        }
        cur.items.push(li);
    }

    const frag = doc.createDocumentFragment();
    /** @type {Element[]} */
    const selectedLists = [];

    for (const seg of segments) {
        const nl = doc.createElement(tag);
        if (!seg.selected) {
            nl.className = list.className;
            const styleAttr = list.getAttribute('style');
            if (styleAttr) nl.setAttribute('style', styleAttr);
            if (list.style?.listStyleType) nl.style.listStyleType = list.style.listStyleType;
        }
        seg.items.forEach((li) => nl.appendChild(li));
        frag.appendChild(nl);
        if (seg.selected) selectedLists.push(nl);
    }

    parent.replaceChild(frag, list);
    return selectedLists.length ? selectedLists : [list];
}

/** Merge consecutive sibling lists only when bullet/number style matches. */
function mergeAdjacentLists(root, tagName = 'ol') {
    if (!root?.querySelectorAll) return;
    const tag = tagName.toUpperCase();

    const mergeInParent = (parent) => {
        if (!parent?.children) return;
        let i = 0;
        while (i < parent.children.length) {
            const node = parent.children[i];
            if (node.tagName === tag) {
                let j = i + 1;
                while (j < parent.children.length && parent.children[j].tagName === tag) {
                    const next = parent.children[j];
                    if (listStyleFingerprint(node) !== listStyleFingerprint(next)) break;
                    while (next.firstChild) {
                        node.appendChild(next.firstChild);
                    }
                    next.remove();
                }
            } else if (node.nodeType === 1) {
                mergeInParent(node);
            }
            i += 1;
        }
    };

    mergeInParent(root);
}

/** Remove empty <li> shells and hoist nested lists (fixes extra bullets when changing style). */
function cleanupNestedAndEmptyListItems(root) {
    if (!root?.querySelectorAll) return;
    let changed = true;
    while (changed) {
        changed = false;
        root.querySelectorAll('ul, ol').forEach((list) => {
            [...list.querySelectorAll(':scope > li')].forEach((li) => {
                const nested = li.querySelector(':scope > ul, :scope > ol');
                const directText = getListItemDirectText(li);
                const onlyNested =
                    nested &&
                    !directText &&
                    [...li.childNodes].every(
                        (n) =>
                            n.nodeType === 3 ||
                            (n.nodeType === 1 &&
                                (n.tagName === 'BR' || n.tagName === 'UL' || n.tagName === 'OL'))
                    );
                if (onlyNested && nested.parentNode === li) {
                    const parent = li.parentNode;
                    while (nested.firstChild) {
                        parent.insertBefore(nested.firstChild, li);
                    }
                    nested.remove();
                    li.remove();
                    changed = true;
                    return;
                }
                if (
                    !directText &&
                    !nested &&
                    !listItemHasEditablePlaceholder(li)
                ) {
                    li.remove();
                    changed = true;
                }
            });
        });
    }
}

/** Changing bullet style on an existing list — restyle in place, do not wrap/rebuild. */
function shouldApplyListPresetInPlaceOnly(jodit, editorRoot, tagName) {
    if (!editorRoot) return false;
    if (getPlainBlocksInRange(jodit).length > 0) return false;
    const oppTag = tagName === 'ul' ? 'ol' : 'ul';
    return (
        getListsIntersectingRange(jodit, tagName).length > 0 ||
        getListsIntersectingRange(jodit, oppTag).length > 0
    );
}

function applyListPresetInPlace(jodit, editorRoot, tagName, preset, clearClassNames, oppClear) {
    if (tagName === 'ul') {
        convertListsInScope(jodit, 'ol', 'ul', oppClear);
    } else {
        convertListsInScope(jodit, 'ul', 'ol', oppClear);
    }
    let lists = getListsToStyle(jodit, tagName);
    if (!lists.length) {
        lists = getListsIntersectingRange(jodit, tagName);
    }
    lists.forEach((list) =>
        applyPresetToListElement(list, preset, clearClassNames, oppClear)
    );
    cleanupNestedAndEmptyListItems(editorRoot);
    mergeAdjacentLists(editorRoot, 'ul');
    mergeAdjacentLists(editorRoot, 'ol');
    stripLeadingListMarkers(editorRoot);
    stripClauseInlineFontSizes(editorRoot);
}

/** Lists touched by the current selection (or all lists in the editor if none). */
function getListsInScope(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return [];
    const tag = tagName.toUpperCase();
    const found = new Set();
    const range = getEffectiveListRange(jodit);
    if (range) {
        let node = range.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        while (node && node !== editor) {
            if (node.tagName === tag) found.add(node);
            node = node.parentElement;
        }
    }
    /* Do not restyle every list in the clause when the caret is in plain text. */
    if (found.size === 0 && range && !range.collapsed) {
        editor.querySelectorAll(tagName).forEach((el) => found.add(el));
    }
    return [...found];
}

/** Lists that should receive the new preset (split mixed lists so other lines keep their style). */
function getListsToStyle(jodit, tagName) {
    const range = getEffectiveListRange(jodit);
    let lists = getListsIntersectingRange(jodit, tagName);
    if (!range || !lists.length) return lists;

    /** @type {Element[]} */
    const out = [];
    for (const list of lists) {
        const selectedLis = getSelectedListItems(list, range);
        if (selectedLis.length > 0 && selectedLis.length < list.querySelectorAll(':scope > li').length) {
            out.push(...splitListPreserveStyles(list, selectedLis));
        } else {
            out.push(list);
        }
    }
    return out;
}

function getEffectiveListRange(jodit) {
    const root = getWysiwygEditor(jodit);
    const range = jodit.s?.range;
    let effective = range && !range.collapsed ? range : null;
    if (effective && root && !isRangeConnectedToRoot(root, effective)) effective = null;
    if (!effective && jodit.__emsSavedListRange) {
        const saved = jodit.__emsSavedListRange;
        if (!root || isRangeConnectedToRoot(root, saved)) effective = saved;
    }
    if (!effective && jodit.__emsLastGoodListRange) {
        const last = jodit.__emsLastGoodListRange;
        if (!root || isRangeConnectedToRoot(root, last)) effective = last;
    }
    if (!effective) return range || null;
    return root ? clampRangeExcludingProtectedStructures(root, effective) : effective;
}

function isRangeConnectedToRoot(root, range) {
    if (!root || !range) return false;
    try {
        return root.contains(range.startContainer) && root.contains(range.endContainer);
    } catch {
        return false;
    }
}

/** Plain blocks (p/div) in the current selection that are not already inside a list. */
function getPlainBlocksInRange(jodit) {
    const editor = getWysiwygEditor(jodit);
    const range = getEffectiveListRange(jodit);
    if (!editor || !range || range.collapsed) return [];

    /** @type {Element[]} */
    const candidates = [];

    const walk = (parent) => {
        if (!parent?.children) return;
        [...parent.children].forEach((child) => {
            if (child.nodeType !== 1) return;
            const tag = child.tagName;
            if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') return;
            if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return;
            if (child.closest('ul, ol, table')) return;

            if (!rangeIntersectsNode(range, child)) {
                if (tag === 'DIV') walk(child);
                return;
            }

            /* Do not replace a wrapper that also contains the table below the selection. */
            if (nodeHasProtectedDescendantOutsideRange(child, range)) {
                walk(child);
                return;
            }

            const innerPs = [...child.querySelectorAll(':scope > p')].filter((p) =>
                plainBlockHasSelectedTextForList(p, range)
            );
            if (tag === 'DIV' && innerPs.length > 0) {
                innerPs.forEach((p) => candidates.push(p));
            } else if (plainBlockHasSelectedTextForList(child, range)) {
                candidates.push(child);
            }
        });
    };

    walk(editor);
    return candidates;
}

/** Wrap plain paragraphs/divs in the selection (one <li> per visual line, merged when multi-block). */
function wrapPlainBlocksInList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const doc = getWysiwygEditor(jodit)?.ownerDocument;
    if (!doc) return [];

    const range = getEffectiveListRange(jodit);
    const blocks = getPlainBlocksInRange(jodit).filter(
        (block) => !nodeHasProtectedDescendantOutsideRange(block, range)
    );
    if (!blocks.length) return [];

    /** @type {string[]} */
    const lineHtmls = [];
    blocks.forEach((block) => {
        getLineHtmlsFromElementInRange(block, range).forEach((h) => lineHtmls.push(h));
    });
    const expanded = expandLineHtmlsForList(lineHtmls);
    if (!expanded.length) return [];

    const list = buildListElement(doc, tagName, expanded, preset, clearClassNames, oppositeClearClassNames);
    splitListItemsOnBr(list);

    const first = blocks[0];
    const parent = first.parentNode;
    if (!parent) return [];

    parent.insertBefore(list, first);
    blocks.forEach((block) => {
        if (block.parentNode) block.remove();
    });

    return [list];
}

/** Wrap the line under the caret when selection collapsed (single paragraph → one bullet). */
function wrapCurrentPlainBlockInList(jodit, tagName, preset, clearClassNames, oppositeClearClassNames) {
    const root = getWysiwygEditor(jodit);
    if (!root) return [];

    const range = jodit.s?.range || getEffectiveListRange(jodit);
    if (!range) return [];

    const block = getEditableLineBlock(root, range);
    if (!block || block.tagName === 'LI' || block.closest('ul, ol, table')) return [];

    const lineHtmls = expandLineHtmlsForList(getLineHtmlsFromElement(block));
    if (!lineHtmls.length) return [];

    const list = buildListElement(
        root.ownerDocument,
        tagName,
        lineHtmls,
        preset,
        clearClassNames,
        oppositeClearClassNames
    );
    splitListItemsOnBr(list);

    const parent = block.parentNode;
    if (!parent) return [];
    parent.insertBefore(list, block);
    block.remove();
    return [list];
}

/** One <li> with <br> line breaks → one <li> per visual line (each gets a bullet). */
function splitListItemsOnBr(list) {
    if (!list?.querySelectorAll) return;
    const doc = list.ownerDocument;
    const items = [...list.querySelectorAll(':scope > li')];

    for (const li of items) {
        const html = li.innerHTML;
        if (!/<br\s*\/?>/i.test(html)) continue;
        const parts = html
            .split(/<br\s*\/?>/gi)
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length < 2) continue;

        li.innerHTML = parts[0];
        let after = li;
        for (let i = 1; i < parts.length; i += 1) {
            const newLi = doc.createElement('li');
            newLi.innerHTML = parts[i];
            after = list.insertBefore(newLi, after.nextSibling);
        }
    }
}

/** When the user selects many lines and applies one list style, merge into a single list. */
function mergeListsIntersectingRange(jodit, tagName) {
    const range = jodit.s?.range;
    if (!range || range.collapsed) return;
    const lists = [...getListsIntersectingRange(jodit, tagName)];
    if (lists.length < 2) return;

    const first = lists[0];
    for (let i = 1; i < lists.length; i += 1) {
        const list = lists[i];
        while (list.firstChild) {
            first.appendChild(list.firstChild);
        }
        list.remove();
    }
}

/** All lists of a tag that overlap the current selection (more reliable than ancestor-only). */
function getListsIntersectingRange(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return [];
    const range = getEffectiveListRange(jodit);
    const fromAncestor = getListsInScope(jodit, tagName);
    if (!range || range.collapsed) return fromAncestor;

    const found = new Set(fromAncestor);
    const doc = editor.ownerDocument;
    editor.querySelectorAll(tagName).forEach((list) => {
        try {
            const lr = doc.createRange();
            lr.selectNodeContents(list);
            const overlaps =
                range.compareBoundaryPoints(Range.END_TO_START, lr) < 0 &&
                range.compareBoundaryPoints(Range.START_TO_END, lr) > 0;
            if (overlaps) found.add(list);
        } catch {
            /* ignore detached nodes */
        }
    });
    return [...found];
}

/** Replace <ol> with <ul> or the reverse so bullet/number toolbar matches the chosen list type. */
function replaceListElement(list, newTagName) {
    if (!list?.parentNode) return list;
    const cur = list.tagName?.toLowerCase();
    const nextTag = String(newTagName || '').toLowerCase();
    if (!cur || !nextTag || cur === nextTag) return list;
    const doc = list.ownerDocument;
    const replacement = doc.createElement(nextTag);
    while (list.firstChild) {
        replacement.appendChild(list.firstChild);
    }
    list.parentNode.replaceChild(replacement, list);
    return replacement;
}

function convertListsInScope(jodit, fromTag, toTag, clearClassNames) {
    const lists = [...getListsIntersectingRange(jodit, fromTag)];
    lists.forEach((list) => {
        stripClasses(list, clearClassNames);
        if (list.style) {
            list.style.listStyleType = '';
        }
        replaceListElement(list, toTag);
    });
    const editor = getWysiwygEditor(jodit);
    if (editor) {
        mergeAdjacentLists(editor, toTag);
        stripLeadingListMarkers(editor);
    }
    return lists.length;
}

function applyPresetToListElement(list, preset, clearClassNames, oppositeClearClassNames) {
    if (!list) return;
    stripClasses(list, clearClassNames);
    if (oppositeClearClassNames) stripClasses(list, oppositeClearClassNames);
    list.className = preset.classes.join(' ').trim();
    list.style.removeProperty('margin-left');
    list.style.removeProperty('padding-left');
    list.style.listStyleType = 'none';
    list.querySelectorAll(':scope > li').forEach((li) => {
        li.style.removeProperty('margin-left');
        li.style.removeProperty('padding-left');
        li.style.removeProperty('text-indent');
        li.style.listStyleType = 'none';
    });
}

/** Ensure saved/preview HTML carries EMS classes (Jodit often keeps only inline list-style-type). */
function inferListClassesFromStyles(root) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll('ul').forEach((ul) => {
        const hasBulletClass = BULLET_CLASS_NAMES.some((c) => ul.classList.contains(c));
        if (hasBulletClass) return;

        const styleAttr = String(ul.getAttribute('style') || '').toLowerCase();
        const inlineType = (ul.style?.listStyleType || '').toLowerCase();
        const m = styleAttr.match(/list-style-type\s*:\s*([^;]+)/i);
        const type = (inlineType || (m ? m[1] : '') || 'disc').trim().toLowerCase();

        if (type === 'none') return;
        if (type === 'circle') ul.classList.add('ems-bullet-circle');
        else if (type === 'square') ul.classList.add('ems-bullet-square');
        else ul.classList.add('ems-bullet-disc');
    });

    root.querySelectorAll('ol').forEach((ol) => {
        const hasNumClass = OL_CLASS_NAMES.some((c) => ol.classList.contains(c));
        if (hasNumClass) return;
        const styleAttr = String(ol.getAttribute('style') || '').toLowerCase();
        const inlineType = (ol.style?.listStyleType || '').toLowerCase();
        if (inlineType === 'none' || /list-style-type\s*:\s*none/i.test(styleAttr)) return;
        ol.classList.add('ems-num-decimal');
        if (!ol.style.listStyleType) ol.style.listStyleType = 'decimal';
    });
}

function normalizeListsInEditor(jodit, tagName) {
    const editor = getWysiwygEditor(jodit);
    if (!editor) return;
    mergeAdjacentLists(editor, 'ol');
    mergeAdjacentLists(editor, 'ul');
    if (tagName === 'ol') {
        stripLeadingListMarkers(editor);
    }
}

/** Remove inline font-size Jodit sometimes adds when toggling lists. */
function stripClauseInlineFontSizes(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('li, p, span, font').forEach((el) => {
        if (el.style) el.style.removeProperty('font-size');
        if (el.tagName === 'FONT' && el.hasAttribute('size')) el.removeAttribute('size');
        const st = el.getAttribute?.('style');
        if (st != null && !String(st).trim()) el.removeAttribute('style');
    });
}

/** Turn <ul>/<ol> into plain <p> blocks (Word "None" — no bullets/numbers). */
function unwrapListsToParagraphs(lists) {
    [...lists].forEach((list) => {
        if (!list?.parentNode) return;
        const parent = list.parentNode;
        const doc = list.ownerDocument;
        const items = [...list.children].filter((c) => c.tagName === 'LI');
        const nodes = items.map((li) => {
            const p = doc.createElement('p');
            p.innerHTML = li.innerHTML;
            return p;
        });
        if (!nodes.length) {
            list.remove();
            return;
        }
        const frag = doc.createDocumentFragment();
        nodes.forEach((n) => {
            stripClauseInlineFontSizes(n);
            frag.appendChild(n);
        });
        parent.insertBefore(frag, list);
        list.remove();
    });
}

function clearListPreset(jodit, tagName, clearClassNames) {
    beginListPresetApply(jodit);
    const selectionBookmark = captureClauseEditorSelectionBookmark(jodit);
    const editorRoot = getWysiwygEditor(jodit);
    const tableSnapshots = editorRoot ? snapshotEditorTables(editorRoot) : [];

    const lists = getListsIntersectingRange(jodit, tagName);
    lists.forEach((list) => {
        stripClasses(list, clearClassNames);
        if (list.style) list.style.listStyleType = '';
        list.className = '';
        list.removeAttribute('data-ems-list');
    });
    unwrapListsToParagraphs(lists);
    const editor = getWysiwygEditor(jodit);
    if (editor) stripClauseInlineFontSizes(editor);
    finishListPresetApply(jodit, tableSnapshots, selectionBookmark, null, null);
    return true;
}

function applyListPreset(jodit, tagName, type, presets, clearClassNames, oppositeClearClassNames) {
    if (type === 'none') {
        return clearListPreset(jodit, tagName, clearClassNames);
    }

    const key = type == null || type === 'default' ? (tagName === 'ul' ? 'disc' : 'decimal') : type;
    const preset = presets[key] || (tagName === 'ul' ? UL_PRESETS.disc : OL_PRESETS.decimal);
    const oppClear = oppositeClearClassNames || (tagName === 'ul' ? OL_CLASS_NAMES : BULLET_CLASS_NAMES);

    const editorRoot = getWysiwygEditor(jodit);
    if (!editorRoot) return true;

    const caretOffset = captureListApplyCaretOffset(jodit, editorRoot);
    jodit.__emsListSelRestoredForApply = true;
    const selectionBookmark = captureClauseEditorSelectionBookmark(jodit);
    jodit.__emsListSelRestoredForApply = false;

    beginListPresetApply(jodit);
    const tableSnapshots = snapshotEditorTables(editorRoot);

    const allLines = collectAllBlockLinesInOrder(editorRoot);
    const range = getEffectiveListRange(jodit);

    /* Already a list — restyle in place (must run before partial-line rebuild). */
    if (shouldApplyListPresetInPlaceOnly(jodit, editorRoot, tagName)) {
        const liveRange = getEffectiveListRange(jodit);
        if (liveRange) {
            let node = liveRange.startContainer;
            if (node?.nodeType === 3) node = node.parentElement;
            const li = node?.closest?.('li');
            if (li && editorRoot.contains(li)) jodit.__emsListApplyCaretLi = li;
        }
        applyListPresetInPlace(jodit, editorRoot, tagName, preset, clearClassNames, oppClear);
        finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName, caretOffset);
        return true;
    }

    /* Selected lines only (not the whole clause) — must run before full-body rebuild. */
    if (isPartialLineSelection(jodit, editorRoot, allLines)) {
        if (
            tryApplyListToSelectedLines(
                jodit,
                editorRoot,
                tagName,
                preset,
                clearClassNames,
                oppositeClearClassNames
            )
        ) {
            finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName, caretOffset);
            return true;
        }
    }

    /* Primary path: one <li> per visual line (fixes select-all + bullet and 2 bullets + plain lines). */
    if (shouldRebuildAllLinesAsOneList(jodit, editorRoot, allLines)) {
        const list = buildListElement(
            editorRoot.ownerDocument,
            tagName,
            allLines,
            preset,
            clearClassNames,
            oppClear
        );
        setJoditEditorHtml(jodit, list.outerHTML);
        const after = getWysiwygEditor(jodit);
        if (after) {
            stripLeadingListMarkers(after);
            stripClauseInlineFontSizes(after);
            const liveList = after.querySelector(tagName);
            if (liveList) rememberListApplyCaretTarget(jodit, liveList);
        }
        finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName, caretOffset);
        return true;
    }

    /* Multi-line selection (including stashed range after toolbar click). */
    if (range && !range.collapsed) {
        if (
            tryApplyListToSelectedLines(
                jodit,
                editorRoot,
                tagName,
                preset,
                clearClassNames,
                oppositeClearClassNames
            )
        ) {
            finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName, caretOffset);
            return true;
        }
    }

    /* Single-line / per-line bullet: style only lists touched by the caret. */
    if (tagName === 'ul') {
        convertListsInScope(jodit, 'ol', 'ul', oppClear);
    } else {
        convertListsInScope(jodit, 'ul', 'ol', oppClear);
    }

    let lists = getListsToStyle(jodit, tagName);
    if (lists.length === 0) {
        lists = wrapPlainBlocksInList(jodit, tagName, preset, clearClassNames, oppClear);
    }
    if (lists.length === 0) {
        lists = wrapCurrentPlainBlockInList(jodit, tagName, preset, clearClassNames, oppClear);
    }

    lists.forEach((list) => applyPresetToListElement(list, preset, clearClassNames, oppClear));

    const editor = getWysiwygEditor(jodit);
    if (editor) {
        const listsToSplit = new Set([...lists, ...getListsIntersectingRange(jodit, tagName)]);
        listsToSplit.forEach((list) => splitListItemsOnBr(list));
        cleanupNestedAndEmptyListItems(editor);
        if (tagName === 'ol') stripLeadingListMarkers(editor);
        if (tagName === 'ul') stripLeadingListMarkers(editor);
    }

    if (lists.length) {
        rememberListApplyCaretTarget(jodit, lists[lists.length - 1]);
    }

    finishListPresetApply(jodit, tableSnapshots, selectionBookmark, tagName, caretOffset);
    return true;
}

function parseClauseNumberParts(prefix) {
    return String(prefix || '')
        .split('.')
        .map((p) => parseInt(p, 10));
}

function formatClauseNumberParts(parts) {
    return `${parts.join('.')}.`;
}

function incrementClauseNumberPrefix(prefix) {
    const parts = parseClauseNumberParts(prefix);
    if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
    parts[parts.length - 1] += 1;
    return formatClauseNumberParts(parts);
}

function isSameNumberSeries(partsA, partsB) {
    if (!partsA?.length || !partsB?.length) return false;
    if (partsA.length !== partsB.length) return false;
    for (let i = 0; i < partsA.length - 1; i += 1) {
        if (partsA[i] !== partsB[i]) return false;
    }
    return true;
}

function replaceBlockNumberPrefix(block, newPrefix) {
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const match = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (!match) return;
    const body = text.slice(match[0].length).replace(/^\s+/, '');
    block.textContent = plainClauseBodyIsEmpty(body)
        ? plainClauseEmptyMarkerText(newPrefix)
        : `${newPrefix} ${body}`;
}

/** Caret after "1.2. " / bullet gap — never flush against the marker on a new empty line. */
function caretOffsetAfterPlainClauseMarker(block) {
    if (!block) return 0;
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const numMatch = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (numMatch) {
        const prefix = formatClauseNumberParts(parseClauseNumberParts(numMatch[1]));
        const body = text.slice(numMatch[0].length).replace(/^\s+/, '');
        if (plainClauseBodyIsEmpty(body)) {
            const normalized = plainClauseEmptyMarkerText(prefix);
            if (block.textContent !== normalized) block.textContent = normalized;
            return normalized.length;
        }
        return numMatch[0].length;
    }
    const bulletMatch = text.match(CLAUSE_PLAIN_BULLET_RE);
    if (bulletMatch) {
        const body = text.slice(bulletMatch[0].length).replace(/^\s+/, '');
        if (plainClauseBodyIsEmpty(body)) {
            const normalized = `${bulletMatch[1]}${CLAUSE_MARKER_BODY_GAP}`;
            if (block.textContent !== normalized) block.textContent = normalized;
            return normalized.length;
        }
        return bulletMatch[0].length;
    }
    return text.length;
}

function resolveEnterContinuationCaretOffset(block, pinnedOffset) {
    if (!block) return 0;
    if (block.tagName === 'LI') {
        const text = (block.textContent || '').replace(/\u00a0/g, ' ');
        if (!text.trim()) return Math.max(1, text.length);
        return pinnedOffset == null ? text.length : pinnedOffset;
    }
    const markerOff = caretOffsetAfterPlainClauseMarker(block);
    if (pinnedOffset == null) return markerOff;
    return Math.max(pinnedOffset, markerOff);
}

function isPlainNumberedLineBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) return false;
    if (node.tagName === 'DIV' && node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')) {
        return false;
    }
    const text = (node.textContent || '').replace(/\u00a0/g, ' ');
    return CLAUSE_PLAIN_NUMBER_RE.test(text);
}

/** After inserting a new numbered line, bump the last segment of each following sibling in the same series. */
function renumberFollowingPlainNumberedLines(afterBlock, seriesParts) {
    if (!afterBlock || !seriesParts?.length) return;
    const depth = seriesParts.length;
    let node = afterBlock.nextSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        if (!isPlainNumberedLineBlock(node)) break;
        const text = (node.textContent || '').replace(/\u00a0/g, ' ');
        const m = text.match(CLAUSE_PLAIN_NUMBER_RE);
        if (!m) break;
        const parts = parseClauseNumberParts(m[1]);
        if (parts.length !== depth || !isSameNumberSeries(parts, seriesParts)) break;
        parts[parts.length - 1] += 1;
        replaceBlockNumberPrefix(node, formatClauseNumberParts(parts));
        node = node.nextSibling;
    }
}

/** Renumber this block and every following sibling in the same series (insert-above / push-down). */
function renumberBlockAndFollowingPlainNumberedLines(fromBlock, seriesParts) {
    if (!fromBlock || !seriesParts?.length) return;
    const depth = seriesParts.length;
    let node = fromBlock;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        if (!isPlainNumberedLineBlock(node)) break;
        const text = (node.textContent || '').replace(/\u00a0/g, ' ');
        const m = text.match(CLAUSE_PLAIN_NUMBER_RE);
        if (!m) break;
        const parts = parseClauseNumberParts(m[1]);
        if (parts.length !== depth || !isSameNumberSeries(parts, seriesParts)) break;
        parts[parts.length - 1] += 1;
        replaceBlockNumberPrefix(node, formatClauseNumberParts(parts));
        node = node.nextSibling;
    }
}

function isCaretAtStartOfNumberedBody(block, range, numMatch) {
    if (!block?.ownerDocument || !range || !numMatch) return false;
    try {
        const head = block.ownerDocument.createRange();
        head.selectNodeContents(block);
        head.setEnd(range.startContainer, range.startOffset);
        const before = head.toString().replace(/\u00a0/g, ' ');
        return before.length <= numMatch[0].length;
    } catch {
        return false;
    }
}

function isCaretAtEndOfBlock(block, range) {
    if (!block?.ownerDocument || !range) return false;
    try {
        const tail = block.ownerDocument.createRange();
        tail.selectNodeContents(block);
        tail.setStart(range.endContainer, range.endOffset);
        return !tail.toString().replace(/\u00a0/g, ' ').trim();
    } catch {
        return false;
    }
}

function getEditableLineBlock(root, range) {
    let node = range?.startContainer;
    if (node?.nodeType === 3) node = node.parentElement;
    while (node && node !== root) {
        if (node.closest?.('table')) return null;
        const tag = node.tagName;
        if (tag === 'LI') return node;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
            if (tag === 'DIV' && node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')) {
                node = node.parentElement;
                continue;
            }
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function applyEditorRange(jodit, range) {
    const doc = range?.startContainer?.ownerDocument;
    if (!doc || !range) return;
    if (jodit.s?.selectRange) {
        jodit.s.selectRange(range);
    } else {
        const sel = doc.defaultView?.getSelection?.();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }
}

/** Pin caret inside an empty <p><br></p> spacer — avoids selection jumping to block start. */
function placeCaretInEmptyBlock(jodit, block) {
    const doc = block?.ownerDocument;
    if (!doc || !block) return;
    const range = doc.createRange();
    const br = block.querySelector('br');
    if (br) {
        range.setStartBefore(br);
        range.collapse(true);
    } else if (block.firstChild) {
        range.setStart(block, 0);
        range.collapse(true);
    } else {
        range.selectNodeContents(block);
        range.collapse(true);
    }
    applyEditorRange(jodit, range);
}

function placeCaretInBlock(jodit, block, offset) {
    const doc = block?.ownerDocument;
    if (!doc || !block) return;
    if (isEmptyClauseBlock(block) && (offset == null || offset <= 0)) {
        placeCaretInEmptyBlock(jodit, block);
        return;
    }
    const range = doc.createRange();
    const textNode = getFirstTextNode(block);
    if (textNode) {
        const len = textNode.textContent?.length ?? 0;
        range.setStart(textNode, Math.max(0, Math.min(offset, len)));
        range.collapse(true);
    } else {
        placeCaretInEmptyBlock(jodit, block);
        return;
    }
    applyEditorRange(jodit, range);
}

/** Defer sync/change until caret is pinned — jodit.value + normalizeClauseListHtml jump selection on Enter. */
function finishEnterContinuation(jodit, caretTarget, caretOffset = null) {
    if (!caretTarget?.isConnected) {
        notifyEditorContentChange(jodit);
        return;
    }

    const isLi = caretTarget.tagName === 'LI';
    if (isLi) {
        rememberListApplyCaretTarget(jodit, caretTarget);
    } else {
        jodit.__emsEnterContinueCaretBlock = caretTarget;
        jodit.__emsEnterContinueCaretOffset =
            caretOffset == null
                ? resolveEnterContinuationCaretOffset(caretTarget, null)
                : resolveEnterContinuationCaretOffset(caretTarget, caretOffset);
    }

    beginListPresetApply(jodit);

    if (isLi) {
        rememberListApplyCaretTarget(jodit, caretTarget);
        placeCaretInListItemBodyStart(jodit, caretTarget);
    } else if (isEmptyClauseBlock(caretTarget) && (caretOffset == null || caretOffset <= 0)) {
        placeCaretInEmptyBlock(jodit, caretTarget);
    } else {
        const off =
            caretOffset == null
                ? resolveEnterContinuationCaretOffset(caretTarget, null)
                : resolveEnterContinuationCaretOffset(caretTarget, caretOffset);
        placeCaretInBlock(jodit, caretTarget, off);
    }

    const tagName = isLi ? caretTarget.parentElement?.tagName?.toLowerCase() : null;
    const pinnedOffset = jodit.__emsEnterContinueCaretOffset;

    const stabilizeBlock = () => {
        const pinnedLi = jodit.__emsListApplyCaretLi;
        if (pinnedLi?.isConnected) {
            placeCaretInListItemBodyStart(jodit, pinnedLi);
            return true;
        }
        const block = jodit.__emsEnterContinueCaretBlock;
        if (block?.isConnected) {
            const plainMarker = CLAUSE_PLAIN_NUMBER_RE.test(
                (block.textContent || '').replace(/\u00a0/g, ' ')
            ) || CLAUSE_PLAIN_BULLET_RE.test((block.textContent || '').replace(/\u00a0/g, ' '));
            if (!plainMarker && isEmptyClauseBlock(block)) {
                placeCaretInEmptyBlock(jodit, block);
                return true;
            }
            const len = resolveEnterContinuationCaretOffset(block, pinnedOffset);
            placeCaretInBlock(jodit, block, len);
            return true;
        }
        if (tagName) {
            return placeCaretAfterListPresetApply(jodit, tagName, null);
        }
        return false;
    };

    const finish = () => {
        const savedLi = jodit.__emsListApplyCaretLi;
        const savedBlock = jodit.__emsEnterContinueCaretBlock;
        const savedOffset = jodit.__emsEnterContinueCaretOffset;

        const stabilizeSaved = () => {
            if (savedLi?.isConnected) {
                placeCaretInListItemBodyStart(jodit, savedLi);
                return true;
            }
            if (savedBlock?.isConnected) {
                const plainMarker = CLAUSE_PLAIN_NUMBER_RE.test(
                    (savedBlock.textContent || '').replace(/\u00a0/g, ' ')
                ) || CLAUSE_PLAIN_BULLET_RE.test(
                    (savedBlock.textContent || '').replace(/\u00a0/g, ' ')
                );
                if (!plainMarker && isEmptyClauseBlock(savedBlock)) {
                    placeCaretInEmptyBlock(jodit, savedBlock);
                    return true;
                }
                const len = resolveEnterContinuationCaretOffset(savedBlock, savedOffset);
                placeCaretInBlock(jodit, savedBlock, len);
                return true;
            }
            return false;
        };

        const releaseContinuation = () => {
            jodit.__emsSkipToolbarSelRestore = false;
            jodit.__emsListApplyLock = Math.max(0, (jodit.__emsListApplyLock || 1) - 1);
            jodit.__emsListApplyCaretLi = null;
            jodit.__emsEnterContinueCaretBlock = null;
            jodit.__emsEnterContinueCaretOffset = null;
        };

        stabilizeSaved();
        releaseContinuation();
        stabilizeSaved();
        jodit.e?.fire?.('change');
        stabilizeSaved();
        requestAnimationFrame(() => {
            stabilizeSaved();
            requestAnimationFrame(() => {
                stabilizeSaved();
                if (jodit.__emsPendingPricingRecalc) {
                    jodit.__emsPendingPricingRecalc = false;
                    jodit.e?.fire?.('change');
                }
            });
        });
    };

    stabilizeBlock();
    requestAnimationFrame(() => {
        stabilizeBlock();
        requestAnimationFrame(() => setTimeout(finish, 60));
    });
}

function insertPlainParagraphAfter(jodit, block, leadingText) {
    const doc = block?.ownerDocument;
    if (!doc || !block?.parentNode) return null;
    const p = doc.createElement('p');
    const tn = doc.createTextNode(leadingText);
    p.appendChild(tn);
    block.parentNode.insertBefore(p, block.nextSibling);
    placeCaretInBlock(jodit, p, leadingText.length);
    return p;
}

function insertPlainParagraphBefore(jodit, block, leadingText) {
    const doc = block?.ownerDocument;
    if (!doc || !block?.parentNode) return null;
    const p = doc.createElement('p');
    const tn = doc.createTextNode(leadingText);
    p.appendChild(tn);
    block.parentNode.insertBefore(p, block);
    placeCaretInBlock(jodit, p, leadingText.length);
    return p;
}

function getClauseEditorScrollAnchor(root) {
    return (
        root?.closest?.('.quote-preview-zoom-viewport') ||
        root?.closest?.('.quote-clause-inline-editor--clipped') ||
        null
    );
}

function scrollClauseEditorBlockIntoView(root, block) {
    const viewport = root?.closest?.('.quote-preview-zoom-viewport');
    if (!viewport || !(block instanceof HTMLElement)) return;
    const margin = 40;
    const viewRect = viewport.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    if (blockRect.bottom > viewRect.bottom - margin) {
        viewport.scrollTop += blockRect.bottom - viewRect.bottom + margin;
    } else if (blockRect.top < viewRect.top + margin) {
        viewport.scrollTop += blockRect.top - viewRect.top - margin;
    }
}

function pinClauseEditorScrollDuring(root, fn, caretBlock = null) {
    const anchor = getClauseEditorScrollAnchor(root);
    const scrollTop = anchor?.scrollTop ?? 0;
    const scrollLeft = anchor?.scrollLeft ?? 0;
    const result = fn();
    if (caretBlock?.isConnected) {
        scrollClauseEditorBlockIntoView(root, caretBlock);
    } else if (anchor) {
        anchor.scrollTop = scrollTop;
        anchor.scrollLeft = scrollLeft;
    }
    return result;
}

function pinCaretInEmptyParagraph(jodit, p) {
    const root = getWysiwygEditor(jodit);
    if (!root || !p?.isConnected) return;
    finishEnterContinuation(jodit, p, 0);
    requestAnimationFrame(() => {
        if (p.isConnected) scrollClauseEditorBlockIntoView(root, p);
    });
}

function replaceBlockWithEmptyParagraph(jodit, block) {
    const doc = block?.ownerDocument;
    if (!doc || !block?.parentNode) return;
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    const root = getWysiwygEditor(jodit);
    pinClauseEditorScrollDuring(root, () => {
        block.parentNode.replaceChild(p, block);
    });
    pinCaretInEmptyParagraph(jodit, p);
}

function insertEmptyParagraphAfter(jodit, afterBlock) {
    const doc = afterBlock?.ownerDocument;
    if (!doc || !afterBlock?.parentNode) return null;
    const root = getWysiwygEditor(jodit);
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    pinClauseEditorScrollDuring(
        root,
        () => {
            afterBlock.parentNode.insertBefore(p, afterBlock.nextSibling);
        },
        p
    );
    finishEnterContinuation(jodit, p, 0);
    requestAnimationFrame(() => {
        if (p.isConnected) scrollClauseEditorBlockIntoView(root, p);
    });
    return p;
}

/** Enter on an empty spacer row — add another blank line without scroll/caret jump. */
function handleClausePlainEnter(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

    const block = getEditableLineBlock(root, range);
    if (!block || block.tagName === 'LI') return false;
    if (!isEmptyClauseBlock(block)) return false;

    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    if (CLAUSE_PLAIN_NUMBER_RE.test(text) || CLAUSE_PLAIN_BULLET_RE.test(text)) return false;

    insertEmptyParagraphAfter(jodit, block);
    return true;
}

function exitEmptyListItem(jodit, li) {
    exitEmptyListItemWithGap(jodit, li);
}

/** Blank spacer row + fresh paragraph after a list (Word-like list exit). */
function insertListExitGapParagraphs(jodit, afterBlock) {
    const root = getWysiwygEditor(jodit);
    const doc = afterBlock?.ownerDocument || root?.ownerDocument;
    if (!doc) return null;
    const gapP = doc.createElement('p');
    gapP.appendChild(doc.createElement('br'));
    const workP = doc.createElement('p');
    workP.appendChild(doc.createElement('br'));
    pinClauseEditorScrollDuring(
        root,
        () => {
            if (afterBlock?.parentNode) {
                afterBlock.parentNode.insertBefore(gapP, afterBlock.nextSibling);
                afterBlock.parentNode.insertBefore(workP, gapP.nextSibling);
            } else if (root) {
                root.appendChild(gapP);
                root.appendChild(workP);
            }
        },
        workP
    );
    return workP;
}

function exitEmptyListItemWithGap(jodit, li) {
    const list = li?.parentElement;
    const root = getWysiwygEditor(jodit);
    if (!li || !list || !root) return;

    let anchor = list;
    pinClauseEditorScrollDuring(root, () => {
        li.remove();
        if (!list.querySelector('li')) {
            anchor = list.previousElementSibling;
            list.remove();
        }
    });

    const workP = insertListExitGapParagraphs(jodit, anchor?.isConnected ? anchor : null);
    if (workP) pinCaretInEmptyParagraph(jodit, workP);
    notifyEditorContentChange(jodit);
}

function isPlainBulletLineBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) return false;
    if (
        node.tagName === 'DIV' &&
        node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')
    ) {
        return false;
    }
    const text = (node.textContent || '').replace(/\u00a0/g, ' ');
    return CLAUSE_PLAIN_BULLET_RE.test(text);
}

function isLastInPlainNumberedSeries(block, numMatch) {
    const seriesParts = parseClauseNumberParts(numMatch[1]);
    let next = getNextLineBlock(block);
    while (next) {
        if (isPlainNumberedLineBlock(next)) {
            const text = (next.textContent || '').replace(/\u00a0/g, ' ');
            const m = text.match(CLAUSE_PLAIN_NUMBER_RE);
            if (!m) return true;
            const nextParts = parseClauseNumberParts(m[1]);
            if (nextParts.length === seriesParts.length && isSameNumberSeries(nextParts, seriesParts)) {
                return false;
            }
            return true;
        }
        if (!isEmptyClauseBlock(next)) return true;
        next = getNextLineBlock(next);
    }
    return true;
}

function isTrailingEmptyPlainBulletLine(block) {
    let next = getNextLineBlock(block);
    while (next) {
        if (isPlainBulletLineBlock(next)) return false;
        if (!isEmptyClauseBlock(next)) return true;
        next = getNextLineBlock(next);
    }
    return true;
}

function exitTrailingEmptyPlainMarkedLine(jodit, block) {
    const prev = getPreviousLineBlock(block);
    const root = getWysiwygEditor(jodit);
    pinClauseEditorScrollDuring(root, () => {
        block.remove();
    });
    const workP = insertListExitGapParagraphs(jodit, prev);
    if (workP) pinCaretInEmptyParagraph(jodit, workP);
    notifyEditorContentChange(jodit);
}

function isEmptyListItem(li) {
    if (!li || li.tagName !== 'LI') return false;
    if (getListItemDirectText(li)) return false;
    const nested = getListItemNestedList(li);
    if (nested?.querySelector('li')) return true;
    if (listItemHasEditablePlaceholder(li)) return true;
    return !String(li.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function isCaretOnEmptyMarkedLine(block, range, numMatch) {
    const body = getLineBodyText(block);
    if (!plainClauseBodyIsEmpty(body)) return false;
    if (numMatch) {
        return (
            isCaretAtStartOfNumberedBody(block, range, numMatch) ||
            isCaretAtEndOfBlock(block, range)
        );
    }
    return isCaretAtStartOfBlock(block, range) || isCaretAtEndOfBlock(block, range);
}

function continuePlainNumberedLine(jodit, block, range, numMatch) {
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const bodyText = text.slice(numMatch[0].length).replace(/^\s+/, '');
    const atEnd = isCaretAtEndOfBlock(block, range);
    const atNumberStart = isCaretAtStartOfNumberedBody(block, range, numMatch);
    const seriesParts = parseClauseNumberParts(numMatch[1]);
    const currentPrefix = formatClauseNumberParts(seriesParts);

    if (plainClauseBodyIsEmpty(bodyText) && atEnd) {
        insertEmptyParagraphAfter(jodit, block);
        return true;
    }

    const next = incrementClauseNumberPrefix(numMatch[1]);
    if (!next || !seriesParts.length) return false;

    if (atNumberStart && !plainClauseBodyIsEmpty(bodyText)) {
        const newBlock = insertPlainParagraphBefore(jodit, block, plainClauseEmptyMarkerText(currentPrefix));
        if (newBlock) renumberBlockAndFollowingPlainNumberedLines(block, seriesParts);
        finishEnterContinuation(
            jodit,
            newBlock || block,
            caretOffsetAfterPlainClauseMarker(newBlock || block)
        );
        return true;
    }

    if (atEnd) {
        const newBlock = insertPlainParagraphAfter(jodit, block, plainClauseEmptyMarkerText(next));
        if (newBlock) renumberFollowingPlainNumberedLines(newBlock, seriesParts);
        finishEnterContinuation(
            jodit,
            newBlock || block,
            caretOffsetAfterPlainClauseMarker(newBlock || block)
        );
        return true;
    }

    const doc = block.ownerDocument;
    try {
        const after = doc.createRange();
        after.setStart(range.endContainer, range.endOffset);
        after.setEnd(block, block.childNodes.length);
        const tail = after.extractContents();
        const p = doc.createElement('p');
        const prefixNode = doc.createTextNode(plainClauseEmptyMarkerText(next));
        p.appendChild(prefixNode);
        if (!plainClauseBodyIsEmpty(tail.textContent?.replace(/\u00a0/g, ' '))) {
            p.appendChild(tail);
        }
        block.parentNode?.insertBefore(p, block.nextSibling);
        renumberFollowingPlainNumberedLines(p, seriesParts);
        finishEnterContinuation(jodit, p, caretOffsetAfterPlainClauseMarker(p));
        return true;
    } catch {
        return false;
    }
}

function continuePlainBulletLine(jodit, block, range, bulletMatch) {
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const bodyText = text.slice(bulletMatch[0].length).replace(/^\s+/, '');
    const atEnd = isCaretAtEndOfBlock(block, range);
    const bullet = `${bulletMatch[1]}${CLAUSE_MARKER_BODY_GAP}`;

    if (plainClauseBodyIsEmpty(bodyText) && atEnd) {
        insertEmptyParagraphAfter(jodit, block);
        return true;
    }
    if (atEnd) {
        const newBlock = insertPlainParagraphAfter(jodit, block, bullet);
        finishEnterContinuation(
            jodit,
            newBlock || block,
            caretOffsetAfterPlainClauseMarker(newBlock || block)
        );
        return true;
    }
    return false;
}

function getParentEmsListItem(block) {
    if (!block || block.tagName === 'LI') return block?.tagName === 'LI' ? block : null;
    const li = block.closest?.('li');
    const list = li?.parentElement;
    if (!li || !list || !['UL', 'OL'].includes(list.tagName) || block.closest?.('table')) return null;
    if (block.parentElement === li || li.querySelector(':scope > p') === block) return li;
    return null;
}

function isCaretAtEndOfListItem(li, range, lineBlock = null) {
    const line = lineBlock || getListItemLineBlock(li);
    if (line && line !== li) return isCaretAtEndOfBlock(line, range);
    return isCaretAtEndOfBlock(li, range);
}

function appendEmptyListItemRow(list, afterLi) {
    const doc = list.ownerDocument;
    const newLi = doc.createElement('li');
    const refP = afterLi.querySelector(':scope > p');
    if (refP) {
        const p = doc.createElement('p');
        p.appendChild(doc.createElement('br'));
        newLi.appendChild(p);
    } else {
        newLi.appendChild(doc.createElement('br'));
    }
    list.insertBefore(newLi, afterLi.nextSibling);
    return newLi;
}

/** EMS / native <li> — Enter at end adds the next list row (marker from CSS). */
function continueListItemLine(jodit, li, range) {
    if (!isCaretAtEndOfListItem(li, range)) return false;
    const list = li.parentElement;
    if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return false;
    const newLi = appendEmptyListItemRow(list, li);
    finishEnterContinuation(jodit, newLi, null);
    return true;
}

function handleClauseEnterContinuation(jodit, e) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

    const block = getEditableLineBlock(root, range);
    if (!block) return false;

    const parentLi = getParentEmsListItem(block);
    if (parentLi && block.tagName !== 'LI') {
        const liText = (parentLi.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!liText && isCaretAtEndOfBlock(block, range)) {
            exitEmptyListItem(jodit, parentLi);
            return true;
        }
        if (isCaretAtEndOfBlock(block, range) && continueListItemLine(jodit, parentLi, range)) {
            return true;
        }
    }

    if (block.tagName === 'LI') {
        const liText = (block.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!liText && isCaretAtEndOfBlock(block, range)) {
            exitEmptyListItem(jodit, block);
            return true;
        }
        if (continueListItemLine(jodit, block, range)) return true;
        return false;
    }

    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const numMatch = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (numMatch) {
        return continuePlainNumberedLine(jodit, block, range, numMatch);
    }

    const bulletMatch = text.match(CLAUSE_PLAIN_BULLET_RE);
    if (bulletMatch) {
        return continuePlainBulletLine(jodit, block, range, bulletMatch);
    }

    if (isEmptyClauseBlock(block)) {
        return handleClausePlainEnter(jodit);
    }
    if (isCaretAtEndOfBlock(block, range)) {
        return insertEmptyParagraphAfter(jodit, block) !== null;
    }

    return false;
}

function isCaretAtStartOfBlock(block, range) {
    if (!block?.ownerDocument || !range) return false;
    try {
        const head = block.ownerDocument.createRange();
        head.selectNodeContents(block);
        head.setEnd(range.startContainer, range.startOffset);
        return !head.toString().replace(/\u00a0/g, ' ').length;
    } catch {
        return false;
    }
}

function getLineBodyText(block) {
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const numMatch = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (numMatch) return text.slice(numMatch[0].length).replace(/^\s+/, '');
    const bulletMatch = text.match(CLAUSE_PLAIN_BULLET_RE);
    if (bulletMatch) return text.slice(bulletMatch[0].length).replace(/^\s+/, '');
    return text;
}

function setPlainNumberedBlockBody(block, prefix, body) {
    const trimmed = String(body || '').replace(/\u00a0/g, ' ').trim();
    block.textContent = trimmed ? `${prefix} ${trimmed}` : plainClauseEmptyMarkerText(prefix);
}

function getPreviousLineBlock(block) {
    let node = block?.previousSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.previousSibling;
            continue;
        }
        if (node.tagName === 'LI') return node;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
            if (
                node.tagName === 'DIV' &&
                node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')
            ) {
                node = node.previousSibling;
                continue;
            }
            return node;
        }
        break;
    }
    return null;
}

function getNextLineBlock(block) {
    let node = block?.nextSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        if (node.tagName === 'LI') return node;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
            if (
                node.tagName === 'DIV' &&
                node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')
            ) {
                node = node.nextSibling;
                continue;
            }
            return node;
        }
        break;
    }
    return null;
}

/** Nearest editable block before an empty spacer row (handles lists/tables between siblings). */
function getPreviousCaretBlock(block) {
    let node = block?.previousSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.previousSibling;
            continue;
        }
        if (node.tagName === 'OL' || node.tagName === 'UL') {
            const items = [...node.querySelectorAll(':scope > li')];
            for (let i = items.length - 1; i >= 0; i -= 1) {
                const li = items[i];
                if (!isEmptyClauseBlock(li) || listItemHasEditablePlaceholder(li)) {
                    return li;
                }
            }
            if (items.length) return items[items.length - 1];
            return node;
        }
        if (node.tagName === 'LI') return node;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
            if (
                node.tagName === 'DIV' &&
                node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')
            ) {
                node = node.previousSibling;
                continue;
            }
            if (!isEmptyClauseBlock(node)) return node;
            node = node.previousSibling;
            continue;
        }
        break;
    }
    return null;
}

/** Nearest editable block after an empty spacer row. */
function getNextCaretBlock(block) {
    let node = block?.nextSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        if (node.tagName === 'OL' || node.tagName === 'UL') {
            const first = node.querySelector(':scope > li');
            if (first) return first;
            return node;
        }
        if (node.tagName === 'LI') return node;
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
            if (
                node.tagName === 'DIV' &&
                node.querySelector?.(':scope > p, :scope > ul, :scope > ol, :scope > table')
            ) {
                node = node.nextSibling;
                continue;
            }
            if (!isEmptyClauseBlock(node)) return node;
            node = node.nextSibling;
            continue;
        }
        break;
    }
    return null;
}

function placeCaretAfterEmptyBlockDelete(jodit, block) {
    if (!block?.isConnected) return;
    if (block.tagName === 'LI') {
        placeCaretAtEndOfLi(jodit, block);
        return;
    }
    if (isEmptyClauseBlock(block)) {
        pinCaretInEmptyParagraph(jodit, block);
        return;
    }
    const len = (block.textContent || '').replace(/\u00a0/g, ' ').length;
    placeCaretInBlock(jodit, block, len);
}

function placeCaretBeforeEmptyBlockDelete(jodit, block) {
    if (!block?.isConnected) return;
    if (block.tagName === 'LI') {
        placeCaretAtEndOfLi(jodit, block);
        return;
    }
    if (isEmptyClauseBlock(block)) {
        pinCaretInEmptyParagraph(jodit, block);
        return;
    }
    placeCaretInBlock(jodit, block, 0);
}

function deleteEmptyLineBlock(jodit, block) {
    const root = getWysiwygEditor(jodit);
    /* Step through spacer rows: prefer the immediate previous line (even if empty). */
    const prevTarget = getPreviousLineBlock(block) || getPreviousCaretBlock(block);
    const nextTarget = getNextLineBlock(block) || getNextCaretBlock(block);

    pinClauseEditorScrollDuring(root, () => {
        block.remove();
    });

    const caretOffsetForBlock = (target) =>
        isEmptyClauseBlock(target) ? 0 : (target.textContent || '').replace(/\u00a0/g, ' ').length;

    if (prevTarget?.isConnected) {
        finishEnterContinuation(jodit, prevTarget, caretOffsetForBlock(prevTarget));
        scrollClauseEditorBlockIntoView(root, prevTarget);
        return true;
    }
    if (nextTarget?.isConnected) {
        finishEnterContinuation(jodit, nextTarget, caretOffsetForBlock(nextTarget));
        scrollClauseEditorBlockIntoView(root, nextTarget);
        return true;
    }

    notifyEditorContentChange(jodit);
    return true;
}

/** Backspace / Delete on blank spacer rows — Word-like remove row, caret moves up. */
function handleClauseEmptyLineDelete(jodit, isBackspace) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

    const block = getEditableLineBlock(root, range);
    if (!block || block.tagName === 'LI') return false;

    const isPlainEmptySpacer = (lineBlock) => {
        if (!lineBlock || !isEmptyClauseBlock(lineBlock)) return false;
        const text = (lineBlock.textContent || '').replace(/\u00a0/g, ' ');
        return !CLAUSE_PLAIN_NUMBER_RE.test(text);
    };

    if (isPlainEmptySpacer(block)) {
        return deleteEmptyLineBlock(jodit, block);
    }

    /* Delete at end of a line — remove empty spacer below (forward delete). */
    if (!isBackspace && isCaretAtEndOfBlock(block, range)) {
        const next = getNextLineBlock(block);
        if (isPlainEmptySpacer(next)) {
            return deleteEmptyLineBlock(jodit, next);
        }
    }

    return false;
}

/** After deleting a numbered line, pull following siblings down (1.4 → 1.3, etc.). */
function renumberPlainNumberedSeriesFrom(fromBlock, startParts) {
    if (!fromBlock || !startParts?.length) return;
    const depth = startParts.length;
    let node = fromBlock;
    const parts = [...startParts];
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        if (!isPlainNumberedLineBlock(node)) break;
        const text = (node.textContent || '').replace(/\u00a0/g, ' ');
        const m = text.match(CLAUSE_PLAIN_NUMBER_RE);
        if (!m) break;
        const nodeParts = parseClauseNumberParts(m[1]);
        if (nodeParts.length !== depth || !isSameNumberSeries(nodeParts, parts)) break;
        replaceBlockNumberPrefix(node, formatClauseNumberParts([...parts]));
        parts[parts.length - 1] += 1;
        node = node.nextSibling;
    }
}

function getPlainNumberedBlocksFullyInRange(root, range) {
    if (!root || !range) return [];
    const blocks = [];
    let node = root.firstChild;
    while (node) {
        if (node.nodeType === 1 && isPlainNumberedLineBlock(node) && rangeFullyContainsNode(range, node)) {
            blocks.push(node);
        }
        node = node.nextSibling;
    }
    return blocks;
}

function deletePlainNumberedLineAndRenumber(jodit, block, numMatch) {
    const seriesParts = parseClauseNumberParts(numMatch[1]);
    const prev = getPreviousLineBlock(block);
    let next = getNextLineBlock(block);
    block.remove();
    if (next && isPlainNumberedLineBlock(next)) {
        renumberPlainNumberedSeriesFrom(next, seriesParts);
    }
    if (prev) {
        placeCaretInBlock(jodit, prev, (prev.textContent || '').length);
    } else if (next && isPlainNumberedLineBlock(next)) {
        placeCaretInBlock(jodit, next, 0);
    }
    notifyEditorContentChange(jodit);
}

function deleteSelectedPlainNumberedBlocks(jodit, blocks) {
    if (!blocks?.length) return false;
    const firstMatch = (blocks[0].textContent || '').replace(/\u00a0/g, ' ').match(CLAUSE_PLAIN_NUMBER_RE);
    if (!firstMatch) return false;
    const startParts = parseClauseNumberParts(firstMatch[1]);
    const last = blocks[blocks.length - 1];
    const prev = getPreviousLineBlock(blocks[0]);
    let next = getNextLineBlock(last);
    blocks.forEach((b) => b.remove());
    if (next && isPlainNumberedLineBlock(next)) {
        renumberPlainNumberedSeriesFrom(next, startParts);
    }
    if (prev) {
        placeCaretInBlock(jodit, prev, (prev.textContent || '').length);
    } else if (next && isPlainNumberedLineBlock(next)) {
        placeCaretInBlock(jodit, next, 0);
    }
    notifyEditorContentChange(jodit);
    return true;
}

function mergePlainNumberedLineIntoPrevious(jodit, block, numMatch) {
    const prev = getPreviousLineBlock(block);
    if (!prev) return false;

    const body = getLineBodyText(block).trim();
    const deletedParts = parseClauseNumberParts(numMatch[1]);
    const next = getNextLineBlock(block);
    const prevNumMatch = (prev.textContent || '').replace(/\u00a0/g, ' ').match(CLAUSE_PLAIN_NUMBER_RE);
    const prevBody = getLineBodyText(prev).trimEnd();
    const mergedBody = prevBody && body ? `${prevBody} ${body}` : prevBody || body;

    if (prevNumMatch) {
        setPlainNumberedBlockBody(
            prev,
            formatClauseNumberParts(parseClauseNumberParts(prevNumMatch[1])),
            mergedBody
        );
    } else {
        prev.textContent = mergedBody;
    }

    block.remove();
    if (next && isPlainNumberedLineBlock(next)) {
        renumberPlainNumberedSeriesFrom(next, deletedParts);
    }
    placeCaretInBlock(jodit, prev, (prev.textContent || '').length);
    notifyEditorContentChange(jodit);
    return true;
}

function mergeNextPlainNumberedLineIntoCurrent(jodit, block, numMatch, nextBlock) {
    const nextMatch = (nextBlock.textContent || '').replace(/\u00a0/g, ' ').match(CLAUSE_PLAIN_NUMBER_RE);
    if (!nextMatch) return false;
    const nextParts = parseClauseNumberParts(nextMatch[1]);
    const currentParts = parseClauseNumberParts(numMatch[1]);
    const nextBody = getLineBodyText(nextBlock).trim();
    const currentBody = getLineBodyText(block).trimEnd();
    setPlainNumberedBlockBody(
        block,
        formatClauseNumberParts(currentParts),
        currentBody && nextBody ? `${currentBody} ${nextBody}` : currentBody || nextBody
    );
    const afterNext = getNextLineBlock(nextBlock);
    nextBlock.remove();
    if (afterNext && isPlainNumberedLineBlock(afterNext)) {
        renumberPlainNumberedSeriesFrom(afterNext, nextParts);
    }
    placeCaretInBlock(jodit, block, (block.textContent || '').length);
    notifyEditorContentChange(jodit);
    return true;
}

/** Fix merged lines like "1.3. 1.4. body" after browser/Jodit join. */
function dedupeMergedNumberPrefixesInBlock(block) {
    if (!block || block.closest?.('table')) return false;
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const first = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (!first) return false;
    const afterFirst = text.slice(first[0].length);
    const second = afterFirst.match(/^\s*(\d{1,2}(?:\.\d{1,2})*)\.\s*/);
    if (!second) return false;
    const firstParts = parseClauseNumberParts(first[1]);
    const secondParts = parseClauseNumberParts(second[1]);
    if (secondParts.length !== firstParts.length || !isSameNumberSeries(secondParts, firstParts)) {
        return false;
    }
    if (secondParts[secondParts.length - 1] !== firstParts[firstParts.length - 1] + 1) {
        return false;
    }
    const body = afterFirst.slice(second[0].length).replace(/^\s+/, '');
    setPlainNumberedBlockBody(block, formatClauseNumberParts(firstParts), body);
    return true;
}

function dedupeAllMergedNumberPrefixes(root) {
    if (!root?.childNodes) return false;
    let fixed = false;
    let node = root.firstChild;
    while (node) {
        if (node.nodeType === 1 && dedupeMergedNumberPrefixesInBlock(node)) {
            fixed = true;
        }
        node = node.nextSibling;
    }
    return fixed;
}

function handleClauseListItemRangeDelete(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

    const li = findListItemContainingRange(root, range);
    if (!li || !isRangeWithinListItemLabel(li, range)) return false;

    const directText = getListItemDirectText(li);
    const selected = range.toString().replace(/\u00a0/g, ' ').trim();
    if (!directText || !selected || selected.length < directText.length) return false;

    const nested = getListItemNestedList(li);
    const prevLi = li.previousElementSibling?.tagName === 'LI' ? li.previousElementSibling : null;
    const nextLi = li.nextElementSibling?.tagName === 'LI' ? li.nextElementSibling : null;
    const firstHoisted = nested?.querySelector?.(':scope > li') || null;

    pinClauseEditorScrollDuring(root, () => {
        range.deleteContents();
        normalizeListItemInnerHtml(li);
        [...li.childNodes].forEach((n) => {
            if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) return;
            const t = String(n.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (!t) n.remove();
        });
        if (!isListItemLabelEmpty(li) || !li.isConnected) return;
        if (nested) {
            hoistNestedListOutOfListItem(li);
        } else {
            const list = li.parentElement;
            li.remove();
            if (list && !list.querySelector(':scope > li')) list.remove();
        }
    });
    placeCaretAfterListItemRowDelete(jodit, { firstHoisted, prevLi, nextLi });
    notifyEditorContentChange(jodit);
    return true;
}

function handleClauseListItemDelete(jodit, isBackspace) {
    if (!isBackspace) return false;
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !root.contains(range.commonAncestorContainer)) return false;

    const block = getEditableLineBlock(root, range);
    const li = block?.tagName === 'LI' ? block : getParentEmsListItem(block);
    if (!li || !isEmptyListItem(li)) return false;

    const caretBlock = block?.tagName === 'LI' ? li : block;
    if (!isCaretAtStartOfBlock(caretBlock, range) && !isCaretAtEndOfBlock(caretBlock, range)) {
        return false;
    }

    const list = li.parentElement;
    if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return false;

    const nested = getListItemNestedList(li);
    const labelEmpty = isListItemLabelEmpty(li);

    if (!li.nextElementSibling) {
        if (list.parentElement?.closest?.('li')) {
            if (labelEmpty && nested) {
                const targets = removeListItemRow(jodit, li);
                placeCaretAfterListItemRowDelete(jodit, targets);
                notifyEditorContentChange(jodit);
                return true;
            }
            return false;
        }
        if (labelEmpty && nested) {
            const targets = removeListItemRow(jodit, li);
            placeCaretAfterListItemRowDelete(jodit, targets);
            notifyEditorContentChange(jodit);
            return true;
        }
        exitEmptyListItemWithGap(jodit, li);
        return true;
    }

    if (labelEmpty && nested) {
        const targets = removeListItemRow(jodit, li);
        placeCaretAfterListItemRowDelete(jodit, targets);
    } else {
        const prevLi = li.previousElementSibling;
        pinClauseEditorScrollDuring(root, () => {
            li.remove();
        });
        if (prevLi) {
            finishEnterContinuation(jodit, prevLi, null);
        }
    }
    notifyEditorContentChange(jodit);
    return true;
}

function handleClauseDeleteRenumber(jodit, isBackspace) {
    const root = getWysiwygEditor(jodit);
    if (!root) return false;

    const sel = jodit.s?.sel || root.ownerDocument?.defaultView?.getSelection?.();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return false;

    /* Never intercept multi-line / partial selections — Jodit deletes the full range. */
    if (!range.collapsed) {
        return false;
    }

    const block = getEditableLineBlock(root, range);
    if (!block || block.tagName === 'LI') return false;

    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const numMatch = text.match(CLAUSE_PLAIN_NUMBER_RE);
    const bulletMatch = !numMatch ? text.match(CLAUSE_PLAIN_BULLET_RE) : null;
    if (!numMatch && !bulletMatch) return false;

    if (isBackspace) {
        if (numMatch) {
            const atMarker =
                isCaretAtStartOfBlock(block, range) ||
                isCaretAtStartOfNumberedBody(block, range, numMatch);
            if (!atMarker && !isCaretOnEmptyMarkedLine(block, range, numMatch)) return false;

            const body = getLineBodyText(block).trim();
            if (!body) {
                if (isLastInPlainNumberedSeries(block, numMatch)) {
                    exitTrailingEmptyPlainMarkedLine(jodit, block);
                    return true;
                }
                deletePlainNumberedLineAndRenumber(jodit, block, numMatch);
                return true;
            }
            if (!atMarker) return false;
            return mergePlainNumberedLineIntoPrevious(jodit, block, numMatch);
        }

        if (!isCaretOnEmptyMarkedLine(block, range, null)) return false;
        const body = getLineBodyText(block).trim();
        if (!body) {
            if (isTrailingEmptyPlainBulletLine(block)) {
                exitTrailingEmptyPlainMarkedLine(jodit, block);
                return true;
            }
            const prev = getPreviousLineBlock(block);
            block.remove();
            if (prev) {
                placeCaretInBlock(jodit, prev, (prev.textContent || '').length);
            }
            notifyEditorContentChange(jodit);
            return true;
        }
        return false;
    }

    if (numMatch && isCaretAtEndOfBlock(block, range)) {
        const next = getNextLineBlock(block);
        if (next && isPlainNumberedLineBlock(next)) {
            return mergeNextPlainNumberedLineIntoCurrent(jodit, block, numMatch, next);
        }
    }

    return false;
}

function tryClauseDeleteRenumber(jodit, e, isBackspace) {
    if (jodit.__emsDeleteRenumberHandled) return false;
    if (isClauseEditorSelectionInTable(jodit)) return false;
    const root = getWysiwygEditor(jodit);
    const sel = jodit.s?.sel || root?.ownerDocument?.defaultView?.getSelection?.();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const hasSelection = range && !range.collapsed && root?.contains(range.commonAncestorContainer);

    const handled = hasSelection
        ? handleClauseListItemRangeDelete(jodit)
        : isBackspace
          ? handleClauseEmptyLineDelete(jodit, true) ||
            handleClauseListItemDelete(jodit, true) ||
            handleClauseDeleteRenumber(jodit, true)
          : handleClauseEmptyLineDelete(jodit, false) ||
            handleClauseListItemDelete(jodit, false) ||
            handleClauseDeleteRenumber(jodit, false);
    if (!handled) return false;
    jodit.__emsDeleteRenumberHandled = true;
    requestAnimationFrame(() => {
        jodit.__emsDeleteRenumberHandled = false;
    });
    e?.preventDefault?.();
    e?.stopImmediatePropagation?.();
    e?.stopPropagation?.();
    return true;
}

function registerClauseEditorDeleteRenumber(jodit) {
    if (!jodit || jodit.__emsDeleteRenumberRegistered) return;
    jodit.__emsDeleteRenumberRegistered = true;

    jodit.e.on('beforeCommand.emsClauseDeleteRenumber', (command) => {
        const c = String(command || '').toLowerCase();
        if (c === 'backspacebutton' || c === 'backspace') {
            const fake = { key: 'Backspace', preventDefault() {}, stopPropagation() {} };
            if (tryClauseDeleteRenumber(jodit, fake, true)) return false;
        }
        if (c === 'deletebutton' || c === 'delete') {
            const fake = { key: 'Delete', preventDefault() {}, stopPropagation() {} };
            if (tryClauseDeleteRenumber(jodit, fake, false)) return false;
        }
    }, { top: true });

    jodit.e.on('backSpaceAfterDelete.emsClauseDedupe', () => {
        runClauseListDeleteCleanup(jodit);
    });

    const bindDeleteKeyCaretGuard = () => {
        const root = getWysiwygEditor(jodit);
        if (!root || root.__emsDeleteKeyCaretGuardBound) return;
        root.__emsDeleteKeyCaretGuardBound = true;
        root.addEventListener(
            'keydown',
            (e) => {
                if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                jodit.__emsDeleteKeyLock = true;
            },
            true
        );
        root.addEventListener(
            'keyup',
            (e) => {
                if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        jodit.__emsDeleteKeyLock = false;
                        runClauseListDeleteCleanup(jodit);
                        if (jodit.__emsPendingPricingRecalc) {
                            jodit.__emsPendingPricingRecalc = false;
                            jodit.e?.fire?.('change');
                        }
                    });
                });
            },
            true
        );
    };
    bindDeleteKeyCaretGuard();
    jodit.e.on('afterInit.emsClauseDeleteRenumberCaretGuard', bindDeleteKeyCaretGuard);

    const bindRootCapture = () => {
        const root = getWysiwygEditor(jodit);
        if (!root || root.__emsDeleteRenumberBound) return;
        root.__emsDeleteRenumberBound = true;
        root.addEventListener(
            'keydown',
            (e) => {
                const isBackspace = e.key === 'Backspace';
                const isDelete = e.key === 'Delete';
                if (!isBackspace && !isDelete) return;
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                if (tryClauseDeleteRenumber(jodit, e, isBackspace)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            },
            true
        );
    };
    bindRootCapture();
    jodit.e.on('afterInit.emsClauseDeleteRenumber', bindRootCapture);
}

function tryClauseEnterContinuation(jodit, e) {
    if (jodit.__emsEnterContinueHandled) return false;
    if (!handleClauseEnterContinuation(jodit, e)) return false;
    jodit.__emsEnterContinueHandled = true;
    requestAnimationFrame(() => {
        jodit.__emsEnterContinueHandled = false;
    });
    e?.preventDefault?.();
    e?.stopImmediatePropagation?.();
    e?.stopPropagation?.();
    return true;
}

function registerClauseEditorEnterContinuation(jodit) {
    if (!jodit || jodit.__emsEnterContinuationRegistered) return;
    jodit.__emsEnterContinuationRegistered = true;

    const onKeyDown = (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        tryClauseEnterContinuation(jodit, e);
    };

    jodit.e.on('beforeEnter.emsClauseEnterContinue', (event) => {
        if (tryClauseEnterContinuation(jodit, event)) return false;
    }, { top: true });

    jodit.e.on('beforeCommand.emsClauseEnterContinue', (command) => {
        const c = String(command || '').toLowerCase();
        if (c !== 'enter') return;
        const fake = { key: 'Enter', shiftKey: false, preventDefault() {}, stopPropagation() {} };
        if (tryClauseEnterContinuation(jodit, fake)) return false;
    }, { top: true });

    jodit.e.on('keydown.emsClauseEnterContinue', onKeyDown, { top: true });

    const bindRootCapture = () => {
        const root = getWysiwygEditor(jodit);
        if (!root || root.__emsEnterContinueBound) return;
        root.__emsEnterContinueBound = true;
        root.addEventListener(
            'keydown',
            (e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                if (tryClauseEnterContinuation(jodit, e)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            },
            true
        );
    };
    bindRootCapture();
    jodit.e.on('afterInit.emsClauseEnterContinue', bindRootCapture);
}

/** Live selection in the editor — never a stale toolbar bookmark. */
function getClauseEditorLiveRange(jodit) {
    const root = getWysiwygEditor(jodit);
    if (!root) return null;
    try {
        const docSel = root.ownerDocument?.getSelection?.();
        if (docSel?.rangeCount) {
            const live = docSel.getRangeAt(0);
            if (root.contains(live.startContainer)) return live.cloneRange();
        }
    } catch {
        /* ignore */
    }
    try {
        const jr = jodit.s?.range;
        if (jr && root.contains(jr.startContainer)) return jr.cloneRange();
    } catch {
        /* ignore */
    }
    return null;
}

function findLineIndexAtCaretInBlock(block, range) {
    const lineHtmls = getLineHtmlsFromElement(block);
    if (lineHtmls.length <= 1) return 0;
    try {
        const doc = block.ownerDocument;
        const caretProbe = doc.createRange();
        caretProbe.setStart(range.startContainer, range.startOffset);
        caretProbe.collapse(true);
        const blockRange = doc.createRange();
        blockRange.selectNodeContents(block);
        blockRange.setEnd(caretProbe.startContainer, caretProbe.startOffset);
        const caretPos = blockRange.toString().length;
        let consumed = 0;
        for (let i = 0; i < lineHtmls.length; i++) {
            const plain = lineHtmls[i].replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
            const lineLen = plain.length;
            if (caretPos <= consumed + lineLen) return i;
            consumed += lineLen + 1;
        }
        return lineHtmls.length - 1;
    } catch {
        return 0;
    }
}

/** Split a <p>/<div> with <br> rows into one block per visual line (Tab indents one line only). */
function splitMultiLineBlockAtBr(block) {
    const lineHtmls = getLineHtmlsFromElement(block);
    if (lineHtmls.length <= 1) return null;
    const parent = block.parentNode;
    if (!parent) return null;
    const tag = /^DIV$/i.test(block.tagName) ? 'div' : 'p';
    const doc = block.ownerDocument;
    const priorMargin = parseInlineMarginLeftPx(block);
    const newEls = lineHtmls.map((html, index) => {
        const el = doc.createElement(tag);
        el.innerHTML = html;
        if (priorMargin && index === 0) setInlineMarginLeftPx(el, priorMargin);
        return el;
    });
    const anchor = block.nextSibling;
    block.remove();
    if (anchor) {
        newEls.forEach((el) => parent.insertBefore(el, anchor));
    } else {
        newEls.forEach((el) => parent.appendChild(el));
    }
    return newEls;
}

function getIndentBlockAtCollapsedCaret(root, range) {
    let block = getEditableLineBlock(root, range);
    if (!block || block.closest('table')) return block;
    if (block.tagName === 'LI') return block;

    const lineHtmls = getLineHtmlsFromElement(block);
    if (lineHtmls.length <= 1) return block;

    const lineIndex = findLineIndexAtCaretInBlock(block, range);
    const split = splitMultiLineBlockAtBr(block);
    if (split?.length) return split[Math.min(lineIndex, split.length - 1)];
    return block;
}

/** Blocks that should receive Tab / Shift+Tab margin — only lines touched by the selection. */
function collectIndentBlocksInRange(root, range) {
    /** @type {Element[]} */
    const blocks = [];
    const seen = new Set();
    const add = (el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        blocks.push(el);
    };

    if (!root || !range) return blocks;

    if (range.collapsed) {
        const block = getIndentBlockAtCollapsedCaret(root, range);
        if (block) add(block);
        return blocks;
    }

    const scan = (parent) => {
        if (!parent?.childNodes) return;
        [...parent.childNodes].forEach((node) => {
            if (node.nodeType !== 1) return;
            const tag = node.tagName;
            if (tag === 'TABLE') return;
            if (tag === 'UL' || tag === 'OL') {
                [...node.children].forEach((li) => {
                    if (li.tagName === 'LI' && rangeIntersectsNode(range, li)) add(li);
                });
                return;
            }
            if (tag === 'LI') {
                if (rangeIntersectsNode(range, node)) add(node);
                return;
            }
            if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return;
            if (node.closest('ul, ol, table')) return;
            if (
                tag === 'DIV' &&
                node.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > table')
            ) {
                scan(node);
                return;
            }
            if (rangeIntersectsNode(range, node)) add(node);
        });
    };

    scan(root);
    return blocks;
}

function applyIndentDeltaToBlocks(blocks, step, outdent) {
    if (!blocks.length) return false;
    blocks.forEach((block) => {
        let next = parseInlineMarginLeftPx(block);
        if (outdent) next = Math.max(0, next - step);
        else next = Math.min(EMS_LINE_INDENT_MAX_PX, next + step);
        setInlineMarginLeftPx(block, next);
    });
    return true;
}

function clausePartsSharePrefix(parts, prefixParts) {
    if (!prefixParts?.length || !parts?.length || parts.length <= prefixParts.length) return false;
    for (let i = 0; i < prefixParts.length; i += 1) {
        if (parts[i] !== prefixParts[i]) return false;
    }
    return true;
}

function clausePartsEqual(partsA, partsB) {
    if (!partsA?.length || !partsB?.length || partsA.length !== partsB.length) return false;
    return partsA.every((n, i) => n === partsB[i]);
}

function getPlainNumberParts(block) {
    if (!isPlainNumberedLineBlock(block)) return null;
    const text = (block.textContent || '').replace(/\u00a0/g, ' ');
    const m = text.match(CLAUSE_PLAIN_NUMBER_RE);
    if (!m) return null;
    return parseClauseNumberParts(m[1]);
}

function findPreviousPlainBlockAtDepth(block, depth) {
    let node = getPreviousLineBlock(block);
    while (node) {
        const parts = getPlainNumberParts(node);
        if (parts) {
            if (parts.length === depth) return node;
            if (parts.length < depth) return null;
        }
        node = getPreviousLineBlock(node);
    }
    return null;
}

/** Highest trailing segment among sub-lines of parentPrefix between afterBlock and beforeBlock. */
function getMaxSubNumberBetween(parentPrefix, afterBlock, beforeBlock) {
    const targetDepth = parentPrefix.length + 1;
    let maxSub = 0;
    let node = afterBlock?.nextSibling || null;
    while (node && node !== beforeBlock) {
        const parts = getPlainNumberParts(node);
        if (parts) {
            if (parts.length < parentPrefix.length) break;
            if (parts.length === parentPrefix.length) {
                if (!clausePartsEqual(parts, parentPrefix)) break;
            } else if (parts.length === targetDepth && clausePartsSharePrefix(parts, parentPrefix)) {
                maxSub = Math.max(maxSub, parts[parts.length - 1]);
            }
        }
        node = node.nextSibling;
    }
    return maxSub;
}

function setPlainNumberOutlineIndent(block, parts, step) {
    const depth = parts?.length || 1;
    setInlineMarginLeftPx(block, Math.max(0, (depth - 1) * step));
}

function decrementFollowingPlainSiblingsAtDepth(afterBlock, depth, removedNumberAtDepth) {
    let node = afterBlock.nextSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        const parts = getPlainNumberParts(node);
        if (!parts) break;
        if (parts.length < depth) break;
        if (parts.length > depth) {
            node = node.nextSibling;
            continue;
        }
        if (parts[depth - 1] <= removedNumberAtDepth) break;
        parts[depth - 1] -= 1;
        replaceBlockNumberPrefix(node, formatClauseNumberParts(parts));
        node = node.nextSibling;
    }
}

function incrementFollowingPlainSiblingsAtDepth(fromBlock, depth, fromNumber) {
    let node = fromBlock.nextSibling;
    while (node) {
        if (node.nodeType !== 1) {
            node = node.nextSibling;
            continue;
        }
        const parts = getPlainNumberParts(node);
        if (!parts) break;
        if (parts.length < depth) break;
        if (parts.length > depth) {
            node = node.nextSibling;
            continue;
        }
        if (parts[depth - 1] < fromNumber) break;
        parts[depth - 1] += 1;
        replaceBlockNumberPrefix(node, formatClauseNumberParts(parts));
        node = node.nextSibling;
    }
}

function findLastPlainDescendantBlock(parentBlock, parentParts) {
    let last = parentBlock;
    let node = parentBlock.nextSibling;
    while (node) {
        const parts = getPlainNumberParts(node);
        if (!parts) break;
        if (parts.length <= parentParts.length) break;
        if (!clausePartsSharePrefix(parts, parentParts)) break;
        last = node;
        node = node.nextSibling;
    }
    return last;
}

function renumberFollowingSubSiblingsAfterRemove(parentParts, afterBlock, removedSubIndex) {
    let node = afterBlock.nextSibling;
    const targetDepth = parentParts.length + 1;
    while (node) {
        const parts = getPlainNumberParts(node);
        if (!parts) break;
        if (parts.length < targetDepth) break;
        if (parts.length > targetDepth) {
            node = node.nextSibling;
            continue;
        }
        if (!clausePartsSharePrefix(parts, parentParts)) break;
        if (parts[parts.length - 1] <= removedSubIndex) break;
        parts[parts.length - 1] -= 1;
        replaceBlockNumberPrefix(node, formatClauseNumberParts(parts));
        node = node.nextSibling;
    }
}

/** Word-like Tab: e.g. line "4." becomes "3.1." under the previous top-level item. */
function promotePlainNumberedBlockToSubLevel(block, step) {
    if (!isPlainNumberedLineBlock(block)) return false;
    const currentParts = getPlainNumberParts(block);
    if (!currentParts?.length) return false;

    let newParts;
    if (currentParts.length === 1) {
        const parentBlock = findPreviousPlainBlockAtDepth(block, 1);
        if (!parentBlock) return false;
        const parentParts = getPlainNumberParts(parentBlock);
        if (!parentParts || parentParts.length !== 1) return false;
        const maxSub = getMaxSubNumberBetween(parentParts, parentBlock, block);
        newParts = [...parentParts, maxSub + 1];
        const removedIndex = currentParts[currentParts.length - 1];
        const body = getLineBodyText(block);
        setPlainNumberedBlockBody(block, formatClauseNumberParts(newParts), body);
        setPlainNumberOutlineIndent(block, newParts, step);
        decrementFollowingPlainSiblingsAtDepth(block, 1, removedIndex);
        return true;
    }

    const maxSub = getMaxSubNumberBetween(currentParts, block, null);
    newParts = [...currentParts, maxSub + 1];
    const body = getLineBodyText(block);
    setPlainNumberedBlockBody(block, formatClauseNumberParts(newParts), body);
    setPlainNumberOutlineIndent(block, newParts, step);
    return true;
}

/** Shift+Tab: e.g. "3.1." outdents to "4." after its parent's subtree. */
function demotePlainNumberedBlockFromSubLevel(block, step) {
    if (!isPlainNumberedLineBlock(block)) return false;
    const currentParts = getPlainNumberParts(block);
    if (!currentParts || currentParts.length <= 1) return false;

    const parentParts = currentParts.slice(0, -1);
    const removedSub = currentParts[currentParts.length - 1];
    const parentBlock = findPreviousPlainBlockAtDepth(block, parentParts.length);
    if (!parentBlock) return false;
    const parentBlockParts = getPlainNumberParts(parentBlock);
    if (!clausePartsEqual(parentBlockParts, parentParts)) return false;

    const demotedDepth = parentParts.length;
    const newParts = [...parentParts];
    newParts[demotedDepth - 1] = parentParts[demotedDepth - 1] + 1;

    const insertAfter = findLastPlainDescendantBlock(parentBlock, parentParts);
    const body = getLineBodyText(block);

    incrementFollowingPlainSiblingsAtDepth(block, demotedDepth, newParts[demotedDepth - 1]);
    setPlainNumberedBlockBody(block, formatClauseNumberParts(newParts), body);
    setPlainNumberOutlineIndent(block, newParts, step);

    if (insertAfter?.parentNode) {
        insertAfter.parentNode.insertBefore(block, insertAfter.nextSibling);
    }

    renumberFollowingSubSiblingsAfterRemove(parentParts, parentBlock, removedSub);
    return true;
}

function isEmsOutlineListElement(list) {
    if (!list || (list.tagName !== 'OL' && list.tagName !== 'UL')) return false;
    return [...list.classList].some((c) => c.startsWith('ems-num-') || c.startsWith('ems-bullet-'));
}

function copyEmsListShell(parentList) {
    const doc = parentList.ownerDocument;
    const nested = doc.createElement(parentList.tagName);
    nested.className = parentList.className;
    if (parentList.getAttribute('style')) {
        nested.setAttribute('style', parentList.getAttribute('style'));
    }
    return nested;
}

function promoteListItemToSubLevel(li) {
    if (!li || li.tagName !== 'LI') return false;
    const list = li.parentElement;
    if (!list || !isEmsOutlineListElement(list)) return false;
    const prev = li.previousElementSibling;
    if (!prev || prev.tagName !== 'LI') return false;

    let nested = prev.querySelector(':scope > ol, :scope > ul');
    if (!nested) {
        nested = copyEmsListShell(list);
        prev.appendChild(nested);
    }
    nested.appendChild(li);
    return true;
}

function demoteListItemFromSubLevel(li) {
    if (!li || li.tagName !== 'LI') return false;
    const parentList = li.parentElement;
    if (!parentList || !isEmsOutlineListElement(parentList)) return false;
    const grandLi = parentList.parentElement;
    if (!grandLi || grandLi.tagName !== 'LI') return false;
    const outerList = grandLi.parentElement;
    if (!outerList) return false;

    outerList.insertBefore(li, grandLi.nextSibling);
    if (!parentList.children.length) parentList.remove();
    return true;
}

function applyOutlineIndentToBlock(block, step, outdent) {
    if (!block) return false;
    if (block.tagName === 'LI') {
        return outdent ? demoteListItemFromSubLevel(block) : promoteListItemToSubLevel(block);
    }
    if (isPlainNumberedLineBlock(block)) {
        return outdent
            ? demotePlainNumberedBlockFromSubLevel(block, step)
            : promotePlainNumberedBlockToSubLevel(block, step);
    }
    return false;
}

function parseInlineMarginLeftPx(el) {
    const raw = el?.style?.getPropertyValue?.('margin-left') || el?.style?.marginLeft || '';
    const m = String(raw).match(/^([\d.]+)px$/);
    if (m) return parseFloat(m[1]);
    const data = el?.getAttribute?.('data-ems-indent');
    if (data && /^\d+(\.\d+)?$/.test(data)) return parseFloat(data);
    return 0;
}

function setInlineMarginLeftPx(block, px) {
    if (!block) return;
    if (px > 0) {
        block.style.setProperty('margin-left', `${px}px`, 'important');
        block.setAttribute('data-ems-indent', String(px));
    } else {
        block.style.removeProperty('margin-left');
        block.removeAttribute('data-ems-indent');
    }
    if (block.getAttribute?.('style') === '') block.removeAttribute('style');
}

function restoreIndentCaretOffset(jodit, offset) {
    const root = getWysiwygEditor(jodit);
    if (!root || offset == null) return false;
    try {
        const clamped = Math.max(0, Math.min(offset, getTotalTextLengthInRoot(root)));
        const resolved = resolveTextOffsetInRoot(root, clamped);
        const range = root.ownerDocument.createRange();
        range.setStart(resolved.node, resolved.offset);
        range.collapse(true);
        return selectClauseEditorRange(jodit, range);
    } catch {
        return false;
    }
}

/** Word-like line indent for paragraphs and list items (toolbar + Tab). */
export function applyClauseEditorLineIndent(jodit, outdent = false) {
    const root = getWysiwygEditor(jodit);
    if (!root || isClauseEditorSelectionInTable(jodit)) return false;

    const range = getClauseEditorLiveRange(jodit);
    if (!range || !root.contains(range.startContainer)) return false;

    const step =
        Number(jodit.o?.indentMargin) > 0 ? Number(jodit.o.indentMargin) : EMS_LINE_INDENT_STEP_PX;

    const caretOffset = range.collapsed ? captureCollapsedCaretOffset(jodit) : null;
    const selectionBookmark = range.collapsed ? null : captureTextRangeBookmark(root, range);

    const blocks = collectIndentBlocksInRange(root, range);
    if (!blocks.length) return false;

    const marginFallback = [];
    let applied = false;
    blocks.forEach((block) => {
        if (applyOutlineIndentToBlock(block, step, outdent)) {
            applied = true;
        } else {
            marginFallback.push(block);
        }
    });
    if (marginFallback.length) {
        applied = applyIndentDeltaToBlocks(marginFallback, step, outdent) || applied;
    }
    if (!applied) return false;

    jodit.e?.fire?.('change');

    if (selectionBookmark) {
        restoreTextRangeBookmark(jodit, selectionBookmark);
        requestAnimationFrame(() => {
            restoreTextRangeBookmark(jodit, selectionBookmark);
            rememberEditorListSelection(jodit);
        });
    } else if (caretOffset != null) {
        const restore = () => restoreIndentCaretOffset(jodit, caretOffset);
        restore();
        requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(() => {
                restore();
                rememberEditorListSelection(jodit);
            });
        });
    } else {
        rememberEditorListSelection(jodit);
    }
    return true;
}

function applyEmsLineIndent(jodit, outdent) {
    return applyClauseEditorLineIndent(jodit, outdent);
}

function registerClauseEditorTabIndent(jodit) {
    const onKeyDown = (e) => {
        if (e.__emsClauseTabIndentHandled) return;
        if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
        const root = getWysiwygEditor(jodit);
        if (!root) return;
        let node = jodit.s?.range?.startContainer;
        if (node?.nodeType === 3) node = node.parentElement;
        if (node?.closest?.('table')) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        e.__emsClauseTabIndentHandled = true;
        applyEmsLineIndent(jodit, e.shiftKey);
    };

    jodit.e.on('keydown.emsClauseTabIndent', onKeyDown, { top: true });

    const bindRootCapture = () => {
        const root = getWysiwygEditor(jodit);
        if (!root || root.__emsTabIndentBound) return;
        root.__emsTabIndentBound = true;
        root.addEventListener(
            'keydown',
            (e) => {
                if (e.__emsClauseTabIndentHandled) return;
                if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.target?.closest?.('table')) return;
                onKeyDown(e);
            },
            true
        );
    };
    bindRootCapture();
    jodit.e.on('afterInit.emsClauseTabIndent', bindRootCapture);

    jodit.registerCommand('indent', {
        exec: () => {
            applyClauseEditorLineIndent(jodit, false);
            return false;
        },
    });
    jodit.registerCommand('outdent', {
        exec: () => {
            applyClauseEditorLineIndent(jodit, true);
            return false;
        },
    });

    jodit.e.on('beforeCommand.emsClauseIndentOnly', (command) => {
        const c = String(command || '').toLowerCase();
        if (c !== 'indent' && c !== 'outdent') return;
        restoreListToolbarSelection(jodit);
    });
}

/** Override Jodit list commands with Word-style bullet/number libraries. */
export function registerClauseEditorListCommands(jodit) {
    if (!jodit || jodit.__emsListCommandsRegistered) return;
    jodit.__emsListCommandsRegistered = true;
    registerListToolbarSelectionHooks(jodit);
    registerClauseEditorEnterContinuation(jodit);
    registerClauseEditorDeleteRenumber(jodit);
    registerClauseEditorTabIndent(jodit);

    jodit.e.on('beforeCommand', (command) => {
        const c = String(command || '').toLowerCase();
        if (c === 'insertunorderedlist' || c === 'insertorderedlist') {
            return false;
        }
    });

    jodit.registerCommand('insertUnorderedList', (_cmd, _mode, type) => {
        applyListPreset(jodit, 'ul', type, UL_PRESETS, BULLET_CLASS_NAMES, OL_CLASS_NAMES);
        return false;
    });
    jodit.registerCommand('insertOrderedList', (_cmd, _mode, type) => {
        applyListPreset(jodit, 'ol', type, OL_PRESETS, OL_CLASS_NAMES, BULLET_CLASS_NAMES);
        return false;
    });
}

export const EMS_UL_TOOLBAR_CONTROL = markJoditConfigAtom({
    name: 'ul',
    tags: ['ul'],
    tooltip: 'Bullet Library',
    list: BULLET_LIST_MENU,
    exec: (jodit, _current, { control, button }) => {
        const key = control.args?.[0] ?? 'disc';
        applyListPreset(jodit, 'ul', key, UL_PRESETS, BULLET_CLASS_NAMES, OL_CLASS_NAMES);
        closeListToolbarPopup(jodit, button);
    },
});

export const EMS_OL_TOOLBAR_CONTROL = markJoditConfigAtom({
    name: 'ol',
    tags: ['ol'],
    tooltip: 'Numbering Library',
    list: NUMBER_LIST_MENU,
    exec: (jodit, _current, { control, button }) => {
        const key = control.args?.[0] ?? 'decimal';
        applyListPreset(jodit, 'ol', key, OL_PRESETS, OL_CLASS_NAMES, BULLET_CLASS_NAMES);
        closeListToolbarPopup(jodit, button);
    },
});

/** Editor + print/PDF — keep in sync with clause HTML class names. */
export const CLAUSE_LIST_STYLES_CSS = `
    /*
     * EMS lists: markers live inside each <li> (left: 0 + padding-left).
     * Negative gutters were clipped by preview/editor overflow-x: hidden.
     */
    .clause-editor-wrapper .jodit-wysiwyg ul[class*='ems-bullet-'],
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-'],
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul[class*='ems-bullet-'],
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol[class*='ems-num-'],
    #quote-preview .clause-content ul[class*='ems-bullet-'],
    #quote-preview .clause-content ol[class*='ems-num-'],
    .clause-content ul[class*='ems-bullet-'],
    .clause-content ol[class*='ems-num-'] {
        font-size: inherit !important;
        list-style: none !important;
        margin-left: 0 !important;
        padding-left: 0 !important;
        overflow: visible !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul[class*='ems-bullet-'] > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul[class*='ems-bullet-'] > li,
    #quote-preview .clause-content ul[class*='ems-bullet-'] > li,
    .clause-content ul[class*='ems-bullet-'] > li {
        font-size: inherit !important;
        display: block !important;
        list-style: none !important;
        position: relative !important;
        padding-left: calc(${EMS_BULLET_MARKER_WIDTH} + ${EMS_LIST_MARKER_GAP}) !important;
        text-indent: 0 !important;
        overflow: visible !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-'] > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol[class*='ems-num-'] > li,
    #quote-preview .clause-content ol[class*='ems-num-'] > li,
    .clause-content ol[class*='ems-num-'] > li {
        font-size: inherit !important;
        display: block !important;
        list-style: none !important;
        position: relative !important;
        padding-left: calc(${EMS_NUM_MARKER_WIDTH} + ${EMS_LIST_MARKER_GAP}) !important;
        text-indent: 0 !important;
        overflow: visible !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ul[class*='ems-bullet-'] > li::before,
    .clause-content ul[class*='ems-bullet-'] > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul[class*='ems-bullet-'] > li::before,
    #quote-preview .clause-content ul[class*='ems-bullet-'] > li::before {
        display: block !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: ${EMS_BULLET_MARKER_WIDTH} !important;
        text-align: center !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-'] > li::before,
    .clause-content ol[class*='ems-num-'] > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol[class*='ems-num-'] > li::before,
    #quote-preview .clause-content ol[class*='ems-num-'] > li::before {
        display: block !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: ${EMS_NUM_MARKER_WIDTH} !important;
        text-align: right !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-disc > li::before,
    .clause-content ul.ems-bullet-disc > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-disc > li::before,
    #quote-preview .clause-content ul.ems-bullet-disc > li::before {
        content: '\\2022' !important;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-circle > li::before,
    .clause-content ul.ems-bullet-circle > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-circle > li::before,
    #quote-preview .clause-content ul.ems-bullet-circle > li::before {
        content: '\\25CB' !important;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-square > li::before,
    .clause-content ul.ems-bullet-square > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-square > li::before,
    #quote-preview .clause-content ul.ems-bullet-square > li::before {
        content: '\\25A0' !important;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-check > li::before,
    .clause-content ul.ems-bullet-check > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-check > li::before,
    #quote-preview .clause-content ul.ems-bullet-check > li::before {
        content: '\\2713' !important;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-arrow > li::before,
    .clause-content ul.ems-bullet-arrow > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-arrow > li::before,
    #quote-preview .clause-content ul.ems-bullet-arrow > li::before {
        content: '\\25B8' !important;
        font-weight: 700;
    }
    .clause-editor-wrapper .jodit-wysiwyg ul.ems-bullet-diamond > li::before,
    .clause-content ul.ems-bullet-diamond > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ul.ems-bullet-diamond > li::before,
    #quote-preview .clause-content ul.ems-bullet-diamond > li::before {
        content: '\\25C6' !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal,
    .clause-content ol.ems-num-decimal,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal,
    #quote-preview .clause-content ol.ems-num-decimal {
        counter-reset: ems-decimal;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li,
    .clause-content ol.ems-num-decimal > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal > li,
    #quote-preview .clause-content ol.ems-num-decimal > li {
        counter-increment: ems-decimal;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li::before,
    .clause-content ol.ems-num-decimal > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal > li::before,
    #quote-preview .clause-content ol.ems-num-decimal > li::before {
        content: counter(ems-decimal) '.' !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal,
    .clause-content ol.ems-num-decimal ol.ems-num-decimal,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal,
    #quote-preview .clause-content ol.ems-num-decimal ol.ems-num-decimal {
        counter-reset: ems-decimal-sub;
        margin-top: 0;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal > li,
    .clause-content ol.ems-num-decimal ol.ems-num-decimal > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal > li,
    #quote-preview .clause-content ol.ems-num-decimal ol.ems-num-decimal > li {
        counter-increment: ems-decimal-sub;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    .clause-content ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    #quote-preview .clause-content ol.ems-num-decimal > li > ol.ems-num-decimal > li::before {
        content: counter(ems-decimal) '.' counter(ems-decimal-sub) '.' !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal,
    .clause-content ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal,
    #quote-preview .clause-content ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal {
        counter-reset: ems-decimal-sub2;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal > li,
    .clause-content ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal > li,
    #quote-preview .clause-content ol.ems-num-decimal ol.ems-num-decimal ol.ems-num-decimal > li {
        counter-increment: ems-decimal-sub2;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal > li > ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    .clause-content ol.ems-num-decimal > li > ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal > li > ol.ems-num-decimal > li > ol.ems-num-decimal > li::before,
    #quote-preview .clause-content ol.ems-num-decimal > li > ol.ems-num-decimal > li > ol.ems-num-decimal > li::before {
        content: counter(ems-decimal) '.' counter(ems-decimal-sub) '.' counter(ems-decimal-sub2) '.' !important;
    }

    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal),
    .clause-content ol[class*='ems-num-']:not(.ems-num-decimal),
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal),
    #quote-preview .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) {
        counter-reset: emsol;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal) > li,
    .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) > li,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol[class*='ems-num-']:not(.ems-num-decimal) > li,
    #quote-preview .clause-content ol[class*='ems-num-']:not(.ems-num-decimal) > li {
        counter-increment: emsol;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-decimal-paren > li::before,
    .clause-content ol.ems-num-decimal-paren > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-decimal-paren > li::before,
    #quote-preview .clause-content ol.ems-num-decimal-paren > li::before {
        content: counter(emsol) ')' !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-upper-roman > li::before,
    .clause-content ol.ems-num-upper-roman > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-upper-roman > li::before,
    #quote-preview .clause-content ol.ems-num-upper-roman > li::before {
        content: counter(emsol, upper-roman) '.' !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-upper-alpha > li::before,
    .clause-content ol.ems-num-upper-alpha > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-upper-alpha > li::before,
    #quote-preview .clause-content ol.ems-num-upper-alpha > li::before {
        content: counter(emsol, upper-alpha) '.' !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-alpha-paren > li::before,
    .clause-content ol.ems-num-lower-alpha-paren > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-lower-alpha-paren > li::before,
    #quote-preview .clause-content ol.ems-num-lower-alpha-paren > li::before {
        content: counter(emsol, lower-alpha) ')' !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-alpha > li::before,
    .clause-content ol.ems-num-lower-alpha > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-lower-alpha > li::before,
    #quote-preview .clause-content ol.ems-num-lower-alpha > li::before {
        content: counter(emsol, lower-alpha) '.' !important;
    }
    .clause-editor-wrapper .jodit-wysiwyg ol.ems-num-lower-roman > li::before,
    .clause-content ol.ems-num-lower-roman > li::before,
    #quote-preview .quote-clause-inline-editor .jodit-wysiwyg ol.ems-num-lower-roman > li::before,
    #quote-preview .clause-content ol.ems-num-lower-roman > li::before {
        content: counter(emsol, lower-roman) '.' !important;
    }
`;

/** Normalize list HTML when loading clause content (fixes existing "all 1" lists). */
export function normalizeClauseListHtml(root) {
    if (!root) return;
    reconcileListTagClasses(root);
    mergeAdjacentLists(root, 'ol');
    mergeAdjacentLists(root, 'ul');
    cleanupNestedAndEmptyListItems(root);
    stripLeadingListMarkers(root);
    inferListClassesFromStyles(root);
}

/** Normalize clause HTML string before save / preview (merge lists + EMS classes). */
export function normalizeClauseListHtmlInString(html) {
    const raw = String(html || '');
    if (!raw || !/<[a-z][\s>]/i.test(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(`<div id="__ems_clause_root">${raw}</div>`, 'text/html');
        const root = doc.getElementById('__ems_clause_root');
        if (!root) return raw;
        normalizeClauseListHtml(root);
        return root.innerHTML;
    } catch {
        return raw;
    }
}

/** If a <ul> still has numbering classes, or <ol> has bullet classes, fix on load. */
function reconcileListTagClasses(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('ul').forEach((ul) => {
        stripClasses(ul, OL_CLASS_NAMES);
    });
    root.querySelectorAll('ol').forEach((ol) => {
        stripClasses(ol, BULLET_CLASS_NAMES);
    });
}

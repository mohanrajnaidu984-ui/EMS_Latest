/**
 * Chronological clause document snapshots: typing, formatting and table structure.
 * Kept in a leaf module — must NOT import clauseEditorTable or listPresets
 * (avoids Rollup circular-init bugs that break paste in production).
 */

const MAX_DOC_HISTORY = 80;

function getDocumentHistory(jodit) {
    if (!jodit.__emsDocHist) {
        jodit.__emsDocHist = { undo: [], redo: [] };
    }
    return jodit.__emsDocHist;
}

function readEditorHtml(jodit) {
    try {
        return String(jodit?.editor?.innerHTML ?? jodit?.value ?? '');
    } catch {
        return '';
    }
}

function captureSelection(jodit) {
    const root = jodit?.editor;
    const selection = root?.ownerDocument?.getSelection?.();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const address = node => {
        const parts = [];
        while (node && node !== root) {
            const parent = node.parentNode;
            if (!parent) return null;
            parts.unshift([...parent.childNodes].indexOf(node));node=parent;
        }
        return node === root ? parts : null;
    };
    const start=address(range.startContainer),end=address(range.endContainer);
    return start && end ? {start,end,startOffset:range.startOffset,endOffset:range.endOffset} : null;
}

function restoreSelection(jodit, saved) {
    if (!saved || !jodit.editor) return;
    try {
        const root=jodit.editor;
        const find=parts=>parts.reduce((node,index)=>node?.childNodes[index],root);
        const start=find(saved.start),end=find(saved.end);
        if (!start || !end) return;
        const limit=node=>node.nodeType===3?node.length:node.childNodes.length;
        const range=root.ownerDocument.createRange();
        range.setStart(start,Math.min(saved.startOffset,limit(start)));
        range.setEnd(end,Math.min(saved.endOffset,limit(end)));
        root.focus({preventScroll:true});const selection=root.ownerDocument.getSelection();
        selection.removeAllRanges();selection.addRange(range);
        jodit.__emsActiveTableCell=(start.nodeType===1?start:start.parentElement)?.closest?.('td,th')||null;
    } catch { /* An imported element may no longer have the same path. */ }
}

function withHistoryBlocked(jodit, fn) {
    if (!jodit || typeof fn !== 'function') return undefined;
    const snapshot = jodit.history?.snapshot;
    if (snapshot?.transaction) {
        let result;
        snapshot.transaction(() => {
            result = fn();
        });
        return result;
    }
    return fn();
}

/** Call immediately before a structural mutation (table paste, add/delete row/col, etc.). */
export function captureDocumentHistoryBeforeMutation(jodit) {
    if (!jodit || jodit.__emsApplyingClauseHistory) return;
    /* Keep the pre-paste snapshot; never replace it during office post-process. */
    if (jodit.__emsOfficePastePostProcess) return;
    if (jodit.__emsDocHistPending) return;
    const html = readEditorHtml(jodit);
    jodit.__emsDocHistPending = { html, selection:captureSelection(jodit), at: Date.now() };
}

/** Call after the mutation settles — pushes one undo step if HTML changed. */
export function commitDocumentHistoryAfterMutation(jodit) {
    if (!jodit || jodit.__emsApplyingClauseHistory) return false;
    const pending = jodit.__emsDocHistPending;
    jodit.__emsDocHistPending = null;
    if (!pending || typeof pending.html !== 'string') return false;
    const nextHtml = readEditorHtml(jodit);
    if (nextHtml === pending.html) return false;
    const hist = getDocumentHistory(jodit);
    if (hist.undo[hist.undo.length - 1]?.html !== pending.html) {
        hist.undo.push({ html: pending.html, selection:pending.selection });
        while (hist.undo.length > MAX_DOC_HISTORY) hist.undo.shift();
    }
    hist.redo = [];
    try {
        jodit.e?.fire?.('change');
        jodit.e?.fire?.('updateToolbar');
    } catch {
        /* ignore */
    }
    return true;
}

/** Toolbar controls that mutate the DOM directly do not always emit beforeCommand. */
export function withDocumentHistoryMutation(jodit, mutate) {
    if (!jodit || jodit.__emsDocHistPending) return mutate();
    captureDocumentHistoryBeforeMutation(jodit);
    try {
        return mutate();
    } finally {
        commitDocumentHistoryAfterMutation(jodit);
    }
}

export function tryDocumentHistoryUndo(jodit) {
    if (!jodit) return false;
    const hist = getDocumentHistory(jodit);
    if (!hist.undo.length) return false;
    const current = readEditorHtml(jodit);
    const prev = hist.undo.pop();
    if (!prev || typeof prev.html !== 'string') return false;
    hist.redo.push({ html: current, selection:captureSelection(jodit) });
    while (hist.redo.length > MAX_DOC_HISTORY) hist.redo.shift();
    withHistoryBlocked(jodit, () => {
        try {
            if (jodit.editor) jodit.editor.innerHTML = prev.html;
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            restoreSelection(jodit, prev.selection);
        } catch {
            /* ignore */
        }
    });
    jodit.__emsTableCellHist = { undo: [], redo: [] };
    jodit.__emsPreInputTableState = null;
    jodit.__emsDocHistPending = null;
    try {
        jodit.e?.fire?.('change');
        jodit.e?.fire?.('emsTableHistoryApplied');
        jodit.e?.fire?.('updateToolbar');
    } catch {
        /* ignore */
    }
    return true;
}

export function tryDocumentHistoryRedo(jodit) {
    if (!jodit) return false;
    const hist = getDocumentHistory(jodit);
    if (!hist.redo.length) return false;
    const current = readEditorHtml(jodit);
    const next = hist.redo.pop();
    if (!next || typeof next.html !== 'string') return false;
    hist.undo.push({ html: current, selection:captureSelection(jodit) });
    while (hist.undo.length > MAX_DOC_HISTORY) hist.undo.shift();
    withHistoryBlocked(jodit, () => {
        try {
            if (jodit.editor) jodit.editor.innerHTML = next.html;
            if (typeof jodit.synchronizeValues === 'function') jodit.synchronizeValues();
            restoreSelection(jodit, next.selection);
        } catch {
            /* ignore */
        }
    });
    jodit.__emsTableCellHist = { undo: [], redo: [] };
    jodit.__emsPreInputTableState = null;
    jodit.__emsDocHistPending = null;
    try {
        jodit.e?.fire?.('change');
        jodit.e?.fire?.('emsTableHistoryApplied');
        jodit.e?.fire?.('updateToolbar');
    } catch {
        /* ignore */
    }
    return true;
}

export function canEmsDocumentHistoryUndo(jodit) {
    return Boolean(jodit && getDocumentHistory(jodit).undo.length > 0);
}

export function canEmsDocumentHistoryRedo(jodit) {
    return Boolean(jodit && getDocumentHistory(jodit).redo.length > 0);
}

export function clearEmsDocumentHistory(jodit) {
    if (!jodit) return;
    jodit.__emsDocHist = { undo: [], redo: [] };
    jodit.__emsDocHistPending = null;
}

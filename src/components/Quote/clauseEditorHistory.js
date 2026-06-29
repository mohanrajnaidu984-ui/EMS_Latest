/**
 * Global chronological undo/redo for quote clause body edits.
 * Works across all clauses and after exiting inline edit mode.
 */

/** Max undo/redo steps retained per direction (oldest dropped when exceeded). */
export const CLAUSE_EDITOR_MAX_HISTORY_LENGTH = 50;

function trimHistoryStack(stack, maxLength = CLAUSE_EDITOR_MAX_HISTORY_LENGTH) {
    while (stack.length > maxLength) {
        stack.shift();
    }
}

export function createGlobalClauseHistory() {
    return {
        undo: [],
        redo: [],
    };
}

/**
 * @param {{ undo: Array, redo: Array }} history
 * @param {string} contentKey
 * @param {boolean} isCustom
 * @param {string} previousHtml
 * @param {string} nextHtml
 */
export function recordGlobalClauseHistoryChange(
    history,
    contentKey,
    isCustom,
    previousHtml,
    nextHtml
) {
    if (!history || !contentKey) return false;
    const prev = String(previousHtml ?? '');
    const next = String(nextHtml ?? '');
    if (prev === next) return false;

    history.undo.push({
        contentKey,
        isCustom: Boolean(isCustom),
        previousHtml: prev,
        nextHtml: next,
    });
    trimHistoryStack(history.undo);
    history.redo = [];
    return true;
}

/** @returns {{ contentKey, isCustom, previousHtml, nextHtml } | null} */
export function undoGlobalClauseHistory(history) {
    if (!history?.undo?.length) return null;
    const entry = history.undo.pop();
    history.redo.push(entry);
    trimHistoryStack(history.redo);
    return entry;
}

/** @returns {{ contentKey, isCustom, previousHtml, nextHtml } | null} */
export function redoGlobalClauseHistory(history) {
    if (!history?.redo?.length) return null;
    const entry = history.redo.pop();
    history.undo.push(entry);
    trimHistoryStack(history.undo);
    return entry;
}

export function canUndoGlobalClauseHistory(history) {
    return Boolean(history?.undo?.length);
}

export function canRedoGlobalClauseHistory(history) {
    return Boolean(history?.redo?.length);
}

export function resetGlobalClauseHistory(history) {
    if (!history) return;
    history.undo = [];
    history.redo = [];
}

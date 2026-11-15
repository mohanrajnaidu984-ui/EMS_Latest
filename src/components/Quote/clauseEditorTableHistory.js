/**
 * Cell-level undo/redo for in-table typing (Excel/Word paste HTML breaks Jodit snapshot ladders).
 */
import {
    captureTableCellCaretBookmark,
    restoreTableCellCaretBookmark,
    isClauseEditorSelectionInTable,
    withJoditHistoryBlocked,
    getWysiwygEditor,
} from './clauseEditorListPresets';
import {
    captureDocumentHistoryBeforeMutation,
    commitDocumentHistoryAfterMutation,
    tryDocumentHistoryUndo,
    tryDocumentHistoryRedo,
    canEmsDocumentHistoryUndo,
    canEmsDocumentHistoryRedo,
    clearEmsDocumentHistory,
} from './clauseEditorDocHistory';

export {
    captureDocumentHistoryBeforeMutation,
    commitDocumentHistoryAfterMutation,
    canEmsDocumentHistoryUndo,
    canEmsDocumentHistoryRedo,
    clearEmsDocumentHistory,
};

const MAX_TABLE_CELL_HISTORY = 200;
const UNDO_GUARD_MS = 80;

function getTableCellHistory(jodit) {
    if (!jodit.__emsTableCellHist) {
        jodit.__emsTableCellHist = { undo: [], redo: [] };
    }
    return jodit.__emsTableCellHist;
}

function statesEqual(a, b) {
    if (!a || !b) return false;
    return a.cellHtml === b.cellHtml && JSON.stringify(a.bookmark) === JSON.stringify(b.bookmark);
}

function guardDuplicateUndo(jodit, command) {
    const now = Date.now();
    const key = `__emsLast${command}At`;
    if (jodit[key] && now - jodit[key] < UNDO_GUARD_MS) return true;
    jodit[key] = now;
    return false;
}

export function captureTableCellHistoryState(jodit) {
    const bookmark = captureTableCellCaretBookmark(jodit);
    if (!bookmark || bookmark.kind !== 'cell') return null;
    const root = getWysiwygEditor(jodit);
    if (!root) return null;
    const table = root.querySelectorAll('table')[bookmark.tableIndex];
    const cell = table?.rows?.[bookmark.rowIndex]?.cells?.[bookmark.cellIndex];
    if (!cell || !root.contains(cell)) return null;
    return {
        bookmark: { ...bookmark },
        cellHtml: cell.innerHTML,
    };
}

function pushTableCellUndo(jodit, state) {
    if (!state) return;
    const hist = getTableCellHistory(jodit);
    const last = hist.undo[hist.undo.length - 1];
    if (statesEqual(last, state)) return;
    hist.undo.push(state);
    if (hist.undo.length > MAX_TABLE_CELL_HISTORY) hist.undo.shift();
    hist.redo = [];
}

function restoreTableCellHistoryState(jodit, state) {
    if (!state?.bookmark) return false;
    const root = getWysiwygEditor(jodit);
    if (!root) return false;
    const table = root.querySelectorAll('table')[state.bookmark.tableIndex];
    const cell = table?.rows?.[state.bookmark.rowIndex]?.cells?.[state.bookmark.cellIndex];
    if (!cell) return false;
    cell.innerHTML = state.cellHtml;
    jodit.__emsActiveTableCell = cell;
    if (typeof jodit.synchronizeValues === 'function') {
        jodit.synchronizeValues();
    }
    return restoreTableCellCaretBookmark(jodit, state.bookmark);
}

function scheduleTableCellCaretPin(jodit, bookmark) {
    if (!bookmark) return;
    const pin = () => {
        jodit.__emsForceCaretRestore = true;
        jodit.__emsSkipTableSelSync = true;
        restoreTableCellCaretBookmark(jodit, bookmark);
    };
    pin();
    requestAnimationFrame(() => {
        pin();
        requestAnimationFrame(() => {
            pin();
            jodit.__emsForceCaretRestore = false;
            jodit.__emsSkipTableSelSync = false;
            jodit.e?.fire?.('emsTableHistoryApplied');
            jodit.e?.fire?.('updateToolbar');
        });
    });
}

export function canEmsTableCellHistoryUndo(jodit) {
    return isClauseEditorSelectionInTable(jodit) && getTableCellHistory(jodit).undo.length > 0;
}

export function canEmsTableCellHistoryRedo(jodit) {
    return isClauseEditorSelectionInTable(jodit) && getTableCellHistory(jodit).redo.length > 0;
}

export function clearEmsTableCellHistory(jodit) {
    if (jodit) {
        jodit.__emsTableCellHist = { undo: [], redo: [] };
        jodit.__emsPreInputTableState = null;
    }
}

export function rememberTableCellPreEditState(jodit) {
    if (!isClauseEditorSelectionInTable(jodit)) return;
    if (jodit.__emsApplyingClauseHistory || isOfficePasteHistoryPaused(jodit)) return;
    const state = captureTableCellHistoryState(jodit);
    if (state) jodit.__emsPreInputTableState = state;
}

export function commitTableCellHistoryFromPreEdit(jodit) {
    if (!isClauseEditorSelectionInTable(jodit)) return;
    if (jodit.__emsApplyingClauseHistory || isOfficePasteHistoryPaused(jodit)) return;
    const pre = jodit.__emsPreInputTableState;
    if (!pre) return;
    pushTableCellUndo(jodit, pre);
    jodit.__emsPreInputTableState = captureTableCellHistoryState(jodit);
}

function tryEmsTableCellHistoryUndo(jodit) {
    if (!jodit || !isClauseEditorSelectionInTable(jodit)) return false;
    const hist = getTableCellHistory(jodit);
    if (!hist.undo.length) return false;

    const current = captureTableCellHistoryState(jodit);
    if (current) hist.redo.push(current);

    const prev = hist.undo.pop();
    withJoditHistoryBlocked(jodit, () => {
        restoreTableCellHistoryState(jodit, prev);
    });
    jodit.__emsPreInputTableState = captureTableCellHistoryState(jodit);
    scheduleTableCellCaretPin(jodit, prev.bookmark);
    return true;
}

function tryEmsTableCellHistoryRedo(jodit) {
    if (!jodit || !isClauseEditorSelectionInTable(jodit)) return false;
    const hist = getTableCellHistory(jodit);
    if (!hist.redo.length) return false;

    const current = captureTableCellHistoryState(jodit);
    if (current) hist.undo.push(current);

    const next = hist.redo.pop();
    withJoditHistoryBlocked(jodit, () => {
        restoreTableCellHistoryState(jodit, next);
    });
    jodit.__emsPreInputTableState = captureTableCellHistoryState(jodit);
    scheduleTableCellCaretPin(jodit, next.bookmark);
    return true;
}

/** Sole Ctrl+Z handler — prevents double-undo from Jodit hotkeys + browser. */
export function bindClauseEditorUndoHotkeys(jodit, getEditorBody) {
    if (!jodit || jodit.__emsClauseUndoHotkeysBound) return;
    jodit.__emsClauseUndoHotkeysBound = true;

    const stripJoditUndoHotkeys = () => {
        ['ctrl+z', 'cmd+z', 'ctrl+y', 'cmd+y', 'ctrl+shift+z', 'cmd+shift+z'].forEach((hotkey) => {
            jodit.e.off(`${hotkey}.hotkey`);
        });
    };
    stripJoditUndoHotkeys();
    jodit.e.on('afterInit.emsStripUndoHotkeys', stripJoditUndoHotkeys);
    window.setTimeout(stripJoditUndoHotkeys, 0);
    window.setTimeout(stripJoditUndoHotkeys, 100);

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
        if (!root || root.__emsClauseUndoHotkeysOnRoot) return;
        root.__emsClauseUndoHotkeysOnRoot = true;

        const onKeyDown = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const key = String(e.key || '').toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                jodit.execCommand('undo');
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                jodit.execCommand('redo');
            }
        };

        root.addEventListener('keydown', onKeyDown, true);
        jodit.e.on('beforeDestruct.emsClauseUndoHotkeys', () => {
            root.removeEventListener('keydown', onKeyDown, true);
        });
    };

    jodit.e.on('afterInit.emsClauseUndoHotkeys', attach);
    jodit.e.on('focus.emsClauseUndoHotkeys', attach);
    jodit.e.on('afterSetMode.emsClauseUndoHotkeys', attach);
    attach();
}

/**
 * Legacy fallback order (instances without the chronological input recorder):
 * 1) In-table cell typing stack
 * 2) Document stack (table paste / structure)
 * 3) Jodit native history
 * 4) Global clause history (across clauses / after exit-edit)
 */
export function installClauseEditorUndoHooks(jodit, { onGlobalUndo, onGlobalRedo } = {}) {
    if (!jodit) return;
    if (jodit.__emsClauseUndoHooksVer === 2) return;
    if (jodit.__emsClauseUndoHooks) {
        try {
            jodit.e.off('beforeCommand.emsClauseUndoRoute');
            jodit.e.off('afterCommand.emsClauseUndoRoute');
        } catch {
            /* ignore */
        }
    }
    jodit.__emsClauseUndoHooks = true;
    jodit.__emsClauseUndoHooksVer = 2;

    jodit.e.on('beforeCommand.emsClauseUndoRoute', (command) => {
        const cmd = String(command || '').toLowerCase();
        if (cmd !== 'undo' && cmd !== 'redo') return;
        if (!jodit.__emsDocumentInputHistory && guardDuplicateUndo(jodit, cmd)) return false;

        // A single chronological document stack includes ordinary typing as
        // well as structural table edits. Never replay older cell/native stacks
        // after it, or an undone paste can reappear.
        if (jodit.__emsDocumentInputHistory) {
            if (jodit.__emsOfficePastePostProcess) checkpointHistoryAfterOfficePaste(jodit);
            commitDocumentHistoryAfterMutation(jodit);
            if (cmd === 'undo') tryDocumentHistoryUndo(jodit);
            else tryDocumentHistoryRedo(jodit);
            return false;
        }

        if (cmd === 'undo') {
            if (tryEmsTableCellHistoryUndo(jodit)) return false;
            if (tryDocumentHistoryUndo(jodit)) return false;
            if (jodit.history?.canUndo?.()) return;
            if (onGlobalUndo?.()) return false;
            return false;
        }

        if (tryEmsTableCellHistoryRedo(jodit)) return false;
        if (tryDocumentHistoryRedo(jodit)) return false;
        if (jodit.history?.canRedo?.()) return;
        if (onGlobalRedo?.()) return false;
        return false;
    });

    jodit.e.on('afterCommand.emsClauseUndoRoute', (command) => {
        const cmd = String(command || '').toLowerCase();
        if (cmd !== 'undo' && cmd !== 'redo') return;
        jodit.e?.fire?.('updateToolbar');
    });
}

export function tryClauseEditorHistoryCommand(jodit, command) {
    if (!jodit) return false;
    jodit.execCommand(command);
    return true;
}

export function tryJoditTableHistoryCommand(jodit, command) {
    return tryClauseEditorHistoryCommand(jodit, command);
}

function blockJoditHistorySnapshot(jodit, enable) {
    const snap = jodit?.history?.snapshot;
    if (!snap?.__block) return;
    const depth = jodit.__emsOfficePasteSnapshotBlockDepth || 0;
    if (enable) {
        jodit.__emsOfficePasteSnapshotBlockDepth = depth + 1;
        if (depth === 0) snap.__block(true);
        return;
    }
    const next = Math.max(0, depth - 1);
    jodit.__emsOfficePasteSnapshotBlockDepth = next;
    if (next === 0 && (snap.__levelOfTransaction || 0) === 0) {
        snap.__block(false);
    }
}

function trimJoditHistoryStackTo(jodit, len) {
    const stack = jodit?.history?.__stack;
    if (!stack?.commands) return;
    const target = Math.max(0, len);
    while (stack.commands.length > target) {
        stack.commands.pop();
    }
    if (stack.stackPosition >= stack.commands.length) {
        stack.stackPosition = stack.commands.length - 1;
    }
}

/** While true, Jodit history must not record post-paste DOM normalization passes. */
export function beginOfficePastePostProcess(jodit) {
    if (!jodit || jodit.__emsOfficePastePostProcess) return;
    jodit.__emsOfficePastePostProcess = true;
    jodit.__emsOfficePasteHistoryStackLen = jodit.history?.length ?? 0;
    blockJoditHistorySnapshot(jodit, true);
}

/** Sync undo baseline after Excel/Word paste formatting — keep pre-paste steps, drop paste noise. */
export function checkpointHistoryAfterOfficePaste(jodit) {
    if (!jodit?.history) return;
    try {
        withJoditHistoryBlocked(jodit, () => {
            if (typeof jodit.synchronizeValues === 'function') {
                jodit.synchronizeValues();
            }
            const savedLen = jodit.__emsOfficePasteHistoryStackLen ?? 0;
            trimJoditHistoryStackTo(jodit, savedLen);
            const snap = jodit.history.snapshot;
            if (snap) {
                jodit.history.startValue = snap.make();
            }
        });
        /* Drop noisy cell ladder from paste formatting — document stack keeps the paste itself. */
        clearEmsTableCellHistory(jodit);
        commitDocumentHistoryAfterMutation(jodit);
    } catch {
        /* ignore */
    } finally {
        jodit.__emsOfficePastePostProcess = false;
        jodit.__emsOfficePasteHistoryStackLen = undefined;
        blockJoditHistorySnapshot(jodit, false);
        try {
            jodit.__emsPendingChangeEmit = true;
            jodit.e?.fire?.('change');
            jodit.e?.fire?.('updateToolbar');
        } catch {
            /* ignore */
        }
    }
}

/** DOM cleanup in progress — block history recording (not the full 800ms cleanHTML lock). */
export function isOfficePasteHistoryPaused(jodit) {
    return Boolean(jodit?.__emsOfficePastePostProcess);
}

export function isOfficePastePostProcessActive(jodit) {
    return Boolean(jodit?.__emsOfficePastePostProcess || jodit?.__emsOfficePasteLock);
}

/** @param {() => HTMLElement|null} getEditorBody */
export function bindTableCellHistoryRecorder(jodit, getEditorBody) {
    if (!jodit || jodit.__emsTableCellHistBound) return;
    jodit.__emsTableCellHistBound = true;
    jodit.__emsDocumentInputHistory = true;

    const attach = () => {
        const root =
            (typeof getEditorBody === 'function' && getEditorBody()) || jodit.editor || null;
        if (!root || root.__emsTableCellHistRecorderBound) return;
        root.__emsTableCellHistRecorderBound = true;

        const onPreEdit = (e) => {
            if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
                e.preventDefault();e.stopImmediatePropagation();
                jodit.execCommand(e.inputType === 'historyUndo' ? 'undo' : 'redo');
                return;
            }
            if (jodit.__emsApplyingClauseHistory || isOfficePasteHistoryPaused(jodit)) return;
            if (e?.ctrlKey || e?.metaKey || e?.altKey) return;
            if (
                e.type === 'keydown' &&
                e.key !== 'Backspace' &&
                e.key !== 'Delete' &&
                e.key !== 'Enter' &&
                e.key?.length !== 1
            ) {
                return;
            }
            captureDocumentHistoryBeforeMutation(jodit);
        };

        const onPostEdit = () => {
            if (!isOfficePasteHistoryPaused(jodit)) commitDocumentHistoryAfterMutation(jodit);
        };

        root.addEventListener('keydown', onPreEdit, true);
        root.addEventListener('beforeinput', onPreEdit, true);
        root.addEventListener('input', onPostEdit, true);

        jodit.e.on('beforePaste.emsTableCellHist', () => {
            if (jodit.__emsOfficePasteLock) {
                jodit.__emsSkipTableCellHistOnPaste = true;
                return;
            }
            captureDocumentHistoryBeforeMutation(jodit);
        });
        jodit.e.on('afterPaste.emsTableCellHist', () => {
            if (jodit.__emsSkipTableCellHistOnPaste) {
                jodit.__emsSkipTableCellHistOnPaste = false;
                return;
            }
            if (!isOfficePasteHistoryPaused(jodit)) commitDocumentHistoryAfterMutation(jodit);
        });

        jodit.e.on('beforeCommand.emsTableCellHist', (command) => {
            const c = String(command || '').toLowerCase();
            if (
                /^(bold|italic|underline|strikethrough|forecolor|background|brush|fontsize|font|justify|table|insert|delete|remove|ems|orderedlist|unorderedlist|indent|outdent|applylineheight|paragraph|formatblock)/.test(
                    c
                )
            ) {
                captureDocumentHistoryBeforeMutation(jodit);
            }
        });
        jodit.e.on('afterCommand.emsTableCellHist', (command) => {
            const c = String(command || '').toLowerCase();
            if (
                /^(bold|italic|underline|strikethrough|forecolor|background|brush|fontsize|font|justify|table|insert|delete|remove|ems|orderedlist|unorderedlist|indent|outdent|applylineheight|paragraph|formatblock)/.test(
                    c
                )
            ) {
                commitDocumentHistoryAfterMutation(jodit);
            }
        });

        jodit.e.on('beforeDestruct.emsTableCellHist', () => {
            root.removeEventListener('keydown', onPreEdit, true);
            root.removeEventListener('beforeinput', onPreEdit, true);
            root.removeEventListener('input', onPostEdit, true);
        });
    };

    jodit.e.on('afterInit.emsTableCellHist', attach);
    jodit.e.on('focus.emsTableCellHist', attach);
    jodit.e.on('afterSetMode.emsTableCellHist', attach);
    attach();
}

/** Belt-and-suspenders: ignore stray change events while paste formatting runs. */
export function bindOfficePasteHistoryGuard(jodit) {
    if (!jodit?.history || jodit.__emsOfficePasteHistGuard) return;
    jodit.__emsOfficePasteHistGuard = true;
    const history = jodit.history;
    const original = history.__processChanges?.bind(history);
    if (!original) return;
    history.__processChanges = function emsOfficePasteHistoryGuard() {
        if (isOfficePasteHistoryPaused(jodit)) return;
        if ((jodit.__emsOfficePasteSnapshotBlockDepth || 0) > 0) return;
        return original();
    };
}

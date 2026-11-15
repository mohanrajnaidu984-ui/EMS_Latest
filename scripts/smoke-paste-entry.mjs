/**
 * Esbuild entry for paste/history export smoke (not shipped).
 */
export {
  captureDocumentHistoryBeforeMutation,
  commitDocumentHistoryAfterMutation,
  tryDocumentHistoryUndo,
  tryDocumentHistoryRedo,
  canEmsDocumentHistoryUndo,
  canEmsDocumentHistoryRedo,
} from '../src/components/Quote/clauseEditorDocHistory.js';
export {
  installClauseEditorUndoHooks,
  bindClauseEditorUndoHotkeys,
  bindTableCellHistoryRecorder,
  beginOfficePastePostProcess,
  checkpointHistoryAfterOfficePaste,
  canEmsDocumentHistoryUndo as canDocUndoFromHistory,
  canEmsDocumentHistoryRedo as canDocRedoFromHistory,
} from '../src/components/Quote/clauseEditorTableHistory.js';
export {
  pasteClipboardIntoActiveTableCell,
  pasteClipboardTableIntoActiveTable,
  prepareDocumentTablePaste,
  readTableClipboardText,
  restoreInternalClipboardTablesInRoot,
  restoreInternalClipboardTableLayout,
  registerClauseEditorTableHooks,
} from '../src/components/Quote/clauseEditorTable.js';

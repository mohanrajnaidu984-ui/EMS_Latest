import {describe,it,expect} from 'vitest';
import {captureDocumentHistoryBeforeMutation as before,commitDocumentHistoryAfterMutation as commit,tryDocumentHistoryUndo as undo,tryDocumentHistoryRedo as redo,canEmsDocumentHistoryRedo} from '../clauseEditorDocHistory';
function editor(html){const root=document.createElement('div');root.contentEditable='true';root.innerHTML=html;document.body.append(root);return {editor:root,synchronizeValues(){},e:{fire(){}},history:{snapshot:{transaction:fn=>fn()}}};}
function edit(j,html){before(j);j.editor.innerHTML=html;commit(j);}
describe('chronological clause document history',()=>{
 it('restores an empty editor and undoing a deletion to empty',()=>{const j=editor('');edit(j,'<p>Text</p>');expect(undo(j)).toBe(true);expect(j.editor.innerHTML).toBe('');expect(redo(j)).toBe(true);edit(j,'');expect(undo(j)).toBe(true);expect(j.editor.innerHTML).toBe('<p>Text</p>');j.editor.remove();});
 it('undoes table mutation, text, and format in chronological order and invalidates redo after a branch',()=>{const j=editor('<p>A</p>');edit(j,'<p>A</p><table><tbody><tr><td>One</td></tr></tbody></table>');const table=j.editor.innerHTML;edit(j,table+'<p>B</p>');edit(j,table+'<p><strong>B</strong></p>');undo(j);expect(j.editor.innerHTML).toBe(table+'<p>B</p>');undo(j);expect(j.editor.innerHTML).toBe(table);undo(j);expect(j.editor.innerHTML).toBe('<p>A</p>');redo(j);expect(j.editor.innerHTML).toBe(table);edit(j,table+'<p>C</p>');expect(canEmsDocumentHistoryRedo(j)).toBe(false);j.editor.remove();});
 it('does not create a phantom step for unchanged content',()=>{const j=editor('<p>A</p>');before(j);expect(commit(j)).toBe(false);expect(undo(j)).toBe(false);j.editor.remove();});
});

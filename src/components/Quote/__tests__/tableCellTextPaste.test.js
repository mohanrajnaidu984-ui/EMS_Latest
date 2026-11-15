import { afterEach, describe, expect, it, vi } from 'vitest';
import { pasteClipboardIntoActiveTableCell } from '../clauseEditorTable.js';
afterEach(() => { document.body.innerHTML = ''; window.getSelection().removeAllRanges(); });
function fixture() {
    const root = document.createElement('div'); root.contentEditable = 'true';
    root.innerHTML = '<table><tbody><tr><td>Source text</td><td>95.000</td></tr><tr><td>Existing description </td><td>285.000</td></tr><tr><td>Third row unchanged</td><td>410.000</td></tr></tbody></table>';
    document.body.append(root);
    const cell = root.querySelectorAll('tr')[1].cells[0];
    const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
    window.getSelection().addRange(range);
    const jodit = { editor: root, e: { fire: vi.fn() }, synchronizeValues: vi.fn() };
    return { root, cell, jodit };
}
const clipboard = (plain, html = '') => ({ getData: type => type === 'text/html' ? html : plain });
describe('table cell text paste', () => {
    it('appends all multiline text without overwriting this cell or following rows', () => {
        const { root, cell, jodit } = fixture();
        const originalOtherRows = [root.querySelectorAll('tr')[0].innerHTML, root.querySelectorAll('tr')[2].innerHTML];
        expect(pasteClipboardIntoActiveTableCell(jodit, () => root, clipboard('Modulating Non-Spring\nReturn Electric Gear Actuators (AME 110NLX)'), cell)).toBe(true);
        expect(cell.textContent).toBe('Existing description Modulating Non-SpringReturn Electric Gear Actuators (AME 110NLX)');
        expect(cell.querySelectorAll('br')).toHaveLength(1);
        expect(root.querySelectorAll('tr')[0].innerHTML).toBe(originalOtherRows[0]);
        expect(root.querySelectorAll('tr')[2].innerHTML).toBe(originalOtherRows[1]);
        expect(cell.nextElementSibling.textContent).toBe('285.000');
    });
    it('replaces only the selected destination text', () => {
        const { root, cell, jodit } = fixture();
        const range = document.createRange(); range.setStart(cell.firstChild, 0); range.setEnd(cell.firstChild, 8);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
        expect(pasteClipboardIntoActiveTableCell(jodit, () => root, clipboard('New\nformatted'), cell)).toBe(true);
        expect(cell.textContent).toBe('Newformatted description ');
        expect(root.querySelectorAll('tr')[2].cells[0].textContent).toBe('Third row unchanged');
    });
    it('keeps real tabular clipboard paste working', () => {
        const { root, cell, jodit } = fixture();
        expect(pasteClipboardIntoActiveTableCell(jodit, () => root, clipboard('Description\t100\nNext row\t200'), cell)).toBe(true);
        expect(cell.textContent).toBe('Description');
        expect(cell.nextElementSibling.textContent).toBe('100');
        expect(root.querySelectorAll('tr')[2].cells[0].textContent).toBe('Next row');
    });
});

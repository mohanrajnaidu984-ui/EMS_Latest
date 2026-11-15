import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AddendumBlock from '../AddendumBlock.jsx';
import { removeUnsavedAddendum } from '../removeUnsavedAddendum.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.innerHTML = ''; });

describe('addendum attachments', () => {
    it('allows an unsaved block to be removed when its remove action is provided', () => {
        const host = document.createElement('div'); document.body.append(host);
        const onRemove = vi.fn();
        root = createRoot(host);
        act(() => root.render(React.createElement(AddendumBlock, { addendum: { AddendumNo: 1, Details: '' }, onRemove, renderList: () => null })));
        act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Remove Addendum').click());
        expect(onRemove).toHaveBeenCalledOnce();
    });
    it('removes draft attachments and renumbers remaining drafts without changing saved addendums', () => {
        const rows = [1,2,3,4].map(n => ({ AddendumNo: n, Details: `Details ${n}`, draftId: `id-${n}` }));
        const files = [{ id: 'base' }, { id: 'saved', addendumNo: 1 }, { id: 'removed', addendumNo: 2 }, { id: 'remaining', addendumNo: 4 }];
        const result = removeUnsavedAddendum(rows, files, [1], 2);
        expect(result.addendums.map(a => a.AddendumNo)).toEqual([1,2,3]);
        expect(result.addendums[1].Details).toBe('Details 3');
        expect(result.addendums[1].draftId).toBe('id-3');
        expect(result.removedFiles.map(f => f.id)).toEqual(['removed']);
        expect(result.pendingFiles).toEqual([{ id: 'base' }, { id: 'saved', addendumNo: 1 }, { id: 'remaining', addendumNo: 3 }]);
        expect(removeUnsavedAddendum(rows, files, [1], 1)).toBeNull();
    });
    it('offers separate public/private file, folder and link controls for its number', () => {
        const host = document.createElement('div'); document.body.append(host);
        const onLinks = vi.fn();
        root = createRoot(host);
        act(() => root.render(React.createElement(AddendumBlock, { addendum: { AddendumNo: 2, Details: 'Extra floor' }, onDetails: vi.fn(), onFiles: vi.fn(), onLinks, renderList: () => null })));
        expect(host.textContent).toContain('Addendum-2');
        expect(host.querySelector('#addendum-details-2').value).toBe('Extra floor');
        expect(host.querySelector('#addendum-details-2').required).toBe(true);
        expect(host.textContent).toContain('Details of this Addendum');
        expect(host.querySelectorAll('input[type=file]')).toHaveLength(4);
        expect(host.querySelectorAll('input[webkitdirectory]')).toHaveLength(2);
        expect(host.querySelectorAll('input[multiple]')).toHaveLength(2);
        expect(host.textContent).toContain('Saved attachments cannot be deleted');
        expect([...host.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
    });
    it('marks blank details as invalid when a required error is provided', () => {
        const host = document.createElement('div'); document.body.append(host);
        root = createRoot(host);
        act(() => root.render(React.createElement(AddendumBlock, {
            addendum: { AddendumNo: 3, Details: '' },
            detailsError: 'Required',
            onDetails: vi.fn(),
            renderList: () => null,
        })));
        expect(host.querySelector('#addendum-details-3').classList.contains('is-invalid')).toBe(true);
        expect(host.textContent).toContain('Required');
    });
    it('disables editing and uploading when the enquiry cannot be edited', () => {
        const host = document.createElement('div'); document.body.append(host);
        root = createRoot(host);
        act(() => root.render(React.createElement(AddendumBlock, { addendum: { AddendumNo: 1, Details: 'Saved' }, disabled: true, renderList: () => null })));
        expect([...host.querySelectorAll('input,textarea,button')].every(el => el.disabled)).toBe(true);
    });
});

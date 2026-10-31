import { describe, it, expect } from 'vitest';
import { splitClauseHtmlToSegments, softSplitOversizedUnitHtml, mergeSegmentsIntoSheetBlocks, trimTrailingBlankParts, trimDocumentTrailingBlankSegments } from '../quoteClausePagination.js';

describe('pagination content preservation', () => {
    it('keeps explicit middle blank lines but does not start continuation pages with carried spacer units', () => {
        const segments=[{html:'<p>First</p>',showHeading:true,clauseIdx:0,clause:{listKey:'text'}},
            {html:'<p><br></p>',clauseIdx:0,clause:{listKey:'text'}},
            {html:'<p>&nbsp;</p>',clauseIdx:0,clause:{listKey:'text'}},
            {html:'<p>Next</p>',clauseIdx:0,clause:{listKey:'text'}}];
        expect(mergeSegmentsIntoSheetBlocks([0,1,2,3],segments)[0].bodyHtml).toContain('<br>');
        const continuation=mergeSegmentsIntoSheetBlocks([1,2,3],segments)[0].bodyHtml;
        expect(continuation).toContain('Next');expect(continuation).not.toContain('<br>');
        expect(continuation).not.toContain('&nbsp;');
    });
    it('ignores whitespace-only Word P artifacts but preserves deliberate blank lines and sized spacers', () => {
        const html='<p>First</p><p>\n\n  </p><p style="height:auto;white-space:normal">\n </p><p><br></p><p>&nbsp;</p><p style="height:80px"></p><p>Last</p>';
        const parts=splitClauseHtmlToSegments(html,{splitParagraphs:true});
        expect(parts).toHaveLength(5);
        expect(parts.join('')).toContain('<br>');expect(parts.join('')).toContain('&nbsp;');
        expect(parts.join('')).toContain('height:80px');
    });
    it('drops only document-end spacer units, retaining middle spacing and final meaningful content', () => {
        const body = [{html:'<p>First</p>',showHeading:true}, {html:'<p><br></p>'},
            {html:'<p>Last paragraph</p>'}];
        const tails = Array.from({length:100},()=>({html:'<p><br></p>'}));
        expect(trimDocumentTrailingBlankSegments([...body,...tails,{html:'<p style="break-after:page"><br></p>'}])).toEqual(body);
        for (const html of ['<table><tr><td></td></tr></table>','<img src="/logo.png">']) {
            expect(trimDocumentTrailingBlankSegments([...body,{html},...tails])).toEqual([...body,{html}]);
        }
        expect(trimDocumentTrailingBlankSegments([...body,{html:'<p><br></p>',showHeading:true}])).toHaveLength(4);
    });
    it('flows a long borderless numbered Word row without losing text, labels, formatting or segment identity', () => {
        const paragraph = 'The quantities are based on the design and must retain every word. '.repeat(12);
        const html = `<table data-ems-table-border="none" data-ems-paste-source="office" data-ems-col-widths="49,67,533" data-ems-row-heights="420,25" data-ems-row-heights-custom="1"><colgroup><col width="49"><col width="67"><col width="533"></colgroup><tbody><tr height="420"><td>3.01</td><td>General</td><td style="height:420px;max-height:420px;overflow:hidden"><font color="blue">${paragraph}<br><br><p><strong>${paragraph}</strong></p>${paragraph}<br></font></td></tr><tr><td>3.02</td><td>Ground</td><td>Final row.</td></tr></tbody></table>`;
        const parts = splitClauseHtmlToSegments(html, { splitTableMinRows: 1 });
        expect(parts.length).toBeGreaterThan(3);
        const segments = parts.map((part, i) => ({ html: part, clauseIdx: 0,
            clause: { listKey: 'assumptions' }, showHeading: i === 0, key: `row${i}` }));
        const joined = mergeSegmentsIntoSheetBlocks(segments.map((_, i) => i), segments)[0].bodyHtml;
        const root = document.createElement('div'); root.innerHTML = joined;
        const original = document.createElement('div'); original.innerHTML = html;
        expect(root.textContent).toBe(original.textContent);
        expect([...root.querySelectorAll('[data-ems-pack-seg]')].map(n => Number(n.dataset.emsPackSeg)))
            .toEqual(segments.map((_, i) => i));
        expect(root.querySelectorAll('tr')).toHaveLength(2);
        expect(root.querySelectorAll('strong').length).toBeGreaterThan(0);
        expect(root.querySelector('table[data-ems-col-widths="49,67,533"]')).not.toBeNull();
        expect(parts.filter(p => p.includes('data-ems-prose-row')).every(p => !p.includes('420'))).toBe(true);
        // Ordinary BOQ item rows must remain atomic, even when a description is long.
        const boq = html.replace('data-ems-table-border="none"', 'data-ems-table-border="all"');
        expect(splitClauseHtmlToSegments(boq, { splitTableMinRows: 1 })).toHaveLength(2);
    });
    it('trims a lone empty clause tail but keeps intentional multi-blank gaps, images, tables and page breaks', () => {
        /* Single trailing blank = editor noise */
        expect(trimTrailingBlankParts(['<p>text</p>', '<p><br></p>'])).toEqual(['<p>text</p>']);
        expect(trimTrailingBlankParts(['<p>text</p>', '<p>&nbsp;</p>'])).toEqual(['<p>text</p>']);
        /* Two or more trailing blanks = user-created vertical space — retain in normal mode */
        expect(trimTrailingBlankParts(['<p>text</p>', '<p>&nbsp;</p>', '<p>\ufeff<br></p>'])).toEqual([
            '<p>text</p>',
            '<p>&nbsp;</p>',
            '<p>\ufeff<br></p>',
        ]);
        expect(trimTrailingBlankParts(['<p>text</p>', '<p><br></p>', '<p><br></p>', '<p><br></p>'])).toEqual([
            '<p>text</p>',
            '<p><br></p>',
            '<p><br></p>',
            '<p><br></p>',
        ]);
        for (const meaningful of ['<p><img src="/logo.png"></p>', '<table><tr><td></td></tr></table>', '<p style="break-after:page"><br></p>']) {
            expect(trimTrailingBlankParts(['<p>text</p>', meaningful, '<p><br></p>'])).toEqual(['<p>text</p>', meaningful]);
        }
    });
    it('keeps a mid-clause blank line the user inserted between paragraphs', () => {
        const parts = splitClauseHtmlToSegments(
            '<p>first</p><p><br></p><p>second</p>',
            { splitParagraphs: true }
        );
        expect(parts.some((p) => /<br/i.test(p) && !/first|second/i.test(p))).toBe(true);
        expect(parts.join('')).toContain('first');
        expect(parts.join('')).toContain('second');
    });
    it('does not truncate a table when soft splitting produces more than maxParts', () => {
        const rows = Array.from({ length: 30 }, (_, i) => `<tr><td>ROW_${i}</td></tr>`).join('');
        const parts = softSplitOversizedUnitHtml(`<table><tbody>${rows}</tbody></table>`, { maxParts: 3 });
        for (let i = 0; i < 30; i++) expect(parts.join('')).toContain(`ROW_${i}<`);
    });

    it('retains inline formatting, literal symbols and every fragment stamp after rejoining prose', () => {
        const words = Array.from({ length: 180 }, (_, i) => `word${i}`).join(' ');
        const html = `<p><strong>${words.slice(0, 400)}</strong><a href="/terms">${words.slice(400)}</a> &lt;limit &amp; value</p>`;
        const parts = splitClauseHtmlToSegments(html, { splitParagraphs: true, splitListsPerItem: true });
        expect(parts.length).toBeGreaterThan(1);
        const segments = parts.map((part, i) => ({ html: part, clauseIdx: 0, clause: { listKey: 'terms' }, showHeading: i === 0, key: `p${i}` }));
        const joined = mergeSegmentsIntoSheetBlocks(segments.map((_, i) => i), segments)[0].bodyHtml;
        const root = document.createElement('div');
        root.innerHTML = joined;
        const original = document.createElement('div');
        original.innerHTML = html;
        expect(root.textContent).toBe(original.textContent);
        expect(root.querySelector('strong')).not.toBeNull();
        expect(root.querySelector('a')?.getAttribute('href')).toBe('/terms');
        expect([...root.querySelectorAll('[data-ems-pack-seg]')].map(n => Number(n.dataset.emsPackSeg))).toEqual(segments.map((_, i) => i));
    });
});

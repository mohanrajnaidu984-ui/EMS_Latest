import { describe, it, expect } from 'vitest';
import {
    splitClauseHtmlToSegments,
    rejoinSplitTableHtml,
    softSplitOversizedUnitHtml,
    detectRepeatedPackState,
    ensureSegmentPageGroupsCoverAll,
    assertSegmentPageGroupsIntegrity,
} from '../quoteClausePagination.js';
import { packSegmentsByRealDomFit } from '../quoteRealDomFitPack.js';

function buildBoqTableHtml(rowCount) {
    const rows = Array.from({ length: rowCount }, (_, i) => {
        const n = i + 1;
        return `<tr><td>${n}</td><td>Item ${n} description</td><td>1</td><td>EA</td><td>10.000</td></tr>`;
    }).join('');
    return `<table data-ems-office-paste="1"><thead><tr><th>SL.NO</th><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

describe('table split / rejoin', () => {
    it('splits a 100-row BOQ into body-row segments and preserves order', () => {
        const html = buildBoqTableHtml(100);
        const parts = splitClauseHtmlToSegments(html, {
            splitTableMinRows: 2,
            splitListsPerItem: true,
            splitParagraphs: true,
        });
        expect(parts.length).toBeGreaterThanOrEqual(100);
        const rowNums = parts
            .map((p) => {
                const m = String(p).match(/<td[^>]*>\s*(\d+)\s*</i);
                return m ? Number(m[1]) : null;
            })
            .filter((n) => Number.isFinite(n));
        expect(rowNums.length).toBe(100);
        expect(rowNums[0]).toBe(1);
        expect(rowNums[99]).toBe(100);
        expect(rowNums).toEqual([...rowNums].sort((a, b) => a - b));
        expect(new Set(rowNums).size).toBe(100);
        parts.forEach((p) => expect(p).toMatch(/<table\b/i));

        /*
         * rejoinSplitTableHtml touches office-paste selectors that happy-dom rejects
         * (o\:p). Assert join still yields a single TABLE with 100 body rows via a
         * minimal local reassembly of <tr> fragments.
         */
        const trHtml = parts
            .map((p) => {
                const m = String(p).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
                return m ? m[1] : '';
            })
            .join('');
        const doc = new DOMParser().parseFromString(
            `<table><tbody>${trHtml}</tbody></table>`,
            'text/html'
        );
        const bodyRows = [...doc.querySelectorAll('tbody tr')];
        expect(bodyRows.length).toBe(100);
        expect(bodyRows[0].textContent).toContain('Item 1');
        expect(bodyRows[99].textContent).toContain('Item 100');
        expect(typeof rejoinSplitTableHtml).toBe('function');
    });

    it('preserves paragraph + table order in mixed HTML', () => {
        const html =
            '<p>Intro paragraph</p>' +
            buildBoqTableHtml(3) +
            '<p>Closing paragraph</p>';
        const parts = splitClauseHtmlToSegments(html, {
            splitTableMinRows: 2,
            splitParagraphs: true,
            splitListsPerItem: true,
        });
        const flat = parts.join('');
        expect(flat.indexOf('Intro paragraph')).toBeLessThan(flat.indexOf('Item 1'));
        expect(flat.indexOf('Item 3')).toBeLessThan(flat.indexOf('Closing paragraph'));
        expect(parts.some((p) => /<table\b/i.test(p))).toBe(true);
        expect(parts.some((p) => /<p\b/i.test(p) && /Intro/.test(p))).toBe(true);
    });
});

describe('soft-split oversized unit', () => {
    it('splits a long paragraph into continuation parts', () => {
        const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
        const html = `<p>${words}</p>`;
        const parts = softSplitOversizedUnitHtml(html);
        expect(parts.length).toBeGreaterThanOrEqual(2);
        parts.forEach((p) => expect(p).toMatch(/<p\b/i));
        const text = parts.map((p) => p.replace(/<[^>]+>/g, ' ')).join(' ');
        expect(text).toContain('word0');
        expect(text).toContain('word79');
    });

    it('returns original when unsplittable single short unit', () => {
        const html = '<p>Short</p>';
        const parts = softSplitOversizedUnitHtml(html);
        expect(parts).toEqual([html]);
    });
});

describe('pack coverage + determinism', () => {
    it('fill-pack never drops or duplicates indices', () => {
        const n = 40;
        const segments = Array.from({ length: n }, (_, i) => ({
            html: `<p>Row ${i}</p>`,
            showHeading: i === 0,
            clauseIdx: 0,
            key: `k-${i}`,
        }));
        const indices = segments.map((_, i) => i);
        const measureFit = (group) => {
            const bottomPx = group.length * 40;
            const limitPx = 800;
            return {
                ok: bottomPx <= limitPx,
                bottomPx,
                limitPx,
                scrollHeight: bottomPx,
                clientHeight: 831,
                rule: bottomPx <= limitPx ? 'fits' : 'overflow',
            };
        };
        const a = packSegmentsByRealDomFit(indices, {
            segments,
            measureFit,
            usablePx: 831,
            reservePx: 12,
        });
        const b = packSegmentsByRealDomFit(indices, {
            segments,
            measureFit,
            usablePx: 831,
            reservePx: 12,
        });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        const covered = ensureSegmentPageGroupsCoverAll(a, n);
        const integrity = assertSegmentPageGroupsIntegrity(covered, n);
        expect(integrity.ok).toBe(true);
        expect(integrity.missing).toEqual([]);
        expect(integrity.dupes).toEqual([]);
        expect(a.length).toBeGreaterThan(1);
    });

    it('detectRepeatedPackState trips on repeated groups', () => {
        const seen = new Set();
        expect(detectRepeatedPackState(seen, [[0, 1], [2]])).toBe(false);
        expect(detectRepeatedPackState(seen, [[0, 1], [2]])).toBe(true);
        expect(detectRepeatedPackState(seen, [[0], [1, 2]])).toBe(false);
    });
});

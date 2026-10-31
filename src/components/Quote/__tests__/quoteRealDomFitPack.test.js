import { describe, it, expect } from 'vitest';
import { packSegmentsByRealDomFit } from '../quoteRealDomFitPack.js';

describe('packSegmentsByRealDomFit', () => {
    it('keeps a heading with its first paragraph without requiring a second whole paragraph', () => {
        const segments=[{html:'<p><br></p>',showHeading:true,clauseIdx:0},
            {html:'<p>First paragraph</p>',clauseIdx:0},{html:'<p>Second paragraph</p>',clauseIdx:0}];
        const heights=[25,120,120];
        const groups=packSegmentsByRealDomFit([0,1,2],{segments,usablePx:200,reservePx:0,
            measureFit:group=>{const bottomPx=group.reduce((n,i)=>n+heights[i],0);return {ok:bottomPx<=200,bottomPx,limitPx:200};}});
        expect(groups).toEqual([[0,1],[2]]);
    });
    it('preserves coverage, order, fit and heading attachment across varied documents and page orientations', () => {
        let seed=9173;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
        for(let sample=0;sample<100;sample++){
            const segments=[];const heights=[];
            for(let clause=0;clause<8;clause++){
                segments.push({html:'<p><br></p>',showHeading:true,clauseIdx:clause});heights.push(25);
                const blanks=Math.floor(random()*4);
                for(let i=0;i<blanks;i++){segments.push({html:'<p><br></p>',clauseIdx:clause});heights.push(10);}
                const count=2+Math.floor(random()*9);
                for(let i=0;i<count;i++){segments.push({html:`<p>clause ${clause} paragraph ${i}</p>`,clauseIdx:clause});heights.push(20+Math.floor(random()*120));}
            }
            const capacity=page=>page%3===1?300:600;
            const groups=packSegmentsByRealDomFit(segments.map((_,i)=>i),{segments,usablePx:600,reservePx:0,
                measureFit:(group,page)=>{const bottomPx=group.reduce((n,i)=>n+heights[i],0);return {ok:bottomPx<=capacity(page),bottomPx,limitPx:capacity(page)};}});
            expect(groups.flat()).toEqual(segments.map((_,i)=>i));
            groups.forEach((group,page)=>{
                expect(group.reduce((n,i)=>n+heights[i],0)).toBeLessThanOrEqual(capacity(page));
                for(const id of group.filter(i=>segments[i].showHeading)){
                    let body=id+1;while(/<br>/.test(segments[body].html))body++;
                    expect(group).toContain(body);
                }
            });
        }
    });
    it('does not strand a heading before multiple empty Word paragraphs, including during fill-up', () => {
        const segments = [
            {html:'<p>Previous clause</p>',clauseIdx:0},
            {html:'<p>\n</p>',showHeading:true,clauseIdx:1},
            {html:'<p>\n\n</p>',clauseIdx:1},
            {html:'<p><br></p>',clauseIdx:1},
            {html:'<p>First real paragraph of assumptions.</p>',clauseIdx:1},
            {html:'<p>Second real paragraph of assumptions.</p>',clauseIdx:1},
        ];
        const heights = [290,30,10,10,100,100];
        const groups = packSegmentsByRealDomFit(segments.map((_,i)=>i), {
            segments, usablePx:400, reservePx:0,
            measureFit: group => {const bottomPx=group.reduce((n,i)=>n+heights[i],0);
                return {ok:bottomPx<=400,bottomPx,limitPx:400};},
        });
        expect(groups.flat()).toEqual([0,1,2,3,4,5]);
        const headingPage=groups.findIndex(group=>group.includes(1));
        expect(groups[headingPage]).toContain(4);
    });
    it('packs a large BOQ without measuring every growing row prefix', () => {
        const segments = Array.from({ length: 2048 }, (_, i) => ({
            html: `<p>BOQ item ${i}</p>`, clauseIdx: 0, showHeading: false,
        }));
        const indices = segments.map((_, i) => i);
        let measurements = 0;
        const groups = packSegmentsByRealDomFit(indices, {
            segments, usablePx: 652, reservePx: 12,
            measureFit: group => {
                measurements++;
                return { ok: group.length <= 64, bottomPx: group.length * 10, limitPx: 640 };
            },
        });
        expect(groups.flat()).toEqual(indices);
        expect(groups).toHaveLength(32);
        expect(groups.every(group => group.length === 64)).toBe(true);
        expect(measurements).toBeLessThan(1024);
    });
    it('binary verify-down peels oversized prefixes and fill-up reclaims trailing empties', () => {
        /* Synthetic heights: units 0..9 are 100px; usable 350 → ~3/page before safety. */
        const heights = Array.from({ length: 10 }, () => 100);
        const segments = heights.map((_, i) => ({
            html: `<p>u${i}</p>`,
            showHeading: false,
            clauseIdx: 0,
            key: `u${i}`,
        }));
        const usablePx = 350;
        const reservePx = 12;
        const limit = usablePx - reservePx;

        const measureFit = (groupIndices) => {
            const bottomPx = groupIndices.reduce((s, i) => s + heights[i], 0);
            return {
                ok: bottomPx <= limit + 0.5,
                bottomPx,
                limitPx: limit,
                scrollHeight: bottomPx,
                clientHeight: usablePx,
                rule: bottomPx <= limit + 0.5 ? 'fits' : 'overflow',
            };
        };

        const groups = packSegmentsByRealDomFit(
            segments.map((_, i) => i),
            { segments, measureFit, usablePx, reservePx }
        );

        expect(groups.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const g of groups) {
            const h = g.reduce((s, i) => s + heights[i], 0);
            expect(h).toBeLessThanOrEqual(limit + 0.5);
            /* No tiny leftover pages of a single 100px unit when prior page had room —
             * with limit 338, 3×100=300 fits, 4×100=400 does not → exactly 3 per full page. */
            expect(g.length).toBeGreaterThanOrEqual(1);
        }
        /* 10 units / 3 per page → 4 pages (3+3+3+1), last may be short — that is OK. */
        expect(groups.length).toBe(4);
        expect(groups[0].length).toBe(3);
        expect(groups[1].length).toBe(3);
        expect(groups[2].length).toBe(3);
        expect(groups[3].length).toBe(1);
    });

    it('keeps heading-only with following unit when both fit', () => {
        const segments = [
            { html: '', showHeading: true, clauseIdx: 0, key: 'h' },
            { html: '<p>body</p>', showHeading: false, clauseIdx: 0, key: 'b' },
            { html: '<p>next</p>', showHeading: false, clauseIdx: 0, key: 'n' },
        ];
        const heights = [20, 100, 100];
        const usablePx = 350;
        const reservePx = 12;
        const limit = usablePx - reservePx;
        const measureFit = (groupIndices) => {
            const bottomPx = groupIndices.reduce((s, i) => s + heights[i], 0);
            return {
                ok: bottomPx <= limit + 0.5,
                bottomPx,
                limitPx: limit,
                scrollHeight: bottomPx,
                clientHeight: usablePx,
            };
        };
        const groups = packSegmentsByRealDomFit([0, 1, 2], {
            segments,
            measureFit,
            usablePx,
            reservePx,
        });
        expect(groups[0][0]).toBe(0);
        expect(groups[0]).toContain(1);
    });
});

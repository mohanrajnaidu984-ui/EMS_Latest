import { describe, expect, it } from 'vitest';
import { summarizeHeaderSales, formatHeaderSalesAmount, buildHeaderSalesFrames, achievementDirection, formatTopDivisionAmount } from '../headerSalesSummaryTotals';

describe('header annual Sales Report totals', () => {
    it('formats booked division values with one decimal place', () => {
        expect(formatTopDivisionAmount(5400000)).toBe('5.4M');
        expect(formatTopDivisionAmount(5538083.39)).toBe('5.5M');
        expect(formatTopDivisionAmount(98750)).toBe('98.8k');
    });
    it.each([[101,100,'↑'],[99,100,'↓'],[100,100,'='],[100,0,''],[100.001,100,'↑']])(
        'compares exact actual %s against target %s', (actual,target,direction) => {
            expect(achievementDirection({actual,target})).toBe(direction);
        }
    );
    it.each([['2026-01-01T00:00:00Z', 1], ['2026-04-01T00:00:00Z', 2],
        ['2026-07-01T00:00:00Z', 3], ['2026-11-11T00:00:00Z', 4],
        ['2026-03-31T21:30:00Z', 2]])('includes only quarters reached in Riyadh on %s', (date, quarters) => {
        const frames = buildHeaderSalesFrames({}, new Date(date));
        expect(frames.map(frame => frame.label)).toEqual(['Total', ...Array.from({ length: quarters }, (_, i) => `Q${i + 1}`)]);
    });
    it('keeps quarterly figures separate while Total includes the whole annual target', () => {
        const frames = buildHeaderSalesFrames({ targetVsActual: [{ name: 'Q1', actual: 30, target: 100 }, { name: 'Q2', actual: 40, target: 200 }],
            grossMarginTargetVsActual: [{ name: 'Q1', actual: 3, target: 10 }, { name: 'Q2', actual: 8, target: 20 }] }, new Date('2026-04-01T00:00:00Z'));
        expect(frames[0].booking).toEqual({ actual: 70, target: 300, percent: 23 });
        expect(frames[1].booking).toEqual({ actual: 30, target: 100, percent: 30 });
        expect(frames[2].gp).toEqual({ actual: 8, target: 20, percent: 40 });
    });
    it('uses summed actual and target values rather than averaging quarterly achievement percentages', () => {
        const totals = summarizeHeaderSales({
            targetVsActual: [{ actual: 6540000, target: 3500000 }, { actual: 1150000, target: 3700000 },
                { actual: 3020000, target: 4750000 }, { actual: 850410, target: 5650000 }],
            grossMarginTargetVsActual: [{ actual: 498890, target: 395880 }, { actual: 119160, target: 413880 },
                { actual: 317150, target: 507130 }, { actual: 83270, target: 588880 }],
        });
        expect(totals.booking).toEqual({ actual: 11560410, target: 17600000, percent: 66 });
        expect(totals.gp).toEqual({ actual: 1018470, target: 1905770, percent: 53 });
    });
    it('does not report infinite achievement when no target is set', () => {
        expect(summarizeHeaderSales({ targetVsActual: [{ actual: 100, target: 0 }] }).booking)
            .toEqual({ actual: 100, target: 0, percent: null });
    });
    it('handles numeric database strings and zero achievement', () => {
        expect(summarizeHeaderSales({ targetVsActual: [{ actual: '0', target: '1000' }] }).booking)
            .toEqual({ actual: 0, target: 1000, percent: 0 });
        expect(formatHeaderSalesAmount(11560410)).toBe('11.56M');
        expect(formatHeaderSalesAmount(83270)).toBe('83.27k');
    });
});

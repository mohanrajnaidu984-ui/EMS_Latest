import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as currency from '../../../utils/currency.js';
import * as options from '../pricingOptionTables.js';
import * as theme from '../../../constants/emsTheme.js';

// Exercise the production DOM helpers without mounting the entire quote form.
const source = readFileSync('src/components/Quote/QuoteForm.jsx', 'utf8');
const functions = new Map([...source.matchAll(/^function (\w+)\([^]*?^}/gm)]
    .map(match => [match[1], match[0]]));
const names = ['patchPricingTableFooterDom', 'removeDiscountBlockFromPricingTable',
    'pricingTableHasDiscountBlock', 'parseDiscountAmountFromPricingTable', 'insertDiscountBlockIntoPricingTable'];
const selected = new Set();
function include(name) {
    if (selected.has(name)) return;
    selected.add(name);
    const body = functions.get(name);
    if (!body) throw new Error(`Missing pricing helper ${name}`);
    for (const dependency of functions.keys()) {
        if (new RegExp(`\\b${dependency}\\s*\\(`).test(body)) include(dependency);
    }
}
names.forEach(include);
const constants = [...source.matchAll(/^const (EMS_PRICING_\w+|EMS_CUR_TOKEN_RE)\s*=[^]*?;/gm)]
    .map(match => match[0]).join('\n');
const bindings = { ...currency, ...options, ...theme };
const pricing = new Function(...Object.keys(bindings), `${constants}\n${[...selected]
    .map(name => functions.get(name)).join('\n')}\nreturn {${names.join(',')}};`)(...Object.values(bindings));

function table(base = 1100, discount = null, columns = 2) {
    const doc = new DOMParser().parseFromString(`<table data-ems-pricing-cols="fixed">
        <thead><tr>${Array.from({ length: columns }, (_, i) => `<th>${i ? 'Amount' : 'Description'}</th>`).join('')}</tr></thead>
        <tbody><tr><td>Base Price</td><td>BHD ${base.toFixed(3)}</td></tr>
        <tr data-ems-row="total"><td>Total</td><td>BHD ${base.toFixed(3)}</td></tr>
        ${discount == null ? '' : `<tr data-ems-row="discount"><td>Discount (${discount}%)</td><td>-BHD ${(base * discount / 100).toFixed(3)}</td></tr>
        <tr data-ems-row="final-discounted"><td>Final Discounted Price</td><td>0</td></tr>`}
        <tr data-ems-row="vat"><td>VAT 10%</td><td>BHD 0.000</td></tr>
        <tr data-ems-row="grand-vat"><td>Grand Total with VAT 10%</td><td>0</td></tr></tbody></table>`, 'text/html');
    return doc.querySelector('table');
}
const amount = (t, kind) => currency.parseCurrencyAmount(t.querySelector(`[data-ems-row="${kind}"]`).lastElementChild.textContent);
const patch = (t, base) => pricing.patchPricingTableFooterDom(t, base);

describe('quote discount and VAT calculations', () => {
    it('repairs hidden stale discounts on both screenshot price tables', () => {
        for (const [base, stale, vat, grand] of [[1100, 120, 110, 1210], [1330, 80, 133, 1463]]) {
            const t = table(base);
            t.setAttribute('data-ems-pricing-discount-total', stale);
            t.setAttribute('data-ems-discount-amount', stale);
            t.setAttribute('data-ems-discount-pct', '10');
            patch(t, base);
            expect(pricing.pricingTableHasDiscountBlock(t)).toBe(false);
            expect(amount(t, 'total')).toBe(base);
            expect(amount(t, 'vat')).toBe(vat);
            expect(amount(t, 'grand-vat')).toBe(grand);
        }
    });

    it.each([2, 5])('calculates independent base and option discounts with %s columns', columns => {
        for (const [base, pct, net, vat, grand] of [[1100, 10, 990, 99, 1089], [1330, 5, 1263.5, 126.35, 1389.85]]) {
            const t = table(base, pct, columns);
            patch(t, base);
            expect(amount(t, 'final-discounted')).toBe(net);
            expect(amount(t, 'vat')).toBe(vat);
            expect(amount(t, 'grand-vat')).toBe(grand);
            pricing.removeDiscountBlockFromPricingTable(t);
            expect(pricing.pricingTableHasDiscountBlock(t)).toBe(false);
            expect(amount(t, 'vat')).toBe(base / 10);
            expect(amount(t, 'grand-vat')).toBeCloseTo(base * 1.1, 3);
            expect(pricing.insertDiscountBlockIntoPricingTable(t)).toBe(true);
            patch(t, base);
            expect(Math.abs(amount(t, 'discount'))).toBe(0);
            expect(amount(t, 'final-discounted')).toBe(base);
            expect(amount(t, 'grand-vat')).toBeCloseTo(base * 1.1, 3);
        }
    });

    it('recalculates percentage discounts when the base price changes', () => {
        const t = table(1100, 10);
        patch(t, 1100);
        patch(t, 2000);
        expect(amount(t, 'discount')).toBe(-200);
        expect(amount(t, 'final-discounted')).toBe(1800);
        expect(amount(t, 'vat')).toBe(180);
        expect(amount(t, 'grand-vat')).toBe(1980);
    });

    it('accepts zero discount over a previously stamped discount', () => {
        const t = table(1100, 0);
        t.setAttribute('data-ems-pricing-discount-total', '120');
        patch(t, 1100);
        expect(amount(t, 'final-discounted')).toBe(1100);
        expect(amount(t, 'grand-vat')).toBe(1210);
    });

    it('preserves an explicitly edited fixed discount as prices change', () => {
        const t = table(1766, 0);
        const cell = t.querySelector('[data-ems-row="discount"]').lastElementChild;
        cell.textContent = '-BHD 100.000';
        pricing.patchPricingTableFooterDom(t, 1766, { activeCell: cell });
        patch(t, 2000);
        expect(amount(t, 'discount')).toBe(-100);
        expect(amount(t, 'final-discounted')).toBe(1900);
        expect(amount(t, 'vat')).toBe(190);
        expect(amount(t, 'grand-vat')).toBe(2090);
    });

    it.each([[0, 0, 0, 0], [15, 12.345, 1.852, 14.197]])(
        'rounds discounted VAT at %s percent', (pct, net, vat, grand) => {
            const t = table(13.717, pct === 0 ? 100 : 10);
            t.querySelector('[data-ems-row="vat"]').firstElementChild.textContent = `VAT ${pct}%`;
            patch(t, 13.717);
            expect(amount(t, 'final-discounted')).toBe(net);
            expect(amount(t, 'vat')).toBe(vat);
            expect(amount(t, 'grand-vat')).toBe(grand);
        }
    );

    it('retains inherited discounts on split continuation tables', () => {
        const t = table(1100);
        t.setAttribute('data-ems-table-split', '1');
        t.setAttribute('data-ems-split-id', 'base');
        t.setAttribute('data-ems-pricing-discount-total', '120');
        patch(t, 1100);
        expect(amount(t, 'vat')).toBe(98);
        expect(amount(t, 'grand-vat')).toBe(1078);
    });
});

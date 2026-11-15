import { describe, expect, it } from 'vitest';
import { sanitizeQuoteRichHtml } from '../quoteSanitizeHtml.js';

describe('sanitizeQuoteRichHtml Excel title / spell-mark soup', () => {
    it('removes Excel <title> so escaped spell-mark soup never becomes body text', () => {
        const html = `
<p><!--StartFragment--></p>
<meta name="ProgId" content="Excel.Sheet">
<title>Costing &amp; IO - Gulf Tobacco Factory-R3.&lt;span class="ems-spell-mark" spellcheck="false"&gt;xlsx&lt;/span&gt;</title>
<style>.xl65{color:red}</style>
<table border="1"><tr><td>Sl No</td><td>Description</td></tr><tr><td>1</td><td>Chillers</td></tr></table>
`;
        const out = sanitizeQuoteRichHtml(html);
        expect(out).not.toMatch(/Gulf Tobacco/i);
        expect(out).not.toMatch(/ems-spell-mark/i);
        expect(out).not.toMatch(/&lt;span/i);
        expect(out).not.toMatch(/<title/i);
        expect(out).toMatch(/<table/i);
        expect(out).toMatch(/Chillers/);
    });

    it('unwraps real ems-spell-mark spans left in body HTML', () => {
        const html = `<p>Hello <span class="ems-spell-mark" data-word="xlsx" spellcheck="false">xlsx</span> world</p>`;
        const out = sanitizeQuoteRichHtml(html);
        expect(out).not.toMatch(/ems-spell-mark/);
        expect(out).toMatch(/xlsx/);
        expect(out).toMatch(/Hello/);
    });

    it('keeps white header paint from font color / bgcolor across sanitize', () => {
        const html = `<table data-ems-paste-source="office" data-ems-internal-table-clip="1">
<tr><td bgcolor="#1F4E79"><font color="#FFFFFF">Item</font></td></tr>
</table>`;
        const out = sanitizeQuoteRichHtml(html);
        expect(out).toMatch(/#FFFFFF|#ffffff|rgb\(255,\s*255,\s*255\)/i);
        expect(out).toMatch(/#1F4E79|#1f4e79/i);
        expect(out).toMatch(/data-ems-cell-color/i);
        expect(out).toMatch(/data-ems-cell-bg/i);
    });

    it('repairs stale white BOQ foregrounds while retaining authored dark fills and mixed colors', () => {
        const html = `<table data-ems-paste-source="office">
            <thead><tr style="background-color:#555"><th style="color:white">Description</th></tr></thead>
            <tbody><tr><td data-ems-header-fg="light" data-ems-cell-color="white" style="color:#182438">
                Item <strong style="color:#945214">Reference</strong>
            </td><td style="color:white"><span style="color:white">1</span></td>
            <td style="background-color:#1565c0;color:white">10</td></tr></tbody>
        </table>`;
        const doc = new DOMParser().parseFromString(sanitizeQuoteRichHtml(html), 'text/html');
        const [description, quantity, blue] = doc.querySelectorAll('td');
        const color = value => {
            const sample = doc.createElement('span');
            sample.style.color = value;
            return sample.style.color;
        };
        expect(doc.querySelector('th').style.color).toBe('white');
        expect(description.hasAttribute('data-ems-header-fg')).toBe(false);
        expect(description.style.color).toBe(color('#182438'));
        expect(description.querySelector('strong').style.color).toBe(color('#945214'));
        expect(quantity.style.color).toBe(color('#0f172a'));
        expect(quantity.querySelector('span').style.color).toBe('');
        expect(blue.style.color).toBe('white');
    });
});

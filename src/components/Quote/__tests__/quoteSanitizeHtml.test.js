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
});

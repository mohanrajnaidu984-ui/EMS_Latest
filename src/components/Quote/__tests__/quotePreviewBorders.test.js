import { describe, it, expect, vi } from 'vitest';
import { preserveQuotePreviewBorders, embedQuoteLogoImagesInClone, buildQuotePrintDocumentHtml } from '../quotePrintDocumentHtml.js';

describe('quote preview border export', () => {
    it('keeps table, section, footer and absent borders despite export overrides', () => {
        const root = document.createElement('div');
        root.innerHTML = '<h3 style="border-bottom:1px solid blue">Materials</h3><table style="border-collapse:collapse"><tbody><tr><td style="border:1px solid navy">Item</td><td style="border:none">No border</td></tr></tbody></table><footer style="border-top:1px solid gray">Footer</footer>';
        document.body.append(root);
        const clone = root.cloneNode(true);
        preserveQuotePreviewBorders(root, clone);
        const sources = root.querySelectorAll('*');
        clone.querySelectorAll('*').forEach((target, index) => {
            for (const side of ['top', 'right', 'bottom', 'left']) {
                for (const part of ['width', 'style', 'color']) {
                    const property = 'border-' + side + '-' + part;
                    const original = getComputedStyle(sources[index]).getPropertyValue(property);
                    const width = part === 'width' ? parseFloat(original) : NaN;
                    expect(target.style.getPropertyValue(property)).toBe(width > 0 && width <= 1 ? '0.5px' : original);
                    if (getComputedStyle(sources[index]).getPropertyValue(property)) {
                        expect(target.style.getPropertyPriority(property)).toBe('important');
                    }
                }
            }
        });
        expect(clone.querySelector('table').style.borderCollapse).toBe('collapse');
        root.remove();
    });
});

it('exports section pseudo-element rules as genuine half-pixel lines', () => {
    const html = buildQuotePrintDocumentHtml(true, '', '', '', 'preview');
    expect(html).toMatch(/quote-clause-heading-panel\.quote-preview-panel-shell::after\s*\{[^}]*border-top: 0\.5px solid/);
});

it('embeds original SVG bytes for logos and clause images without canvas conversion', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="quote-sheet-logo-row"><img src="/logo.svg"></div><div class="clause-content"><img src="/drawing.svg"></div>';
    const clone = root.cloneNode(true);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><path d="M0 0L800 400"/></svg>';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => new Blob([svg], { type: 'image/svg+xml' }) });
    const canvasMock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    try {
        await embedQuoteLogoImagesInClone(clone, root);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        for (const img of clone.querySelectorAll('img')) expect(img.src).toMatch(/^data:image\/svg\+xml/);
        expect(canvasMock).not.toHaveBeenCalled();
    } finally { fetchMock.mockRestore(); canvasMock.mockRestore(); }
});

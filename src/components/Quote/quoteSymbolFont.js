/** Word Symbol-font Greek lookalikes → Latin. */

const EMS_SYMBOL_GREEK_TO_LATIN = {
    Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N',
    Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
    α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'e', θ: 'th', ι: 'i',
    κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
    ς: 's', τ: 't', υ: 'u', φ: 'f', χ: 'c', ψ: 'ps', ω: 'o',
};

export function remapSymbolFontGreekInHtml(html) {
    const raw = String(html || '');
    if (!raw || (!/Symbol|Wingdings|Τ|η|ε|Μ|α|ι|ν|Χ/i.test(raw))) return raw;
    if (typeof DOMParser === 'undefined') {
        return raw.replace(/[Α-ω]/g, (ch) => EMS_SYMBOL_GREEK_TO_LATIN[ch] || ch);
    }
    try {
        const doc = new DOMParser().parseFromString(`<div id="ems-sym">${raw}</div>`, 'text/html');
        const root = doc.getElementById('ems-sym');
        if (!root) return raw;
        root.querySelectorAll('[style*="font-family"], [face], font, span, p, li, td').forEach((el) => {
            const ff = String(el.style?.fontFamily || el.getAttribute?.('face') || '').toLowerCase();
            if (/\bsymbol\b|\bwingdings\b/.test(ff)) {
                el.style?.removeProperty?.('font-family');
                el.removeAttribute?.('face');
            }
        });
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n = walker.nextNode();
        while (n) {
            const t = n.textContent || '';
            if (/[Α-ω]/.test(t)) {
                n.textContent = t
                    .split('')
                    .map((ch) => EMS_SYMBOL_GREEK_TO_LATIN[ch] || ch)
                    .join('');
            }
            n = walker.nextNode();
        }
        return root.innerHTML;
    } catch {
        return raw.replace(/[Α-ω]/g, (ch) => EMS_SYMBOL_GREEK_TO_LATIN[ch] || ch);
    }
}

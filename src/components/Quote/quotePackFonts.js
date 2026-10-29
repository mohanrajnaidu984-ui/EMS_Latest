/**
 * Bundled Selawik (Segoe UI–metric, SIL OFL) faces for identical wrap in preview + Puppeteer PDF.
 * @font-face aliases "Segoe UI" → Selawik files (no local() — same file in browser and headless Chrome).
 */

/*
 * Selawik FIRST — Windows installs real "Segoe UI", so listing it first made the
 * preview resolve to the system face while Puppeteer PDF used @font-face Selawik
 * (taller wrap in preview → crop at CONTENT END / gaps from mismatched measure).
 * @font-face still aliases family "Segoe UI" → Selawik files for inline styles.
 */
export const QUOTE_PACK_FONT_STACK =
    "Selawik, 'Segoe UI', Arial, Helvetica, sans-serif";

/** Absolute URL for PDF HTML (Puppeteer); pass origin like http://127.0.0.1:5173 */
export function buildQuotePackFontFaceCss(assetOrigin = '') {
    let base = String(assetOrigin || '').replace(/\/?$/, '');
    if (!base && typeof window !== 'undefined' && window.location?.origin) {
        base = String(window.location.origin).replace(/\/?$/, '');
    }
    const u = (file) => (base ? `${base}/fonts/selawik/${file}` : `/fonts/selawik/${file}`);
    /*
     * No local("Segoe UI") — preview and PDF must resolve to the same bundled file.
     * Selawik has no italic face; italic uses synthetic slant of the regular/bold file.
     */
    return `
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('${u('selawik-light.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 350;
  font-display: swap;
  src: url('${u('selawik-semilight.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${u('selawik-semibold.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${u('selawik-bold.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Selawik';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Selawik';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${u('selawik-semibold.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Selawik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${u('selawik-bold.woff2')}') format('woff2');
}
/* Office paste aliases → same Selawik files (metric-aligned default). */
@font-face {
  font-family: 'Arial';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Arial';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${u('selawik-bold.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Helvetica';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Calibri';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Times New Roman';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Helvetica Neue';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${u('selawik-regular.woff2')}') format('woff2');
}
`;
}

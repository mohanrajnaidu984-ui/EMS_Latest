/**
 * Shared quote faces for the browser preview and Puppeteer PDF.
 */

/*
 * Selawik FIRST — Windows installs real "Segoe UI", so listing it first made the
 * preview resolve to the system face while Puppeteer PDF used @font-face Selawik
 * (taller wrap in preview → crop at CONTENT END / gaps from mismatched measure).
 * Explicit Segoe UI selections prefer the installed face.
 */
export const QUOTE_PACK_FONT_STACK =
    "Selawik, 'Segoe UI', Arial, Helvetica, sans-serif";
export const QUOTE_SEGOE_UI_FONT_STACK = "'Segoe UI', Selawik, sans-serif";

/** Absolute URL for PDF HTML (Puppeteer); pass origin like http://127.0.0.1:5173 */
export function buildQuotePackFontFaceCss(assetOrigin = '') {
    let base = String(assetOrigin || '').replace(/\/?$/, '');
    if (!base && typeof window !== 'undefined' && window.location?.origin) {
        base = String(window.location.origin).replace(/\/?$/, '');
    }
    const u = (file) => `${base}/fonts/selawik/${file}`;
    const arimo = (weight) => `${base}/fonts/arimo/arimo-latin-${weight}-normal.woff2`;
    const inter = (weight) => `${base}/fonts/inter/inter-latin-${weight}-normal.woff2`;
    return `
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: local('Segoe UI Light'), local('SegoeUI-Light'), url('${u('selawik-light.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 350;
  font-display: swap;
  src: local('Segoe UI Semilight'), local('SegoeUI-Semilight'), url('${u('selawik-semilight.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local('Segoe UI'), local('SegoeUI'), url('${u('selawik-regular.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: local('Segoe UI Semibold'), local('SegoeUI-Semibold'), url('${u('selawik-semibold.woff2')}') format('woff2');
}
@font-face {
  font-family: 'Segoe UI';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local('Segoe UI Bold'), local('SegoeUI-Bold'), url('${u('selawik-bold.woff2')}') format('woff2');
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
/* Arial falls back to metric-compatible Arimo on hosts without Arial installed. */
@font-face {
  font-family: 'Arial';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local('Arial'), local('ArialMT'), url('${arimo(400)}') format('woff2');
}
@font-face {
  font-family: 'Arial';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local('Arial Bold'), local('Arial-BoldMT'), url('${arimo(700)}') format('woff2');
}
@font-face {
  font-family: 'Helvetica';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local('Helvetica'), url('${inter(400)}') format('woff2');
}
@font-face {
  font-family: 'Helvetica';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local('Helvetica Bold'), local('Helvetica-Bold'), url('${inter(700)}') format('woff2');
}
@font-face {
  font-family: 'Calibri';
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

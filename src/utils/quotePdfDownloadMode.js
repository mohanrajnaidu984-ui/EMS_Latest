/**
 * Quote PDF download strategy (build-time via Vite env).
 *
 * - Browser print: Download PDF opens window.print() → user chooses Save as PDF (IIS production).
 * - Server Puppeteer: POST /api/quote-pdf/generate (dev default; email/background always use server).
 *
 * Env:
 *   VITE_QUOTE_PDF_BROWSER_DOWNLOAD=1  — force browser print for Download PDF
 *   VITE_QUOTE_PDF_SERVER_DOWNLOAD=1   — force server PDF even in production builds
 */
export function isQuotePdfBrowserDownload() {
    const explicit = String(import.meta.env?.VITE_QUOTE_PDF_BROWSER_DOWNLOAD ?? '').trim().toLowerCase();
    if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;
    if (explicit === '0' || explicit === 'false' || explicit === 'no') return false;

    const serverDl = String(import.meta.env?.VITE_QUOTE_PDF_SERVER_DOWNLOAD ?? '').trim().toLowerCase();
    if (serverDl === '1' || serverDl === 'true' || serverDl === 'yes') return false;

    /** Default to server-side PDF download (since Puppeteer is hardened and fully active). */
    return false;
}

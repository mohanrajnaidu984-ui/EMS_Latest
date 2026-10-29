/**
 * Apply PDF security so quote downloads cannot be edited or copied into Word easily.
 * Opens without a password; owner password is required to change restrictions.
 *
 * muhammara is a native addon — must be built on the same Node major as production (22 LTS).
 * If unavailable, restriction is skipped when QUOTE_PDF_RESTRICT=0 or module fails to load.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let muhammara = null;
let muhammaraLoadError = null;

function loadMuhammara() {
    if (muhammara) return muhammara;
    if (muhammaraLoadError) return null;
    try {
        muhammara = require('muhammara');
        return muhammara;
    } catch (err) {
        muhammaraLoadError = err;
        console.warn(
            '[quote-pdf] muhammara not loaded (use Node.js 22 LTS and run npm ci in backend):',
            err && err.message ? err.message : err
        );
        return null;
    }
}

/** PDF user access: allow printing only (deny modify, copy, annotate, extract, etc.). */
function buildQuotePdfUserProtectionFlag() {
    return 1 << 2; // print
}

function isQuotePdfRestrictEnabled() {
    const raw = String(process.env.QUOTE_PDF_RESTRICT ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Buffer}
 */
function restrictQuotePdfBuffer(pdfBuffer) {
    const mm = loadMuhammara();
    if (!mm) {
        throw new Error(
            'muhammara is not available. Use Node.js 22 LTS on the server, run: cd backend && npm ci --omit=dev. Or set QUOTE_PDF_RESTRICT=0.'
        );
    }
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 5) {
        throw new Error('Invalid PDF buffer');
    }

    const ownerPassword =
        String(process.env.QUOTE_PDF_OWNER_PASSWORD || '').trim() ||
        'EMS-Quote-Owner-Do-Not-Share';

    // Native file I/O: PDFRStreamForBuffer/PDFWStreamForBuffer copy byte arrays through JS and take
    // minutes on PDFs with signature images (blocking the event loop); file paths take milliseconds.
    const dir = path.join(os.tmpdir(), 'ems-quote-pdf');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `restrict-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    const inPath = `${base}-in.pdf`;
    const outPath = `${base}-out.pdf`;
    try {
        fs.writeFileSync(inPath, pdfBuffer);
        mm.recrypt(inPath, outPath, {
            userPassword: '',
            ownerPassword,
            userProtectionFlag: buildQuotePdfUserProtectionFlag(),
        });
        const restricted = fs.readFileSync(outPath);
        if (!restricted || restricted.length < 5) {
            throw new Error('PDF restriction produced empty output');
        }
        return restricted;
    } finally {
        for (const p of [inPath, outPath]) {
            try {
                fs.unlinkSync(p);
            } catch {
                /* ignore */
            }
        }
    }
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer>}
 */
async function applyQuotePdfRestrictions(pdfBuffer) {
    if (!isQuotePdfRestrictEnabled()) {
        return pdfBuffer;
    }
    if (!loadMuhammara()) {
        console.warn('[quote-pdf] PDF restrict skipped — muhammara unavailable');
        return pdfBuffer;
    }
    try {
        return restrictQuotePdfBuffer(pdfBuffer);
    } catch (err) {
        console.error('[quote-pdf] restrict failed:', err && err.message ? err.message : err);
        console.warn('[quote-pdf] Returning unrestricted PDF. Fix Node 22 + npm ci, or set QUOTE_PDF_RESTRICT=0.');
        return pdfBuffer;
    }
}

module.exports = {
    applyQuotePdfRestrictions,
    restrictQuotePdfBuffer,
    isQuotePdfRestrictEnabled,
    buildQuotePdfUserProtectionFlag,
    loadMuhammara,
};

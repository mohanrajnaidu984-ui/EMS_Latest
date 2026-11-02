/**
 * Apply PDF security so quote downloads cannot be edited or copied into Word easily.
 * Opens without a password; owner password is required to change restrictions.
 * Allowed for the customer: print + fill existing form/signature fields (acceptance page).
 * Denied: modify content, copy text, assemble pages.
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

/**
 * PDF user access permissions (PDF 32000 / muhammara hummus flags):
 * - print + printbest: allow printing
 * - edit (annotate): needed so Acrobat can place a signature appearance in the Sig field
 * - fillform: fill existing form fields and sign existing signature fields
 * Deny modify / copy / assemble so quote body text/layout cannot be changed.
 */
function buildQuotePdfUserProtectionFlag() {
    const print = 1 << 2;
    const editAnnotate = 1 << 5; // place signature appearance / annotations only (not content edit)
    const fillform = 1 << 8;
    const extract = 1 << 9; // accessibility extract only
    const printbest = 1 << 11;
    return print | editAnnotate | fillform | extract | printbest;
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
 * @param {{ allowInPlaceDigitalSignature?: boolean }} [options]
 * @returns {Promise<Buffer>}
 *
 * allowInPlaceDigitalSignature: skip owner-password encryption. Acrobat cannot
 * append a digital signature into an encrypted PDF in place — it forces Save As
 * a new file. Customer-acceptance downloads stay fillable/signable and Save works
 * on the same file after signing.
 */
async function applyQuotePdfRestrictions(pdfBuffer, options = {}) {
    if (!isQuotePdfRestrictEnabled()) {
        return pdfBuffer;
    }
    if (options.allowInPlaceDigitalSignature === true) {
        console.info(
            '[quote-pdf] PDF encrypt/restrict skipped — in-place digital signature save (customer acceptance)'
        );
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

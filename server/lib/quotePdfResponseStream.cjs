/**
 * Stream quote PDFs to HTTP clients and short-lived tokenized file downloads.
 * Avoids holding large PDFs only in the Express response path as a single res.send(buffer)
 * when possible, and enables browser-native download (GET) which streams through IIS/ARR.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

/** @type {Map<string, { filePath: string, fileName: string, bytes: number, expiresAt: number }>} */
const downloadTokens = new Map();

const TOKEN_TTL_MS = Math.max(
    60_000,
    parseInt(String(process.env.QUOTE_PDF_DOWNLOAD_TOKEN_TTL_MS || ''), 10) || 10 * 60_000
);

/** Prefer disk+stream for PDFs at/above this size (bytes). */
const STREAM_FILE_THRESHOLD = Math.max(
    64 * 1024,
    parseInt(String(process.env.QUOTE_PDF_STREAM_FILE_THRESHOLD || ''), 10) || 256 * 1024
);

function getPdfOutTempDir() {
    const base =
        process.env.QUOTE_PDF_TEMP_DIR ||
        path.join(__dirname, '..', 'temp', 'quote-pdf');
    if (!fs.existsSync(base)) {
        fs.mkdirSync(base, { recursive: true });
    }
    return base;
}

function purgeExpiredTokens() {
    const now = Date.now();
    for (const [token, meta] of downloadTokens.entries()) {
        if (!meta || meta.expiresAt <= now) {
            downloadTokens.delete(token);
            if (meta?.filePath) {
                try {
                    fs.unlinkSync(meta.filePath);
                } catch {
                    /* ignore */
                }
            }
        }
    }
}

setInterval(purgeExpiredTokens, 60_000).unref?.();

/**
 * Apply standard PDF download headers (no-store; disable common proxy buffering).
 * @param {import('express').Response} res
 * @param {string} safeName
 * @param {number} [contentLength]
 * @param {Record<string, string>} [extra]
 */
function applyPdfDownloadHeaders(res, safeName, contentLength, extra = {}) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /** Hint nginx / some proxies not to buffer; ARR uses responseBufferLimit separately. */
    res.setHeader('X-Accel-Buffering', 'no');
    if (Number.isFinite(contentLength) && contentLength >= 0) {
        res.setHeader('Content-Length', String(contentLength));
    }
    for (const [k, v] of Object.entries(extra || {})) {
        if (v != null) res.setHeader(k, String(v));
    }
}

/**
 * Stream a PDF Buffer to the response. Large buffers are written to a temp file and
 * streamed with createReadStream so the event loop is not blocked on a giant res.send.
 * @param {import('express').Response} res
 * @param {Buffer} buf
 * @param {string} fileName
 * @param {Record<string, string>} [extraHeaders]
 */
async function streamPdfBufferToResponse(res, buf, fileName, extraHeaders = {}) {
    const safeName = String(fileName || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 5) {
        throw new Error('Invalid PDF buffer');
    }

    applyPdfDownloadHeaders(res, safeName, buf.length, extraHeaders);

    if (buf.length < STREAM_FILE_THRESHOLD) {
        await new Promise((resolve, reject) => {
            res.once('finish', resolve);
            res.once('error', reject);
            res.end(buf);
        });
        return { mode: 'buffer', bytes: buf.length };
    }

    const tmp = path.join(
        getPdfOutTempDir(),
        `ems-pdf-stream-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`
    );
    await fs.promises.writeFile(tmp, buf);
    try {
        await pipeline(fs.createReadStream(tmp), res);
        return { mode: 'file-stream', bytes: buf.length };
    } finally {
        fs.unlink(tmp, () => {});
    }
}

/**
 * Persist PDF for a short-lived GET download (browser-native streaming).
 * @param {Buffer} buf
 * @param {string} fileName
 * @returns {{ token: string, fileName: string, bytes: number, expiresInMs: number, downloadPath: string }}
 */
function storePdfForTokenDownload(buf, fileName) {
    purgeExpiredTokens();
    const safeName = String(fileName || 'quote.pdf').replace(/[^\w.\-]+/g, '_');
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 5) {
        throw new Error('Invalid PDF buffer');
    }
    const token = crypto.randomBytes(24).toString('hex');
    const filePath = path.join(
        getPdfOutTempDir(),
        `ems-pdf-token-${token}.pdf`
    );
    fs.writeFileSync(filePath, buf);
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    downloadTokens.set(token, {
        filePath,
        fileName: safeName,
        bytes: buf.length,
        expiresAt,
    });
    return {
        token,
        fileName: safeName,
        bytes: buf.length,
        expiresInMs: TOKEN_TTL_MS,
        downloadPath: `/api/quote-pdf/file/${token}`,
    };
}

/**
 * @param {string} token
 * @param {import('express').Response} res
 */
async function streamTokenPdfToResponse(token, res) {
    purgeExpiredTokens();
    const meta = downloadTokens.get(String(token || ''));
    if (!meta) {
        res.status(404).json({ error: 'download_expired', message: 'PDF download link expired or invalid.' });
        return false;
    }
    if (meta.expiresAt <= Date.now()) {
        downloadTokens.delete(token);
        try {
            fs.unlinkSync(meta.filePath);
        } catch {
            /* ignore */
        }
        res.status(410).json({ error: 'download_expired', message: 'PDF download link expired.' });
        return false;
    }

    if (!fs.existsSync(meta.filePath)) {
        downloadTokens.delete(token);
        res.status(404).json({ error: 'file_missing', message: 'PDF file no longer available.' });
        return false;
    }

    applyPdfDownloadHeaders(res, meta.fileName, meta.bytes);
    try {
        await pipeline(fs.createReadStream(meta.filePath), res);
    } finally {
        downloadTokens.delete(token);
        fs.unlink(meta.filePath, () => {});
    }
    return true;
}

module.exports = {
    streamPdfBufferToResponse,
    storePdfForTokenDownload,
    streamTokenPdfToResponse,
    applyPdfDownloadHeaders,
    STREAM_FILE_THRESHOLD,
    TOKEN_TTL_MS,
};

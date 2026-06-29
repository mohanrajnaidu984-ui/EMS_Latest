/**
 * Structured timing for POST /api/quote-pdf/generate (console + X-EMS-PDF-Timing header).
 */

function msSince(t0) {
    return Date.now() - t0;
}

function isPerfLogEnabled() {
    const v = process.env.EMS_QUOTE_PDF_PERF_LOG;
    return String(v || '').trim() === '1' || /^true$/i.test(String(v || ''));
}

/** Always logs TOTAL; other stages when EMS_QUOTE_PDF_PERF_LOG=1 (PM2 stdout). */
function logStage(flow, stage, ms, extra) {
    const always = stage === 'TOTAL' || /^Stage /.test(String(stage));
    if (!always && !isPerfLogEnabled()) return;
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[quote-pdf][perf] ${flow} | ${stage}: ${ms}ms${suffix}`);
}

function headerJson(stages) {
    try {
        return Buffer.from(JSON.stringify(stages), 'utf8').toString('base64');
    } catch {
        return '';
    }
}

module.exports = { msSince, logStage, headerJson, isPerfLogEnabled };

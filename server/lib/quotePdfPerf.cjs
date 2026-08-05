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

/**
 * Always print a compact stage report (PM2 / local stdout).
 * @param {Record<string, number|string|undefined>} perf
 */
function printPerfReport(perf) {
    const line = (label, ms) => {
        const n = Number(ms);
        const val = Number.isFinite(n) ? `${Math.round(n)} ms` : '—';
        console.log(`${label.padEnd(14)}: ${val}`);
    };
    console.log('---------------------------------');
    line('Database', perf.databaseMs ?? 0);
    line('Calculations', perf.calculationsMs ?? 0);
    line('HTML Render', perf.dataPrepMs);
    line('Page Load', perf.pageLoadMs);
    line('Images', perf.imagesMs);
    line('Layout Prep', perf.layoutPrepMs);
    line('PDF Render', perf.renderMs);
    line('Restrict', perf.restrictMs);
    line('Browser', perf.browserLaunchMs);
    line('Response', perf.responseMs);
    line('TOTAL', perf.totalMs);
    console.log('---------------------------------');
}

function headerJson(stages) {
    try {
        return Buffer.from(JSON.stringify(stages), 'utf8').toString('base64');
    } catch {
        return '';
    }
}

module.exports = { msSince, logStage, headerJson, isPerfLogEnabled, printPerfReport };

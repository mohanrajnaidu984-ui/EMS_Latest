'use strict';

/**
 * Lightweight rolling API request counters for Usage diagnostics.
 */

const WINDOW_MS = 60 * 1000;
/** @type {{ t: number, status: number, ms: number }[]} */
const samples = [];
let inFlight = 0;

function prune(now = Date.now()) {
    const cutoff = now - WINDOW_MS;
    while (samples.length && samples[0].t < cutoff) samples.shift();
}

function requestStatsMiddleware(req, res, next) {
    const path = String(req.originalUrl || req.path || '');
    if (
        !path.startsWith('/api') ||
        path.startsWith('/api/usage/summary') ||
        path.startsWith('/api/health') ||
        path.startsWith('/api/socket.io') ||
        path.startsWith('/socket.io')
    ) {
        return next();
    }
    const started = Date.now();
    inFlight += 1;
    const done = () => {
        inFlight = Math.max(0, inFlight - 1);
        samples.push({ t: Date.now(), status: res.statusCode || 0, ms: Date.now() - started });
        prune();
        res.removeListener('finish', done);
        res.removeListener('close', done);
    };
    res.on('finish', done);
    res.on('close', done);
    next();
}

function getRequestStats() {
    prune();
    const now = Date.now();
    const n = samples.length;
    let err5xx = 0;
    let err4xx = 0;
    let totalMs = 0;
    let slow = 0;
    for (const s of samples) {
        totalMs += s.ms;
        if (s.status >= 500) err5xx += 1;
        else if (s.status >= 400) err4xx += 1;
        if (s.ms >= 2000) slow += 1;
    }
    const avgMs = n ? Math.round(totalMs / n) : 0;
    const rps = Math.round((n / (WINDOW_MS / 1000)) * 10) / 10;
    return {
        windowSec: WINDOW_MS / 1000,
        requestsLastMin: n,
        requestsPerSec: rps,
        inFlight,
        avgLatencyMs: avgMs,
        slowRequests2s: slow,
        http4xx: err4xx,
        http5xx: err5xx,
        at: new Date(now).toISOString(),
    };
}

module.exports = {
    requestStatsMiddleware,
    getRequestStats,
};

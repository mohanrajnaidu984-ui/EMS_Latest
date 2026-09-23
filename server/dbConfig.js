'use strict';

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '30000', 10);
const requestTimeout = parseInt(process.env.DB_REQUEST_TIMEOUT_MS || '60000', 10);
/** Skip SELECT 1 on every request — only re-validate after this many ms (keep-alive still runs). */
const ENSURE_PING_MIN_MS = parseInt(process.env.DB_ENSURE_PING_MIN_MS || '15000', 10);

/**
 * mssql/tedious reads connectionTimeout at top-level (or options.connectTimeout),
 * not options.connectionTimeout — keep both so reconnects use the intended timeout.
 */
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: String(process.env.DB_SERVER || '').trim(),
    database: process.env.DB_DATABASE,
    connectionTimeout,
    requestTimeout,
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || '40', 10),
        min: parseInt(process.env.DB_POOL_MIN || '4', 10),
        // Idle sockets to SQL often get dropped by firewalls after ~60–120s.
        // Keep pool idle longer than keep-alive so connections are exercised, not discarded.
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '120000', 10),
        // Fail fast under load instead of hanging IIS ARR slots until proxy timeout.
        acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_MS || '10000', 10),
        createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_MS || '15000', 10),
    },
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: connectionTimeout,
        requestTimeout,
        enableArithAbort: true,
        useUTC: false,
    },
};

let activePool = null;
let connectPromise = null;
let reconnectPromise = null;
let keepAliveTimer = null;
let keepAliveRunning = false;
/** Bumped on every disconnect — stale in-flight sql.connect results must not overwrite activePool. */
let poolGeneration = 0;
/** Set false when pool reports error / keep-alive fails — forces reconnect even if pool.connected looks true. */
let poolHealthy = false;
let lastSuccessfulPingAt = 0;

function validateDbEnv() {
    const missing = [];
    if (!String(config.user || '').trim()) missing.push('DB_USER');
    if (config.password === undefined || config.password === null) missing.push('DB_PASSWORD');
    if (!String(config.server || '').trim()) missing.push('DB_SERVER');
    if (!String(config.database || '').trim()) missing.push('DB_DATABASE');
    if (missing.length) {
        const msg =
            `Missing or empty in server/.env: ${missing.join(', ')}. ` +
            'Set these for SQL Server authentication, then restart the server.';
        throw new Error(msg);
    }
}

/**
 * mssql v12+ does not reliably expose a global `sql.pool` after `sql.connect()`.
 * Track the ConnectionPool we opened ourselves.
 */
function getPool() {
    if (activePool) return activePool;
    if (sql.pool) return sql.pool;
    return null;
}

function isPoolConnected() {
    const pool = getPool();
    return !!(pool && pool.connected && poolHealthy);
}

function markPoolUnhealthy(reason) {
    if (poolHealthy) {
        console.warn(`[DB] Marking pool unhealthy${reason ? ` (${reason})` : ''}`);
    }
    poolHealthy = false;
}

/** Busy pool under load — do NOT close/reconnect (that makes the storm worse). */
function isPoolExhaustedError(err) {
    if (!err) return false;
    const msg = String(err.message || err.originalError?.message || '').toLowerCase();
    return msg.includes('unable to get a connection from the pool') || msg.includes('unable to get a connection from pool');
}

function isDbConnectionError(err) {
    if (!err) return false;
    if (isPoolExhaustedError(err)) return false;
    const code = String(err.code || err.originalError?.code || '').toUpperCase();
    const msg = String(err.message || err.originalError?.message || '').toLowerCase();
    if (
        [
            'ECONNCLOSED',
            'ENOTOPEN',
            'ESOCKET',
            'ECONNRESET',
            'ECONNREFUSED',
            'EPIPE',
            'ENOTCONNECTED',
            'CONNECTIONERROR',
            'ELOGIN',
        ].includes(code)
    ) {
        return true;
    }
    // ETIMEOUT alone can be a slow query — only treat as connection loss with connection wording.
    if (code === 'ETIMEOUT' && (msg.includes('connect') || msg.includes('login') || msg.includes('socket'))) {
        return true;
    }
    return (
        msg.includes('connection is closed') ||
        msg.includes('connection closed') ||
        msg.includes('not connected to the server') ||
        msg.includes('failed to connect') ||
        msg.includes('could not connect') ||
        msg.includes('socket hang up') ||
        msg.includes('no connection is specified')
    );
}

async function disconnectDB() {
    // Do not clear connectPromise here — connectDB() may call disconnect while its
    // own connectPromise is in flight; clearing it allows a duplicate parallel connect.
    poolGeneration += 1;
    poolHealthy = false;
    lastSuccessfulPingAt = 0;
    const pool = activePool || sql.pool || null;
    activePool = null;
    try {
        if (pool && typeof pool.close === 'function') {
            await pool.close();
        } else {
            await sql.close();
        }
    } catch {
        /* pool may already be closed */
    }
}

/** Run SELECT 1 on the tracked pool (mssql v12 may not wire sql.query to sql.pool). */
async function pingDb() {
    const pool = getPool();
    if (pool && typeof pool.request === 'function') {
        await pool.request().query('SELECT 1 AS ok');
        return;
    }
    await sql.query`SELECT 1 AS ok`;
}

function wrapRequestMethod(methodName) {
    const original = sql.Request.prototype[methodName];
    if (typeof original !== 'function' || original.__emsWrapped) return;
    function patched(...args) {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') {
            return result.catch((err) => {
                if (isPoolExhaustedError(err)) {
                    console.warn('[DB] Pool exhausted (not reconnecting):', err?.message || err);
                } else if (isDbConnectionError(err)) {
                    markPoolUnhealthy(`request-${methodName}`);
                    reconnectDB(`request-${methodName}`).catch((e) => {
                        console.error(`[DB] Reconnect after request-${methodName} failed:`, e?.message || e);
                    });
                }
                throw err;
            });
        }
        return result;
    }
    patched.__emsWrapped = true;
    sql.Request.prototype[methodName] = patched;
}

/**
 * When route handlers catch DB errors themselves (never hit Express error middleware),
 * still mark the pool unhealthy so the next ensure/keep-alive reconnects.
 */
function installQueryErrorHook() {
    if (sql.Request.prototype.__emsQueryHookInstalled) return;
    sql.Request.prototype.__emsQueryHookInstalled = true;
    wrapRequestMethod('query');
    wrapRequestMethod('execute');
    wrapRequestMethod('batch');
}

function attachPoolErrorHandler(pool) {
    if (!pool || pool.__emsPoolErrorHandlerAttached) return;
    pool.__emsPoolErrorHandlerAttached = true;
    pool.on('error', (err) => {
        console.error('[DB] Pool error:', err?.message || err);
        markPoolUnhealthy('pool-error-event');
        reconnectDB('pool-error').catch((e) => {
            console.error('[DB] Reconnect after pool error failed:', e?.message || e);
        });
    });
}

const connectDB = async () => {
    validateDbEnv();

    const existing = getPool();
    if (existing?.connected && poolHealthy) {
        return existing;
    }
    if (existing?.connecting && connectPromise) {
        return connectPromise;
    }
    if (connectPromise) {
        return connectPromise;
    }

    connectPromise = (async () => {
        try {
            if (existing && (!existing.connected || !poolHealthy)) {
                await disconnectDB();
            }
            // Capture AFTER intentional disconnect so we don't discard our own fresh pool.
            const generationAtStart = poolGeneration;
            const pool = await sql.connect(config);
            // A reconnect/disconnect started while we were connecting — discard this pool.
            if (generationAtStart !== poolGeneration) {
                try {
                    await pool.close();
                } catch {
                    /* ignore */
                }
                return getPool();
            }
            activePool = pool;
            attachPoolErrorHandler(pool);
            installQueryErrorHook();
            poolHealthy = true;
            lastSuccessfulPingAt = Date.now();
            console.log('Connected to MSSQL Database');
            return pool;
        } finally {
            connectPromise = null;
        }
    })();

    return connectPromise;
};

/** Wait for an in-flight connect without orphaning it (avoids activePool overwrite races). */
async function awaitInFlightConnect(maxMs = 35000) {
    if (!connectPromise) return;
    try {
        await Promise.race([
            connectPromise,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('connect wait timeout')), maxMs);
            }),
        ]);
    } catch {
        /* timed out or failed — reconnect will open fresh */
    }
}

/** Close + reopen (serialized). Use after connection errors or keep-alive failure. */
async function reconnectDB(reason = 'manual', retries = 5) {
    if (reconnectPromise) return reconnectPromise;
    reconnectPromise = (async () => {
        console.warn(`[DB] Reconnecting (${reason})...`);
        // Finish any in-flight connect first — do not null connectPromise (orphans the pool).
        await awaitInFlightConnect();
        await disconnectDB();
        try {
            return await connectDBWithRetry(retries);
        } finally {
            reconnectPromise = null;
        }
    })();
    return reconnectPromise;
}

const connectDBWithRetry = async (retries = 5) => {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const pool = await connectDB();
            if (pool && isPoolConnected()) return pool;
            lastErr = new Error('Connect completed but pool is not healthy (superseded reconnect)');
            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
                continue;
            }
        } catch (err) {
            lastErr = err;
            markPoolUnhealthy(`connect-attempt-${attempt + 1}`);
            console.error(`[DB] Connect attempt ${attempt + 1}/${retries} failed:`, err.message);
            await disconnectDB();
            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
            }
        }
    }
    throw lastErr || new Error('Database connect failed');
};

/**
 * Ensure a live DB pool before handling a request.
 * Cheap when healthy: no SELECT 1 unless last successful ping is older than ENSURE_PING_MIN_MS.
 * @param {{ forcePing?: boolean, reconnectRetries?: number }} [opts]
 */
async function ensureDbConnected({ forcePing = false, reconnectRetries = 5 } = {}) {
    // Wait out an in-flight reconnect instead of starting another close/open cycle.
    if (reconnectPromise) {
        await reconnectPromise;
    }
    if (!isPoolConnected()) {
        // Middleware uses fewer retries so the client gets 503 sooner instead of hanging past ARR.
        await reconnectDB('ensure-not-connected', reconnectRetries);
        return;
    }
    const now = Date.now();
    const pingAge = now - lastSuccessfulPingAt;
    if (!forcePing && pingAge >= 0 && pingAge < ENSURE_PING_MIN_MS) {
        return;
    }
    try {
        await pingDb();
        poolHealthy = true;
        lastSuccessfulPingAt = Date.now();
    } catch (err) {
        console.warn('[DB] ensureDb ping failed:', err?.message || err);
        await reconnectDB('ensure-ping-failed', reconnectRetries);
    }
}

/**
 * Run an async DB work function; on connection errors, reconnect once and retry.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withDb(fn) {
    await ensureDbConnected();
    try {
        return await fn();
    } catch (err) {
        if (!isDbConnectionError(err)) throw err;
        console.warn('[DB] Query failed with connection error — retrying once:', err?.message || err);
        await reconnectDB('query-retry');
        return await fn();
    }
}

/** Express middleware: heal SQL before API handlers (cheap when healthy). */
function ensureDbMiddleware(req, res, next) {
    const url = String(req.originalUrl || req.url || '');
    // Never block Socket.IO handshakes/polls on SQL — that caused production connect_error timeout
    if (
        !url.startsWith('/api/') ||
        url.startsWith('/api/health') ||
        url.startsWith('/api/socket.io') ||
        url.startsWith('/socket.io')
    ) {
        return next();
    }
    let settled = false;
    const fail = (err) => {
        if (settled || res.headersSent) return;
        settled = true;
        console.error('[DB] ensureDbMiddleware failed:', err?.message || err);
        res.status(503).json({
            error: 'Database temporarily unavailable',
            detail: err?.message || 'Database connection failed',
            retryable: true,
        });
    };
    /* Hard cap — never let ensure/reconnect hold an ARR slot past ~8s. */
    const watchdog = setTimeout(() => fail(new Error('Database ensure timed out')), 8000);
    ensureDbConnected({ reconnectRetries: 1 })
        .then(() => {
            if (settled || res.headersSent) return;
            settled = true;
            clearTimeout(watchdog);
            next();
        })
        .catch((err) => {
            clearTimeout(watchdog);
            fail(err);
        });
}

/** After a route fails with a connection error — heal for the next request. */
function noteDbErrorFromRequest(err) {
    if (isPoolExhaustedError(err)) {
        console.warn('[DB] Pool exhausted on request (not reconnecting):', err?.message || err);
        return false;
    }
    if (!isDbConnectionError(err)) return false;
    markPoolUnhealthy('request-error');
    reconnectDB('request-error').catch((e) => {
        console.error('[DB] Reconnect after request error failed:', e?.message || e);
    });
    return true;
}

/** Ping SQL periodically so idle firewall/SQL drops are detected before user traffic. */
function startDbKeepAlive(intervalMs = 30000) {
    if (keepAliveTimer) return;
    const ms = parseInt(process.env.DB_KEEPALIVE_MS || String(intervalMs), 10);
    if (!Number.isFinite(ms) || ms <= 0) return;

    keepAliveTimer = setInterval(async () => {
        if (keepAliveRunning || reconnectPromise) return;
        keepAliveRunning = true;
        try {
            if (!isPoolConnected()) {
                await reconnectDB('keep-alive-not-connected');
                return;
            }
            await pingDb();
            poolHealthy = true;
            lastSuccessfulPingAt = Date.now();
        } catch (err) {
            console.error('[DB] Keep-alive failed, reconnecting:', err?.message || err);
            try {
                await reconnectDB('keep-alive-failed');
            } catch (reconnectErr) {
                console.error('[DB] Reconnect after keep-alive failed:', reconnectErr?.message || reconnectErr);
            }
        } finally {
            keepAliveRunning = false;
        }
    }, ms);
    if (typeof keepAliveTimer.unref === 'function') {
        keepAliveTimer.unref();
    }
}

function getPoolDiagnostics() {
    const pool = getPool();
    const max = config.pool.max;
    const min = config.pool.min;
    let used = null;
    let free = null;
    let pending = null;
    let size = null;

    try {
        const tarn = pool && pool.pool ? pool.pool : null;
        if (tarn) {
            if (typeof tarn.numUsed === 'function') used = tarn.numUsed();
            if (typeof tarn.numFree === 'function') free = tarn.numFree();
            if (typeof tarn.numPendingAcquires === 'function') pending = tarn.numPendingAcquires();
            if (typeof tarn.size === 'number') size = tarn.size;
            else if (used != null && free != null) size = used + free;
        }
    } catch (_) {
        /* ignore */
    }

    const usedPct =
        used != null && max > 0 ? Math.round((used / max) * 1000) / 10 : null;

    return {
        healthy: poolHealthy,
        connected: !!(pool && pool.connected),
        max,
        min,
        used,
        free,
        pending,
        size,
        usedPercent: usedPct,
        lastSuccessfulPingAt: lastSuccessfulPingAt || null,
        lastSuccessfulPingAgoSec: lastSuccessfulPingAt
            ? Math.max(0, Math.round((Date.now() - lastSuccessfulPingAt) / 1000))
            : null,
        server: config.server || null,
        database: config.database || null,
        connectionTimeoutMs: connectionTimeout,
        requestTimeoutMs: requestTimeout,
    };
}

module.exports = {
    sql,
    connectDB,
    connectDBWithRetry,
    reconnectDB,
    disconnectDB,
    isPoolConnected,
    isDbConnectionError,
    isPoolExhaustedError,
    markPoolUnhealthy,
    noteDbErrorFromRequest,
    ensureDbConnected,
    ensureDbMiddleware,
    withDb,
    startDbKeepAlive,
    getPool,
    getPoolDiagnostics,
    dbConfig: config,
};

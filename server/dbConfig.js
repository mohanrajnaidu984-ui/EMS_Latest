const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: String(process.env.DB_SERVER || '').trim(),
    database: process.env.DB_DATABASE,
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '30000', 10),
    },
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '30000', 10),
        requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT_MS || '60000', 10),
        enableArithAbort: true,
        useUTC: false,
    },
};

let connectPromise = null;
let keepAliveTimer = null;

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

function getPool() {
    return sql.pool || null;
}

function isPoolConnected() {
    const pool = getPool();
    return !!(pool && pool.connected);
}

async function disconnectDB() {
    connectPromise = null;
    try {
        await sql.close();
    } catch {
        /* pool may already be closed */
    }
}

function attachPoolErrorHandler(pool) {
    if (!pool || pool.__emsPoolErrorHandlerAttached) return;
    pool.__emsPoolErrorHandlerAttached = true;
    pool.on('error', (err) => {
        console.error('[DB] Pool error:', err?.message || err);
    });
}

const connectDB = async () => {
    validateDbEnv();

    const existing = getPool();
    if (existing?.connected) {
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
            if (existing && !existing.connected) {
                await disconnectDB();
            }
            const pool = await sql.connect(config);
            attachPoolErrorHandler(pool);
            console.log('Connected to MSSQL Database');
            return pool;
        } finally {
            connectPromise = null;
        }
    })();

    return connectPromise;
};

const connectDBWithRetry = async (retries = 5) => {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await connectDB();
        } catch (err) {
            lastErr = err;
            console.error(`[DB] Connect attempt ${attempt + 1}/${retries} failed:`, err.message);
            await disconnectDB();
            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
            }
        }
    }
    throw lastErr;
};

/** Ping SQL periodically so idle firewall/SQL drops are detected before user traffic. */
function startDbKeepAlive(intervalMs = 60000) {
    if (keepAliveTimer) return;
    const ms = parseInt(process.env.DB_KEEPALIVE_MS || String(intervalMs), 10);
    if (!Number.isFinite(ms) || ms <= 0) return;

    keepAliveTimer = setInterval(async () => {
        try {
            if (!isPoolConnected()) {
                await connectDB();
                return;
            }
            await sql.query`SELECT 1 AS ok`;
        } catch (err) {
            console.error('[DB] Keep-alive failed, reconnecting:', err?.message || err);
            await disconnectDB();
            try {
                await connectDB();
            } catch (reconnectErr) {
                console.error('[DB] Reconnect after keep-alive failed:', reconnectErr?.message || reconnectErr);
            }
        }
    }, ms);
    if (typeof keepAliveTimer.unref === 'function') {
        keepAliveTimer.unref();
    }
}

module.exports = {
    sql,
    connectDB,
    connectDBWithRetry,
    disconnectDB,
    isPoolConnected,
    startDbKeepAlive,
    dbConfig: config,
};

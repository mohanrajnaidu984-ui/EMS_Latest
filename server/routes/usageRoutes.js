'use strict';

const express = require('express');
const router = express.Router();
const { sql, getPool, getPoolDiagnostics } = require('../dbConfig');
const { getHostMetrics } = require('../lib/usageMetrics');
const {
    touchPresence,
    removePresence,
    listOnline,
    normalizeEmail,
    enrichPresenceFromDb,
    clientIp,
} = require('../lib/usagePresence');
const { getRequestStats } = require('../lib/usageRequestStats');

function measureEventLoopLagMs() {
    return new Promise((resolve) => {
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1e6;
            resolve(Math.round(lag * 10) / 10);
        });
    });
}

async function measureDbPing() {
    const t0 = Date.now();
    try {
        const pool = getPool();
        if (!pool || !pool.connected) {
            return { ok: false, ms: Date.now() - t0, error: 'Pool not connected' };
        }
        await pool.request().query('SELECT 1 AS ok');
        return { ok: true, ms: Date.now() - t0 };
    } catch (err) {
        return { ok: false, ms: Date.now() - t0, error: err?.message || 'ping failed' };
    }
}

function buildAlerts({ metrics, sqlPool, dbPing, eventLoopLagMs, sockets, requests }) {
    const alerts = [];
    const cpu = metrics?.cpu?.percent;
    const ram = metrics?.ram?.usedPercent;
    const keepAlive = metrics?.http?.keepAliveTimeoutMs || 0;
    const arrHint = (metrics?.http?.arrProxyTimeoutHintSec || 300) * 1000;

    if (cpu != null && cpu >= 85) {
        alerts.push({
            severity: 'danger',
            code: 'CPU_HIGH',
            message: `Host CPU is ${cpu}% — webserver may be overloaded (ChatBox polling + PDF + IIS).`,
        });
    } else if (cpu != null && cpu >= 70) {
        alerts.push({
            severity: 'warn',
            code: 'CPU_ELEVATED',
            message: `Host CPU is ${cpu}% — watch for concurrent ChatBox / Quote PDF load.`,
        });
    }

    if (ram != null && ram >= 90) {
        alerts.push({
            severity: 'danger',
            code: 'RAM_CRITICAL',
            message: `Host RAM is ${ram}% used — risk of swapping and PM2 restarts (EMS-API max ~4GB).`,
        });
    } else if (ram != null && ram >= 80) {
        alerts.push({
            severity: 'warn',
            code: 'RAM_HIGH',
            message: `Host RAM is ${ram}% used — consider more memory or moving PDF Chrome off this host.`,
        });
    }

    if (sqlPool?.pending > 0) {
        alerts.push({
            severity: 'danger',
            code: 'SQL_POOL_WAITING',
            message: `SQL pool has ${sqlPool.pending} waiting acquire(s) — entire EMS APIs will feel slow.`,
        });
    }
    if (sqlPool?.usedPercent != null && sqlPool.usedPercent >= 85) {
        alerts.push({
            severity: 'warn',
            code: 'SQL_POOL_NEAR_MAX',
            message: `SQL pool ${sqlPool.used}/${sqlPool.max} in use (${sqlPool.usedPercent}%). Chat peeks/unread can saturate this.`,
        });
    }
    if (sqlPool && sqlPool.healthy === false) {
        alerts.push({
            severity: 'danger',
            code: 'SQL_POOL_UNHEALTHY',
            message: 'SQL pool marked unhealthy — check DB connectivity / firewall idle drops.',
        });
    }

    if (dbPing && !dbPing.ok) {
        alerts.push({
            severity: 'danger',
            code: 'DB_PING_FAIL',
            message: `Database ping failed (${dbPing.ms}ms): ${dbPing.error || 'unknown'}`,
        });
    } else if (dbPing && dbPing.ms >= 500) {
        alerts.push({
            severity: 'warn',
            code: 'DB_PING_SLOW',
            message: `Database ping is ${dbPing.ms}ms — SQL Server or network path is slow.`,
        });
    }

    if (eventLoopLagMs != null && eventLoopLagMs >= 100) {
        alerts.push({
            severity: 'warn',
            code: 'EVENT_LOOP_LAG',
            message: `Node event-loop lag ${eventLoopLagMs}ms — API thread is busy (CPU or blocking work).`,
        });
    }

    if (sockets?.openConnections >= 80) {
        alerts.push({
            severity: 'warn',
            code: 'SOCKET_MANY',
            message: `${sockets.openConnections} ChatBox socket connections open (polling holds IIS/Node slots).`,
        });
    }

    if (requests?.http5xx > 0) {
        alerts.push({
            severity: 'danger',
            code: 'HTTP_5XX',
            message: `${requests.http5xx} HTTP 5xx responses in the last minute.`,
        });
    }
    if (requests?.slowRequests2s >= 5) {
        alerts.push({
            severity: 'warn',
            code: 'SLOW_API',
            message: `${requests.slowRequests2s} API calls took ≥2s in the last minute.`,
        });
    }

    if (keepAlive > 0 && keepAlive < arrHint) {
        alerts.push({
            severity: 'danger',
            code: 'KEEPALIVE_LT_ARR',
            message: `HTTP_KEEP_ALIVE_TIMEOUT_MS (${keepAlive}) is below ARR ~${arrHint}ms — intermittent 502 / backend disconnect.`,
        });
    }

    const rssMb = metrics?.processMemory?.rssMb;
    if (rssMb != null && rssMb >= 3000) {
        alerts.push({
            severity: 'warn',
            code: 'PROCESS_RSS_HIGH',
            message: `EMS-API RSS is ${rssMb} MB — approaching PM2 max_memory_restart (~4000 MB).`,
        });
    }

    return alerts;
}

function roleIsAdmin(roleString) {
    const rs = roleString || '';
    const roles =
        typeof rs === 'string'
            ? rs.split(',').map((r) => r.trim().toLowerCase())
            : Array.isArray(rs)
              ? rs.map((r) => String(r).trim().toLowerCase())
              : [];
    return roles.includes('admin') || roles.includes('system');
}

async function resolveAdminFromEmail(emailRaw) {
    const email = normalizeEmail(emailRaw);
    if (!email) return { ok: false, status: 401, error: 'email required' };
    if (email === 'ranigovardhan@gmail.com') {
        return { ok: true, email, roles: 'Admin', name: 'Admin' };
    }
    try {
        const result = await sql.query`
            SELECT TOP 1 FullName, Roles, Department, EmailId
            FROM Master_ConcernedSE
            WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
        `;
        const row = result.recordset?.[0];
        if (!row) return { ok: false, status: 401, error: 'User not found' };
        if (!roleIsAdmin(row.Roles)) {
            return { ok: false, status: 403, error: 'Admin access required' };
        }
        return {
            ok: true,
            email,
            name: row.FullName || email,
            roles: row.Roles || '',
            department: row.Department || '',
        };
    } catch (err) {
        console.error('[usage] resolveAdmin', err);
        return { ok: false, status: 500, error: 'Failed to verify admin' };
    }
}

/**
 * POST /api/usage/heartbeat
 * Any authenticated EMS user — keeps "currently logged in" list fresh.
 * Body/query: email, name?, department?, roles?
 */
router.post('/heartbeat', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email || req.query?.email);
        if (!email) return res.status(400).json({ error: 'email required' });

        let name = String(req.body?.name || req.body?.fullName || '').trim();
        let department = String(req.body?.department || '').trim();
        let roles = String(req.body?.roles || req.body?.role || '').trim();

        // Fill profile from DB when client sends incomplete data
        if (!name || !roles) {
            try {
                const result = await sql.query`
                    SELECT TOP 1 FullName, Roles, Department
                    FROM Master_ConcernedSE
                    WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${email}
                `;
                const u = result.recordset?.[0];
                if (u) {
                    name = name || u.FullName || '';
                    department = department || u.Department || '';
                    roles = roles || u.Roles || '';
                }
            } catch (_) {
                /* ignore lookup errors */
            }
        }

        const row = touchPresence({
            email,
            name,
            department,
            roles,
            ip: clientIp(req),
            userAgent: req.headers['user-agent'] || '',
        });
        void enrichPresenceFromDb(email);
        res.json({ ok: true, lastSeen: row?.lastSeen || Date.now() });
    } catch (err) {
        console.error('[usage] heartbeat', err);
        res.status(500).json({ error: 'Heartbeat failed' });
    }
});

/**
 * POST /api/usage/goodbye — optional on logout
 */
router.post('/goodbye', (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email || req.query?.email);
        if (email) removePresence(email);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Goodbye failed' });
    }
});

/**
 * GET /api/usage/summary — admin only
 * CPU, RAM, network, SQL pool, sockets, API latency, online users
 */
router.get('/summary', async (req, res) => {
    try {
        const admin = await resolveAdminFromEmail(req.query.email);
        if (!admin.ok) return res.status(admin.status).json({ error: admin.error });

        let socketStats = { openConnections: 0, engineClients: null, transports: [] };
        try {
            socketStats = require('../lib/chatboxRealtime').getChatboxSocketStats();
        } catch (_) {
            /* socket module optional at boot */
        }

        const [metrics, online, eventLoopLagMs, dbPing] = await Promise.all([
            getHostMetrics(),
            Promise.resolve(listOnline()),
            measureEventLoopLagMs(),
            measureDbPing(),
        ]);
        const sqlPool = getPoolDiagnostics();
        const requests = getRequestStats();
        const diagnostics = {
            sqlPool,
            dbPing,
            eventLoopLagMs,
            sockets: socketStats,
            requests,
            http: metrics.http || null,
        };
        const alerts = buildAlerts({
            metrics,
            sqlPool,
            dbPing,
            eventLoopLagMs,
            sockets: socketStats,
            requests,
        });

        res.json({
            ok: true,
            metrics,
            diagnostics,
            alerts,
            onlineCount: online.length,
            onlineUsers: online,
        });
    } catch (err) {
        console.error('[usage] summary', err);
        res.status(500).json({ error: 'Failed to load usage summary' });
    }
});

module.exports = router;

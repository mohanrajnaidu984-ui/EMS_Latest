'use strict';

/**
 * In-memory presence for EMS Usage page (who is currently logged in).
 * Cleared on process restart — acceptable for operational monitoring.
 *
 * Sources:
 * 1) Client heartbeat (AuthContext) every ~60s
 * 2) Any /api request that carries an email / userEmail (covers users who never hit Usage)
 */

const ONLINE_TTL_MS = 4 * 60 * 1000; // 4 minutes — matches ~60s heartbeat + idle cushion
/** @type {Map<string, { email: string, name: string, department: string, roles: string, lastSeen: number, ip: string, userAgent: string }>} */
const presence = new Map();
/** Avoid stampedes enriching the same email from Master_ConcernedSE */
const enrichInFlight = new Set();

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
}

function touchPresence({ email, name, department, roles, ip, userAgent }) {
    const key = normalizeEmail(email);
    if (!key) return null;
    // Ignore obvious non-user probes
    if (key === 'undefined' || key === 'null') return null;

    const prev = presence.get(key) || {};
    const nextName = String(name || prev.name || '').trim();
    const row = {
        email: key,
        name: nextName && nextName !== key ? nextName : nextName || key,
        department: String(department || prev.department || '').trim(),
        roles: String(roles || prev.roles || '').trim(),
        lastSeen: Date.now(),
        ip: String(ip || prev.ip || '').trim(),
        userAgent: String(userAgent || prev.userAgent || '').slice(0, 240),
    };
    presence.set(key, row);
    return row;
}

function removePresence(email) {
    const key = normalizeEmail(email);
    if (key) presence.delete(key);
}

function listOnline(now = Date.now()) {
    const cutoff = now - ONLINE_TTL_MS;
    const online = [];
    for (const [key, row] of presence.entries()) {
        if (!row || row.lastSeen < cutoff) {
            presence.delete(key);
            continue;
        }
        online.push({
            email: row.email,
            name: row.name,
            department: row.department,
            roles: row.roles,
            lastSeen: new Date(row.lastSeen).toISOString(),
            lastSeenAgoSec: Math.max(0, Math.round((now - row.lastSeen) / 1000)),
            ip: row.ip || null,
        });
    }
    online.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
    return online;
}

function extractEmailFromRequest(req) {
    const q = req.query || {};
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const candidates = [
        b.email,
        b.EmailId,
        b.userEmail,
        b.UserEmail,
        q.email,
        q.EmailId,
        q.userEmail,
        q.UserEmail,
    ];
    for (const c of candidates) {
        const e = normalizeEmail(c);
        if (e && e.includes('@')) return e;
    }
    return '';
}

function clientIp(req) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xf || req.socket?.remoteAddress || '';
}

/**
 * Express middleware — mark user online from normal EMS API traffic.
 */
function presenceMiddleware(req, res, next) {
    try {
        const path = String(req.originalUrl || req.path || req.url || '');
        if (!path.startsWith('/api')) return next();
        // Skip noisy/high-frequency / realtime endpoints
        if (
            path.startsWith('/api/usage/summary') ||
            path.startsWith('/api/health') ||
            path.startsWith('/api/socket.io') ||
            path.startsWith('/socket.io') ||
            (path.includes('/chatbox/') && path.includes('/messages/peek'))
        ) {
            return next();
        }

        const email = extractEmailFromRequest(req);
        if (email) {
            touchPresence({
                email,
                name: req.body?.name || req.body?.userName || req.body?.fullName || '',
                department: req.body?.department || '',
                roles: req.body?.roles || req.body?.role || '',
                ip: clientIp(req),
                userAgent: req.headers['user-agent'] || '',
            });
            // Lazy enrich name/dept/roles from DB once (non-blocking)
            void enrichPresenceFromDb(email);
        }
    } catch (_) {
        /* never block requests */
    }
    next();
}

async function enrichPresenceFromDb(email) {
    const key = normalizeEmail(email);
    if (!key || enrichInFlight.has(key)) return;
    const row = presence.get(key);
    if (!row) return;
    // Already has a real display name
    if (row.name && row.name !== key && row.roles) return;

    enrichInFlight.add(key);
    try {
        const { sql } = require('../dbConfig');
        const result = await sql.query`
            SELECT TOP 1 FullName, Roles, Department, EmailId
            FROM Master_ConcernedSE
            WHERE LOWER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(EmailId, N''))), N'@almcg.com', N'@almoayyedcg.com'), N'@ALMCG.COM', N'@almoayyedcg.com')) = ${key}
        `;
        const u = result.recordset?.[0];
        if (!u) return;
        touchPresence({
            email: key,
            name: u.FullName || '',
            department: u.Department || '',
            roles: u.Roles || '',
        });
    } catch (_) {
        /* ignore */
    } finally {
        enrichInFlight.delete(key);
    }
}

module.exports = {
    ONLINE_TTL_MS,
    touchPresence,
    removePresence,
    listOnline,
    normalizeEmail,
    presenceMiddleware,
    enrichPresenceFromDb,
    clientIp,
    extractEmailFromRequest,
};

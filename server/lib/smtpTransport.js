const nodemailer = require('nodemailer');
const dns = require('dns');

function stripQuotes(v) {
    if (v == null || v === '') return v;
    let s = String(v).trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
    }
    return s;
}

/** Default From address for all server-sent SMTP mail (SMTP_FROM, then SMTP_USER). */
function getSmtpFromEmail() {
    return stripQuotes(process.env.SMTP_FROM) || stripQuotes(process.env.SMTP_USER) || 'ems@almoayyedcg.com';
}

/**
 * Nodemailer transport aligned with Office 365–style SMTP:
 * - Port 465 → implicit TLS (secure: true)
 * - STARTTLS in env, or port 587 → requireTLS (upgrade before auth)
 */
function buildSmtpTransport(extra = {}, overrides = {}) {
    const host = String(overrides.host || process.env.SMTP_HOST || '').trim();
    const portRaw = overrides.port != null && overrides.port !== '' ? overrides.port : process.env.SMTP_PORT;
    const parsed = parseInt(String(portRaw != null && portRaw !== '' ? portRaw : '587'), 10);
    const portNum = Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
    const enc = String(process.env.SMTP_ENCRYPTION || '').trim().toUpperCase();
    const secure = portNum === 465;
    const requireTLS =
        !secure && (enc === 'STARTTLS' || enc === 'TLS' || portNum === 587);

    const authUser = stripQuotes(process.env.SMTP_USER);
    const authPass = stripQuotes(process.env.SMTP_PASS);

    const connectionTimeout = Math.min(
        120000,
        Math.max(5000, parseInt(String(process.env.SMTP_CONNECTION_TIMEOUT_MS || '45000'), 10) || 45000)
    );
    const greetingTimeout = Math.min(
        connectionTimeout,
        Math.max(5000, parseInt(String(process.env.SMTP_GREETING_TIMEOUT_MS || '30000'), 10) || 30000)
    );

    /** Force IPv4 when corporate IPv6 path is broken (set SMTP_IPV4=1 in .env). */
    const forceIpv4 = String(process.env.SMTP_IPV4 || '').trim() === '1';
    const lookup = forceIpv4
        ? (hostname, _opts, cb) => {
            dns.lookup(hostname, { family: 4 }, (err, address, family) => {
                if (err) return cb(err);
                cb(null, address, family);
            });
        }
        : undefined;

    const tlsServername =
        overrides.tlsServername ||
        process.env.SMTP_TLS_SERVERNAME ||
        host;

    return nodemailer.createTransport({
        host,
        port: portNum,
        secure,
        requireTLS,
        ...(lookup ? { lookup } : {}),
        auth: {
            user: authUser,
            pass: authPass
        },
        tls: {
            rejectUnauthorized: false,
            servername: tlsServername
        },
        connectionTimeout,
        greetingTimeout,
        ...extra
    });
}

module.exports = { buildSmtpTransport, stripQuotes, getSmtpFromEmail };

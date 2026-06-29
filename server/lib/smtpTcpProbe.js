const dns = require('dns').promises;
const net = require('net');

/**
 * Quick TCP probe (does not speak SMTP). Helps distinguish DNS vs firewall vs SMTP-level errors.
 */
function probeTcp(host, port, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 10000;
    const family = options.family === 4 ? 4 : 0;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            socket.destroy();
            resolve({ ok: false, error: `TCP connect timeout after ${timeoutMs}ms`, address: null });
        }, timeoutMs);

        const socket = net.createConnection(
            { host, port, family: family === 4 ? 4 : undefined },
            () => {
                clearTimeout(timer);
                const addr = socket.remoteAddress;
                socket.destroy();
                resolve({ ok: true, error: null, address: addr });
            }
        );
        socket.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, error: err.message || String(err), address: null });
        });
    });
}

async function probeHostPort(host, port, timeoutMs) {
    const results = [];
    try {
        const v4 = await dns.lookup(host, { family: 4 });
        const tcp = await probeTcp(v4.address, port, { timeoutMs, family: 4 });
        results.push({ label: `IPv4 ${v4.address}`, ...tcp });
    } catch (e) {
        results.push({ label: 'IPv4 lookup', ok: false, error: e.message || String(e) });
    }
    const byName = await probeTcp(host, port, { timeoutMs, family: 0 });
    results.push({ label: `hostname ${host}`, ...byName });
    return results;
}

module.exports = { probeTcp, probeHostPort };

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { probeHostPort } = require('./lib/smtpTcpProbe');

const run = async () => {
    const host = process.env.SMTP_HOST;
    const port = parseInt(String(process.env.SMTP_PORT || '587'), 10) || 587;
    const ms = parseInt(String(process.env.SMTP_CONNECTION_TIMEOUT_MS || '12000'), 10) || 12000;

    console.log('--- EMS SMTP TCP ping (no auth) ---');
    console.log('Target:', host, 'port:', port, 'timeout ms:', ms);
    const rows = await probeHostPort(host, port, ms);
    for (const r of rows) {
        console.log(r.label + ':', r.ok ? `OK (peer ${r.address || 'n/a'})` : r.error);
    }
    const anyOk = rows.some((r) => r.ok);
    if (!anyOk) {
        console.log('\nOutbound TCP to this host:port is blocked or unrouted from this machine.');
        console.log('Ask IT to allow outbound TCP 587 (or your org relay) toward Microsoft 365, or use an internal SMTP relay in .env.');
        process.exitCode = 1;
    }
};

run();

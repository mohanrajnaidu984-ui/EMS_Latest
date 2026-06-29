const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { buildSmtpTransport, stripQuotes } = require('./lib/smtpTransport');
const { probeHostPort } = require('./lib/smtpTcpProbe');

const run = async () => {
    const user = stripQuotes(process.env.SMTP_USER);
    const to = process.env.SMTP_TEST_TO || user;
    const portNum = parseInt(String(process.env.SMTP_PORT || '587'), 10) || 587;
    const tcpMs = Math.min(20000, Math.max(3000, parseInt(String(process.env.SMTP_CONNECTION_TIMEOUT_MS || '12000'), 10) || 12000));

    console.log('--- EMS SMTP test ---');
    console.log('Host:', process.env.SMTP_HOST);
    console.log('Port:', process.env.SMTP_PORT);
    console.log('Encryption:', process.env.SMTP_ENCRYPTION || '(not set)');
    console.log('SMTP_IPV4:', process.env.SMTP_IPV4 || '(not set — set to 1 if IPv6 path fails)');
    console.log('User:', user);
    console.log('Pass:', process.env.SMTP_PASS ? '******' : 'MISSING');
    console.log('To:', to);

    console.log('\n--- TCP reachability (before SMTP) ---');
    const probes = await probeHostPort(process.env.SMTP_HOST, portNum, tcpMs);
    for (const r of probes) {
        console.log(' ', r.label + ':', r.ok ? `OK (${r.address || 'connected'})` : r.error);
    }
    if (!probes.some((r) => r.ok)) {
        console.error('\nCannot open TCP to mail server. This is a network/firewall issue, not EMS app logic.');
        console.error('Try: 1) Set SMTP_IPV4=1 in server/.env  2) Ask IT for outbound 587 or an internal relay host/port.');
        console.error('PowerShell check: Test-NetConnection smtp.office365.com -Port', portNum);
        process.exitCode = 1;
        return;
    }

    const transporter = buildSmtpTransport({ logger: false, debug: false });

    try {
        await transporter.verify();
        console.log('SMTP verify: OK');

        const info = await transporter.sendMail({
            from: user,
            to,
            subject: `EMS SMTP test ${new Date().toISOString()}`,
            text: 'If you receive this, SMTP settings from server/.env are working.',
            html: '<p>If you receive this, SMTP settings from <code>server/.env</code> are working.</p>'
        });
        console.log('Test email sent. messageId:', info.messageId);
        console.log('Response:', info.response);
    } catch (err) {
        console.error('SMTP test failed:', err.message || err);
        if (err.response) console.error('SMTP response:', err.response);
        process.exitCode = 1;
    }
};

run();

/**
 * One-shot SMTP test that ALWAYS uses port 25 against the .env-configured host.
 *
 * The standard verify_smtp_auth.js picks port/encryption from environment; this
 * variant overrides them to port 25 + STARTTLS, enables full SMTP debug logging,
 * and bumps timeouts so we can see exactly which step (TCP / banner / EHLO /
 * STARTTLS / AUTH / DATA) breaks when the user insists on port 25 only.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Force port 25 / STARTTLS for this run, regardless of shell or .env overrides.
process.env.SMTP_PORT = '25';
process.env.SMTP_ENCRYPTION = 'STARTTLS';
process.env.SMTP_CONNECTION_TIMEOUT_MS = '60000';
process.env.SMTP_GREETING_TIMEOUT_MS = '60000';

const { buildSmtpTransport, stripQuotes } = require('./lib/smtpTransport');
const { probeHostPort } = require('./lib/smtpTcpProbe');

const run = async () => {
    const user = stripQuotes(process.env.SMTP_USER);
    // CLI override: `node verify_smtp_port25.js someone@example.com` wins over env.
    const cliTo = (process.argv[2] || '').trim();
    const to = cliTo || process.env.SMTP_TEST_TO || user;

    console.log('--- EMS SMTP test (PORT 25 ONLY) ---');
    console.log('Host:', process.env.SMTP_HOST);
    console.log('Port:', process.env.SMTP_PORT);
    console.log('Encryption:', process.env.SMTP_ENCRYPTION);
    console.log('SMTP_IPV4:', process.env.SMTP_IPV4 || '(not set)');
    console.log('User:', user);
    console.log('Pass:', process.env.SMTP_PASS ? '******' : 'MISSING');
    console.log('To:', to);
    console.log('Greeting timeout:', process.env.SMTP_GREETING_TIMEOUT_MS, 'ms');

    console.log('\n--- TCP reachability (port 25) ---');
    const probes = await probeHostPort(process.env.SMTP_HOST, 25, 15000);
    for (const r of probes) {
        console.log(' ', r.label + ':', r.ok ? `OK (${r.address || 'connected'})` : r.error);
    }
    if (!probes.some((r) => r.ok)) {
        console.error('\nNo TCP path to port 25 — firewall or DNS issue, not the app.');
        process.exitCode = 1;
        return;
    }

    const transporter = buildSmtpTransport({ logger: true, debug: true });

    try {
        await transporter.verify();
        console.log('\nSMTP verify: OK');

        const info = await transporter.sendMail({
            from: user,
            to,
            subject: `EMS SMTP test (port 25) ${new Date().toISOString()}`,
            text: 'If you receive this, the SMTP settings on port 25 are working.',
            html: '<p>If you receive this, the SMTP settings on <strong>port 25</strong> are working.</p>'
        });
        console.log('\nTest email sent. messageId:', info.messageId);
        console.log('Response:', info.response);
    } catch (err) {
        console.error('\nSMTP test failed:', err.message || err);
        if (err.response) console.error('SMTP response:', err.response);
        if (err.code) console.error('Error code:', err.code);
        process.exitCode = 1;
    }
};

run();

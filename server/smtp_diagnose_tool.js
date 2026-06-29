const nodemailer = require('nodemailer');
require('dotenv').config();

const cleanPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : '';

const configs = [
    {
        name: '1. Standard Auth (TLS)',
        options: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false, // StartTLS
            auth: { user: process.env.SMTP_USER, pass: cleanPass },
            tls: { rejectUnauthorized: false }
        }
    },
    {
        name: '2. Standard Auth (No TLS/Secure)',
        options: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: cleanPass },
            ignoreTLS: true
        }
    },
    {
        name: '3. No Auth (TLS)',
        options: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            tls: { rejectUnauthorized: false }
        }
    },
    {
        name: '4. No Auth (No TLS)',
        options: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            ignoreTLS: true
        }
    }
];

async function testAll() {
    console.log('--- SMTP DIAGNOSTIC TOOL ---');
    console.log(`Host: ${process.env.SMTP_HOST}`);
    console.log(`User: ${process.env.SMTP_USER}`);
    console.log('Testing 4 configurations...\n');

    for (const config of configs) {
        console.log(`Testing: ${config.name}...`);
        const transporter = nodemailer.createTransport(config.options);
        try {
            await transporter.verify();
            console.log(`✅ SUCCESS! ${config.name} works!`);
            console.log('Use these settings in emailService.js');
            return; // Stop after first success
        } catch (err) {
            console.log(`❌ Failed: ${err.message}`);
            if (err.responseCode) console.log(`   Response Code: ${err.responseCode}`);
        }
        console.log('-----------------------------------');
    }
    console.log('\n❌ ALL CONFIGURATIONS FAILED.');
    console.log('Please verify Host Availability, Firewall Rules, and Credentials.');
}

testAll();

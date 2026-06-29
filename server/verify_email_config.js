const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function verifyEmail() {
    console.log("--- Verifying Email Configuration ---");
    console.log(`SMTP Host: ${process.env.SMTP_HOST}`);
    console.log(`SMTP Port: ${process.env.SMTP_PORT}`);
    console.log(`SMTP User: ${process.env.SMTP_USER}`);
    const pass = process.env.SMTP_PASS || "";
    console.log(`SMTP Pass Length: ${pass.length}`);
    console.log(`SMTP Pass (First/Last): ${pass[0]}...${pass[pass.length - 1]}`);

    const configs = [
        { port: 587, secure: false, name: "STARTTLS (587)" },
        { port: 465, secure: true, name: "SSL/TLS (465)" }
    ];

    for (const conf of configs) {
        console.log(`\nTesting ${conf.name}...`);
        const isSecure = conf.port == 465;
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: conf.port,
            secure: isSecure,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        try {
            await transporter.verify();
            console.log(`✅ Connection verified successfully with ${conf.name}!`);

            // If successful, try sending
            console.log("Sending test email...");
            const info = await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: process.env.SMTP_USER,
                subject: "EMS Test Email",
                text: "This is a test email from the Enquiry Management System."
            });
            console.log("✅ Test email sent successfully!");
            return; // Exit on success
        } catch (error) {
            console.error(`❌ Failed with ${conf.name}:`, error.message);
            if (error.responseCode) console.error(`Response Code: ${error.responseCode}`);
        }
    }

    // If we reach here, no config worked
    console.log("❌ All configurations failed.");
}

verifyEmail();

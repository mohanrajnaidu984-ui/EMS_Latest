const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS.replace(/\s+/g, '')
    },
    debug: true,
    logger: true
});

const mailOptions = {
    from: process.env.SMTP_USER,
    to: process.env.SMTP_USER, // Send to self for testing
    subject: 'Test Email from EMS Debugger',
    text: 'If you receive this, the email configuration is correct.'
};

console.log('Attempting to send email...');
console.log('User:', process.env.SMTP_USER);

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error('Error sending email:', error);
    } else {
        console.log('Email sent: ' + info.response);
    }
});

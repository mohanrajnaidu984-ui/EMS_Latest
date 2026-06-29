const { buildSmtpTransport, stripQuotes, getSmtpFromEmail } = require('./smtpTransport');
const { filterNotificationRecipients } = require('./notificationEmailExclusions');

function splitRecipients(value) {
    return String(value || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Send internal enquiry notification via SMTP (Office 365).
 * Used when Outlook COM/VBScript is unavailable (e.g. IIS app pool).
 */
async function sendEnquiryNotificationViaSmtp({
    to,
    cc,
    subject,
    html,
    replyTo,
    fromEmail,
    fromDisplayName,
    transportOverrides,
    transportExtra,
} = {}) {
    const filtered = filterNotificationRecipients({
        toList: splitRecipients(to),
        ccList: splitRecipients(cc),
    });
    const toList = filtered.toList;
    const ccList = filtered.ccList;
    if (!toList.length) {
        throw new Error('No To recipients for enquiry notification');
    }

    const from = fromEmail ? fromEmail : getSmtpFromEmail();
    const transporter = transportOverrides
        ? buildSmtpTransport(transportExtra || {}, transportOverrides)
        : buildSmtpTransport(transportExtra || {});

    const replyToList = splitRecipients(replyTo);
    await transporter.sendMail({
        from,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        replyTo: replyToList.length ? replyToList : undefined,
        subject: String(subject || 'Enquiry notification'),
        html: String(html || ''),
    });

    return { from, to: filtered.to, cc: filtered.cc };
}

module.exports = { sendEnquiryNotificationViaSmtp, splitRecipients };

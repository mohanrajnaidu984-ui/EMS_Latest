const { buildSmtpTransport, stripQuotes, getSmtpFromEmail } = require('./smtpTransport');
const { filterNotificationRecipients, filterNotificationEmails } = require('./notificationEmailExclusions');

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
    bcc,
    subject,
    html,
    replyTo,
    fromEmail,
    fromDisplayName,
    transportOverrides,
    transportExtra,
    skipRecipientExclusions = false,
} = {}) {
    const normalizeList = (value) =>
        splitRecipients(value).map((s) => s.trim().toLowerCase()).filter(Boolean);

    let toList;
    let ccList;
    let bccList;
    if (skipRecipientExclusions) {
        toList = normalizeList(to);
        const toSet = new Set(toList);
        ccList = normalizeList(cc).filter((e) => !toSet.has(e));
        const ccSet = new Set([...toSet, ...ccList]);
        bccList = normalizeList(bcc).filter((e) => !ccSet.has(e));
    } else {
        const filtered = filterNotificationRecipients({
            toList: normalizeList(to),
            ccList: normalizeList(cc),
        });
        toList = filtered.toList;
        ccList = filtered.ccList;
        const seen = new Set([...toList, ...ccList]);
        bccList = filterNotificationEmails(normalizeList(bcc)).filter((e) => !seen.has(e));
    }
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
        bcc: bccList.length ? bccList : undefined,
        replyTo: replyToList.length ? replyToList : undefined,
        subject: String(subject || 'Enquiry notification'),
        html: String(html || ''),
    });

    return { from, to: toList.join('; '), cc: ccList.join('; '), bcc: bccList.join('; ') };
}

module.exports = { sendEnquiryNotificationViaSmtp, splitRecipients };

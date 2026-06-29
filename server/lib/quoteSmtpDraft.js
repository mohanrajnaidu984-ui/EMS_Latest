const MailComposer = require('nodemailer/lib/mail-composer');
const { stripQuotes } = require('./smtpTransport');

function splitRecipients(value) {
    return String(value || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function escapeDisplayName(name) {
    return String(name || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatFromAddress(email, displayName) {
    const addr = stripQuotes(email);
    if (!addr) return '';
    const dn = String(displayName || '').trim();
    if (!dn) return addr;
    return `"${escapeDisplayName(dn)}" <${addr}>`;
}

function plainTextToHtml(plain) {
    return String(plain ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '<br>\n');
}

/**
 * Build an RFC822 .eml message (X-Unsent: 1) so Outlook opens it as an editable draft.
 * From is the logged-in user; attachments are embedded (no VBScript/COM).
 */
async function buildQuoteEmlDraftBuffer(opts) {
    // No need to define from email ID as current user email ID; instead take the default user outlook account email id
    // We omit the From field in EML draft to let Outlook default to the active account.


    const attachments = [];
    if (opts.pdfBase64) {
        attachments.push({
            filename: String(opts.attachmentName || 'Quote.pdf').replace(/[/\\?%*:|"<>]/g, '_'),
            content: Buffer.from(opts.pdfBase64, 'base64'),
            contentType: 'application/pdf',
        });
    }
    for (const att of opts.extraAttachments || []) {
        if (!att?.base64) continue;
        attachments.push({
            filename: String(att.filename || 'attachment').replace(/[/\\?%*:|"<>]/g, '_'),
            content: Buffer.from(att.base64, 'base64'),
        });
    }

    const textBody = String(opts.body || '').trim();
    const htmlBody = opts.html ? String(opts.html) : plainTextToHtml(textBody);

    const composer = new MailComposer({
        to: splitRecipients(opts.to).join(', ') || undefined,
        cc: splitRecipients(opts.cc).length ? splitRecipients(opts.cc).join(', ') : undefined,
        bcc: splitRecipients(opts.bcc).length ? splitRecipients(opts.bcc).join(', ') : undefined,
        subject: String(opts.subject || '').trim() || 'Quotation',
        text: textBody || undefined,
        html: htmlBody || undefined,
        attachments,
        headers: {
            'X-Unsent': '1',
        },
    });

    return new Promise((resolve, reject) => {
        composer.compile().build((err, message) => {
            if (err) reject(err);
            else resolve(message);
        });
    });
}

module.exports = {
    buildQuoteEmlDraftBuffer,
    splitRecipients,
    formatFromAddress,
    plainTextToHtml,
};

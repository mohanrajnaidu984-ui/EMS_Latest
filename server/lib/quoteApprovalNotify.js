const { buildSmtpTransport, stripQuotes, getSmtpFromEmail } = require('./smtpTransport');
const { filterNotificationRecipients } = require('./notificationEmailExclusions');

/** Reuse one pooled O365 transport so each send skips a full TLS handshake. */
let approvalTransporter = null;
let approvalTransporterSig = '';

function approvalSmtpFastExtra() {
    const connect =
        parseInt(String(process.env.EMS_QUOTE_APPROVAL_SMTP_CONNECT_MS || '8000'), 10) || 8000;
    const greet =
        parseInt(String(process.env.EMS_QUOTE_APPROVAL_SMTP_GREETING_MS || '5000'), 10) || 5000;
    return {
        pool: true,
        maxConnections: 1,
        maxMessages: 100,
        connectionTimeout: connect,
        greetingTimeout: greet,
        socketTimeout: connect + 5000,
    };
}

function getQuoteApprovalSmtpOverrides() {
    /** Same relay as enquiry notifications (SMTP_HOST / SMTP_PORT). O365 submit (587) is often blocked on corp networks. */
    const host = String(
        process.env.EMS_QUOTE_APPROVAL_SMTP_HOST ||
            process.env.SMTP_HOST ||
            'smtp.office365.com'
    ).trim();
    const port =
        parseInt(
            String(
                process.env.EMS_QUOTE_APPROVAL_SMTP_PORT ||
                    process.env.SMTP_PORT ||
                    '587'
            ),
            10
        ) || 587;
    const tlsServername = String(
        process.env.EMS_QUOTE_APPROVAL_SMTP_TLS_SERVERNAME ||
            process.env.SMTP_TLS_SERVERNAME ||
            host
    ).trim();
    return { host, port, tlsServername };
}

function getQuoteApprovalTransporter() {
    const overrides = getQuoteApprovalSmtpOverrides();
    const user = stripQuotes(process.env.SMTP_USER) || '';
    const sig = `${overrides.host}:${overrides.port}:${user}`;
    if (approvalTransporter && approvalTransporterSig === sig) {
        return approvalTransporter;
    }
    approvalTransporter = buildSmtpTransport(approvalSmtpFastExtra(), overrides);
    approvalTransporterSig = sig;
    return approvalTransporter;
}

function splitApprovalRecipients(value) {
    return String(value || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

async function sendApprovalMailFast({ to, subject, html }) {
    const filtered = filterNotificationRecipients({
        toList: splitApprovalRecipients(to),
        ccList: [],
    });
    if (!filtered.toList.length) {
        throw new Error('No To recipients for approval notification');
    }

    const transporter = getQuoteApprovalTransporter();
    const t0 = Date.now();
    const fromAddress = getSmtpFromEmail();
    await transporter.sendMail({
        from: fromAddress,
        to: filtered.toList,
        subject: String(subject || 'Quote approval required'),
        html: String(html || ''),
    });
    console.log(`[quoteApprovalNotify] delivered in ${Date.now() - t0}ms via pooled SMTP`);
    return { from: fromAddress, to: filtered.to };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const WORKFLOW_STATUS_BADGES = {
    assigned: { bg: '#2563eb', icon: '&#8594;', label: 'Assigned' },
    approved: { bg: '#16a34a', icon: '&#10003;', label: 'Approved' },
    rejected: { bg: '#dc2626', icon: '&#10005;', label: 'Rejected' },
};

function buildWorkflowStatusBadgeHtml(status = 'assigned') {
    const norm = String(status || 'assigned').toLowerCase();
    const badge = WORKFLOW_STATUS_BADGES[norm] || WORKFLOW_STATUS_BADGES.assigned;
    return `<span style="display:inline-block; vertical-align:middle; white-space:nowrap; line-height:20px;">
        <span style="display:inline-block; width:20px; height:20px; min-width:20px; line-height:20px; text-align:center; border-radius:50%; background:${badge.bg}; color:#ffffff; font-size:12px; font-weight:700; font-family:Arial,sans-serif;">${badge.icon}</span>
        <span style="display:inline-block; margin-left:8px; font-size:12px; font-weight:600; color:#1e293b; vertical-align:middle; font-family:Arial,sans-serif;">${badge.label}</span>
    </span>`;
}

function buildApprovalDetailsTableHtml(fields = {}) {
    const rows = [
        ['Status', buildWorkflowStatusBadgeHtml(fields.workflowStatus), true],
        ['Quote Ref', fields.quoteRef],
        ['Workflow No', fields.workflowNo],
        ['Enquiry No', fields.enquiryNo],
        ['Project Name', fields.projectName],
        ['Customer Name', fields.customerName],
        ['Subject', fields.subject],
        ['Company Name', fields.companyName],
        ['Division Name', fields.divisionName],
        ['Approval Seeker', fields.approvalSeeker],
        ['Hierarchy Path', fields.hierarchyPath],
    ];

    const rowPx = 24;
    const labelCellStyle = [
        'height:24px',
        'max-height:24px',
        'padding:0 8px',
        'margin:0',
        'border:1px solid #d1d5db',
        'font-size:12px',
        'line-height:24px',
        'mso-line-height-rule:exactly',
        'vertical-align:middle',
        'font-weight:600',
        'background:#f1f5f9',
        'width:34%',
        'font-family:Arial,sans-serif',
        'color:#1e293b',
    ].join(';');
    const valueCellStyle = [
        'height:24px',
        'max-height:24px',
        'padding:0 8px',
        'margin:0',
        'border:1px solid #d1d5db',
        'font-size:12px',
        'line-height:24px',
        'mso-line-height-rule:exactly',
        'vertical-align:middle',
        'background:#ffffff',
        'font-family:Arial,sans-serif',
        'color:#1e293b',
    ].join(';');

    return rows
        .map(
            ([label, val, isHtml]) => `
        <tr height="${rowPx}" style="height:${rowPx}px; max-height:${rowPx}px; mso-line-height-rule:exactly;">
            <td height="${rowPx}" style="${labelCellStyle}">${escapeHtml(label)}</td>
            <td height="${rowPx}" style="${valueCellStyle}">${isHtml ? val : escapeHtml(val || '—')}</td>
        </tr>`
        )
        .join('');
}

function normalizeApprovalMailFields(input = {}) {
    const dash = (v) => (String(v ?? '').trim() || '—');
    const statusNorm = String(input.workflowStatus || '').trim().toLowerCase();
    const workflowStatus = WORKFLOW_STATUS_BADGES[statusNorm] ? statusNorm : 'assigned';
    return {
        workflowStatus,
        workflowNo: dash(input.workflowNo),
        enquiryNo: dash(input.enquiryNo),
        projectName: dash(input.projectName),
        customerName: dash(input.customerName),
        quoteRef: dash(input.quoteRef),
        subject: dash(input.subject),
        companyName: dash(input.companyName),
        divisionName: dash(input.divisionName),
        approvalSeeker: dash(input.approvalSeeker),
        hierarchyPath: dash(input.hierarchyPath),
    };
}

function buildQuoteApprovalRequiredHtml({ approverName, workflowStatus = 'assigned', ...mailFields }) {
    const fields = normalizeApprovalMailFields({ ...mailFields, workflowStatus });
    const tableRows = buildApprovalDetailsTableHtml(fields);

    return `
        <div style="font-family: Arial, sans-serif; color: #1e293b; font-size: 14px; line-height: 1.5;">
            <p style="margin:0 0 8px 0;">Dear ${escapeHtml(approverName || 'Approver')},</p>
            <p style="margin:0 0 8px 0;">Your approval is required for the following quote.</p>
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse; border-spacing:0; width:100%; max-width:640px; margin:8px 0; table-layout:fixed;">
                ${tableRows}
            </table>
            <p style="margin:8px 0 0 0;">Please open EMS Quote and complete your approval step.</p>
            <p style="margin-top:16px; font-size:12px; color:#64748b; font-style:italic;">* This is an auto generated email from Enquiry Management System *</p>
        </div>
    `;
}

function buildApprovalSubject(projectName) {
    const project = String(projectName || '').trim() || '—';
    return `Quote approval required for Project: ${project}`;
}

function isSameSmtpEndpoint(overrides) {
    const host = String(process.env.SMTP_HOST || '').trim().toLowerCase();
    const port = String(process.env.SMTP_PORT || '587').trim();
    return host === String(overrides.host || '').trim().toLowerCase() && port === String(overrides.port);
}

function approvalFallbackEnabled() {
    return String(process.env.EMS_QUOTE_APPROVAL_SMTP_FALLBACK || '0').trim() === '1';
}

async function sendQuoteApprovalRequestEmail({
    toEmail,
    approverName,
    enquiryNo,
    projectName,
    customerName,
    subject,
    workflowNo = '',
    quoteRef = '',
    companyName = '',
    divisionName = '',
    approvalSeeker = '',
    hierarchyPath = '',
    mailContext = null,
}) {
    const to = String(toEmail || '').trim();
    if (!to) {
        return { success: false, error: 'Approver email is required' };
    }

    const fields =
        mailContext ||
        normalizeApprovalMailFields({
            workflowNo,
            enquiryNo,
            projectName,
            customerName,
            quoteRef,
            subject,
            companyName,
            divisionName,
            approvalSeeker,
            hierarchyPath,
        });

    const html = buildQuoteApprovalRequiredHtml({
        approverName,
        workflowStatus: 'assigned',
        ...fields,
    });
    const mailSubject = buildApprovalSubject(fields.projectName);
    const approvalSmtp = getQuoteApprovalSmtpOverrides();
    const tStart = Date.now();

    try {
        console.log(
            `[quoteApprovalNotify] Sending to ${to} via ${approvalSmtp.host}:${approvalSmtp.port} as ${getSmtpFromEmail()}`
        );
        await sendApprovalMailFast({
            to,
            subject: mailSubject,
            html,
        });
        return { success: true, via: 'smtp-relay-pool', elapsedMs: Date.now() - tStart };
    } catch (primaryErr) {
        const primaryMessage = primaryErr?.message || String(primaryErr);
        console.warn(`[quoteApprovalNotify] SMTP failed after ${Date.now() - tStart}ms:`, primaryMessage);

        if (!approvalFallbackEnabled() || isSameSmtpEndpoint(approvalSmtp)) {
            return {
                success: false,
                error: primaryMessage,
                smtpError: primaryMessage,
                elapsedMs: Date.now() - tStart,
            };
        }

        try {
            const { sendEnquiryNotificationViaSmtp } = require('./enquiryNotifySmtp');
            const fastFailExtra = { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000 };
            console.log(
                `[quoteApprovalNotify] Fallback to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} (EMS_QUOTE_APPROVAL_SMTP_FALLBACK=1)`
            );
            await sendEnquiryNotificationViaSmtp({
                to,
                cc: '',
                subject: mailSubject,
                html,
                fromEmail: getSmtpFromEmail(),
                transportExtra: fastFailExtra,
            });
            return { success: true, via: 'smtp-fallback', elapsedMs: Date.now() - tStart };
        } catch (fallbackErr) {
            const fallbackMessage = fallbackErr?.message || String(fallbackErr);
            return {
                success: false,
                error: `Approval email failed (${approvalSmtp.host}:${approvalSmtp.port}): ${primaryMessage}`,
                smtpError: primaryMessage,
                fallbackSmtpError: fallbackMessage,
                elapsedMs: Date.now() - tStart,
            };
        }
    }
}

function buildQuoteApprovedForSubmissionHtml(mailFields = {}) {
    const fields = normalizeApprovalMailFields({
        ...mailFields,
        workflowStatus: mailFields.workflowStatus || 'approved',
    });
    const tableRows = buildApprovalDetailsTableHtml(fields);

    return `
        <div style="font-family: Arial, sans-serif; color: #1e293b; font-size: 14px; line-height: 1.5;">
            <p style="margin:0 0 8px 0;">Dear Team,</p>
            <p style="margin:0 0 8px 0;">The quote has been approved for submission.</p>
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse; border-spacing:0; width:100%; max-width:640px; margin:8px 0; table-layout:fixed;">
                ${tableRows}
            </table>
            <p style="margin:8px 0 0 0;">Please open EMS Quote to proceed with submission.</p>
            <p style="margin-top:16px; font-size:12px; color:#64748b; font-style:italic;">* This is an auto generated email from Enquiry Management System *</p>
        </div>
    `;
}

function buildQuoteApprovedSubject(projectName) {
    const project = String(projectName || '').trim() || '—';
    return `Quote approved for submission — Project: ${project}`;
}

async function sendQuoteApprovedForSubmissionEmails({
    toEmails = [],
    enquiryNo,
    projectName,
    customerName,
    subject,
    mailContext = null,
}) {
    const list = Array.isArray(toEmails) ? toEmails : [toEmails];
    const unique = Array.from(new Set(list.map((e) => String(e || '').trim()).filter(Boolean)));
    if (!unique.length) {
        return { success: false, error: 'No recipients for approval completion notification' };
    }

    const fields =
        mailContext ||
        normalizeApprovalMailFields({
            enquiryNo,
            projectName,
            customerName,
            subject,
        });

    const html = buildQuoteApprovedForSubmissionHtml({
        ...fields,
        workflowStatus: 'approved',
    });
    const mailSubject = buildQuoteApprovedSubject(fields.projectName);
    const approvalSmtp = getQuoteApprovalSmtpOverrides();
    const tStart = Date.now();

    try {
        console.log(
            `[quoteApprovalNotify] Approved-for-submission to ${unique.length} recipient(s) via ${approvalSmtp.host}:${approvalSmtp.port}`
        );
        await sendApprovalMailFast({
            to: unique.join(';'),
            subject: mailSubject,
            html,
        });
        return { success: true, via: 'smtp-relay-pool', elapsedMs: Date.now() - tStart, sentTo: unique };
    } catch (primaryErr) {
        const primaryMessage = primaryErr?.message || String(primaryErr);
        console.warn(
            `[quoteApprovalNotify] Approved-for-submission SMTP failed after ${Date.now() - tStart}ms:`,
            primaryMessage
        );

        if (!approvalFallbackEnabled() || isSameSmtpEndpoint(approvalSmtp)) {
            return {
                success: false,
                error: primaryMessage,
                smtpError: primaryMessage,
                elapsedMs: Date.now() - tStart,
            };
        }

        try {
            const { sendEnquiryNotificationViaSmtp } = require('./enquiryNotifySmtp');
            const fastFailExtra = { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000 };
            await sendEnquiryNotificationViaSmtp({
                to: unique.join(';'),
                cc: '',
                subject: mailSubject,
                html,
                fromEmail: getSmtpFromEmail(),
                transportExtra: fastFailExtra,
            });
            return { success: true, via: 'smtp-fallback', elapsedMs: Date.now() - tStart, sentTo: unique };
        } catch (fallbackErr) {
            const fallbackMessage = fallbackErr?.message || String(fallbackErr);
            return {
                success: false,
                error: `Approval completion email failed: ${primaryMessage}`,
                smtpError: primaryMessage,
                fallbackSmtpError: fallbackMessage,
                elapsedMs: Date.now() - tStart,
            };
        }
    }
}

module.exports = {
    sendQuoteApprovalRequestEmail,
    sendQuoteApprovedForSubmissionEmails,
    buildQuoteApprovalRequiredHtml,
    buildQuoteApprovedForSubmissionHtml,
    buildApprovalDetailsTableHtml,
    buildWorkflowStatusBadgeHtml,
    normalizeApprovalMailFields,
    buildApprovalSubject,
    buildQuoteApprovedSubject,
};

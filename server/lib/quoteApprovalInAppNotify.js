const sql = require('mssql');
const { normalizeApprovalEmail } = require('./approvalWorkflowJson');
const { removeExcludedFromEmailSet } = require('./notificationEmailExclusions');

function buildQuoteApprovalLinkPayload({ tab, requestNo, quoteId, quoteNumber }) {
    return JSON.stringify({
        tab: String(tab || 'Approvals'),
        requestNo: String(requestNo || '').trim(),
        quoteId: quoteId != null && String(quoteId).trim() ? String(quoteId).trim() : '',
        quoteNumber: String(quoteNumber || '').trim(),
    });
}

async function insertInAppNotificationsForEmails({
    recipientEmails = [],
    type,
    message,
    linkPayload,
    createdBy = 'System',
    excludeEmail = '',
}) {
    const emails = new Set();
    for (const raw of recipientEmails) {
        const e = normalizeApprovalEmail(raw);
        if (e) emails.add(e);
    }
    const exclude = normalizeApprovalEmail(excludeEmail);
    if (exclude) emails.delete(exclude);
    removeExcludedFromEmailSet(emails);
    if (!emails.size) return { inserted: 0 };

    const now = new Date();
    let inserted = 0;
    for (const email of emails) {
        const uRes = await sql.query`
            SELECT TOP 1 ID FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${email}
        `;
        const userId = uRes.recordset?.[0]?.ID;
        if (!userId) continue;
        await sql.query`
            INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy, CreatedAt)
            VALUES (${userId}, ${type}, ${message}, ${linkPayload}, ${createdBy}, ${now})
        `;
        inserted += 1;
    }
    return { inserted };
}

async function resolveTriggerDisplayName(triggerUserEmail, fallback = 'System') {
    const email = normalizeApprovalEmail(triggerUserEmail);
    if (!email) return String(fallback || 'System').trim() || 'System';
    try {
        const res = await sql.query`
            SELECT TOP 1 FullName FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${email}
        `;
        const name = String(res.recordset?.[0]?.FullName || '').trim();
        return name || email || fallback;
    } catch {
        return email || fallback;
    }
}

/** In-app bell notification when a quote is sent for approval. */
async function notifyQuoteAssignedForApprovalInApp({
    approverEmails = [],
    requestNo = '',
    projectName = '',
    quoteNumber = '',
    quoteId = null,
    triggerUserEmail = '',
    triggerUserName = '',
}) {
    const rn = String(requestNo || '').trim();
    if (!rn) return { inserted: 0 };
    const project = String(projectName || '').trim() || '—';
    const qRef = String(quoteNumber || '').trim();
    const message = qRef
        ? `Quote approval required — ${rn}, ${project} (${qRef})`
        : `Quote approval required — ${rn}, ${project}`;
    const linkPayload = buildQuoteApprovalLinkPayload({
        tab: 'Approvals',
        requestNo: rn,
        quoteId,
        quoteNumber: qRef,
    });
    const createdBy =
        String(triggerUserName || '').trim() ||
        (await resolveTriggerDisplayName(triggerUserEmail));
    return insertInAppNotificationsForEmails({
        recipientEmails: approverEmails,
        type: 'Quote Approval',
        message,
        linkPayload,
        createdBy,
        excludeEmail: triggerUserEmail,
    });
}

/** In-app bell notification when all approvers have approved the quote. */
async function notifyQuoteApprovedForSubmissionInApp({
    recipientEmails = [],
    requestNo = '',
    projectName = '',
    quoteNumber = '',
    quoteId = null,
    triggerUserName = '',
}) {
    const rn = String(requestNo || '').trim();
    if (!rn) return { inserted: 0 };
    const project = String(projectName || '').trim() || '—';
    const qRef = String(quoteNumber || '').trim();
    const message = qRef
        ? `Quote approved for submission — ${rn}, ${project} (${qRef})`
        : `Quote approved for submission — ${rn}, ${project}`;
    const linkPayload = buildQuoteApprovalLinkPayload({
        tab: 'Quote B2B',
        requestNo: rn,
        quoteId,
        quoteNumber: qRef,
    });
    const createdBy = String(triggerUserName || 'System').trim() || 'System';
    return insertInAppNotificationsForEmails({
        recipientEmails,
        type: 'Quote Approved',
        message,
        linkPayload,
        createdBy,
    });
}

module.exports = {
    buildQuoteApprovalLinkPayload,
    notifyQuoteAssignedForApprovalInApp,
    notifyQuoteApprovedForSubmissionInApp,
};

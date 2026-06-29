/**
 * Load customer acknowledgement draft targets (one per customer), SE contact, signatory, and CC.
 */
const { sql } = require('../dbConfig');
const {
    loadConcernedSeNamesFromDb,
    resolveToEmailsForSeNames,
    parseMailCsv,
    normalizeEmail,
    isExcludedCcEmail,
} = require('./enquiryOutlookEmailFields');

function normalizeTargets(raw) {
    return (Array.isArray(raw) ? raw : [])
        .map((t) => ({
            customerName: String(t.customerName || t.CustomerName || '').trim(),
            contactName: String(t.contactName || t.ContactName || '').trim(),
            companyName: String(t.companyName || t.CompanyName || '').trim(),
            email: normalizeEmail(t.email || t.EmailId),
        }))
        .filter((t) => t.email);
}

async function lookupReceivedFromEmail(contactName, companyName) {
    const contact = String(contactName || '').trim();
    const company = String(companyName || '').trim();
    if (!contact && !company) return '';

    if (contact && company) {
        const exact = await sql.query`
            SELECT TOP 1 LTRIM(RTRIM(EmailId)) AS EmailId
            FROM Master_ReceivedFrom
            WHERE UPPER(LTRIM(RTRIM(ISNULL(ContactName, N'')))) = UPPER(LTRIM(RTRIM(${contact})))
              AND UPPER(LTRIM(RTRIM(ISNULL(CompanyName, N'')))) = UPPER(LTRIM(RTRIM(${company})))
              AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            ORDER BY ID DESC
        `;
        const email = exact.recordset?.[0]?.EmailId;
        if (email) return normalizeEmail(email);
    }

    if (company) {
        const byCompany = await sql.query`
            SELECT TOP 1 LTRIM(RTRIM(EmailId)) AS EmailId
            FROM Master_ReceivedFrom
            WHERE UPPER(LTRIM(RTRIM(ISNULL(CompanyName, N'')))) = UPPER(LTRIM(RTRIM(${company})))
              AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            ORDER BY ID DESC
        `;
        const email = byCompany.recordset?.[0]?.EmailId;
        if (email) return normalizeEmail(email);
    }

    if (contact) {
        const byContact = await sql.query`
            SELECT TOP 1 LTRIM(RTRIM(EmailId)) AS EmailId
            FROM Master_ReceivedFrom
            WHERE UPPER(LTRIM(RTRIM(ISNULL(ContactName, N'')))) = UPPER(LTRIM(RTRIM(${contact})))
              AND LTRIM(RTRIM(ISNULL(EmailId, N''))) <> N''
            ORDER BY ID DESC
        `;
        const email = byContact.recordset?.[0]?.EmailId;
        if (email) return normalizeEmail(email);
    }

    return '';
}

/**
 * One draft per customer row, paired with Received From by insert order (ID).
 * @param {string} requestNo
 * @param {object[]} [clientTargets] - From form (preferred when emails present)
 */
async function loadCustomerAckTargets(requestNo, clientTargets = []) {
    const fromClient = normalizeTargets(clientTargets);
    if (fromClient.length) return fromClient;

    const reqNo = String(requestNo || '').trim();
    if (!reqNo) return [];

    const [custRes, rfRes] = await Promise.all([
        sql.query`
            SELECT CustomerName FROM EnquiryCustomer
            WHERE RequestNo = ${reqNo}
            ORDER BY ID
        `,
        sql.query`
            SELECT ContactName, CompanyName FROM ReceivedFrom
            WHERE RequestNo = ${reqNo}
            ORDER BY ID
        `,
    ]);

    const customers = custRes.recordset || [];
    const received = rfRes.recordset || [];
    const targets = [];

    for (let i = 0; i < customers.length; i++) {
        const rf = received[i];
        if (!rf) continue;
        const contactName = String(rf.ContactName || '').trim();
        const companyName = String(rf.CompanyName || '').trim();
        const email = await lookupReceivedFromEmail(contactName, companyName);
        if (!email) continue;
        targets.push({
            customerName: String(customers[i].CustomerName || '').trim(),
            contactName,
            companyName,
            email,
        });
    }

    return targets;
}

/** CC = all concerned SE emails + division CCMailIds (excluding configured addresses). */
async function resolveCustomerAckCcEmails(requestNo, options = {}) {
    const reqNo = String(requestNo || '').trim();
    let seNames = Array.isArray(options.concernedSEs)
        ? options.concernedSEs.map((s) => String(s || '').trim()).filter(Boolean)
        : [];
    if (!seNames.length && reqNo) {
        seNames = await loadConcernedSeNamesFromDb(reqNo);
    }

    const ccSet = new Set(await resolveToEmailsForSeNames(seNames));

    if (reqNo) {
        try {
            const ccRes = await sql.query`
                SELECT DISTINCT M.CCMailIds
                FROM dbo.EnquiryFor E
                INNER JOIN dbo.Master_EnquiryFor M ON (
                    E.ItemName = M.ItemName
                    OR E.ItemName LIKE N'% - ' + M.ItemName
                    OR E.ItemName LIKE N'%- ' + M.ItemName
                    OR E.ItemName LIKE M.ItemName + N' %'
                )
                WHERE E.RequestNo = ${reqNo}
                  AND LTRIM(RTRIM(ISNULL(M.CCMailIds, N''))) <> N''
            `;
            for (const row of ccRes.recordset || []) {
                parseMailCsv(row.CCMailIds).forEach((e) => {
                    const norm = normalizeEmail(e);
                    if (norm && !isExcludedCcEmail(norm)) {
                        ccSet.add(norm);
                    }
                });
            }
        } catch (err) {
            console.error('[customer-ack] CC lookup failed:', err.message);
        }
    }

    const ccList = [...ccSet];
    return { cc: ccList.join('; '), ccList };
}

async function loadSeContact(seFullName) {
    const seName = String(seFullName || '').trim();
    if (!seName) return { fullName: '', mobile: '', email: '' };

    const res = await sql.query`
        SELECT TOP 1
            LTRIM(RTRIM(FullName)) AS FullName,
            LTRIM(RTRIM(ISNULL(MobileNumber, N''))) AS MobileNumber,
            LOWER(LTRIM(RTRIM(EmailId))) AS EmailId
        FROM Master_ConcernedSE
        WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${seName})))
    `;
    const row = res.recordset?.[0];
    if (!row) {
        return { fullName: seName, mobile: '', email: '' };
    }
    return {
        fullName: row.FullName || seName,
        mobile: row.MobileNumber || '',
        email: normalizeEmail(row.EmailId),
    };
}

async function loadUserSignatory(createdByName, createdByEmail) {
    const name = String(createdByName || '').trim();
    const email = normalizeEmail(createdByEmail);
    let row = null;

    if (email) {
        const byEmail = await sql.query`
            SELECT TOP 1 FullName, Designation, MobileNumber, EmailId
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${email}
        `;
        row = byEmail.recordset?.[0];
    }
    if (!row && name) {
        const byName = await sql.query`
            SELECT TOP 1 FullName, Designation, MobileNumber, EmailId
            FROM Master_ConcernedSE
            WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${name})))
        `;
        row = byName.recordset?.[0];
    }

    const fullName = row?.FullName || name || '';
    const designation = row?.Designation || '';
    const mobile = row?.MobileNumber || '';
    const mail = row?.EmailId || createdByEmail || '';

    const lines = [fullName, designation, mobile ? `Mobile: ${mobile}` : '', mail ? `Email: ${mail}` : ''].filter(
        Boolean
    );
    const plain = lines.join('\n');
    const htmlLines = lines
        .map(
            (line) =>
                `<p style="margin:0 0 2px 0;font-family:'Segoe UI', SegoeUI, Tahoma, Arial, sans-serif;font-size:11pt;color:#1e293b;">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`
        )
        .join('');

    return { html: htmlLines, plain, fullName, designation, mobile, email: mail };
}

/** @deprecated Use loadCustomerAckTargets */
async function loadCustomerAckRecipients(requestNo) {
    const targets = await loadCustomerAckTargets(requestNo);
    return targets.map((t) => ({
        email: t.email,
        contactName: t.contactName,
        companyName: t.companyName,
    }));
}

module.exports = {
    loadCustomerAckTargets,
    loadCustomerAckRecipients,
    resolveCustomerAckCcEmails,
    loadSeContact,
    loadUserSignatory,
    lookupReceivedFromEmail,
    normalizeEmail,
    normalizeTargets,
};

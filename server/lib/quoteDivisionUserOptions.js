const sql = require('mssql');
const { normalizeUserEmail } = require('./digitalSignaturesJson');
const { parseMailCsv } = require('./enquiryOutlookEmailFields');
const { isExcludedNotificationEmail } = require('./notificationEmailExclusions');

const WEAK_DEPT_LABELS = new Set([
    'project', 'projects', 'general', 'gen', 'sales', 'all', 'na', 'n/a', 'tbd',
    'department', 'dept', 'division', 'group', 'company', 'contracting', 'contract',
    'office', 'branch', 'region', 'hq', 'unit', 'section', 'team', 'main', 'staff',
]);

function normKey(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normDeptLabel(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function stripJobPrefix(name) {
    return String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
}

function departmentMatchesDivisionStrict(masterDept, labels) {
    const deptNorm = normDeptLabel(masterDept);
    if (!deptNorm) return false;
    return labels.some((label) => normDeptLabel(label) === deptNorm);
}

function departmentMatchesSelectedCustomer(masterDept, customerLabel) {
    const a = String(masterDept || '').toLowerCase().trim();
    const c = String(customerLabel || '').toLowerCase().trim();
    if (!a || !c) return false;
    if (a === c) return true;
    const nkA = normKey(a);
    const nkC = normKey(c);
    if (nkA.length >= 3 && nkC.length >= 3) {
        if (nkA === nkC || nkA.includes(nkC) || nkC.includes(nkA)) return true;
    }
    if (a.includes(c) || c.includes(a)) {
        if (a !== c) {
            const shorter = a.length <= c.length ? a : c;
            const longer = a.length <= c.length ? c : a;
            if (WEAK_DEPT_LABELS.has(shorter) && longer.includes(shorter)) return false;
        }
        return true;
    }
    const custTok = c.split(/[^a-z0-9]+/).filter((p) => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
    const deptTok = a.split(/[^a-z0-9]+/).filter((p) => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
    if (custTok.length && custTok.some((t) => a.includes(t))) return true;
    if (deptTok.length && deptTok.some((t) => c.includes(t))) return true;
    return false;
}

function departmentMatchesAnyLabel(masterDept, labels) {
    const uniq = [...new Set((labels || []).map((s) => String(s || '').trim()).filter(Boolean))];
    return uniq.some((lab) => departmentMatchesSelectedCustomer(masterDept, lab));
}

function divisionContextLabels(division) {
    const div = String(division || '').trim();
    if (!div) return [];
    const clean = stripJobPrefix(div);
    const labels = [div];
    if (clean && clean !== div) labels.push(clean);
    return [...new Set(labels)];
}

function isExcludedQuotePickerUser(u) {
    return isExcludedNotificationEmail(u?.EmailId);
}

function userToOption(u, type = 'Division', { allowExcluded = false } = {}) {
    // Notification exclusions block mail only — Signatory may still list those CCMailIds.
    if (!allowExcluded && isExcludedQuotePickerUser(u)) return null;
    const fullName = String(u.FullName || '').trim();
    if (!fullName) return null;
    return {
        value: fullName,
        label: fullName,
        designation: String(u.Designation || '').trim(),
        mobileNumber: u.MobileNumber != null ? String(u.MobileNumber).trim() : '',
        type,
    };
}

function dedupeOptions(options) {
    const seen = new Set();
    const out = [];
    for (const opt of options || []) {
        if (!opt?.value || seen.has(opt.value)) continue;
        seen.add(opt.value);
        out.push(opt);
    }
    return out;
}

function sortSignatoryOptions(options) {
    return [...options].sort((a, b) => {
        const aDes = (a.designation || '').toLowerCase();
        const bDes = (b.designation || '').toLowerCase();
        const isAManager =
            aDes.includes('manager') ||
            aDes.includes('chief') ||
            aDes.includes('head') ||
            aDes.includes('director');
        const isBManager =
            bDes.includes('manager') ||
            bDes.includes('chief') ||
            bDes.includes('head') ||
            bDes.includes('director');
        if (isAManager && !isBManager) return -1;
        if (!isAManager && isBManager) return 1;
        return String(a.label || '').localeCompare(String(b.label || ''));
    });
}

function sortPreparedByOptions(options) {
    return [...options].sort((a, b) =>
        String(a.label || '').localeCompare(String(b.label || ''))
    );
}

function masterEnquiryForRowMatchesDivision(row, labels) {
    const rowLabels = [row.DepartmentName, row.ItemName, stripJobPrefix(row.ItemName)].filter(Boolean);
    return rowLabels.some((rl) => departmentMatchesDivisionStrict(rl, labels));
}

function collectDivisionCcEmails(mefRows, labels, { applyNotificationExclusions = true } = {}) {
    const ccEmails = new Set();
    for (const row of mefRows || []) {
        if (!masterEnquiryForRowMatchesDivision(row, labels)) continue;
        for (const em of parseMailCsv(row.CCMailIds)) {
            const normalized = normalizeUserEmail(em);
            if (!normalized) continue;
            if (applyNotificationExclusions && isExcludedNotificationEmail(normalized)) continue;
            ccEmails.add(normalized);
        }
    }
    return ccEmails;
}

function usersMatchingCcEmails(users, ccEmails, type, { allowExcluded = false } = {}) {
    return dedupeOptions(
        (users || [])
            .filter((u) => {
                if (!allowExcluded && isExcludedQuotePickerUser(u)) return false;
                const em = normalizeUserEmail(u.EmailId);
                return em && ccEmails.has(em);
            })
            .map((u) => userToOption(u, type, { allowExcluded }))
            .filter(Boolean)
    );
}

async function fetchQuoteDivisionUserOptions(division) {
    const labels = divisionContextLabels(division);
    if (!labels.length) {
        return { preparedByOptions: [], signatoryOptions: [] };
    }

    const usersRes = await sql.query`
        SELECT FullName, Designation, EmailId, Department, MobileNumber, Prefix
        FROM Master_ConcernedSE
        WHERE ISNULL(Status, N'Active') = N'Active'
           OR LTRIM(RTRIM(ISNULL(Status, N''))) = N''
        ORDER BY FullName
    `;
    const usersAll = usersRes.recordset || [];
    // Prepared By still omits notification-only addresses (ED/CEO/etc.).
    const users = usersAll.filter((u) => !isExcludedQuotePickerUser(u));

    const divisionConcernedSeOptions = dedupeOptions(
        users
            .filter((u) => departmentMatchesDivisionStrict(u.Department, labels))
            .map((u) => userToOption(u, 'PreparedBy'))
            .filter(Boolean)
    );

    const safeDiv = labels[0].replace(/[%_\[\]]/g, '');
    const likePat = `%${safeDiv}%`;
    const mefRes = await sql.query`
        SELECT ItemName, DepartmentName, CCMailIds
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) = LTRIM(RTRIM(${labels[0]}))
           OR LTRIM(RTRIM(ISNULL(ItemName, N''))) = LTRIM(RTRIM(${labels[0]}))
           OR LTRIM(RTRIM(ISNULL(ItemName, N''))) LIKE ${likePat}
           OR LTRIM(RTRIM(ISNULL(DepartmentName, N''))) LIKE ${likePat}
    `;

    const mefRows = mefRes.recordset || [];
    const ccEmailsPrepared = collectDivisionCcEmails(mefRows, labels, {
        applyNotificationExclusions: true,
    });
    const ccMailUserOptions = usersMatchingCcEmails(users, ccEmailsPrepared, 'PreparedBy');

    const preparedByOptions = sortPreparedByOptions(
        dedupeOptions([...divisionConcernedSeOptions, ...ccMailUserOptions])
    );

    // Signatory / Co-Signatory: every CCMailId on the selected division (mapped to SE names).
    const ccEmailsSignatory = collectDivisionCcEmails(mefRows, labels, {
        applyNotificationExclusions: false,
    });
    let signatoryOptions = sortSignatoryOptions(
        usersMatchingCcEmails(usersAll, ccEmailsSignatory, 'Signatory', { allowExcluded: true })
    );
    if (signatoryOptions.length === 0) {
        signatoryOptions = preparedByOptions;
    }

    return { preparedByOptions, signatoryOptions };
}

module.exports = {
    departmentMatchesAnyLabel,
    departmentMatchesDivisionStrict,
    divisionContextLabels,
    fetchQuoteDivisionUserOptions,
};

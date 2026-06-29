
const express = require('express');
const router = express.Router();
const { sql } = require('../dbConfig');

// --- Helper: Format RequestNo for SQL LIKE if needed, or simple exact match ---
const normalizeUserEmail = (email) =>
    (email || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/@almcg\.com$/i, '@almoayyedcg.com');
const norm = (s) => (s || '').toString().trim().toLowerCase();
let probabilityTableReady = false;

const resolveCurrentUser = async (userEmail) => {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;

    const userRes = await sql.query`
        SELECT TOP 1 FullName, Roles
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail}
    `;
    if (!userRes.recordset?.length) return null;

    return {
        email: normalizedEmail,
        fullName: (userRes.recordset[0].FullName || '').toString().trim(),
        roles: (userRes.recordset[0].Roles || '').toString().trim()
    };
};

const resolveProbabilityDivisionScope = async (userEmail, requestedDivision = '') => {
    const normalizedEmail = normalizeUserEmail(userEmail);
    if (!normalizedEmail) return null;

    const userRes = await sql.query`
        SELECT TOP 1 FullName, Roles, Department
        FROM Master_ConcernedSE
        WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail}
    `;
    const baseUser = userRes.recordset?.[0] || {};
    const localPart = normalizedEmail.split('@')[0] || '';
    const localEmailPattern = `%${localPart}@%`;

    const ccReq = new sql.Request();
    ccReq.input('userEmail', sql.NVarChar, normalizedEmail);
    ccReq.input('localEmailPattern', sql.NVarChar, localEmailPattern);
    const ccRes = await ccReq.query(`
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) AS DepartmentName
        FROM Master_EnquiryFor mef
        WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, ''))) <> ''
          AND (
            ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
              LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@userEmail, '')))) + ',%'
            OR (
              @localEmailPattern <> '%@%'
              AND ',' + REPLACE(REPLACE(LOWER(ISNULL(mef.CCMailIds, '')), ' ', ''), ';', ',') + ','
                 LIKE '%,' + LOWER(LTRIM(RTRIM(ISNULL(@localEmailPattern, ''))))
            )
          )
        ORDER BY DepartmentName
    `);
    const ccDivisions = (ccRes.recordset || [])
        .map((r) => String(r.DepartmentName || '').trim())
        .filter(Boolean);

    const nonCcDepartment = String(baseUser.Department || '').trim();
    const roleStr = String(baseUser.Roles || '').toLowerCase();
    const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
    const isManagementDept = nonCcDepartment.toLowerCase() === 'management';
    const isCcUser = ccDivisions.length > 0 || isManagementDept || isAdmin;
    const isKnownProfileUser = !!String(baseUser.FullName || '').trim() || !!nonCcDepartment;
    if (!isKnownProfileUser && !isCcUser) return null;

    let divisions = [];
    if (isCcUser) {
        if (isManagementDept || isAdmin) {
            const allDivRes = await sql.query(`
                SELECT DISTINCT LTRIM(RTRIM(ISNULL(DepartmentName, ''))) AS DepartmentName
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(DepartmentName, ''))) <> ''
                ORDER BY DepartmentName
            `);
            divisions = (allDivRes.recordset || [])
                .map((r) => String(r.DepartmentName || '').trim())
                .filter(Boolean);
        } else {
            divisions = ccDivisions;
        }
    } else {
        divisions = nonCcDepartment ? [nonCcDepartment] : [];
    }
    if (!divisions.length) return null;

    const reqDiv = String(requestedDivision || '').trim();
    const reqDivNorm = norm(reqDiv);
    const matchedRequestedDivision = reqDiv && divisions.find((d) => norm(d) === reqDivNorm);
    const chosenDivision = reqDiv ? (matchedRequestedDivision || '') : divisions[0];
    // Enforce strict own-job division from dropdown only (no fuzzy fallback).
    const ownJobDivision = chosenDivision;

    if (!chosenDivision) {
        return null;
    }

    return {
        email: normalizedEmail,
        fullName: String(baseUser.FullName || '').trim(),
        roles: String(baseUser.Roles || '').trim(),
        isCcUser,
        divisions,
        division: chosenDivision,
        ownJobDivision,
    };
};

const hasEnquiryDivisionAccess = async (requestNo, division) => {
    const req = new sql.Request();
    req.input('requestNo', sql.NVarChar, String(requestNo || '').trim());
    req.input('division', sql.NVarChar, String(division || '').trim());
    const result = await req.query(`
        SELECT TOP 1 1 AS ok
        FROM EnquiryFor ef
        JOIN Master_EnquiryFor mef
          ON (
            ef.ItemName = mef.ItemName
            OR ef.ItemName LIKE '%- ' + mef.ItemName
            OR ef.ItemName LIKE '%-' + mef.ItemName
          )
        WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
          AND (
                UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                OR UPPER(LTRIM(RTRIM(ISNULL(mef.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
          )
    `);
    return (result.recordset?.length || 0) > 0;
};

const ensureProbabilityTable = async () => {
    if (probabilityTableReady) return;
    await sql.query(`
        IF OBJECT_ID('dbo.Probability', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.Probability (
                ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                RequestNo NVARCHAR(50) NULL,
                ProjectName NVARCHAR(255) NULL,
                LeadJobName NVARCHAR(255) NULL,
                OwnJobName NVARCHAR(255) NULL,
                ToName NVARCHAR(255) NULL,
                TotalQuotedValue NVARCHAR(80) NULL,
                NetQuotedValue NVARCHAR(80) NULL,
                QuoteNo NVARCHAR(120) NULL,
                QuoteRevision NVARCHAR(40) NULL,
                QuoteRef NVARCHAR(120) NULL,
                Status NVARCHAR(80) NULL,
                ProbabilityChance NVARCHAR(120) NULL,
                ExpectedDate DATETIME NULL,
                ERPJobNo NVARCHAR(80) NULL,
                FinalJobValueBooked NVARCHAR(80) NULL,
                BookedDate DATETIME NULL,
                GrossMargin DECIMAL(10,2) NULL,
                ReasonForLoosing NVARCHAR(500) NULL,
                CompetitorPrice NVARCHAR(80) NULL,
                LostDate DATETIME NULL,
                HoldReason NVARCHAR(500) NULL,
                CencelledReason NVARCHAR(500) NULL,
                RetenderedReason NVARCHAR(500) NULL,
                Remarks NVARCHAR(MAX) NULL,
                UpdatedBy NVARCHAR(255) NULL,
                UpdatedDateTime DATETIME NOT NULL DEFAULT(GETDATE())
            );
            CREATE INDEX IX_Probability_RequestNo ON dbo.Probability (RequestNo, UpdatedDateTime DESC);
            CREATE INDEX IX_Probability_OwnJobName ON dbo.Probability (OwnJobName, UpdatedDateTime DESC);
        END
        IF COL_LENGTH('dbo.Probability', 'LeadJobName') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD LeadJobName NVARCHAR(255) NULL;
        END
        IF COL_LENGTH('dbo.Probability', 'PreparedBy') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD PreparedBy NVARCHAR(255) NULL;
        END
        IF COL_LENGTH('dbo.Probability', 'QuoteOwnJob') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD QuoteOwnJob NVARCHAR(255) NULL;
        END
        IF COL_LENGTH('dbo.Probability', 'LostTo') IS NULL
        BEGIN
            ALTER TABLE dbo.Probability ADD LostTo NVARCHAR(255) NULL;
        END
    `);
    probabilityTableReady = true;
};

const fetchQuoteRowByQuoteNumber = async (quoteNumber) => {
    const qn = String(quoteNumber || '').trim();
    if (!qn) return null;
    const rq = new sql.Request();
    rq.input('qn', sql.NVarChar, qn);
    const r = await rq.query(`
        SELECT TOP 1
            QuoteNo,
            RevisionNo,
            LeadJob,
            OwnJob,
            ToName,
            PreparedBy,
            TotalAmount
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(ISNULL(QuoteNumber, ''))) = LTRIM(RTRIM(ISNULL(@qn, '')))
    `);
    return r.recordset?.[0] || null;
};

const parseMoneyToDecimalString = (value) => {
    const raw = String(value ?? '')
        .replace(/,/g, '')
        .replace(/BD/gi, '')
        .trim();
    if (!raw) return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return String(n);
};

/** Last path segment: ACC/CIP/9-L1/12-R0 → quoteNo "12", revision "0" */
const parseQuoteRefTail = (quoteRef) => {
    const s = String(quoteRef || '').trim();
    if (!s) return { quoteNo: '', revision: '' };
    const parts = s.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const m = last.match(/^(\d+)-R(\d+)$/i);
    if (m) return { quoteNo: m[1], revision: m[2] };
    const m2 = last.match(/^(\d+)/);
    return { quoteNo: m2 ? m2[1] : '', revision: '' };
};

const insertProbabilityHistory = async ({
    enquiryNo,
    projectName,
    leadJobName,
    division,
    toName,
    totalQuotedValue,
    netQuotedValue,
    quoteRef,
    status,
    probabilityOption,
    expectedDate,
    wonDetails,
    lostDetails,
    holdReason,
    cancelledReason,
    retenderedReason,
    remarks,
    updatedBy
}) => {
    await ensureProbabilityTable();
    const qRow = quoteRef ? await fetchQuoteRowByQuoteNumber(quoteRef) : null;
    const tail = parseQuoteRefTail(quoteRef);
    const quoteNoIns =
        qRow != null && qRow.QuoteNo != null && String(qRow.QuoteNo).trim() !== ''
            ? String(qRow.QuoteNo).trim()
            : tail.quoteNo || null;
    const revIns =
        qRow != null && qRow.RevisionNo != null && String(qRow.RevisionNo).trim() !== ''
            ? String(qRow.RevisionNo).trim()
            : tail.revision || null;
    const leadIns =
        (qRow && String(qRow.LeadJob || '').trim()) || String(leadJobName || '').trim() || null;
    const toIns =
        (qRow && String(qRow.ToName || '').trim()) || String(toName || '').trim() || null;
    const preparedByIns =
        qRow && String(qRow.PreparedBy || '').trim() ? String(qRow.PreparedBy).trim() : null;
    const quoteOwnJobIns =
        qRow && String(qRow.OwnJob || '').trim() ? String(qRow.OwnJob).trim() : null;
    const netQuotedFromQuote =
        qRow && qRow.TotalAmount != null
            ? parseMoneyToDecimalString(qRow.TotalAmount)
            : '';
    const netQuotedIns = netQuotedFromQuote || String(netQuotedValue || '').trim() || null;

    const req = new sql.Request();
    req.input('RequestNo', sql.NVarChar, String(enquiryNo || '').trim() || null);
    req.input('ProjectName', sql.NVarChar, String(projectName || '').trim() || null);
    req.input('LeadJobName', sql.NVarChar, leadIns);
    req.input('OwnJobName', sql.NVarChar, String(division || '').trim() || null);
    req.input('ToName', sql.NVarChar, toIns);
    // History: do not persist total quoted (ownjob+subjobs); keep column NULL on insert.
    req.input('TotalQuotedValue', sql.NVarChar, null);
    req.input('NetQuotedValue', sql.NVarChar, netQuotedIns);
    req.input('QuoteNo', sql.NVarChar, quoteNoIns);
    req.input('QuoteRevision', sql.NVarChar, revIns);
    req.input('QuoteRef', sql.NVarChar, String(quoteRef || '').trim() || null);
    req.input('PreparedBy', sql.NVarChar, preparedByIns);
    req.input('QuoteOwnJob', sql.NVarChar, quoteOwnJobIns);
    req.input('Status', sql.NVarChar, String(status || '').trim() || null);
    req.input('ProbabilityChance', sql.NVarChar, String(probabilityOption || '').trim() || null);
    req.input('ExpectedDate', sql.DateTime, expectedDate ? new Date(expectedDate) : null);
    req.input('ERPJobNo', sql.NVarChar, wonDetails?.jobNo ? String(wonDetails.jobNo).trim() : null);
    const statusStr = String(status || '').trim();
    const isWon = statusStr === 'Won';
    const rawWonVal = String(wonDetails?.orderValue || '')
        .replace(/,/g, '')
        .replace(/BD/gi, '')
        .trim();
    const wonNum = rawWonVal === '' ? NaN : parseFloat(rawWonVal);
    const wonBookedOk = isWon && Number.isFinite(wonNum) && wonNum > 0;
    req.input(
        'FinalJobValueBooked',
        sql.NVarChar,
        wonBookedOk ? rawWonVal : null
    );
    req.input(
        'BookedDate',
        sql.DateTime,
        wonBookedOk && expectedDate ? new Date(expectedDate) : null
    );
    req.input(
        'GrossMargin',
        sql.Decimal(10, 2),
        wonBookedOk && wonDetails?.grossProfit != null && wonDetails?.grossProfit !== ''
            ? parseFloat(wonDetails.grossProfit)
            : null
    );
    req.input('ReasonForLoosing', sql.NVarChar, lostDetails?.reason ? String(lostDetails.reason).trim() : null);
    req.input('CompetitorPrice', sql.NVarChar, lostDetails?.competitorPrice ? String(lostDetails.competitorPrice).replace(/,/g, '').trim() : null);
    req.input('LostDate', sql.DateTime, lostDetails?.lostDate ? new Date(lostDetails.lostDate) : null);
    // Persist the "Lost To" contractor/client name in its own column so the list view can read it back.
    req.input('LostTo', sql.NVarChar, lostDetails?.customer ? String(lostDetails.customer).trim() : null);
    req.input('HoldReason', sql.NVarChar, holdReason ? String(holdReason).trim() : null);
    req.input('CencelledReason', sql.NVarChar, cancelledReason ? String(cancelledReason).trim() : null);
    req.input('RetenderedReason', sql.NVarChar, retenderedReason ? String(retenderedReason).trim() : null);
    req.input('Remarks', sql.NVarChar(sql.MAX), remarks ? String(remarks) : null);
    req.input('UpdatedBy', sql.NVarChar, String(updatedBy || '').trim() || null);
    await req.query(`
        INSERT INTO dbo.Probability (
            RequestNo, ProjectName, LeadJobName, OwnJobName, ToName, TotalQuotedValue, NetQuotedValue,
            QuoteNo, QuoteRevision, QuoteRef, PreparedBy, QuoteOwnJob, Status, ProbabilityChance, ExpectedDate,
            ERPJobNo, FinalJobValueBooked, BookedDate, GrossMargin, ReasonForLoosing,
            CompetitorPrice, LostDate, LostTo, HoldReason, CencelledReason, RetenderedReason,
            Remarks, UpdatedBy
        ) VALUES (
            @RequestNo, @ProjectName, @LeadJobName, @OwnJobName, @ToName, @TotalQuotedValue, @NetQuotedValue,
            @QuoteNo, @QuoteRevision, @QuoteRef, @PreparedBy, @QuoteOwnJob, @Status, @ProbabilityChance, @ExpectedDate,
            @ERPJobNo, @FinalJobValueBooked, @BookedDate, @GrossMargin, @ReasonForLoosing,
            @CompetitorPrice, @LostDate, @LostTo, @HoldReason, @CencelledReason, @RetenderedReason,
            @Remarks, @UpdatedBy
        )
    `);
};

const hasProbabilityAccess = async (requestNo, userEmail) => {
    const user = await resolveCurrentUser(userEmail);
    if (!user?.fullName) return false;

    const accessReq = new sql.Request();
    accessReq.input('requestNo', sql.NVarChar, String(requestNo || '').trim());
    accessReq.input('fullName', sql.NVarChar, user.fullName);
    const accessRes = await accessReq.query(`
        SELECT TOP 1 1 AS ok
        FROM ConcernedSE cs
        WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
          AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@fullName, ''))))
    `);
    return (accessRes.recordset?.length || 0) > 0;
};

/** At least one saved quote for this enquiry in the selected division (quote number carries division code). */
function probabilityDivisionQuoteExistsSql() {
    return `
        EXISTS (
            SELECT 1
            FROM EnquiryQuotes Q
            JOIN Master_EnquiryFor mefQ
              ON (
                UPPER(LTRIM(RTRIM(ISNULL(mefQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                OR UPPER(LTRIM(RTRIM(ISNULL(mefQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
              )
            WHERE LTRIM(RTRIM(ISNULL(Q.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
              AND LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, ''))) <> ''
              AND (
                    CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(Q.QuoteNumber, ''))) > 0
                    OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '/', UPPER(ISNULL(Q.QuoteNumber, ''))) > 0
                    OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefQ.DivisionCode, '')))) + '-', UPPER(ISNULL(Q.QuoteNumber, ''))) > 0
              )
        )`;
}

/** Row displays as pending probability update (no terminal status on latest P row). */
function probabilityPendingLikeStatusSql() {
    return `(
        P.ID IS NULL
        OR LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) IN ('', 'pending')
        OR P.Status IN ('Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted')
    )`;
}

/** Pending update rows only when a division quote exists (ALL view + consistent with Pending Update mode). */
function appendExcludePendingLikeWithoutQuote(query) {
    query += `
        AND NOT (
            ${probabilityPendingLikeStatusSql()}
            AND NOT ${probabilityDivisionQuoteExistsSql()}
        ) `;
    return query;
}

/** Latest quote date for the enquiry (EnquiryQuotes.QuoteDate). */
function probabilityLatestQuoteDateSql() {
    return `(
        SELECT MAX(qEv.QuoteDate)
        FROM EnquiryQuotes qEv
        WHERE LTRIM(RTRIM(qEv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
          AND qEv.QuoteDate IS NOT NULL
    )`;
}

/**
 * Event date for list date-range filter (latest division-scoped P row), by status — used in ALL mode.
 */
function probabilityStatusEventDateSql() {
    const quoteDt = probabilityLatestQuoteDateSql();
    return `(
        CASE
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'won' THEN P.BookedDate
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'lost' THEN P.LostDate
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) IN ('onhold', 'on hold') THEN P.UpdatedDateTime
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'cancelled' THEN P.UpdatedDateTime
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) = 'retendered' THEN P.UpdatedDateTime
            WHEN LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) IN ('followup', 'follow-up', 'follow up') THEN P.UpdatedDateTime
            WHEN P.ID IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) IN ('', 'pending')
                OR LOWER(LTRIM(RTRIM(ISNULL(P.Status, '')))) IN ('enquiry', 'priced', 'estimated', 'quote', 'quoted')
                THEN ${quoteDt}
            ELSE NULL
        END
    )`;
}

function appendProbabilityQuoteDateFilter(query, fromDate, toDate) {
    if (!fromDate && !toDate) return query;
    const preds = ['qPd.QuoteDate IS NOT NULL'];
    if (fromDate) preds.push('CAST(MAX(qPd.QuoteDate) AS DATE) >= @fromDate');
    if (toDate) preds.push('CAST(MAX(qPd.QuoteDate) AS DATE) <= @toDate');
    query += `
        AND EXISTS (
            SELECT 1
            FROM EnquiryQuotes qPd
            WHERE LTRIM(RTRIM(qPd.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
            GROUP BY qPd.RequestNo
            HAVING ${preds.join(' AND ')}
        ) `;
    return query;
}

/** Append From/To filter — column depends on view mode / row status (ALL uses status-aware CASE). */
function appendProbabilityListDateFilter(query, mode, fromDate, toDate) {
    const m = String(mode || '').trim();
    if (!fromDate && !toDate) return query;

    if (m === 'All') {
        const eventDate = probabilityStatusEventDateSql();
        if (fromDate) {
            query += ` AND ${eventDate} IS NOT NULL AND CAST(${eventDate} AS DATE) >= @fromDate `;
        }
        if (toDate) {
            query += ` AND ${eventDate} IS NOT NULL AND CAST(${eventDate} AS DATE) <= @toDate `;
        }
        return query;
    }

    if (m === 'Pending') {
        return appendProbabilityQuoteDateFilter(query, fromDate, toDate);
    }

    let dateCol = null;
    if (m === 'Won') dateCol = 'P.BookedDate';
    else if (m === 'Lost') dateCol = 'P.LostDate';
    else if (m === 'OnHold') dateCol = 'P.UpdatedDateTime';
    else if (m === 'Cancelled') dateCol = 'P.UpdatedDateTime';
    else if (m === 'Retendered') dateCol = 'P.UpdatedDateTime';
    else if (m === 'FollowUp') dateCol = 'P.UpdatedDateTime';

    if (!dateCol) return query;

    if (fromDate) {
        query += ` AND ${dateCol} IS NOT NULL AND CAST(${dateCol} AS DATE) >= @fromDate `;
    }
    if (toDate) {
        query += ` AND ${dateCol} IS NOT NULL AND CAST(${dateCol} AS DATE) <= @toDate `;
    }
    return query;
}

// GET /api/probability/list
// Supports ?mode=[Pending|Won|Lost|OnHold|Cancelled|FollowUp|Retendered|All]
// &fromDate=... &toDate=... &probability=...
router.get('/list', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const { mode, fromDate, toDate, probability, userEmail: rawEmail, userDepartment, division: requestedDivision } = req.query;
        const userEmail = rawEmail ? rawEmail.toLowerCase().trim() : '';
        const divisionScope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        const currentUserFullName = divisionScope?.fullName || '';
        const effectiveDivision = String(divisionScope?.ownJobDivision || divisionScope?.division || '').trim();
        const isCcUser = !!divisionScope?.isCcUser;
        if (!isCcUser && !currentUserFullName) {
            return res.json([]);
        }
        if (!effectiveDivision) {
            return res.json([]);
        }
        console.log(`[Probability API V5] Fetching list. Mode: ${mode}, User: ${userEmail}, Division: ${effectiveDivision}`);
        const concernedSeClause = `
              AND EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserFullName, ''))))
              )
    `;

        let query = `
            SELECT
                LTRIM(RTRIM(E.RequestNo)) as RequestNo,
                E.ProjectName,
                E.EnquiryDate,
                COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(P.Status, ''))), ''), 'Pending') as Status,
                TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))), '')) as Probability,
                NULLIF(LTRIM(RTRIM(ISNULL(P.ProbabilityChance, ''))), '') as ProbabilityOption,
                P.ExpectedDate as ExpectedOrderDate,
                NULLIF(LTRIM(RTRIM(ISNULL(P.Remarks, ''))), '') as ProbabilityRemarks,
                NULLIF(LTRIM(RTRIM(ISNULL(P.FinalJobValueBooked, ''))), '') as WonOrderValue,
                NULLIF(LTRIM(RTRIM(ISNULL(P.ERPJobNo, ''))), '') as WonJobNo,
                NULLIF(LTRIM(RTRIM(ISNULL(P.ToName, ''))), '') as WonCustomerName,
                E.CustomerPreferredPrice,
                NULLIF(LTRIM(RTRIM(ISNULL(P.QuoteRef, ''))), '') as WonQuoteRef,
                NULLIF(LTRIM(RTRIM(ISNULL(wonQ.QuoteType, ''))), '') as WonQuoteType,
                E.WonOption,
                P.GrossMargin as WonGrossProfit,
                NULLIF(LTRIM(RTRIM(ISNULL(P.LostTo, ''))), '') as LostCompetitor,
                NULLIF(LTRIM(RTRIM(ISNULL(P.ReasonForLoosing, ''))), '') as LostReason,
                NULLIF(LTRIM(RTRIM(ISNULL(P.CompetitorPrice, ''))), '') as LostCompetitorPrice,
                P.LostDate as LostDate,
                P.UpdatedDateTime as UpdatedDateTime,
                (SELECT TOP 1 QuoteDate FROM EnquiryQuotes Q WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo)) ORDER BY QuoteDate DESC) as LastQuoteDate,
                (
                    SELECT 
                        CASE 
                            WHEN EXISTS (
                                SELECT 1 FROM EnquiryPricingValues pv
                                JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                AND (UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTION%' OR UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTIONAL%')
                                AND ISNULL(pv.Price, 0) <> 0
                            ) THEN 'Refer quote'
                            ELSE CAST(ISNULL((
                                SELECT SUM(MaxItemPrice)
                                FROM (
                                    SELECT MAX(pv.Price) as MaxItemPrice
                                    FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    -- Fix JOIN to handle prefixes like "L1 - "
                                    JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '%- ' + mef.ItemName OR pv.EnquiryForItem LIKE '%-' + mef.ItemName)
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                    AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                    AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                    AND (
                                        -- Standard: User has access to this specific item (Own Job)
                                        (
                                            ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR mef.ItemName = @userDepartment
                                        )
                                        OR
                                        -- Hierarchy: User has access to the Parent job of this specific item (Subjob)
                                        EXISTS (
                                            SELECT 1
                                            FROM EnquiryFor child
                                            JOIN EnquiryFor parent1 ON child.ParentID = parent1.ID
                                            LEFT JOIN EnquiryFor parent2 ON parent1.ParentID = parent2.ID
                                            LEFT JOIN EnquiryFor parent3 ON parent2.ParentID = parent3.ID
                                            JOIN Master_EnquiryFor pmef ON (
                                                -- Match against any ancestor level (parent1/parent2/parent3)
                                                (
                                                    parent1.ItemName = pmef.ItemName
                                                    OR parent1.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent1.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                                OR
                                                (
                                                    parent2.ItemName = pmef.ItemName
                                                    OR parent2.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent2.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                                OR
                                                (
                                                    parent3.ItemName = pmef.ItemName
                                                    OR parent3.ItemName LIKE '%- ' + pmef.ItemName
                                                    OR parent3.ItemName LIKE '%-' + pmef.ItemName
                                                )
                                            )
                                            WHERE (
                                                pv.EnquiryForItem = child.ItemName
                                                OR pv.EnquiryForItem LIKE '%- ' + child.ItemName
                                                OR pv.EnquiryForItem LIKE '%-' + child.ItemName
                                            )
                                            AND child.RequestNo = E.RequestNo
                                            AND parent1.RequestNo = E.RequestNo
                                            AND (parent2.RequestNo = E.RequestNo OR parent2.ID IS NULL)
                                            AND (parent3.RequestNo = E.RequestNo OR parent3.ID IS NULL)
                                            AND (
                                                UPPER(LTRIM(RTRIM(ISNULL(pmef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                                AND (
                                                    ',' + REPLACE(REPLACE(ISNULL(pmef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                    OR ',' + REPLACE(REPLACE(ISNULL(pmef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                    OR pmef.ItemName = @userDepartment
                                                )
                                            )
                                        )
                                        OR
                                        -- GLOBAL VISIBILITY FOR CIVIL USERS (e.g. they see everything in Total)
                                        EXISTS (
                                            SELECT 1 FROM Master_EnquiryFor civil
                                            WHERE (civil.ItemName = 'Civil' OR civil.ItemName = 'Civil Project') 
                                            AND UPPER(LTRIM(RTRIM(ISNULL(civil.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                            AND (
                                                ',' + REPLACE(REPLACE(ISNULL(civil.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                                OR ',' + REPLACE(REPLACE(ISNULL(civil.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            )
                                        )
                                    )
                                    GROUP BY pv.EnquiryForItem
                                ) t
                            ), 0) AS NVARCHAR(50))
                        END
                ) as TotalQuotedValue,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(ISNULL(P.NetQuotedValue, ''))), ''),
                    (
                        SELECT 
                            CASE 
                                WHEN EXISTS (
                                    SELECT 1 FROM EnquiryPricingValues pv
                                    JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                    WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                    AND (UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTION%' OR UPPER(LTRIM(RTRIM(po.OptionName))) LIKE '%OPTIONAL%')
                                    AND ISNULL(pv.Price, 0) <> 0
                                ) THEN 'Refer quote'
                                ELSE CAST(ISNULL((
                                    SELECT SUM(MaxItemPrice)
                                    FROM (
                                        SELECT MAX(pv.Price) as MaxItemPrice
                                        FROM EnquiryPricingValues pv
                                        JOIN EnquiryPricingOptions po ON pv.OptionID = po.ID
                                        JOIN Master_EnquiryFor mef ON (pv.EnquiryForItem = mef.ItemName OR pv.EnquiryForItem LIKE '%- ' + mef.ItemName OR pv.EnquiryForItem LIKE '%-' + mef.ItemName)
                                        WHERE LTRIM(RTRIM(pv.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                        AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTION%' 
                                        AND UPPER(LTRIM(RTRIM(po.OptionName))) NOT LIKE '%OPTIONAL%'
                                        AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                        AND (
                                            -- Net Quoted fallback: strict user affiliation
                                            ',' + REPLACE(REPLACE(ISNULL(mef.CommonMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE '%,' + ISNULL(@userEmail, '') + ',%'
                                            OR mef.ItemName = @userDepartment
                                        )
                                        GROUP BY pv.EnquiryForItem
                                    ) t
                                ), 0) AS NVARCHAR(50))
                            END
                    )
                ) as NetQuotedValue,
                (
                    SELECT STUFF((
                        SELECT ',' + CAST(Q.QuoteNumber AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.ToName, 'N/A') AS NVARCHAR(MAX)) + '|' + CAST(ISNULL(Q.LeadJob, '') AS NVARCHAR(MAX)) + '|' + ISNULL(CONVERT(NVARCHAR(23), Q.QuoteDate, 121), N'') + '|' + CAST(ISNULL(Q.QuoteType, '') AS NVARCHAR(MAX))
                        FROM EnquiryQuotes Q
                        WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                        AND (
                            /* 1. Creator Access */
                            (Q.PreparedByEmail IS NOT NULL AND LTRIM(RTRIM(UPPER(Q.PreparedByEmail))) = LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))))
                            OR
                            /* 2. Division Access */
                            EXISTS (
                                SELECT 1 FROM Master_EnquiryFor mef
                                WHERE (
                                    ',' + REPLACE(REPLACE(ISNULL(UPPER(mef.CommonMailIds), ''), ' ', ''), ';', ',') + ',' LIKE '%,' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',%'
                                    OR ',' + REPLACE(REPLACE(ISNULL(UPPER(mef.CCMailIds), ''), ' ', ''), ';', ',') + ',' LIKE '%,' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',%'
                                )
                                AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                AND mef.DivisionCode IS NOT NULL
                                AND LEN(LTRIM(RTRIM(mef.DivisionCode))) > 0
                                AND (
                                    CHARINDEX('/' + UPPER(LTRIM(RTRIM(mef.DivisionCode))) + '/', UPPER(Q.QuoteNumber)) > 0
                                    OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(mef.DivisionCode))) + '/', UPPER(Q.QuoteNumber)) > 0
                                    OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(mef.DivisionCode))) + '-', UPPER(Q.QuoteNumber)) > 0
                                )
                            )
                            /* 3. Admin Fallback */
                            OR EXISTS (SELECT 1 FROM Master_ConcernedSE u WHERE LTRIM(RTRIM(UPPER(u.EmailId))) = LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) AND UPPER(u.Roles) LIKE '%ADMIN%')
                        )
                        ORDER BY
                            CASE
                                WHEN PATINDEX('%/L[0-9]%', UPPER(ISNULL(Q.QuoteNumber, ''))) > 0
                                    THEN TRY_CAST(
                                        SUBSTRING(
                                            UPPER(ISNULL(Q.QuoteNumber, '')),
                                            PATINDEX('%/L[0-9]%', UPPER(ISNULL(Q.QuoteNumber, ''))) + 2,
                                            10
                                        ) AS INT
                                    )
                                ELSE 999999
                            END ASC,
                            LTRIM(RTRIM(ISNULL(Q.QuoteNumber, ''))) ASC,
                            LTRIM(RTRIM(Q.ToName)) ASC,
                            Q.RevisionNo DESC
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                ) as FilteredQuoteRefs,
                (
                    SELECT STUFF((
                        SELECT '##' + CAST(po.OptionName AS NVARCHAR(MAX)) + '::' + CAST(ISNULL((SELECT SUM(pv.Price) FROM EnquiryPricingValues pv WHERE pv.OptionID = po.ID AND pv.CustomerName = po.CustomerName), 0) AS NVARCHAR(MAX))
                        FROM EnquiryPricingOptions po
                        JOIN EnquiryQuotes Q ON Q.QuoteNumber = E.WonQuoteRef
                        WHERE LTRIM(RTRIM(po.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                        AND po.CustomerName = Q.ToName
                        AND (po.OptionName LIKE '%Option%' OR po.OptionName LIKE '%Optional%')
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                ) as QuoteOptions
            FROM EnquiryMaster E
            OUTER APPLY (
                SELECT TOP 1 *
                FROM dbo.Probability P0
                WHERE LTRIM(RTRIM(ISNULL(P0.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                  AND (
                        UPPER(LTRIM(RTRIM(ISNULL(P0.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR (
                            LTRIM(RTRIM(ISNULL(P0.OwnJobName, ''))) = ''
                            AND UPPER(LTRIM(RTRIM(ISNULL(P0.QuoteOwnJob, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        )
                  )
                ORDER BY P0.UpdatedDateTime DESC, P0.ID DESC
            ) P
            OUTER APPLY (
                SELECT TOP 1 Q.QuoteType
                FROM EnquiryQuotes Q
                WHERE LTRIM(RTRIM(ISNULL(Q.QuoteNumber, ''))) = LTRIM(RTRIM(ISNULL(P.QuoteRef, '')))
                ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.ID DESC
            ) wonQ
            WHERE 1 = 1
              AND (
                  @mode = 'Pending'
                  OR (
                      EXISTS (
                    SELECT 1
                    FROM EnquiryFor efDiv
                    JOIN Master_EnquiryFor mefDiv
                      ON UPPER(LTRIM(RTRIM(ISNULL(efDiv.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(mefDiv.ItemName, ''))))
                    WHERE LTRIM(RTRIM(ISNULL(efDiv.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND (
                            UPPER(LTRIM(RTRIM(ISNULL(mefDiv.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                            OR UPPER(LTRIM(RTRIM(ISNULL(mefDiv.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                      )
                      )
                      OR EXISTS (
                    SELECT 1
                    FROM EnquiryQuotes qDiv
                    JOIN Master_EnquiryFor mefDivQ
                      ON (
                        UPPER(LTRIM(RTRIM(ISNULL(mefDivQ.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                        OR UPPER(LTRIM(RTRIM(ISNULL(mefDivQ.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                      )
                    WHERE LTRIM(RTRIM(ISNULL(qDiv.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                      AND LTRIM(RTRIM(ISNULL(mefDivQ.DivisionCode, ''))) <> ''
                      AND (
                            CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefDivQ.DivisionCode, '')))) + '/', UPPER(ISNULL(qDiv.QuoteNumber, ''))) > 0
                            OR CHARINDEX('-' + UPPER(LTRIM(RTRIM(ISNULL(mefDivQ.DivisionCode, '')))) + '/', UPPER(ISNULL(qDiv.QuoteNumber, ''))) > 0
                            OR CHARINDEX('/' + UPPER(LTRIM(RTRIM(ISNULL(mefDivQ.DivisionCode, '')))) + '-', UPPER(ISNULL(qDiv.QuoteNumber, ''))) > 0
                      )
                      )
                  )
              )
              ${concernedSeClause}
    `;
        // CC users should not be restricted by ConcernedSE rows.
        // For Pending mode we apply explicit assignment logic below.
        if (isCcUser) {
            query = query.replace(concernedSeClause, '\n');
        }

        // Filter Logic
        if (mode === 'Pending') {
            // Pending logic (strictly for selected division):
            // 1) enquiry must be assigned to current user
            // 2) at least one quote must exist for selected division
            // 3) probability for selected division is not fully updated yet
            query += `
                AND (
                    EXISTS (
                        SELECT 1
                        FROM ConcernedSE cs
                        WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                          AND UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@currentUserFullName, ''))))
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM EnquiryFor efAssign
                        JOIN Master_EnquiryFor mefAssign
                          ON UPPER(LTRIM(RTRIM(ISNULL(efAssign.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(mefAssign.ItemName, ''))))
                        WHERE LTRIM(RTRIM(ISNULL(efAssign.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, '')))
                          AND (
                                UPPER(LTRIM(RTRIM(ISNULL(mefAssign.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                                OR UPPER(LTRIM(RTRIM(ISNULL(mefAssign.ItemName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                          )
                          AND (
                                CHARINDEX(
                                    ',' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',',
                                    ',' + REPLACE(REPLACE(ISNULL(UPPER(mefAssign.CommonMailIds), ''), ' ', ''), ';', ',') + ','
                                ) > 0
                                OR CHARINDEX(
                                    ',' + LTRIM(RTRIM(UPPER(NULLIF(@userEmail, '')))) + ',',
                                    ',' + REPLACE(REPLACE(ISNULL(UPPER(mefAssign.CCMailIds), ''), ' ', ''), ';', ',') + ','
                                ) > 0
                          )
                    )
                )
                AND (
                    (P.ID IS NULL)
                    OR (
                        P.Status IS NULL
                        OR LTRIM(RTRIM(P.Status)) = ''
                        OR LOWER(LTRIM(RTRIM(P.Status))) = 'pending'
                        OR P.Status IN ('Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted')
                    )
                    OR (P.Status IN('FollowUp', 'Follow-up') AND (P.ProbabilityChance IS NULL OR LTRIM(RTRIM(P.ProbabilityChance)) = ''))
                )
                AND (P.Status NOT IN('Won', 'Lost', 'Cancelled', 'OnHold', 'On Hold', 'Retendered') OR P.Status IS NULL OR LTRIM(RTRIM(P.Status)) = '')
                AND ${probabilityDivisionQuoteExistsSql()}
            `;
        } else if (mode === 'Won') {
            query += ` AND P.Status = 'Won'`;
        } else if (mode === 'Lost') {
            query += ` AND P.Status = 'Lost'`;
        } else if (mode === 'OnHold') {
            query += ` AND (P.Status = 'OnHold' OR P.Status = 'On Hold')`;
        } else if (mode === 'Cancelled') {
            query += ` AND P.Status = 'Cancelled'`; // Assuming 'Cancelled' is mapped
        } else if (mode === 'FollowUp') {
            query += ` AND (P.Status = 'Follow-up' OR P.Status = 'FollowUp')`;
        } else if (mode === 'Retendered') {
            // Assuming 'Retendered' is tracked via RetenderDate or specific Status if exists?
            // Since user asked for "Retendered details", let's assume it's a status or we check RetenderDate existence
            // For now, let's assume it's a Status 'Retendered' based on common patterns, or fallback to date check logic if needed.
            // Given schema has RetenderDate, maybe status is 'Retendered'. Let's stick to Status for consistency first.
            query += ` AND(P.Status = 'Retendered' OR E.RetenderDate IS NOT NULL)`;
        }

        // Pending / default status only when at least one division quote exists (ALL and other non-Pending modes)
        const m = String(mode || '').trim();
        if (m !== 'Pending') {
            query = appendExcludePendingLikeWithoutQuote(query);
        }

        // Date range: latest P row per status — BookedDate (Won), LostDate, UpdatedDateTime (On Hold / Cancelled / Retendered)
        query = appendProbabilityListDateFilter(query, mode, fromDate, toDate);

        // Probability Filter (for FollowUp mainly)
        if (probability && mode === 'FollowUp') {
            // probability is string like "High Chance (90%)"
            // Database stores 'Probability' int and 'ProbabilityOption' string.
            // Filter by Option string for exact match
            query += ` AND P.ProbabilityChance = @probability`;
        }

        // Default Sorting: Newest Enquiry Date first, then highest Enquiry No.
        query += ` ORDER BY E.EnquiryDate DESC, CASE WHEN ISNUMERIC(E.RequestNo)=1 THEN CAST(E.RequestNo AS INT) ELSE 0 END DESC`;

        const now = new Date();
        const request = new sql.Request();
        if (fromDate) request.input('fromDate', sql.Date, fromDate);
        if (toDate) request.input('toDate', sql.Date, toDate);
        if (probability) request.input('probability', sql.VarChar, probability);
        request.input('userEmail', sql.NVarChar, userEmail || '');
        request.input('userDepartment', sql.NVarChar, userDepartment || '');
        request.input('currentUserFullName', sql.NVarChar, currentUserFullName);
        request.input('division', sql.NVarChar, effectiveDivision);
        request.input('mode', sql.NVarChar, String(mode || '').trim());
        request.input('now', sql.DateTime, now);

        const result = await request.query(query.replace(/GETDATE\(\)/g, '@now'));
        if (result.recordset.length > 0) {
            console.log(`[Probability API V5] First Item FilteredQuoteRefs:`, result.recordset[0].FilteredQuoteRefs);
        }
        res.json(result.recordset);

    } catch (err) {
        console.error('API Error /list:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/divisions?userEmail=...
router.get('/divisions', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const userEmail = String(req.query.userEmail || '').trim();
        const scope = await resolveProbabilityDivisionScope(userEmail, '');
        if (!scope) {
            return res.json({ divisions: [], isCcUser: false, selectedDivision: '' });
        }
        return res.json({
            divisions: scope.divisions,
            isCcUser: scope.isCcUser,
            selectedDivision: scope.division,
        });
    } catch (err) {
        console.error('API Error /divisions:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/history/:requestNo?userEmail=...&division=...
router.get('/history/:requestNo', async (req, res) => {
    try {
        await ensureProbabilityTable();
        const requestNo = String(req.params.requestNo || '').trim();
        const userEmail = String(req.query.userEmail || '').trim();
        const requestedDivision = String(req.query.division || '').trim();
        const scope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        if (!scope?.division) {
            return res.status(403).json({ error: 'No division access for this user' });
        }
        const reqSql = new sql.Request();
        reqSql.input('requestNo', sql.NVarChar, requestNo);
        reqSql.input('division', sql.NVarChar, String(scope.ownJobDivision || scope.division || '').trim());
        const result = await reqSql.query(`
            SELECT
                p.ID, p.RequestNo, p.ProjectName, p.OwnJobName, p.ToName, p.TotalQuotedValue, p.NetQuotedValue,
                p.LeadJobName,
                p.QuoteNo, p.QuoteRevision, p.QuoteRef, p.PreparedBy, p.QuoteOwnJob, p.Status, p.ProbabilityChance, p.ExpectedDate,
                p.ERPJobNo, p.FinalJobValueBooked, p.BookedDate, p.GrossMargin, p.ReasonForLoosing,
                p.CompetitorPrice, p.LostDate, p.LostTo, p.HoldReason, p.CencelledReason, p.RetenderedReason,
                p.Remarks, p.UpdatedBy, p.UpdatedDateTime,
                COALESCE(NULLIF(LTRIM(RTRIM(u.FullName)), ''), LTRIM(RTRIM(p.UpdatedBy))) AS UpdatedByDisplayName,
                qdt.QuoteDate AS QuoteRefQuoteDate
            FROM dbo.Probability p
            LEFT JOIN Master_ConcernedSE u
              ON LOWER(LTRIM(RTRIM(ISNULL(u.EmailId, N''))))
               = LOWER(LTRIM(RTRIM(ISNULL(p.UpdatedBy, N''))))
            OUTER APPLY (
                SELECT TOP 1 Q.QuoteDate
                FROM EnquiryQuotes Q
                WHERE LTRIM(RTRIM(ISNULL(Q.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(p.RequestNo, N'')))
                  AND LTRIM(RTRIM(ISNULL(Q.QuoteNumber, N''))) = LTRIM(RTRIM(ISNULL(p.QuoteRef, N'')))
                  AND LTRIM(RTRIM(ISNULL(p.QuoteRef, N''))) <> N''
                ORDER BY ISNULL(Q.RevisionNo, 0) DESC, Q.QuoteDate DESC
            ) qdt
            WHERE LTRIM(RTRIM(ISNULL(p.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
              AND UPPER(LTRIM(RTRIM(ISNULL(p.OwnJobName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
            ORDER BY p.UpdatedDateTime DESC, p.ID DESC
        `);
        return res.json(result.recordset || []);
    } catch (err) {
        console.error('API Error /history/:requestNo:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/:requestNo - Get full details
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = req.query.userEmail || '';
        const requestedDivision = String(req.query.division || '').trim();
        const scope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        const allowedSe = await hasProbabilityAccess(requestNo, userEmail);
        const allowedByDivision =
            scope?.division && (await hasEnquiryDivisionAccess(requestNo, scope.division));
        if (!allowedSe && !allowedByDivision) {
            return res.status(403).json({ error: 'Access denied for this enquiry' });
        }

        const request = new sql.Request();
        request.input('reqNo', sql.NVarChar, requestNo);

        const q = `
SELECT * FROM EnquiryMaster WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(@reqNo))
    `;
        const result = await request.query(q);
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ message: 'Enquiry not found' });
        }
    } catch (err) {
        console.error('API Error /:requestNo:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/probability/update
router.post('/update', async (req, res) => {
    try {
        const {
            enquiryNo,
            userEmail,
            division: requestedDivision,
            projectName,
            leadJobName,
            toName,
            totalQuotedValue,
            netQuotedValue,
            status,
            probabilityOption,
            probability: probInput,
            expectedDate,
            remarks,
            wonDetails,
            lostDetails
        } = req.body;

        const scope = await resolveProbabilityDivisionScope(userEmail, requestedDivision);
        if (!scope?.division) {
            return res.status(403).json({ error: 'No division access for this user' });
        }

        const divisionAllowedForEnquiry = await hasEnquiryDivisionAccess(enquiryNo, scope.division);
        if (!divisionAllowedForEnquiry) {
            return res.status(403).json({ error: 'Access denied for this enquiry division' });
        }

        if (!scope.isCcUser) {
            const allowed = await hasProbabilityAccess(enquiryNo, userEmail);
            if (!allowed) return res.status(403).json({ error: 'Access denied for this enquiry' });
        }

        console.log(`[Probability Update] Processing ReqNo: ${enquiryNo}, Status: ${status}`);
        console.log(`[Probability Update] Lost Details:`, lostDetails);

        // Server-side validation for Won status
        if (status === 'Won') {
            if (!wonDetails?.wonQuoteRef) {
                return res.status(400).json({ error: 'Quote Reference is mandatory for Won status' });
            }
            const rawVal = String(wonDetails?.orderValue || '').replace(/,/g, '').trim();
            if (!rawVal || isNaN(rawVal) || Number(rawVal) <= 0) {
                return res.status(400).json({ error: 'Valid Job Value is mandatory for Won status' });
            }
            if (!wonDetails?.jobNo || !String(wonDetails.jobNo).trim()) {
                return res.status(400).json({ error: 'ERP Job No. is mandatory for Won status' });
            }
            if (!expectedDate) {
                return res.status(400).json({ error: 'Booked Date is mandatory for Won status' });
            }
            if (wonDetails?.grossProfit == null || wonDetails?.grossProfit === '') {
                return res.status(400).json({ error: 'GP % is mandatory for Won status' });
            }
        }

        if (status === 'Lost') {
            if (!lostDetails?.customer || !String(lostDetails.customer).trim()) {
                return res.status(400).json({ error: 'Lost To is mandatory for Lost status' });
            }
            if (!lostDetails?.reason || !String(lostDetails.reason).trim()) {
                return res.status(400).json({ error: 'Reason for losing is mandatory for Lost status' });
            }
            const lostPrice = String(lostDetails?.competitorPrice ?? '')
                .replace(/,/g, '')
                .replace(/BD/gi, '')
                .trim();
            if (lostPrice === '' || Number.isNaN(Number(lostPrice))) {
                return res.status(400).json({ error: "Competitor's price is mandatory for Lost status" });
            }
            if (Number(lostPrice) < 0) {
                return res.status(400).json({ error: "Competitor's price cannot be negative" });
            }
            if (lostDetails?.lostDate == null || (typeof lostDetails.lostDate === 'string' && !String(lostDetails.lostDate).trim())) {
                return res.status(400).json({ error: 'Lost Date is mandatory for Lost status' });
            }
            const lostDateCheck = new Date(lostDetails.lostDate);
            if (Number.isNaN(lostDateCheck.getTime())) {
                return res.status(400).json({ error: 'Lost Date is invalid' });
            }
        }

        // Calculate probability int from option string if not provided (e.g. "High Chance (90%)" -> 90)
        let probability = probInput;
        if (probability === undefined || probability === null) {
            const match = probabilityOption?.match(/\d+/);
            probability = match ? parseInt(match[0]) : 0;
        }

        // IMPORTANT: Probability module must NEVER update EnquiryMaster.
        // Persist only to dbo.Probability history (division-scoped via OwnJobName).
        await insertProbabilityHistory({
            enquiryNo,
            projectName,
            leadJobName,
            division: String(scope.ownJobDivision || scope.division || '').trim(),
            toName,
            totalQuotedValue,
            netQuotedValue,
            quoteRef: wonDetails?.wonQuoteRef || '',
            status,
            probabilityOption,
            expectedDate,
            wonDetails,
            lostDetails,
            holdReason: (status === 'OnHold' || status === 'On Hold') ? (lostDetails?.reason || '') : '',
            cancelledReason: status === 'Cancelled' ? (lostDetails?.reason || '') : '',
            retenderedReason: status === 'Retendered' ? (lostDetails?.reason || '') : '',
            remarks,
            updatedBy: normalizeUserEmail(userEmail),
        });
        res.json({ success: true, message: 'Probability updated successfully' });

    } catch (err) {
        console.error('API Error /update:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/probability/quote-details/:quoteNumber - Get details for auto-fill in Won status
router.get('/quote-details/:quoteNumber', async (req, res) => {
    try {
        const { quoteNumber } = req.params;
        const userEmail = req.query.userEmail || '';
        const division = String(req.query.division || '').trim();
        const decodedQuoteNumber = decodeURIComponent(quoteNumber);

        const qReq = new sql.Request();
        qReq.input('qn', sql.NVarChar, decodedQuoteNumber);
        const quoteRes = await qReq.query(`
            SELECT RequestNo, ToName, TotalAmount, QuoteNo, RevisionNo, LeadJob, OwnJob, PreparedBy, QuoteDate, QuoteType
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(QuoteNumber, ''))) = LTRIM(RTRIM(ISNULL(@qn, '')))
        `);

        if (quoteRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteRes.recordset[0];
        const allowedSe = await hasProbabilityAccess(quote.RequestNo, userEmail);
        const scope = await resolveProbabilityDivisionScope(userEmail, division);
        const divOk =
            scope?.division && (await hasEnquiryDivisionAccess(quote.RequestNo, scope.division));
        if (!allowedSe && !divOk) {
            return res.status(403).json({ error: 'Access denied for this enquiry' });
        }

        const totalsReq = new sql.Request();
        totalsReq.input('reqNo', sql.NVarChar, String(quote.RequestNo || '').trim());
        totalsReq.input('toName', sql.NVarChar, String(quote.ToName || '').trim());
        totalsReq.input('division', sql.NVarChar, division || '');
        const totalsRes = await totalsReq.query(`
            ;WITH OwnJobNode AS (
                SELECT TOP 1 ef.ID, ef.ItemName
                FROM EnquiryFor ef
                JOIN Master_EnquiryFor mef
                  ON (
                    ef.ItemName = mef.ItemName
                    OR ef.ItemName LIKE '%- ' + mef.ItemName
                    OR ef.ItemName LIKE '%-' + mef.ItemName
                  )
                WHERE LTRIM(RTRIM(ISNULL(ef.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
                  AND UPPER(LTRIM(RTRIM(ISNULL(mef.DepartmentName, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@division, ''))))
                ORDER BY ef.ID
            ),
            SubTree AS (
                SELECT ef.ID, ef.ItemName
                FROM EnquiryFor ef
                JOIN OwnJobNode o ON ef.ID = o.ID
                UNION ALL
                SELECT c.ID, c.ItemName
                FROM EnquiryFor c
                JOIN SubTree p ON c.ParentID = p.ID
                WHERE LTRIM(RTRIM(ISNULL(c.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
            ),
            BaseRows AS (
                SELECT pv.EnquiryForItem, MAX(ISNULL(pv.Price, 0)) AS MaxPrice
                FROM EnquiryPricingValues pv
                JOIN EnquiryPricingOptions po ON po.ID = pv.OptionID
                WHERE LTRIM(RTRIM(ISNULL(pv.RequestNo, ''))) = LTRIM(RTRIM(ISNULL(@reqNo, '')))
                  AND LTRIM(RTRIM(ISNULL(po.CustomerName, ''))) = LTRIM(RTRIM(ISNULL(@toName, '')))
                  AND UPPER(LTRIM(RTRIM(ISNULL(po.OptionName, '')))) NOT LIKE '%OPTION%'
                  AND UPPER(LTRIM(RTRIM(ISNULL(po.OptionName, '')))) NOT LIKE '%OPTIONAL%'
                GROUP BY pv.EnquiryForItem
            )
            SELECT
                CAST(ISNULL((
                    SELECT SUM(br.MaxPrice)
                    FROM BaseRows br
                    WHERE EXISTS (
                        SELECT 1
                        FROM SubTree st
                        WHERE br.EnquiryForItem = st.ItemName
                           OR br.EnquiryForItem LIKE '%- ' + st.ItemName
                           OR br.EnquiryForItem LIKE '%-' + st.ItemName
                    )
                ), 0) AS DECIMAL(18,3)) AS TotalQuotedValue,
                CAST(ISNULL((
                    SELECT SUM(br.MaxPrice)
                    FROM BaseRows br
                    WHERE EXISTS (
                        SELECT 1
                        FROM OwnJobNode o
                        WHERE br.EnquiryForItem = o.ItemName
                           OR br.EnquiryForItem LIKE '%- ' + o.ItemName
                           OR br.EnquiryForItem LIKE '%-' + o.ItemName
                    )
                ), 0) AS DECIMAL(18,3)) AS NetQuotedValue
        `);
        const totals = totalsRes.recordset?.[0] || {};
        const quoteTotalAmount = parseMoneyToDecimalString(quote.TotalAmount);

        // Fetch optional prices
        const optionsRes = await sql.query`
            SELECT po.ID, po.OptionName, 
                   (SELECT SUM(pv.Price) 
                    FROM EnquiryPricingValues pv 
                    WHERE pv.OptionID = po.ID 
                    AND pv.CustomerName = po.CustomerName) as TotalPrice
            FROM EnquiryPricingOptions po
            WHERE po.RequestNo = ${quote.RequestNo}
            AND po.CustomerName = ${quote.ToName}
            AND (po.OptionName LIKE '%Option%' OR po.OptionName LIKE '%Optional%')
        `;

        res.json({
            customerName: quote.ToName,
            totalAmount: quote.TotalAmount,
            totalQuotedValue: totals.TotalQuotedValue ?? 0,
            netQuotedValue: quoteTotalAmount || (totals.NetQuotedValue ?? 0),
            quoteNo: quote.QuoteNo,
            revisionNo: quote.RevisionNo,
            leadJob: quote.LeadJob,
            ownJob: quote.OwnJob,
            preparedBy: quote.PreparedBy,
            quoteDate: quote.QuoteDate,
            quoteType: quote.QuoteType || '',
            options: optionsRes.recordset.map(o => ({
                name: o.OptionName,
                price: o.TotalPrice
            }))
        });

    } catch (err) {
        console.error('Error fetching quote won details:', err);
        res.status(500).json({ error: 'Failed to fetch quote details' });
    }
});

module.exports = router;

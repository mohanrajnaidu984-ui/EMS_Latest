const express = require('express');
const router = express.Router();
const sql = require('mssql');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const multer = require('multer');
const {
    resolvePricingAccessContext,
    getPricingAnchorJobs,
    expandVisibleJobIdsFromAnchors,
    userHasQuotePricingEnquiryAccess,
    normalizePricingJobName,
    jobBelongsToSessionDivision,
    getDepartmentPricingAnchors,
    resolveApprovalWorkflowQuoteRestriction,
    filterQuotesToSessionDivision,
    fetchEnquiryForJobsForAccess,
} = require('../lib/quotePricingAccess');
const {
    normalizeUserEmail,
    parseUserSignatureMaster,
    serializeUserSignatureMaster,
    parseQuoteDigitalStamps,
    serializeQuoteDigitalStamps,
    mergeQuoteStamp,
} = require('../lib/digitalSignaturesJson');
const {
    normalizeApprovalEmail,
    parseApprovalWorkflowJson,
    serializeApprovalWorkflowJson,
} = require('../lib/approvalWorkflowJson');
const {
    isMissingQuoteApprovalStepsTableError,
    fetchApprovalStepsByQuoteId,
    fetchApprovalStepsByDraftId,
    replaceApprovalSteps,
    linkDraftStepsToQuote,
    recordQuoteApprovalAction,
    recordDraftQuoteApprovalAction,
    countPendingApprovalsForUser,
    fetchPendingApprovalsForUser,
    fetchApprovedApprovalsByUser,
    fetchRejectedApprovalsByUser,
    fetchApprovalWorkflowSearch,
    enrichQuoteListRowsWithApprovalStatus,
    userHasActionableDraftApprovalStep,
    userHasActionableQuoteApprovalStep,
    normalizeQuoteMeta,
    fetchApprovalCompletionRecipients,
    fetchExistingCreatedByEmail,
    fetchApprovalMailContext,
    getCurrentPendingStep,
    resolveApprovalPersistContext,
    fetchApprovalStepsApiPayload,
} = require('../lib/quoteApprovalSteps');
const {
    sendQuoteApprovalRequestEmail,
    sendQuoteApprovedForSubmissionEmails,
} = require('../lib/quoteApprovalNotify');
const {
    notifyQuoteAssignedForApprovalInApp,
    notifyQuoteApprovedForSubmissionInApp,
} = require('../lib/quoteApprovalInAppNotify');
const {
    isMissingQuoteApprovalHierarchyTableError,
    fetchApprovalHierarchiesForUser,
    saveApprovalHierarchy,
    deleteApprovalHierarchy,
} = require('../lib/quoteApprovalHierarchy');
const { removeExcludedFromEmailSet } = require('../lib/notificationEmailExclusions');
const { fetchQuoteDivisionUserOptions } = require('../lib/quoteDivisionUserOptions');

async function resolveProjectNameForApproval(requestNo, projectName = '') {
    let resolved = String(projectName || '').trim();
    if (resolved) return resolved;
    const rn = String(requestNo || '').trim();
    if (!rn) return '';
    try {
        const enqRes = await sql.query`
            SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${rn}
        `;
        return String(enqRes.recordset?.[0]?.ProjectName || '').trim();
    } catch {
        return '';
    }
}

async function notifyAfterApprovalAction({
    nextSteps,
    action,
    requestNo,
    projectName = '',
    customerName = '',
    subject = '',
    ownJob = '',
    quoteId = null,
    draftQuoteId = null,
}) {
    const actionNorm = String(action || '').trim().toLowerCase();
    if (actionNorm !== 'approved') return { notified: false };

    const pendingNext = getCurrentPendingStep(nextSteps);
    const allApproved =
        Array.isArray(nextSteps) &&
        nextSteps.length > 0 &&
        nextSteps.every((s) => String(s.status || '').toLowerCase() === 'approved');

    const resolvedProjectName = await resolveProjectNameForApproval(requestNo, projectName);
    const mailCtxBase = {
        quoteId: quoteId || null,
        draftQuoteId: draftQuoteId || null,
        meta: { requestNo, customerName, leadJobName: '', ownJob },
        subjectOverride: subject,
        projectNameOverride: resolvedProjectName,
    };

    if (pendingNext && !allApproved) {
        // Parallel approval: all approvers were notified when the workflow was sent.
        return { notified: false, type: 'parallel-pending-others' };
    }

    if (allApproved) {
        const createdByEmail = await fetchExistingCreatedByEmail({
            quoteId: quoteId || null,
            draftQuoteId: draftQuoteId || null,
            meta: {
                requestNo,
                customerName,
                leadJobName: '',
                ownJob,
            },
        });
        const recipientEmails = await fetchApprovalCompletionRecipients(nextSteps, {
            createdByEmail,
            requestNo,
        });
        const mailContext = await fetchApprovalMailContext(mailCtxBase);
        const mailResult = await sendQuoteApprovedForSubmissionEmails({
            toEmails: recipientEmails,
            mailContext,
        });
        let inAppResult = { inserted: 0 };
        try {
            inAppResult = await notifyQuoteApprovedForSubmissionInApp({
                recipientEmails,
                requestNo,
                projectName: resolvedProjectName,
                quoteNumber: mailContext?.quoteNumber || mailContext?.quoteRef || '',
                quoteId: quoteId || null,
                triggerUserName: actorNameFromSteps(nextSteps),
            });
        } catch (inAppErr) {
            console.warn('[approval-action] in-app notification:', inAppErr.message);
        }
        return {
            notified: mailResult.success,
            type: 'approved-for-submission',
            mailResult,
            inApp: inAppResult,
        };
    }

    return { notified: false };
}

function actorNameFromSteps(steps) {
    const approved = (Array.isArray(steps) ? steps : [])
        .filter((s) => String(s.status || '').toLowerCase() === 'approved')
        .sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0));
    const last = approved[0];
    return String(last?.approverName || last?.approverEmail || '').trim();
}

/** Division code for strict tuple filters — subjob tab OwnJob wins over toolbar Division dropdown. */
async function resolveQuoteStrictDivisionCode(requestNo, { division = '', ownJobName = '' } = {}) {
    const rn = String(requestNo || '').trim();
    const ownTrim = String(ownJobName || '').trim();
    const divTrim = String(division || '').trim();
    if (!rn) return '';
    try {
        if (ownTrim) {
            const byOwn = await sql.query`
                SELECT TOP 1 mef.DivisionCode
                FROM dbo.EnquiryFor ef
                INNER JOIN dbo.Master_EnquiryFor mef
                    ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE LTRIM(RTRIM(ef.RequestNo)) = LTRIM(RTRIM(${rn}))
                  AND (
                    LTRIM(RTRIM(ISNULL(ef.ItemName, N''))) = LTRIM(RTRIM(${ownTrim}))
                    OR LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(${ownTrim}))
                    OR LTRIM(RTRIM(ISNULL(mef.ItemName, N''))) = LTRIM(RTRIM(${ownTrim}))
                  )
                ORDER BY
                    CASE WHEN ef.ParentID IS NULL OR ef.ParentID = 0 OR ef.ParentID = '0' THEN 0 ELSE 1 END,
                    ef.ID`;
            const ownCode = (byOwn.recordset?.[0]?.DivisionCode || '').toString().trim().toUpperCase();
            if (ownCode) return ownCode;
        }
        if (divTrim) {
            const byDiv = await sql.query`
                SELECT TOP 1 mef.DivisionCode
                FROM dbo.EnquiryFor ef
                INNER JOIN dbo.Master_EnquiryFor mef
                    ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                WHERE LTRIM(RTRIM(ef.RequestNo)) = LTRIM(RTRIM(${rn}))
                  AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(${divTrim}))
                ORDER BY
                    CASE WHEN ef.ParentID IS NULL OR ef.ParentID = 0 OR ef.ParentID = '0' THEN 0 ELSE 1 END,
                    ef.ID`;
            return (byDiv.recordset?.[0]?.DivisionCode || '').toString().trim().toUpperCase();
        }
    } catch (_) {
        // fall through
    }
    return '';
}

/** Shared SELECT for GET /by-enquiry — inputs must be bound on `sql.Request` before each call. */
const BY_ENQUIRY_QUOTES_SQL = `
            SELECT ID, QuoteNumber, QuoteDate,
                   CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd,
                   ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention,
                   Subject, CustomerReference, YourRef, QuoteType, ValidityDays, PreparedBy, PreparedByEmail,
                   Signatory, SignatoryDesignation, CoSignatory, CoSignatoryDesignation, Status, RevisionNo, TotalAmount, QuoteNo,
                   RequestNo, CreatedAt, UpdatedAt, OwnJob, LeadJob, ReasonForRevision,
                   ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                   ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                   ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                   Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                   CustomClauses, ClauseOrder, DigitalSignaturesJson, ApprovalWorkflowJson
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(ISNULL(@requestNo, '')))
              AND (
                @toName IS NULL
                OR LTRIM(RTRIM(ISNULL(CAST(@toName AS NVARCHAR(4000)), N''))) = N''
                OR LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@toName, N''))))
                OR (
                  @strictTuple = 0 AND
                  @toNameStripped IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@toNameStripped, N''))) <> N''
                  AND (
                    LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@toNameStripped, N''))))
                    OR (
                      @strictTuple = 0 AND
                      LEN(LTRIM(RTRIM(ISNULL(@toNameStripped, N'')))) >= 5
                      AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) LIKE N'%' + LOWER(LTRIM(RTRIM(ISNULL(@toNameStripped, N'')))) + N'%'
                    )
                  )
                )
              )
              AND (
                @leadJobName IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@leadJobName, N''))))
                OR (
                  @strictTuple = 0 AND
                  @leadJobNameStripped IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@leadJobNameStripped, N''))) <> N''
                  AND LOWER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@leadJobNameStripped, N''))))
                )
                OR (
                  @strictTuple = 0 AND
                  LTRIM(RTRIM(ISNULL(@leadJobName, N''))) <> N''
                  AND LEN(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) <= 6
                  AND LEFT(UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))), 1) = N'L'
                  AND TRY_CONVERT(INT, SUBSTRING(LTRIM(RTRIM(ISNULL(@leadJobName, N''))), 2, 4)) IS NOT NULL
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N''))))
                    OR UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) + N' %'
                    OR UPPER(LTRIM(RTRIM(ISNULL(LeadJob, N'')))) LIKE UPPER(LTRIM(RTRIM(ISNULL(@leadJobName, N'')))) + N'-%'
                  )
                )
                OR (
                  @strictTuple = 1
                  AND @strictDivisionCode IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@strictDivisionCode, N''))) <> N''
                  AND CHARINDEX(
                        N'/' + UPPER(LTRIM(RTRIM(ISNULL(@strictDivisionCode, N'')))) + N'/',
                        UPPER(ISNULL(QuoteNumber, N''))
                      ) > 0
                )
              )
              AND (
                @ownJobName IS NULL
                OR LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@ownJobName, N''))))
                OR (
                  @strictTuple = 0 AND
                  @ownJobNameStripped IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@ownJobNameStripped, N''))) <> N''
                  AND LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) = LOWER(LTRIM(RTRIM(ISNULL(@ownJobNameStripped, N''))))
                )
                OR (
                  @strictTuple = 0 AND
                  LTRIM(RTRIM(ISNULL(@ownJobName, N''))) <> N''
                  AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) <> N''
                  AND (
                    LOWER(LTRIM(RTRIM(@ownJobName))) LIKE LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) + N'%'
                    OR LOWER(LTRIM(RTRIM(ISNULL(OwnJob, N'')))) LIKE LOWER(LTRIM(RTRIM(@ownJobName))) + N'%'
                  )
                )
                OR (
                  @strictTuple = 1
                  AND @strictDivisionCode IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(@strictDivisionCode, N''))) <> N''
                  AND CHARINDEX(
                        N'/' + UPPER(LTRIM(RTRIM(ISNULL(@strictDivisionCode, N'')))) + N'/',
                        UPPER(ISNULL(QuoteNumber, N''))
                      ) > 0
                )
              )
              AND (
                @strictLeadBranchCode IS NULL
                OR LTRIM(RTRIM(ISNULL(@strictLeadBranchCode, N''))) = N''
                OR CHARINDEX(
                      N'-' + UPPER(LTRIM(RTRIM(ISNULL(@strictLeadBranchCode, N'')))) + N'/',
                      UPPER(ISNULL(QuoteNumber, N''))
                    ) > 0
              )
            ORDER BY QuoteNo, RevisionNo DESC
        `;
const mapQuoteListingRows = require('../lib/mapQuoteListingRows');
const { quoteDetailLineResolved } = require('../lib/mapQuoteListingRows');
const runPendingQuoteListQuery = require('../lib/pendingQuoteListQuery');
const runQuotedQuoteListQuery = require('../lib/quotedQuoteListQuery');
const { runApprovalWorkflowQuoteListQuery } = require('../lib/approvalWorkflowQuoteListQuery');
const buildQuoteListSearchExtraWhere = require('../lib/buildQuoteListSearchExtraWhere');
const { sendGeneralEmail } = require('../emailService');
const { buildOutlookDraftVbs } = require('../lib/outlookDraftVbs');
const { buildSmtpTransport, stripQuotes, getSmtpFromEmail } = require('../lib/smtpTransport');
const { buildQuoteEmlDraftBuffer } = require('../lib/quoteSmtpDraft');
const { resolveQuoteOutlookEmailFields } = require('../lib/quoteOutlookEmailFields');
const { resolveQuoteUploadDestination } = require('../lib/attachmentsRoot');

/**
 * UNC paths (`\\server\share\...`) must not be passed through `path.resolve()` — Node can change the prefix and break Express.sendFile / existsSync.
 * QuoteAttachments.FilePath stores disk location only; FileData is intentionally unused (files are never stored as BLOB in DB).
 */
function absolutePathForFilesystem(p) {
    const s = String(p ?? '').trim();
    if (!s) return s;
    const normalized = path.normalize(s);
    if (normalized.startsWith('\\\\')) {
        return normalized;
    }
    if (path.isAbsolute(normalized)) {
        return normalized;
    }
    return path.resolve(normalized);
}

/**
 * Pending list SQL keys off priced tuples vs quote existence; JS mapping (customer / lead / OwnJob matching)
 * can show every line quoted while the row is still returned. Omit those from GET /list/pending.
 */
function shouldOmitFromPendingQuoteList(row) {
    const roll = String(row.ListQuoteRollupStatus ?? row.listquoterollupstatus ?? '').trim();
    if (roll === 'All Quoted') return true;
    const lines = row.ListQuoteDetailLines;
    if (Array.isArray(lines) && lines.length > 0) {
        const anyUnresolved = lines.some((ln) => !quoteDetailLineResolved(ln));
        if (!anyUnresolved) return true;
    }
    return false;
}

// Quote attachments: ENQUIRY_ATTACHMENTS_ROOT + Quotes/<quoteId>, or QUOTE_ATTACHMENTS_ROOT=<UNC>/Quotes, or explicit QUOTE_ATTACHMENTS_ROOT (see lib/attachmentsRoot.js).
const quoteAttachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const dest = resolveQuoteUploadDestination(req.params.quoteId);
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            console.log('[quote-attachments] multer destination:', dest);
            cb(null, dest);
        } catch (err) {
            console.error('[quote-attachments] mkdir failed:', err && err.message, resolveQuoteUploadDestination(req.params.quoteId));
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const safe = String(file.originalname || 'file').replace(/[/\\?%*:|"<>]/g, '_');
        cb(null, Date.now() + '-' + safe);
    }
});
const upload = multer({ storage: quoteAttachmentStorage });

/**
 * Master_EnquiryFor resolves creator department/div — only replace OwnJob with that department when the client
 * did not send a different job/branch name (e.g. direct subjob tab = "HVAC Project" while login dept is "Civil").
 */
function applyOwnJobAfterDepartmentLookup(currentOwnJob, userDept) {
    const oj = String(currentOwnJob || '').trim();
    const ud = String(userDept || '').trim();
    if (!ud) return oj;
    if (!oj || oj.toLowerCase() === ud.toLowerCase()) return ud;
    return oj;
}

function parseMailCsv(raw) {
    return String(raw || '')
        .split(/[;,]/g)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function departmentMatchesMefRow(department, mefRow) {
    const dept = String(department || '').trim();
    if (!dept || !mefRow) return false;
    const labels = [mefRow.ItemName, mefRow.DepartmentName]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
    const deptLower = dept.toLowerCase();
    for (const lab of labels) {
        const labLower = lab.toLowerCase();
        if (deptLower === labLower) return true;
        if (labLower.includes(deptLower) || deptLower.includes(labLower)) return true;
        const safe = dept.replace(/%/g, '');
        if (safe.length > 2 && (lab.includes(safe) || dept.includes(lab))) return true;
    }
    return false;
}

async function resolveUserCompanyName(userDept) {
    const dept = String(userDept || '').trim();
    if (!dept) return '';
    const safeDept = dept.replace(/%/g, '');
    let companyRes = await sql.query`
        SELECT TOP 1 CompanyName
        FROM Master_EnquiryFor
        WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) <> N''
          AND (
            LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${dept}))
            OR LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${dept}))
          )
        ORDER BY CASE
            WHEN LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${dept})) THEN 0
            WHEN LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${dept})) THEN 1
            ELSE 2 END
    `;
    let companyName = String(companyRes.recordset?.[0]?.CompanyName || '').trim();
    if (!companyName) {
        companyRes = await sql.query`
            SELECT TOP 1 CompanyName
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) <> N''
              AND (
                LTRIM(RTRIM(ItemName)) LIKE ${'%' + safeDept + '%'}
                OR LTRIM(RTRIM(DepartmentName)) LIKE ${'%' + safeDept + '%'}
              )
        `;
        companyName = String(companyRes.recordset?.[0]?.CompanyName || '').trim();
    }
    return companyName;
}

async function notifyParentJobQuoteEvent({
    requestNo,
    ownJobName,
    quoteId,
    quoteNumber,
    eventType,
    triggerUserName,
    triggerUserEmail,
}) {
    try {
        const ownTrim = String(ownJobName || '').trim();
        if (!requestNo || !ownTrim) return;

        const jobRes = await sql.query`
            SELECT TOP 1 ID, ParentID, ItemName
            FROM EnquiryFor
            WHERE RequestNo = ${requestNo}
              AND LTRIM(RTRIM(ISNULL(ItemName, N''))) = ${ownTrim}
            ORDER BY ID
        `;
        const job = jobRes.recordset?.[0];
        if (!job || !job.ParentID || String(job.ParentID) === '0') return; // Not a direct subjob

        const parentRes = await sql.query`
            SELECT TOP 1 ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo} AND ID = ${job.ParentID}
        `;
        const parentJobName = String(parentRes.recordset?.[0]?.ItemName || '').trim();
        const subJobName = String(job.ItemName || ownTrim).trim();
        if (!parentJobName || !subJobName) return;

        const recipientEmails = new Set();
        const mef = await sql.query`
            SELECT TOP 1 CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = ${parentJobName}
        `;
        if (mef.recordset?.length) {
            parseMailCsv(mef.recordset[0].CommonMailIds).forEach((e) => recipientEmails.add(e));
            parseMailCsv(mef.recordset[0].CCMailIds).forEach((e) => recipientEmails.add(e));
        }
        const deptUsers = await sql.query`
            SELECT EmailId FROM Master_ConcernedSE WHERE LTRIM(RTRIM(ISNULL(Department, N''))) = ${parentJobName}
        `;
        for (const r of deptUsers.recordset || []) {
            const em = String(r.EmailId || '').trim().toLowerCase();
            if (em) recipientEmails.add(em);
        }

        const triggerEmail = String(triggerUserEmail || '').trim().toLowerCase();
        if (triggerEmail) recipientEmails.delete(triggerEmail);
        removeExcludedFromEmailSet(recipientEmails);
        if (recipientEmails.size === 0) return;

        const linkPayload = JSON.stringify({
            tab: 'Quote',
            requestNo: String(requestNo),
            quoteId: String(quoteId || ''),
            quoteNumber: String(quoteNumber || ''),
            parentJob: parentJobName,
            subJob: subJobName,
        });
        const enq = await sql.query`
            SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${requestNo}
        `;
        const projectName = String(enq.recordset?.[0]?.ProjectName || '').trim();
        const message = `Quote updated by ${subJobName} for ${requestNo}, ${projectName || '-'}`;
        const now = new Date();
        const createdBy = String(triggerUserName || triggerUserEmail || 'System').trim() || 'System';

        for (const email of recipientEmails) {
            const u = await sql.query`SELECT TOP 1 ID FROM Master_ConcernedSE WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${email}`;
            const userId = u.recordset?.[0]?.ID;
            if (!userId) continue;
            await sql.query`
                INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy, CreatedAt)
                VALUES (${userId}, ${eventType}, ${message}, ${linkPayload}, ${createdBy}, ${now})
            `;
        }
    } catch (err) {
        console.error('[quote notify] parent-job subjob quote event', err);
    }
}

/** Align ToName filter with UI job labels ("L1 - Civil Project" vs "Civil Project"). */
/** EnquiryQuotes.TotalAmount — use client value when present (JSON omits `undefined`, so do not treat missing as 0 on revise). */
function resolveQuoteTotalAmountForInsert(body, existingTotal) {
    if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, 'totalAmount')) {
        const fb = Number(existingTotal);
        return Number.isFinite(fb) ? fb : 0;
    }
    const n = Number(body.totalAmount);
    return Number.isFinite(n) ? n : 0;
}

function normalizeQuoteJobLabelForEpv(s) {
    return String(s || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function quoteJobLabelsAlignForEpv(a, b) {
    const na = normalizeQuoteJobLabelForEpv(a);
    const nb = normalizeQuoteJobLabelForEpv(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.includes(nb) || nb.includes(na);
}

function quoteCustomerLabelsAlignForEpv(a, b) {
    const na = normalizeQuoteJobLabelForEpv(a).replace(/[^a-z0-9]/g, '');
    const nb = normalizeQuoteJobLabelForEpv(b).replace(/[^a-z0-9]/g, '');
    if (!nb) return true;
    if (!na) return false;
    if (na === nb) return true;
    return na.includes(nb) || nb.includes(na);
}

function isBasePriceEpvRow(row) {
    const po = String(row?.PriceOption ?? row?.priceOption ?? 'Base Price').trim().toLowerCase();
    return !po || po === 'base price' || po.startsWith('base price');
}

/** Latest own-job Base Price from EnquiryPricingValues (authoritative when pricing module was updated). */
async function resolveOwnjobTotalFromEpv(requestNo, { toName, ownJob, leadJob } = {}) {
    const ownJobStr = String(ownJob || '').trim();
    if (!requestNo || !ownJobStr) return null;
    const reqInt = parseInt(String(requestNo), 10);
    if (!Number.isFinite(reqInt)) return null;

    try {
        const result = await sql.query`
            SELECT v.Price, v.EnquiryForItem, v.CustomerName, v.LeadJobName, v.PriceOption, v.UpdatedAt, v.ID
            FROM EnquiryPricingValues v
            WHERE v.RequestNo = ${reqInt}
            ORDER BY v.UpdatedAt DESC, v.ID DESC
        `;
        const rows = result.recordset || [];
        const matching = rows.filter((r) => {
            if (!isBasePriceEpvRow(r)) return false;
            if (!quoteJobLabelsAlignForEpv(r.EnquiryForItem, ownJobStr)) return false;
            const toStr = String(toName || '').trim();
            if (toStr && !quoteCustomerLabelsAlignForEpv(r.CustomerName, toStr)) return false;
            const leadStr = String(leadJob || '').trim();
            if (leadStr && r.LeadJobName && !quoteJobLabelsAlignForEpv(r.LeadJobName, leadStr)) return false;
            return true;
        });
        if (!matching.length) return null;
        const price = Number(matching[0].Price);
        return Number.isFinite(price) && price > 0.0005 ? price : null;
    } catch (err) {
        console.warn('[resolveOwnjobTotalFromEpv]', err.message);
        return null;
    }
}

async function resolveTotalAmountForPersist(body, existingTotal) {
    const clientTotal = resolveQuoteTotalAmountForInsert(body, existingTotal);
    const epvTotal = await resolveOwnjobTotalFromEpv(body?.requestNo, {
        toName: body?.toName,
        ownJob: body?.ownJob,
        leadJob: body?.leadJob,
    });
    if (epvTotal != null && epvTotal > 0) return epvTotal;
    return clientTotal;
}

function stripJobPrefixForQuoteMatch(s) {
    let t = String(s || '').trim();
    if (!t) return '';
    if (/^sub\s*job\s*-\s*/i.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    if (/^L\d+\s*-\s*/i.test(t)) {
        const i = t.indexOf('-');
        return i >= 0 ? t.slice(i + 1).trim() : t;
    }
    return t;
}

/** L-code from lead dropdown value or explicit leadBranchCode query param (e.g. L1, L2). */
function extractStrictLeadBranchCode(leadJobName, leadBranchCodeParam) {
    const fromParam = String(leadBranchCodeParam || '')
        .trim()
        .toUpperCase()
        .match(/^(L\d+)/);
    if (fromParam) return fromParam[1];
    const fromLead = String(leadJobName || '')
        .trim()
        .match(/^(L\d+)/i);
    return fromLead ? fromLead[1].toUpperCase() : '';
}

function stripQuoteJobPrefixForBranch(s) {
    return String(s || '')
        .replace(/^(L\d+|Sub Job)\s*-\s*/i, '')
        .trim();
}

/** Keep only the EnquiryFor subtree that contains the saved quote's OwnJob (approval-workflow preview). */
function filterEnquiryForItemsToQuoteOwnJobBranch(items, ownJobName) {
    const list = Array.isArray(items) ? items : [];
    const want = stripQuoteJobPrefixForBranch(ownJobName).toLowerCase();
    if (!want || !list.length) return list;

    const byId = new Map();
    list.forEach((item) => {
        if (item?.ID != null) byId.set(String(item.ID), item);
    });
    const normName = (item) => stripQuoteJobPrefixForBranch(item?.ItemName || '').toLowerCase();

    let anchor =
        list.find((item) => normName(item) === want) ||
        list.find((item) => {
            const nm = normName(item);
            return nm && (nm.includes(want) || want.includes(nm));
        });
    if (!anchor) return list;

    let root = anchor;
    let safety = 0;
    while (root && safety++ < 50) {
        const pid = root.ParentID;
        if (pid == null || pid === '' || pid === '0' || pid === 0) break;
        const parent = byId.get(String(pid));
        if (!parent) break;
        root = parent;
    }

    const childrenByParent = new Map();
    list.forEach((item) => {
        const pid = item.ParentID;
        if (pid == null || pid === '' || pid === '0' || pid === 0) return;
        const k = String(pid);
        if (!childrenByParent.has(k)) childrenByParent.set(k, []);
        childrenByParent.get(k).push(item);
    });

    const allowed = new Set();
    const queue = [root.ID];
    while (queue.length) {
        const id = queue.shift();
        const sid = id != null ? String(id) : '';
        if (!sid || allowed.has(sid)) continue;
        allowed.add(sid);
        const kids = childrenByParent.get(sid) || [];
        kids.forEach((ch) => queue.push(ch.ID));
    }

    return list.filter((item) => item?.ID != null && allowed.has(String(item.ID)));
}

// POST /api/quotes/send-email - Send quote email with attachment
router.post('/send-email', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { to, cc, bcc, subject, body, attachmentName, pdfBase64 } = req.body;
        
        if (!to || !pdfBase64) {
            return res.status(400).json({ error: 'Recipients and PDF content are required' });
        }

        const from = getSmtpFromEmail();

        const result = await sendGeneralEmail({
            from,
            to,
            cc,
            bcc,
            subject,
            html: body,
            attachments: [
                {
                    filename: attachmentName || 'Quote.pdf',
                    content: Buffer.from(pdfBase64, 'base64'),
                    contentType: 'application/pdf'
                }
            ]
        });

        if (result.success) {
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send email', details: result.error });
        }
    } catch (err) {
        console.error('Error in /send-email route:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// GET /api/quotes/outlook-email-fields — To (attention person) + CC (user division CCMailIds, filtered).
router.get('/outlook-email-fields', async (req, res) => {
    try {
        const userEmail = (req.query.userEmail || '').toString().trim();
        const toName = (req.query.toName || '').toString().trim();
        const toAttention = (req.query.toAttention || '').toString().trim();
        const requestNo = (req.query.requestNo || '').toString().trim();
        const isInternal = String(req.query.isInternal || '').toLowerCase() === 'true' || req.query.isInternal === '1';

        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const fields = await resolveQuoteOutlookEmailFields(sql, {
            userEmail,
            toName,
            toAttention,
            isInternal,
            requestNo,
        });

        return res.json(fields);
    } catch (err) {
        console.error('Error in /outlook-email-fields:', err);
        res.status(500).json({ error: 'Failed to resolve email fields', details: err.message });
    }
});

/** POST /api/quotes/outlook-draft — open classic Outlook draft with PDF (Windows COM, same machine as API). */
router.post('/outlook-draft', express.json({ limit: '55mb' }), async (req, res) => {
    if (process.platform !== 'win32') {
        return res.status(501).json({ error: 'Outlook draft is supported on Windows only' });
    }
    try {
        const { pdfBase64, attachmentName, to, cc, bcc, subject, body, extraAttachments } = req.body || {};
        const dir = path.join(os.tmpdir(), 'ems-quote-outlook-api', String(Date.now()));
        fs.mkdirSync(dir, { recursive: true });

        let pdfPath = null;
        if (pdfBase64) {
            pdfPath = path.join(
                dir,
                String(attachmentName || 'EMS_QuoteDraft.pdf').replace(/[/\\?%*:|"<>]/g, '_')
            );
            fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
        }

        const extraPaths = [];
        for (const att of extraAttachments || []) {
            if (!att?.base64) continue;
            const nm = String(att.filename || 'attachment').replace(/[/\\?%*:|"<>]/g, '_');
            const p = path.join(dir, nm);
            fs.writeFileSync(p, Buffer.from(att.base64, 'base64'));
            extraPaths.push(p);
        }

        const vbsPath = path.join(dir, 'open-outlook.vbs');
        fs.writeFileSync(
            vbsPath,
            buildOutlookDraftVbs({
                pdfPath,
                extraAttachmentPaths: extraPaths,
                to: to || '',
                cc: cc || '',
                bcc: bcc || '',
                subject: subject || '',
                body: body || '',
            }),
            'utf8'
        );

        await new Promise((resolve, reject) => {
            execFile('wscript.exe', ['//B', vbsPath], { windowsHide: true }, (err) => {
                setTimeout(() => {
                    try {
                        fs.rmSync(dir, { recursive: true, force: true });
                    } catch {
                        /* ignore */
                    }
                }, 120000);
                if (err) reject(err);
                else resolve();
            });
        });

        return res.json({ success: true, via: 'outlook-com' });
    } catch (err) {
        console.error('Error in /outlook-draft:', err);
        return res.status(500).json({
            error: 'outlook_draft_failed',
            message: err.message || String(err),
        });
    }
});

// POST /api/quotes/email-draft — build .eml draft (From = logged-in user) and return it as a downloadable attachment.
router.post('/email-draft', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const {
            userEmail,
            userDisplayName,
            to,
            cc,
            bcc,
            subject,
            body,
            attachmentName,
            pdfBase64,
            extraAttachments,
        } = req.body || {};

        const fromEmail = stripQuotes(userEmail);
        if (!fromEmail) {
            return res.status(400).json({ error: 'userEmail is required (logged-in user address for From)' });
        }

        const emlBuffer = await buildQuoteEmlDraftBuffer({
            fromEmail,
            fromDisplayName: userDisplayName,
            to: to || '',
            cc: cc || '',
            bcc: bcc || '',
            subject: subject || '',
            body: body || '',
            attachmentName,
            pdfBase64,
            extraAttachments,
        });

        const safeBase = String(attachmentName || 'EMS_QuoteDraft')
            .replace(/\.pdf$/i, '')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .slice(0, 80);

        const emlFileName = `${safeBase}.eml`;

        res.setHeader('Content-Type', 'message/rfc822');
        res.setHeader('Content-Disposition', `attachment; filename="EMS_QuoteDraft.eml"`);
        res.setHeader('Content-Length', String(emlBuffer.length));
        return res.send(emlBuffer);
    } catch (err) {
        console.error('Error in /email-draft route:', err);
        try {
            fs.appendFileSync(
                path.join(__dirname, '../quote_creation_error.log'),
                `\n[${new Date().toISOString()}] /email-draft Error: ${err.message}\nStack: ${err.stack}\n`
            );
        } catch (logErr) {
            console.error('Failed to write to error log:', logErr);
        }
        res.status(500).json({
            error: 'Could not build quote email draft',
            details: err.message || String(err),
        });
    }
});

// NOTE: Static routes MUST be defined BEFORE dynamic parameter routes
// to prevent Express from interpreting path segments like 'lists' as parameter values

// GET /api/quotes/lists/metadata - Fetch lists for dropdowns
router.get('/lists/metadata', async (req, res) => {
    try {
        const usersResult = await sql.query`SELECT FullName, Designation, EmailId, Department, MobileNumber FROM Master_ConcernedSE WHERE Status = 'Active' ORDER BY FullName`;
        const customersMasterRes = await sql.query`
            SELECT *
            FROM Master_CustomerName
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;
        const customersConsultantRes = await sql.query`
            SELECT *
            FROM Master_ConsultantName
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;
        const customersClientRes = await sql.query`
            SELECT *
            FROM Master_clientname
            WHERE ISNULL(Status, 'Active') = 'Active'
        `;

        // Merge sources by CompanyName with priority order for address:
        // Master_CustomerName -> Master_ConsultantName -> Master_clientname.
        const byName = new Map();
        const upsertCustomer = (r) => {
            const name = (r?.CompanyName || '').toString().trim();
            if (!name) return;
            const normalized = name.toLowerCase();
            const incoming = {
                CompanyName: name,
                Address1: r?.Address1 || '',
                Address2: r?.Address2 || '',
                Phone1: r?.Phone1 || '',
                Phone2: r?.Phone2 || '',
                FaxNo: r?.FaxNo || '',
                EmailId: r?.EmailId || r?.Emailld || ''
            };
            const hasAddress = (obj) => !!([obj?.Address1, obj?.Address2].filter(Boolean).join(' ').trim());
            const existing = byName.get(normalized);
            if (!existing) {
                byName.set(normalized, incoming);
                return;
            }
            const existingHasAddress = hasAddress(existing);
            const incomingHasAddress = hasAddress(incoming);
            byName.set(normalized, {
                CompanyName: existing.CompanyName || incoming.CompanyName,
                Address1: existingHasAddress ? existing.Address1 : (incoming.Address1 || existing.Address1),
                Address2: existingHasAddress ? existing.Address2 : (incoming.Address2 || existing.Address2),
                Phone1: existing.Phone1 || incoming.Phone1,
                Phone2: existing.Phone2 || incoming.Phone2,
                FaxNo: existing.FaxNo || incoming.FaxNo,
                EmailId: existing.EmailId || incoming.EmailId
            });
        };

        (customersMasterRes.recordset || []).forEach(upsertCustomer);
        (customersConsultantRes.recordset || []).forEach(upsertCustomer);
        (customersClientRes.recordset || []).forEach(upsertCustomer);

        const mergedCustomers = Array.from(byName.values()).sort((a, b) =>
            String(a.CompanyName || '').localeCompare(String(b.CompanyName || ''))
        );

        let enquiryTypes = [];
        try {
            const etRes = await sql.query`SELECT TypeName FROM Master_EnquiryType ORDER BY TypeName`;
            enquiryTypes = (etRes.recordset || []).map(r => r.TypeName).filter(Boolean);
        } catch (e) {
            console.warn('[lists/metadata] Master_EnquiryType not available:', e.message);
        }

        res.json({ users: usersResult.recordset, customers: mergedCustomers, enquiryTypes });
    } catch (err) {
        console.error('Error fetching metadata lists:', err);
        res.status(500).json({ error: 'Failed to fetch lists' });
    }
});

/** FullName list where Master_ConcernedSE.Department matches dept (trim / collapse spaces / L-prefix strip). */
router.get('/attention-by-department', async (req, res) => {
    try {
        const dept = String(req.query.dept || '').trim();
        if (!dept) return res.json([]);
        // Pull Prefix so "Attention of" displays "<Prefix> <FullName>" (e.g. "Mr. Arun Venkatesh").
        const masterSeRes = await sql.query`
            SELECT FullName, Department, Prefix FROM Master_ConcernedSE
            WHERE FullName IS NOT NULL AND LTRIM(RTRIM(FullName)) <> N''
              AND (Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N'')
        `;
        const normDeptLabel = (s) =>
            String(s || '')
                .replace(/\u00a0/g, ' ')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        const stripJobPrefix = (name) => String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
        const target = normDeptLabel(stripJobPrefix(dept));
        if (!target) return res.json([]);
        const composeName = (rawName, rawPrefix) => {
            const n = String(rawName || '').trim();
            let p = String(rawPrefix || '').trim();
            if (!n) return '';
            if (!p) return n;
            // Always render the prefix with a trailing period — DB may store "Mr", "Mr.", or "Mr.." inconsistently.
            p = p.replace(/[.!?,;:]+$/g, '') + '.';
            const nL = n.toLowerCase();
            const pL = p.toLowerCase();
            const pBare = pL.replace(/\.+$/, '');
            if (
                nL === pL ||
                nL === pBare ||
                nL.startsWith(pL + ' ') ||
                nL.startsWith(pBare + ' ') ||
                nL.startsWith(pBare + '.')
            ) {
                return n;
            }
            return `${p} ${n}`;
        };
        const names = (masterSeRes.recordset || [])
            .filter((r) => normDeptLabel(r.Department) === target)
            .map((r) => composeName(r.FullName, r.Prefix))
            .filter(Boolean);
        res.json([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    } catch (e) {
        console.error('[quotes] attention-by-department:', e);
        res.status(500).json([]);
    }
});

router.get('/list/pending', async (req, res) => {
    try {
        let { userEmail, division } = req.query;
        const divisionTrim = (division || '').toString().trim();
        console.log(`[API] Check Pending Quotes for ${userEmail || 'All'}... division=${divisionTrim || '(none)'}`);
        const { enquiries, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(sql, userEmail, '', divisionTrim);
        if (Array.isArray(enquiries) && enquiries.length > 0) {
            const e0 = enquiries[0];
            console.log('[API] Pending raw row sample:', {
                ReqNo: e0.RequestNo,
                ProjectName: e0.ProjectName,
                ListPendingOwnJobItem: e0.ListPendingOwnJobItem,
                ListPendingLeadJobName: e0.ListPendingLeadJobName,
                ListPendingCustomerName: e0.ListPendingCustomerName,
                DivisionFilter: divisionTrim || '',
            });
        }
        if (enquiries.length > 0) {
            const finalMapped = await mapQuoteListingRows(sql, enquiries, ue, accessCtx, divisionTrim);
            const pendingRows = finalMapped.filter((row) => !shouldOmitFromPendingQuoteList(row));
            if (pendingRows.length > 0) {
                console.log(`[API] FINAL DATA Enq 0:`, {
                    ReqNo: pendingRows[0].RequestNo,
                    Client: pendingRows[0].ClientName,
                    Consultant: pendingRows[0].ConsultantName,
                    SubJobPricesLen: pendingRows[0].SubJobPrices?.length,
                });
            }
            console.log(`[API] Pending Quotes found: ${pendingRows.length}`);
            return res.json(pendingRows);
        }
        return res.json([]);
    } catch (err) {
        console.error('Error fetching pending quotes:', err);
        res.status(500).json({ error: 'Failed to fetch pending quotes', details: err.message });
    }
});

router.get('/list/search', async (req, res) => {
    try {
        let { userEmail, q, dateFrom, dateTo, division } = req.query;
        const divisionTrim = (division || '').toString().trim();
        let extra = buildQuoteListSearchExtraWhere(q || '', dateFrom || '', dateTo || '', {
            includeWorkflowSearch: true,
        });
        if (!extra.ok) {
            return res.json([]);
        }

        let pendingRaw;
        let quotedRaw;
        let approvalRaw;
        let accessCtx;
        let ue;
        try {
            ({ enquiries: pendingRaw, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(
                sql,
                userEmail,
                extra.sql,
                divisionTrim
            ));
            ({ enquiries: quotedRaw } = await runQuotedQuoteListQuery(sql, userEmail, extra.sql, divisionTrim));
            ({ enquiries: approvalRaw } = await runApprovalWorkflowQuoteListQuery(sql, userEmail, extra.sql));
        } catch (err) {
            if (!isMissingQuoteApprovalStepsTableError(err.message)) {
                throw err;
            }
            extra = buildQuoteListSearchExtraWhere(q || '', dateFrom || '', dateTo || '', {
                includeWorkflowSearch: false,
            });
            if (!extra.ok) {
                return res.json([]);
            }
            ({ enquiries: pendingRaw, accessCtx, userEmail: ue } = await runPendingQuoteListQuery(
                sql,
                userEmail,
                extra.sql,
                divisionTrim
            ));
            ({ enquiries: quotedRaw } = await runQuotedQuoteListQuery(sql, userEmail, extra.sql, divisionTrim));
            approvalRaw = [];
        }
        const pendingMapped = await mapQuoteListingRows(sql, pendingRaw || [], ue, accessCtx, divisionTrim);
        const quotedMapped = await mapQuoteListingRows(sql, quotedRaw || [], ue, accessCtx, divisionTrim);
        const approvalMapped = await mapQuoteListingRows(sql, approvalRaw || [], ue, accessCtx, '');
        const byNo = new Map();
        const quoteRowScore = (row) => {
            if (!row) return 0;
            let score = 0;
            const ref = String(row.ListQuoteRef || '').trim();
            if (ref) score += 50;
            const st = String(row.ListQuoteRollupStatus || '').trim();
            if (st === 'All Quoted') score += 30;
            else if (st === 'Partial Quoted') score += 20;
            else if (st === 'None Quoted') score += 5;
            const lines = Array.isArray(row.ListQuoteDetailLines) ? row.ListQuoteDetailLines : [];
            if (lines.some((ln) => quoteDetailLineResolved(ln))) score += 20;
            if (String(row.ListQuoteDate || '').trim()) score += 10;
            return score;
        };
        const pickBetter = (prev, next) => {
            if (!prev) return next;
            if (!next) return prev;
            const prevWf = Boolean(prev.ApprovalWorkflowListAccess || prev.ListApprovalWorkflowQuoteId);
            const nextWf = Boolean(next.ApprovalWorkflowListAccess || next.ListApprovalWorkflowQuoteId);
            if (prevWf && !nextWf) return prev;
            if (nextWf && !prevWf) return next;
            const a = quoteRowScore(prev);
            const b = quoteRowScore(next);
            if (b > a) return next;
            if (a > b) return prev;
            // Tie-breaker: prefer quoted-kind row over pending-kind row.
            if (prev.QuoteListKind === 'quoted') return prev;
            if (next.QuoteListKind === 'quoted') return next;
            return next;
        };
        for (const row of pendingMapped) {
            const key = String(row.RequestNo);
            const next = { ...row, QuoteListKind: 'pending' };
            byNo.set(key, pickBetter(byNo.get(key), next));
        }
        for (const row of quotedMapped) {
            const key = String(row.RequestNo);
            const next = { ...row, QuoteListKind: 'quoted' };
            byNo.set(key, pickBetter(byNo.get(key), next));
        }
        for (const row of approvalMapped) {
            const key = String(row.RequestNo);
            const wfQuoteId = Number(row.ApprovalWorkflowQuoteId ?? row.approvalworkflowquoteid);
            const next = {
                ...row,
                QuoteListKind: 'quoted',
                ListApprovalWorkflowQuoteId: Number.isFinite(wfQuoteId) && wfQuoteId > 0 ? wfQuoteId : null,
            };
            byNo.set(key, pickBetter(byNo.get(key), next));
        }
        const merged = Array.from(byNo.values()).sort((a, b) => {
            const ta = a.DueDate ? new Date(a.DueDate).getTime() : 0;
            const tb = b.DueDate ? new Date(b.DueDate).getTime() : 0;
            return tb - ta;
        });
        const enriched = await enrichQuoteListRowsWithApprovalStatus(merged);
        return res.json(enriched);
    } catch (err) {
        console.error('Error searching quote lists:', err);
        res.status(500).json({ error: 'Failed to search quote lists', details: err.message });
    }
});

// GET /api/quotes/config/templates - List templates for the requesting user only
router.get('/config/templates', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json([]);
        }
        const result = await sql.query`
            SELECT * FROM QuoteTemplates
            WHERE LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${userEmail}
            ORDER BY TemplateName
        `;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// GET /api/quotes/by-quote-number — exact saved revision from EnquiryQuotes
router.get('/by-quote-number', async (req, res) => {
    try {
        const requestNo = String(req.query.requestNo || '').trim();
        const quoteNumber = String(req.query.quoteNumber || '').trim();
        const userEmail = String(req.query.userEmail || '').trim();
        if (!requestNo || !quoteNumber) {
            return res.status(400).json({ error: 'requestNo and quoteNumber are required' });
        }

        const result = await sql.query`
            SELECT *,
                   CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${requestNo}))
              AND LTRIM(RTRIM(QuoteNumber)) = LTRIM(RTRIM(${quoteNumber}))
        `;

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Quote not found for this reference' });
        }

        const row = result.recordset[0];
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(
                normalizedEmail,
                row.RequestNo,
                '',
                row.ID ?? row.id
            );
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        res.json(row);
    } catch (err) {
        console.error('Error fetching quote by number:', err);
        res.status(500).json({ error: 'Failed to fetch quote by reference' });
    }
});

// GET /api/quotes/single/:id - Get a specific quote by ID
router.get('/single/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userEmail = (req.query.userEmail || '').toString().trim();

        const result = await sql.query`
            SELECT *,
                   CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd
            FROM EnquiryQuotes WHERE ID = ${id}
        `;

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const row = result.recordset[0];
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(
                normalizedEmail,
                row.RequestNo,
                '',
                row.ID ?? row.id
            );
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        res.json(row);
    } catch (err) {
        console.error('Error fetching quote:', err);
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

// GET /api/quotes/by-enquiry/:requestNo - Get all quotes for an enquiry
router.get('/by-enquiry/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        let toName = (req.query.toName || '').toString().trim();
        const toNameStripped = stripJobPrefixForQuoteMatch(toName) || null;
        const leadJobName = (req.query.leadJobName || '').toString().trim();
        const leadJobNameStripped = stripJobPrefixForQuoteMatch(leadJobName) || null;
        const leadBranchCodeParam = (req.query.leadBranchCode || '').toString().trim();
        const strictLeadBranchCode =
            extractStrictLeadBranchCode(leadJobName, leadBranchCodeParam) || null;
        const userEmail = (req.query.userEmail || '').toString().trim();
        // In strict tuple mode, OwnJob can come from explicit tab ownJobName (direct subjob tab),
        // otherwise fallback to Division dropdown resolution.
        const ownJobNameFromTabRaw = (req.query.ownJobName || '').toString().trim();
        const ownJobNameFromTabStripped = stripJobPrefixForQuoteMatch(ownJobNameFromTabRaw) || null;
        const strictTuple = String(req.query.strictTuple || '').trim() === '1';
        const division = (req.query.division || '').toString().trim(); // Master_EnquiryFor.DepartmentName
        const quoteIdParam = req.query.quoteId ? Number(req.query.quoteId) : null;

        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(
                normalizedEmail,
                requestNo,
                (req.query.division || '').toString().trim(),
                Number.isFinite(quoteIdParam) && quoteIdParam > 0 ? quoteIdParam : null
            );
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        // Scoped request: client sent at least one dimension to filter by.
        // Unfiltered list (?userEmail only): must NOT apply OwnJob from user department or every enquiry
        // would only show rows matching Master_ConcernedSE.Department — hiding Civil quotes for HVAC users, etc.
        const ownJobNameFromTab = ownJobNameFromTabRaw;
        const hasScopedFilters = Boolean(toName || leadJobName || ownJobNameFromTab);

        // HARD RULE (scoped only):
        // - Own-tab without ownJobName query: resolve OwnJob from logged-in user's email.
        // - Subjob-tab: use explicit ownJobName from selected tab label.
        let ownJobName = '';
        let strictDivisionCode = '';
        if (strictTuple && (division || ownJobNameFromTab)) {
            strictDivisionCode = await resolveQuoteStrictDivisionCode(requestNo, {
                division,
                ownJobName: ownJobNameFromTab,
            });
            if (ownJobNameFromTab) {
                ownJobName = ownJobNameFromTab;
            } else if (division) {
                try {
                    const r = await sql.query`
                        SELECT TOP 1 ef.ItemName
                        FROM dbo.EnquiryFor ef
                        INNER JOIN dbo.Master_EnquiryFor mef
                            ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                        WHERE LTRIM(RTRIM(ef.RequestNo)) = LTRIM(RTRIM(${requestNo}))
                          AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(${division}))
                        ORDER BY
                            CASE WHEN ef.ParentID IS NULL OR ef.ParentID = 0 OR ef.ParentID = '0' THEN 0 ELSE 1 END,
                            ef.ID`;
                    ownJobName = (r.recordset?.[0]?.ItemName || '').toString().trim();
                } catch (_) {
                    // fall through
                }
            }
        } else if (ownJobNameFromTab) {
            ownJobName = ownJobNameFromTab;
        } else if (userEmail && hasScopedFilters) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const userRes = await sql.query`
                SELECT TOP 1 Department
                FROM Master_ConcernedSE
                WHERE
                    LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail}
                    OR LOWER(REPLACE(REPLACE(REPLACE(
                        LEFT(LTRIM(RTRIM(ISNULL(EmailId, ''))), CHARINDEX('@', LTRIM(RTRIM(ISNULL(EmailId, ''))) + '@') - 1),
                        '.', ''), '-', ''), '_', '')) =
                       LOWER(REPLACE(REPLACE(REPLACE(
                        LEFT(${normalizedEmail}, CHARINDEX('@', ${normalizedEmail} + '@') - 1),
                        '.', ''), '-', ''), '_', ''))
                ORDER BY CASE
                    WHEN LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedEmail} THEN 0
                    ELSE 1
                END
            `;
            if (userRes.recordset && userRes.recordset.length > 0 && userRes.recordset[0].Department) {
                ownJobName = userRes.recordset[0].Department.trim();
            }
        }

        // Strict tuple MUST NOT broaden. If any dimension is missing, return empty so UI doesn't show another tuple's Quote Ref.
        if (strictTuple) {
            if (!String(leadJobName || '').trim()) return res.json([]);
            if (!String(toName || '').trim()) return res.json([]);
            // OwnJob must be available either from explicit tab ownJobName or from Division resolution.
            if (!String(division || '').trim() && !String(ownJobNameFromTab || '').trim()) return res.json([]);
            if (!String(ownJobName || '').trim()) return res.json([]);
        }

        console.log(
            `[Quote API] Fetching quotes for RequestNo: ${requestNo}, LeadJob: "${leadJobName}", ToName: "${toName}", OwnJob(resolved): "${ownJobName}"`
        );

        const request = new sql.Request();
        request.input('requestNo', sql.NVarChar, requestNo);
        request.input('toName', sql.NVarChar, toName || null);
        request.input('toNameStripped', sql.NVarChar, toNameStripped);
        request.input('leadJobName', sql.NVarChar, leadJobName || null);
        request.input('leadJobNameStripped', sql.NVarChar, leadJobNameStripped);
        request.input('ownJobName', sql.NVarChar, ownJobName || null);
        request.input('ownJobNameStripped', sql.NVarChar, ownJobNameFromTabStripped || stripJobPrefixForQuoteMatch(ownJobName) || null);
        request.input('strictDivisionCode', sql.NVarChar, strictDivisionCode || null);
        request.input('strictLeadBranchCode', sql.NVarChar, strictLeadBranchCode);
        request.input('strictTuple', sql.Bit, strictTuple ? 1 : 0);

        let result = await request.query(BY_ENQUIRY_QUOTES_SQL);
        if (strictTuple && userEmail && (result.recordset?.length || 0) === 0) {
            const normalizedRelax = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ctxRelax = await resolvePricingAccessContext(normalizedRelax);
            if (ctxRelax.isCcUser) {
                const relaxReq = new sql.Request();
                relaxReq.input('requestNo', sql.NVarChar, requestNo);
                relaxReq.input('toName', sql.NVarChar, toName || null);
                relaxReq.input('toNameStripped', sql.NVarChar, toNameStripped);
                relaxReq.input('leadJobName', sql.NVarChar, leadJobName || null);
                relaxReq.input('leadJobNameStripped', sql.NVarChar, leadJobNameStripped);
                relaxReq.input('ownJobName', sql.NVarChar, ownJobName || null);
                relaxReq.input('ownJobNameStripped', sql.NVarChar, ownJobNameFromTabStripped || stripJobPrefixForQuoteMatch(ownJobName) || null);
                relaxReq.input('strictDivisionCode', sql.NVarChar, strictDivisionCode || null);
                relaxReq.input('strictLeadBranchCode', sql.NVarChar, strictLeadBranchCode);
                relaxReq.input('strictTuple', sql.Bit, 0);
                result = await relaxReq.query(BY_ENQUIRY_QUOTES_SQL);
            }
        }

        console.log(`[Quote API] Found ${result.recordset.length} quotes for RequestNo ${requestNo}`);

        let rows = result.recordset || [];
        if (userEmail && rows.length > 0) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const sessionDiv = (req.query.division || '').toString().trim();
            const scopeDiv = ownJobNameFromTabRaw || sessionDiv;
            const restriction = await resolveApprovalWorkflowQuoteRestriction(
                normalizedEmail,
                requestNo,
                scopeDiv
            );
            if (restriction.restrict && restriction.quoteIds.length > 0) {
                const allowedIds = new Set(restriction.quoteIds);
                if (Number.isFinite(quoteIdParam) && quoteIdParam > 0) {
                    rows = rows.filter(
                        (r) => Number(r.ID) === quoteIdParam && allowedIds.has(quoteIdParam)
                    );
                } else {
                    rows = rows.filter((r) => allowedIds.has(Number(r.ID)));
                }
            } else if (restriction.scopeToSessionDivision) {
                const ctx = await resolvePricingAccessContext(normalizedEmail);
                const enqJobs = await fetchEnquiryForJobsForAccess(requestNo);
                rows = filterQuotesToSessionDivision(rows, enqJobs, scopeDiv, ctx.userDepartment);
            }
        }

        res.json(rows);
    } catch (err) {
        console.error('[Quote API] Error fetching quotes for enquiry:', err);
        console.error('[Quote API] Error details:', err.message);
        console.error('[Quote API] Stack:', err.stack);
        res.status(500).json({ error: 'Failed to fetch quotes', details: err.message });
    }
});

// GET /api/quotes/access/:requestNo - Create/revise rights (same scope as pricing pending list)
router.get('/access/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = (req.query.userEmail || '').toString().trim();

        if (!userEmail) {
            return res.json({ canCreate: false, seName: null });
        }

        const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');

        const ctx = await resolvePricingAccessContext(normalizedEmail);
        if (!ctx.user) {
            return res.json({ canCreate: false, seName: null });
        }

        const userRes = await sql.query`
            SELECT TOP 1 FullName, Roles, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = LOWER(LTRIM(${normalizedEmail}))
        `;

        const row = userRes.recordset?.[0];
        const seNameFromMaster = row?.FullName ? String(row.FullName).trim() : null;
        const seName = seNameFromMaster || ctx.userFullName || null;

        const roleStr = String(row?.Roles || ctx.user?.Roles || '').toLowerCase();
        const isAdmin = roleStr.includes('admin') || roleStr.includes('system');
        if (isAdmin) {
            return res.json({ canCreate: true, seName, reason: 'admin' });
        }

        const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, requestNo);
        if (!ok) {
            return res.json({ canCreate: false, seName });
        }

        const reason = ctx.isCcUser ? 'cc_coordinator' : 'scoped';
        return res.json({ canCreate: true, seName, reason });
    } catch (err) {
        console.error('[Quote API] Error in /access:', err);
        res.status(500).json({ error: 'Failed to check access', details: err.message });
    }
});

// GET /api/quotes/prepared-signatory-options?division=...
// Prepared By = distinct Master_ConcernedSE in division + CCMailIds users for that division only
//   (notification-excluded addresses omitted from Prepared By).
// Signatory / Co-Signatory = ALL CCMailIds for that division mapped to Master_ConcernedSE
//   (falls back to Prepared By when empty).
router.get('/prepared-signatory-options', async (req, res) => {
    try {
        const division = String(req.query.division || '').trim();
        if (!division) {
            return res.json({ preparedByOptions: [], signatoryOptions: [] });
        }
        const result = await fetchQuoteDivisionUserOptions(division);
        return res.json(result);
    } catch (err) {
        console.error('[Quote API] Error in /prepared-signatory-options:', err);
        res.status(500).json({ preparedByOptions: [], signatoryOptions: [] });
    }
});

// GET /api/quotes/signatory-options-by-user?userEmail=...
// Used as a fallback when enquiryData.divisionEmails does not produce signatory options.
// Logic (per user request):
// 1) current user email -> Department from Master_ConcernedSE
// 2) Department -> CCMailIds from Master_EnquiryFor (ItemName match)
// 3) Return CCMailIds as a normalized email list for frontend to map to usersList.
router.get('/signatory-options-by-user', async (req, res) => {
    try {
        const userEmail = (req.query.userEmail || '').toString().trim();
        if (!userEmail) return res.json({ ccMails: [] });

        const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');

        const deptRes = await sql.query`
            SELECT TOP 1 Department
            FROM Master_ConcernedSE
            WHERE EmailId = ${normalizedEmail}
        `;

        const dept = deptRes.recordset?.[0]?.Department ? deptRes.recordset[0].Department.toString().trim() : '';
        if (!dept) return res.json({ ccMails: [] });

        let ccRes = await sql.query`
            SELECT TOP 1 CCMailIds
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${dept}))
               OR ItemName = ${dept}
        `;

        let ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
        // Department often does not exactly match Master_EnquiryFor.ItemName (e.g. "HVAC Project" vs "L1 - HVAC Project").
        if (!ccRaw.trim() && dept) {
            const safe = String(dept).replace(/%/g, '');
            ccRes = await sql.query`
                SELECT TOP 1 CCMailIds
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ItemName)) LIKE ${'%' + safe + '%'}
            `;
            ccRaw = (ccRes.recordset?.[0]?.CCMailIds || '').toString();
        }
        const ccMails = Array.from(new Set(
            ccRaw
                .replace(/;/g, ',')
                .split(',')
                .map(m => m.trim().toLowerCase())
                .filter(Boolean)
                .map(m => m.replace(/@almcg\.com/g, '@almoayyedcg.com'))
        ));

        return res.json({ ccMails });
    } catch (err) {
        console.error('[Quote API] Error in /signatory-options-by-user:', err);
        res.status(500).json({ ccMails: [] });
    }
});

// GET /api/quotes/approver-options?userEmail=...
// Distinct approver pool: all active Master_ConcernedSE in the user's company
// (Master_EnquiryFor.CompanyName) plus CCMailIds from every division in that company.
router.get('/approver-options', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) return res.json({ companyName: '', users: [] });

        const deptRes = await sql.query`
            SELECT TOP 1 Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${userEmail}
        `;
        const userDept = String(deptRes.recordset?.[0]?.Department || '').trim();

        let companyName = String(req.query.companyName || '').trim();
        if (!companyName) companyName = await resolveUserCompanyName(userDept);

        const mefRows = companyName
            ? (await sql.query`
                SELECT ItemName, DepartmentName, CCMailIds, CompanyName
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) = LTRIM(RTRIM(${companyName}))
            `).recordset || []
            : [];

        const allUsersRes = await sql.query`
            SELECT FullName, Designation, EmailId, Department, MobileNumber
            FROM Master_ConcernedSE
            WHERE Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N''
            ORDER BY FullName
        `;
        const allUsers = allUsersRes.recordset || [];
        const usersByEmail = new Map();
        for (const u of allUsers) {
            const em = normalizeUserEmail(u.EmailId);
            if (em) usersByEmail.set(em, u);
        }

        const seen = new Set();
        const merged = [];

        const addUser = (raw) => {
            const email = normalizeUserEmail(raw?.EmailId || raw?.email);
            if (!email || seen.has(email)) return;
            const hit = usersByEmail.get(email);
            const source = hit || raw;
            const name = String(source?.FullName || source?.fullName || '').trim();
            if (!name && !email) return;
            seen.add(email);
            merged.push({
                FullName: name || email.split('@')[0],
                Designation: String(source?.Designation || '').trim(),
                EmailId: String(source?.EmailId || email).trim(),
                Department: String(source?.Department || '').trim(),
                MobileNumber: source?.MobileNumber || '',
            });
        };

        if (companyName && mefRows.length) {
            for (const u of allUsers) {
                if (mefRows.some((row) => departmentMatchesMefRow(u.Department, row))) {
                    addUser(u);
                }
            }
        }

        const ccEmails = new Set();
        for (const row of mefRows) {
            for (const em of parseMailCsv(row.CCMailIds)) {
                const norm = normalizeUserEmail(em);
                if (norm) ccEmails.add(norm);
            }
        }

        if (!mefRows.length && userDept) {
            const safeDept = userDept.replace(/%/g, '');
            let ccRes = await sql.query`
                SELECT TOP 1 CCMailIds
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${userDept}))
                   OR LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${userDept}))
            `;
            let ccRaw = String(ccRes.recordset?.[0]?.CCMailIds || '');
            if (!ccRaw.trim()) {
                ccRes = await sql.query`
                    SELECT TOP 1 CCMailIds
                    FROM Master_EnquiryFor
                    WHERE LTRIM(RTRIM(ItemName)) LIKE ${'%' + safeDept + '%'}
                       OR LTRIM(RTRIM(DepartmentName)) LIKE ${'%' + safeDept + '%'}
                `;
                ccRaw = String(ccRes.recordset?.[0]?.CCMailIds || '');
            }
            for (const em of parseMailCsv(ccRaw)) {
                const norm = normalizeUserEmail(em);
                if (norm) ccEmails.add(norm);
            }
        }

        for (const em of ccEmails) {
            addUser(usersByEmail.get(em) || { EmailId: em });
        }

        merged.sort((a, b) => String(a.FullName).localeCompare(String(b.FullName)));
        return res.json({ companyName, users: merged });
    } catch (err) {
        console.error('[Quote API] Error in /approver-options:', err);
        res.status(500).json({ companyName: '', users: [] });
    }
});

// GET /api/quotes/approval-hierarchies?userEmail=...
router.get('/approval-hierarchies', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) return res.json([]);
        const rows = await fetchApprovalHierarchiesForUser(userEmail);
        res.json(rows);
    } catch (err) {
        if (isMissingQuoteApprovalHierarchyTableError(err.message)) {
            return res.json([]);
        }
        console.error('[Quote API] GET /approval-hierarchies:', err);
        res.status(500).json({ error: 'Failed to load approval hierarchies', details: err.message });
    }
});

// POST /api/quotes/approval-hierarchies — save named approver sequence for user
router.post('/approval-hierarchies', express.json(), async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.body?.userEmail);
        const name = String(req.body?.name || req.body?.hierarchyName || '').trim();
        const steps = req.body?.steps;
        const hierarchyId = req.body?.id ?? req.body?.hierarchyId ?? null;
        if (!userEmail) return res.status(400).json({ error: 'userEmail is required' });
        if (!name) return res.status(400).json({ error: 'Hierarchy name is required' });

        const saved = await saveApprovalHierarchy(userEmail, name, steps, hierarchyId);
        res.json({ success: true, hierarchy: saved });
    } catch (err) {
        if (isMissingQuoteApprovalHierarchyTableError(err.message)) {
            return res.status(503).json({
                error: 'Approval hierarchy storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_hierarchy.js',
            });
        }
        console.error('[Quote API] POST /approval-hierarchies:', err);
        res.status(400).json({ error: err.message || 'Failed to save approval hierarchy' });
    }
});

// DELETE /api/quotes/approval-hierarchies/:id?userEmail=...
router.delete('/approval-hierarchies/:id', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        const hierarchyId = Number(req.params.id);
        if (!userEmail) return res.status(400).json({ error: 'userEmail is required' });
        const ok = await deleteApprovalHierarchy(userEmail, hierarchyId);
        if (!ok) return res.status(404).json({ error: 'Hierarchy not found' });
        res.json({ success: true });
    } catch (err) {
        if (isMissingQuoteApprovalHierarchyTableError(err.message)) {
            return res.status(503).json({
                error: 'Approval hierarchy storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_hierarchy.js',
            });
        }
        console.error('[Quote API] DELETE /approval-hierarchies:', err);
        res.status(500).json({ error: 'Failed to delete approval hierarchy', details: err.message });
    }
});

// GET /api/quotes/user-digital-signatures?userEmail= — Master_ConcernedSE.DigitalSignaturesJson
router.get('/user-digital-signatures', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) return res.status(400).json({ error: 'userEmail is required' });

        const row = await sql.query`
            SELECT TOP 1 DigitalSignaturesJson
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${userEmail}
        `;
        const master = parseUserSignatureMaster(row.recordset?.[0]?.DigitalSignaturesJson);
        return res.json({
            defaultSignatureId: master.defaultSignatureId,
            signatures: master.signatures,
        });
    } catch (err) {
        console.error('[Quote API] GET /user-digital-signatures:', err);
        res.status(500).json({ error: 'Failed to load signature library', details: err.message });
    }
});

// PUT /api/quotes/user-digital-signatures — save library to Master_ConcernedSE
router.put('/user-digital-signatures', express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.body.userEmail);
        if (!userEmail) return res.status(400).json({ error: 'userEmail is required' });

        const jsonStr = serializeUserSignatureMaster({
            defaultSignatureId: req.body.defaultSignatureId,
            signatures: req.body.signatures,
        });

        const upd = await sql.query`
            UPDATE Master_ConcernedSE
            SET DigitalSignaturesJson = ${jsonStr}
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${userEmail}
        `;
        if ((upd.rowsAffected?.[0] || 0) === 0) {
            return res.status(404).json({ error: 'User not found in Master_ConcernedSE' });
        }
        const master = parseUserSignatureMaster(jsonStr);
        return res.json({
            ok: true,
            defaultSignatureId: master.defaultSignatureId,
            signatures: master.signatures,
        });
    } catch (err) {
        console.error('[Quote API] PUT /user-digital-signatures:', err);
        res.status(500).json({ error: 'Failed to save signature library', details: err.message });
    }
});

// GET /api/quotes/enquiry-data/:requestNo - Get enquiry data for quote generation
router.get('/enquiry-data/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = (req.query.userEmail || '').toString().trim();
        const sessionDivision = (req.query.division || '').toString().trim();
        const scope = (req.query.scope || '').toString().trim().toLowerCase();
        const quoteIdParam = req.query.quoteId ? Number(req.query.quoteId) : null;
        const leadOnly = scope === 'lead' || scope === 'leadjobs';
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const ok = await userHasQuotePricingEnquiryAccess(
                normalizedEmail,
                requestNo,
                sessionDivision,
                Number.isFinite(quoteIdParam) ? quoteIdParam : null
            );
            if (!ok) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        let effectiveSessionDivision = sessionDivision;
        let restrictWorkflowQuotes = false;
        if (userEmail) {
            const normalizedEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const restriction = await resolveApprovalWorkflowQuoteRestriction(
                normalizedEmail,
                requestNo,
                sessionDivision
            );
            restrictWorkflowQuotes = restriction.restrict;
            if (restrictWorkflowQuotes) {
                effectiveSessionDivision = '';
            }
        }

        console.log(`[Quote API] Fetching data for RequestNo: ${requestNo}`);

        // Get enquiry details
        let enquiry;
        try {
            const enquiryResult = await sql.query`
                SELECT RequestNo, ProjectName, CustomerName, ReceivedFrom,
                       EnquiryDate, DueDate, CustomerRefNo
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;
            if (enquiryResult.recordset.length === 0) {
                console.log(`[Quote API] Enquiry not found for RequestNo: ${requestNo}`);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            // Polyfill missing columns
            // Fetch Enquiry Types
            const typesResult = await sql.query`SELECT TypeName FROM EnquiryType WHERE RequestNo = ${requestNo}`;
            enquiry.SelectedEnquiryTypes = typesResult.recordset.map(t => t.TypeName).filter(Boolean);
            enquiry.EnquiryType = enquiry.SelectedEnquiryTypes.join(', ');
            console.log('[Quote API] Enquiry found:', enquiry.ProjectName);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryMaster:', err);
            throw err;
        }

        // Get customer details (address, etc.) — skipped for lead-only scope (faster lead job dropdown)
        let customerDetails = null;
        if (!leadOnly && enquiry.CustomerName) {
            try {
                const customerNames = enquiry.CustomerName.split(',').map(c => c.trim());
                const composeAddress = (row) => [row?.Address1, row?.Address2].filter(Boolean).join('\n').trim();
                for (const name of customerNames) {
                    let bestFallback = null;

                    const customerResult = await sql.query`
                        SELECT * FROM Master_CustomerName 
                        WHERE CompanyName = ${name}
                    `;
                    if (customerResult.recordset.length > 0) {
                        const row = customerResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_CustomerName for:', name);
                            break; // priority 1 with address
                        }
                        bestFallback = row; // keep but continue to fallback sources for address
                    }

                    // Fallback source 1: Master_ConsultantName
                    const consultantResult = await sql.query`
                        SELECT TOP 1 *
                        FROM Master_ConsultantName
                        WHERE CompanyName = ${name}
                        ORDER BY ID DESC
                    `;
                    if (consultantResult.recordset.length > 0) {
                        const row = consultantResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_ConsultantName for:', name);
                            break; // priority 2 with address
                        }
                        if (!bestFallback) bestFallback = row;
                    }

                    // Fallback source 2: Master_clientname
                    const clientResult = await sql.query`
                        SELECT TOP 1 *
                        FROM Master_clientname
                        WHERE CompanyName = ${name}
                          AND (
                            RequestNo = ${requestNo}
                            OR RequestNo IS NULL
                            OR RequestNo = 0
                            OR LTRIM(RTRIM(CONVERT(NVARCHAR(50), RequestNo))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), ${requestNo})))
                          )
                        ORDER BY CASE WHEN RequestNo = ${requestNo} THEN 0 ELSE 1 END, ID DESC
                    `;
                    if (clientResult.recordset.length > 0) {
                        const row = clientResult.recordset[0];
                        const addr = composeAddress(row);
                        if (addr) {
                            customerDetails = row;
                            customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                            customerDetails.Address = addr;
                            console.log('[Quote API] Customer details found in Master_clientname for:', name);
                            break; // priority 2 with address
                        }
                        if (!bestFallback) bestFallback = row;
                    }

                    // No table had an address; keep first available row so other contact fields still populate.
                    if (!customerDetails && bestFallback) {
                        customerDetails = bestFallback;
                        customerDetails.EmailId = customerDetails.EmailId || customerDetails.Emailld || '';
                        customerDetails.Address = composeAddress(bestFallback);
                    }
                }
                if (!customerDetails) {
                    console.log('[Quote API] Customer details not found for any of:', enquiry.CustomerName);
                }
            } catch (err) {
                console.error('[Quote API] Error fetching Customer details:', err);
            }
        }

        // Get EnquiryFor items (divisions/inclusions)
        let divisionsList = [];
        let leadJobPrefix = '';
        let companyDetails = {
            code: 'AAC', // Default
            logo: null,
            name: 'Almoayyed Air Conditioning'
        };
        let availableProfiles = [];
        let divisionsHierarchy = []; // Declare at top level for response
        let userIsSubjobUser = false; // True if user's scope items all have a ParentID

        let resolvedItems = [];
        let rawItems = [];
        let enquiryForBrandingRows = [];
        let masterEnquiryForFooterLookup = {};
        try {
            // 1. Fetch raw items with Hierarchy (Join Master to get Default Assignments)
            // Use REPLACE/STUFF or logic to match both "L1 - Civil Project" and "Civil Project"
            const rawItemsResult = await sql.query`
                SELECT EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, EF.LeadJobName, MEF.CommonMailIds, MEF.CCMailIds, MEF.DepartmentName,
                       MEF.DivisionCode, MEF.DepartmentCode, MEF.Phone, MEF.FaxNo, MEF.CompanyName, MEF.Address
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR 
                    EF.ItemName LIKE '% - ' + MEF.ItemName OR
                    EF.ItemName LIKE '%- ' + MEF.ItemName OR
                    EF.ItemName LIKE MEF.ItemName + ' %' OR
                    (MEF.DepartmentName IS NOT NULL AND MEF.DepartmentName <> '' AND EF.ItemName LIKE '%' + MEF.DepartmentName + '%')
                )
                WHERE EF.RequestNo = ${requestNo}`;
            rawItems = rawItemsResult.recordset;

            // Helper to get Parent
            const getParent = (id) => rawItems.find(i => i.ID === id);

            // Filter Divisions based on User Access (Scope)
            const userEmail = req.query.userEmail || '';
            const fs = require('fs');
            const logPath = require('path').join(__dirname, '..', 'debug_quote_api.log');
            const log = (msg) => {
                try {
                    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
                } catch (e) {
                    console.warn('Logging failed:', e.message);
                }
            };

            log(`--- Enquiry Data Fetch for ${requestNo} ---`);
            log(`User: ${userEmail}`);
            log(`Raw Items Count: ${rawItems.length}`);

            // Deduplicate rawItems (Avoid Cartesian product from Master join) - MUST DO BEFORE BRANCH LOGIC
            const seenIds = new Set();
            const uniqueRawItems = [];
            for (const item of rawItems) {
                if (!seenIds.has(item.ID)) {
                    seenIds.add(item.ID);
                    uniqueRawItems.push(item);
                }
            }
            rawItems = uniqueRawItems;
            log(`Deduplicated Raw Items Count: ${rawItems.length}`);

            if (restrictWorkflowQuotes && Number.isFinite(quoteIdParam) && quoteIdParam > 0) {
                const qOwnRes = await sql.query`
                    SELECT TOP 1 OwnJob
                    FROM EnquiryQuotes
                    WHERE ID = ${quoteIdParam}
                      AND LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${requestNo}))
                `;
                const wfOwnJob = qOwnRes.recordset?.[0]?.OwnJob;
                if (wfOwnJob) {
                    rawItems = filterEnquiryForItemsToQuoteOwnJobBranch(rawItems, wfOwnJob);
                    log(
                        `Approval-workflow quote ${quoteIdParam}: scoped EnquiryFor to OwnJob "${wfOwnJob}" (${rawItems.length} items)`
                    );
                }
            }

            /**
             * Session division must NOT shrink the tree to matching rows only (that drops parent lead roots,
             * so the Quote Lead Job dropdown showed a single child job instead of every lead root where the
             * division participates). Expand: for each matching row, take its root and keep that full subtree.
             */
            if (effectiveSessionDivision && uniqueRawItems.length > 0) {
                let matching = uniqueRawItems.filter((item) =>
                    jobBelongsToSessionDivision(
                        { ItemName: item.ItemName, DepartmentName: item.DepartmentName },
                        effectiveSessionDivision
                    )
                );
                if (matching.length === 0) {
                    matching = getDepartmentPricingAnchors(uniqueRawItems, effectiveSessionDivision);
                    if (matching.length > 0) {
                        log(
                            `Session division "${effectiveSessionDivision}" matched via department anchor fallback on enquiry ${requestNo}`
                        );
                    }
                }
                if (matching.length === 0) {
                    log(
                        `Session division "${effectiveSessionDivision}" matched no rows on enquiry ${requestNo} — empty lead job scope`
                    );
                    rawItems = [];
                } else {
                    const byId = new Map();
                    uniqueRawItems.forEach((item) => {
                        if (item.ID != null) byId.set(String(item.ID), item);
                    });
                    const rootIdForItem = (item) => {
                        let curr = item;
                        let s = 0;
                        while (curr && s < 50) {
                            const pid = curr.ParentID;
                            if (pid == null || pid === '' || pid === '0' || pid === 0) return curr.ID;
                            const p = byId.get(String(pid));
                            if (!p) return curr.ID;
                            curr = p;
                            s++;
                        }
                        return curr.ID;
                    };
                    const rootsInvolved = new Set();
                    matching.forEach((m) => rootsInvolved.add(rootIdForItem(m)));

                    const childrenByParent = new Map();
                    uniqueRawItems.forEach((item) => {
                        const pid = item.ParentID;
                        if (pid == null || pid === '' || pid === '0' || pid === 0) return;
                        const k = String(pid);
                        if (!childrenByParent.has(k)) childrenByParent.set(k, []);
                        childrenByParent.get(k).push(item);
                    });

                    const allowedIds = new Set();
                    rootsInvolved.forEach((rid) => {
                        allowedIds.add(String(rid));
                        const queue = [rid];
                        while (queue.length) {
                            const id = queue.shift();
                            const kids = childrenByParent.get(String(id)) || [];
                            kids.forEach((ch) => {
                                const cid = ch.ID != null ? String(ch.ID) : '';
                                if (cid && !allowedIds.has(cid)) {
                                    allowedIds.add(cid);
                                    queue.push(ch.ID);
                                }
                            });
                        }
                    });

                    rawItems = uniqueRawItems.filter((i) => i.ID != null && allowedIds.has(String(i.ID)));
                    log(
                        `After session division subtree expansion (${effectiveSessionDivision}): ${rawItems.length} items, ` +
                            `${rootsInvolved.size} root branch(es)`
                    );
                }
            }

            // Build unique Lead Job code map for ROOTS ONLY (to follow project structure)
            const rootsOnly = rawItems.filter(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0);
            rootsOnly.sort((a, b) => a.ID - b.ID); // Keep sequence stable based on insertion
            const rootCodeMap = {};
            rootsOnly.forEach((r, idx) => {
                rootCodeMap[r.ID] = `L${idx + 1}`;
            });

            const userRes = await sql.query`SELECT Roles, Department, FullName FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
            const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Roles : '';
            const userDepartment = userRes.recordset.length > 0 && userRes.recordset[0].Department ? userRes.recordset[0].Department.trim().toLowerCase() : '';
            const userFullName = userRes.recordset.length > 0 && userRes.recordset[0].FullName ? userRes.recordset[0].FullName.trim().toLowerCase() : '';
            const isAdmin = userRole === 'Admin' || userRole === 'Super Admin';

            if (effectiveSessionDivision) {
                // Division toolbar: lead dropdown = every root branch that contains the selected division,
                // not only roots where the logged-in user's own department / mail scope matches.
                divisionsList = [...new Set(rootsOnly.map((r) => r.ItemName))].sort();
                userIsSubjobUser = false;
                log(
                    `divisionsList from session division "${effectiveSessionDivision}": ${divisionsList.length} root(s)`
                );
            } else if (userEmail && !isAdmin) {
                const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userPrefix = normalizedUser.split('@')[0];

                // Find items explicitly assigned to user
                const userScopeItems = rawItems.filter(item => {
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const itemNameLower = item.ItemName.toLowerCase().trim();

                    return normalizedMails.includes(normalizedUser) ||
                        (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@'))) ||
                        (userDepartment && itemNameLower.includes(userDepartment)) ||
                        (userFullName && normalizedMails.includes(userFullName));
                });

                if (userScopeItems.length > 0) {
                    const accessRootNames = new Set();
                    userScopeItems.forEach(scopeItem => {
                        // Traverse up to find the true root for this branch
                        let curr = scopeItem;
                        let s = 0;
                        while (curr.ParentID && curr.ParentID != '0' && s < 10) {
                            const p = getParent(curr.ParentID);
                            if (p) curr = p;
                            else break;
                            s++;
                        }
                        // Only the ROOT name is added to the list for the dropdown
                        accessRootNames.add(curr.ItemName);
                    });
                    divisionsList = Array.from(accessRootNames).sort();
                    userIsSubjobUser = userScopeItems.every(item => item.ParentID && item.ParentID !== '0' && item.ParentID !== 0);
                } else {
                    divisionsList = [];
                }
            } else {
                // Admin or Guest -> Show all root level lead jobs
                divisionsList = rootsOnly.map(r => r.ItemName);
            }

            divisionsHierarchy = rawItems.map(r => {
                // Trace back to root to find which L-code this item belongs to
                let curr = r;
                let safety = 0;
                let visited = new Set();
                while (curr.ParentID && curr.ParentID != '0' && safety < 10) {
                    if (visited.has(curr.ParentID)) break;
                    visited.add(curr.ParentID);
                    const p = rawItems.find(item => item.ID === curr.ParentID);
                    if (p) curr = p;
                    else break;
                    safety++;
                }

                const assignedCode = rootCodeMap[curr.ID] || 'L1';

                return {
                    id: r.ID,
                    parentId: r.ParentID,
                    itemName: r.ItemName,
                    leadJobName: r.LeadJobName || '',
                    commonMailIds: r.CommonMailIds,
                    ccMailIds: r.CCMailIds,
                    leadJobCode: assignedCode, // Child inherits root's L-code
                    departmentName: r.DepartmentName || '',
                    divisionCode: r.DivisionCode || '',
                    departmentCode: r.DepartmentCode || ''
                };
            });

            if (leadOnly) {
                const rootsForLead = rawItems.filter(
                    (r) => !r.ParentID || r.ParentID == '0' || r.ParentID == 0
                );
                const firstRoot = rootsForLead[0];
                const leadPrefixLite = firstRoot
                    ? String(firstRoot.LeadJobName || firstRoot.ItemName || '')
                          .replace(/^(L\d+\s*-\s*)/i, '')
                          .trim()
                    : '';
                return res.json({
                    enquiry,
                    customerDetails: null,
                    divisions: divisionsList,
                    companyDetails: {
                        code: 'AAC',
                        logo: null,
                        name: 'Almoayyed Air Conditioning',
                    },
                    availableProfiles: [],
                    preparedByOptions: [],
                    customerOptions: [],
                    customerContacts: {},
                    externalAttentionOptionsByCustomer: {},
                    internalAttentionByCleanItemName: {},
                    parentCustomerName: null,
                    leadJobPrefix: leadPrefixLite,
                    divisionEmails: rawItems.map((item) => ({
                        itemName: item.ItemName,
                        ccMailIds: item.CCMailIds || '',
                        commonMailIds: item.CommonMailIds || '',
                        departmentName: item.DepartmentName || '',
                    })),
                    enquiryForBrandingRows: [],
                    masterEnquiryForFooterLookup: {},
                    quoteNumber: 'Draft',
                    userIsSubjobUser,
                    divisionsHierarchy,
                    scope: 'lead',
                });
            }

            // 2. Resolve Master Details for EACH item (handling prefixes)
            for (const item of rawItems) {
                let itemName = item.ItemName;
                let cleanName = itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim(); // Remove "L1 - ", "L2 - "

                // Try to find in Master (ItemName, clean name, DepartmentName, or CompanyName)
                const deptName = String(item.DepartmentName || '').trim();
                let masterRes = deptName
                    ? await sql.query`
                        SELECT * FROM Master_EnquiryFor
                        WHERE ItemName = ${itemName}
                           OR ItemName = ${cleanName}
                           OR DepartmentName = ${deptName}
                           OR CompanyName = ${cleanName}`
                    : await sql.query`
                        SELECT * FROM Master_EnquiryFor
                        WHERE ItemName = ${itemName}
                           OR ItemName = ${cleanName}
                           OR CompanyName = ${cleanName}`;
                let masterData = masterRes.recordset[0];

                if (masterData) {
                    // ROBUST MERGE: Prioritize master data for contact fields if not in join
                    resolvedItems.push({
                        ...masterData,
                        ...item,
                        CCMailIds: item.CCMailIds || masterData.CCMailIds,
                        CommonMailIds: item.CommonMailIds || masterData.CommonMailIds,
                        DepartmentName: item.DepartmentName || masterData.DepartmentName
                    });

                    // Only add to available profiles IF the user is DIRECTLY assigned to this division
                    const normalizedUser = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const userPrefix = normalizedUser.split('@')[0];
                    const mails = [item.CommonMailIds, item.CCMailIds].filter(Boolean).join(',').toLowerCase();
                    const normalizedMails = mails.replace(/@almcg\.com/g, '@almoayyedcg.com');
                    const itemNameLower = item.ItemName.toLowerCase().trim();

                    const userIsDirectlyAssigned = normalizedMails.includes(normalizedUser) ||
                        (userPrefix && normalizedMails.split(',').some(m => m.trim().startsWith(userPrefix + '@'))) ||
                        (userDepartment && itemNameLower.includes(userDepartment)) ||
                        (userFullName && normalizedMails.includes(userFullName));

                    const profile = {
                        code: masterData.DepartmentCode || 'AAC',
                        departmentCode: masterData.DepartmentCode || 'AAC',
                        divisionCode: masterData.DivisionCode || 'GEN',
                        name: masterData.CompanyName || cleanName,
                        logo: masterData.CompanyLogo ? masterData.CompanyLogo.replace(/\\/g, '/') : null,
                        address: masterData.Address || [masterData.Address1, masterData.Address2].filter(Boolean).join('\n'),
                        phone: masterData.Phone ? String(masterData.Phone).trim() : '',
                        fax: masterData.FaxNo ? String(masterData.FaxNo).trim() : '',
                        commonMailIds: masterData.CommonMailIds ? String(masterData.CommonMailIds).trim() : '',
                        email: masterData.CommonMailIds ? masterData.CommonMailIds.split(',')[0].trim() : '',
                        itemName: item.ItemName, // Explicitly use the transaction item name
                        id: item.ID
                    };

                    // Add to availableProfiles for ALL jobs (sub-jobs need this to pull internal address)
                    // Avoid duplicates in availableProfiles based on Div/Dept & itemName
                    const exists = availableProfiles.find(p => p.itemName === profile.itemName);
                    if (!exists) {
                        availableProfiles.push(profile);
                    }
                } else {
                    // Fallback profile if missing from Master to at least have a record
                    availableProfiles.push({
                        itemName: item.ItemName,
                        id: item.ID,
                        name: cleanName,
                        address: '',
                        phone: '',
                        fax: '',
                        email: ''
                    });
                    resolvedItems.push(item);
                }
            }
            // --- PROACTIVE FIX (Step 4488): Always include the profile matching the user's own department ---
            if (userEmail) {
                try {
                    const normalizedLookupEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                    console.log(`[Quote API Profile] Looking up department for: ${normalizedLookupEmail} (original: ${userEmail})`);

                    const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedLookupEmail}`;
                    const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                    console.log(`[Quote API Profile] Resolved Department: "${userDept}"`);

                    if (userDept) {
                        const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                        const masterData = masterRes.recordset[0];
                        if (masterData) {
                            const profile = {
                                code: masterData.DepartmentCode || 'AAC',
                                departmentCode: masterData.DepartmentCode || 'AAC',
                                divisionCode: masterData.DivisionCode || 'GEN',
                                name: masterData.CompanyName || userDept,
                                logo: masterData.CompanyLogo ? masterData.CompanyLogo.replace(/\\/g, '/') : null,
                                address: masterData.Address || [masterData.Address1, masterData.Address2].filter(Boolean).join('\n'),
                                phone: masterData.Phone ? String(masterData.Phone).trim() : '',
                                fax: masterData.FaxNo ? String(masterData.FaxNo).trim() : '',
                                commonMailIds: masterData.CommonMailIds ? String(masterData.CommonMailIds).trim() : '',
                                email: masterData.CommonMailIds ? masterData.CommonMailIds.split(',')[0].trim() : '',
                                itemName: userDept,
                            };
                            const existingIndex = availableProfiles.findIndex(p => p.itemName === profile.itemName);
                            if (existingIndex !== -1) {
                                availableProfiles[existingIndex] = { ...availableProfiles[existingIndex], isPersonalProfile: true };
                            } else {
                                availableProfiles.push(profile);
                            }

                            // --- LOCK BRANDING TO USER (Step 4488) ---
                            console.log(`[Quote API] ENFORCING branding lock to user profile: ${profile.name} (${profile.itemName})`);
                            companyDetails = { ...profile, isPersonalProfile: true };
                        }
                    }
                } catch (e) { console.error('Error adding personal profile:', e); }
            }

            // 3. Find Lead Job Default by root item; prefer plain lead name (no code dependency)
            let leadItem = resolvedItems.find(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0) || resolvedItems[0];
            leadJobPrefix = leadItem
                ? String(leadItem.LeadJobName || leadItem.ItemName || '').replace(/^(L\d+\s*-\s*)/i, '').trim()
                : '';

            // 4. Set Initial Company Details from Lead Item
            if (leadItem && leadItem.DepartmentCode) {
                const match = leadItem;
                companyDetails.code = match.DepartmentCode;
                companyDetails.divisionCode = match.DivisionCode || 'AAC';
                companyDetails.departmentCode = match.DepartmentCode || '';
                if (match.CompanyName) companyDetails.name = match.CompanyName;
                if (match.CompanyLogo) companyDetails.logo = match.CompanyLogo.replace(/\\/g, '/');
                if (match.Address) companyDetails.address = match.Address;
                if (match.Phone) companyDetails.phone = match.Phone;
                if (match.FaxNo) companyDetails.fax = match.FaxNo;
                if (match.CommonMailIds) {
                    const emails = match.CommonMailIds.split(',');
                    if (emails.length > 0) companyDetails.email = emails[0].trim();
                }
            } else if (availableProfiles.length > 0) {
                // Fallback to first available profile if lead item has no details
                companyDetails = availableProfiles[0];
            }

            console.log(`[Quote API] Found ${divisionsList.length} divisions. Resolved items: ${resolvedItems.length}. Default Profile: ${companyDetails.divisionCode}`);
        } catch (err) {
            console.error('[Quote API] Error fetching EnquiryFor:', err);
        }

        enquiryForBrandingRows = (resolvedItems || [])
            .map((r) => ({
                itemName: r.ItemName || '',
                departmentName: r.DepartmentName || '',
                companyName: r.CompanyName || '',
                companyLogo: r.CompanyLogo ? String(r.CompanyLogo).replace(/\\/g, '/') : null,
                address: r.Address || [r.Address1, r.Address2].filter(Boolean).join('\n') || '',
                phone: r.Phone ? String(r.Phone).trim() : '',
                faxNo: r.FaxNo ? String(r.FaxNo).trim() : '',
                commonMailIds: r.CommonMailIds ? String(r.CommonMailIds).trim() : '',
            }))
            .filter((row) => String(row.itemName || '').trim() || String(row.departmentName || '').trim());

        /** Direct Master_EnquiryFor footer keyed by DepartmentName / ItemName / CompanyName (lowercase). */
        masterEnquiryForFooterLookup = {};
        const mefFooterRecordFromRow = (r) => ({
            phone: r.Phone ? String(r.Phone).trim() : '',
            faxNo: r.FaxNo ? String(r.FaxNo).trim() : '',
            commonMailIds: r.CommonMailIds ? String(r.CommonMailIds).trim() : '',
            address: r.Address
                ? String(r.Address).trim()
                : [r.Address1, r.Address2].filter(Boolean).join('\n').trim(),
            companyName: r.CompanyName ? String(r.CompanyName).trim() : '',
            companyLogo: r.CompanyLogo ? String(r.CompanyLogo).replace(/\\/g, '/') : null,
            departmentName: r.DepartmentName ? String(r.DepartmentName).trim() : '',
            itemName: r.ItemName ? String(r.ItemName).trim() : '',
        });
        const addMefFooterLookupKey = (key, r, force = false) => {
            const k = String(key || '').trim().toLowerCase();
            if (!k) return;
            if (masterEnquiryForFooterLookup[k] && !force) return;
            masterEnquiryForFooterLookup[k] = mefFooterRecordFromRow(r);
        };
        for (const r of resolvedItems || []) {
            if (!r?.Phone && !r?.FaxNo && !r?.CommonMailIds && !r?.Address && !r?.CompanyName) continue;
            addMefFooterLookupKey(r.DepartmentName, r);
            addMefFooterLookupKey(r.ItemName, r);
            addMefFooterLookupKey(r.CompanyName, r);
            const clean = String(r.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            addMefFooterLookupKey(clean, r);
        }
        const deptsNeedingFooterLookup = new Set();
        for (const item of rawItems || []) {
            const dept = String(item.DepartmentName || '').trim();
            if (!dept) continue;
            if (!masterEnquiryForFooterLookup[dept.toLowerCase()]) {
                deptsNeedingFooterLookup.add(dept);
            }
        }
        for (const dept of deptsNeedingFooterLookup) {
            try {
                const footerMasterRes = await sql.query`
                    SELECT DepartmentName, ItemName, CompanyName, CompanyLogo, Address, Phone, FaxNo, CommonMailIds
                    FROM Master_EnquiryFor
                    WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) = LTRIM(RTRIM(${dept}))
                       OR ItemName = ${dept}`;
                const footerMaster = footerMasterRes.recordset[0];
                if (footerMaster) {
                    addMefFooterLookupKey(footerMaster.DepartmentName, footerMaster);
                    addMefFooterLookupKey(footerMaster.ItemName, footerMaster);
                    addMefFooterLookupKey(footerMaster.CompanyName, footerMaster);
                }
            } catch (footerLookupErr) {
                console.warn('[Quote API] Master_EnquiryFor footer lookup failed for dept:', dept, footerLookupErr.message);
            }
        }
        const companiesNeedingFooterLookup = new Set();
        for (const row of enquiryForBrandingRows) {
            const cn = String(row.companyName || '').trim();
            if (!cn) continue;
            if (!masterEnquiryForFooterLookup[cn.toLowerCase()]) {
                companiesNeedingFooterLookup.add(cn);
            }
        }
        for (const companyName of companiesNeedingFooterLookup) {
            try {
                const footerMasterRes = await sql.query`
                    SELECT DepartmentName, ItemName, CompanyName, CompanyLogo, Address, Phone, FaxNo, CommonMailIds
                    FROM Master_EnquiryFor
                    WHERE CompanyName = ${companyName} OR ItemName = ${companyName}`;
                const footerMaster = footerMasterRes.recordset[0];
                if (footerMaster) {
                    addMefFooterLookupKey(footerMaster.DepartmentName, footerMaster);
                    addMefFooterLookupKey(footerMaster.ItemName, footerMaster);
                    addMefFooterLookupKey(footerMaster.CompanyName, footerMaster);
                }
            } catch (footerLookupErr) {
                console.warn('[Quote API] Master_EnquiryFor footer lookup failed for company:', companyName, footerLookupErr.message);
            }
        }
        if (effectiveSessionDivision) {
            try {
                const sessionMefRes = await sql.query`
                    SELECT DepartmentName, ItemName, CompanyName, CompanyLogo, Address, Phone, FaxNo, CommonMailIds
                    FROM Master_EnquiryFor
                    WHERE LTRIM(RTRIM(ISNULL(DepartmentName, N''))) = LTRIM(RTRIM(${effectiveSessionDivision}))`;
                const sessionMef = sessionMefRes.recordset[0];
                if (sessionMef) {
                    addMefFooterLookupKey(sessionMef.DepartmentName, sessionMef, true);
                    const deptKey = String(sessionMef.DepartmentName || effectiveSessionDivision).trim().toLowerCase();
                    const hasBrandingRow = enquiryForBrandingRows.some(
                        (row) => String(row.departmentName || '').trim().toLowerCase() === deptKey
                    );
                    if (!hasBrandingRow) {
                        enquiryForBrandingRows.push({
                            itemName: sessionMef.ItemName || '',
                            departmentName: sessionMef.DepartmentName || effectiveSessionDivision,
                            companyName: sessionMef.CompanyName || '',
                            companyLogo: sessionMef.CompanyLogo
                                ? String(sessionMef.CompanyLogo).replace(/\\/g, '/')
                                : null,
                            address: sessionMef.Address ? String(sessionMef.Address).trim() : '',
                            phone: sessionMef.Phone ? String(sessionMef.Phone).trim() : '',
                            faxNo: sessionMef.FaxNo ? String(sessionMef.FaxNo).trim() : '',
                            commonMailIds: sessionMef.CommonMailIds
                                ? String(sessionMef.CommonMailIds).trim()
                                : '',
                        });
                    }
                }
            } catch (sessionMefErr) {
                console.warn(
                    '[Quote API] Master_EnquiryFor footer lookup failed for session division:',
                    effectiveSessionDivision,
                    sessionMefErr.message
                );
            }
        }

        // Get Prepared By Options (MobileNumber from Master_ConcernedSE via FullName = SEName)
        let preparedByOptions = [];
        try {
            const seResult = await sql.query`
                SELECT cs.SEName, m.MobileNumber
                FROM ConcernedSE cs
                LEFT JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                WHERE cs.RequestNo = ${requestNo}
            `;
            seResult.recordset.forEach(row => {
                if (row.SEName) {
                    const mobileNumber = row.MobileNumber != null ? String(row.MobileNumber).trim() : '';
                    preparedByOptions.push({ value: row.SEName, label: row.SEName, type: 'SE', mobileNumber });
                }
            });

            if (enquiry.CreatedBy) {
                const createdName = String(enquiry.CreatedBy).trim();
                let creatorMobile = '';
                if (createdName) {
                    const mobRes = await sql.query`
                        SELECT TOP 1 MobileNumber FROM Master_ConcernedSE
                        WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${createdName})))
                    `;
                    const raw = mobRes.recordset?.[0]?.MobileNumber;
                    creatorMobile = raw != null ? String(raw).trim() : '';
                }
                preparedByOptions.push({
                    value: enquiry.CreatedBy,
                    label: enquiry.CreatedBy,
                    type: 'Creator',
                    mobileNumber: creatorMobile,
                });
            }
            preparedByOptions = preparedByOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
        } catch (err) {
            console.error('[Quote API] Error fetching Prepared By options:', err);
        }

        // Get Customer Options with ReceivedFrom contacts
        let customerOptions = [];
        let customerContacts = {}; // Map customer names to their ReceivedFrom contacts
        let externalAttentionOptionsByCustomer = {}; // Quote "Attention of" — external: ReceivedFrom contacts per company
        let internalAttentionByCleanItemName = {}; // Internal division → { options, defaultAttention, ... }
        let parentCustomerName = null; // Internal parent job name when own job is a subjob
        try {
            // Get customers from EnquiryCustomer table
            const customerResult = await sql.query`
                SELECT CustomerName 
                FROM EnquiryCustomer 
                WHERE RequestNo = ${requestNo}
            `;

            // Get ReceivedFrom contacts from ReceivedFrom table — JOIN Master_ReceivedFrom to pull
            // the Prefix (Mr./Ms./Dr./…) so the Quote "Attention of" reads "Prefix FullName".
            const receivedFromResult = await sql.query`
                SELECT rf.ContactName, rf.CompanyName, mrf.Prefix
                FROM ReceivedFrom rf
                LEFT JOIN Master_ReceivedFrom mrf
                    ON LTRIM(RTRIM(ISNULL(mrf.ContactName, N''))) = LTRIM(RTRIM(ISNULL(rf.ContactName, N'')))
                   AND LTRIM(RTRIM(ISNULL(mrf.CompanyName, N''))) = LTRIM(RTRIM(ISNULL(rf.CompanyName, N'')))
                WHERE rf.RequestNo = ${requestNo}
            `;

            console.log('[Quote API] ReceivedFrom records:', receivedFromResult.recordset);

            /**
             * Compose a display name as "<Prefix>. <Name>" when a non-empty Prefix is available, otherwise just the name.
             * Always normalises the prefix with a trailing period (e.g. "Mr" → "Mr.") so "Mr Mahmood" never reaches the UI.
             * Avoids double-prefixing if the contact name already starts with the same prefix.
             */
            const formatNameWithPrefix = (rawName, rawPrefix) => {
                const name = String(rawName || '').trim();
                let prefix = String(rawPrefix || '').trim();
                if (!name) return '';
                if (!prefix) return name;
                // Strip any trailing punctuation then re-add a single period — covers "Mr", "Mr.", "Mr..", etc.
                prefix = prefix.replace(/[.!?,;:]+$/g, '') + '.';
                const nLower = name.toLowerCase();
                const pLower = prefix.toLowerCase();
                const pBare = pLower.replace(/\.+$/, '');
                if (
                    nLower === pLower ||
                    nLower === pBare ||
                    nLower.startsWith(pLower + ' ') ||
                    nLower.startsWith(pBare + ' ') ||
                    nLower.startsWith(pBare + '.')
                ) {
                    return name;
                }
                return `${prefix} ${name}`;
            };

            // Build customerContacts mapping from ReceivedFrom table (prefix-aware display strings).
            receivedFromResult.recordset.forEach(row => {
                if (row.CompanyName && row.ContactName) {
                    const company = row.CompanyName.replace(/,+$/, '').trim();
                    const contact = formatNameWithPrefix(row.ContactName, row.Prefix);
                    if (!contact) return;

                    if (customerContacts[company]) {
                        customerContacts[company] += ', ' + contact;
                    } else {
                        customerContacts[company] = contact;
                    }
                }
            });

            // Helper to check if a customer already has a contact (normalized)
            const hasContact = (cust) => {
                const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const target = norm(cust);
                return Object.keys(customerContacts).some(k => norm(k) === target);
            };

            // Process EnquiryCustomer: one DB row = one customer (full name). Do NOT split on commas —
            // names like "Alghanim International, UAE" must stay one option (same as Enquiry module SelectedCustomers).
            const hasEnquiryCustomerRows = customerResult.recordset.length > 0;
            const externalCustomers = [];
            customerResult.recordset.forEach(row => {
                if (row.CustomerName) {
                    const trimmed = String(row.CustomerName).replace(/[,.]+$/g, '').trim();
                    if (trimmed) {
                        externalCustomers.push(trimmed);
                    }
                }
            });

            // EnquiryMaster.CustomerName: when EnquiryCustomer rows exist, do NOT merge master — it duplicates
            // SelectedCustomers as one comma-separated string and adds an extra bogus dropdown entry (e.g. "A, B, C, D").
            if (!hasEnquiryCustomerRows && enquiry.CustomerName) {
                enquiry.CustomerName.split(',').forEach(c => {
                    const trimmed = c.replace(/[,.]+$/g, '').trim();
                    if (trimmed) {
                        const exists = externalCustomers.some(existing => existing.toLowerCase() === trimmed.toLowerCase());
                        if (!exists) {
                            externalCustomers.push(trimmed);
                        }
                    }
                });
            }

            // Build a global ContactName → Prefix map from Master_ReceivedFrom — used to enrich
            // `enquiry.ReceivedFrom` (a free-text field) so it also shows "<Prefix> <Name>".
            let masterContactPrefixByName = new Map();
            try {
                const mrfAll = await sql.query`
                    SELECT ContactName, Prefix FROM Master_ReceivedFrom
                    WHERE ContactName IS NOT NULL AND LTRIM(RTRIM(ContactName)) <> N''
                `;
                (mrfAll.recordset || []).forEach((row) => {
                    const k = String(row.ContactName || '').toLowerCase().replace(/\s+/g, ' ').trim();
                    if (!k) return;
                    const p = String(row.Prefix || '').trim();
                    if (!masterContactPrefixByName.has(k) && p) masterContactPrefixByName.set(k, p);
                });
            } catch (_mrfErr) { /* table missing in some envs — fallback silently */ }

            /** Apply Master_ReceivedFrom prefix to a free-text contact string (handles comma-separated values). */
            const enrichContactsWithMasterPrefix = (raw) => {
                const txt = String(raw || '').trim();
                if (!txt) return '';
                return txt
                    .split(',')
                    .map((part) => {
                        const name = part.trim();
                        if (!name) return '';
                        const k = name.toLowerCase().replace(/\s+/g, ' ').trim();
                        const prefix = masterContactPrefixByName.get(k);
                        return formatNameWithPrefix(name, prefix);
                    })
                    .filter(Boolean)
                    .join(', ');
            };

            // Map ReceivedFrom for external customers
            externalCustomers.forEach((name) => {
                const trimmed = String(name).trim();
                if (trimmed && !hasContact(trimmed) && enquiry.ReceivedFrom) {
                    const display = enrichContactsWithMasterPrefix(enquiry.ReceivedFrom) || enquiry.ReceivedFrom;
                    customerContacts[trimmed] = display;
                    console.log(`[Quote API] Mapped main customer "${trimmed}" to ReceivedFrom: "${display}"`);
                }
            });

            // --- HIERARCHY LOGIC: derive Parent Customer for own-job subjob users ---
            if (rawItems && rawItems.length > 0 && userIsSubjobUser) {
                // Find own job from login Department
                let loginDept = '';
                if (userEmail) {
                    try {
                        const normalizedDeptEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                        const deptRes = await sql.query`
                            SELECT TOP 1 Department FROM Master_ConcernedSE
                            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${normalizedDeptEmail}
                        `;
                        loginDept = String(deptRes.recordset?.[0]?.Department || '').trim();
                    } catch (_deptErr) { /* keep loginDept empty */ }
                }
                const ownJobNode = rawItems.find(r =>
                    String(r.ItemName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase() ===
                    loginDept.toLowerCase()
                );
                if (ownJobNode && ownJobNode.ParentID && ownJobNode.ParentID != '0') {
                    const parent = rawItems.find(p => String(p.ID) === String(ownJobNode.ParentID));
                    if (parent && parent.ItemName) {
                        parentCustomerName = String(parent.ItemName).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    }
                }
            }

            // Default global customerOptions for legacy callers: external list only.
            customerOptions = [...externalCustomers];

            // Final Deduplication (Case-insensitive)
            const uniqueOptions = [];
            const seenOptions = new Set();
            customerOptions.forEach(opt => {
                const lower = String(opt || '').trim().toLowerCase();
                if (lower && !seenOptions.has(lower)) {
                    seenOptions.add(lower);
                    uniqueOptions.push(opt);
                }
            });

            // Drop comma-joined mega-strings when each segment already appears as its own option (EnquiryPricingOptions / legacy data).
            const stripRedundantCommaJoined = (opts) => {
                const list = opts.map(o => String(o || '').trim()).filter(Boolean);
                const norm = (s) => s.toLowerCase();
                return list.filter((opt) => {
                    if (!opt.includes(',')) return true;
                    const parts = opt.split(',').map(p => p.trim()).filter(Boolean);
                    if (parts.length < 2) return true;
                    const eachPartHasStandalone = parts.every((p) =>
                        list.some((x) => x !== opt && norm(x) === norm(p))
                    );
                    return !eachPartHasStandalone;
                });
            };

            customerOptions = stripRedundantCommaJoined(uniqueOptions);

            // --- Quote "Attention of" metadata (dropdowns on client) ---
            try {
                // Internal customers: pick Prefix from Master_ConcernedSE so "Attention of" displays "<Prefix> <FullName>".
                const masterSeRes = await sql.query`
                    SELECT FullName, Department, EmailId, Prefix FROM Master_ConcernedSE
                    WHERE FullName IS NOT NULL AND LTRIM(RTRIM(FullName)) <> N''
                      AND (Status = N'Active' OR Status IS NULL OR LTRIM(RTRIM(ISNULL(Status, N''))) = N'')
                `;
                const masterRows = masterSeRes.recordset || [];

                /**
                 * Look up Master_ConcernedSE.Prefix for a given FullName (loose, case- and whitespace-insensitive).
                 * Returns '' when no match — caller then renders the plain name.
                 */
                const prefixForSeFullName = (fullName) => {
                    const target = String(fullName || '').toLowerCase().replace(/\s+/g, ' ').trim();
                    if (!target) return '';
                    const hit = masterRows.find((m) => {
                        const fk = String(m.FullName || '').toLowerCase().replace(/\s+/g, ' ').trim();
                        return fk === target;
                    });
                    return hit ? String(hit.Prefix || '').trim() : '';
                };
                const concernedOrderedRes = await sql.query`
                    SELECT SEName FROM ConcernedSE WHERE RequestNo = ${requestNo} ORDER BY SEName
                `;
                const normLooseSe = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const allSeForEnquiry = [];
                const seenSeOrder = new Set();
                for (const row of concernedOrderedRes.recordset || []) {
                    const n = String(row.SEName || '').trim();
                    if (!n) continue;
                    const k = normLooseSe(n);
                    if (seenSeOrder.has(k)) continue;
                    seenSeOrder.add(k);
                    allSeForEnquiry.push(n);
                }
                const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanItemName = (name) => String(name || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                /** Labels that must not match every "* Project" / generic job name via substring alone */
                const WEAK_DEPT_LABELS = new Set([
                    'project', 'projects', 'general', 'gen', 'sales', 'all', 'na', 'n/a', 'tbd',
                    'department', 'dept', 'division', 'group', 'company', 'contracting', 'contract',
                    'office', 'branch', 'region', 'hq', 'unit', 'section', 'team', 'main', 'staff'
                ]);
                /**
                 * Master_ConcernedSE.Department vs internal customer context (item name, enquiry dept name, codes).
                 */
                const departmentMatchesSelectedCustomer = (masterDept, customerLabel) => {
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
                    const custTok = c.split(/[^a-z0-9]+/).filter(p => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
                    const deptTok = a.split(/[^a-z0-9]+/).filter(p => p.length > 2 && !WEAK_DEPT_LABELS.has(p));
                    if (custTok.length && custTok.some(t => a.includes(t))) return true;
                    if (deptTok.length && deptTok.some(t => c.includes(t))) return true;
                    return false;
                };
                const departmentMatchesAnyLabel = (masterDept, labels) => {
                    const uniq = [...new Set((labels || []).map((s) => String(s || '').trim()).filter(Boolean))];
                    return uniq.some((lab) => departmentMatchesSelectedCustomer(masterDept, lab));
                };
                /**
                 * Same as SSMS: LTRIM(RTRIM(Department)) = clean name; collapse all whitespace / NBSP so UI matches DB.
                 */
                const normDeptLabel = (s) =>
                    String(s || '')
                        .replace(/\u00a0/g, ' ')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();
                const deptEqualsCleanCustomer = (masterDept, cleanCustomerName) =>
                    normDeptLabel(masterDept) === normDeptLabel(cleanCustomerName);
                const byCompany = {};
                receivedFromResult.recordset.forEach(row => {
                    if (!row.CompanyName || !row.ContactName) return;
                    const company = String(row.CompanyName).replace(/,+$/, '').trim();
                    const contact = formatNameWithPrefix(row.ContactName, row.Prefix);
                    if (!contact) return;
                    if (!byCompany[company]) byCompany[company] = new Set();
                    byCompany[company].add(contact);
                });
                const findCompanyRfKey = (cust) => {
                    const keys = Object.keys(byCompany);
                    const hit = keys.find(k => k.toLowerCase() === String(cust).toLowerCase().trim());
                    if (hit) return hit;
                    const t = normKey(cust);
                    return keys.find(k => normKey(k) === t) || null;
                };
                customerOptions.forEach(cust => {
                    const set = new Set();
                    const ck = findCompanyRfKey(cust);
                    if (ck) byCompany[ck].forEach(x => set.add(x));
                    const cc = customerContacts[cust];
                    if (cc) {
                        String(cc).split(',').forEach(p => {
                            const t = p.trim();
                            if (t) set.add(t);
                        });
                    }
                    if (set.size === 0 && enquiry.ReceivedFrom) {
                        // Use the global Master_ReceivedFrom prefix map so fallback names also display "<Prefix> <Name>".
                        String(enquiry.ReceivedFrom).split(',').forEach(p => {
                            const name = p.trim();
                            if (!name) return;
                            const k = name.toLowerCase().replace(/\s+/g, ' ').trim();
                            const prefix = masterContactPrefixByName.get(k);
                            const display = formatNameWithPrefix(name, prefix);
                            if (display) set.add(display);
                        });
                    }
                    externalAttentionOptionsByCustomer[cust] = [...set].sort((a, b) => a.localeCompare(b));
                });

                const normLoose = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const normalizeMail = (e) => String(e || '').toLowerCase().trim()
                    .replace(/@almcg\.com$/i, '@almoayyedcg.com');
                const divisionMailSet = (row) => {
                    const s = new Set();
                    const add = (raw) => {
                        String(raw || '').split(',').forEach((part) => {
                            const t = normalizeMail(part);
                            if (t) s.add(t);
                        });
                    };
                    add(row.commonMailIds);
                    add(row.ccMailIds);
                    return s;
                };
                const masterByLooseName = new Map();
                masterRows.forEach(m => {
                    const fn = String(m.FullName || '').trim();
                    if (fn) masterByLooseName.set(normLoose(fn), m);
                });
                const findMasterForSeName = (seName) => {
                    const k = normLoose(seName);
                    if (!k) return null;
                    if (masterByLooseName.has(k)) return masterByLooseName.get(k);
                    for (const m of masterRows) {
                        const fn = String(m.FullName || '').trim();
                        if (!fn) continue;
                        const fk = normLoose(fn);
                        if (fk === k) return m;
                        if (k.length >= 5 && fk.includes(k)) return m;
                        if (fk.length >= 5 && k.includes(fk)) return m;
                    }
                    return null;
                };

                const ancestorCleanItemNames = (startParentId) => {
                    const labels = [];
                    let pid = startParentId;
                    let steps = 0;
                    while (pid != null && pid !== '' && String(pid) !== '0' && steps++ < 40) {
                        const p = (rawItems || []).find((i) => String(i.ID) === String(pid));
                        if (!p) break;
                        const anc = cleanItemName(String(p.ItemName || ''));
                        if (anc) labels.push(anc);
                        pid = p.ParentID;
                    }
                    return labels;
                };

                for (const h of divisionsHierarchy || []) {
                    const fullItem = String(h.itemName || '').trim();
                    const cl = cleanItemName(fullItem);
                    if (!cl) continue;
                    const jobDept = String(h.departmentName || '').trim() || cl;
                    const divisionMails = divisionMailSet(h);
                    const attentionLabels = [
                        cl,
                        jobDept,
                        h.divisionCode && String(h.divisionCode).trim(),
                        h.departmentCode && String(h.departmentCode).trim(),
                        ...ancestorCleanItemNames(h.parentId)
                    ];
                    /** Primary: Master_ConcernedSE.Department = clean internal customer (e.g. 'HVAC Project'). */
                    let namesFromDept = masterRows
                        .filter(m => deptEqualsCleanCustomer(m.Department, cl))
                        .map(m => formatNameWithPrefix(m.FullName, m.Prefix))
                        .filter(Boolean);
                    if (namesFromDept.length === 0) {
                        namesFromDept = masterRows
                            .filter(m => departmentMatchesAnyLabel(m.Department, attentionLabels))
                            .map(m => formatNameWithPrefix(m.FullName, m.Prefix))
                            .filter(Boolean);
                    }
                    let options = [...new Set(namesFromDept)].sort((a, b) => a.localeCompare(b));
                    /** When Department text does not match labels, use SEs rostered on this row's division mails. */
                    if (options.length === 0 && divisionMails.size > 0) {
                        const fromMails = masterRows
                            .filter((m) => {
                                const em = normalizeMail(m.EmailId);
                                return em && divisionMails.has(em);
                            })
                            .map((m) => formatNameWithPrefix(m.FullName, m.Prefix))
                            .filter(Boolean);
                        options = [...new Set(fromMails)].sort((a, b) => a.localeCompare(b));
                    }
                    /** Concerned SE on enquiry whose email is on this division row. */
                    if (options.length === 0 && divisionMails.size > 0) {
                        const fromConcerned = [];
                        for (const seName of allSeForEnquiry) {
                            const m = findMasterForSeName(seName);
                            if (!m) continue;
                            const em = normalizeMail(m.EmailId);
                            if (em && divisionMails.has(em)) {
                                const fn = String(m.FullName || '').trim();
                                const display = formatNameWithPrefix(fn || seName, m.Prefix);
                                fromConcerned.push(display);
                            }
                        }
                        options = [...new Set(fromConcerned)].sort((a, b) => a.localeCompare(b));
                    }
                    const assignedDeptMatch = [];
                    for (const seName of allSeForEnquiry) {
                        const m = findMasterForSeName(seName);
                        if (!m) continue;
                        if (deptEqualsCleanCustomer(m.Department, cl) || departmentMatchesAnyLabel(m.Department, attentionLabels)) {
                            assignedDeptMatch.push(seName);
                        }
                    }
                    const assignedByRowMail = [];
                    const assignedByDeptOnly = [];
                    for (const seName of assignedDeptMatch) {
                        const m = findMasterForSeName(seName);
                        if (!m) continue;
                        const em = normalizeMail(m.EmailId);
                        const onRow = em && divisionMails.size > 0 && divisionMails.has(em);
                        if (onRow) assignedByRowMail.push(seName);
                        else assignedByDeptOnly.push(seName);
                    }
                    const assignedForThisDivision = [...assignedByRowMail, ...assignedByDeptOnly];
                    const firstAssigned = assignedForThisDivision[0];
                    const firstAssignedMaster = firstAssigned ? findMasterForSeName(firstAssigned) : null;
                    const firstAssignedFullRaw = firstAssignedMaster
                        ? String(firstAssignedMaster.FullName || '').trim() || firstAssigned
                        : (firstAssigned || '');
                    const firstAssignedFull = firstAssignedFullRaw
                        ? formatNameWithPrefix(firstAssignedFullRaw, firstAssignedMaster?.Prefix)
                        : '';
                    /** Default only if that person is already in the Master_ConcernedSE–matched list */
                    let defaultAttention = '';
                    if (firstAssignedFull && options.some(o => normLoose(o) === normLoose(firstAssignedFull))) {
                        defaultAttention = firstAssignedFull;
                    } else {
                        defaultAttention = options[0] || '';
                    }
                    const entry = { options, defaultAttention, itemName: fullItem, departmentName: jobDept };
                    internalAttentionByCleanItemName[cl.toLowerCase()] = entry;
                    const nk = normKey(cl);
                    if (nk) internalAttentionByCleanItemName[`__norm_${nk}`] = entry;
                    const fullKeySpaced = String(fullItem).toLowerCase().replace(/\s+/g, ' ').trim();
                    if (fullKeySpaced && fullKeySpaced !== cl.toLowerCase()) {
                        internalAttentionByCleanItemName[fullKeySpaced] = entry;
                    }
                }

                /**
                 * If any EnquiryFor row still has no non-empty options (label mismatch vs SSMS), fill from exact
                 * Master_ConcernedSE.Department = clean ItemName using normDeptLabel (matches user SQL).
                 */
                for (const row of rawItems || []) {
                    const fullItem = String(row.ItemName || '').trim();
                    const cl = cleanItemName(fullItem);
                    if (!cl) continue;
                    const k = cl.toLowerCase();
                    const cur = internalAttentionByCleanItemName[k];
                    if (cur && Array.isArray(cur.options) && cur.options.length > 0) continue;
                    const namesExact = masterRows
                        .filter((m) => deptEqualsCleanCustomer(m.Department, cl))
                        .map((m) => formatNameWithPrefix(m.FullName, m.Prefix))
                        .filter(Boolean);
                    if (namesExact.length === 0) continue;
                    const opts = [...new Set(namesExact)].sort((a, b) => a.localeCompare(b));
                    const entry = {
                        options: opts,
                        defaultAttention: opts[0] || '',
                        itemName: fullItem,
                        departmentName: cl
                    };
                    internalAttentionByCleanItemName[k] = entry;
                    const nk = normKey(cl);
                    if (nk) internalAttentionByCleanItemName[`__norm_${nk}`] = entry;
                    const fullKeySpaced = String(fullItem).toLowerCase().replace(/\s+/g, ' ').trim();
                    if (fullKeySpaced && fullKeySpaced !== k) {
                        internalAttentionByCleanItemName[fullKeySpaced] = entry;
                    }
                }
            } catch (attErr) {
                console.error('[Quote API] attention dropdown meta:', attErr);
            }

            console.log('[Quote API] Final customerOptions:', customerOptions);

        } catch (err) {
            console.error('[Quote API] Error fetching Customer options:', err);
            // Deduplicate even in error case to prevent UI noise
            const uniqueOptions = [];
            const seenOptions = new Set();
            customerOptions.forEach(opt => {
                const lower = String(opt || '').trim().toLowerCase();
                if (lower && !seenOptions.has(lower)) {
                    seenOptions.add(lower);
                    uniqueOptions.push(opt);
                }
            });
            customerOptions = uniqueOptions;
        }

        res.json({
            enquiry,
            customerDetails,
            divisions: divisionsList,
            companyDetails,
            availableProfiles,
            preparedByOptions,
            customerOptions,
            customerContacts,
            externalAttentionOptionsByCustomer,
            internalAttentionByCleanItemName,
            parentCustomerName,
            leadJobPrefix,
            divisionEmails: resolvedItems.map(item => ({
                itemName: item.ItemName,
                ccMailIds: item.CCMailIds || '',
                commonMailIds: item.CommonMailIds || '',
                departmentName: item.DepartmentName || ''
            })),
            enquiryForBrandingRows,
            masterEnquiryForFooterLookup,
            quoteNumber: 'Draft',
            userIsSubjobUser,   // True if user's jobs are all subjobs (not lead job)
            divisionsHierarchy  // Return full hierarchy
        });
    } catch (err) {
        console.error('[Quote API] Fatal Error in enquiry-data route:', err);
        res.status(500).json({ error: 'Failed to fetch enquiry data', details: err.message });
    }
});

function isMissingEnquiryQuotesDraftTableError(message) {
    const m = String(message || '');
    return /Invalid object name/i.test(m) && /EnquiryQuotesDraft/i.test(m);
}

/**
 * Collaborative draft access: creator, CC on enquiry (same division scope), or assigned SE with pricing access.
 */
async function userCanCollaborateOnQuoteDraft(userEmail, requestNo, options = {}) {
    const { sessionDivision = '', draftPreparedByEmail = '' } = options;
    const normalized = normalizeQuoteFormDraftUserEmail(userEmail);
    if (!normalized || requestNo == null || String(requestNo).trim() === '') return false;

    const ctx = await resolvePricingAccessContext(normalized);
    if (!ctx.user) return false;
    if (ctx.isAdmin) return true;

    const creator = normalizeQuoteFormDraftUserEmail(draftPreparedByEmail);
    if (creator && creator === normalized) return true;

    const divScope = String(sessionDivision || ctx.userDepartment || '').trim();
    return userHasQuotePricingEnquiryAccess(normalized, requestNo, divScope);
}

function normalizeDraftTupleText(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function extractLeadCodeToken(s) {
    const m = String(s || '')
        .trim()
        .toUpperCase()
        .match(/^(L\d+)/);
    return m ? m[1] : '';
}

/** EnquiryQuotesDraft.LeadJob — stored and matched as display name only (no L-code prefix). */
function normalizeLeadJobNameForDraftTuple(leadJob) {
    let t = stripJobPrefixForQuoteMatch(leadJob);
    if (/^L\d+$/i.test(String(t || '').trim())) {
        return '';
    }
    return String(t || '').trim();
}

function leadJobsMatchForDraft(dbLeadJob, queryLeadJob) {
    const dbNorm = normalizeDraftTupleText(normalizeLeadJobNameForDraftTuple(dbLeadJob));
    const qNorm = normalizeDraftTupleText(normalizeLeadJobNameForDraftTuple(queryLeadJob));
    if (!dbNorm && !qNorm) return true;
    if (!dbNorm || !qNorm) return false;
    if (dbNorm === qNorm) return true;
    return dbNorm.includes(qNorm) || qNorm.includes(dbNorm);
}

function ownJobsMatchForDraft(dbOwnJob, queryOwnJob) {
    const dbNorm = normalizeDraftTupleText(dbOwnJob);
    const qNorm = normalizeDraftTupleText(queryOwnJob);
    if (!qNorm) return true;
    if (!dbNorm) return false;
    if (dbNorm === qNorm) return true;
    return dbNorm.includes(qNorm) || qNorm.includes(dbNorm);
}

async function findQuoteDraftByTuple(requestNo, leadJob, toName, ownJob = '', options = {}) {
    const leadJobNorm = normalizeLeadJobNameForDraftTuple(leadJob);
    const ownJobNorm = normalizeDraftTupleText(ownJob);
    const sessionDivision = normalizeDraftTupleText(options.sessionDivision || '');
    const useDepartmentForOwnJob = !!options.useDepartmentForOwnJob;
    const result = await sql.query`
        SELECT TOP 40 *,
               CONVERT(varchar(10), CAST(QuoteDate AS DATE), 23) AS QuoteDateYmd
        FROM EnquiryQuotesDraft
        WHERE LTRIM(RTRIM(ISNULL(CAST(RequestNo AS NVARCHAR(50)), ''))) = LTRIM(RTRIM(${requestNo}))
          AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(${toName})))
        ORDER BY UpdatedAt DESC, ID DESC
    `;
    let rows = result.recordset || [];
    if (!rows.length) return null;

    if (leadJobNorm) {
        rows = rows.filter((r) => leadJobsMatchForDraft(r.LeadJob, leadJobNorm));
        if (!rows.length) return null;
    }

    if (ownJobNorm) {
        const ownHit = rows.find((r) => ownJobsMatchForDraft(r.OwnJob, ownJobNorm));
        if (ownHit) return ownHit;
        return null;
    }

    if (useDepartmentForOwnJob && sessionDivision) {
        const divHit = rows.find((r) => ownJobsMatchForDraft(r.OwnJob, sessionDivision));
        if (divHit) return divHit;
        return null;
    }

    if (rows.length === 1) return rows[0];

    return null;
}

/** Resolve dept/div/ownJob for quote draft — mirrors POST /api/quotes identity logic (no EnquiryMaster side effects). */
async function resolveQuoteDraftIdentity(body) {
    const {
        divisionCode,
        departmentCode,
        leadJobPrefix,
        preparedByEmail,
        ownJob = '',
    } = body;

    let dept = departmentCode || 'AAC';
    let division = divisionCode || 'GEN';
    const clientOwnJob = String(ownJob || '').trim();
    let effectiveOwnJob = clientOwnJob;
    const clientSentDivision = String(divisionCode || '').trim();

    if (preparedByEmail) {
        try {
            const normalizedUser = String(preparedByEmail).toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
            const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
            if (userDept) {
                const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                const masterData = masterRes.recordset[0];
                if (masterData) {
                    if (!clientOwnJob) {
                        effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
                    }
                    if (!clientSentDivision) {
                        dept = masterData.DepartmentCode || dept;
                        division = masterData.DivisionCode || division;
                    }
                }
            }
        } catch (e) {
            console.error('[Quote Draft] Identity lookup error:', e);
        }
    }

    let finalLeadJobCode = leadJobPrefix;
    const requestNo = body.requestNo;
    const isLCode = leadJobPrefix && String(leadJobPrefix).toUpperCase().match(/^L\d+/);
    if (!isLCode && requestNo) {
        try {
            const codeResult = await sql.query`
                SELECT LeadJobCode, LeadJobName, ItemName FROM EnquiryFor 
                WHERE RequestNo = ${requestNo} AND (ParentID IS NULL OR ParentID = '0')
                ORDER BY
                    CASE
                        WHEN LeadJobName = ${leadJobPrefix} THEN 0
                        WHEN ItemName = ${leadJobPrefix} THEN 1
                        WHEN LeadJobCode = ${leadJobPrefix} THEN 2
                        ELSE 3
                    END,
                    ID
            `;
            if (codeResult.recordset.length > 0) {
                const match =
                    codeResult.recordset.find((r) => r.LeadJobName === leadJobPrefix) ||
                    codeResult.recordset.find((r) => r.ItemName === leadJobPrefix) ||
                    codeResult.recordset.find((r) => r.LeadJobCode === leadJobPrefix) ||
                    codeResult.recordset[0];
                if (match.LeadJobCode) finalLeadJobCode = match.LeadJobCode;
            }
        } catch (e) {
            console.error('[Quote Draft] LeadJobCode lookup error:', e);
        }
    }

    const requestRef = finalLeadJobCode ? `${requestNo}-${finalLeadJobCode}` : requestNo;
    const quoteNumber = `${dept}/${division}/${requestRef}/DRAFT`;

    return { dept, division, effectiveOwnJob, quoteNumber, requestRef };
}

function parseQuoteDraftBody(body) {
    const {
        validityDays = 30,
        preparedBy,
        preparedByEmail,
        showScopeOfWork = true,
        showBasisOfOffer = true,
        showExclusions = true,
        showPricingTerms = true,
        showSchedule = true,
        showWarranty = true,
        showResponsibilityMatrix = true,
        showTermsConditions = true,
        showAcceptance = true,
        showBillOfQuantity = true,
        scopeOfWork = '',
        basisOfOffer = '',
        exclusions = '',
        pricingTerms = '',
        schedule = '',
        warranty = '',
        responsibilityMatrix = '',
        termsConditions = '',
        acceptance = '',
        billOfQuantity = '',
        totalAmount = 0,
        customClauses = [],
        clauseOrder = [],
        quoteDate = null,
        customerReference = '',
        quoteType = '',
        subject = '',
        signatory = '',
        signatoryDesignation = '',
        coSignatory = '',
        coSignatoryDesignation = '',
        toName = '',
        toAddress = '',
        toPhone = '',
        toEmail = '',
        toFax = '',
        toAttention = '',
        leadJob: leadJobRaw = '',
        digitalSignaturesJson,
        approvalWorkflowJson,
        reasonForRevision = '',
        requestNo,
    } = body;

    const leadJob = normalizeLeadJobNameForDraftTuple(leadJobRaw);

    const customClausesJson = JSON.stringify(customClauses);
    const clauseOrderJson = JSON.stringify(clauseOrder);
    const digitalSignaturesJsonStr =
        typeof digitalSignaturesJson === 'string'
            ? digitalSignaturesJson
            : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : []);
    const approvalWorkflowJsonStr =
        typeof approvalWorkflowJson === 'string'
            ? approvalWorkflowJson
            : serializeApprovalWorkflowJson(
                  Array.isArray(approvalWorkflowJson)
                      ? approvalWorkflowJson
                      : approvalWorkflowJson?.steps
              );

    const cleanQuoteDate = quoteDate ? String(quoteDate).split('T')[0] : null;

    return {
        requestNo,
        validityDays,
        preparedBy,
        preparedByEmail,
        showScopeOfWork,
        showBasisOfOffer,
        showExclusions,
        showPricingTerms,
        showSchedule,
        showWarranty,
        showResponsibilityMatrix,
        showTermsConditions,
        showAcceptance,
        showBillOfQuantity,
        scopeOfWork,
        basisOfOffer,
        exclusions,
        pricingTerms,
        schedule,
        warranty,
        responsibilityMatrix,
        termsConditions,
        acceptance,
        billOfQuantity,
        totalAmount,
        customClausesJson,
        clauseOrderJson,
        digitalSignaturesJsonStr,
        approvalWorkflowJsonStr,
        cleanQuoteDate,
        customerReference,
        quoteType,
        subject,
        signatory,
        signatoryDesignation,
        coSignatory,
        coSignatoryDesignation,
        toName,
        toAddress,
        toPhone,
        toEmail,
        toFax,
        toAttention,
        leadJob,
        reasonForRevision: String(reasonForRevision || '').trim(),
    };
}

// GET /api/quotes/quote-drafts/by-scope — collaborative draft for enquiry + lead + customer tuple
router.get('/quote-drafts/by-scope', async (req, res) => {
    try {
        const requestNo = String(req.query.requestNo || '').trim();
        const leadJob = normalizeLeadJobNameForDraftTuple(String(req.query.leadJob || '').trim());
        const toName = String(req.query.toName || '').trim();
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail || req.query.preparedByEmail || '');
        const sessionDivision = String(req.query.sessionDivision || req.query.division || '').trim();
        if (!requestNo || !userEmail || !toName) {
            return res.status(400).json({ error: 'requestNo, toName, and userEmail are required' });
        }

        const ownJob = String(req.query.ownJob || '').trim();
        const useDepartmentForOwnJob =
            req.query.useDepartmentForOwnJob === '1' || req.query.useDepartmentForOwnJob === 'true';
        const row = await findQuoteDraftByTuple(requestNo, leadJob, toName, ownJob, {
            useDepartmentForOwnJob,
            sessionDivision,
        });
        const allowed = await userCanCollaborateOnQuoteDraft(userEmail, requestNo, {
            sessionDivision,
            draftPreparedByEmail: row?.PreparedByEmail || row?.preparedbyemail || '',
        });
        if (!allowed) {
            return res.status(403).json({ error: 'You do not have permission to view this quote draft.' });
        }

        if (!row) {
            console.log(
                `[quote-drafts] GET by-scope miss requestNo=${requestNo} leadJobNorm=${leadJob || '(empty)'} rawLeadJob=${req.query.leadJob} toName=${toName} ownJob=${ownJob || '(dept)'} sessionDivision=${sessionDivision || '(empty)'}`
            );
            return res.json(null);
        }
        console.log(
            `[quote-drafts] GET by-scope hit id=${row.ID} requestNo=${requestNo} leadJobNorm=${leadJob} rawLeadJob=${req.query.leadJob} dbLeadJob=${row.LeadJob} toName=${toName} ownJob=${ownJob || sessionDivision} dbOwnJob=${row.OwnJob}`
        );
        res.json(row);
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingEnquiryQuotesDraftTableError(msg)) {
            return res.status(503).json({
                error: 'Quote draft storage is not initialized',
                hint: 'Run node server/migrations/run_create_enquiry_quotes_draft.js on the database server.',
            });
        }
        console.error('[quote-drafts] GET by-scope:', err);
        res.status(500).json({ error: 'Failed to load quote draft', details: msg });
    }
});

// POST /api/quotes/quote-drafts — insert or update EnquiryQuotesDraft (same fields as quote save)
router.post('/quote-drafts', express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const body = req.body || {};
        const draftId = body.draftId != null && String(body.draftId).trim() !== '' ? Number(body.draftId) : null;
        const fields = parseQuoteDraftBody(body);
        if (!fields.requestNo) {
            return res.status(400).json({ error: 'Request number is required' });
        }

        const sessionDivision = String(
            body.sessionDivision || body.divisionScope || body.ownJob || ''
        ).trim();
        const userEmail = normalizeQuoteFormDraftUserEmail(fields.preparedByEmail || body.userEmail || '');
        if (!userEmail) {
            return res.status(400).json({ error: 'preparedByEmail (session user) is required' });
        }

        const identity = await resolveQuoteDraftIdentity(body);
        const now = new Date();

        let existingRow = null;
        let existingId = draftId;
        if (existingId) {
            const byId = await sql.query`
                SELECT TOP 1 ID, PreparedByEmail, RequestNo, LeadJob, ToName
                FROM EnquiryQuotesDraft WHERE ID = ${existingId}
            `;
            existingRow = byId.recordset?.[0] || null;
        }
        if (!existingId) {
            const ownJobForTuple = String(identity.effectiveOwnJob || body.ownJob || '').trim();
            const useDepartmentForOwnJob =
                !ownJobForTuple && !String(sessionDivision || '').trim();
            existingRow = await findQuoteDraftByTuple(
                fields.requestNo,
                fields.leadJob || '',
                fields.toName || '',
                ownJobForTuple || sessionDivision,
                { useDepartmentForOwnJob, sessionDivision }
            );
            if (existingRow?.ID != null) {
                existingId = existingRow.ID;
            }
        }

        const allowed = await userCanCollaborateOnQuoteDraft(userEmail, fields.requestNo, {
            sessionDivision,
            draftPreparedByEmail: existingRow?.PreparedByEmail || '',
        });
        if (!allowed) {
            return res.status(403).json({ error: 'You do not have permission to save this quote draft.' });
        }

        const resolvedDraftTotal = await resolveTotalAmountForPersist(
            {
                ...body,
                requestNo: fields.requestNo,
                toName: fields.toName,
                leadJob: fields.leadJob,
                ownJob: identity.effectiveOwnJob,
            },
            fields.totalAmount
        );
        fields.totalAmount = resolvedDraftTotal;

        if (existingId) {
            await sql.query`
                UPDATE EnquiryQuotesDraft SET
                    QuoteNumber = ${identity.quoteNumber},
                    ValidityDays = ${fields.validityDays},
                    PreparedBy = ${fields.preparedBy},
                    ShowScopeOfWork = ${fields.showScopeOfWork ? 1 : 0},
                    ShowBasisOfOffer = ${fields.showBasisOfOffer ? 1 : 0},
                    ShowExclusions = ${fields.showExclusions ? 1 : 0},
                    ShowPricingTerms = ${fields.showPricingTerms ? 1 : 0},
                    ShowSchedule = ${fields.showSchedule ? 1 : 0},
                    ShowWarranty = ${fields.showWarranty ? 1 : 0},
                    ShowResponsibilityMatrix = ${fields.showResponsibilityMatrix ? 1 : 0},
                    ShowTermsConditions = ${fields.showTermsConditions ? 1 : 0},
                    ShowAcceptance = ${fields.showAcceptance ? 1 : 0},
                    ShowBillOfQuantity = ${fields.showBillOfQuantity ? 1 : 0},
                    ScopeOfWork = ${fields.scopeOfWork},
                    BasisOfOffer = ${fields.basisOfOffer},
                    Exclusions = ${fields.exclusions},
                    PricingTerms = ${fields.pricingTerms},
                    Schedule = ${fields.schedule},
                    Warranty = ${fields.warranty},
                    ResponsibilityMatrix = ${fields.responsibilityMatrix},
                    TermsConditions = ${fields.termsConditions},
                    Acceptance = ${fields.acceptance},
                    BillOfQuantity = ${fields.billOfQuantity},
                    TotalAmount = ${fields.totalAmount},
                    Status = 'Draft',
                    CustomClauses = ${fields.customClausesJson},
                    ClauseOrder = ${fields.clauseOrderJson},
                    DigitalSignaturesJson = ${fields.digitalSignaturesJsonStr},
                    ApprovalWorkflowJson = ${fields.approvalWorkflowJsonStr},
                    QuoteDate = ${fields.cleanQuoteDate},
                    CustomerReference = ${fields.customerReference},
                    YourRef = ${fields.customerReference},
                    QuoteType = ${fields.quoteType || ''},
                    Subject = ${fields.subject},
                    Signatory = ${fields.signatory},
                    SignatoryDesignation = ${fields.signatoryDesignation},
                    CoSignatory = ${fields.coSignatory},
                    CoSignatoryDesignation = ${fields.coSignatoryDesignation},
                    ToName = ${fields.toName},
                    ToAddress = ${fields.toAddress},
                    ToPhone = ${fields.toPhone},
                    ToEmail = ${fields.toEmail},
                    ToFax = ${fields.toFax || ''},
                    ToAttention = ${fields.toAttention || ''},
                    LeadJob = ${fields.leadJob || ''},
                    OwnJob = ${identity.effectiveOwnJob},
                    ReasonForRevision = ${fields.reasonForRevision},
                    UpdatedAt = ${now}
                WHERE ID = ${existingId}
            `;
            return res.json({ success: true, id: existingId, draftId: existingId, quoteNumber: identity.quoteNumber, updated: true });
        }

        const insertResult = await sql.query`
            INSERT INTO EnquiryQuotesDraft (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder, DigitalSignaturesJson, ApprovalWorkflowJson,
                QuoteDate, CustomerReference, YourRef, QuoteType, Subject, Signatory, SignatoryDesignation, CoSignatory, CoSignatoryDesignation,
                ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention, LeadJob, OwnJob, ReasonForRevision, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${fields.requestNo}, ${identity.quoteNumber}, 0, 0, ${fields.validityDays},
                ${fields.preparedBy}, ${fields.preparedByEmail},
                ${fields.showScopeOfWork ? 1 : 0}, ${fields.showBasisOfOffer ? 1 : 0}, ${fields.showExclusions ? 1 : 0}, ${fields.showPricingTerms ? 1 : 0},
                ${fields.showSchedule ? 1 : 0}, ${fields.showWarranty ? 1 : 0}, ${fields.showResponsibilityMatrix ? 1 : 0}, ${fields.showTermsConditions ? 1 : 0}, ${fields.showAcceptance ? 1 : 0}, ${fields.showBillOfQuantity ? 1 : 0},
                ${fields.scopeOfWork}, ${fields.basisOfOffer}, ${fields.exclusions}, ${fields.pricingTerms},
                ${fields.schedule}, ${fields.warranty}, ${fields.responsibilityMatrix}, ${fields.termsConditions}, ${fields.acceptance}, ${fields.billOfQuantity},
                ${fields.totalAmount}, 'Draft', ${fields.customClausesJson}, ${fields.clauseOrderJson}, ${fields.digitalSignaturesJsonStr}, ${fields.approvalWorkflowJsonStr},
                ${fields.cleanQuoteDate}, ${fields.customerReference}, ${fields.customerReference}, ${fields.quoteType || ''}, ${fields.subject},
                ${fields.signatory}, ${fields.signatoryDesignation}, ${fields.coSignatory}, ${fields.coSignatoryDesignation},
                ${fields.toName}, ${fields.toAddress}, ${fields.toPhone}, ${fields.toEmail}, ${fields.toFax || ''}, ${fields.toAttention || ''},
                ${fields.leadJob || ''}, ${identity.effectiveOwnJob}, ${fields.reasonForRevision}, ${now}, ${now}
            )
        `;

        const row = insertResult.recordset[0];
        res.json({
            success: true,
            id: row.ID,
            draftId: row.ID,
            quoteNumber: row.QuoteNumber,
            updated: false,
        });
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingEnquiryQuotesDraftTableError(msg)) {
            return res.status(503).json({
                error: 'Quote draft storage is not initialized',
                hint: 'Run node server/migrations/run_create_enquiry_quotes_draft.js on the database server.',
            });
        }
        console.error('[quote-drafts] POST:', err);
        res.status(500).json({ error: 'Failed to save quote draft', details: msg });
    }
});

/** Normalize email for QuoteFormDrafts row ownership (must match client query param). */
function normalizeQuoteFormDraftUserEmail(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@almcg\.com/g, '@almoayyedcg.com');
}

/** MSSQL often reports `Invalid object name 'dbo.QuoteFormDrafts'.` — match that, not only bare table name. */
function isMissingQuoteFormDraftsTableError(message) {
    const m = String(message || '');
    return /Invalid object name/i.test(m) && /QuoteFormDrafts/i.test(m);
}

// GET/POST/DELETE /api/quotes/form-drafts* — MUST be registered BEFORE `/:requestNo` or "form-drafts" is treated as a RequestNo.
// GET /api/quotes/form-drafts — list drafts for the signed-in user only
router.get('/form-drafts', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const request = new sql.Request();
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            SELECT TOP 40
                CONVERT(VARCHAR(36), Id) AS Id,
                Label,
                CONVERT(VARCHAR(33), CreatedAt, 126) AS SavedAtIso
            FROM QuoteFormDrafts
            WHERE LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
            ORDER BY CreatedAt DESC
        `);
        const rows = (result.recordset || []).map((r) => ({
            id: r.Id ?? r.id,
            label: r.Label ?? r.label ?? '',
            savedAtIso: r.SavedAtIso ?? r.savedAtIso ?? '',
        }));
        res.json(rows);
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingQuoteFormDraftsTableError(msg)) {
            console.error('[form-drafts] Table missing? Run: node server/migrations/run_create_quote_form_drafts.js', err);
            return res.status(503).json({
                error: 'Quote drafts storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_form_drafts.js on the database server.',
            });
        }
        console.error('[form-drafts] GET list:', err);
        res.status(500).json({ error: 'Failed to list quote form drafts', details: msg });
    }
});

// GET /api/quotes/form-drafts/:id — full draft JSON for one row (same user only)
router.get('/form-drafts/:id', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F-]{36}$/.test(String(id).trim())) {
            return res.status(400).json({ error: 'Invalid draft id' });
        }

        const request = new sql.Request();
        request.input('id', sql.UniqueIdentifier, id.trim());
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            SELECT
                CONVERT(VARCHAR(36), Id) AS Id,
                Label,
                CONVERT(VARCHAR(33), CreatedAt, 126) AS SavedAtIso,
                DraftPayloadJson
            FROM QuoteFormDrafts
            WHERE Id = @id AND LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
        `);
        const row = result.recordset && result.recordset[0];
        if (!row) {
            return res.status(404).json({ error: 'Draft not found' });
        }
        let payload;
        try {
            payload = JSON.parse(row.DraftPayloadJson || '{}');
        } catch (e) {
            return res.status(500).json({ error: 'Stored draft payload is corrupt' });
        }
        res.json({
            id: row.Id ?? row.id,
            label: row.Label ?? row.label,
            savedAtIso: row.SavedAtIso ?? row.savedAtIso,
            payload,
        });
    } catch (err) {
        console.error('[form-drafts] GET one:', err);
        res.status(500).json({ error: 'Failed to load quote form draft', details: err.message });
    }
});

// POST /api/quotes/form-drafts — save a new draft (per user; keeps latest 40)
router.post('/form-drafts', express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.body.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const label = String(req.body.label || 'Draft')
            .trim()
            .slice(0, 500);
        const payload = req.body.payload;
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'payload object is required' });
        }

        const id = crypto.randomUUID();
        const json = JSON.stringify(payload);

        const ins = new sql.Request();
        ins.input('id', sql.UniqueIdentifier, id);
        ins.input('userEmail', sql.NVarChar(320), userEmail);
        ins.input('label', sql.NVarChar(500), label);
        ins.input('json', sql.NVarChar(sql.MAX), json);
        await ins.query(`
            INSERT INTO QuoteFormDrafts (Id, UserEmail, Label, DraftPayloadJson)
            VALUES (@id, @userEmail, @label, @json)
        `);

        const trimReq = new sql.Request();
        trimReq.input('userEmail', sql.NVarChar(320), userEmail);
        await trimReq.query(`
            ;WITH ranked AS (
                SELECT Id, ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS rn
                FROM QuoteFormDrafts
                WHERE LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
            )
            DELETE FROM QuoteFormDrafts WHERE Id IN (SELECT Id FROM ranked WHERE rn > 40)
        `);

        const savedAtIso = new Date().toISOString();
        res.json({ id, label, savedAtIso, message: 'Draft saved' });
    } catch (err) {
        const msg = (err && err.message) || '';
        if (isMissingQuoteFormDraftsTableError(msg)) {
            return res.status(503).json({
                error: 'Quote drafts storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_form_drafts.js',
            });
        }
        console.error('[form-drafts] POST:', err);
        res.status(500).json({ error: 'Failed to save quote form draft', details: msg });
    }
});

// DELETE /api/quotes/form-drafts/:id — remove one draft if owned by userEmail
router.delete('/form-drafts/:id', async (req, res) => {
    try {
        const userEmail = normalizeQuoteFormDraftUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const { id } = req.params;
        if (!id || !/^[0-9a-fA-F-]{36}$/.test(String(id).trim())) {
            return res.status(400).json({ error: 'Invalid draft id' });
        }

        const request = new sql.Request();
        request.input('id', sql.UniqueIdentifier, id.trim());
        request.input('userEmail', sql.NVarChar(320), userEmail);
        const result = await request.query(`
            DELETE FROM QuoteFormDrafts
            WHERE Id = @id AND LOWER(LTRIM(RTRIM(UserEmail))) = @userEmail
        `);
        const n = result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0;
        if (!n) {
            return res.status(404).json({ error: 'Draft not found or not owned by this user' });
        }
        res.json({ deleted: n });
    } catch (err) {
        console.error('[form-drafts] DELETE:', err);
        res.status(500).json({ error: 'Failed to delete quote form draft', details: err.message });
    }
});

// GET /api/quotes/list/pending-approvals/count — badge count for current approver
router.get('/list/pending-approvals/count', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json({ count: 0 });
        }
        const count = await countPendingApprovalsForUser(userEmail);
        res.json({ count });
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.json({ count: 0 });
        }
        console.error('[quotes] pending-approvals count:', err);
        res.status(500).json({ error: 'Failed to count pending approvals', details: err.message });
    }
});

// GET /api/quotes/list/pending-approvals — quotes awaiting this user's approval
router.get('/list/pending-approvals', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json([]);
        }
        const rows = await fetchPendingApprovalsForUser(userEmail, {
            division: String(req.query.division || '').trim(),
        });
        res.json(rows);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.json([]);
        }
        console.error('[quotes] pending-approvals list:', err);
        res.status(500).json({ error: 'Failed to fetch pending approvals', details: err.message });
    }
});

// GET /api/quotes/list/approved-by-me — quotes this user approved (all divisions)
router.get('/list/approved-by-me', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json([]);
        }
        const rows = await fetchApprovedApprovalsByUser(userEmail, {
            q: req.query.q,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            division: String(req.query.division || '').trim(),
        });
        res.json(rows);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.json([]);
        }
        console.error('[quotes] approved-by-me list:', err);
        res.status(500).json({ error: 'Failed to fetch approved quotes', details: err.message });
    }
});

// GET /api/quotes/list/rejected-by-me — quotes this user rejected (all divisions)
router.get('/list/rejected-by-me', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json([]);
        }
        const rows = await fetchRejectedApprovalsByUser(userEmail, {
            q: req.query.q,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            division: String(req.query.division || '').trim(),
        });
        res.json(rows);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.json([]);
        }
        console.error('[quotes] rejected-by-me list:', err);
        res.status(500).json({ error: 'Failed to fetch rejected quotes', details: err.message });
    }
});

// GET /api/quotes/list/approval-search — quotes submitted for approval (Approvals page only)
router.get('/list/approval-search', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.json([]);
        }
        const q = String(req.query.q || '').trim();
        const dateFrom = String(req.query.dateFrom || '').trim();
        const dateTo = String(req.query.dateTo || '').trim();
        if (!q && !(dateFrom && dateTo)) {
            return res.json([]);
        }
        const rows = await fetchApprovalWorkflowSearch(userEmail, {
            q,
            dateFrom,
            dateTo,
            division: String(req.query.division || '').trim(),
        });
        res.json(rows);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.json([]);
        }
        console.error('[quotes] approval-search list:', err);
        res.status(500).json({ error: 'Failed to search approval quotes', details: err.message });
    }
});

// GET /api/quotes/quote-drafts/for-approval — load draft quote for an assigned approver
router.get('/quote-drafts/for-approval', async (req, res) => {
    try {
        const userEmail = normalizeUserEmail(req.query.userEmail);
        const draftQuoteId = req.query.draftQuoteId ? Number(req.query.draftQuoteId) : null;
        if (!userEmail || !Number.isFinite(draftQuoteId)) {
            return res.status(400).json({ error: 'userEmail and draftQuoteId are required' });
        }

        const allowed = await userHasActionableDraftApprovalStep(draftQuoteId, userEmail);
        if (!allowed) {
            const anyStep = await sql.query`
                SELECT TOP 1 RequestNo
                FROM QuoteApprovalSteps
                WHERE DraftQuoteId = ${draftQuoteId}
                  AND (QuoteId IS NULL OR QuoteId = 0)
                  AND LOWER(LTRIM(RTRIM(ISNULL(ApproverEmail, N'')))) = ${normalizeApprovalEmail(userEmail)}
            `;
            if (!anyStep.recordset?.length) {
                return res.status(403).json({ error: 'You are not an approver for this quote draft' });
            }
            return res.status(403).json({ error: 'This quote is not awaiting your approval' });
        }

        const draftRes = await sql.query`
            SELECT *
            FROM EnquiryQuotesDraft
            WHERE ID = ${draftQuoteId}
        `;
        if (!draftRes.recordset?.length) {
            return res.status(404).json({ error: 'Quote draft not found' });
        }
        res.json(draftRes.recordset[0]);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        if (isMissingEnquiryQuotesDraftTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote draft storage is not initialized',
                hint: 'Run node server/migrations/run_create_enquiry_quotes_draft.js on the database server.',
            });
        }
        console.error('[quote-drafts] GET for-approval:', err);
        res.status(500).json({ error: 'Failed to load quote draft for approval', details: err.message });
    }
});

// GET /api/quotes/approval-steps — load approval path rows for quote / draft / scope
router.get('/approval-steps', async (req, res) => {
    try {
        const quoteId = req.query.quoteId ? Number(req.query.quoteId) : null;
        const draftQuoteId = req.query.draftQuoteId ? Number(req.query.draftQuoteId) : null;

        if (quoteId && Number.isFinite(quoteId)) {
            const payload = await fetchApprovalStepsApiPayload({ quoteId });
            return res.json(payload);
        }
        if (draftQuoteId && Number.isFinite(draftQuoteId)) {
            const payload = await fetchApprovalStepsApiPayload({ draftQuoteId });
            return res.json(payload);
        }

        const meta = normalizeQuoteMeta({
            requestNo: req.query.requestNo,
            leadJobName: req.query.leadJobName || req.query.leadJob,
            ownJob: req.query.ownJob,
            customerName: req.query.customerName || req.query.toName,
        });
        if (!meta.requestNo || !meta.customerName) {
            return res.status(400).json({ error: 'quoteId, draftQuoteId, or requestNo+customerName required' });
        }

        const payload = await fetchApprovalStepsApiPayload({ meta });
        res.json(payload);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        console.error('[approval-steps] GET:', err);
        res.status(500).json({ error: 'Failed to load approval steps', details: err.message });
    }
});

// PUT /api/quotes/approval-steps — replace approval path rows
router.put('/approval-steps', async (req, res) => {
    try {
        const {
            quoteId = null,
            draftQuoteId = null,
            requestNo,
            leadJobName,
            leadJob,
            ownJob,
            customerName,
            toName,
            quoteNo,
            revisionNo,
            quoteRef,
            quoteNumber,
            steps = [],
        } = req.body || {};

        const meta = normalizeQuoteMeta({
            requestNo,
            leadJobName: leadJobName || leadJob,
            ownJob,
            customerName: customerName || toName,
            quoteNo,
            revisionNo,
            quoteRef,
            quoteNumber,
        });

        const replaceResult = await replaceApprovalSteps({
            quoteId: quoteId ? Number(quoteId) : null,
            draftQuoteId: draftQuoteId ? Number(draftQuoteId) : null,
            meta,
            steps,
        });
        const saved = replaceResult?.steps || replaceResult;

        if (quoteId) {
            await sql.query`
                UPDATE EnquiryQuotes
                SET ApprovalWorkflowJson = ${serializeApprovalWorkflowJson(saved)}, UpdatedAt = ${new Date()}
                WHERE ID = ${Number(quoteId)}
            `;
        }

        res.json({ success: true, steps: saved, workflowNo: replaceResult?.workflowNo || null });
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        console.error('[approval-steps] PUT:', err);
        res.status(500).json({ error: 'Failed to save approval steps', details: err.message });
    }
});

// POST /api/quotes/send-approval-request — persist QuoteApprovalSteps then email all pending approvers (parallel)
router.post('/send-approval-request', async (req, res) => {
    try {
        const {
            quoteId = null,
            draftQuoteId = null,
            userEmail,
            requestNo,
            projectName = '',
            customerName = '',
            subject = '',
            leadJobName = '',
            leadJob = '',
            ownJob = '',
            quoteNumber = '',
            quoteNo = null,
            revisionNo = null,
        } = req.body || {};

        const normalizedEmail = normalizeApprovalEmail(userEmail);
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const rn = String(requestNo || '').trim();
        if (!rn) {
            return res.status(400).json({ error: 'requestNo is required' });
        }

        const ok = await userHasQuotePricingEnquiryAccess(normalizedEmail, rn);
        if (!ok) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        let steps = [];
        if (req.body?.steps && (Array.isArray(req.body.steps) || typeof req.body.steps === 'object')) {
            steps = parseApprovalWorkflowJson(req.body.steps);
        }
        if (!steps.length) {
            return res.status(400).json({ error: 'Approval workflow path is required' });
        }

        const savedQuoteId = quoteId != null && Number.isFinite(Number(quoteId)) ? Number(quoteId) : null;
        if (!savedQuoteId) {
            return res.status(400).json({
                error: 'A saved quote revision is required before sending for approval.',
            });
        }

        const persistCtx = await resolveApprovalPersistContext({
            quoteId: savedQuoteId,
            draftQuoteId: null,
            requestNo: rn,
            customerName: String(customerName || '').trim(),
            leadJobName: String(leadJobName || leadJob || '').trim(),
            ownJob: String(ownJob || '').trim(),
            quoteNumber: String(quoteNumber || '').trim(),
            quoteNo,
            revisionNo,
        });

        const replaceResult = await replaceApprovalSteps({
            quoteId: persistCtx.quoteId,
            draftQuoteId: persistCtx.draftQuoteId,
            meta: persistCtx.meta,
            steps,
            createdByEmail: normalizedEmail,
        });
        const savedSteps = replaceResult?.steps || replaceResult;

        const pendingApprovers = [...savedSteps]
            .sort((a, b) => a.sequence - b.sequence)
            .filter((s) => String(s.status || 'pending').toLowerCase() === 'pending')
            .map((s) => ({
                ...s,
                approverEmail: normalizeApprovalEmail(s.approverEmail),
            }))
            .filter((s) => s.approverEmail);

        if (!pendingApprovers.length) {
            return res.status(400).json({ error: 'No pending approvers with email in the workflow path' });
        }

        let resolvedProjectName = String(projectName || '').trim();
        if (!resolvedProjectName) {
            try {
                const enqRes = await sql.query`
                    SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${rn}
                `;
                resolvedProjectName = String(enqRes.recordset?.[0]?.ProjectName || '').trim();
            } catch {
                resolvedProjectName = '';
            }
        }

        const mailContext = await fetchApprovalMailContext({
            quoteId: persistCtx.quoteId,
            draftQuoteId: persistCtx.draftQuoteId,
            meta: persistCtx.meta,
            subjectOverride: String(subject || '').trim(),
            projectNameOverride: resolvedProjectName,
        });

        try {
            await notifyQuoteAssignedForApprovalInApp({
                approverEmails: pendingApprovers.map((s) => s.approverEmail),
                requestNo: rn,
                projectName: resolvedProjectName,
                quoteNumber: mailContext?.quoteNumber || mailContext?.quoteRef || persistCtx.meta?.quoteNumber || '',
                quoteId: persistCtx.quoteId,
                triggerUserEmail: normalizedEmail,
            });
        } catch (inAppErr) {
            console.warn('[send-approval-request] in-app notification:', inAppErr.message);
        }

        // Steps are already persisted, so approvers see the quote in Pending immediately.
        // Respond now and deliver emails in the background — the corp SMTP relay (port 25)
        // can take tens of seconds per message and must not block the sender's UI.
        res.json({
            success: true,
            approvalRequestSent: true,
            sentTo: pendingApprovers.map((s) => s.approverEmail),
            approverNames: pendingApprovers.map((s) => s.approverName),
            via: 'smtp',
            steps: savedSteps,
            workflowNo: replaceResult?.workflowNo || mailContext.workflowNo || null,
            quoteId: persistCtx.quoteId || null,
            draftQuoteId: persistCtx.draftQuoteId || null,
        });

        setImmediate(async () => {
            try {
                const mailResults = await Promise.all(
                    pendingApprovers.map((step) =>
                        sendQuoteApprovalRequestEmail({
                            toEmail: step.approverEmail,
                            approverName: step.approverName,
                            mailContext,
                        })
                    )
                );
                const failed = mailResults
                    .map((result, index) => ({ result, step: pendingApprovers[index] }))
                    .filter(({ result }) => !result?.success);
                if (failed.length) {
                    console.error(
                        '[send-approval-request] email failures:',
                        failed
                            .map(({ result, step }) => `${step.approverName || step.approverEmail}: ${result?.error || 'Unknown SMTP error'}`)
                            .join('; ')
                    );
                }
            } catch (mailErr) {
                console.error('[send-approval-request] background email dispatch:', mailErr.message);
            }
        });
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        console.error('[send-approval-request] POST:', err);
        res.status(500).json({ error: 'Failed to send approval request', details: err.message });
    }
});

// POST /api/quotes/draft-approval-action — record approval/rejection on a quote draft
router.post('/draft-approval-action', async (req, res) => {
    try {
        const { draftQuoteId, stepSequence, action, userEmail, comments = '', digitalSignatureJson = null } =
            req.body || {};
        const normalizedEmail = normalizeApprovalEmail(userEmail);
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }
        const draftId = Number(draftQuoteId);
        if (!Number.isFinite(draftId)) {
            return res.status(400).json({ error: 'draftQuoteId is required' });
        }

        const actionNorm = String(action || '').trim().toLowerCase();
        if (!['approved', 'rejected'].includes(actionNorm)) {
            return res.status(400).json({ error: 'Action must be approved or rejected' });
        }
        if (actionNorm === 'rejected' && !String(comments || '').trim()) {
            return res.status(400).json({ error: 'Comments are required when rejecting a quote' });
        }

        const allowed = await userHasActionableDraftApprovalStep(draftId, normalizedEmail);
        if (!allowed) {
            return res.status(403).json({ error: 'This quote is not awaiting your approval' });
        }

        const draftMetaRes = await sql.query`
            SELECT RequestNo, OwnJob, ToName, Subject
            FROM EnquiryQuotesDraft
            WHERE ID = ${draftId}
        `;
        const draftMeta = draftMetaRes.recordset?.[0] || {};

        const userRes = await sql.query`
            SELECT TOP 1 FullName, Designation, EmailId, DigitalSignaturesJson
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${normalizedEmail}
        `;
        const userRow = userRes.recordset?.[0] || {};
        let sigPayload = digitalSignatureJson;
        if (!sigPayload && userRow.DigitalSignaturesJson) {
            try {
                const parsed = JSON.parse(userRow.DigitalSignaturesJson);
                const defaultId = parsed?.defaultSignatureId;
                const hit = Array.isArray(parsed?.signatures)
                    ? parsed.signatures.find((s) => s.id === defaultId) || parsed.signatures[0]
                    : null;
                if (hit) sigPayload = hit;
            } catch {
                sigPayload = null;
            }
        }

        const actor = {
            email: normalizedEmail,
            name: String(userRow.FullName || '').trim(),
            designation: String(userRow.Designation || '').trim(),
            comments: String(comments || '').trim(),
        };

        let nextSteps;
        try {
            nextSteps = await recordDraftQuoteApprovalAction(
                draftId,
                stepSequence,
                actionNorm,
                actor,
                sigPayload
            );
        } catch (e) {
            return res.status(400).json({ error: e.message || 'Invalid approval action' });
        }

        let notification = null;
        try {
            notification = await notifyAfterApprovalAction({
                nextSteps,
                action: actionNorm,
                requestNo: String(draftMeta.RequestNo || '').trim(),
                customerName: String(draftMeta.ToName || '').trim(),
                subject: String(draftMeta.Subject || '').trim(),
                ownJob: String(draftMeta.OwnJob || '').trim(),
                draftQuoteId: draftId,
            });
        } catch (notifyErr) {
            console.warn('[draft-approval-action] notification:', notifyErr.message);
        }

        res.json({ success: true, steps: nextSteps, notification });
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        console.error('[draft-approval-action] POST:', err);
        res.status(500).json({ error: 'Failed to record draft approval action', details: err.message });
    }
});

// POST /api/quotes/:id/approval-action — record approval/rejection on a saved quote
router.post('/:id/approval-action', async (req, res) => {
    try {
        const { id } = req.params;
        const { stepSequence, action, userEmail, comments = '', digitalSignatureJson = null } = req.body || {};
        const normalizedEmail = normalizeApprovalEmail(userEmail);
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const actionNorm = String(action || '').trim().toLowerCase();
        if (!['approved', 'rejected'].includes(actionNorm)) {
            return res.status(400).json({ error: 'Action must be approved or rejected' });
        }
        if (actionNorm === 'rejected' && !String(comments || '').trim()) {
            return res.status(400).json({ error: 'Comments are required when rejecting a quote' });
        }

        const existingResult = await sql.query`
            SELECT ID, RequestNo, OwnJob, ToName, Subject
            FROM EnquiryQuotes
            WHERE ID = ${id}
        `;
        if (!existingResult.recordset.length) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const row = existingResult.recordset[0];
        const allowed = await userHasActionableQuoteApprovalStep(Number(id), normalizedEmail);
        if (!allowed) {
            return res.status(403).json({ error: 'This quote is not awaiting your approval' });
        }

        const userRes = await sql.query`
            SELECT TOP 1 FullName, Designation, EmailId, DigitalSignaturesJson
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${normalizedEmail}
        `;
        const userRow = userRes.recordset?.[0] || {};
        let sigPayload = digitalSignatureJson;
        if (!sigPayload && userRow.DigitalSignaturesJson) {
            try {
                const parsed = JSON.parse(userRow.DigitalSignaturesJson);
                const defaultId = parsed?.defaultSignatureId;
                const hit = Array.isArray(parsed?.signatures)
                    ? parsed.signatures.find((s) => s.id === defaultId) || parsed.signatures[0]
                    : null;
                if (hit) sigPayload = hit;
            } catch {
                sigPayload = null;
            }
        }

        const actor = {
            email: normalizedEmail,
            name: String(userRow.FullName || '').trim(),
            designation: String(userRow.Designation || '').trim(),
            comments: String(comments || '').trim(),
        };

        let nextSteps;
        try {
            nextSteps = await recordQuoteApprovalAction(
                Number(id),
                stepSequence,
                actionNorm,
                actor,
                sigPayload
            );
        } catch (e) {
            return res.status(400).json({ error: e.message || 'Invalid approval action' });
        }

        let notification = null;
        try {
            notification = await notifyAfterApprovalAction({
                nextSteps,
                action: actionNorm,
                requestNo: String(row.RequestNo || '').trim(),
                customerName: String(row.ToName || '').trim(),
                subject: String(row.Subject || '').trim(),
                ownJob: String(row.OwnJob || '').trim(),
                quoteId: Number(id),
            });
        } catch (notifyErr) {
            console.warn('[approval-action] notification:', notifyErr.message);
        }

        res.json({ success: true, steps: nextSteps, notification });
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return res.status(503).json({
                error: 'Quote approval storage is not initialized',
                hint: 'Run node server/migrations/run_create_quote_approval_steps.js',
            });
        }
        console.error('[approval-action] POST:', err);
        res.status(500).json({ error: 'Failed to record approval action', details: err.message });
    }
});

// GET /api/quotes/:requestNo - Get all quotes for an enquiry
// IMPORTANT: This catch-all route MUST come AFTER all other GET routes with static prefixes
//            (like /single/:id, /enquiry-data/:requestNo, /lists/metadata, /config/templates, /form-drafts)
//            to prevent matching 'single', 'enquiry-data', etc. as requestNo values
// GET /api/quotes/:id/digital-signatures — EnquiryQuotes.DigitalSignaturesJson (placed stamps)
router.get('/:id/digital-signatures', async (req, res) => {
    try {
        const { id } = req.params;
        const row = await sql.query`
            SELECT DigitalSignaturesJson FROM EnquiryQuotes WHERE ID = ${id}
        `;
        if (!row.recordset?.length) {
            return res.status(404).json({ error: 'Quote not found' });
        }
        const stamps = parseQuoteDigitalStamps(row.recordset[0].DigitalSignaturesJson);
        return res.json({ stamps });
    } catch (err) {
        console.error('[Quote API] GET /:id/digital-signatures:', err);
        res.status(500).json({ error: 'Failed to load quote signatures', details: err.message });
    }
});

// PUT /api/quotes/:id/digital-signatures — replace all placed stamps on this revision
router.put('/:id/digital-signatures', express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const { id } = req.params;
        const stamps = Array.isArray(req.body.stamps) ? req.body.stamps : [];
        const jsonStr = serializeQuoteDigitalStamps(stamps);
        const upd = await sql.query`
            UPDATE EnquiryQuotes
            SET DigitalSignaturesJson = ${jsonStr}, UpdatedAt = ${new Date()}
            WHERE ID = ${id}
        `;
        if ((upd.rowsAffected?.[0] || 0) === 0) {
            return res.status(404).json({ error: 'Quote not found' });
        }
        return res.json({ ok: true, stamps: parseQuoteDigitalStamps(jsonStr) });
    } catch (err) {
        console.error('[Quote API] PUT /:id/digital-signatures:', err);
        res.status(500).json({ error: 'Failed to save quote signatures', details: err.message });
    }
});

// POST /api/quotes/:id/digital-signatures/stamps — append/upsert one stamp (multi-user)
router.post('/:id/digital-signatures/stamps', express.json({ limit: '8mb' }), async (req, res) => {
    try {
        const { id } = req.params;
        const stamp = req.body.stamp;
        if (!stamp || !stamp.imageDataUrl) {
            return res.status(400).json({ error: 'stamp with imageDataUrl is required' });
        }
        const existing = await sql.query`
            SELECT DigitalSignaturesJson FROM EnquiryQuotes WHERE ID = ${id}
        `;
        if (!existing.recordset?.length) {
            return res.status(404).json({ error: 'Quote not found' });
        }
        const merged = mergeQuoteStamp(existing.recordset[0].DigitalSignaturesJson, stamp);
        const jsonStr = serializeQuoteDigitalStamps(merged);
        await sql.query`
            UPDATE EnquiryQuotes
            SET DigitalSignaturesJson = ${jsonStr}, UpdatedAt = ${new Date()}
            WHERE ID = ${id}
        `;
        return res.json({ ok: true, stamps: merged });
    } catch (err) {
        console.error('[Quote API] POST /:id/digital-signatures/stamps:', err);
        res.status(500).json({ error: 'Failed to place signature', details: err.message });
    }
});

router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;

        const result = await sql.query`
            SELECT * FROM EnquiryQuotes 
            WHERE RequestNo = ${requestNo}
            ORDER BY QuoteNo DESC, RevisionNo DESC
        `;

        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching quotes:', err);
        res.status(500).json({ error: 'Failed to fetch quotes' });
    }
});

// POST /api/quotes - Create a new quote
router.post('/', async (req, res) => {
    try {
        const fs = require('fs');
        fs.appendFileSync('quote_creation.log', `[${new Date().toISOString()}] Received Payload: ${JSON.stringify(req.body, null, 2)}\n\n`);

        const {
            divisionCode,
            departmentCode,
            leadJobPrefix,
            requestNo,
            validityDays = 30,
            preparedBy,
            preparedByEmail,
            showScopeOfWork = true,
            showBasisOfOffer = true,
            showExclusions = true,
            showPricingTerms = true,
            showSchedule = true,
            showWarranty = true,
            showResponsibilityMatrix = true,
            showTermsConditions = true,
            showAcceptance = true,
            showBillOfQuantity = true,
            scopeOfWork = '',
            basisOfOffer = '',
            exclusions = '',
            pricingTerms = '',
            schedule = '',
            warranty = '',
            responsibilityMatrix = '',
            termsConditions = '',
            acceptance = '',
            billOfQuantity = '',
            totalAmount = 0,
            status = 'Draft',
            customClauses = [],
            clauseOrder = [],
            quoteDate = null,
            customerReference = '',
            quoteType = '',
            subject = '',
            signatory = '',
            signatoryDesignation = '',
            coSignatory = '',
            coSignatoryDesignation = '',
            toName = '',
            toAddress = '',
            toPhone = '',
            toEmail = '',
            toFax = '',
            toAttention = '',
            leadJob = '',
            ownJob = '',
            digitalSignaturesJson,
            approvalWorkflowJson,
            reasonForRevision = ''
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);
        const digitalSignaturesJsonStr =
            typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : []);
        const approvalWorkflowJsonStr =
            typeof approvalWorkflowJson === 'string'
                ? approvalWorkflowJson
                : serializeApprovalWorkflowJson(
                      Array.isArray(approvalWorkflowJson)
                          ? approvalWorkflowJson
                          : approvalWorkflowJson?.steps
                  );

        if (!requestNo) {
            return res.status(400).json({ error: 'Request number is required' });
        }

        let dept = departmentCode || "AAC";
        let division = divisionCode || "GEN";
        let effectiveOwnJob = (ownJob || '').trim();
        const clientSentDivision = String(divisionCode || '').trim();

        // --- BACKEND IDENTITY ENFORCEMENT: email → Master_EnquiryFor for dept/div when client did not send a tab/job division (e.g. multi-branch user on HVAC tab sends HVP). ---
        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;

                if (userDept) {
                    const masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${userDept}`;
                    const masterData = masterRes.recordset[0];
                    if (masterData) {
                        effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
                        if (!clientSentDivision) {
                            console.log(`[Quote Backend] Forcing identity based on email ${preparedByEmail} -> ${userDept} (${masterData.DivisionCode})`);
                            dept = masterData.DepartmentCode || dept;
                            division = masterData.DivisionCode || division;
                        } else {
                            console.log(`[Quote Backend] Keeping client divisionCode=${clientSentDivision} (tab job); email maps to ${userDept} / ${masterData.DivisionCode} not applied to ref)`);
                        }
                    }
                }
            } catch (e) { console.error('[Quote Backend] Identity lookup error:', e); }
        }

        console.log(`[Quote Creation] req.body.divisionCode: ${divisionCode}, effective division: ${division}`);
        fs.appendFileSync('quote_creation.log', `[${new Date().toISOString()}] Resolved Dept: ${dept}, Division: ${division}, RequestNo: ${requestNo}\n`);

        // --- FETCH LEAD JOB CODE ---
        // Try to find the LeadJobCode for the root item of this enquiry to use in reference
        let finalLeadJobCode = leadJobPrefix;

        // If leadJobPrefix is already an L-code (L1, L2...), keep it.
        const isLCode = leadJobPrefix && String(leadJobPrefix).toUpperCase().match(/^L\d+/);

        if (!isLCode) {
            try {
                // Find Root item LeadJobCode (L1, L2...)
                const codeResult = await sql.query`
                    SELECT LeadJobCode, LeadJobName, ItemName FROM EnquiryFor 
                    WHERE RequestNo = ${requestNo} AND (ParentID IS NULL OR ParentID = '0')
                    ORDER BY
                        CASE
                            WHEN LeadJobName = ${leadJobPrefix} THEN 0
                            WHEN ItemName = ${leadJobPrefix} THEN 1
                            WHEN LeadJobCode = ${leadJobPrefix} THEN 2
                            ELSE 3
                        END,
                        ID
                `;
                if (codeResult.recordset.length > 0) {
                    // Try to find a match for the prefix, otherwise take the first
                    const match =
                        codeResult.recordset.find(r => r.LeadJobName === leadJobPrefix) ||
                        codeResult.recordset.find(r => r.ItemName === leadJobPrefix) ||
                        codeResult.recordset.find(r => r.LeadJobCode === leadJobPrefix) ||
                        codeResult.recordset[0];
                    if (match.LeadJobCode) finalLeadJobCode = match.LeadJobCode;
                } else {
                    // If no root code, maybe current item code?
                    const itemResult = await sql.query`
                        SELECT LeadJobCode FROM EnquiryFor 
                        WHERE RequestNo = ${requestNo}
                          AND (ItemName = ${leadJobPrefix} OR LeadJobName = ${leadJobPrefix} OR LeadJobCode = ${leadJobPrefix})
                    `;
                    if (itemResult.recordset.length > 0 && itemResult.recordset[0].LeadJobCode) {
                        finalLeadJobCode = itemResult.recordset[0].LeadJobCode;
                    }
                }
            } catch (e) {
                console.error('Error fetching LeadJobCode:', e);
            }
        }

        const requestRef = finalLeadJobCode ? `${requestNo}-${finalLeadJobCode}` : requestNo;


        // Get next quote number - UNIQUE PER ENQUIRY (GLOBAL SEQUENCE)
        // User requested: "continuation serial next number of quote number" 
        // This means regardless of Dept/Div, numbers should be 1, 2, 3... for Enquiry 50.

        const existingQuotesResult = await sql.query`
            SELECT ISNULL(MAX(QuoteNo), 0) AS MaxQuoteNo
            FROM EnquiryQuotes
            -- WHERE RequestNo = ${requestNo} -- Global Serial Logic requested by user        `;

        const quoteNo = (existingQuotesResult.recordset[0].MaxQuoteNo || 0) + 1;
        const revisionNo = 0;

        // FORMAT: Dept/Div/EnquiryRef/QuoteNo-Revision
        const quoteNumber = `${dept}/${division}/${requestRef}/${quoteNo}-R${revisionNo}`;

        console.log(`[Quote Creation] Customer: ${toName}, Division: ${division}, QuoteNo: ${quoteNo}, Full: ${quoteNumber}`);

        const resolvedCreateTotal = await resolveTotalAmountForPersist(
            { ...req.body, requestNo, toName, leadJob, ownJob: effectiveOwnJob },
            Number(totalAmount)
        );
        if (!Number.isFinite(resolvedCreateTotal) || resolvedCreateTotal <= 0) {
            return res.status(400).json({
                error: 'Ownjob base price must be greater than zero. Cannot create quote until the first-tab ownjob base price is priced.',
            });
        }

        const now = new Date();
        const reasonForRevisionStr = String(reasonForRevision || '').trim();
        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder, DigitalSignaturesJson, ApprovalWorkflowJson,
                QuoteDate, CustomerReference, YourRef, QuoteType, Subject, Signatory, SignatoryDesignation, CoSignatory, CoSignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention, LeadJob, OwnJob, ReasonForRevision, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${requestNo}, ${quoteNumber}, ${quoteNo}, ${revisionNo}, ${validityDays},
                ${preparedBy}, ${preparedByEmail},
                ${showScopeOfWork ? 1 : 0}, ${showBasisOfOffer ? 1 : 0}, ${showExclusions ? 1 : 0}, ${showPricingTerms ? 1 : 0},
                ${showSchedule ? 1 : 0}, ${showWarranty ? 1 : 0}, ${showResponsibilityMatrix ? 1 : 0}, ${showTermsConditions ? 1 : 0}, ${showAcceptance ? 1 : 0}, ${showBillOfQuantity ? 1 : 0},
                ${scopeOfWork}, ${basisOfOffer}, ${exclusions}, ${pricingTerms},
                ${schedule}, ${warranty}, ${responsibilityMatrix}, ${termsConditions}, ${acceptance}, ${billOfQuantity},
                ${resolvedCreateTotal}, ${status}, ${customClausesJson}, ${clauseOrderJson}, ${digitalSignaturesJsonStr}, ${approvalWorkflowJsonStr},
                ${quoteDate ? quoteDate.split('T')[0] : null}, ${customerReference}, ${customerReference}, ${quoteType || ''}, ${subject}, ${signatory}, ${signatoryDesignation}, ${coSignatory}, ${coSignatoryDesignation}, ${toName}, ${toAddress}, ${toPhone}, ${toEmail}, ${toFax || ''}, ${toAttention || ''}, ${leadJob || ''}, ${effectiveOwnJob}, ${reasonForRevisionStr || null}, ${now}, ${now}
            )
        `;

        // Update Enquiry Status to 'Quote'
        await sql.query`
            UPDATE EnquiryMaster 
            SET Status = 'Quote' 
            WHERE RequestNo = ${requestNo} 
            AND (Status IS NULL OR Status IN ('Enquiry', 'Open', 'Pricing', 'Pending'))
        `;

        await notifyParentJobQuoteEvent({
            requestNo,
            ownJobName: effectiveOwnJob,
            quoteId: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber,
            eventType: 'Subjob Quote Creation',
            triggerUserName: preparedBy || '',
            triggerUserEmail: preparedByEmail || '',
        });

        try {
            const newQuoteId = result.recordset[0].ID;
            const steps = parseApprovalWorkflowJson(approvalWorkflowJson);
            if (steps.length) {
                await replaceApprovalSteps({
                    quoteId: newQuoteId,
                    meta: {
                        requestNo,
                        leadJobName: leadJob || '',
                        ownJob: effectiveOwnJob,
                        customerName: toName,
                        quoteNo,
                        revisionNo,
                        quoteNumber: result.recordset[0].QuoteNumber,
                    },
                    steps,
                });
            }
        } catch (syncErr) {
            console.warn('[Quote Create] approval steps table sync:', syncErr.message);
        }

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber
        });

    } catch (err) {
        console.error('Error creating quote:', err);
        try {
            const fs = require('fs');
            fs.appendFileSync('quote_creation_error.log', `[${new Date().toISOString()}] Error creating quote: ${err.message}\nStack: ${err.stack}\nBody: ${JSON.stringify(req.body)}\n\n`);
        } catch (logErr) { }
        res.status(500).json({ error: 'Failed to create quote', details: err.message });
    }
});

// PUT /api/quotes/:id - Update an existing quote
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            validityDays,
            showScopeOfWork, showBasisOfOffer, showExclusions, showPricingTerms,
            showSchedule, showWarranty, showResponsibilityMatrix, showTermsConditions, showAcceptance, showBillOfQuantity,
            scopeOfWork, basisOfOffer, exclusions, pricingTerms,
            schedule, warranty, responsibilityMatrix, termsConditions, acceptance, billOfQuantity,
            totalAmount, status,
            customClauses = [],
            clauseOrder = [],
            quoteDate, customerReference, quoteType, subject, signatory, signatoryDesignation, coSignatory, coSignatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention,
            preparedBy, preparedByEmail,
            leadJob,
            ownJob,
            digitalSignaturesJson,
            approvalWorkflowJson,
            reasonForRevision
        } = req.body;

        const customClausesJson = JSON.stringify(customClauses);
        const clauseOrderJson = JSON.stringify(clauseOrder);
        const hasDigitalSignaturesPayload = Object.prototype.hasOwnProperty.call(req.body, 'digitalSignaturesJson');
        const digitalSignaturesJsonStr = hasDigitalSignaturesPayload
            ? typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : [])
            : null;
        const hasApprovalWorkflowPayload = Object.prototype.hasOwnProperty.call(req.body, 'approvalWorkflowJson');
        const approvalWorkflowJsonStr = hasApprovalWorkflowPayload
            ? typeof approvalWorkflowJson === 'string'
                ? approvalWorkflowJson
                : serializeApprovalWorkflowJson(
                      Array.isArray(approvalWorkflowJson)
                          ? approvalWorkflowJson
                          : approvalWorkflowJson?.steps
                  )
            : null;
        let effectiveOwnJob = (ownJob || '').trim();

        if (preparedByEmail) {
            try {
                const normalizedUser = preparedByEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${normalizedUser}`;
                const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                if (userDept) effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
            } catch (e) {
                console.error('[Quote Update] Identity lookup error:', e);
            }
        }

        const existingQuoteRow = await sql.query`SELECT TOP 1 RequestNo, TotalAmount FROM EnquiryQuotes WHERE ID = ${id}`;
        const existingForTotal = existingQuoteRow.recordset?.[0] || {};
        const resolvedUpdateTotal = await resolveTotalAmountForPersist(
            {
                ...req.body,
                requestNo: req.body.requestNo || existingForTotal.RequestNo,
                toName,
                leadJob,
                ownJob: effectiveOwnJob,
            },
            existingForTotal.TotalAmount ?? totalAmount
        );

        const now = new Date();
        const reasonForRevisionStr = String(reasonForRevision || '').trim();
        if (hasDigitalSignaturesPayload) {
            await sql.query`
            UPDATE EnquiryQuotes SET
        ValidityDays = ${validityDays},
        ShowScopeOfWork = ${showScopeOfWork ? 1 : 0},
        ShowBasisOfOffer = ${showBasisOfOffer ? 1 : 0},
        ShowExclusions = ${showExclusions ? 1 : 0},
        ShowPricingTerms = ${showPricingTerms ? 1 : 0},
        ShowSchedule = ${showSchedule ? 1 : 0},
        ShowWarranty = ${showWarranty ? 1 : 0},
        ShowResponsibilityMatrix = ${showResponsibilityMatrix ? 1 : 0},
        ShowTermsConditions = ${showTermsConditions ? 1 : 0},
        ShowAcceptance = ${showAcceptance ? 1 : 0},
        ShowBillOfQuantity = ${showBillOfQuantity ? 1 : 0},
        ScopeOfWork = ${scopeOfWork},
        BasisOfOffer = ${basisOfOffer},
        Exclusions = ${exclusions},
        PricingTerms = ${pricingTerms},
        Schedule = ${schedule},
        Warranty = ${warranty},
        ResponsibilityMatrix = ${responsibilityMatrix},
        TermsConditions = ${termsConditions},
        Acceptance = ${acceptance},
        BillOfQuantity = ${billOfQuantity},
        TotalAmount = ${resolvedUpdateTotal},
        Status = ${status},
        CustomClauses = ${customClausesJson},
        ClauseOrder = ${clauseOrderJson},
        DigitalSignaturesJson = ${digitalSignaturesJsonStr},
        ApprovalWorkflowJson = ${approvalWorkflowJsonStr},
        QuoteDate = ${quoteDate ? quoteDate.split('T')[0] : null},
        CustomerReference = ${customerReference},
        YourRef = ${customerReference},
        QuoteType = ${quoteType != null && quoteType !== undefined ? quoteType : ''},
        Subject = ${subject},
        Signatory = ${signatory},
        SignatoryDesignation = ${signatoryDesignation},
        CoSignatory = ${coSignatory},
        CoSignatoryDesignation = ${coSignatoryDesignation},
        ToName = ${toName},
        ToAddress = ${toAddress},
        ToPhone = ${toPhone},
        ToEmail = ${toEmail},
        ToFax = ${toFax || ''},
        ToAttention = ${toAttention || ''},
        PreparedBy = ${preparedBy},
        PreparedByEmail = ${preparedByEmail},
        LeadJob = ${leadJob || ''},
        OwnJob = ${effectiveOwnJob},
        ReasonForRevision = ${reasonForRevisionStr || null},
        UpdatedAt = ${now}
            WHERE ID = ${id}
        `;
        } else {
            await sql.query`
            UPDATE EnquiryQuotes SET
        ValidityDays = ${validityDays},
        ShowScopeOfWork = ${showScopeOfWork ? 1 : 0},
        ShowBasisOfOffer = ${showBasisOfOffer ? 1 : 0},
        ShowExclusions = ${showExclusions ? 1 : 0},
        ShowPricingTerms = ${showPricingTerms ? 1 : 0},
        ShowSchedule = ${showSchedule ? 1 : 0},
        ShowWarranty = ${showWarranty ? 1 : 0},
        ShowResponsibilityMatrix = ${showResponsibilityMatrix ? 1 : 0},
        ShowTermsConditions = ${showTermsConditions ? 1 : 0},
        ShowAcceptance = ${showAcceptance ? 1 : 0},
        ShowBillOfQuantity = ${showBillOfQuantity ? 1 : 0},
        ScopeOfWork = ${scopeOfWork},
        BasisOfOffer = ${basisOfOffer},
        Exclusions = ${exclusions},
        PricingTerms = ${pricingTerms},
        Schedule = ${schedule},
        Warranty = ${warranty},
        ResponsibilityMatrix = ${responsibilityMatrix},
        TermsConditions = ${termsConditions},
        Acceptance = ${acceptance},
        BillOfQuantity = ${billOfQuantity},
        TotalAmount = ${resolvedUpdateTotal},
        Status = ${status},
        CustomClauses = ${customClausesJson},
        ClauseOrder = ${clauseOrderJson},
        ApprovalWorkflowJson = ${approvalWorkflowJsonStr},
        QuoteDate = ${quoteDate ? quoteDate.split('T')[0] : null},
        CustomerReference = ${customerReference},
        YourRef = ${customerReference},
        QuoteType = ${quoteType != null && quoteType !== undefined ? quoteType : ''},
        Subject = ${subject},
        Signatory = ${signatory},
        SignatoryDesignation = ${signatoryDesignation},
        CoSignatory = ${coSignatory},
        CoSignatoryDesignation = ${coSignatoryDesignation},
        ToName = ${toName},
        ToAddress = ${toAddress},
        ToPhone = ${toPhone},
        ToEmail = ${toEmail},
        ToFax = ${toFax || ''},
        ToAttention = ${toAttention || ''},
        PreparedBy = ${preparedBy},
        PreparedByEmail = ${preparedByEmail},
        LeadJob = ${leadJob || ''},
        OwnJob = ${effectiveOwnJob},
        ReasonForRevision = ${reasonForRevisionStr || null},
        UpdatedAt = ${now}
            WHERE ID = ${id}
        `;
        }

        const updated = await sql.query`SELECT ID, QuoteNumber FROM EnquiryQuotes WHERE ID = ${id} `;
        res.json({ success: true, id: updated.recordset[0].ID, quoteNumber: updated.recordset[0].QuoteNumber });

    } catch (err) {
        console.error('Error updating quote:', err);
        res.status(500).json({ error: 'Failed to update quote' });
    }
});

// POST /api/quotes/:id/revise - Create a new revision of a quote
router.post('/:id/revise', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[Revise] Starting revision for quote ID: ${id}`);

        const {
            preparedBy, preparedByEmail, validityDays,
            showScopeOfWork, showBasisOfOffer, showExclusions, showPricingTerms,
            showSchedule, showWarranty, showResponsibilityMatrix, showTermsConditions, showAcceptance, showBillOfQuantity,
            scopeOfWork, basisOfOffer, exclusions, pricingTerms,
            schedule, warranty, responsibilityMatrix, termsConditions, acceptance, billOfQuantity,
            totalAmount, customClauses, clauseOrder,
            quoteDate, customerReference, quoteType, subject, signatory, signatoryDesignation, coSignatory, coSignatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention,
            leadJob,
            ownJob,
            digitalSignaturesJson,
            approvalWorkflowJson,
            reasonForRevision
        } = req.body;

        const cleanQuoteDate = quoteDate ? quoteDate.split('T')[0] : null;
        const reasonForRevisionStr = String(reasonForRevision || '').trim();
        if (!reasonForRevisionStr) {
            return res.status(400).json({ error: 'Reason for Revision is required' });
        }

        const existingResult = await sql.query`SELECT * FROM EnquiryQuotes WHERE ID = ${id}`;

        if (existingResult.recordset.length === 0) {
            console.log(`[Revise] Quote not found for ID: ${id}`);
            return res.status(404).json({ error: 'Quote not found' });
        }
        const existing = existingResult.recordset[0];
        const newRevisionNo = existing.RevisionNo + 1;
        console.log(`[Revise] Existing quote: ${existing.QuoteNumber}, Current Revision: ${existing.RevisionNo}, New Revision: ${newRevisionNo}`);

        const existingParts = existing.QuoteNumber ? existing.QuoteNumber.split("/") : [];

        // For revisions, preserve the existing quote's reference part (including lead job prefix)
        // Don't recalculate - just use what's already in the quote number
        let correctRefPart = existingParts.length > 2 ? existingParts[2] : existing.RequestNo;
        console.log(`[Revise] Using existing reference part: ${correctRefPart}`);

        // 2. Reconstruct Quote Number
        // Expected Format: Dept/Div/Ref/QuoteNo-Rev
        let newQuoteNumber;
        if (existingParts.length >= 4) {
            const dept = existingParts[0];
            const div = existingParts[1];
            // Part 2 is Ref (Updated)
            // Part 3 is Quote-Rev
            newQuoteNumber = `${dept}/${div}/${correctRefPart}/${existing.QuoteNo}-R${newRevisionNo}`;
        } else {
            // Fallback for non-standard formats
            if (existingParts.length > 0) existingParts.pop();
            const quoteRevPart = `${existing.QuoteNo}-R${newRevisionNo}`;
            newQuoteNumber = existingParts.length > 0 ? `${existingParts.join('/')}/${quoteRevPart}` : `${existing.QuoteNumber}-R${newRevisionNo}`;
        }
        console.log(`[Revise] New quote number: ${newQuoteNumber}`);

        const customClausesJson = customClauses ? JSON.stringify(customClauses) : existing.CustomClauses;
        const clauseOrderJson = clauseOrder ? JSON.stringify(clauseOrder) : existing.ClauseOrder;
        const hasReviseDigitalSignatures = Object.prototype.hasOwnProperty.call(req.body, 'digitalSignaturesJson');
        const reviseDigitalSignaturesJsonStr = hasReviseDigitalSignatures
            ? typeof digitalSignaturesJson === 'string'
                ? digitalSignaturesJson
                : JSON.stringify(Array.isArray(digitalSignaturesJson) ? digitalSignaturesJson : [])
            : '[]';
        const hasReviseApprovalWorkflow = Object.prototype.hasOwnProperty.call(req.body, 'approvalWorkflowJson');
        const reviseApprovalWorkflowJsonStr = hasReviseApprovalWorkflow
            ? typeof approvalWorkflowJson === 'string'
                ? approvalWorkflowJson
                : serializeApprovalWorkflowJson(
                      Array.isArray(approvalWorkflowJson)
                          ? approvalWorkflowJson
                          : approvalWorkflowJson?.steps
                  )
            : existing.ApprovalWorkflowJson || '{"steps":[]}';
        let effectiveOwnJob = String(ownJob !== undefined && ownJob !== null ? ownJob : (existing.OwnJob || '')).trim();

        if (preparedByEmail || existing.PreparedByEmail) {
            try {
                const emailForIdentity = (preparedByEmail || existing.PreparedByEmail || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
                if (emailForIdentity) {
                    const userRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE EmailId = ${emailForIdentity}`;
                    const userDept = userRes.recordset.length > 0 ? userRes.recordset[0].Department : null;
                    if (userDept) effectiveOwnJob = applyOwnJobAfterDepartmentLookup(effectiveOwnJob, userDept);
                }
            } catch (e) {
                console.error('[Revise] Identity lookup error:', e);
            }
        }

        const resolvedTotalForRev = await resolveTotalAmountForPersist(
            {
                ...req.body,
                requestNo: existing.RequestNo,
                toName: toName !== undefined ? toName : existing.ToName,
                leadJob: leadJob !== undefined ? leadJob : existing.LeadJob,
                ownJob: effectiveOwnJob,
            },
            existing.TotalAmount
        );
        if (!Number.isFinite(resolvedTotalForRev) || resolvedTotalForRev <= 0) {
            return res.status(400).json({
                error: 'Ownjob base price must be greater than zero. Cannot create revision until the first-tab ownjob base price is priced.',
            });
        }

        const now = new Date();
        const result = await sql.query`
            INSERT INTO EnquiryQuotes (
                RequestNo, QuoteNumber, QuoteNo, RevisionNo, ValidityDays,
                PreparedBy, PreparedByEmail,
                ShowScopeOfWork, ShowBasisOfOffer, ShowExclusions, ShowPricingTerms,
                ShowSchedule, ShowWarranty, ShowResponsibilityMatrix, ShowTermsConditions, ShowAcceptance, ShowBillOfQuantity,
                ScopeOfWork, BasisOfOffer, Exclusions, PricingTerms,
                Schedule, Warranty, ResponsibilityMatrix, TermsConditions, Acceptance, BillOfQuantity,
                TotalAmount, Status, CustomClauses, ClauseOrder, DigitalSignaturesJson, ApprovalWorkflowJson,
                QuoteDate, CustomerReference, YourRef, QuoteType, Subject, Signatory, SignatoryDesignation, CoSignatory, CoSignatoryDesignation, ToName, ToAddress, ToPhone, ToEmail, ToFax, ToAttention, LeadJob, OwnJob, ReasonForRevision, CreatedAt, UpdatedAt
            )
            OUTPUT INSERTED.ID, INSERTED.QuoteNumber
            VALUES (
                ${existing.RequestNo}, ${newQuoteNumber}, ${existing.QuoteNo}, ${newRevisionNo}, ${validityDays !== undefined ? validityDays : existing.ValidityDays},
                ${preparedBy || existing.PreparedBy}, ${preparedByEmail || existing.PreparedByEmail},
                ${showScopeOfWork !== undefined ? (showScopeOfWork ? 1 : 0) : existing.ShowScopeOfWork}, 
                ${showBasisOfOffer !== undefined ? (showBasisOfOffer ? 1 : 0) : existing.ShowBasisOfOffer}, 
                ${showExclusions !== undefined ? (showExclusions ? 1 : 0) : existing.ShowExclusions}, 
                ${showPricingTerms !== undefined ? (showPricingTerms ? 1 : 0) : existing.ShowPricingTerms},
                ${showSchedule !== undefined ? (showSchedule ? 1 : 0) : existing.ShowSchedule}, 
                ${showWarranty !== undefined ? (showWarranty ? 1 : 0) : existing.ShowWarranty}, 
                ${showResponsibilityMatrix !== undefined ? (showResponsibilityMatrix ? 1 : 0) : existing.ShowResponsibilityMatrix}, 
                ${showTermsConditions !== undefined ? (showTermsConditions ? 1 : 0) : existing.ShowTermsConditions}, 
                ${showAcceptance !== undefined ? (showAcceptance ? 1 : 0) : existing.ShowAcceptance}, 
                ${showBillOfQuantity !== undefined ? (showBillOfQuantity ? 1 : 0) : existing.ShowBillOfQuantity},
                ${scopeOfWork !== undefined ? scopeOfWork : existing.ScopeOfWork}, 
                ${basisOfOffer !== undefined ? basisOfOffer : existing.BasisOfOffer}, 
                ${exclusions !== undefined ? exclusions : existing.Exclusions}, 
                ${pricingTerms !== undefined ? pricingTerms : existing.PricingTerms},
                ${schedule !== undefined ? schedule : existing.Schedule}, 
                ${warranty !== undefined ? warranty : existing.Warranty}, 
                ${responsibilityMatrix !== undefined ? responsibilityMatrix : existing.ResponsibilityMatrix}, 
                ${termsConditions !== undefined ? termsConditions : existing.TermsConditions}, 
                ${acceptance !== undefined ? acceptance : existing.Acceptance}, 
                ${billOfQuantity !== undefined ? billOfQuantity : existing.BillOfQuantity},
                ${resolvedTotalForRev},
                'Saved',
                ${customClausesJson}, 
                ${clauseOrderJson},
                ${reviseDigitalSignaturesJsonStr},
                ${reviseApprovalWorkflowJsonStr},
                ${cleanQuoteDate !== null ? cleanQuoteDate : (existing.QuoteDate ? existing.QuoteDate.toISOString().split('T')[0] : null)}, 
                ${customerReference !== undefined ? customerReference : existing.CustomerReference}, 
                ${customerReference !== undefined ? customerReference : (existing.YourRef != null ? existing.YourRef : existing.CustomerReference)}, 
                ${quoteType !== undefined ? (quoteType || '') : (existing.QuoteType != null ? existing.QuoteType : '')}, 
                ${subject !== undefined ? subject : existing.Subject}, 
                ${signatory !== undefined ? signatory : existing.Signatory}, 
                ${signatoryDesignation !== undefined ? signatoryDesignation : existing.SignatoryDesignation}, 
                ${coSignatory !== undefined ? coSignatory : existing.CoSignatory}, 
                ${coSignatoryDesignation !== undefined ? coSignatoryDesignation : existing.CoSignatoryDesignation}, 
                ${toName !== undefined ? toName : existing.ToName}, 
                ${toAddress !== undefined ? toAddress : existing.ToAddress}, 
                ${toPhone !== undefined ? toPhone : existing.ToPhone}, 
                ${toEmail !== undefined ? toEmail : existing.ToEmail}, 
                ${toFax !== undefined ? (toFax || '') : (existing.ToFax || '')}, 
                ${toAttention !== undefined ? (toAttention || '') : (existing.ToAttention || '')}, 
                ${leadJob !== undefined ? leadJob : existing.LeadJob},
                ${effectiveOwnJob},
                ${reasonForRevisionStr},
                ${now}, ${now}
            )
        `;

        console.log(`[Revise] Revision created successfully! New ID: ${result.recordset[0].ID}, QuoteNumber: ${result.recordset[0].QuoteNumber}`);

        await notifyParentJobQuoteEvent({
            requestNo: existing.RequestNo,
            ownJobName: effectiveOwnJob,
            quoteId: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber,
            eventType: 'Subjob Quote Revision',
            triggerUserName: preparedBy || existing.PreparedBy || '',
            triggerUserEmail: preparedByEmail || existing.PreparedByEmail || '',
        });

        res.json({
            success: true,
            id: result.recordset[0].ID,
            quoteNumber: result.recordset[0].QuoteNumber,
            revisionNo: newRevisionNo,
        });

    } catch (err) {
        console.error('[Revise] Error creating revision:', err);
        res.status(500).json({ error: 'Failed to create revision', details: err.message });
    }
});

// DELETE /api/quotes/:id - Delete a quote
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await sql.query`DELETE FROM EnquiryQuotes WHERE ID = ${id} `;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting quote:', err);
        res.status(500).json({ error: 'Failed to delete quote' });
    }
});

// POST /api/quotes/templates - Save a new template (scoped to creator email)
router.post('/config/templates', async (req, res) => {
    try {
        const { templateName, clausesConfig, createdBy } = req.body;

        if (!templateName || !clausesConfig) {
            return res.status(400).json({ error: 'Template Name and Configuration are required' });
        }

        const ownerEmail = normalizeUserEmail(createdBy);
        if (!ownerEmail) {
            return res.status(400).json({ error: 'User email is required to save a template' });
        }

        const configJson = JSON.stringify(clausesConfig);

        const now = new Date();
        const check = await sql.query`
            SELECT ID FROM QuoteTemplates
            WHERE TemplateName = ${templateName}
              AND LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${ownerEmail}
        `;
        if (check.recordset.length > 0) {
            const existingId = check.recordset[0].ID;
            await sql.query`
                UPDATE QuoteTemplates
                SET ClausesConfig = ${configJson}, CreatedAt = ${now}
                WHERE TemplateName = ${templateName}
                  AND LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${ownerEmail}
        `;
            res.json({ success: true, message: 'Template updated', id: existingId });
        } else {
            const insertResult = await sql.query`
                INSERT INTO QuoteTemplates(TemplateName, ClausesConfig, CreatedBy, CreatedAt)
                OUTPUT INSERTED.ID AS ID
                VALUES(${templateName}, ${configJson}, ${ownerEmail}, ${now})
            `;
            const newId = insertResult.recordset[0]?.ID;
            res.json({ success: true, message: 'Template saved', id: newId });
        }
    } catch (err) {
        console.error('Error saving template:', err);
        res.status(500).json({ error: 'Failed to save template', details: err.message });
    }
});

// PUT /api/quotes/config/templates/:id - Update an existing template owned by the requesting user
router.put('/config/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { templateName, clausesConfig, userEmail } = req.body;

        if (!clausesConfig) {
            return res.status(400).json({ error: 'Configuration is required' });
        }

        const ownerEmail = normalizeUserEmail(userEmail);
        if (!ownerEmail) {
            return res.status(400).json({ error: 'User email is required to update a template' });
        }

        const name = String(templateName || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Template name is required' });
        }

        const configJson = JSON.stringify(clausesConfig);
        const now = new Date();

        const dup = await sql.query`
            SELECT ID FROM QuoteTemplates
            WHERE TemplateName = ${name}
              AND LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${ownerEmail}
              AND ID <> ${id}
        `;
        if (dup.recordset.length > 0) {
            return res.status(409).json({ error: 'A template with this name already exists' });
        }

        const result = await sql.query`
            UPDATE QuoteTemplates
            SET TemplateName = ${name},
                ClausesConfig = ${configJson},
                CreatedAt = ${now}
            WHERE ID = ${id}
              AND LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${ownerEmail}
        `;
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(403).json({ error: 'Template not found or not owned by this user' });
        }

        res.json({ success: true, message: 'Template updated', id: parseInt(String(id), 10) });
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).json({ error: 'Failed to update template', details: err.message });
    }
});

// DELETE /api/quotes/templates/:id - Delete a template owned by the requesting user
router.delete('/config/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userEmail = normalizeUserEmail(req.query.userEmail);
        if (!userEmail) {
            return res.status(400).json({ error: 'User email is required' });
        }
        const result = await sql.query`
            DELETE FROM QuoteTemplates
            WHERE ID = ${id}
              AND LOWER(LTRIM(RTRIM(ISNULL(CreatedBy, '')))) = ${userEmail}
        `;
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(403).json({ error: 'Template not found or not owned by this user' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting template:', err);
        res.status(500).json({ error: 'Failed to delete template', details: err.message });
    }
});


// --- Quote Attachments ---

// GET /api/quotes/attachments/:quoteId - List all attachments for a quote
router.get('/attachments/:quoteId', async (req, res) => {
    try {
        const quoteIdNum = parseInt(String(req.params.quoteId), 10);
        if (!Number.isFinite(quoteIdNum)) {
            return res.status(400).json({ error: 'Invalid quote id' });
        }
        const result = await sql.query`
            SELECT ID, QuoteID, FileName, UploadedAt 
            FROM QuoteAttachments 
            WHERE QuoteID = ${quoteIdNum}
            ORDER BY UploadedAt DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching quote attachments:', err);
        const msg = String(err && err.message ? err.message : err);
        if (/invalid object name ['"]?quoteattachments/i.test(msg)) {
            return res.status(500).json({
                error: 'QuoteAttachments table missing',
                hint: 'Run: node server/migrate_quote_attachments.js',
            });
        }
        res.status(500).json({ error: 'Failed to fetch attachments' });
    }
});

// POST /api/quotes/attachments/:quoteId - Upload attachments for a quote
router.post('/attachments/:quoteId', upload.array('files'), async (req, res) => {
    try {
        const quoteIdNum = parseInt(String(req.params.quoteId), 10);
        if (!Number.isFinite(quoteIdNum)) {
            return res.status(400).json({ error: 'Invalid quote id' });
        }
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedResults = [];
        for (const file of files) {
            const fileName = file.originalname;
            const filePath = absolutePathForFilesystem(file.path);
            if (!fs.existsSync(filePath)) {
                console.error('[quote-attachments] file missing after multer write:', filePath);
                return res.status(500).json({
                    error: 'Upload failed: file was not written to storage',
                    hint: 'Verify ENQUIRY_ATTACHMENTS_ROOT / QUOTE_ATTACHMENTS_ROOT and that the Windows account running Node can create files on that UNC share.',
                    attemptedPath: filePath,
                });
            }
            console.log('[quote-attachments] saved file:', filePath);

            const result = await sql.query`
                INSERT INTO QuoteAttachments (QuoteID, FileName, FilePath)
                VALUES (${quoteIdNum}, ${fileName}, ${filePath});
                SELECT SCOPE_IDENTITY() AS ID;
            `;
            uploadedResults.push({ id: result.recordset[0].ID, fileName });
        }

        res.status(201).json({
            message: 'Files uploaded successfully',
            storageMode: 'filesystem',
            files: uploadedResults,
        });
    } catch (err) {
        console.error('Error uploading quote attachments:', err);
        const msg = String(err && err.message ? err.message : err);
        if (/invalid object name ['"]?quoteattachments/i.test(msg)) {
            return res.status(500).json({
                error: 'QuoteAttachments table missing',
                hint: 'Run: node server/migrate_quote_attachments.js',
            });
        }
        res.status(500).json({ error: 'Failed to upload attachments', details: msg });
    }
});

// GET /api/quotes/attachments/download/:id - Download a quote attachment
router.get('/attachments/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await sql.query`
            SELECT FileName, FilePath FROM QuoteAttachments WHERE ID = ${id}
        `;
        const attachment = result.recordset[0];

        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        const absPath = absolutePathForFilesystem(attachment.FilePath);
        if (fs.existsSync(absPath)) {
            const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.FileName}"`);
            res.sendFile(absPath);
        } else {
            console.error('[quote-attachments] download missing file:', absPath);
            res.status(404).json({
                error: 'File not found on server',
                pathInDb: attachment.FilePath,
                resolvedPath: absPath,
                hint: 'Row exists but the file is missing on disk (moved, UNC offline, or upload failed silently).',
            });
        }
    } catch (err) {
        console.error('Error downloading quote attachment:', err);
        res.status(500).json({ error: 'Failed to download attachment' });
    }
});


// DELETE /api/quotes/attachments/:id - Delete a quote attachment
router.delete('/attachments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await sql.query`
            SELECT FilePath FROM QuoteAttachments WHERE ID = ${id}
        `;
        const attachment = result.recordset[0];

        if (attachment) {
            const absPath = absolutePathForFilesystem(attachment.FilePath);
            if (fs.existsSync(absPath)) {
                fs.unlinkSync(absPath);
            }
        }

        await sql.query`DELETE FROM QuoteAttachments WHERE ID = ${id}`;
        res.json({ message: 'Attachment deleted successfully' });
    } catch (err) {
        console.error('Error deleting quote attachment:', err);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});

module.exports = router;

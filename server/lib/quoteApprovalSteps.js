const sql = require('mssql');
const {
    normalizeApprovalEmail,
    parseApprovalWorkflowJson,
    serializeApprovalWorkflowJson,
    applyApprovalAction,
    getCurrentPendingStep,
    deriveWorkflowRollupStatusLabel,
} = require('./approvalWorkflowJson');

function isMissingQuoteApprovalStepsTableError(message) {
    const m = String(message || '');
    return /Invalid object name/i.test(m) && /QuoteApprovalSteps/i.test(m);
}

function mapDbRowToStep(row) {
    if (!row) return null;
    const statusRaw = String(row.Status || 'Pending').trim().toLowerCase();
    const status = statusRaw === 'approved' ? 'approved' : statusRaw === 'rejected' ? 'rejected' : 'pending';
    return {
        id: row.ID,
        sequence: Number(row.ApproverSequence) || 1,
        approverEmail: String(row.ApproverEmail || '').trim(),
        approverName: String(row.ApproverName || '').trim(),
        approverDesignation: String(row.ApproverDesignation || '').trim(),
        status,
        actionAt: row.ApprovedAt ? new Date(row.ApprovedAt).toISOString() : null,
        comments: String(row.Comments || '').trim(),
        digitalSignatureJson: row.ApproverDigitalSignatureJson || null,
    };
}

function stepsToJson(steps) {
    return serializeApprovalWorkflowJson(
        (steps || []).map((s) => ({
            sequence: s.sequence,
            approverEmail: s.approverEmail,
            approverName: s.approverName,
            approverDesignation: s.approverDesignation,
            status: s.status,
            actionAt: s.actionAt,
            comments: s.comments || '',
        }))
    );
}

function normalizeQuoteMeta(meta = {}) {
    return {
        requestNo: String(meta.requestNo || meta.RequestNo || '').trim(),
        leadJobName: String(meta.leadJobName || meta.LeadJobName || meta.leadJob || meta.LeadJob || '').trim(),
        ownJob: String(meta.ownJob || meta.OwnJob || '').trim(),
        customerName: String(meta.customerName || meta.CustomerName || meta.toName || meta.ToName || '').trim(),
        quoteNo: meta.quoteNo != null ? Number(meta.quoteNo) : meta.QuoteNo != null ? Number(meta.QuoteNo) : null,
        revisionNo: meta.revisionNo != null ? Number(meta.revisionNo) : meta.RevisionNo != null ? Number(meta.RevisionNo) : null,
        quoteRef: String(meta.quoteRef || meta.QuoteRef || '').trim(),
        quoteNumber: String(meta.quoteNumber || meta.QuoteNumber || '').trim(),
    };
}

function deriveQuoteRef(quoteNumber) {
    const qn = String(quoteNumber || '').trim();
    if (!qn) return '';
    const parts = qn.split('/');
    if (parts.length >= 4) return parts.slice(0, 3).join('/');
    return qn;
}

async function fetchApprovalStepsByQuoteId(quoteId) {
    const result = await sql.query`
        SELECT *
        FROM QuoteApprovalSteps
        WHERE QuoteId = ${quoteId}
        ORDER BY ApproverSequence ASC, ID ASC
    `;
    return (result.recordset || []).map(mapDbRowToStep).filter(Boolean);
}

async function fetchApprovalStepsByDraftId(draftQuoteId) {
    const result = await sql.query`
        SELECT *
        FROM QuoteApprovalSteps
        WHERE DraftQuoteId = ${draftQuoteId}
          AND (QuoteId IS NULL OR QuoteId = 0)
        ORDER BY ApproverSequence ASC, ID ASC
    `;
    return (result.recordset || []).map(mapDbRowToStep).filter(Boolean);
}

function formatApproverPathLabel(step) {
    const name = String(step?.approverName || '').trim();
    if (name) return name;
    const email = normalizeApprovalEmail(step?.approverEmail);
    if (email) return email.split('@')[0] || email;
    return '';
}

function buildApprovalHierarchyPath(steps = []) {
    return (Array.isArray(steps) ? steps : [])
        .slice()
        .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0))
        .map(formatApproverPathLabel)
        .filter(Boolean)
        .join(' --> ');
}

async function fetchApprovalStepsForMailContext({ quoteId = null, draftQuoteId = null, meta = {} }) {
    if (quoteId) return fetchApprovalStepsByQuoteId(quoteId);
    if (draftQuoteId) return fetchApprovalStepsByDraftId(draftQuoteId);

    const m = normalizeQuoteMeta(meta);
    if (!m.requestNo) return [];

    try {
        const result = await sql.query`
            SELECT *
            FROM QuoteApprovalSteps
            WHERE QuoteId IS NULL
              AND DraftQuoteId IS NULL
              AND LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${m.requestNo}))
              AND LOWER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) = LOWER(LTRIM(RTRIM(${m.customerName})))
              AND LTRIM(RTRIM(ISNULL(LeadJobName, N''))) = LTRIM(RTRIM(${m.leadJobName}))
              AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${m.ownJob}))
            ORDER BY ApproverSequence ASC, ID ASC
        `;
        return (result.recordset || []).map(mapDbRowToStep).filter(Boolean);
    } catch (e) {
        console.warn('[quoteApprovalSteps] fetchApprovalStepsForMailContext:', e.message);
        return [];
    }
}

async function fetchExistingWorkflowMeta({ quoteId = null, draftQuoteId = null, meta = {} }) {
    const m = normalizeQuoteMeta(meta);
    const empty = {
        workflowNo: '',
        createdByEmail: '',
        createdByName: '',
        createdByCompanyName: '',
        createdByDivisionName: '',
        requestNo: m.requestNo,
        customerName: m.customerName,
        quoteNumber: m.quoteNumber,
        quoteRef: m.quoteRef || deriveQuoteRef(m.quoteNumber),
    };
    try {
        let row = null;
        if (quoteId) {
            const res = await sql.query`
                SELECT TOP 1 WorkflowNo, CreatedByEmail, CreatedByName, CreatedByCompanyName,
                       CreatedByDivisionName, RequestNo, CustomerName, QuoteNumber, QuoteRef
                FROM QuoteApprovalSteps
                WHERE QuoteId = ${quoteId}
                ORDER BY ID ASC
            `;
            row = res.recordset?.[0];
        } else if (draftQuoteId) {
            const res = await sql.query`
                SELECT TOP 1 WorkflowNo, CreatedByEmail, CreatedByName, CreatedByCompanyName,
                       CreatedByDivisionName, RequestNo, CustomerName, QuoteNumber, QuoteRef
                FROM QuoteApprovalSteps
                WHERE DraftQuoteId = ${draftQuoteId}
                  AND (QuoteId IS NULL OR QuoteId = 0)
                ORDER BY ID ASC
            `;
            row = res.recordset?.[0];
        } else if (m.requestNo) {
            const res = await sql.query`
                SELECT TOP 1 WorkflowNo, CreatedByEmail, CreatedByName, CreatedByCompanyName,
                       CreatedByDivisionName, RequestNo, CustomerName, QuoteNumber, QuoteRef
                FROM QuoteApprovalSteps
                WHERE QuoteId IS NULL
                  AND DraftQuoteId IS NULL
                  AND LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${m.requestNo}))
                  AND LOWER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) = LOWER(LTRIM(RTRIM(${m.customerName})))
                  AND LTRIM(RTRIM(ISNULL(LeadJobName, N''))) = LTRIM(RTRIM(${m.leadJobName}))
                  AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${m.ownJob}))
                ORDER BY ID ASC
            `;
            row = res.recordset?.[0];
        }
        if (!row) return empty;
        return {
            workflowNo: String(row.WorkflowNo || '').trim(),
            createdByEmail: normalizeApprovalEmail(row.CreatedByEmail),
            createdByName: String(row.CreatedByName || '').trim(),
            createdByCompanyName: String(row.CreatedByCompanyName || '').trim(),
            createdByDivisionName: String(row.CreatedByDivisionName || '').trim(),
            requestNo: String(row.RequestNo || m.requestNo || '').trim(),
            customerName: String(row.CustomerName || m.customerName || '').trim(),
            quoteNumber: String(row.QuoteNumber || m.quoteNumber || '').trim(),
            quoteRef: String(row.QuoteRef || deriveQuoteRef(row.QuoteNumber || m.quoteNumber) || '').trim(),
        };
    } catch (e) {
        console.warn('[quoteApprovalSteps] fetchExistingWorkflowMeta:', e.message);
        return empty;
    }
}

async function fetchExistingCreatedByEmail(ctx) {
    const meta = await fetchExistingWorkflowMeta(ctx);
    return meta.createdByEmail || '';
}

async function allocateNextWorkflowNo() {
    const WORKFLOW_NO_START = 9;
    const year = new Date().getFullYear();
    const prefix = `WFQ-${year}-`;
    try {
        const res = await sql.query`
            SELECT WorkflowNo
            FROM QuoteApprovalSteps
            WHERE WorkflowNo LIKE ${prefix + '%'}
        `;
        let maxSeq = WORKFLOW_NO_START - 1;
        for (const row of res.recordset || []) {
            const m = String(row.WorkflowNo || '').trim().match(/-(\d+)$/);
            if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
        }
        const seq = maxSeq >= WORKFLOW_NO_START ? maxSeq + 1 : WORKFLOW_NO_START;
        return `${prefix}${seq}`;
    } catch (e) {
        console.warn('[quoteApprovalSteps] allocateNextWorkflowNo:', e.message);
        return `${prefix}${WORKFLOW_NO_START}`;
    }
}

async function resolveApprovalCreatorProfile(email) {
    const norm = normalizeApprovalEmail(email);
    if (!norm) {
        return { email: '', fullName: '', companyName: '', divisionName: '' };
    }
    try {
        const userRes = await sql.query`
            SELECT TOP 1 FullName, Department
            FROM Master_ConcernedSE
            WHERE LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = ${norm}
        `;
        const fullName = String(userRes.recordset?.[0]?.FullName || '').trim();
        const department = String(userRes.recordset?.[0]?.Department || '').trim();
        let companyName = '';
        let divisionName = department;
        if (department) {
            const safeDept = department.replace(/%/g, '');
            const mefRes = await sql.query`
                SELECT TOP 1 CompanyName, DepartmentName, ItemName
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) <> N''
                  AND (
                    LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${department}))
                    OR LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${department}))
                    OR LTRIM(RTRIM(ItemName)) LIKE ${'%' + safeDept + '%'}
                    OR LTRIM(RTRIM(DepartmentName)) LIKE ${'%' + safeDept + '%'}
                  )
                ORDER BY CASE
                    WHEN LTRIM(RTRIM(ItemName)) = LTRIM(RTRIM(${department})) THEN 0
                    WHEN LTRIM(RTRIM(DepartmentName)) = LTRIM(RTRIM(${department})) THEN 1
                    ELSE 2 END
            `;
            const mef = mefRes.recordset?.[0];
            if (mef) {
                companyName = String(mef.CompanyName || '').trim();
                divisionName = String(mef.DepartmentName || mef.ItemName || department).trim();
            }
        }
        return { email: norm, fullName, companyName, divisionName };
    } catch (e) {
        console.warn('[quoteApprovalSteps] resolveApprovalCreatorProfile:', e.message);
        return { email: norm, fullName: '', companyName: '', divisionName: '' };
    }
}

async function fetchApprovalMailContext({
    quoteId = null,
    draftQuoteId = null,
    meta = {},
    subjectOverride = '',
    projectNameOverride = '',
}) {
    const wf = await fetchExistingWorkflowMeta({ quoteId, draftQuoteId, meta });
    let subject = String(subjectOverride || '').trim();
    let quoteRef = wf.quoteNumber || wf.quoteRef || '';

    try {
        if (quoteId) {
            const qRes = await sql.query`
                SELECT TOP 1 Subject, QuoteNumber FROM EnquiryQuotes WHERE ID = ${quoteId}
            `;
            const q = qRes.recordset?.[0];
            if (q) {
                if (!subject) subject = String(q.Subject || '').trim();
                if (!quoteRef) quoteRef = String(q.QuoteNumber || '').trim();
            }
        } else if (draftQuoteId) {
            const dRes = await sql.query`
                SELECT TOP 1 Subject, QuoteNumber FROM EnquiryQuotesDraft WHERE ID = ${draftQuoteId}
            `;
            const d = dRes.recordset?.[0];
            if (d) {
                if (!subject) subject = String(d.Subject || '').trim();
                if (!quoteRef) quoteRef = String(d.QuoteNumber || '').trim();
            }
        }
    } catch (e) {
        console.warn('[quoteApprovalSteps] fetchApprovalMailContext quote lookup:', e.message);
    }

    let projectName = String(projectNameOverride || '').trim();
    const rn = wf.requestNo || String(meta.requestNo || '').trim();
    if (!projectName && rn) {
        try {
            const enqRes = await sql.query`
                SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${rn}
            `;
            projectName = String(enqRes.recordset?.[0]?.ProjectName || '').trim();
        } catch {
            projectName = '';
        }
    }

    const steps = await fetchApprovalStepsForMailContext({ quoteId, draftQuoteId, meta });
    const hierarchyPath = buildApprovalHierarchyPath(steps);

    const dash = (v) => (String(v || '').trim() || '—');
    return {
        workflowNo: dash(wf.workflowNo),
        enquiryNo: dash(rn),
        projectName: dash(projectName),
        customerName: dash(wf.customerName || meta.customerName),
        quoteRef: dash(quoteRef),
        subject: dash(subject),
        companyName: dash(wf.createdByCompanyName),
        divisionName: dash(wf.createdByDivisionName),
        approvalSeeker: dash(wf.createdByName),
        hierarchyPath: dash(hierarchyPath),
    };
}

/** Creator + all approvers (distinct) for final approval completion email. */
function buildApprovalCompletionRecipientEmails(steps = [], createdByEmail = '') {
    const emails = new Set();
    const creator = normalizeApprovalEmail(createdByEmail);
    if (creator) emails.add(creator);
    for (const s of steps || []) {
        const em = normalizeApprovalEmail(s.approverEmail);
        if (em) emails.add(em);
    }
    return Array.from(emails);
}

async function resolveCreatorEmailForRequest(requestNo, createdByEmail = '') {
    const direct = normalizeApprovalEmail(createdByEmail);
    if (direct) return direct;
    const rn = String(requestNo || '').trim();
    if (!rn) return '';
    try {
        const enqRes = await sql.query`
            SELECT TOP 1 CreatedBy FROM EnquiryMaster WHERE RequestNo = ${rn}
        `;
        const createdBy = String(enqRes.recordset?.[0]?.CreatedBy || '').trim();
        if (!createdBy) return '';
        if (createdBy.includes('@')) return normalizeApprovalEmail(createdBy);
        const seRes = await sql.query`
            SELECT TOP 1 EmailId
            FROM Master_ConcernedSE
            WHERE UPPER(LTRIM(RTRIM(ISNULL(FullName, N'')))) = UPPER(LTRIM(RTRIM(${createdBy})))
              AND EmailId IS NOT NULL
              AND LTRIM(RTRIM(EmailId)) <> N''
        `;
        return normalizeApprovalEmail(seRes.recordset?.[0]?.EmailId);
    } catch (e) {
        console.warn('[quoteApprovalSteps] resolveCreatorEmailForRequest:', e.message);
        return '';
    }
}

async function fetchApprovalCompletionRecipients(steps = [], { createdByEmail = '', requestNo = '' } = {}) {
    let creator = normalizeApprovalEmail(createdByEmail);
    if (!creator) {
        creator = await resolveCreatorEmailForRequest(requestNo, '');
    }
    return buildApprovalCompletionRecipientEmails(steps, creator);
}

async function replaceApprovalSteps({
    quoteId = null,
    draftQuoteId = null,
    meta = {},
    steps = [],
    createdByEmail = null,
}) {
    let qId = quoteId && Number.isFinite(Number(quoteId)) ? Number(quoteId) : null;
    let dId = draftQuoteId && Number.isFinite(Number(draftQuoteId)) ? Number(draftQuoteId) : null;
    let m = normalizeQuoteMeta(meta);
    if (!m.requestNo) throw new Error('requestNo is required');

    if (qId) {
        dId = null;
        const qRes = await sql.query`
            SELECT TOP 1 ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, QuoteNo, RevisionNo
            FROM EnquiryQuotes
            WHERE ID = ${qId}
        `;
        const q = qRes.recordset?.[0];
        if (!q) throw new Error('Saved quote revision not found');
        m = normalizeQuoteMeta({
            requestNo: q.RequestNo || m.requestNo,
            customerName: q.ToName || m.customerName,
            leadJobName: q.LeadJob || m.leadJobName,
            ownJob: q.OwnJob || m.ownJob,
            quoteNumber: q.QuoteNumber || m.quoteNumber,
            quoteNo: q.QuoteNo ?? m.quoteNo,
            revisionNo: q.RevisionNo ?? m.revisionNo,
        });
    }

    const normalizedSteps = (Array.isArray(steps) ? steps : [])
        .map((s, i) => ({
            sequence: Number(s.sequence ?? i + 1),
            approverEmail: normalizeApprovalEmail(s.approverEmail),
            approverName: String(s.approverName || '').trim(),
            approverDesignation: String(s.approverDesignation || '').trim(),
            status: ['approved', 'rejected'].includes(String(s.status || '').toLowerCase())
                ? String(s.status).toLowerCase()
                : 'pending',
            actionAt: s.actionAt || null,
            comments: String(s.comments || '').trim(),
            digitalSignatureJson: s.digitalSignatureJson || null,
        }))
        .filter((s) => s.approverName || s.approverEmail)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s, i) => ({ ...s, sequence: i + 1 }));

    const quoteRef = deriveQuoteRef(m.quoteNumber) || m.quoteRef || '';
    const now = new Date();

    const isNewWorkflow = !!normalizeApprovalEmail(createdByEmail);
    const existingMeta = isNewWorkflow
        ? null
        : await fetchExistingWorkflowMeta({ quoteId: qId, draftQuoteId: dId, meta: m });

    let creatorEmail = normalizeApprovalEmail(createdByEmail || meta.createdByEmail);
    let workflowNo = existingMeta?.workflowNo || '';
    let creatorName = existingMeta?.createdByName || '';
    let creatorCompany = existingMeta?.createdByCompanyName || '';
    let creatorDivision = existingMeta?.createdByDivisionName || '';

    if (isNewWorkflow) {
        workflowNo = await allocateNextWorkflowNo();
        const profile = await resolveApprovalCreatorProfile(createdByEmail);
        creatorEmail = profile.email || creatorEmail;
        creatorName = profile.fullName || creatorName;
        creatorCompany = profile.companyName || creatorCompany;
        creatorDivision = profile.divisionName || creatorDivision;
    } else if (!creatorEmail) {
        creatorEmail = existingMeta?.createdByEmail || '';
    }

    if (qId) {
        await sql.query`DELETE FROM QuoteApprovalSteps WHERE QuoteId = ${qId}`;
    } else if (dId) {
        await sql.query`
            DELETE FROM QuoteApprovalSteps
            WHERE DraftQuoteId = ${dId}
              AND (QuoteId IS NULL OR QuoteId = 0)
        `;
    } else {
        await sql.query`
            DELETE FROM QuoteApprovalSteps
            WHERE QuoteId IS NULL
              AND DraftQuoteId IS NULL
              AND LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${m.requestNo}))
              AND LOWER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) = LOWER(LTRIM(RTRIM(${m.customerName})))
              AND LTRIM(RTRIM(ISNULL(LeadJobName, N''))) = LTRIM(RTRIM(${m.leadJobName}))
              AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${m.ownJob}))
        `;
    }

    for (const step of normalizedSteps) {
        const statusDb =
            step.status === 'approved' ? 'Approved' : step.status === 'rejected' ? 'Rejected' : 'Pending';
        const approvedAt = step.actionAt ? new Date(step.actionAt) : null;
        await sql.query`
            INSERT INTO QuoteApprovalSteps (
                QuoteId, DraftQuoteId, RequestNo, LeadJobName, OwnJob, CustomerName,
                QuoteNo, RevisionNo, QuoteRef, QuoteNumber,
                ApproverEmail, ApproverName, ApproverDesignation, ApproverSequence,
                Status, ApprovedAt, Comments, ApproverDigitalSignatureJson,
                WorkflowNo, CreatedByEmail, CreatedByName, CreatedByCompanyName, CreatedByDivisionName,
                CreatedAt, UpdatedAt
            )
            VALUES (
                ${qId || null},
                ${dId || null},
                ${m.requestNo},
                ${m.leadJobName || null},
                ${m.ownJob || null},
                ${m.customerName || null},
                ${Number.isFinite(m.quoteNo) ? m.quoteNo : null},
                ${Number.isFinite(m.revisionNo) ? m.revisionNo : null},
                ${quoteRef || null},
                ${m.quoteNumber || null},
                ${step.approverEmail || null},
                ${step.approverName},
                ${step.approverDesignation || null},
                ${step.sequence},
                ${statusDb},
                ${approvedAt},
                ${step.comments || null},
                ${step.digitalSignatureJson || null},
                ${workflowNo || null},
                ${creatorEmail || null},
                ${creatorName || null},
                ${creatorCompany || null},
                ${creatorDivision || null},
                ${now},
                ${now}
            )
        `;
    }

    return { steps: normalizedSteps, workflowNo };
}

async function linkDraftStepsToQuote(draftQuoteId, quoteId, quoteRow = {}) {
    if (!draftQuoteId || !quoteId) return;
    const m = normalizeQuoteMeta(quoteRow);
    const quoteRef = m.quoteRef || deriveQuoteRef(m.quoteNumber);
    await sql.query`
        UPDATE QuoteApprovalSteps
        SET QuoteId = ${quoteId},
            QuoteNo = ${Number.isFinite(m.quoteNo) ? m.quoteNo : null},
            RevisionNo = ${Number.isFinite(m.revisionNo) ? m.revisionNo : null},
            QuoteRef = ${quoteRef || null},
            QuoteNumber = ${m.quoteNumber || null},
            UpdatedAt = ${new Date()}
        WHERE DraftQuoteId = ${draftQuoteId}
          AND (QuoteId IS NULL OR QuoteId = 0)
    `;
}


function mapPendingApprovalListRow(row) {
    return {
        quoteId: row.QuoteId || row.ResolvedQuoteId || null,
        draftQuoteId: row.DraftQuoteId || row.ResolvedDraftQuoteId || null,
        stepId: row.StepId,
        approverSequence: row.ApproverSequence,
        requestNo: row.RequestNo,
        leadJobName: row.LeadJobName,
        ownJob: row.OwnJob,
        customerName: row.CustomerName || row.EnquiryCustomerName,
        quoteNo: row.QuoteNo,
        revisionNo: row.RevisionNo,
        quoteRef: row.QuoteRef,
        quoteNumber: row.QuoteNumber || row.ResolvedQuoteNumber || null,
        subject: row.Subject || row.ResolvedSubject || null,
        quoteDate: row.QuoteDate || row.ResolvedQuoteDate || null,
        projectName: row.ProjectName,
        dueDate: row.DueDate,
        consultantName: row.ConsultantName,
        workflowNo: String(row.WorkflowNo || '').trim(),
        approvalStatus: String(row.ApprovalStatus || row.approvalStatus || '').trim(),
        reasonForRevision: String(row.ReasonForRevision || row.reasonForRevision || '').trim(),
    };
}

function isScopeOnlyApprovalStepRow(row) {
    const quoteId = row?.QuoteId;
    const draftId = row?.DraftQuoteId;
    return (
        (quoteId == null || quoteId === 0) &&
        (draftId == null || draftId === 0) &&
        !!String(row?.RequestNo || '').trim()
    );
}

async function resolveSavedQuoteMetaFromRow(quoteRow) {
    if (!quoteRow?.ID) return null;
    const quoteNumber = String(quoteRow.QuoteNumber || '').trim();
    return {
        quoteId: quoteRow.ID,
        draftQuoteId: null,
        quoteNumber,
        quoteRef: deriveQuoteRef(quoteNumber),
        subject: quoteRow.Subject || null,
        quoteDate: quoteRow.QuoteDate || null,
        quoteNo: quoteRow.QuoteNo != null ? Number(quoteRow.QuoteNo) : null,
        revisionNo: quoteRow.RevisionNo != null ? Number(quoteRow.RevisionNo) : null,
    };
}

async function fetchSavedQuoteByNumber(requestNo, quoteNumber) {
    const rn = String(requestNo || '').trim();
    const qn = String(quoteNumber || '').trim();
    if (!rn || !qn) return null;
    const quoteRes = await sql.query`
        SELECT TOP 1 ID, QuoteNumber, Subject, QuoteDate, QuoteNo, RevisionNo, RequestNo, ToName, LeadJob, OwnJob
        FROM EnquiryQuotes
        WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${rn}))
          AND LTRIM(RTRIM(QuoteNumber)) = LTRIM(RTRIM(${qn}))
        ORDER BY ID DESC
    `;
    return quoteRes.recordset?.[0] || null;
}

/** Resolve preview target for pending rows — saved EnquiryQuotes only (exact quote ref). */
async function resolveScopeApprovalStepTargets(row) {
    const requestNo = String(row?.RequestNo || '').trim();
    const storedQuoteNumber = String(row?.QuoteNumber || '').trim();
    const storedQuoteId = row?.QuoteId && Number(row.QuoteId) > 0 ? Number(row.QuoteId) : null;

    if (storedQuoteId) {
        const quoteRes = await sql.query`
            SELECT TOP 1 ID, QuoteNumber, Subject, QuoteDate, QuoteNo, RevisionNo
            FROM EnquiryQuotes
            WHERE ID = ${storedQuoteId}
        `;
        const resolved = await resolveSavedQuoteMetaFromRow(quoteRes.recordset?.[0]);
        if (resolved) {
            return {
                quoteId: resolved.quoteId,
                draftQuoteId: null,
                quoteNumber: resolved.quoteNumber,
                subject: resolved.subject,
                quoteDate: resolved.quoteDate,
            };
        }
    }

    if (storedQuoteNumber && requestNo) {
        const quote = await fetchSavedQuoteByNumber(requestNo, storedQuoteNumber);
        const resolved = await resolveSavedQuoteMetaFromRow(quote);
        if (resolved) {
            if (isScopeOnlyApprovalStepRow(row)) {
                const customerName = String(row?.CustomerName || '').trim();
                const leadJobName = String(row?.LeadJobName || '').trim();
                const ownJob = String(row?.OwnJob || '').trim();
                const quoteRef = deriveQuoteRef(resolved.quoteNumber);
                await sql.query`
                    UPDATE QuoteApprovalSteps
                    SET QuoteId = ${resolved.quoteId},
                        DraftQuoteId = NULL,
                        QuoteNo = ${Number.isFinite(resolved.quoteNo) ? resolved.quoteNo : null},
                        RevisionNo = ${Number.isFinite(resolved.revisionNo) ? resolved.revisionNo : null},
                        QuoteRef = ${quoteRef || null},
                        QuoteNumber = ${resolved.quoteNumber || null},
                        UpdatedAt = ${new Date()}
                    WHERE (QuoteId IS NULL OR QuoteId = 0)
                      AND LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${requestNo}))
                      AND LOWER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) =
                          LOWER(LTRIM(RTRIM(${customerName})))
                      AND LTRIM(RTRIM(ISNULL(LeadJobName, N''))) = LTRIM(RTRIM(${leadJobName}))
                      AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${ownJob}))
                      AND (
                            LTRIM(RTRIM(ISNULL(QuoteNumber, N''))) = LTRIM(RTRIM(${storedQuoteNumber}))
                            OR LTRIM(RTRIM(ISNULL(QuoteNumber, N''))) = N''
                      )
                `;
            }
            return {
                quoteId: resolved.quoteId,
                draftQuoteId: null,
                quoteNumber: resolved.quoteNumber,
                subject: resolved.subject,
                quoteDate: resolved.quoteDate,
            };
        }
    }

    return {
        quoteId: storedQuoteId,
        draftQuoteId: null,
        quoteNumber: storedQuoteNumber || null,
        subject: row?.Subject || null,
        quoteDate: row?.QuoteDate || null,
    };
}

/** Resolve quote/draft ids + meta before persisting approval steps on Send for Approval. */
async function resolveApprovalPersistContext({
    quoteId = null,
    draftQuoteId = null,
    requestNo = '',
    customerName = '',
    leadJobName = '',
    ownJob = '',
    quoteNumber = '',
    quoteNo = null,
    revisionNo = null,
}) {
    let qId = quoteId && Number.isFinite(Number(quoteId)) ? Number(quoteId) : null;
    let dId = draftQuoteId && Number.isFinite(Number(draftQuoteId)) ? Number(draftQuoteId) : null;

    const baseMeta = normalizeQuoteMeta({
        requestNo,
        customerName,
        leadJobName,
        ownJob,
        quoteNumber,
        quoteNo,
        revisionNo,
    });

    if (dId) {
        const draftRes = await sql.query`
            SELECT TOP 1 ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, QuoteNo, RevisionNo, Subject
            FROM EnquiryQuotesDraft
            WHERE ID = ${dId}
        `;
        const row = draftRes.recordset?.[0];
        if (row) {
            return {
                quoteId: null,
                draftQuoteId: row.ID,
                meta: normalizeQuoteMeta({
                    requestNo: row.RequestNo || baseMeta.requestNo,
                    customerName: row.ToName || baseMeta.customerName,
                    leadJobName: row.LeadJob || baseMeta.leadJobName,
                    ownJob: row.OwnJob || baseMeta.ownJob,
                    quoteNumber: row.QuoteNumber || baseMeta.quoteNumber,
                    quoteNo: row.QuoteNo ?? baseMeta.quoteNo,
                    revisionNo: row.RevisionNo ?? baseMeta.revisionNo,
                }),
            };
        }
    }

    if (qId) {
        const quoteRes = await sql.query`
            SELECT TOP 1 ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, QuoteNo, RevisionNo, Subject
            FROM EnquiryQuotes
            WHERE ID = ${qId}
        `;
        const row = quoteRes.recordset?.[0];
        if (row) {
            return {
                quoteId: row.ID,
                draftQuoteId: null,
                meta: normalizeQuoteMeta({
                    requestNo: row.RequestNo || baseMeta.requestNo,
                    customerName: row.ToName || baseMeta.customerName,
                    leadJobName: row.LeadJob || baseMeta.leadJobName,
                    ownJob: row.OwnJob || baseMeta.ownJob,
                    quoteNumber: row.QuoteNumber || baseMeta.quoteNumber,
                    quoteNo: row.QuoteNo ?? baseMeta.quoteNo,
                    revisionNo: row.RevisionNo ?? baseMeta.revisionNo,
                }),
            };
        }
    }

    if (baseMeta.requestNo && baseMeta.customerName) {
        const draftRes = await sql.query`
            SELECT TOP 1 ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, QuoteNo, RevisionNo
            FROM EnquiryQuotesDraft
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${baseMeta.requestNo}))
              AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(${baseMeta.customerName})))
              AND (
                    (${baseMeta.leadJobName} = N'' AND ${baseMeta.ownJob} = N'')
                    OR LTRIM(RTRIM(ISNULL(LeadJob, N''))) = LTRIM(RTRIM(${baseMeta.leadJobName}))
                    OR LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${baseMeta.ownJob}))
                  )
            ORDER BY ID DESC
        `;
        const draft = draftRes.recordset?.[0];
        if (draft?.ID) {
            return {
                quoteId: null,
                draftQuoteId: draft.ID,
                meta: normalizeQuoteMeta({
                    requestNo: draft.RequestNo || baseMeta.requestNo,
                    customerName: draft.ToName || baseMeta.customerName,
                    leadJobName: draft.LeadJob || baseMeta.leadJobName,
                    ownJob: draft.OwnJob || baseMeta.ownJob,
                    quoteNumber: draft.QuoteNumber || baseMeta.quoteNumber,
                    quoteNo: draft.QuoteNo ?? baseMeta.quoteNo,
                    revisionNo: draft.RevisionNo ?? baseMeta.revisionNo,
                }),
            };
        }

        const quoteRes = await sql.query`
            SELECT TOP 1 ID, RequestNo, ToName, LeadJob, OwnJob, QuoteNumber, QuoteNo, RevisionNo
            FROM EnquiryQuotes
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${baseMeta.requestNo}))
              AND LOWER(LTRIM(RTRIM(ISNULL(ToName, N'')))) = LOWER(LTRIM(RTRIM(${baseMeta.customerName})))
              AND (
                    (${baseMeta.leadJobName} = N'' AND ${baseMeta.ownJob} = N'')
                    OR LTRIM(RTRIM(ISNULL(LeadJob, N''))) = LTRIM(RTRIM(${baseMeta.leadJobName}))
                    OR LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${baseMeta.ownJob}))
                  )
            ORDER BY ID DESC
        `;
        const quote = quoteRes.recordset?.[0];
        if (quote?.ID) {
            return {
                quoteId: quote.ID,
                draftQuoteId: null,
                meta: normalizeQuoteMeta({
                    requestNo: quote.RequestNo || baseMeta.requestNo,
                    customerName: quote.ToName || baseMeta.customerName,
                    leadJobName: quote.LeadJob || baseMeta.leadJobName,
                    ownJob: quote.OwnJob || baseMeta.ownJob,
                    quoteNumber: quote.QuoteNumber || baseMeta.quoteNumber,
                    quoteNo: quote.QuoteNo ?? baseMeta.quoteNo,
                    revisionNo: quote.RevisionNo ?? baseMeta.revisionNo,
                }),
            };
        }
    }

    return { quoteId: qId, draftQuoteId: dId, meta: baseMeta };
}

async function fetchQuoteApprovalRollupStatusMap(quoteIds) {
    const ids = [...new Set((quoteIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!ids.length) return new Map();
    const idList = ids.join(',');
    let result;
    try {
        result = await sql.query(`
        SELECT QuoteId, Status, ApproverSequence, ID
        FROM QuoteApprovalSteps
        WHERE QuoteId IN (${idList})
        ORDER BY QuoteId ASC, ApproverSequence ASC, ID ASC
    `);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return new Map();
        }
        throw err;
    }
    const byQuote = new Map();
    for (const row of result.recordset || []) {
        const qid = Number(row.QuoteId);
        if (!byQuote.has(qid)) byQuote.set(qid, []);
        byQuote.get(qid).push(mapDbRowToStep(row));
    }
    const statusMap = new Map();
    for (const qid of ids) {
        const steps = byQuote.get(qid) || [];
        if (steps.length) {
            statusMap.set(qid, deriveWorkflowRollupStatusLabel(steps));
            continue;
        }
        const jsonRes = await sql.query`
            SELECT TOP 1 ApprovalWorkflowJson
            FROM EnquiryQuotes
            WHERE ID = ${qid}
        `;
        const jsonRaw = jsonRes.recordset?.[0]?.ApprovalWorkflowJson;
        const parsed = parseApprovalWorkflowJson(jsonRaw);
        statusMap.set(qid, deriveWorkflowRollupStatusLabel(parsed));
    }
    return statusMap;
}

async function enrichPendingApprovalRows(rows) {
    const resolvedBatch = await Promise.all(
        (rows || []).map(async (row) => ({
            row,
            resolved: await resolveScopeApprovalStepTargets(row),
        }))
    );
    const quoteIds = resolvedBatch
        .map(({ row, resolved }) => Number(row.QuoteId || resolved.quoteId))
        .filter((id) => Number.isFinite(id) && id > 0);
    const statusMap = await fetchQuoteApprovalRollupStatusMap(quoteIds);

    const out = [];
    for (const { row, resolved } of resolvedBatch) {
        const quoteId = Number(row.QuoteId || resolved.quoteId) || null;
        out.push(
            mapPendingApprovalListRow({
                ...row,
                QuoteId: row.QuoteId || resolved.quoteId,
                DraftQuoteId: row.DraftQuoteId || resolved.draftQuoteId,
                ResolvedQuoteId: resolved.quoteId,
                ResolvedDraftQuoteId: resolved.draftQuoteId,
                ResolvedQuoteNumber: resolved.quoteNumber,
                ResolvedSubject: resolved.subject,
                ResolvedQuoteDate: resolved.quoteDate,
                ApprovalStatus: quoteId ? statusMap.get(quoteId) || '' : '',
            })
        );
    }
    return out;
}

/** Attach ListApprovalStatus to quote list rows (Quote Search on Approvals page). */
async function enrichQuoteListRowsWithApprovalStatus(rows) {
    if (!Array.isArray(rows) || !rows.length) return rows || [];
    try {
        return await enrichQuoteListRowsWithApprovalStatusInner(rows);
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) {
            return rows;
        }
        throw err;
    }
}

async function enrichQuoteListRowsWithApprovalStatusInner(rows) {
    const quoteIdByRowKey = new Map();
    const quoteIds = new Set();

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const pv = Number(row?.ListPendingPvId ?? row?.listpendingpvid);
        if (Number.isFinite(pv) && pv > 0) {
            quoteIdByRowKey.set(String(i), pv);
            quoteIds.add(pv);
            continue;
        }
        const rn = String(row?.RequestNo || '').trim();
        const refRaw = String(row?.ListQuoteRef || '').trim();
        const ref = refRaw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)[0] || '';
        if (rn && ref) {
            const quoteRes = await sql.query`
                SELECT TOP 1 ID
                FROM EnquiryQuotes
                WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${rn}))
                  AND LTRIM(RTRIM(QuoteNumber)) = LTRIM(RTRIM(${ref}))
                ORDER BY ID DESC
            `;
            const qid = Number(quoteRes.recordset?.[0]?.ID);
            if (Number.isFinite(qid) && qid > 0) {
                quoteIdByRowKey.set(String(i), qid);
                quoteIds.add(qid);
            }
        }
    }

    const statusMap = await fetchQuoteApprovalRollupStatusMap([...quoteIds]);
    return rows.map((row, i) => {
        const qid = quoteIdByRowKey.get(String(i));
        const status = qid ? String(statusMap.get(qid) || '').trim() : '';
        return { ...row, ListApprovalStatus: status };
    });
}

/** SQL fragment: user's own step is pending (parallel approval — no sequence gate). */
function buildActionablePendingStepSql(alias = 's') {
    return `
              AND LOWER(LTRIM(RTRIM(ISNULL(${alias}.Status, N'')))) = N'pending'`;
}

/** Exclude quotes where any approver on the same saved quote has rejected the workflow. */
function buildQuoteWorkflowNotRejectedSql(alias = 's') {
    return `
              AND NOT EXISTS (
                  SELECT 1
                  FROM QuoteApprovalSteps wfRej
                  WHERE wfRej.QuoteId = ${alias}.QuoteId
                    AND wfRej.QuoteId IS NOT NULL
                    AND wfRej.QuoteId > 0
                    AND LOWER(LTRIM(RTRIM(ISNULL(wfRej.Status, N'')))) = N'rejected'
              )`;
}

/** Exclude draft workflows where any step on the same draft was rejected. */
function buildDraftWorkflowNotRejectedSql(alias = 's') {
    return `
              AND NOT EXISTS (
                  SELECT 1
                  FROM QuoteApprovalSteps wfRej
                  WHERE wfRej.DraftQuoteId = ${alias}.DraftQuoteId
                    AND (wfRej.QuoteId IS NULL OR wfRej.QuoteId = 0)
                    AND LOWER(LTRIM(RTRIM(ISNULL(wfRej.Status, N'')))) = N'rejected'
              )`;
}

/** Rows in QuoteApprovalSteps assigned to this user with status Pending. */
async function countPendingApprovalsForUser(userEmail) {
    const email = normalizeApprovalEmail(userEmail);
    if (!email) return 0;
    const actionableSql = buildActionablePendingStepSql('s', 'quote');
    const notRejectedSql = buildQuoteWorkflowNotRejectedSql('s');
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    const result = await request.query(`
        SELECT COUNT(DISTINCT CONCAT(N'Q:', CAST(s.QuoteId AS NVARCHAR(20)))) AS cnt
        FROM QuoteApprovalSteps s
        WHERE s.QuoteId IS NOT NULL
          AND s.QuoteId > 0
          AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
          ${actionableSql}
          ${notRejectedSql}
    `);
    return Number(result.recordset?.[0]?.cnt) || 0;
}

async function fetchPendingApprovalsForUser(userEmail, { division = '' } = {}) {
    const email = normalizeApprovalEmail(userEmail);
    if (!email) return [];
    const divisionSql = buildApprovalDivisionFilterSql(division, 's');
    const actionableSql = buildActionablePendingStepSql('s', 'quote');
    const notRejectedSql = buildQuoteWorkflowNotRejectedSql('s');
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    const result = await request.query(`
        SELECT
            ranked.QuoteId,
            ranked.DraftQuoteId,
            ranked.StepId,
            ranked.ApproverSequence,
            ranked.RequestNo,
            ranked.LeadJobName,
            ranked.OwnJob,
            ranked.CustomerName,
            ranked.QuoteNo,
            ranked.RevisionNo,
            ranked.QuoteRef,
            ranked.QuoteNumber,
            ranked.Subject,
            ranked.QuoteDate,
            ranked.WorkflowNo,
            ranked.ProjectName,
            ranked.DueDate,
            ranked.ConsultantName,
            ranked.EnquiryCustomerName,
            ranked.ReasonForRevision
        FROM (
            SELECT
                s.QuoteId,
                s.DraftQuoteId,
                s.ID AS StepId,
                s.ApproverSequence,
                s.RequestNo,
                s.LeadJobName,
                s.OwnJob,
                s.CustomerName,
                s.QuoteNo,
                s.RevisionNo,
                s.QuoteRef,
                COALESCE(NULLIF(LTRIM(RTRIM(s.QuoteNumber)), N''), q.QuoteNumber) AS QuoteNumber,
                q.Subject AS Subject,
                q.QuoteDate AS QuoteDate,
                s.WorkflowNo AS WorkflowNo,
                em.ProjectName,
                em.DueDate,
                em.ConsultantName,
                em.CustomerName AS EnquiryCustomerName,
                q.ReasonForRevision AS ReasonForRevision,
                ROW_NUMBER() OVER (
                    PARTITION BY s.QuoteId
                    ORDER BY s.ApproverSequence ASC, s.ID ASC
                ) AS rn
            FROM QuoteApprovalSteps s
            INNER JOIN EnquiryQuotes q ON q.ID = s.QuoteId
            LEFT JOIN EnquiryMaster em ON LTRIM(RTRIM(em.RequestNo)) = LTRIM(RTRIM(s.RequestNo))
            WHERE s.QuoteId IS NOT NULL
              AND s.QuoteId > 0
              AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
              ${actionableSql}
              ${notRejectedSql}
              ${divisionSql}
        ) ranked
        WHERE ranked.rn = 1
        ORDER BY ranked.QuoteDate DESC, ranked.QuoteId DESC
    `);
    return enrichPendingApprovalRows(result.recordset || []);
}

function buildApprovedByMeListFilterSql(qRaw, dateFrom, dateTo, division = '') {
    const q = (qRaw || '').trim();
    const d1 = (dateFrom || '').trim();
    const d2 = (dateTo || '').trim();
    const div = String(division || '').trim();
    const lit = (s) => String(s || '').replace(/'/g, "''");
    const parts = [];
    if (q) {
        const qq = lit(q).toLowerCase();
        parts.push(`AND (
              CHARINDEX(N'${qq}', LOWER(CAST(s.RequestNo AS NVARCHAR(100)))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(em.ProjectName, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(s.CustomerName, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(em.CustomerName, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(em.ClientName, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(em.ConsultantName, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(s.QuoteNumber, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(q.QuoteNumber, N''))))) > 0
              OR CHARINDEX(N'${qq}', LOWER(LTRIM(RTRIM(ISNULL(s.WorkflowNo, N''))))) > 0
            )`);
    }
    if (d1) {
        parts.push(`AND CAST(COALESCE(s.ApprovedAt, q.QuoteDate) AS DATE) >= '${lit(d1)}'`);
    }
    if (d2) {
        parts.push(`AND CAST(COALESCE(s.ApprovedAt, q.QuoteDate) AS DATE) <= '${lit(d2)}'`);
    }
    if (div) {
        const dv = lit(div);
        parts.push(`AND (
              LTRIM(RTRIM(ISNULL(s.CreatedByDivisionName, N''))) = N'${dv}'
              OR LTRIM(RTRIM(ISNULL(s.OwnJob, N''))) = N'${dv}'
              OR LTRIM(RTRIM(ISNULL(s.LeadJobName, N''))) = N'${dv}'
            )`);
    }
    return parts.join('\n              ');
}

function buildApprovalDivisionFilterSql(division = '', alias = 's') {
    const div = String(division || '').trim();
    if (!div) return '';
    const lit = (s) => String(s || '').replace(/'/g, "''");
    const dv = lit(div);
    return `AND (
              LTRIM(RTRIM(ISNULL(${alias}.CreatedByDivisionName, N''))) = N'${dv}'
              OR LTRIM(RTRIM(ISNULL(${alias}.OwnJob, N''))) = N'${dv}'
              OR LTRIM(RTRIM(ISNULL(${alias}.LeadJobName, N''))) = N'${dv}'
            )`;
}

/** Quotes this user approved — filtered to accessible division when provided. */
async function fetchApprovedApprovalsByUser(userEmail, { q = '', dateFrom = '', dateTo = '', division = '' } = {}) {
    const email = normalizeApprovalEmail(userEmail);
    if (!email) return [];
    const filterSql = buildApprovedByMeListFilterSql(q, dateFrom, dateTo, division);
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    const result = await request.query(`
        SELECT
            ranked.QuoteId,
            ranked.DraftQuoteId,
            ranked.StepId,
            ranked.ApproverSequence,
            ranked.RequestNo,
            ranked.LeadJobName,
            ranked.OwnJob,
            ranked.CustomerName,
            ranked.QuoteNo,
            ranked.RevisionNo,
            ranked.QuoteRef,
            ranked.QuoteNumber,
            ranked.Subject,
            ranked.QuoteDate,
            ranked.ApprovedAt,
            ranked.WorkflowNo,
            ranked.ProjectName,
            ranked.DueDate,
            ranked.ConsultantName,
            ranked.EnquiryCustomerName,
            ranked.ReasonForRevision
        FROM (
            SELECT
                s.QuoteId,
                s.DraftQuoteId,
                s.ID AS StepId,
                s.ApproverSequence,
                s.RequestNo,
                s.LeadJobName,
                s.OwnJob,
                s.CustomerName,
                s.QuoteNo,
                s.RevisionNo,
                s.QuoteRef,
                COALESCE(NULLIF(LTRIM(RTRIM(s.QuoteNumber)), N''), q.QuoteNumber) AS QuoteNumber,
                q.Subject AS Subject,
                q.QuoteDate AS QuoteDate,
                s.ApprovedAt AS ApprovedAt,
                s.WorkflowNo AS WorkflowNo,
                em.ProjectName,
                em.DueDate,
                em.ConsultantName,
                em.CustomerName AS EnquiryCustomerName,
                q.ReasonForRevision AS ReasonForRevision,
                ROW_NUMBER() OVER (
                    PARTITION BY s.QuoteId
                    ORDER BY s.ApprovedAt DESC, s.ID DESC
                ) AS rn
            FROM QuoteApprovalSteps s
            INNER JOIN EnquiryQuotes q ON q.ID = s.QuoteId
            LEFT JOIN EnquiryMaster em ON LTRIM(RTRIM(em.RequestNo)) = LTRIM(RTRIM(s.RequestNo))
            WHERE s.QuoteId IS NOT NULL
              AND s.QuoteId > 0
              AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
              AND LOWER(LTRIM(RTRIM(ISNULL(s.Status, N'')))) = N'approved'
              ${filterSql}
        ) ranked
        WHERE ranked.rn = 1
        ORDER BY ranked.ApprovedAt DESC, ranked.QuoteDate DESC, ranked.QuoteId DESC
    `);
    return enrichPendingApprovalRows(result.recordset || []);
}

/** Quotes this user rejected — filtered to accessible division when provided. */
async function fetchRejectedApprovalsByUser(userEmail, { q = '', dateFrom = '', dateTo = '', division = '' } = {}) {
    const email = normalizeApprovalEmail(userEmail);
    if (!email) return [];
    const filterSql = buildApprovedByMeListFilterSql(q, dateFrom, dateTo, division);
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    const result = await request.query(`
        SELECT
            ranked.QuoteId,
            ranked.DraftQuoteId,
            ranked.StepId,
            ranked.ApproverSequence,
            ranked.RequestNo,
            ranked.LeadJobName,
            ranked.OwnJob,
            ranked.CustomerName,
            ranked.QuoteNo,
            ranked.RevisionNo,
            ranked.QuoteRef,
            ranked.QuoteNumber,
            ranked.Subject,
            ranked.QuoteDate,
            ranked.ApprovedAt,
            ranked.WorkflowNo,
            ranked.ProjectName,
            ranked.DueDate,
            ranked.ConsultantName,
            ranked.EnquiryCustomerName,
            ranked.ReasonForRevision
        FROM (
            SELECT
                s.QuoteId,
                s.DraftQuoteId,
                s.ID AS StepId,
                s.ApproverSequence,
                s.RequestNo,
                s.LeadJobName,
                s.OwnJob,
                s.CustomerName,
                s.QuoteNo,
                s.RevisionNo,
                s.QuoteRef,
                COALESCE(NULLIF(LTRIM(RTRIM(s.QuoteNumber)), N''), q.QuoteNumber) AS QuoteNumber,
                q.Subject AS Subject,
                q.QuoteDate AS QuoteDate,
                s.ApprovedAt AS ApprovedAt,
                s.WorkflowNo AS WorkflowNo,
                em.ProjectName,
                em.DueDate,
                em.ConsultantName,
                em.CustomerName AS EnquiryCustomerName,
                q.ReasonForRevision AS ReasonForRevision,
                ROW_NUMBER() OVER (
                    PARTITION BY s.QuoteId
                    ORDER BY s.ApprovedAt DESC, s.ID DESC
                ) AS rn
            FROM QuoteApprovalSteps s
            INNER JOIN EnquiryQuotes q ON q.ID = s.QuoteId
            LEFT JOIN EnquiryMaster em ON LTRIM(RTRIM(em.RequestNo)) = LTRIM(RTRIM(s.RequestNo))
            WHERE s.QuoteId IS NOT NULL
              AND s.QuoteId > 0
              AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
              AND LOWER(LTRIM(RTRIM(ISNULL(s.Status, N'')))) = N'rejected'
              ${filterSql}
        ) ranked
        WHERE ranked.rn = 1
        ORDER BY ranked.ApprovedAt DESC, ranked.QuoteDate DESC, ranked.QuoteId DESC
    `);
    return enrichPendingApprovalRows(result.recordset || []);
}

/** Quotes submitted for approval workflow — visible to approver, CC teammates, or ConcernedSE on enquiry. */
async function fetchApprovalWorkflowSearch(userEmail, { q = '', dateFrom = '', dateTo = '', division = '' } = {}) {
    const email = normalizeApprovalEmail(userEmail);
    if (!email) return [];
    const uEsc = email.replace(/'/g, "''");
    const uLocalEsc = ((email.split('@')[0] || '').trim()).replace(/'/g, "''");
    const visibilitySql = buildApprovalQuoteVisibleToUserSql('s.QuoteId', 's.RequestNo', uEsc, uLocalEsc);
    const filterSql = buildApprovedByMeListFilterSql(q, dateFrom, dateTo, division);
    const divisionSql = buildApprovalDivisionFilterSql(division, 's');
    const result = await sql.query(`
        SELECT
            ranked.QuoteId,
            ranked.DraftQuoteId,
            ranked.StepId,
            ranked.ApproverSequence,
            ranked.RequestNo,
            ranked.LeadJobName,
            ranked.OwnJob,
            ranked.CustomerName,
            ranked.QuoteNo,
            ranked.RevisionNo,
            ranked.QuoteRef,
            ranked.QuoteNumber,
            ranked.Subject,
            ranked.QuoteDate,
            ranked.ApprovedAt,
            ranked.WorkflowNo,
            ranked.ProjectName,
            ranked.DueDate,
            ranked.ConsultantName,
            ranked.EnquiryCustomerName,
            ranked.ReasonForRevision
        FROM (
            SELECT
                s.QuoteId,
                s.DraftQuoteId,
                s.ID AS StepId,
                s.ApproverSequence,
                s.RequestNo,
                s.LeadJobName,
                s.OwnJob,
                s.CustomerName,
                s.QuoteNo,
                s.RevisionNo,
                s.QuoteRef,
                COALESCE(NULLIF(LTRIM(RTRIM(s.QuoteNumber)), N''), q.QuoteNumber) AS QuoteNumber,
                q.Subject AS Subject,
                q.QuoteDate AS QuoteDate,
                s.ApprovedAt AS ApprovedAt,
                s.WorkflowNo AS WorkflowNo,
                em.ProjectName,
                em.DueDate,
                em.ConsultantName,
                em.CustomerName AS EnquiryCustomerName,
                q.ReasonForRevision AS ReasonForRevision,
                ROW_NUMBER() OVER (
                    PARTITION BY s.QuoteId
                    ORDER BY q.QuoteDate DESC, s.ID DESC
                ) AS rn
            FROM QuoteApprovalSteps s
            INNER JOIN EnquiryQuotes q ON q.ID = s.QuoteId
            LEFT JOIN EnquiryMaster em ON LTRIM(RTRIM(em.RequestNo)) = LTRIM(RTRIM(s.RequestNo))
            WHERE s.QuoteId IS NOT NULL
              AND s.QuoteId > 0
              AND ${visibilitySql}
              ${filterSql}
              ${divisionSql}
        ) ranked
        WHERE ranked.rn = 1
        ORDER BY ranked.QuoteDate DESC, ranked.QuoteId DESC
    `);
    return enrichPendingApprovalRows(result.recordset || []);
}

async function userHasActionableDraftApprovalStep(draftQuoteId, userEmail) {
    const email = normalizeApprovalEmail(userEmail);
    const id = Number(draftQuoteId);
    if (!email || !Number.isFinite(id)) return false;
    const actionableSql = buildActionablePendingStepSql('s', 'draft');
    const notRejectedSql = buildDraftWorkflowNotRejectedSql('s');
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    request.input('draftQuoteId', sql.Int, id);
    const result = await request.query(`
        SELECT TOP 1 s.ID
        FROM QuoteApprovalSteps s
        WHERE s.DraftQuoteId = @draftQuoteId
          AND (s.QuoteId IS NULL OR s.QuoteId = 0)
          AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
          ${actionableSql}
          ${notRejectedSql}
    `);
    return (result.recordset || []).length > 0;
}

async function userHasActionableQuoteApprovalStep(quoteId, userEmail) {
    const email = normalizeApprovalEmail(userEmail);
    const id = Number(quoteId);
    if (!email || !Number.isFinite(id)) return false;
    const actionableSql = buildActionablePendingStepSql('s', 'quote');
    const notRejectedSql = buildQuoteWorkflowNotRejectedSql('s');
    const request = new sql.Request();
    request.input('approverEmail', sql.NVarChar, email);
    request.input('quoteId', sql.Int, id);
    const result = await request.query(`
        SELECT TOP 1 s.ID
        FROM QuoteApprovalSteps s
        WHERE s.QuoteId = @quoteId
          AND LOWER(LTRIM(RTRIM(ISNULL(s.ApproverEmail, N'')))) = LOWER(LTRIM(RTRIM(@approverEmail)))
          ${actionableSql}
          ${notRejectedSql}
    `);
    return (result.recordset || []).length > 0;
}

async function recordQuoteApprovalAction(quoteId, stepSequence, action, actor, digitalSignatureJson = null) {
    const quoteRes = await sql.query`
        SELECT ID, RequestNo, QuoteNumber, QuoteNo, RevisionNo, LeadJob, OwnJob, ToName, ApprovalWorkflowJson
        FROM EnquiryQuotes
        WHERE ID = ${quoteId}
    `;
    if (!quoteRes.recordset.length) throw new Error('Quote not found');
    const quote = quoteRes.recordset[0];

    let steps = await fetchApprovalStepsByQuoteId(quoteId);
    if (!steps.length) {
        steps = parseApprovalWorkflowJson(quote.ApprovalWorkflowJson);
    }

    const nextSteps = applyApprovalAction(steps, stepSequence, action, actor);
    const target = nextSteps.find((s) => Number(s.sequence) === Number(stepSequence));
    if (!target) throw new Error('Approval step not found');

    let sigPayload = digitalSignatureJson;
    if (sigPayload && typeof sigPayload !== 'string') {
        sigPayload = JSON.stringify(sigPayload);
    }

    const stepsForTable = nextSteps.map((s) =>
        Number(s.sequence) === Number(stepSequence)
            ? {
                  ...s,
                  digitalSignatureJson: sigPayload,
              }
            : s
    );

    await replaceApprovalSteps({
        quoteId: Number(quoteId),
        meta: {
            requestNo: quote.RequestNo,
            leadJobName: quote.LeadJob,
            ownJob: quote.OwnJob,
            customerName: quote.ToName,
            quoteNo: quote.QuoteNo,
            revisionNo: quote.RevisionNo,
            quoteNumber: quote.QuoteNumber,
        },
        steps: stepsForTable,
    });

    const jsonStr = stepsToJson(nextSteps);
    await sql.query`
        UPDATE EnquiryQuotes
        SET ApprovalWorkflowJson = ${jsonStr}, UpdatedAt = ${new Date()}
        WHERE ID = ${quoteId}
    `;

    return nextSteps;
}

async function recordDraftQuoteApprovalAction(draftQuoteId, stepSequence, action, actor, digitalSignatureJson = null) {
    const draftRes = await sql.query`
        SELECT ID, RequestNo, QuoteNumber, QuoteNo, RevisionNo, LeadJob, OwnJob, ToName, ApprovalWorkflowJson
        FROM EnquiryQuotesDraft
        WHERE ID = ${draftQuoteId}
    `;
    if (!draftRes.recordset.length) throw new Error('Quote draft not found');
    const draft = draftRes.recordset[0];

    let steps = await fetchApprovalStepsByDraftId(draftQuoteId);
    if (!steps.length) {
        steps = parseApprovalWorkflowJson(draft.ApprovalWorkflowJson);
    }

    const nextSteps = applyApprovalAction(steps, stepSequence, action, actor);
    const target = nextSteps.find((s) => Number(s.sequence) === Number(stepSequence));
    if (!target) throw new Error('Approval step not found');

    let sigPayload = digitalSignatureJson;
    if (sigPayload && typeof sigPayload !== 'string') {
        sigPayload = JSON.stringify(sigPayload);
    }

    const stepsForTable = nextSteps.map((s) =>
        Number(s.sequence) === Number(stepSequence)
            ? {
                  ...s,
                  digitalSignatureJson: sigPayload,
              }
            : s
    );

    await replaceApprovalSteps({
        draftQuoteId: Number(draftQuoteId),
        meta: {
            requestNo: draft.RequestNo,
            leadJobName: draft.LeadJob,
            ownJob: draft.OwnJob,
            customerName: draft.ToName,
            quoteNo: draft.QuoteNo,
            revisionNo: draft.RevisionNo,
            quoteNumber: draft.QuoteNumber,
        },
        steps: stepsForTable,
    });

    const jsonStr = stepsToJson(nextSteps);
    await sql.query`
        UPDATE EnquiryQuotesDraft
        SET ApprovalWorkflowJson = ${jsonStr}, UpdatedAt = ${new Date()}
        WHERE ID = ${draftQuoteId}
    `;

    return nextSteps;
}

/** Emails for enquiry stakeholders in the quote division (Concerned SEs, division CC, approvers). */
async function fetchEnquiryDivisionStakeholderEmails(requestNo, ownJob, approvalSteps = []) {
    const emails = new Set();
    const rn = String(requestNo || '').trim();
    const ownJobTrim = String(ownJob || '').trim();
    const ownJobNorm = ownJobTrim.toLowerCase();
    if (!rn) return [];

    for (const s of approvalSteps || []) {
        const em = normalizeApprovalEmail(s.approverEmail);
        if (em) emails.add(em);
    }

    try {
        const seRes = await sql.query`
            SELECT m.EmailId, m.Department
            FROM ConcernedSE cs
            INNER JOIN Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            WHERE cs.RequestNo = ${rn}
              AND m.EmailId IS NOT NULL
              AND LTRIM(RTRIM(m.EmailId)) <> N''
        `;
        for (const row of seRes.recordset || []) {
            const em = normalizeApprovalEmail(row.EmailId);
            if (!em) continue;
            const dept = String(row.Department || '').trim().toLowerCase();
            if (!ownJobNorm || !dept || dept === ownJobNorm || dept.includes(ownJobNorm) || ownJobNorm.includes(dept)) {
                emails.add(em);
            }
        }
    } catch (e) {
        console.warn('[quoteApprovalSteps] ConcernedSE stakeholder emails:', e.message);
    }

    if (ownJobTrim) {
        try {
            const ccRes = await sql.query`
                SELECT TOP 1 CCMailIds
                FROM Master_EnquiryFor
                WHERE LTRIM(RTRIM(ISNULL(ItemName, N''))) = LTRIM(RTRIM(${ownJobTrim}))
                   OR LOWER(LTRIM(RTRIM(ISNULL(ItemName, N'')))) = ${ownJobNorm}
            `;
            const ccRaw = String(ccRes.recordset?.[0]?.CCMailIds || '');
            for (const part of ccRaw.split(/[;,]/)) {
                const em = normalizeApprovalEmail(part);
                if (em) emails.add(em);
            }
        } catch (e) {
            console.warn('[quoteApprovalSteps] division CC mails:', e.message);
        }
    }

    return Array.from(emails);
}

function mapScopeApprovalStepRow(row) {
    return {
        id: row.ID,
        sequence: row.ApproverSequence,
        approverEmail: row.ApproverEmail,
        approverName: row.ApproverName,
        approverDesignation: row.ApproverDesignation,
        status: String(row.Status || 'Pending').toLowerCase(),
        actionAt: row.ApprovedAt ? new Date(row.ApprovedAt).toISOString() : null,
        comments: String(row.Comments || '').trim(),
        digitalSignatureJson: row.ApproverDigitalSignatureJson,
    };
}

async function fetchMefBrandingByCompanyName(companyName, divisionName = '') {
    const name = String(companyName || '').trim();
    if (!name) return null;
    try {
        const escaped = name.replace(/[%_[\]]/g, '');
        const likeName = `%${escaped}%`;
        const res = await sql.query`
            SELECT TOP 20
                CompanyName, DepartmentName, ItemName, CompanyLogo, Address,
                Phone, FaxNo, CommonMailIds
            FROM Master_EnquiryFor
            WHERE LTRIM(RTRIM(ISNULL(CompanyName, N''))) <> N''
              AND (
                LTRIM(RTRIM(CompanyName)) = LTRIM(RTRIM(${name}))
                OR LTRIM(RTRIM(CompanyName)) LIKE ${likeName}
                OR ${name} LIKE '%' + LTRIM(RTRIM(CompanyName)) + '%'
              )
            ORDER BY CASE
                WHEN LTRIM(RTRIM(CompanyName)) = LTRIM(RTRIM(${name})) THEN 0
                ELSE 1 END,
                LEN(CompanyName) ASC
        `;
        const rows = res.recordset || [];
        if (!rows.length) return null;

        const norm = (v) =>
            String(v || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/\.+$/, '');
        const target = norm(name);
        const divTarget = norm(divisionName);

        let row = null;
        if (divTarget) {
            row =
                rows.find(
                    (r) =>
                        norm(r.DepartmentName) === divTarget || norm(r.ItemName) === divTarget
                ) || null;
        }
        if (!row) {
            row =
                rows.find((r) => norm(r.CompanyName) === target) ||
                rows.find((r) => {
                    const cn = norm(r.CompanyName);
                    return cn.includes(target) || target.includes(cn);
                }) ||
                rows[0];
        }

        const address = String(row.Address || '').trim();
        const emailRaw = String(row.CommonMailIds || '').trim();
        const email = emailRaw.includes(',') ? emailRaw.split(',')[0].trim() : emailRaw;

        return {
            name: String(row.CompanyName || name).trim(),
            logo: row.CompanyLogo ? String(row.CompanyLogo).replace(/\\/g, '/') : null,
            address,
            phone: String(row.Phone || '').trim(),
            fax: String(row.FaxNo || '').trim(),
            email,
        };
    } catch (e) {
        console.warn('[quoteApprovalSteps] fetchMefBrandingByCompanyName:', e.message);
        return null;
    }
}

async function fetchApprovalStepsApiPayload({ quoteId = null, draftQuoteId = null, meta = null } = {}) {
    let steps = [];
    let workflowNo = '';
    let wf = {
        workflowNo: '',
        createdByEmail: '',
        createdByName: '',
        createdByCompanyName: '',
        createdByDivisionName: '',
    };

    if (quoteId && Number.isFinite(Number(quoteId))) {
        steps = await fetchApprovalStepsByQuoteId(Number(quoteId));
        wf = await fetchExistingWorkflowMeta({ quoteId: Number(quoteId) });
        workflowNo = String(wf.workflowNo || '').trim();
    } else if (draftQuoteId && Number.isFinite(Number(draftQuoteId))) {
        steps = await fetchApprovalStepsByDraftId(Number(draftQuoteId));
        wf = await fetchExistingWorkflowMeta({ draftQuoteId: Number(draftQuoteId) });
        workflowNo = String(wf.workflowNo || '').trim();
    } else {
        const m = normalizeQuoteMeta(meta || {});
        if (!m.requestNo || !m.customerName) {
            return {
                steps: [],
                approvalRequestSent: false,
                workflowNo: null,
                createdByCompanyName: null,
                createdByDivisionName: null,
                createdByName: null,
                createdByEmail: null,
                creatorCompanyBranding: null,
            };
        }
        const result = await sql.query`
            SELECT *
            FROM QuoteApprovalSteps
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${m.requestNo}))
              AND LOWER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) = LOWER(LTRIM(RTRIM(${m.customerName})))
              AND LTRIM(RTRIM(ISNULL(LeadJobName, N''))) = LTRIM(RTRIM(${m.leadJobName}))
              AND LTRIM(RTRIM(ISNULL(OwnJob, N''))) = LTRIM(RTRIM(${m.ownJob}))
              AND QuoteId IS NULL
            ORDER BY ApproverSequence ASC, ID ASC
        `;
        steps = (result.recordset || []).map(mapScopeApprovalStepRow);
        wf = await fetchExistingWorkflowMeta({ meta: m });
        workflowNo = String(wf.workflowNo || '').trim();
    }

    const creatorCompanyName = String(wf.createdByCompanyName || '').trim();
    const creatorDivisionName = String(wf.createdByDivisionName || '').trim();
    const creatorCompanyBranding = creatorCompanyName
        ? await fetchMefBrandingByCompanyName(creatorCompanyName, creatorDivisionName)
        : null;

    return {
        steps,
        approvalRequestSent: !!workflowNo,
        workflowNo: workflowNo || null,
        createdByCompanyName: creatorCompanyName || null,
        createdByDivisionName: String(wf.createdByDivisionName || '').trim() || null,
        createdByName: String(wf.createdByName || '').trim() || null,
        createdByEmail: String(wf.createdByEmail || '').trim() || null,
        creatorCompanyBranding,
    };
}

/** Cross-division approvers may preview/approve quotes they are assigned on. */
async function userIsAssignedQuoteApproverForEnquiry(userEmail, requestNo, quoteId = null) {
    const email = normalizeApprovalEmail(userEmail);
    const rn = String(requestNo || '').trim();
    if (!email || !rn) return false;
    try {
        const qid = quoteId != null ? Number(quoteId) : null;
        if (Number.isFinite(qid) && qid > 0) {
            const byQuote = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM QuoteApprovalSteps
                WHERE QuoteId = ${qid}
                  AND LOWER(LTRIM(RTRIM(ISNULL(ApproverEmail, N'')))) = ${email}
            `;
            if ((byQuote.recordset || []).length > 0) return true;
        }
        const byEnquiry = await sql.query`
            SELECT TOP 1 1 AS ok
            FROM QuoteApprovalSteps
            WHERE LTRIM(RTRIM(RequestNo)) = LTRIM(RTRIM(${rn}))
              AND LOWER(LTRIM(RTRIM(ISNULL(ApproverEmail, N'')))) = ${email}
        `;
        return (byEnquiry.recordset || []).length > 0;
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) return false;
        throw err;
    }
}

/**
 * ConcernedSE on the enquiry when an approver in the workflow is a CCMailIds user for the viewer's division.
 * Lets division teammates preview cross-division quotes sent for approval to their CC coordinator.
 */
async function userHasApprovalWorkflowDivisionStakeholderAccess(userEmail, requestNo, quoteId = null) {
    const email = normalizeApprovalEmail(userEmail);
    const rn = String(requestNo || '').trim();
    if (!email || !rn) return false;

    const { resolvePricingAccessContext, userIsConcernedSeOnEnquiry } = require('./quotePricingAccess');
    const ctx = await resolvePricingAccessContext(userEmail);
    if (!ctx?.user) return false;

    const allowedBySe = await userIsConcernedSeOnEnquiry(ctx, requestNo);
    if (!allowedBySe) return false;

    const userDept = String(ctx.userDepartment || '').trim();
    if (!userDept) return false;

    const qid = quoteId != null ? Number(quoteId) : null;

    try {
        if (Number.isFinite(qid) && qid > 0) {
            const byQuote = await sql.query`
                SELECT TOP 1 1 AS ok
                FROM ConcernedSE cs
                INNER JOIN Master_ConcernedSE m
                  ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                INNER JOIN QuoteApprovalSteps ap ON ap.QuoteId = ${qid}
                INNER JOIN Master_EnquiryFor mef
                  ON LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(ISNULL(m.Department, N'')))
                WHERE LTRIM(RTRIM(cs.RequestNo)) = LTRIM(RTRIM(${rn}))
                  AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) = ${email}
                  AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = ${userDept}
                  AND (
                    REPLACE(',' + REPLACE(ISNULL(mef.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')
                      LIKE '%,' + LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) + ',%'
                    OR (
                        CHARINDEX('@', LOWER(LTRIM(RTRIM(ISNULL(ap.ApproverEmail, N''))))) > 0
                        AND REPLACE(',' + REPLACE(ISNULL(mef.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')
                          LIKE '%,' + LOWER(LTRIM(RTRIM(SUBSTRING(
                            LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))),
                            1,
                            CHARINDEX('@', LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))) - 1
                          )))) + ',%'
                    )
                  )
            `;
            return (byQuote.recordset || []).length > 0;
        }

        const byEnquiry = await sql.query`
            SELECT TOP 1 1 AS ok
            FROM ConcernedSE cs
            INNER JOIN Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
            INNER JOIN QuoteApprovalSteps ap
              ON LTRIM(RTRIM(ap.RequestNo)) = LTRIM(RTRIM(cs.RequestNo))
             AND ap.QuoteId IS NOT NULL
             AND ap.QuoteId > 0
            INNER JOIN Master_EnquiryFor mef
              ON LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = LTRIM(RTRIM(ISNULL(m.Department, N'')))
            WHERE LTRIM(RTRIM(cs.RequestNo)) = LTRIM(RTRIM(${rn}))
              AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(m.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) = ${email}
              AND LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) = ${userDept}
              AND (
                REPLACE(',' + REPLACE(ISNULL(mef.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')
                  LIKE '%,' + LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) + ',%'
                OR (
                    CHARINDEX('@', LOWER(LTRIM(RTRIM(ISNULL(ap.ApproverEmail, N''))))) > 0
                    AND REPLACE(',' + REPLACE(ISNULL(mef.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')
                      LIKE '%,' + LOWER(LTRIM(RTRIM(SUBSTRING(
                        LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))),
                        1,
                        CHARINDEX('@', LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(ap.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))) - 1
                      )))) + ',%'
                )
              )
        `;
        return (byEnquiry.recordset || []).length > 0;
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) return false;
        throw err;
    }
}

/** Direct approver, CC-mail teammate of any workflow approver, or ConcernedSE assigned on the enquiry. */
async function userHasApprovalWorkflowQuoteAccess(userEmail, requestNo, quoteId = null) {
    const email = normalizeApprovalEmail(userEmail);
    const rn = String(requestNo || '').trim();
    if (!email || !rn) return false;

    const uEsc = email.replace(/'/g, "''");
    const uLocalEsc = ((email.split('@')[0] || '').trim()).replace(/'/g, "''");
    const rnEsc = rn.replace(/'/g, "''");
    const qid = quoteId != null ? Number(quoteId) : null;
    const quoteFilter =
        Number.isFinite(qid) && qid > 0 ? `AND q.ID = ${qid}` : '';

    try {
        const visibilitySql = buildApprovalQuoteVisibleToUserSql('q.ID', 'q.RequestNo', uEsc, uLocalEsc);
        const result = await sql.query(`
            SELECT TOP 1 1 AS ok
            FROM EnquiryQuotes q
            WHERE LTRIM(RTRIM(q.RequestNo)) = LTRIM(RTRIM(N'${rnEsc}'))
              ${quoteFilter}
              AND ${visibilitySql}
        `);
        return (result.recordset || []).length > 0;
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) return false;
        throw err;
    }
}

function approverEmailMatchSql(apAlias, uEsc, uLocalEsc) {
    const email = `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${apAlias}.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
    let sql = `${email} = LOWER(LTRIM(N'${uEsc}'))`;
    if (uLocalEsc.length >= 2) {
        const local = `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${email}, 1, NULLIF(CHARINDEX('@', ${email}), 0) - 1), N' ', N''))))`;
        sql += ` OR ${local} = LOWER(LTRIM(N'${uLocalEsc}'))`;
    }
    return `(${sql})`;
}

function ccMailIdsContainsApproverSql(mefAlias, apAlias) {
    const ccCsv = `REPLACE(',' + REPLACE(ISNULL(${mefAlias}.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')`;
    const apEmail = `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${apAlias}.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
    const apLocal = `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${apEmail}, 1, NULLIF(CHARINDEX('@', ${apEmail}), 0) - 1), N' ', N''))))`;
    return `(
        ${ccCsv} LIKE '%,' + ${apEmail} + ',%'
        OR (${apLocal} <> N'' AND ${ccCsv} LIKE '%,' + ${apLocal} + ',%')
    )`;
}

function ccMailIdsContainsUserSql(mefAlias, uEsc, uLocalEsc) {
    const ccCsv = `REPLACE(',' + REPLACE(ISNULL(${mefAlias}.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')`;
    let sql = `${ccCsv} LIKE '%,' + LOWER(LTRIM(N'${uEsc}')) + ',%'`;
    if (uLocalEsc.length >= 2) {
        sql += ` OR ${ccCsv} LIKE '%,' + LOWER(LTRIM(N'${uLocalEsc}')) + ',%'`;
    }
    return `(${sql})`;
}

function masterConcernedSeEmailMatchSql(mAlias, apAlias) {
    const mEmail = `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${mAlias}.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
    const apEmail = `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${apAlias}.ApproverEmail, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
    let sql = `${mEmail} = ${apEmail}`;
    const mLocal = `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${mEmail}, 1, NULLIF(CHARINDEX('@', ${mEmail}), 0) - 1), N' ', N''))))`;
    const apLocal = `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${apEmail}, 1, NULLIF(CHARINDEX('@', ${apEmail}), 0) - 1), N' ', N''))))`;
    sql += ` OR (${mLocal} <> N'' AND ${mLocal} = ${apLocal})`;
    return `(${sql})`;
}

function viewerConcernedSeEmailMatchSql(mAlias, uEsc, uLocalEsc) {
    const emailCol = `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${mAlias}.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
    let match = `${emailCol} = LOWER(LTRIM(N'${uEsc}'))`;
    if (uLocalEsc.length >= 2) {
        const local = `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${emailCol}, 1, NULLIF(CHARINDEX('@', ${emailCol}), 0) - 1), N' ', N''))))`;
        match += ` OR ${local} = LOWER(LTRIM(N'${uLocalEsc}'))`;
    }
    return `(${match})`;
}

/** ConcernedSE teammate: same department, both assigned on enquiry, approver on this quote. */
function concernedSeTeammateOfQuoteApproverSql(quoteIdExpr, requestNoExpr, uEsc, uLocalEsc) {
    return `EXISTS (
        SELECT 1
        FROM ConcernedSE cs_viewer
        INNER JOIN Master_ConcernedSE m_viewer
          ON UPPER(LTRIM(RTRIM(ISNULL(m_viewer.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs_viewer.SEName, N''))))
        INNER JOIN QuoteApprovalSteps ap_tm
          ON ap_tm.QuoteId = ${quoteIdExpr}
         AND ap_tm.QuoteId > 0
        INNER JOIN Master_ConcernedSE m_ap
          ON ${masterConcernedSeEmailMatchSql('m_ap', 'ap_tm')}
        INNER JOIN ConcernedSE cs_ap
          ON LTRIM(RTRIM(cs_ap.RequestNo)) = LTRIM(RTRIM(cs_viewer.RequestNo))
         AND UPPER(LTRIM(RTRIM(ISNULL(cs_ap.SEName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(m_ap.FullName, N''))))
        WHERE LTRIM(RTRIM(cs_viewer.RequestNo)) = LTRIM(RTRIM(${requestNoExpr}))
          AND ${viewerConcernedSeEmailMatchSql('m_viewer', uEsc, uLocalEsc)}
          AND LTRIM(RTRIM(ISNULL(m_viewer.Department, N''))) <> N''
          AND LTRIM(RTRIM(ISNULL(m_ap.Department, N''))) <> N''
          AND UPPER(LTRIM(RTRIM(ISNULL(m_viewer.Department, N'')))) =
              UPPER(LTRIM(RTRIM(ISNULL(m_ap.Department, N''))))
    )`;
}

/** Cross-division: ConcernedSE on enquiry + same-department approver on this quote's workflow. */
function concernedSeCrossDivisionWorkflowApproverSql(quoteIdExpr, requestNoExpr, uEsc, uLocalEsc) {
    const ownJob = `UPPER(LTRIM(RTRIM(ISNULL(eq_xd.OwnJob, N''))))`;
    const viewerDept = `UPPER(LTRIM(RTRIM(ISNULL(m_viewer.Department, N''))))`;
    const crossDivision = `(
        ${ownJob} <> ${viewerDept}
        AND ${ownJob} NOT LIKE ${viewerDept} + N'%'
        AND ${viewerDept} NOT LIKE ${ownJob} + N'%'
    )`;
    return `EXISTS (
        SELECT 1
        FROM ConcernedSE cs_viewer
        INNER JOIN Master_ConcernedSE m_viewer
          ON UPPER(LTRIM(RTRIM(ISNULL(m_viewer.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs_viewer.SEName, N''))))
        INNER JOIN EnquiryQuotes eq_xd
          ON eq_xd.ID = ${quoteIdExpr}
        INNER JOIN QuoteApprovalSteps ap_div
          ON ap_div.QuoteId = eq_xd.ID
         AND ap_div.QuoteId > 0
        INNER JOIN Master_ConcernedSE m_ap
          ON ${masterConcernedSeEmailMatchSql('m_ap', 'ap_div')}
        WHERE LTRIM(RTRIM(cs_viewer.RequestNo)) = LTRIM(RTRIM(${requestNoExpr}))
          AND ${viewerConcernedSeEmailMatchSql('m_viewer', uEsc, uLocalEsc)}
          AND LTRIM(RTRIM(ISNULL(m_viewer.Department, N''))) <> N''
          AND LTRIM(RTRIM(ISNULL(m_ap.Department, N''))) <> N''
          AND UPPER(LTRIM(RTRIM(ISNULL(m_viewer.Department, N'')))) =
              UPPER(LTRIM(RTRIM(ISNULL(m_ap.Department, N''))))
          AND ${crossDivision}
    )`;
}

/** Direct approver, CC-mail teammate, ConcernedSE teammate, or cross-division division-mate approver. */
function buildApprovalQuoteVisibleToUserSql(quoteIdExpr, requestNoExpr, uEsc, uLocalEsc) {
    return `(
        EXISTS (
            SELECT 1
            FROM QuoteApprovalSteps apVis
            WHERE apVis.QuoteId = ${quoteIdExpr}
              AND apVis.QuoteId > 0
              AND ${approverEmailMatchSql('apVis', uEsc, uLocalEsc)}
        )
        OR EXISTS (
            SELECT 1
            FROM Master_EnquiryFor mefCc
            INNER JOIN QuoteApprovalSteps apCc
              ON apCc.QuoteId = ${quoteIdExpr}
             AND apCc.QuoteId > 0
            WHERE ${ccMailIdsContainsUserSql('mefCc', uEsc, uLocalEsc)}
              AND ${ccMailIdsContainsApproverSql('mefCc', 'apCc')}
        )
        OR ${concernedSeTeammateOfQuoteApproverSql(quoteIdExpr, requestNoExpr, uEsc, uLocalEsc)}
        OR ${concernedSeCrossDivisionWorkflowApproverSql(quoteIdExpr, requestNoExpr, uEsc, uLocalEsc)}
    )`;
}

/**
 * Quotes on these enquiries visible only via approval workflow (direct approver or division teammate).
 * Map key = RequestNo, value = [{ quoteId, quoteNumber, ownJob, leadJob, toName }].
 */
async function fetchApprovalWorkflowVisibleQuotesByRequest(userEmail, requestNos) {
    const email = normalizeApprovalEmail(userEmail);
    const nums = [...new Set((requestNos || []).map((r) => String(r ?? '').trim()).filter(Boolean))];
    const out = new Map();
    if (!email || !nums.length) return out;

    const csv = nums.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
    const uEsc = email.replace(/'/g, "''");
    const uLocalEsc = ((email.split('@')[0] || '').trim()).replace(/'/g, "''");

    try {
        const result = await sql.query(`
            SELECT DISTINCT
                ap.QuoteId AS QuoteId,
                LTRIM(RTRIM(ap.RequestNo)) AS RequestNo,
                LTRIM(RTRIM(ISNULL(q.QuoteNumber, N''))) AS QuoteNumber,
                LTRIM(RTRIM(ISNULL(q.OwnJob, N''))) AS OwnJob,
                LTRIM(RTRIM(ISNULL(q.LeadJob, N''))) AS LeadJob,
                LTRIM(RTRIM(ISNULL(q.ToName, N''))) AS ToName
            FROM QuoteApprovalSteps ap
            INNER JOIN EnquiryQuotes q ON q.ID = ap.QuoteId AND ap.QuoteId > 0
            WHERE LTRIM(RTRIM(ap.RequestNo)) IN (${csv})
              AND ${buildApprovalQuoteVisibleToUserSql('ap.QuoteId', 'ap.RequestNo', uEsc, uLocalEsc)}
        `);
        for (const row of result.recordset || []) {
            const rn = String(row.RequestNo || '').trim();
            const quoteId = Number(row.QuoteId);
            if (!rn || !Number.isFinite(quoteId) || quoteId <= 0) continue;
            if (!out.has(rn)) out.set(rn, []);
            out.get(rn).push({
                quoteId,
                quoteNumber: String(row.QuoteNumber || '').trim(),
                ownJob: String(row.OwnJob || '').trim(),
                leadJob: String(row.LeadJob || '').trim(),
                toName: String(row.ToName || '').trim(),
            });
        }
        return out;
    } catch (err) {
        if (isMissingQuoteApprovalStepsTableError(err.message)) return out;
        throw err;
    }
}

module.exports = {
    isMissingQuoteApprovalStepsTableError,
    mapDbRowToStep,
    fetchApprovalStepsByQuoteId,
    fetchApprovalStepsByDraftId,
    countPendingApprovalsForUser,
    fetchPendingApprovalsForUser,
    fetchApprovedApprovalsByUser,
    fetchRejectedApprovalsByUser,
    fetchApprovalWorkflowSearch,
    enrichQuoteListRowsWithApprovalStatus,
    userHasActionableDraftApprovalStep,
    userHasActionableQuoteApprovalStep,
    replaceApprovalSteps,
    linkDraftStepsToQuote,
    recordQuoteApprovalAction,
    recordDraftQuoteApprovalAction,
    normalizeQuoteMeta,
    deriveQuoteRef,
    fetchEnquiryDivisionStakeholderEmails,
    fetchApprovalCompletionRecipients,
    fetchExistingCreatedByEmail,
    fetchExistingWorkflowMeta,
    fetchApprovalMailContext,
    getCurrentPendingStep,
    resolveApprovalPersistContext,
    fetchApprovalStepsApiPayload,
    userIsAssignedQuoteApproverForEnquiry,
    userHasApprovalWorkflowDivisionStakeholderAccess,
    userHasApprovalWorkflowQuoteAccess,
    fetchApprovalWorkflowVisibleQuotesByRequest,
};

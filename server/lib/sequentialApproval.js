const sql = require('mssql');
const { coerceFinalApproverFlags, normalizeApprovalEmail } = require('./approvalWorkflowJson');

/** 'parallel' | 'sequential' | null (null = use the division default). */
function normalizeApprovalMode(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'sequential' || v === 'one-after-another' || v === 'one after another') return 'sequential';
    if (v === 'parallel') return 'parallel';
    return null;
}

let modeColumnsCache = { value: false, checkedAt: 0 };

/** ApprovalMode columns exist (run_add_quote_approval_mode.js). Re-checked every 5 minutes until present. */
async function approvalModeColumnsAvailable() {
    if (modeColumnsCache.value) return true;
    if (Date.now() - modeColumnsCache.checkedAt < 5 * 60 * 1000 && modeColumnsCache.checkedAt) return false;
    try {
        const res = await sql.query`
            SELECT
                COL_LENGTH('dbo.QuoteApprovalSteps', 'ApprovalMode') AS stepsCol,
                COL_LENGTH('dbo.QuoteApprovalHierarchy', 'ApprovalMode') AS hierarchyCol
        `;
        const row = res.recordset?.[0] || {};
        modeColumnsCache = { value: row.stepsCol != null && row.hierarchyCol != null, checkedAt: Date.now() };
    } catch {
        modeColumnsCache = { value: false, checkedAt: Date.now() };
    }
    return modeColumnsCache.value;
}

/**
 * Divisions (quote OwnJob) whose approvers act one after another instead of in parallel.
 * Override with EMS_SEQUENTIAL_APPROVAL_DIVISIONS (comma-separated).
 */
function getSequentialApprovalDivisions() {
    const raw = String(
        process.env.EMS_SEQUENTIAL_APPROVAL_DIVISIONS || 'AC Maint-Elec,AC Maint-HVAC'
    );
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function normalizeDivisionToken(value) {
    const s = String(value || '').trim().toLowerCase();
    const dash = s.lastIndexOf(' - ');
    return dash >= 0 ? s.slice(dash + 3).trim() : s;
}

function isSequentialApprovalDivision(ownJob, leadJobName = '') {
    const key = normalizeDivisionToken(String(ownJob || '').trim() || leadJobName);
    if (!key) return false;
    return getSequentialApprovalDivisions().includes(key);
}

/** Stored workflow mode (on step rows) wins; otherwise the division default. */
function resolveApprovalMode(steps, ownJob, leadJobName = '') {
    const stored = (Array.isArray(steps) ? steps : [])
        .map((s) => normalizeApprovalMode(s?.approvalMode))
        .find(Boolean);
    if (stored) return stored;
    return isSequentialApprovalDivision(ownJob, leadJobName) ? 'sequential' : 'parallel';
}

function isWorkflowSequential(steps, ownJob, leadJobName = '') {
    return resolveApprovalMode(steps, ownJob, leadJobName) === 'sequential';
}

/** Turn order: non-final steps by sequence, final approver always last. */
function orderStepsForSequentialApproval(steps) {
    const sorted = coerceFinalApproverFlags(
        [...(Array.isArray(steps) ? steps : [])].sort(
            (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0)
        )
    );
    return [...sorted.filter((s) => !s.isFinalApprover), ...sorted.filter((s) => s.isFinalApprover)];
}

/** Step whose turn it is (first not-yet-approved in turn order); null when rejected or complete. */
function getSequentialActiveStep(steps) {
    const ordered = orderStepsForSequentialApproval(steps);
    if (ordered.some((s) => String(s.status || '').toLowerCase() === 'rejected')) return null;
    return ordered.find((s) => String(s.status || '').toLowerCase() !== 'approved') || null;
}

function isSequentialTurnForApprover(steps, approverEmail) {
    const active = getSequentialActiveStep(steps);
    const email = normalizeApprovalEmail(approverEmail);
    return !!active && !!email && normalizeApprovalEmail(active.approverEmail) === email;
}

/** True once the approver's turn has come (already approved, or currently active). */
function hasSequentialTurnReached(steps, approverEmail) {
    const email = normalizeApprovalEmail(approverEmail);
    if (!email) return false;
    for (const step of orderStepsForSequentialApproval(steps)) {
        const isMine = normalizeApprovalEmail(step.approverEmail) === email;
        if (isMine) return true;
        if (String(step.status || '').toLowerCase() !== 'approved') return false;
    }
    return false;
}

/**
 * SQL predicate (true = sequential division) on a QuoteApprovalSteps alias.
 * Mirrors isSequentialApprovalDivision: OwnJob, falling back to LeadJobName.
 */
function buildSequentialDivisionSql(alias = 's') {
    const divisions = getSequentialApprovalDivisions();
    if (!divisions.length) return '1 = 0';
    const expr = `LOWER(LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(${alias}.OwnJob)), N''), ${alias}.LeadJobName, N''))))`;
    const parts = divisions.map((d) => {
        const lit = d.replace(/'/g, "''");
        return `${expr} = N'${lit}' OR ${expr} LIKE N'% - ${lit}'`;
    });
    return `(${parts.join(' OR ')})`;
}

/** SQL predicate: workflow on this step row runs sequentially (stored mode, else division default). */
function buildSequentialWorkflowSql(alias = 's', modeColumn = false) {
    const divisionSql = buildSequentialDivisionSql(alias);
    if (!modeColumn) return divisionSql;
    return `(
                  LOWER(LTRIM(RTRIM(ISNULL(${alias}.ApprovalMode, N'')))) = N'sequential'
                  OR (NULLIF(LTRIM(RTRIM(ISNULL(${alias}.ApprovalMode, N''))), N'') IS NULL AND ${divisionSql})
              )`;
}

/**
 * SQL fragment: in sequential workflows, every step ahead of this one in turn order must be approved.
 * scope 'quote' compares on QuoteId; 'draft' on DraftQuoteId (unpromoted rows only).
 */
function buildSequentialTurnSql(alias = 's', scope = 'quote', { modeColumn = false } = {}) {
    const sameWorkflow =
        scope === 'draft'
            ? `prevTurn.DraftQuoteId = ${alias}.DraftQuoteId AND (prevTurn.QuoteId IS NULL OR prevTurn.QuoteId = 0)`
            : `prevTurn.QuoteId = ${alias}.QuoteId`;
    return `
              AND (
                  NOT ${buildSequentialWorkflowSql(alias, modeColumn)}
                  OR NOT EXISTS (
                      SELECT 1
                      FROM QuoteApprovalSteps prevTurn
                      WHERE ${sameWorkflow}
                        AND prevTurn.ID <> ${alias}.ID
                        AND LOWER(LTRIM(RTRIM(ISNULL(prevTurn.Status, N'')))) <> N'approved'
                        AND (
                            ISNULL(${alias}.IsFinalApprover, 0) = 1
                            OR (
                                prevTurn.ApproverSequence < ${alias}.ApproverSequence
                                AND ISNULL(prevTurn.IsFinalApprover, 0) = 0
                            )
                        )
                  )
              )`;
}

module.exports = {
    normalizeApprovalMode,
    approvalModeColumnsAvailable,
    resolveApprovalMode,
    isWorkflowSequential,
    getSequentialApprovalDivisions,
    isSequentialApprovalDivision,
    orderStepsForSequentialApproval,
    getSequentialActiveStep,
    isSequentialTurnForApprover,
    hasSequentialTurnReached,
    buildSequentialDivisionSql,
    buildSequentialTurnSql,
};

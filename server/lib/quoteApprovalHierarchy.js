const sql = require('mssql');
const { normalizeApprovalEmail } = require('./approvalWorkflowJson');

function isMissingQuoteApprovalHierarchyTableError(message) {
    const m = String(message || '');
    return (
        /Invalid object name/i.test(m) &&
        (/QuoteApprovalHierarchy/i.test(m) || /QuoteApprovalHierarchyStep/i.test(m))
    );
}

function mapHierarchyStepRow(row) {
    return {
        sequence: Number(row.ApproverSequence) || 1,
        approverEmail: String(row.ApproverEmail || '').trim(),
        approverName: String(row.ApproverName || '').trim(),
        approverDesignation: String(row.ApproverDesignation || '').trim(),
    };
}

async function fetchApprovalHierarchiesForUser(userEmail) {
    const owner = normalizeApprovalEmail(userEmail);
    if (!owner) return [];

    const res = await sql.query`
        SELECT h.ID, h.HierarchyName, h.UpdatedAt,
               s.ApproverSequence, s.ApproverEmail, s.ApproverName, s.ApproverDesignation
        FROM QuoteApprovalHierarchy h
        LEFT JOIN QuoteApprovalHierarchyStep s ON s.HierarchyId = h.ID
        WHERE LOWER(LTRIM(RTRIM(ISNULL(h.OwnerEmail, N'')))) = ${owner}
        ORDER BY h.HierarchyName ASC, s.ApproverSequence ASC, s.ID ASC
    `;

    const byId = new Map();
    for (const row of res.recordset || []) {
        const id = Number(row.ID);
        if (!byId.has(id)) {
            byId.set(id, {
                id,
                name: String(row.HierarchyName || '').trim(),
                updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
                steps: [],
            });
        }
        if (row.ApproverSequence != null) {
            byId.get(id).steps.push(mapHierarchyStepRow(row));
        }
    }

    return Array.from(byId.values()).map((h) => ({
        ...h,
        steps: h.steps.sort((a, b) => a.sequence - b.sequence),
    }));
}

async function saveApprovalHierarchy(userEmail, hierarchyName, steps = [], hierarchyId = null) {
    const owner = normalizeApprovalEmail(userEmail);
    const name = String(hierarchyName || '').trim();
    const idArg = hierarchyId != null && Number.isFinite(Number(hierarchyId)) ? Number(hierarchyId) : null;
    if (!owner) throw new Error('userEmail is required');
    if (!name) throw new Error('Hierarchy name is required');

    const normalizedSteps = (Array.isArray(steps) ? steps : [])
        .map((s, i) => ({
            sequence: Number(s.sequence ?? i + 1),
            approverEmail: normalizeApprovalEmail(s.approverEmail ?? s.email),
            approverName: String(s.approverName ?? s.name ?? '').trim(),
            approverDesignation: String(s.approverDesignation ?? s.designation ?? '').trim(),
        }))
        .filter((s) => s.approverName || s.approverEmail)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s, i) => ({ ...s, sequence: i + 1 }));

    if (!normalizedSteps.length) {
        throw new Error('Add at least one approver to the hierarchy');
    }

    const now = new Date();
    let resolvedId = idArg;

    if (resolvedId) {
        const ownRes = await sql.query`
            SELECT TOP 1 ID
            FROM QuoteApprovalHierarchy
            WHERE ID = ${resolvedId}
              AND LOWER(LTRIM(RTRIM(ISNULL(OwnerEmail, N'')))) = ${owner}
        `;
        if (!ownRes.recordset?.length) {
            throw new Error('Hierarchy not found');
        }
        const dupRes = await sql.query`
            SELECT TOP 1 ID
            FROM QuoteApprovalHierarchy
            WHERE LOWER(LTRIM(RTRIM(ISNULL(OwnerEmail, N'')))) = ${owner}
              AND LTRIM(RTRIM(HierarchyName)) = LTRIM(RTRIM(${name}))
              AND ID <> ${resolvedId}
        `;
        if (dupRes.recordset?.length) {
            throw new Error('Another hierarchy already uses this name');
        }
        await sql.query`
            UPDATE QuoteApprovalHierarchy
            SET HierarchyName = ${name}, UpdatedAt = ${now}
            WHERE ID = ${resolvedId}
        `;
        await sql.query`DELETE FROM QuoteApprovalHierarchyStep WHERE HierarchyId = ${resolvedId}`;
    } else {
        const existing = await sql.query`
            SELECT TOP 1 ID
            FROM QuoteApprovalHierarchy
            WHERE LOWER(LTRIM(RTRIM(ISNULL(OwnerEmail, N'')))) = ${owner}
              AND LTRIM(RTRIM(HierarchyName)) = LTRIM(RTRIM(${name}))
        `;
        resolvedId = existing.recordset?.[0]?.ID ? Number(existing.recordset[0].ID) : null;

        if (resolvedId) {
            await sql.query`
                UPDATE QuoteApprovalHierarchy
                SET UpdatedAt = ${now}
                WHERE ID = ${resolvedId}
            `;
            await sql.query`DELETE FROM QuoteApprovalHierarchyStep WHERE HierarchyId = ${resolvedId}`;
        } else {
            const ins = await sql.query`
                INSERT INTO QuoteApprovalHierarchy (HierarchyName, OwnerEmail, CreatedAt, UpdatedAt)
                OUTPUT INSERTED.ID
                VALUES (${name}, ${owner}, ${now}, ${now})
            `;
            resolvedId = Number(ins.recordset?.[0]?.ID);
        }
    }

    for (const step of normalizedSteps) {
        await sql.query`
            INSERT INTO QuoteApprovalHierarchyStep (
                HierarchyId, ApproverSequence, ApproverEmail, ApproverName, ApproverDesignation
            )
            VALUES (
                ${resolvedId},
                ${step.sequence},
                ${step.approverEmail || null},
                ${step.approverName},
                ${step.approverDesignation || null}
            )
        `;
    }

    return {
        id: resolvedId,
        name,
        steps: normalizedSteps,
        updatedAt: now.toISOString(),
    };
}

async function deleteApprovalHierarchy(userEmail, hierarchyId) {
    const owner = normalizeApprovalEmail(userEmail);
    const id = Number(hierarchyId);
    if (!owner || !Number.isFinite(id)) throw new Error('Invalid hierarchy delete request');

    const res = await sql.query`
        DELETE FROM QuoteApprovalHierarchy
        WHERE ID = ${id}
          AND LOWER(LTRIM(RTRIM(ISNULL(OwnerEmail, N'')))) = ${owner}
    `;
    return (res.rowsAffected?.[0] || 0) > 0;
}

module.exports = {
    isMissingQuoteApprovalHierarchyTableError,
    fetchApprovalHierarchiesForUser,
    saveApprovalHierarchy,
    deleteApprovalHierarchy,
};

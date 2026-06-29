/**
 * ConcernedSE persistence helpers — supports optional LeadJobCode + Accountability columns.
 */

function resolveLeadJobCodeForEnquiryForItem(item, allItems) {
    if (!item || typeof item !== 'object') return null;

    let code = item.leadJobCode ?? item.LeadJobCode;
    if (code && /^L\d+$/i.test(String(code).trim())) {
        return String(code).trim().toUpperCase();
    }

    const items = Array.isArray(allItems) ? allItems : [];
    const byId = new Map(items.map((i) => [String(i.id), i]));
    let current = item;
    let safety = 0;
    while (current?.parentId && safety < 40) {
        const parent = byId.get(String(current.parentId));
        if (!parent) break;
        current = parent;
        safety += 1;
    }

    const roots = items.filter((i) => !i.parentId);
    const rootIndex = roots.findIndex((r) => String(r.id) === String(current?.id));
    if (rootIndex === -1) return null;
    return `L${rootIndex + 1}`;
}

function buildConcernedSEAssignmentsFromEnquiryFor(enqForList) {
    const items = Array.isArray(enqForList) ? enqForList : [];
    /** Last explicit accountableSE per L-code wins (user changed selection on save). */
    const accountableByCode = new Map();
    const seen = new Map();

    for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== 'object') continue;

        const assignees = (Array.isArray(rawItem.assignedSEs) ? rawItem.assignedSEs : [])
            .map((n) => String(n || '').trim())
            .filter(Boolean);
        if (assignees.length === 0) continue;

        const leadJobCode = resolveLeadJobCodeForEnquiryForItem(rawItem, items);
        const codeKey = leadJobCode ? String(leadJobCode).trim().toUpperCase() : '';
        const explicitAccountable = String(rawItem.accountableSE || '').trim();

        if (codeKey) {
            if (explicitAccountable && assignees.includes(explicitAccountable)) {
                accountableByCode.set(codeKey, explicitAccountable);
            } else if (assignees.length === 1) {
                accountableByCode.set(codeKey, assignees[0]);
            }
        }

        for (const seName of assignees) {
            const key = `${codeKey}|${seName}`;
            if (!seen.has(key)) {
                seen.set(key, {
                    seName,
                    leadJobCode: leadJobCode || null,
                    accountability: null,
                });
            }
        }
    }

    return [...seen.values()].map((row) => {
        const codeKey = String(row.leadJobCode || '').trim().toUpperCase();
        const winner = codeKey ? accountableByCode.get(codeKey) : null;
        return {
            ...row,
            accountability: winner && row.seName === winner ? 'Yes' : null,
        };
    });
}

/** Only one SE may be accountable per lead job (L-code); last marked Yes wins in payload order. */
function finalizeSingleAccountablePerLeadJob(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const winnerByCode = new Map();

    for (const row of list) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        if (!code) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnerByCode.set(code, row.seName);
        }
    }

    return list.map((row) => {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        if (!code || !winnerByCode.has(code)) return row;
        const winner = winnerByCode.get(code);
        return {
            ...row,
            accountability: row.seName === winner ? 'Yes' : null,
        };
    });
}

function normalizeConcernedSEPayload(items, selectedEnquiryFor) {
    let rows = [];

    if (Array.isArray(items) && items.length > 0) {
        const first = items[0];
        const isStructured =
            typeof first === 'object' &&
            first !== null &&
            (first.seName != null || first.SEName != null);

        if (isStructured) {
            rows = items
                .map((row) => {
                    const seName = String(row.seName || row.SEName || '').trim();
                    if (!seName) return null;
                    return {
                        seName,
                        leadJobCode: row.leadJobCode ?? row.LeadJobCode ?? null,
                        accountability: row.accountability ?? row.Accountability ?? null,
                    };
                })
                .filter(Boolean);
        } else {
            rows = items
                .map((row) => {
                    const seName = String(row || '').trim();
                    return seName ? { seName, leadJobCode: null, accountability: null } : null;
                })
                .filter(Boolean);
        }
    } else if (Array.isArray(selectedEnquiryFor) && selectedEnquiryFor.length > 0) {
        rows = buildConcernedSEAssignmentsFromEnquiryFor(selectedEnquiryFor);
    }

    return finalizeSingleAccountablePerLeadJob(rows);
}

async function getConcernedSEColumnFlags(sql, transaction) {
    const flags = { email: false, leadJobCode: false, accountability: false };
    try {
        const r = transaction ? new sql.Request(transaction) : new sql.Request();
        const chk = await r.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'ConcernedSE'
        `);
        for (const row of chk.recordset || []) {
            const col = String(row.COLUMN_NAME || '').toLowerCase();
            if (col === 'emailid') flags.email = true;
            if (col === 'leadjobcode') flags.leadJobCode = true;
            if (col === 'accountability') flags.accountability = true;
        }
    } catch (_) {
        /* ignore */
    }
    return flags;
}

async function lookupSeEmail(sqlRequest, seName) {
    try {
        const eRes = await sqlRequest.query`
            SELECT TOP 1 EmailId
            FROM Master_ConcernedSE
            WHERE LTRIM(RTRIM(FullName)) = LTRIM(RTRIM(${seName}))
        `;
        return eRes.recordset?.[0]?.EmailId || null;
    } catch (_) {
        return null;
    }
}

/** Clear accountability on prior assignees for each lead job when a new SE is marked accountable. */
async function clearPriorAccountabilityForLeadJobs(sql, transaction, requestNo, assignments, flags) {
    if (!flags.accountability || !flags.leadJobCode) return;

    const winnersByCode = new Map();
    for (const row of assignments) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        if (!code) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnersByCode.set(code, row.seName);
        }
    }

    for (const [code, winner] of winnersByCode) {
        const r = transaction ? new sql.Request(transaction) : new sql.Request();
        r.input('reqNo', sql.NVarChar, requestNo);
        r.input('code', sql.NVarChar, code);
        r.input('winner', sql.NVarChar, winner);
        await r.query(`
            UPDATE ConcernedSE
            SET accountability = NULL
            WHERE RequestNo = @reqNo
              AND UPPER(LTRIM(RTRIM(ISNULL(leadjobcode, ISNULL(LeadJobCode, N''))))) = UPPER(LTRIM(RTRIM(@code)))
              AND LTRIM(RTRIM(ISNULL(SEName, N''))) <> LTRIM(RTRIM(ISNULL(@winner, N'')))
        `);
    }
}

async function insertAssignmentsRows(sql, transaction, requestNo, assignments, flags) {
    if (!assignments.length) return;
    const colFlags = flags || (await getConcernedSEColumnFlags(sql, transaction));

    for (const row of assignments) {
        const r = transaction ? new sql.Request(transaction) : new sql.Request();
        r.input('reqNo', sql.NVarChar, requestNo);
        r.input('seName', sql.NVarChar, row.seName);

        const fields = ['RequestNo', 'SEName'];
        const values = ['@reqNo', '@seName'];

        if (colFlags.leadJobCode) {
            r.input('leadJobCode', sql.NVarChar, row.leadJobCode || null);
            fields.push('LeadJobCode');
            values.push('@leadJobCode');
        }
        if (colFlags.accountability) {
            r.input('accountability', sql.NVarChar, row.accountability || null);
            fields.push('Accountability');
            values.push('@accountability');
        }
        if (colFlags.email) {
            const seEmail = await lookupSeEmail(r, row.seName);
            r.input('seEmail', sql.NVarChar, seEmail);
            fields.push('EmailId');
            values.push('@seEmail');
        }

        await r.query(`INSERT INTO ConcernedSE (${fields.join(', ')}) VALUES (${values.join(', ')})`);
    }
}

async function insertConcernedSERows(sql, transaction, requestNo, items, selectedEnquiryFor) {
    const assignments = normalizeConcernedSEPayload(items, selectedEnquiryFor);
    if (!assignments.length) return;
    const flags = await getConcernedSEColumnFlags(sql, transaction);
    await insertAssignmentsRows(sql, transaction, requestNo, assignments, flags);
}

/**
 * Save changes: clear old accountable flags per lead job, replace all ConcernedSE rows for the enquiry.
 */
async function replaceConcernedSERows(sql, transaction, requestNo, items, selectedEnquiryFor) {
    const assignments = normalizeConcernedSEPayload(items, selectedEnquiryFor);
    const flags = await getConcernedSEColumnFlags(sql, transaction);

    await clearPriorAccountabilityForLeadJobs(sql, transaction, requestNo, assignments, flags);

    const del = transaction ? new sql.Request(transaction) : new sql.Request();
    del.input('reqNo', sql.NVarChar, requestNo);
    await del.query(`DELETE FROM ConcernedSE WHERE RequestNo = @reqNo`);

    await insertAssignmentsRows(sql, transaction, requestNo, assignments, flags);
}

function mapConcernedSEAssignmentsFromRows(recordset) {
    return (recordset || []).map((s) => ({
        seName: s.SEName,
        leadJobCode: s.LeadJobCode ?? s.leadJobCode ?? null,
        accountability: s.Accountability ?? s.accountability ?? null,
    }));
}

module.exports = {
    buildConcernedSEAssignmentsFromEnquiryFor,
    normalizeConcernedSEPayload,
    insertConcernedSERows,
    replaceConcernedSERows,
    mapConcernedSEAssignmentsFromRows,
};

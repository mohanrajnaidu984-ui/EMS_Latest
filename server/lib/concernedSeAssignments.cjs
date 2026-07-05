/**
 * ConcernedSE persistence helpers — supports LeadJobCode, Accountability, and OwnJob columns.
 */

function divisionNameForEnquiryForItem(item) {
    return String(item?.itemName || item?.ItemName || '').trim();
}

function itemKeyForEnquiryForItem(item, idx) {
    return String(item?.id ?? item?.ID ?? `idx-${idx}`);
}

function resolveLeadJobCodeForEnquiryForItem(item, allItems) {
    if (!item || typeof item !== 'object') return null;

    const explicit = item.leadJobCode ?? item.LeadJobCode;
    if (explicit && /^L\d+(-L\d+)*$/i.test(String(explicit).trim())) {
        return String(explicit).trim().toUpperCase();
    }

    const items = Array.isArray(allItems) ? allItems : [];
    const byId = new Map(items.map((i) => [String(i.id ?? i.ID), i]));
    const chain = [];
    let current = item;
    let safety = 0;
    while (current && safety < 40) {
        chain.unshift(current);
        const parentId = current.parentId ?? current.ParentID;
        current = parentId ? byId.get(String(parentId)) : null;
        safety += 1;
    }

    const segments = [];
    for (const node of chain) {
        const parentId = node.parentId ?? node.ParentID;
        const siblings = parentId
            ? items.filter((i) => String(i.parentId ?? i.ParentID) === String(parentId))
            : items.filter((i) => !(i.parentId ?? i.ParentID));
        const idx = siblings.findIndex((s) => String(s.id ?? s.ID) === String(node.id ?? node.ID));
        if (idx === -1) return null;
        segments.push(`L${idx + 1}`);
    }

    if (segments.length === 0) return null;
    if (segments.length === 1) return segments[0];
    return segments.join('-');
}

/** Build ConcernedSE rows — one accountable member per structure division row; ownJob = that division. */
function buildConcernedSEAssignmentsFromEnquiryFor(enqForList) {
    const items = Array.isArray(enqForList) ? enqForList : [];
    const seen = new Map();

    for (let idx = 0; idx < items.length; idx++) {
        const rawItem = items[idx];
        if (!rawItem || typeof rawItem !== 'object') continue;

        const assignees = (Array.isArray(rawItem.assignedSEs) ? rawItem.assignedSEs : [])
            .map((n) => String(n || '').trim())
            .filter(Boolean);
        if (assignees.length === 0) continue;

        const divisionName = divisionNameForEnquiryForItem(rawItem);
        const leadJobCode = resolveLeadJobCodeForEnquiryForItem(rawItem, items);
        const explicitAccountable = String(rawItem.accountableSE || '').trim();
        const accountable =
            explicitAccountable && assignees.includes(explicitAccountable)
                ? explicitAccountable
                : assignees.length === 1
                  ? assignees[0]
                  : null;

        for (const seName of assignees) {
            const dedupeKey = `${itemKeyForEnquiryForItem(rawItem, idx)}|${seName}`;
            if (seen.has(dedupeKey)) continue;

            const isAccountable = Boolean(accountable && seName === accountable);
            seen.set(dedupeKey, {
                seName,
                leadJobCode: leadJobCode || null,
                accountability: isAccountable ? 'Yes' : null,
                ownJob: isAccountable && divisionName ? divisionName : null,
            });
        }
    }

    return finalizeAccountability([...seen.values()]);
}

/** One accountable SE per lead-job code + division (ownJob) scope. */
function finalizeAccountability(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const winnerByScope = new Map();

    for (const row of list) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        const own = String(row.ownJob || row.OwnJob || '').trim().toLowerCase();
        const scopeKey = own ? `${code}|${own}` : code;
        if (!scopeKey) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnerByScope.set(scopeKey, row.seName);
        }
    }

    return list.map((row) => {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        const own = String(row.ownJob || row.OwnJob || '').trim().toLowerCase();
        const scopeKey = own ? `${code}|${own}` : code;
        if (!scopeKey || !winnerByScope.has(scopeKey)) return row;
        const winner = winnerByScope.get(scopeKey);
        return {
            ...row,
            accountability: row.seName === winner ? 'Yes' : null,
            ownJob: row.seName === winner ? row.ownJob || row.OwnJob || null : null,
        };
    });
}

/** @deprecated use finalizeAccountability */
function finalizeSingleAccountablePerLeadJob(rows) {
    return finalizeAccountability(rows);
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
                        ownJob: row.ownJob ?? row.OwnJob ?? null,
                    };
                })
                .filter(Boolean);
        } else {
            rows = items
                .map((row) => {
                    const seName = String(row || '').trim();
                    return seName ? { seName, leadJobCode: null, accountability: null, ownJob: null } : null;
                })
                .filter(Boolean);
        }
    } else if (Array.isArray(selectedEnquiryFor) && selectedEnquiryFor.length > 0) {
        rows = buildConcernedSEAssignmentsFromEnquiryFor(selectedEnquiryFor);
    }

    return finalizeAccountability(rows);
}

async function getConcernedSEColumnFlags(sql, transaction) {
    const flags = { email: false, leadJobCode: false, accountability: false, ownJob: false };
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
            if (col === 'ownjob') flags.ownJob = true;
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
    if (!flags.accountability) return;

    const winnersByScope = new Map();
    for (const row of assignments) {
        const code = String(row.leadJobCode || '').trim().toUpperCase();
        const own = String(row.ownJob || '').trim().toLowerCase();
        const scopeKey = own ? `${code}|${own}` : code;
        if (!scopeKey) continue;
        if (String(row.accountability || '').trim().toLowerCase() === 'yes') {
            winnersByScope.set(scopeKey, { seName: row.seName, ownJob: row.ownJob || null, leadJobCode: row.leadJobCode || null });
        }
    }

    for (const [, winner] of winnersByScope) {
        const r = transaction ? new sql.Request(transaction) : new sql.Request();
        r.input('reqNo', sql.NVarChar, requestNo);
        r.input('winner', sql.NVarChar, winner.seName);
        r.input('code', sql.NVarChar, winner.leadJobCode || '');
        r.input('ownJob', sql.NVarChar, winner.ownJob || '');

        if (flags.ownJob && winner.ownJob) {
            await r.query(`
                UPDATE ConcernedSE
                SET accountability = NULL, ownjob = NULL
                WHERE RequestNo = @reqNo
                  AND UPPER(LTRIM(RTRIM(ISNULL(leadjobcode, ISNULL(LeadJobCode, N''))))) = UPPER(LTRIM(RTRIM(@code)))
                  AND LOWER(LTRIM(RTRIM(ISNULL(ownjob, N'')))) = LOWER(LTRIM(RTRIM(@ownJob)))
                  AND LTRIM(RTRIM(ISNULL(SEName, N''))) <> LTRIM(RTRIM(ISNULL(@winner, N'')))
            `);
        } else if (flags.leadJobCode && winner.leadJobCode) {
            await r.query(`
                UPDATE ConcernedSE
                SET accountability = NULL
                WHERE RequestNo = @reqNo
                  AND UPPER(LTRIM(RTRIM(ISNULL(leadjobcode, ISNULL(LeadJobCode, N''))))) = UPPER(LTRIM(RTRIM(@code)))
                  AND LTRIM(RTRIM(ISNULL(SEName, N''))) <> LTRIM(RTRIM(ISNULL(@winner, N'')))
            `);
        }
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
        if (colFlags.ownJob) {
            r.input('ownJob', sql.NVarChar, row.ownJob || null);
            fields.push('ownjob');
            values.push('@ownJob');
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
        leadJobCode: s.LeadJobCode ?? s.leadjobcode ?? s.leadJobCode ?? null,
        accountability: s.Accountability ?? s.accountability ?? null,
        ownJob: s.OwnJob ?? s.ownjob ?? s.ownJob ?? null,
    }));
}

module.exports = {
    buildConcernedSEAssignmentsFromEnquiryFor,
    normalizeConcernedSEPayload,
    insertConcernedSERows,
    replaceConcernedSERows,
    mapConcernedSEAssignmentsFromRows,
    finalizeSingleAccountablePerLeadJob,
};

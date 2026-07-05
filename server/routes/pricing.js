// Pricing Module API Routes
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Debug log file
const debugLogPath = path.join(__dirname, 'pricing_debug.log');
function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${message}\n`);
}

const { removeExcludedFromEmailSet } = require('../lib/notificationEmailExclusions');

function parseMailCsv(raw) {
    return String(raw || '')
        .split(/[;,]/g)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

async function notifyParentJobPricingUpdate({
    requestNo,
    enquiryForId,
    ownJobName,
    updatedBy,
    priceValue,
    priceOption,
}) {
    try {
        if (!requestNo) return;
        const ownTrim = String(ownJobName || '').trim();
        if (!enquiryForId && !ownTrim) return;

        let triggerEmail = '';
        const updater = String(updatedBy || '').trim();
        if (updater.includes('@')) {
            triggerEmail = updater.toLowerCase();
        } else if (updater) {
            const u = await sql.query`SELECT TOP 1 EmailId FROM Master_ConcernedSE WHERE FullName = ${updater}`;
            triggerEmail = String(u.recordset?.[0]?.EmailId || '').trim().toLowerCase();
        }

        const jobRes = await sql.query`
            SELECT TOP 1 ID, ParentID, ItemName
            FROM EnquiryFor
            WHERE RequestNo = ${requestNo}
              AND (
                    (${enquiryForId || null} IS NOT NULL AND ID = ${enquiryForId || null})
                    OR (${ownTrim} <> '' AND LTRIM(RTRIM(ISNULL(ItemName, N''))) = ${ownTrim})
                  )
            ORDER BY CASE WHEN ID = ${enquiryForId || null} THEN 0 ELSE 1 END, ID
        `;
        const job = jobRes.recordset?.[0];
        if (!job || !job.ParentID || String(job.ParentID) === '0') return; // own/lead job, not subjob

        const parentRes = await sql.query`
            SELECT TOP 1 ID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo} AND ID = ${job.ParentID}
        `;
        const parent = parentRes.recordset?.[0];
        if (!parent) return;

        const parentJobName = String(parent.ItemName || '').trim();
        const subJobName = String(job.ItemName || ownTrim || '').trim();
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

        if (triggerEmail) recipientEmails.delete(triggerEmail);
        removeExcludedFromEmailSet(recipientEmails);
        if (recipientEmails.size === 0) return;

        const linkPayload = JSON.stringify({
            tab: 'Pricing',
            requestNo: String(requestNo),
            enquiryForId: String(job.ID),
            parentJob: parentJobName,
            subJob: subJobName,
        });
        const enq = await sql.query`
            SELECT TOP 1 ProjectName FROM EnquiryMaster WHERE RequestNo = ${requestNo}
        `;
        const projectName = String(enq.recordset?.[0]?.ProjectName || '').trim();
        const type = 'Subjob Pricing Update';
        const message = `Price updated by ${subJobName} for ${requestNo}, ${projectName || '-'}`;
        const now = new Date();

        for (const email of recipientEmails) {
            const u = await sql.query`SELECT TOP 1 ID FROM Master_ConcernedSE WHERE LOWER(LTRIM(RTRIM(EmailId))) = ${email}`;
            const userId = u.recordset?.[0]?.ID;
            if (!userId) continue;
            await sql.query`
                INSERT INTO Notifications (UserID, Type, Message, LinkID, CreatedBy, CreatedAt)
                VALUES (${userId}, ${type}, ${message}, ${linkPayload}, ${updater || 'System'}, ${now})
            `;
        }
    } catch (err) {
        console.error('[pricing notify] parent-job subjob update', err);
    }
}

/**
 * node-mssql recordsets may use PascalCase, camelCase, or lowercase keys depending on driver/config.
 * Pending/quote logic expects stable field names.
 */
function firstDefined(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    const byLower = {};
    for (const k of Object.keys(obj)) byLower[k.toLowerCase()] = k;
    for (const k of keys) {
        const actual = byLower[k.toLowerCase()];
        if (actual !== undefined && obj[actual] !== undefined && obj[actual] !== null) return obj[actual];
    }
    return undefined;
}

function normalizePricingValueRow(r) {
    if (!r || typeof r !== 'object') return r;
    return {
        ...r,
        ID: firstDefined(r, ['ID', 'id']),
        RequestNo: firstDefined(r, ['RequestNo', 'requestNo', 'requestno']),
        OptionID: firstDefined(r, ['OptionID', 'optionID', 'optionId', 'optionid']),
        EnquiryForID: firstDefined(r, ['EnquiryForID', 'enquiryForID', 'enquiryforid']),
        EnquiryForItem: firstDefined(r, ['EnquiryForItem', 'enquiryForItem', 'enquiryforitem']),
        Price: firstDefined(r, ['Price', 'price']),
        UpdatedAt: firstDefined(r, ['UpdatedAt', 'updatedAt', 'updatedat']),
        UpdatedBy: firstDefined(r, ['UpdatedBy', 'updatedBy', 'updatedby']),
        PriceOption: firstDefined(r, ['PriceOption', 'priceOption', 'priceoption']),
        CustomerName: firstDefined(r, ['CustomerName', 'customerName', 'customername']),
        LeadJobName: firstDefined(r, ['LeadJobName', 'leadJobName', 'leadjobname']),
        Quotingornot: firstDefined(r, ['Quotingornot', 'quotingornot', 'QuotingOrNot', 'quotingOrNot']),
        MatchedEnquiryForId: firstDefined(r, ['MatchedEnquiryForId', 'matchedEnquiryForId', 'matchedenquiryforid']),
        MatchedItemName: firstDefined(r, ['MatchedItemName', 'matchedItemName', 'matcheditemname']),
        MatchedParentId: firstDefined(r, ['MatchedParentId', 'matchedParentId', 'matchedparentid']),
    };
}

let quotingOrNotColumnAvailable = false;

async function refreshQuotingOrNotColumnState() {
    try {
        const check = await sql.query`
            SELECT 1 AS ok
            FROM sys.columns
            WHERE object_id = OBJECT_ID(N'dbo.EnquiryPricingValues')
              AND name = N'Quotingornot'
        `;
        quotingOrNotColumnAvailable = !!check.recordset?.length;
    } catch (err) {
        quotingOrNotColumnAvailable = false;
        console.error('[pricing] check Quotingornot column:', err.message || err);
    }
    return quotingOrNotColumnAvailable;
}

async function ensureQuotingOrNotColumn() {
    await refreshQuotingOrNotColumnState();
    if (quotingOrNotColumnAvailable) return true;
    try {
        await sql.query`
            ALTER TABLE dbo.EnquiryPricingValues
            ADD Quotingornot NVARCHAR(8) NOT NULL
                CONSTRAINT DF_EnquiryPricingValues_Quotingornot DEFAULT N'No'
        `;
        await refreshQuotingOrNotColumnState();
    } catch (err) {
        console.error('[pricing] ensure Quotingornot column:', err.message || err);
    }
    return quotingOrNotColumnAvailable;
}

function epvQuotingOrNotSelectSql(alias = 'v') {
    return quotingOrNotColumnAvailable ? `,\n            ${alias}.Quotingornot` : '';
}

function normalizeQuotingOrNotValue(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'yes' || v === 'y' || v === '1' || v === 'true') return 'Yes';
    return 'No';
}

const {
    resolvePricingAccessContext,
    fetchAllMasterDepartmentNames,
    jobIdOfPricing,
    normalizePricingJobName,
    getDepartmentPricingAnchors,
    getPricingAnchorJobsForDivision,
    expandVisibleJobIdsWithAncestors,
    userHasQuotePricingEnquiryAccess,
    userIsConcernedSeOnEnquiry,
    resolvePricingAnchorJobsWithFallbacks,
} = require('../lib/quotePricingAccess');
const { filterJobsByDepartment } = require('../services/hierarchyService');
const {
    quoteBlocksDeclineToQuote,
    mapEnquiryQuoteRowsForDeclineGuard,
} = require('../lib/pricingQuoteTupleMatch');
const {
    evaluatePendingPricingSummarySpec,
    departmentMatchesItemName,
} = require('../lib/pendingPricingSummarySpec');

/** `yyyy-MM-dd` only — used for latest price-update bounds on non-pending list searches */
function parsePricingListYmd(s) {
    if (!s || typeof s !== 'string') return null;
    const t = s.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const [y, mo, d] = t.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return t;
}

/**
 * Pending/search list summaries do not read `EnquiryPricingOptions` — option classification for joins uses
 * `EnquiryPricingValues.PriceOption` (latest row per OptionID when set; otherwise "Base Price" for legacy rows).
 */
function buildSyntheticPricingOptionsFromValuesRows(pricesForOneEnquiry) {
    const byId = new Map();
    for (const pr of pricesForOneEnquiry) {
        const oidRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
        if (oidRaw == null || oidRaw === '' || String(oidRaw) === '0') continue;
        const key = String(oidRaw).trim();
        const po = pr.PriceOption ?? pr.priceOption;
        const explicit = po != null && String(po).trim() !== '' ? String(po).trim() : null;
        const t = pr.UpdatedAt ?? pr.updatedAt;
        const at = t ? new Date(t).getTime() : 0;
        const prev = byId.get(key);
        if (!prev) {
            byId.set(key, { optionName: explicit || 'Base Price', at, fromExplicit: Boolean(explicit) });
            continue;
        }
        if (explicit) {
            if (!prev.fromExplicit || at >= prev.at) {
                byId.set(key, { optionName: explicit, at, fromExplicit: true });
            }
        } else if (!prev.fromExplicit && at >= prev.at) {
            byId.set(key, { optionName: 'Base Price', at, fromExplicit: false });
        }
    }
    return [...byId.entries()].map(([key, meta]) => {
        const idVal = /^\d+$/.test(key) ? parseInt(key, 10) : key;
        return {
            OptionID: idVal,
            optionID: idVal,
            ID: idVal,
            OptionName: meta.optionName,
            optionName: meta.optionName,
            CustomerName: '',
            ItemName: '',
            LeadJobName: '',
        };
    });
}

/**
 * Detail GET builds option rows from `EnquiryPricingValues` (OptionIDs in value rows). Merge in
 * `EnquiryPricingOptions` rows with no value yet (e.g. Optional added only in EPO) so the grid lists them.
 */
function mergeDetailOptionsWithEnquiryPricingOptionsRows(fromValuesDetail, epoRows, fallbackLeadJobName) {
    const fall = (fallbackLeadJobName && String(fallbackLeadJobName).trim()) || '';
    const byId = new Map();
    for (const o of fromValuesDetail || []) {
        const id = o.ID != null && o.ID !== '' ? String(o.ID).trim() : '';
        if (id) byId.set(id, o);
    }
    for (const row of epoRows || []) {
        const id = row.ID != null && row.ID !== '' ? String(row.ID).trim() : '';
        if (!id) continue;
        if (byId.has(id)) continue;
        let itemName = row.ItemName != null ? String(row.ItemName).trim() : '';
        let leadJobName = row.LeadJobName != null ? String(row.LeadJobName).trim() : '';
        if (!leadJobName && fall) leadJobName = fall;
        byId.set(id, {
            ID: row.ID,
            OptionName: String(row.OptionName != null ? row.OptionName : '').trim(),
            optionName: String(row.OptionName != null ? row.OptionName : '').trim(),
            SortOrder: row.SortOrder != null ? row.SortOrder : 0,
            ItemName: itemName,
            CustomerName: row.CustomerName != null ? String(row.CustomerName).trim() : '',
            LeadJobName: leadJobName,
        });
    }
    const merged = [...byId.values()];
    merged.sort((a, b) => {
        const na = Number(a.ID);
        const nb = Number(b.ID);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.ID).localeCompare(String(b.ID));
    });
    return merged;
}

/**
 * Option rows for the grid: built from `EnquiryPricingValues`; caller merges with `EnquiryPricingOptions` (see merge above).
 */
function buildDetailPricingOptionsFromValuesRows(valuesRows) {
    const rows = (valuesRows || []).map((v) => normalizePricingValueRow({ ...v }));
    const synthetic = buildSyntheticPricingOptionsFromValuesRows(rows);
    return synthetic
        .map((syn, idx) => {
            const key = String(syn.ID ?? syn.OptionID ?? syn.optionID ?? '').trim();
            let best = null;
            let bestAt = -1;
            for (const v of rows) {
                const oid = String(v.OptionID ?? v.optionID ?? v.OptionId ?? '').trim();
                if (oid !== key) continue;
                const t = v.UpdatedAt ?? v.updatedAt;
                const at = t ? new Date(t).getTime() : 0;
                if (at >= bestAt) {
                    bestAt = at;
                    best = v;
                }
            }
            return {
                ID: syn.ID,
                OptionName: syn.OptionName,
                optionName: syn.optionName,
                SortOrder: idx,
                ItemName: best ? String(best.EnquiryForItem ?? best.enquiryForItem ?? '').trim() : '',
                CustomerName: best ? String(best.CustomerName ?? best.customerName ?? '').trim() : '',
                LeadJobName: best ? String(best.LeadJobName ?? best.leadJobName ?? '').trim() : '',
            };
        })
        .sort((a, b) => {
            const na = Number(a.ID);
            const nb = Number(b.ID);
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return String(a.ID).localeCompare(String(b.ID));
        });
}

/**
 * Pricing list (pending + search). Does not use `EnquiryMaster.Status` or `EnquiryPricingOptions` for list rows.
 */
// Helper to get Enquiry List with Pricing Tree
async function getEnquiryPricingList(userEmail, search = null, pendingOnly = true, opts = {}) {
    await ensureQuotingOrNotColumn();
    if (!userEmail) return [];

    const ctx = await resolvePricingAccessContext(userEmail);
    if (!ctx.user) return [];
    const { isAdmin, isCcUser, normalizedEmail, userDepartment } = ctx;

    const divisionRaw = opts && opts.division != null ? String(opts.division) : '';
    const divisionTrim = divisionRaw.trim();

    // 2. Fetch Enquiries (SQL-scoped: CC coordinators vs assigned sales engineers only)
    const request = new sql.Request();
    if (divisionTrim) {
        request.input('divisionFilter', sql.NVarChar, divisionTrim);
    }
    let baseQuery = `
        SELECT 
            E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.DueDate, E.CreatedBy, E.EnquiryDate
        FROM EnquiryMaster E
        WHERE 1=1
    `;

    if (!isAdmin) {
        // Always bind — CC branch may OR with ConcernedSE visibility for users who are both CC coordinators
        // and assigned SEs. Previously CC-only EXISTS hid enquiries (e.g. RequestNo 11) where the user is on
        // ConcernedSE but not listed on CCMailIds for any line on that enquiry.
        request.input('pricingUserEmail', sql.NVarChar, normalizedEmail);
        const concernedSeExistsSql = `
            EXISTS (
                SELECT 1
                FROM ConcernedSE c
                INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
                WHERE c.RequestNo = E.RequestNo
                  AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(@pricingUserEmail))
            )
        `;
        if (isCcUser) {
            request.input('pricingCcPattern', sql.NVarChar, `%,${normalizedEmail},%`);
            const locCc = (normalizedEmail.split('@')[0] || '').trim();
            const dualCcPat = locCc.length >= 2;
            if (dualCcPat) {
                request.input('pricingCcPatternLocal', sql.NVarChar, `%,${locCc},%`);
            }
            const ccMefMatch = (alias) =>
                dualCcPat
                    ? `(
                          N',' + REPLACE(REPLACE(ISNULL(${alias}.CCMailIds, N''), N' ', N''), N';', N',') + N',' LIKE @pricingCcPattern
                          OR N',' + REPLACE(REPLACE(ISNULL(${alias}.CCMailIds, N''), N' ', N''), N';', N',') + N',' LIKE @pricingCcPatternLocal
                      )`
                    : `N',' + REPLACE(REPLACE(ISNULL(${alias}.CCMailIds, N''), N' ', N''), N';', N',') + N',' LIKE @pricingCcPattern`;
            /**
             * Division filter + CC: coordinators often appear on Master_EnquiryFor for “Civil Project” while
             * instance EnquiryFor rows join a template whose CCMailIds omit them — then the old “any line CC”
             * gate hid the enquiry. When Division is set, also allow enquiries that have that department on
             * the enquiry if the user is CC on any master row for that same DepartmentName.
             */
            const ccDivisionCoordinatorSql =
                divisionTrim
                    ? `
                    OR EXISTS (
                        SELECT 1
                        FROM dbo.EnquiryFor efCcDiv
                        INNER JOIN dbo.Master_EnquiryFor mefCcDiv
                            ON (efCcDiv.ItemName = mefCcDiv.ItemName OR efCcDiv.ItemName LIKE N'% - ' + mefCcDiv.ItemName)
                        WHERE efCcDiv.RequestNo = E.RequestNo
                          AND LTRIM(RTRIM(ISNULL(mefCcDiv.DepartmentName, N''))) = LTRIM(RTRIM(@divisionFilter))
                          AND EXISTS (
                              SELECT 1
                              FROM dbo.Master_EnquiryFor mefTpl
                              WHERE LTRIM(RTRIM(ISNULL(mefTpl.DepartmentName, N''))) = LTRIM(RTRIM(@divisionFilter))
                                AND ${ccMefMatch('mefTpl')}
                          )
                    )
                  `
                    : '';
            baseQuery += `
                AND (
                    EXISTS (
                        SELECT 1
                        FROM EnquiryFor ef
                        INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                        WHERE ef.RequestNo = E.RequestNo
                          AND ${ccMefMatch('mef')}
                    )
                    OR ${concernedSeExistsSql}
                    ${ccDivisionCoordinatorSql}
                )
            `;
        } else {
            baseQuery += ` AND ${concernedSeExistsSql} `;
        }
    }

    // Latest price update (MAX EnquiryPricingValues.UpdatedAt per enquiry) — Search Pricing list only
    if (!pendingOnly) {
        const df = parsePricingListYmd((opts && opts.dateFrom) || '');
        const dt = parsePricingListYmd((opts && opts.dateTo) || '');
        if (df && dt) {
            request.input('pricingListDateFrom', sql.Date, df);
            request.input('pricingListDateTo', sql.Date, dt);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryPricingValues vDt
                    WHERE vDt.RequestNo = E.RequestNo
                    GROUP BY vDt.RequestNo
                    HAVING MAX(vDt.UpdatedAt) IS NOT NULL
                      AND CAST(MAX(vDt.UpdatedAt) AS DATE) BETWEEN @pricingListDateFrom AND @pricingListDateTo
                ) `;
        } else if (df) {
            request.input('pricingListDateFrom', sql.Date, df);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryPricingValues vDt
                    WHERE vDt.RequestNo = E.RequestNo
                    GROUP BY vDt.RequestNo
                    HAVING MAX(vDt.UpdatedAt) IS NOT NULL
                      AND CAST(MAX(vDt.UpdatedAt) AS DATE) >= @pricingListDateFrom
                ) `;
        } else if (dt) {
            request.input('pricingListDateTo', sql.Date, dt);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryPricingValues vDt
                    WHERE vDt.RequestNo = E.RequestNo
                    GROUP BY vDt.RequestNo
                    HAVING MAX(vDt.UpdatedAt) IS NOT NULL
                      AND CAST(MAX(vDt.UpdatedAt) AS DATE) <= @pricingListDateTo
                ) `;
        }
    }

    const searchTrim = search && String(search).trim();
    if (searchTrim) {
        baseQuery += ` AND (
            CAST(E.RequestNo AS NVARCHAR(32)) LIKE @search
            OR E.ProjectName LIKE @search
            OR E.CustomerName LIKE @search
            OR E.ClientName LIKE @search
            OR E.ConsultantName LIKE @search
            OR EXISTS (
                SELECT 1 FROM dbo.EnquiryPricingValues vSrch
                WHERE vSrch.RequestNo = E.RequestNo
                  AND LTRIM(RTRIM(ISNULL(vSrch.UpdatedBy, N''))) LIKE @search
            )
        ) `;
        request.input('search', sql.NVarChar, `%${searchTrim}%`);
    }

    if (divisionTrim) {
        /**
         * Division dropdown: CC → Master_EnquiryFor.DepartmentName (CC rows); Concerned SE → Master_ConcernedSE.Department.
         * Filtering only by Master_EnquiryFor.DepartmentName broke Pending Pricing for engineers when that label
         * did not exactly match the master column (enquiries vanished even though their Concerned SE row matched).
         */
        if (!isAdmin && !isCcUser) {
            request.input('pricingDivisionUserEmail', sql.NVarChar, normalizedEmail);
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.ConcernedSE c
                    INNER JOIN dbo.Master_ConcernedSE m
                        ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
                    WHERE c.RequestNo = E.RequestNo
                      AND LOWER(LTRIM(RTRIM(ISNULL(m.EmailId, N'')))) = LOWER(LTRIM(@pricingDivisionUserEmail))
                      AND LTRIM(RTRIM(ISNULL(m.Department, N''))) = LTRIM(RTRIM(@divisionFilter))
                )
            `;
        } else {
            baseQuery += `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryFor efDiv
                    INNER JOIN dbo.Master_EnquiryFor mefDiv
                        ON (efDiv.ItemName = mefDiv.ItemName OR efDiv.ItemName LIKE N'% - ' + mefDiv.ItemName)
                    WHERE efDiv.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(ISNULL(mefDiv.DepartmentName, N''))) = LTRIM(RTRIM(@divisionFilter))
                )
            `;
        }
    }

    baseQuery += ` ORDER BY E.DueDate DESC, E.RequestNo DESC `;

    const enquiriesRes = await request.query(baseQuery);
    const enquiries = enquiriesRes.recordset;

    if (enquiries.length === 0) return [];

    const requestNos = enquiries.map(e => e.RequestNo);
    /** RequestNo may be int from SQL driver — never call .replace on a number (would throw and break the list). */
    const requestNosList = requestNos.map((r) => `'${String(r).replace(/'/g, "''")}'`).join(',');

    /**
     * Must match the list gate for non-CC users (ConcernedSE + Master_ConcernedSE on EmailId).
     * The old SEName-only lookup missed rows when SEName text drifted from Master.FullName even though
     * the user still appears on the enquiry via the email join — then isConcernedSE was false and
     * anchor / pending logic never treated them as assigned SE.
     */
    let concernedRequestNos = new Set();
    if (normalizedEmail && requestNosList.length > 0) {
        const cseReq = new sql.Request();
        cseReq.input('pricingListUserEmail', sql.NVarChar, normalizedEmail);
        const cseRes = await cseReq.query(`
            SELECT DISTINCT c.RequestNo
            FROM ConcernedSE c
            INNER JOIN Master_ConcernedSE m
              ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.SEName, N''))))
            WHERE LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(@pricingListUserEmail))
              AND c.RequestNo IN (${requestNosList})
        `);
        cseRes.recordset.forEach((row) => concernedRequestNos.add(String(row.RequestNo)));
    }

    // 4. Fetch Jobs
    const jobsRes = await sql.query(`
        SELECT 
            EF.RequestNo, EF.ID, EF.ParentID, EF.ItemName, EF.LeadJobCode, EF.LeadJobName,
            MEF.CommonMailIds, MEF.CCMailIds, MEF.DepartmentName
        FROM EnquiryFor EF
        LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
        WHERE EF.RequestNo IN (${requestNosList})
    `);
    const allJobs = jobsRes.recordset;

    // 5b. Fetch EnquiryCustomer (authoritative external customer source)
    const enquiryCustomersRes = await sql.query(`
        SELECT RequestNo, CustomerName
        FROM EnquiryCustomer
        WHERE RequestNo IN (${requestNosList})
    `);
    const allEnquiryCustomers = enquiryCustomersRes.recordset;

    // 5. Fetch Prices first — same join as SSMS: resolve current EnquiryFor row (ID drift vs ItemName match)
    const pricesRes = await sql.query(`
        SELECT
            v.ID,
            v.RequestNo,
            v.OptionID,
            v.EnquiryForID,
            v.EnquiryForItem,
            v.Price,
            v.UpdatedAt,
            v.UpdatedBy,
            v.PriceOption,
            v.CustomerName,
            v.LeadJobName${epvQuotingOrNotSelectSql('v')},
            m.MatchedEnquiryForId,
            m.MatchedItemName,
            m.MatchedParentId
        FROM dbo.EnquiryPricingValues v
        OUTER APPLY (
            SELECT TOP 1
                ef.ID AS MatchedEnquiryForId,
                ef.ItemName AS MatchedItemName,
                ef.ParentID AS MatchedParentId
            FROM dbo.EnquiryFor ef
            WHERE ef.RequestNo = v.RequestNo
              AND (
                    (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                 OR (
                        LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                    AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                    )
                )
            ORDER BY
                CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                ef.ID
        ) AS m
        WHERE v.RequestNo IN (${requestNosList})
    `);
    const allPrices = (pricesRes.recordset || []).map(normalizePricingValueRow);

    // 7. Map and Process
    return enquiries.map(enq => {
        // SQL/JS type drift: RequestNo can be int 28 vs string "28" — loose == often works but not inside Set.has / strict filters.
        const reqNoEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

        const enqJobsRaw = allJobs.filter(j => reqNoEq(j.RequestNo, enq.RequestNo));
        const seenIds = new Set();
        const enqJobs = [];
        for (const job of enqJobsRaw) {
            const jid = job.ID ?? job.id;
            if (jid == null || jid === '') continue;
            const jkey = String(jid);
            if (!seenIds.has(jkey)) {
                seenIds.add(jkey);
                enqJobs.push(job);
            }
        }

        const enqPrices = allPrices.filter(p => reqNoEq(p.RequestNo, enq.RequestNo));
        const enqOptions = buildSyntheticPricingOptionsFromValuesRows(enqPrices);

        const isCreator =
            ctx.userFullName &&
            enq.CreatedBy &&
            ctx.userFullName.toLowerCase().trim() === String(enq.CreatedBy).toLowerCase().trim();
        const isConcernedSE = concernedRequestNos.has(String(enq.RequestNo));

        const effDeptList = (divisionTrim || ctx.userDepartment || '').toLowerCase().trim();
        const hierarchyScopedJobs = filterJobsByDepartment(enqJobs, {
            userDepartment: effDeptList,
            isAdmin,
            isCreator,
            isConcernedSE,
            userEmail,
            userFullName: ctx.userFullName || '',
        });
        const hierarchyJobIdSet = new Set(hierarchyScopedJobs.map((j) => String(jobIdOfPricing(j))));

        /** Same row identity as PUT /api/pricing/value (mssql may return ID or id). */
        const jobIdOf = jobIdOfPricing;

        const normalizeName = normalizePricingJobName;
        /** Anchors from Master department / CC — before intersecting with `filterJobsByDepartment` output. */
        const anchorCandidates = getPricingAnchorJobsForDivision(enqJobs, ctx, userEmail, divisionTrim);
        let myJobs = anchorCandidates;
        if (!isAdmin) {
            if (isConcernedSE) {
                // Assigned SE is already limited to enquiries they appear on (SQL list gate). Do not intersect
                // with filterJobsByDepartment — a partial match (e.g. only BMS) would drop HVAC anchors while
                // another division still has prices, and pending would miss missing HVAC base prices.
                // If Master.Department / CC anchors resolve to nothing (common with blank Department), use every
                // job on the enquiry so pending can still see missing HVAC base rows.
                myJobs = anchorCandidates.length > 0 ? [...anchorCandidates] : [...enqJobs];
            } else if (isCcUser && divisionTrim) {
                // CC + Division: dropdown is the own-job scope (like SE + department). Hierarchy intersection
                // uses profile/CC line mails and often drops all anchors for coordinators listed only on master.
                myJobs = anchorCandidates.length > 0 ? [...anchorCandidates] : [...enqJobs];
            } else {
                myJobs = myJobs.filter((j) => hierarchyJobIdSet.has(String(jobIdOf(j))));
            }
        }

        /**
         * `getPricingAnchorJobs` only links Master.Department / CC mails to EnquiryFor.ItemName text.
         * Assigned ConcernedSE / creators / CC users can be SQL-scoped to the enquiry while that text match
         * returns zero anchors — then the whole enquiry vanished from Pending Pricing (e.g. enquiry 9, bmsseng1).
         * Fall back to hierarchy-visible jobs, or all jobs on the enquiry for these roles.
         *
         * ConcernedSE: if anchors are still empty, prefer full anchors when any exist; else hierarchy/enquiry jobs.
         */
        if (
            !isAdmin &&
            myJobs.length === 0 &&
            enqJobs.length > 0 &&
            (isConcernedSE || isCreator || isCcUser)
        ) {
            if (isConcernedSE && anchorCandidates.length > 0) {
                myJobs = [...anchorCandidates];
            } else {
                myJobs = hierarchyScopedJobs.length > 0 ? [...hierarchyScopedJobs] : [...enqJobs];
            }
        }

        if (myJobs.length === 0) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out - no in-scope jobs for user ${userEmail} (admin=${isAdmin}, cc=${isCcUser})`);
            console.log(`[Pricing]   Total jobs in enquiry: ${enqJobs.length}`);
            return null;
        }

        // Include ancestor chain to each anchor so root (ownjob) stays in the tree when only subjobs
        // match the user's department/CC anchor — otherwise flatList never visits ownjob Base Price and
        // Pending Pricing wrongly drops the enquiry when subjobs are priced but lead Base Price is missing.
        const visibleJobs = expandVisibleJobIdsWithAncestors(myJobs, enqJobs);

        // Build Display String
        const childrenMap = {};
        enqJobs.forEach(j => {
            if (j.ParentID && String(j.ParentID) !== '0') {
                const pidStr = String(j.ParentID);
                if (!childrenMap[pidStr]) childrenMap[pidStr] = [];
                childrenMap[pidStr].push(j);
            }
        });

        const allVisibleJobs = enqJobs.filter(j => visibleJobs.has(String(jobIdOf(j)))).sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
        const visualRoots = allVisibleJobs.filter(j => !j.ParentID || String(j.ParentID) === '0' || !visibleJobs.has(String(j.ParentID)));

        const flatList = [];
        const traverse = (job, level) => {
            flatList.push({ ...job, level });
            const children = childrenMap[String(jobIdOf(job))] || [];
            children.sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
            children.forEach(child => {
                const cid = jobIdOf(child);
                if (cid != null && visibleJobs.has(String(cid))) traverse(child, level + 1);
            });
        };

        /**
         * Lead label for list/grid: prefer EnquiryFor.LeadJobCode, else L# parsed from ItemName ("L2 - Civil…"),
         * else sequential L1… only when the enquiry truly has no coded roots (avoids labelling an L2 branch as L1).
         */
        const extractLCodeFromJobRecord = (jobRec) => {
            if (!jobRec) return '';
            const raw = (jobRec.LeadJobCode || jobRec.leadJobCode || '').toString().trim().toUpperCase();
            if (/^L\d+$/.test(raw)) return raw;
            const nm = String(jobRec.ItemName || jobRec.itemName || '');
            const m1 = nm.match(/^\s*([lL]\d+)\s*-/);
            if (m1) return m1[1].toUpperCase();
            const m2 = nm.match(/\(([lL]\d+)\)\s*$/);
            if (m2) return m2[1].toUpperCase();
            const m3 = nm.match(/\b([lL]\d+)\b/);
            if (m3) return m3[1].toUpperCase();
            return '';
        };

        const jobLeadMap = {};
        const rootsOnly = [...visualRoots].sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
        const rootCodeMap = {};
        const usedLeadCodes = new Set();
        rootsOnly.forEach((r, idx) => {
            const rid = jobIdOf(r);
            if (rid == null) return;
            let code = extractLCodeFromJobRecord(r);
            if (!code) {
                let n = idx + 1;
                code = `L${n}`;
                while (usedLeadCodes.has(code) && n < 99) {
                    n += 1;
                    code = `L${n}`;
                }
            }
            if (usedLeadCodes.has(code)) {
                let n = 1;
                let alt = `L${n}`;
                while (usedLeadCodes.has(alt) && n < 99) {
                    n += 1;
                    alt = `L${n}`;
                }
                code = alt;
            }
            usedLeadCodes.add(code);
            rootCodeMap[String(rid)] = code;
        });

        allVisibleJobs.forEach(job => {
            let curr = job;
            let safety = 0;
            let visited = new Set();
            while (curr.ParentID && String(curr.ParentID) !== '0' && visibleJobs.has(String(curr.ParentID)) && safety < 10) {
                if (visited.has(String(curr.ParentID))) break;
                visited.add(String(curr.ParentID));
                const p = allVisibleJobs.find(item => String(jobIdOf(item)) === String(curr.ParentID));
                if (p) curr = p;
                else break;
                safety++;
            }
            const jid = jobIdOf(job);
            const cid = jobIdOf(curr);
            if (jid != null) jobLeadMap[String(jid)] = (cid != null && rootCodeMap[String(cid)]) || 'L1';
        });

        visualRoots.forEach(root => traverse(root, 0));

        // IMPORTANT:
        // Pending determination must be based on the actual displayed pricing contexts
        // (internal/external/customer-targeted), not just "job has any price row".
        // We'll compute hasPendingItems after displayItems are built.
        let hasPendingItems = false;

        // Build a quick map: optionId -> option row (for joining). String keys — driver may return OptionID as int or string.
        const optionMap = {};
        enqOptions.forEach(o => {
            const oid = o.OptionID ?? o.optionID ?? o.ID;
            if (oid != null && oid !== '') optionMap[String(oid)] = o;
        });

        const jobMap = {};
        enqJobs.forEach(j => {
            const jid = jobIdOf(j);
            if (jid != null && jid !== '') jobMap[String(jid)] = j;
        });

        /**
         * Pending scoping for non-admin SEs — needed before the pricing-list forest loop so external-customer
         * direct-row checks match `pendingFromVisibleJobsBase`.
         */
        const userAnchorIdSet = new Set(
            myJobs.map((j) => String(jobIdOf(j))).filter((id) => id && id !== 'undefined')
        );
        const jobIsAnchorOrDescendantOfUserAnchor = (jobRec) => {
            const jidStr = String(jobIdOf(jobRec));
            if (userAnchorIdSet.has(jidStr)) return true;
            let cur = jobRec;
            let guard = 0;
            while (cur && guard++ < 50) {
                const pid = cur.ParentID ?? cur.parentID;
                if (!pid || String(pid) === '0' || pid === 0) return false;
                if (userAnchorIdSet.has(String(pid))) return true;
                cur = jobMap[String(pid)];
            }
            return false;
        };
        const scopePendingToUserAnchorsOnly = !isAdmin && !isCcUser;

        const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        /** Match EnquiryPricingValues.CustomerName to list labels (strip trailing " (L2)" etc.). */
        const normPricingCustomerKey = (s) =>
            String(s || '')
                .replace(/\s*\(L\d+\)\s*$/i, '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
        /** DB `CustomerName` is often shorter/longer than list header text — keep strict equality first, then prefix. */
        const pricingCustomerRowMatchesKey = (cnRaw, wantKey) => {
            if (!wantKey) return true;
            const n = normPricingCustomerKey(cnRaw);
            if (!n) return false;
            if (n === wantKey) return true;
            const shorter = n.length <= wantKey.length ? n : wantKey;
            const longer = n.length <= wantKey.length ? wantKey : n;
            if (shorter.length < 4) return false;
            return longer.startsWith(shorter);
        };
        const jobNameSetNorm = new Set(enqJobs.map(j => normalize(j.ItemName)));

        /** Trim only — no L1-/Sub Job- stripping; names must match as stored. */
        const stripLeadName = (s) => String(s ?? '').trim();

        const userDivisionKey = userEmail ? userEmail.split('@')[0].toLowerCase() : '';

        // Collect External Customers
        // Collect External Customers and Deduplicate
        const rawExternal = (enq.CustomerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const externalCustomers = [];
        const normSet = new Set();

        rawExternal.forEach(c => {
            const norm = c.replace(/[.,\s]+$/, '').toLowerCase();
            if (!normSet.has(norm)) {
                externalCustomers.push(c);
                normSet.add(norm);
            }
        });

        // Extra customer names from value rows (not from EnquiryPricingOptions)
        const optionCustomers = new Set();
        const masterCustNorm = new Set(
            (enq.CustomerName || '')
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
                .map((s) => s.replace(/[.,\s]+$/, ''))
        );
        for (const pr of enqPrices) {
            const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
            if (!cn) continue;
            const norm = cn.replace(/[.,\s]+$/, '').toLowerCase();
            if (masterCustNorm.has(norm)) continue;
            if (!normSet.has(norm)) {
                optionCustomers.add(cn);
                normSet.add(norm);
            }
        }

        const rootJob = enqJobs.find(j => !j.ParentID || j.ParentID == '0' || j.ParentID == 0);
        const internalCustomer = rootJob ? rootJob.ItemName.trim() : 'Internal';
        const internalCustomerNormForLabel = normalize(internalCustomer);
        /** Base-price row CustomerName is "external" when not the internal root customer and not another EnquiryFor job name (aligns with quote lead labels). */
        const isExternalPricingCustomer = (customerName) => {
            const cn = String(customerName || '')
                .replace(/\s*\(L\d+\)\s*$/i, '')
                .trim();
            const cnN = normalize(cn);
            return Boolean(cn && cnN !== internalCustomerNormForLabel && !jobNameSetNorm.has(cnN));
        };

        // Customer column: lead anchors → EnquiryCustomer (external) only; subjob-only anchors → immediate parent job name(s) only (never both).
        const finalSet = new Set();
        const normalizeCustomer = (s) => (s || '').replace(/,\s*$/, '').trim().toLowerCase();
        const withLeadCode = (name, code) => {
            const base = (name || '').replace(/,\s*$/, '').trim();
            const c = String(code || '').trim().toUpperCase();
            if (!base) return '';
            if (!c || !/^L\d+$/.test(c)) return base;
            return `${base} (${c})`;
        };
        const addDistinctCustomer = (name) => {
            const clean = (name || '').replace(/,\s*$/, '').trim();
            if (!clean) return;
            const norm = normalizeCustomer(clean);
            if (!finalSet.has(norm)) finalSet.add(norm + '||' + clean);
        };

        const enquiryCustomerNames = allEnquiryCustomers
            .filter(c => reqNoEq(c.RequestNo, enq.RequestNo))
            .map(c => (c.CustomerName || '').trim())
            .filter(Boolean);
        const customerHeaderPool = Array.from(
            new Set(
                [
                    ...enquiryCustomerNames,
                    ...externalCustomers.filter((c) => isExternalPricingCustomer(c)),
                    ...Array.from(optionCustomers).filter((c) => isExternalPricingCustomer(c)),
                ]
                    .map((c) => String(c || '').trim())
                    .filter(Boolean)
            )
        );
        const externalCustomerKeySet = new Set(
            customerHeaderPool
                .map((name) => normPricingCustomerKey(name))
                .filter(Boolean)
        );

        /**
         * Pending list customer column keys (Nass, Alkomed, …): used so division-internal base rows
         * (CustomerName = LeadJobName = HVAC/BMS job name) still surface on external customer trees when
         * no per-customer "bridge" row exists yet — e.g. civil lead viewing enquiry 15.
         */
        const listCustomerKeyIsEnquiryExternal = (wantKey) => {
            if (!wantKey) return false;
            return externalCustomerKeySet.has(wantKey);
        };

        const hasSubjobAnchors = myJobs.some((j) => j.ParentID && String(j.ParentID) !== '0' && j.ParentID !== 0);
        const hasLeadAnchors = myJobs.some((j) => !j.ParentID || String(j.ParentID) === '0' || j.ParentID === 0);
        /** User anchors only on subjobs (no lead row): summary shows parent job as label, hides parent prices, lists anchor's descendants' prices. */
        const subjobOnlySummary = hasSubjobAnchors && !hasLeadAnchors;
        const anchorsAsSubjobs = myJobs.filter(
            (j) => j.ParentID && String(j.ParentID) !== '0' && j.ParentID !== 0
        );
        const anchorSubjobIdSet = new Set();
        anchorsAsSubjobs.forEach((j) => {
            const id = jobIdOf(j);
            if (id != null && id !== '') anchorSubjobIdSet.add(String(id));
        });

        // If ownjob is subjob in any visible lead branch, include parent job names.
        if (hasSubjobAnchors) {
            myJobs.forEach((job) => {
                if (!job.ParentID || String(job.ParentID) === '0' || job.ParentID === 0) return;
                const jid = jobIdOf(job);
                const current = jid != null && jobMap[String(jid)] ? jobMap[String(jid)] : job;
                if (!current || !current.ParentID || String(current.ParentID) === '0') return;
                const parent = jobMap[String(current.ParentID)];
                if (!parent || !parent.ItemName) return;
                const leadCode = (() => {
                    const curId = jobIdOf(current);
                    if (curId != null && jobLeadMap[String(curId)]) return jobLeadMap[String(curId)];
                    const pid = jobIdOf(parent);
                    if (pid != null && jobLeadMap[String(pid)]) return jobLeadMap[String(pid)];
                    const raw = (parent.LeadJobCode || current.LeadJobCode || '').toString().trim().toUpperCase();
                    return /^L\d+$/.test(raw) ? raw : '';
                })();
                const label = stripLeadName(parent.ItemName) || String(parent.ItemName).trim();
                addDistinctCustomer(withLeadCode(label, leadCode));
            });
        }

        // If ownjob is lead in any branch (or no subjob anchors detected), include external customers.
        if (hasLeadAnchors || !hasSubjobAnchors) {
            const leadCodes = (() => {
                const set = new Set();
                myJobs.forEach((j) => {
                    if (j.ParentID && String(j.ParentID) !== '0' && j.ParentID !== 0) return;
                    const jid = jobIdOf(j);
                    const fromMap = jid != null ? jobLeadMap[String(jid)] : '';
                    const raw = (fromMap || j.LeadJobCode || '').toString().trim().toUpperCase();
                    if (/^L\d+$/.test(raw)) set.add(raw);
                });
                return Array.from(set);
            })();
            customerHeaderPool.forEach((c) => {
                if (leadCodes.length === 0) {
                    addDistinctCustomer(c);
                } else {
                    leadCodes.forEach((code) => addDistinctCustomer(withLeadCode(c, code)));
                }
            });
            /*
             * EnquiryCustomer rows are often empty while EnquiryMaster.CustomerName still lists externals.
             * Without this, lead-job summary never gets the "external + ownjob price" header and falls back to DFS job names (e.g. BMS Project first).
             */
            if (hasLeadAnchors && enquiryCustomerNames.length === 0 && externalCustomers.length > 0) {
                externalCustomers.forEach((c) => {
                    if (!isExternalPricingCustomer(c)) return;
                    if (leadCodes.length === 0) {
                        addDistinctCustomer(c);
                    } else {
                        leadCodes.forEach((code) => addDistinctCustomer(withLeadCode(c, code)));
                    }
                });
            }
        }

        const finalCustomers = Array.from(finalSet).map(v => v.split('||')[1]).filter(c => {
            const cNorm = normalize(c || '');
            if (userDivisionKey && cNorm.includes(userDivisionKey)) return false;
            return true;
        });

        const fullCustomerName = finalCustomers.join(', ');

        /** Full tree lines — used for hasPendingItems (unchanged semantics). */
        const displayItemsRaw = [];

        /** Mirrors sqlStripPricingName (quote sidebar): SUB JOB…-… and Ln - … prefixes on value rows. */
        const stripSqlStyleItemName = (s) => {
            if (s == null || s === '') return '';
            let t = String(s).trim();
            if (typeof t.normalize === 'function') t = t.normalize('NFKC');
            if (/^sub job/i.test(t) && t.includes('-')) {
                t = t.substring(t.indexOf('-') + 1).trim();
            }
            if (/^L\d+\s*-\s*/i.test(t)) {
                t = t.replace(/^L\d+\s*-\s*/i, '').trim();
            }
            return t;
        };

        /** Align with grid/SQL: option ItemName and EnquiryFor.ItemName can differ slightly (e.g. "BMS" vs "BMS Project"). */
        const itemNamesAlign = (optItem, jobItem) => {
            const o = stripSqlStyleItemName(optItem);
            const j = stripSqlStyleItemName(jobItem);
            if (!o) return false;
            if (!j) return false;
            if (o === j) return true;
            const no = normalize(o);
            const nj = normalize(j);
            if (no === nj) return true;
            if (no.length >= 3 && nj.length >= 3 && (no.includes(nj) || nj.includes(no))) return true;
            return false;
        };

        const parsePriceNum = (v) => {
            if (v == null || v === '') return 0;
            let x = v;
            if (typeof x === 'object' && x !== null && typeof x.valueOf === 'function') {
                const vo = x.valueOf();
                if (typeof vo === 'number' || typeof vo === 'string') x = vo;
            }
            const n = parseFloat(String(x).replace(/,/g, ''));
            return Number.isFinite(n) ? n : 0;
        };

        const isDeclineToQuotePricingRow = (pr) => {
            const v = String(pr?.Quotingornot ?? pr?.quotingornot ?? '').trim().toLowerCase();
            return v === 'yes' || v === 'y' || v === '1' || v === 'true';
        };

        const normOptName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

        /** Matches "Base Price" and "Base Price (…)", "Base Price - …" etc. */
        const matchesOptionTarget = (nameStr, targetLower) => {
            const n = normOptName(nameStr);
            if (n === targetLower) return true;
            if (n.startsWith(targetLower + '(') || n.startsWith(targetLower + ' ') || n.startsWith(targetLower + '-')) return true;
            return false;
        };

        /**
         * Pending "Subjob Prices" — batch SQL joins values to EnquiryFor (same as SSMS):
         *   (EnquiryForID = ef.ID) OR (LTRIM(RTRIM(EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))).
         *   MatchedEnquiryForId is compared to the current job ID first; then legacy JS fallbacks.
         *   PriceOption / OptionID classify Base Price vs Optional. Scope: myJobs + visibleJobs + flatList.
         */
        const getDivisionPrice = (jobId, optionName) => {
            const job = jobMap[String(jobId)];
            if (!job) return { price: 0, updatedAt: null, customerName: null, updatedBy: null };

            const optNameLower = normOptName(optionName);

            /** Values-first: PriceOption on the value row is the primary classifier when present. */
            const valueRowMatchesOptionTarget = (pr) => {
                const po = pr.PriceOption ?? pr.priceOption;
                if (po != null && String(po).trim() !== '') {
                    return matchesOptionTarget(po, optNameLower);
                }
                const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
                const opt = optIdRaw != null && optIdRaw !== '' ? optionMap[String(optIdRaw)] : null;
                return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, optNameLower));
            };

            const trimEq = (a, b) => {
                const x = stripSqlStyleItemName(a).toLowerCase();
                const y = stripSqlStyleItemName(b).toLowerCase();
                return x.length > 0 && y.length > 0 && x === y;
            };

            const rowMatchesJob = (pr) => {
                const matchedId =
                    pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
                // Strict ID-first matching: avoid name-based collisions across branches
                // when multiple EnquiryFor rows share the same ItemName (e.g. "BMS Project").
                if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                    return String(matchedId) === String(jobId);
                }
                if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') {
                    return String(pr.EnquiryForID) === String(jobId);
                }
                if (trimEq(pr.EnquiryForItem, job.ItemName)) return true;
                if (pr.EnquiryForItem && itemNamesAlign(pr.EnquiryForItem, job.ItemName)) return true;
                return false;
            };

            let bestRow = null;
            for (const pr of enqPrices) {
                if (parsePriceNum(pr.Price) <= 0) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                if (!bestRow || new Date(pr.UpdatedAt) > new Date(bestRow.UpdatedAt)) {
                    bestRow = pr;
                }
            }

            if (bestRow) {
                const cust = String(bestRow.CustomerName ?? bestRow.customerName ?? '').trim();
                const by = String(bestRow.UpdatedBy ?? bestRow.updatedBy ?? '').trim();
                return {
                    price: parsePriceNum(bestRow.Price),
                    updatedAt: bestRow.UpdatedAt,
                    customerName: cust || null,
                    updatedBy: by || null,
                    declinedToQuote: false,
                };
            }

            let declineRow = null;
            for (const pr of enqPrices) {
                if (!isDeclineToQuotePricingRow(pr)) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                if (!declineRow || new Date(pr.UpdatedAt) > new Date(declineRow.UpdatedAt)) {
                    declineRow = pr;
                }
            }
            if (declineRow) {
                const cust = String(declineRow.CustomerName ?? declineRow.customerName ?? '').trim();
                const by = String(declineRow.UpdatedBy ?? declineRow.updatedBy ?? '').trim();
                return {
                    price: 0,
                    updatedAt: declineRow.UpdatedAt,
                    customerName: cust || null,
                    updatedBy: by || null,
                    declinedToQuote: true,
                };
            }
            return { price: 0, updatedAt: null, customerName: null, updatedBy: null, declinedToQuote: false };
        };

        /**
         * Pending list only: require a priced base row that truly belongs to this EnquiryFor row (ID or exact
         * item text). `getDivisionPrice` also uses `itemNamesAlign`, which can wrongly attach one division's
         * price to a sibling when names partially overlap — then pending disappears while HVAC still has no row.
         */
        const valueRowIsBasePrice = (pr) => {
            const po = pr.PriceOption ?? pr.priceOption;
            if (po != null && String(po).trim() !== '') {
                return matchesOptionTarget(po, 'base price');
            }
            const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
            const opt = optIdRaw != null && optIdRaw !== '' ? optionMap[String(optIdRaw)] : null;
            return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, 'base price'));
        };

        /**
         * One internal Base row per subjob (CustomerName = LeadJobName, e.g. HVAC submits to "HVAC Project");
         * external customers on the same LeadJobName inherit that amount for list totals + job forest.
         */
        const isInternalLeadSubmittedPriceRow = (pr) => {
            const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
            const lj = String(pr.LeadJobName ?? pr.leadJobName ?? '').trim();
            if (!cn || !lj) return false;
            return normPricingCustomerKey(cn) === normPricingCustomerKey(lj);
        };

        /**
         * Same matching as `getDivisionPrice`, but only considers rows for one external/customer key (list split).
         * Optional `listInheritCtx.priceRowInSubtree`: when no row for that customer on this job, use the internal
         * lead submission row (CustomerName = LeadJobName) if this customer has any base row with the same LeadJobName.
         * Optional `listInheritCtx.customerForestRootId`: the EnquiryFor `ID` of the list tree root for this customer
         * block. For enquiry **externals** on the **root** (e.g. HVAC (L2) for Yateem): only an explicit
         * `EnquiryPricingValues` row for that company — never another external’s own-job base (e.g. Airmech’s 20).
         * For **subjobs** under that root, use normal job matching (`getDivisionPrice` / internal rows) so division
         * BMS / HVAC subjob updates show for every L2 customer who shares the same `EnquiryFor` branch.
         */
        const getDivisionPriceForCustomer = (jobId, optionName, customerNormKey, listInheritCtx) => {
            if (!customerNormKey) return getDivisionPrice(jobId, optionName);
            const job = jobMap[String(jobId)];
            if (!job) return { price: 0, updatedAt: null, customerName: null, updatedBy: null };

            const optNameLower = normOptName(optionName);

            const valueRowMatchesOptionTarget = (pr) => {
                const po = pr.PriceOption ?? pr.priceOption;
                if (po != null && String(po).trim() !== '') {
                    return matchesOptionTarget(po, optNameLower);
                }
                const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
                const opt = optIdRaw != null && optIdRaw !== '' ? optionMap[String(optIdRaw)] : null;
                return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, optNameLower));
            };

            const trimEq = (a, b) => {
                const x = stripSqlStyleItemName(a).toLowerCase();
                const y = stripSqlStyleItemName(b).toLowerCase();
                return x.length > 0 && y.length > 0 && x === y;
            };

            const rowMatchesJob = (pr) => {
                const matchedId =
                    pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
                if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                    return String(matchedId) === String(jobId);
                }
                if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') {
                    return String(pr.EnquiryForID) === String(jobId);
                }
                if (trimEq(pr.EnquiryForItem, job.ItemName)) return true;
                if (pr.EnquiryForItem && itemNamesAlign(pr.EnquiryForItem, job.ItemName)) return true;
                return false;
            };

            let bestRow = null;
            for (const pr of enqPrices) {
                if (parsePriceNum(pr.Price) <= 0) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
                if (!pricingCustomerRowMatchesKey(cn, customerNormKey)) continue;
                if (!bestRow || new Date(pr.UpdatedAt) > new Date(bestRow.UpdatedAt)) {
                    bestRow = pr;
                }
            }

            if (bestRow) {
                const cust = String(bestRow.CustomerName ?? bestRow.customerName ?? '').trim();
                const by = String(bestRow.UpdatedBy ?? bestRow.updatedBy ?? '').trim();
                return {
                    price: parsePriceNum(bestRow.Price),
                    updatedAt: bestRow.UpdatedAt,
                    customerName: cust || null,
                    updatedBy: by || null,
                    declinedToQuote: false,
                };
            }

            let declineRow = null;
            for (const pr of enqPrices) {
                if (!isDeclineToQuotePricingRow(pr)) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
                if (!pricingCustomerRowMatchesKey(cn, customerNormKey)) continue;
                if (!declineRow || new Date(pr.UpdatedAt) > new Date(declineRow.UpdatedAt)) {
                    declineRow = pr;
                }
            }
            if (declineRow) {
                const cust = String(declineRow.CustomerName ?? declineRow.customerName ?? '').trim();
                const by = String(declineRow.UpdatedBy ?? declineRow.updatedBy ?? '').trim();
                return {
                    price: 0,
                    updatedAt: declineRow.UpdatedAt,
                    customerName: cust || null,
                    updatedBy: by || null,
                    declinedToQuote: true,
                };
            }

            const rootIdForList =
                listInheritCtx && listInheritCtx.customerForestRootId != null
                    ? String(listInheritCtx.customerForestRootId)
                    : '';
            const isListCustomerRoot = rootIdForList && String(jobId) === rootIdForList;
            if (listCustomerKeyIsEnquiryExternal(customerNormKey) && isListCustomerRoot) {
                return { price: 0, updatedAt: null, customerName: null, updatedBy: null, declinedToQuote: false };
            }

            if (listCustomerKeyIsEnquiryExternal(customerNormKey) && !isListCustomerRoot) {
                const fb = getDivisionPrice(jobId, optionName);
                if (fb && (parsePriceNum(fb.price) > 0 || fb.declinedToQuote)) {
                    const fbn = String(fb.customerName || '').trim();
                    if (fbn && isExternalPricingCustomer(fbn) && !pricingCustomerRowMatchesKey(fbn, customerNormKey)) {
                        /* other external’s own-name row: try internal inheritance only */
                    } else {
                        return {
                            price: parsePriceNum(fb.price),
                            updatedAt: fb.updatedAt,
                            customerName: fbn || null,
                            updatedBy: String(fb.updatedBy ?? '').trim() || null,
                            declinedToQuote: !!fb.declinedToQuote,
                        };
                    }
                }
            }

            const priceRowInSubtreeFn = listInheritCtx && typeof listInheritCtx.priceRowInSubtree === 'function'
                ? listInheritCtx.priceRowInSubtree
                : null;
            if (!priceRowInSubtreeFn) {
                return { price: 0, updatedAt: null, customerName: null, updatedBy: null, declinedToQuote: false };
            }

            const externalCustomerSharesLeadWithInternalRow = (wantKey, internalPr) => {
                const lj = normPricingCustomerKey(
                    String(internalPr.LeadJobName ?? internalPr.leadJobName ?? '').trim()
                );
                if (!lj) return false;
                const linked = enqPrices.some((p) => {
                    if (parsePriceNum(p.Price) <= 0) return false;
                    if (!valueRowIsBasePrice(p)) return false;
                    if (!priceRowInSubtreeFn(p)) return false;
                    const pcn = String(p.CustomerName ?? p.customerName ?? '').trim();
                    if (!pricingCustomerRowMatchesKey(pcn, wantKey)) return false;
                    return (
                        normPricingCustomerKey(String(p.LeadJobName ?? p.leadJobName ?? '').trim()) === lj
                    );
                });
                if (linked) return true;
                // No bridge row yet (CustomerName = Nass + LeadJobName = HVAC): still inherit internal
                // division rows when LeadJobName names an enquiry job (HVAC, BMS, Civil root, …).
                if (!listCustomerKeyIsEnquiryExternal(wantKey)) return false;
                return jobNameSetNorm.has(lj);
            };

            let internalBest = null;
            for (const pr of enqPrices) {
                if (parsePriceNum(pr.Price) <= 0) continue;
                if (!valueRowMatchesOptionTarget(pr)) continue;
                if (!rowMatchesJob(pr)) continue;
                if (!isInternalLeadSubmittedPriceRow(pr)) continue;
                if (!externalCustomerSharesLeadWithInternalRow(customerNormKey, pr)) continue;
                if (!internalBest || new Date(pr.UpdatedAt) > new Date(internalBest.UpdatedAt)) {
                    internalBest = pr;
                }
            }

            if (internalBest) {
                const cust = String(internalBest.CustomerName ?? internalBest.customerName ?? '').trim();
                const by = String(internalBest.UpdatedBy ?? internalBest.updatedBy ?? '').trim();
                return {
                    price: parsePriceNum(internalBest.Price),
                    updatedAt: internalBest.UpdatedAt,
                    customerName: cust || null,
                    updatedBy: by || null,
                    declinedToQuote: false,
                };
            }
            return { price: 0, updatedAt: null, customerName: null, updatedBy: null, declinedToQuote: false };
        };

        /**
         * Positive Base Price row for this EnquiryFor job **and** list customer key — no internal inheritance.
         * `getDivisionPriceForCustomer` can surface another division's base on external headers; pending must
         * stay until an explicit `EnquiryPricingValues.CustomerName` row exists for that external.
         */
        const hasDirectCustomerBaseForJobSubtree = (jobId, customerNormKey, priceRowInSubtreeFn) => {
            if (!customerNormKey) return false;
            const job = jobMap[String(jobId)];
            if (!job) return false;
            const optNameLower = normOptName('base price');
            const valueRowMatchesBase = (pr) => {
                const po = pr.PriceOption ?? pr.priceOption;
                if (po != null && String(po).trim() !== '') {
                    return matchesOptionTarget(po, optNameLower);
                }
                const optIdRaw = pr.OptionID ?? pr.optionID ?? pr.OptionId;
                const opt = optIdRaw != null && optIdRaw !== '' ? optionMap[String(optIdRaw)] : null;
                return !!(opt && matchesOptionTarget(opt.OptionName ?? opt.optionName, optNameLower));
            };
            const trimEqDirect = (a, b) => {
                const x = stripSqlStyleItemName(a).toLowerCase();
                const y = stripSqlStyleItemName(b).toLowerCase();
                return x.length > 0 && y.length > 0 && x === y;
            };
            const rowMatchesJobDirect = (pr) => {
                const matchedId =
                    pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
                if (matchedId != null && matchedId !== '' && String(matchedId) !== '0') {
                    return String(matchedId) === String(jobId);
                }
                if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') {
                    return String(pr.EnquiryForID) === String(jobId);
                }
                if (trimEqDirect(pr.EnquiryForItem, job.ItemName)) return true;
                if (pr.EnquiryForItem && itemNamesAlign(pr.EnquiryForItem, job.ItemName)) return true;
                return false;
            };
            for (const pr of enqPrices) {
                if (parsePriceNum(pr.Price) <= 0 && !isDeclineToQuotePricingRow(pr)) continue;
                if (!valueRowMatchesBase(pr)) continue;
                if (!rowMatchesJobDirect(pr)) continue;
                if (priceRowInSubtreeFn && !priceRowInSubtreeFn(pr)) continue;
                const cn = String(pr.CustomerName ?? pr.customerName ?? '').trim();
                if (!pricingCustomerRowMatchesKey(cn, customerNormKey)) continue;
                return true;
            }
            return false;
        };

        const strictPriceRowMatchesJobForBase = (pr, jobRec) => {
            const jid = jobIdOf(jobRec);
            const jidStr = jid != null && jid !== '' ? String(jid) : '';
            if (!jidStr) return false;
            const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
            if (mid != null && String(mid) !== '' && String(mid) !== '0') {
                return String(mid) === jidStr;
            }
            if (pr.EnquiryForID && pr.EnquiryForID != 0 && pr.EnquiryForID != '0') {
                return String(pr.EnquiryForID) === jidStr;
            }
            const eit = stripSqlStyleItemName(pr.EnquiryForItem || '');
            const jit = stripSqlStyleItemName(jobRec.ItemName || jobRec.itemName || '');
            return eit.length > 0 && jit.length > 0 && eit.toLowerCase() === jit.toLowerCase();
        };
        const strictHasPositiveBaseForJob = (jobRec) =>
            enqPrices.some(
                (pr) =>
                    parsePriceNum(pr.Price) > 0.01 &&
                    valueRowIsBasePrice(pr) &&
                    strictPriceRowMatchesJobForBase(pr, jobRec)
            );
        const strictHasDeclinedBaseForJob = (jobRec) =>
            enqPrices.some(
                (pr) =>
                    isDeclineToQuotePricingRow(pr) &&
                    valueRowIsBasePrice(pr) &&
                    strictPriceRowMatchesJobForBase(pr, jobRec)
            );
        const strictJobBaseResolved = (jobRec) =>
            strictHasPositiveBaseForJob(jobRec) || strictHasDeclinedBaseForJob(jobRec);
        const divisionPriceDisplayColumn = (price, declinedToQuote) => {
            if (declinedToQuote) return 'Decline to Quote';
            return parsePriceNum(price) > 0.01 ? price : 'Not Updated';
        };
        const shouldEmitDivisionPriceLine = (price, optName, declinedToQuote) =>
            parsePriceNum(price) > 0.01 || optName === 'Base Price' || !!declinedToQuote;
        const ownJobResolutionStatusFromCounts = (priced, declined, unpriced) => {
            if (unpriced > 0 && priced + declined === 0) return 'None Priced';
            if (unpriced > 0) return 'Partial Priced';
            if (priced + declined > 0) return 'All Quoted';
            return null;
        };

        /**
         * Subjob / grid line label: this job's ItemName + L# (tree indentation shows hierarchy — do not substitute
         * parent job name). External customer + L# when the stored Base Price row targets an external customer.
         * Lead/root rows may still resolve to enquiry customer header text via finalCustomers when it matches L#.
         */
        const buildSubjobPriceDisplayLabel = (jobRec, jobFallback, displayCode, priceCustomerName) => {
            const dc = displayCode || 'L1';
            const pid = jobRec?.ParentID;
            const isSubjob =
                jobRec &&
                pid != null &&
                String(pid) !== '0' &&
                String(pid) !== '' &&
                !(pid === 0);
            /** Always show the EnquiryFor item name for subjobs so "Individual & Subjob Base prices" keeps a tree. */
            if (isSubjob) {
                const nm =
                    stripLeadName(jobRec?.ItemName || jobFallback?.ItemName) ||
                    String(jobRec?.ItemName || jobFallback?.ItemName || '').trim();
                return `${nm} (${dc})`;
            }
            if (priceCustomerName && isExternalPricingCustomer(priceCustomerName)) {
                const base = stripLeadName(priceCustomerName) || priceCustomerName;
                return `${base} (${dc})`;
            }
            const suffix = `(${dc})`;
            const matchFinal = finalCustomers.find((c) => String(c).trim().endsWith(suffix));
            if (matchFinal) return String(matchFinal).trim();
            const nm =
                stripLeadName(jobRec?.ItemName || jobFallback?.ItemName) ||
                String(jobRec?.ItemName || jobFallback?.ItemName || '').trim();
            return `${nm} (${dc})`;
        };

        /** True if `jobIdStr` is under `anchorIdStr` but is not the anchor itself (strict descendant). */
        const isStrictDescendantOf = (jobIdStr, anchorIdStr) => {
            if (!jobIdStr || !anchorIdStr || jobIdStr === anchorIdStr) return false;
            let cur = jobMap[jobIdStr];
            let guard = 0;
            while (cur && guard < 50) {
                const p = cur.ParentID;
                if (!p || String(p) === '0' || p === 0) return false;
                if (String(p) === anchorIdStr) return true;
                cur = jobMap[String(p)];
                guard += 1;
            }
            return false;
        };

        const isRootEnquiryForJob = (rec) =>
            !rec || rec.ParentID == null || String(rec.ParentID) === '0' || rec.ParentID === 0;

        flatList.forEach((job) => {
            const jid = jobIdOf(job);
            const targetOptionNames = ['Base Price', 'Optional'];

            targetOptionNames.forEach((optName) => {
                const { price, updatedAt, customerName, declinedToQuote } = getDivisionPrice(jid, optName);

                if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                    const displayCode = jobLeadMap[String(jid)] || 'L1';
                    const jobRec = jid != null ? jobMap[String(jid)] : null;
                    const jobLabel = buildSubjobPriceDisplayLabel(jobRec, job, displayCode, customerName);
                    const displayName = optName === 'Base Price' ? jobLabel : `${jobLabel} (${optName})`;

                    displayItemsRaw.push(
                        `${displayName}|${divisionPriceDisplayColumn(price, declinedToQuote)}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${job.level || 0}`
                    );
                }
            });
        });

        /**
         * Summary column "Customer Name & Prices (Base Price)":
         * - Mixed lead + subjob anchors (same dept on L1 as subjob and L2 as lead): one compact row per myJobs anchor
         *   (parent lead + subjob price, then external + lead price) — no full tree / no unrelated root prices.
         * - Subjob-only anchors: parent + ownjob price, then strict descendants in tree levels.
         * - Lead (+ externals): header row(s) + flatList remainder.
         * - Otherwise: legacy line-per-job labels.
         */
        const displayItems = [];
        const pushLine = (lineLabel, price, updatedAt, level, declinedToQuote = false) => {
            displayItems.push(
                `${lineLabel}|${divisionPriceDisplayColumn(price, declinedToQuote)}|${updatedAt ? new Date(updatedAt).toISOString() : ''}|${level}`
            );
        };

        const compactMixedAnchorsSummary = hasLeadAnchors && hasSubjobAnchors;
        const leadCodeSortRank = (job) => {
            const jc = String(jobLeadMap[String(jobIdOf(job))] || '');
            const m = jc.match(/^L(\d+)$/i);
            return m ? parseInt(m[1], 10) : 999;
        };

        if (compactMixedAnchorsSummary) {
            const seenAnchorId = new Set();
            const anchorsSorted = [...myJobs]
                .filter((a) => {
                    const id = String(jobIdOf(a));
                    if (!id || seenAnchorId.has(id) || !visibleJobs.has(id)) return false;
                    seenAnchorId.add(id);
                    return true;
                })
                .sort((a, b) => {
                    const ra = leadCodeSortRank(a);
                    const rb = leadCodeSortRank(b);
                    if (ra !== rb) return ra - rb;
                    const subA = a.ParentID && String(a.ParentID) !== '0' && a.ParentID !== 0 ? 0 : 1;
                    const subB = b.ParentID && String(b.ParentID) !== '0' && b.ParentID !== 0 ? 0 : 1;
                    return subA - subB;
                });

            anchorsSorted.forEach((anchor) => {
                const aid = jobIdOf(anchor);
                const ajid = aid != null ? String(aid) : '';
                if (!ajid) return;
                const isSub =
                    anchor.ParentID &&
                    String(anchor.ParentID) !== '0' &&
                    anchor.ParentID !== 0;
                if (isSub) {
                    const par = jobMap[String(anchor.ParentID)];
                    if (!par?.ItemName) return;
                    const pid = jobIdOf(par);
                    const lc =
                        (pid != null && jobLeadMap[String(pid)]) || jobLeadMap[ajid] || 'L1';
                    const parentLabel = withLeadCode(
                        stripLeadName(par.ItemName) || String(par.ItemName).trim(),
                        lc
                    );
                    ['Base Price', 'Optional'].forEach((optName) => {
                        const { price, updatedAt, declinedToQuote } = getDivisionPrice(aid, optName);
                        if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                            const dName =
                                optName === 'Base Price' ? parentLabel : `${parentLabel} (${optName})`;
                            pushLine(dName, price, updatedAt, 0, declinedToQuote);
                        }
                    });
                } else {
                    const leadCodeR = jobLeadMap[ajid] || 'L1';
                    const suffixR = `(${String(leadCodeR).toUpperCase()})`;
                    const namesForLead = finalCustomers.filter((c) =>
                        String(c).trim().toUpperCase().endsWith(suffixR)
                    );
                    const headerName = namesForLead.length
                        ? namesForLead.join(', ')
                        : customerHeaderPool.length > 0
                          ? customerHeaderPool.map((c) => withLeadCode(c, leadCodeR)).join(', ')
                          : externalCustomers
                                .filter((c) => isExternalPricingCustomer(c))
                                .map((c) => withLeadCode(c, leadCodeR))
                                .join(', ');
                    if (!String(headerName || '').trim()) return;
                    ['Base Price', 'Optional'].forEach((optName) => {
                        const { price, updatedAt, declinedToQuote } = getDivisionPrice(aid, optName);
                        if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                            const dName =
                                optName === 'Base Price' ? headerName : `${headerName} (${optName})`;
                            pushLine(dName, price, updatedAt, 0, declinedToQuote);
                        }
                    });
                }
            });
        } else if (subjobOnlySummary) {
            const emittedDescendantLine = new Set();
            const seenAnchorIds = new Set();
            anchorsAsSubjobs.forEach((anchor) => {
                const sid = String(jobIdOf(anchor));
                if (!sid || seenAnchorIds.has(sid) || !visibleJobs.has(sid)) return;
                seenAnchorIds.add(sid);
                const anchorRec = jobMap[sid];
                if (!anchorRec?.ParentID || String(anchorRec.ParentID) === '0' || anchorRec.ParentID === 0) return;
                const par = jobMap[String(anchorRec.ParentID)];
                if (!par?.ItemName) return;
                const pid = jobIdOf(par);
                const lc =
                    (pid != null && jobLeadMap[String(pid)]) ||
                    jobLeadMap[sid] ||
                    'L1';
                const parentLabel = withLeadCode(stripLeadName(par.ItemName) || String(par.ItemName).trim(), lc);

                ['Base Price', 'Optional'].forEach((optName) => {
                    const { price, updatedAt, declinedToQuote } = getDivisionPrice(sid, optName);
                    if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                        const dName = optName === 'Base Price' ? parentLabel : `${parentLabel} (${optName})`;
                        pushLine(dName, price, updatedAt, 0, declinedToQuote);
                    }
                });

                flatList.forEach((job) => {
                    const jid = String(jobIdOf(job));
                    if (!isStrictDescendantOf(jid, sid)) return;
                    ['Base Price', 'Optional'].forEach((optName) => {
                        const key = `${jid}|${optName}`;
                        if (emittedDescendantLine.has(key)) return;
                        const { price, updatedAt, declinedToQuote } = getDivisionPrice(jid, optName);
                        if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                            emittedDescendantLine.add(key);
                            const jobRec = jobMap[jid];
                            const childNm =
                                stripLeadName(jobRec?.ItemName) || String(jobRec?.ItemName || '').trim();
                            const dName = optName === 'Base Price' ? childNm : `${childNm} (${optName})`;
                            const lvl = Math.max(1, Number(job.level || 0));
                            pushLine(dName, price, updatedAt, lvl, declinedToQuote);
                        }
                    });
                });
            });
        } else {
            const rootsWithExternalOwnjobHeader = new Set();
            const leadHeaderExternalsAvailable =
                hasLeadAnchors &&
                (customerHeaderPool.length > 0 ||
                    externalCustomers.some((c) => isExternalPricingCustomer(c)));
            if (leadHeaderExternalsAvailable) {
                visualRoots.forEach((root) => {
                    const rid = String(jobIdOf(root));
                    if (!visibleJobs.has(rid)) return;
                    const leadCodeR = jobLeadMap[rid] || 'L1';
                    const suffixR = `(${String(leadCodeR).toUpperCase()})`;
                    const namesForLead = finalCustomers.filter((c) =>
                        String(c).trim().toUpperCase().endsWith(suffixR)
                    );
                    const headerName = namesForLead.length
                        ? namesForLead.join(', ')
                        : customerHeaderPool.length > 0
                          ? customerHeaderPool.map((c) => withLeadCode(c, leadCodeR)).join(', ')
                          : externalCustomers
                                .filter((c) => isExternalPricingCustomer(c))
                                .map((c) => withLeadCode(c, leadCodeR))
                                .join(', ');
                    if (!String(headerName || '').trim()) return;
                    ['Base Price', 'Optional'].forEach((optName) => {
                        const { price, updatedAt, declinedToQuote } = getDivisionPrice(jobIdOf(root), optName);
                        if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                            const dName = optName === 'Base Price' ? headerName : `${headerName} (${optName})`;
                            pushLine(dName, price, updatedAt, 0, declinedToQuote);
                        }
                    });
                    rootsWithExternalOwnjobHeader.add(rid);
                });
            }

            flatList.forEach((job) => {
                const jid = jobIdOf(job);
                const targetOptionNames = ['Base Price', 'Optional'];

                targetOptionNames.forEach((optName) => {
                    const { price, updatedAt, customerName, declinedToQuote } = getDivisionPrice(jid, optName);

                    if (shouldEmitDivisionPriceLine(price, optName, declinedToQuote)) {
                        const jobRec = jid != null ? jobMap[String(jid)] : null;
                        if (
                            rootsWithExternalOwnjobHeader.has(String(jid)) &&
                            jobRec &&
                            isRootEnquiryForJob(jobRec)
                        ) {
                            return;
                        }

                        const displayCode = jobLeadMap[String(jid)] || 'L1';
                        const jobLabel = buildSubjobPriceDisplayLabel(jobRec, job, displayCode, customerName);
                        const displayName = optName === 'Base Price' ? jobLabel : `${jobLabel} (${optName})`;

                        pushLine(displayName, price, updatedAt, Number(job.level || 0), declinedToQuote);
                    }
                });
            });
        }

        /** Pending/search list: structured JSON for "Customer Name & Total Price" + nested "Individual & Subjob Base prices". */
        const collectSubtreeJobIds = (rootIdStr) => {
            const out = [];
            const seen = new Set();
            const walk = (idStr) => {
                if (!idStr || seen.has(idStr) || !visibleJobs.has(idStr)) return;
                seen.add(idStr);
                out.push(idStr);
                const kids = childrenMap[idStr] || [];
                for (const c of kids) {
                    const cid = jobIdOf(c);
                    if (cid != null) walk(String(cid));
                }
            };
            walk(rootIdStr);
            return out;
        };

        const buildJobPriceTreeNode = (jidStr, visited, depth) => {
            if (!jidStr || visited.has(jidStr) || !visibleJobs.has(jidStr)) return null;
            visited.add(jidStr);
            const job = jobMap[jidStr];
            if (!job) return null;
            const { price, updatedAt, customerName, updatedBy, declinedToQuote } = getDivisionPrice(jidStr, 'Base Price');
            const displayCode = jobLeadMap[jidStr] || 'L1';
            const flatJob = { ...job, level: depth };
            const displayLineLabel = buildSubjobPriceDisplayLabel(job, flatJob, displayCode, customerName);
            const kids = (childrenMap[jidStr] || []).slice().sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
            const children = [];
            for (const c of kids) {
                const cid = String(jobIdOf(c));
                const ch = buildJobPriceTreeNode(cid, visited, depth + 1);
                if (ch) children.push(ch);
            }
            return {
                jobId: jidStr,
                label: displayLineLabel,
                price,
                hasPrice: price > 0 && !declinedToQuote,
                declinedToQuote: !!declinedToQuote,
                updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
                pricedBy: updatedBy || null,
                children,
            };
        };

        const pricingListCustomerTotals = [];
        const pricingJobForest = [];
        const leadHdrAvail =
            enquiryCustomerNames.length > 0 ||
            externalCustomers.some((c) => isExternalPricingCustomer(c));

        /** Same display label twice (e.g. duplicate `finalCustomers` entries) → one column-3 / column-4 line. */
        const dedupeCustomerHeaderList = (entries) => {
            const out = [];
            const seen = new Set();
            for (const e of entries) {
                const s = String(e || '').trim();
                if (!s) continue;
                const k = normPricingCustomerKey(s);
                const dedupeKey = k || normalize(s);
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);
                out.push(s);
            }
            return out;
        };
        /**
         * Multiple `visualRoots` can repeat the same lead + external customer; each root pushed another
         * `buildJobPriceTreeNodeForCustomer` tree → duplicate "Individual & Subjob Base prices" blocks.
         * Map key → index in `pricingJobForest`; on duplicate, keep the tree with more priced nodes.
         */
        const jobForestEmittedLeadCustomer = new Map();
        const scorePricedTree = (node) => {
            if (!node) return 0;
            let s = node.hasPrice && Number(node.price) > 0 ? 1 + Number(node.price) : 0;
            for (const ch of node.children || []) {
                s += scorePricedTree(ch);
            }
            return s;
        };

        /**
         * Subjob-only users: list JSON must never include parent/lead rows in jobForest (strict).
         * Roots are minimal anchor EnquiryFor rows (user's subjob anchors), not visual enquiry roots.
         *
         * Mixed lead + subjob anchors: `visualRoots` still includes lead ancestors (for pending / visibility).
         * "Individual & Subjob Base prices" must start at the user's own job(s), not a parent lead — drop any
         * myJobs id that is a strict ancestor of another anchored id (e.g. HVAC when BMS is also in myJobs).
         */
        const myJobIdStrsForForest = [
            ...new Set(myJobs.map((j) => String(jobIdOf(j))).filter((id) => id && id !== 'undefined')),
        ].filter((id) => visibleJobs.has(id));

        const pricingListForestRoots = subjobOnlySummary
            ? (() => {
                  const rawIds = anchorsAsSubjobs
                      .map((j) => String(jobIdOf(j)))
                      .filter((id) => id && visibleJobs.has(id));
                  const unique = [...new Set(rawIds)];
                  const minimalAnchorIds = unique.filter(
                      (id) => !unique.some((other) => other !== id && isStrictDescendantOf(id, other))
                  );
                  return minimalAnchorIds
                      .map((id) => jobMap[id])
                      .filter(Boolean)
                      .sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
              })()
            : compactMixedAnchorsSummary && myJobIdStrsForForest.length > 0
              ? myJobIdStrsForForest
                    .filter(
                        (id) =>
                            !myJobIdStrsForForest.some(
                                (other) => other !== id && isStrictDescendantOf(other, id)
                            )
                    )
                    .map((id) => jobMap[id])
                    .filter(Boolean)
                    .sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0))
              : visualRoots
                    .filter((r) => visibleJobs.has(String(jobIdOf(r))))
                    .sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));

        /** True when an external list customer shows a positive inherited base but has no matching PV row yet. */
        let pendingExternalCustomerDirectGap = false;

        for (const root of pricingListForestRoots) {
            const rid = String(jobIdOf(root));
            const leadCodeR = jobLeadMap[rid] || 'L1';
            const suffixR = `(${String(leadCodeR).toUpperCase()})`;
            const subtreeIds = collectSubtreeJobIds(rid);
            const subtreeSet = new Set(subtreeIds.map(String));

            const priceRowInSubtree = (pr) => {
                const mid = pr.MatchedEnquiryForId ?? pr.matchedEnquiryForId ?? pr.MatchedEnquiryForID;
                if (mid != null && String(mid) !== '' && String(mid) !== '0') {
                    return subtreeSet.has(String(mid));
                }
                if (pr.EnquiryForID && pr.EnquiryForID != 0 && String(pr.EnquiryForID) !== '0') {
                    return subtreeSet.has(String(pr.EnquiryForID));
                }
                if (pr.EnquiryForItem) {
                    const eit = stripSqlStyleItemName(pr.EnquiryForItem).toLowerCase();
                    for (const sid of subtreeSet) {
                        const job = jobMap[sid];
                        if (!job) continue;
                        const jit = stripSqlStyleItemName(job.ItemName || job.itemName || '').toLowerCase();
                        if (eit && jit && eit === jit) return true;
                    }
                }
                return false;
            };

            /** Deepest department anchors in this forest subtree — customer totals wait until all of these have base price for that customer. */
            const myAnchorsInSubtree = myJobIdStrsForForest.filter((id) => subtreeSet.has(id));
            const ownJobGateIds =
                myAnchorsInSubtree.length > 0
                    ? myAnchorsInSubtree.filter(
                          (id) =>
                              !myAnchorsInSubtree.some(
                                  (other) => other !== id && isStrictDescendantOf(other, id)
                              )
                      )
                    : [rid];
            const customerOwnAnchorsAllPriced = (displayLabel) => {
                const ck = normPricingCustomerKey(displayLabel);
                if (!ck) return false;
                const ids = ownJobGateIds.length > 0 ? ownJobGateIds : [rid];
                return ids.every((oid) => {
                    const r = getDivisionPriceForCustomer(oid, 'Base Price', ck, {
                        priceRowInSubtree,
                        customerForestRootId: rid,
                    });
                    return r && parsePriceNum(r.price) > 0;
                });
            };

            /**
             * "Customer Name & Total Price" must match the sum of all lines in the job tree (all depths), including
             * internal inheritance the same way as `buildJobPriceTreeNode` / `buildJobPriceTreeNodeForCustomer` —
             * not a separate scan of `enqPrices` (that missed some nested / inherited rows for externals).
             */
            /**
             * List column "Customer Name & Total Price":
             * Total must be the base price of the Ownjob (root) + base prices of all subjobs in its subtree.
             *
             * IMPORTANT: This total must NOT depend on which list header label happens to be shown (external
             * customer vs internal label). Customer-specific base rows are a *display* concept; the summary total
             * is a pure subtree base-price sum.
             */
            /**
             * List column "Customer Name & Total Price":
             * The total must match what the UI shows in "Individual & Subjob Base prices".
             *
             * To prevent any drift (fuzzy matching, inheritance, rounding differences), compute totals
             * directly from the same tree nodes we render for the right column.
             */
            const sumSubtreeBasesFromTree = (rootNode) => {
                // Avoid float drift: store as integer "cents" (2 decimals)
                let sumCents = 0;
                let maxAt = null;
                const walk = (n) => {
                    if (!n) return;
                    if (n.hasPrice && parsePriceNum(n.price) > 0.01) {
                        sumCents += Math.round(parsePriceNum(n.price) * 100);
                    }
                    const at = n.updatedAt || null;
                    if (at && (!maxAt || new Date(at) > new Date(maxAt))) maxAt = at;
                    for (const ch of n.children || []) walk(ch);
                };
                walk(rootNode);
                return { sum: sumCents / 100, maxAt };
            };

            let customerHeaderEntries = [];
            if (leadHdrAvail) {
                const namesForLead = finalCustomers.filter((c) =>
                    String(c).trim().toUpperCase().endsWith(suffixR)
                );
                if (namesForLead.length > 0) {
                    customerHeaderEntries = namesForLead.map((n) => String(n).trim()).filter(Boolean);
                } else if (customerHeaderPool.length > 0) {
                    customerHeaderEntries = customerHeaderPool
                        .map((c) => withLeadCode(c, leadCodeR))
                        .filter(Boolean);
                } else {
                    customerHeaderEntries = externalCustomers
                        .filter((c) => isExternalPricingCustomer(c))
                        .map((c) => withLeadCode(c, leadCodeR))
                        .filter(Boolean);
                }
            }
            if (customerHeaderEntries.length === 0) {
                const base = stripLeadName(root.ItemName) || String(root.ItemName || '').trim();
                customerHeaderEntries = [withLeadCode(base, leadCodeR)];
            }
            customerHeaderEntries = dedupeCustomerHeaderList(customerHeaderEntries);

            if (pendingOnly && leadHdrAvail) {
                for (const hdr of customerHeaderEntries) {
                    const ck = normPricingCustomerKey(hdr);
                    if (!ck || !listCustomerKeyIsEnquiryExternal(ck)) continue;
                    for (const jid of subtreeIds) {
                        const jidStr = String(jid);
                        if (!visibleJobs.has(jidStr)) continue;
                        const jobRec = jobMap[jidStr];
                        if (!jobRec) continue;
                        if (scopePendingToUserAnchorsOnly && !jobIsAnchorOrDescendantOfUserAnchor(jobRec)) continue;
                        const shown = getDivisionPriceForCustomer(jidStr, 'Base Price', ck, {
                            priceRowInSubtree,
                            customerForestRootId: rid,
                        });
                        if (parsePriceNum(shown.price) <= 0.01) continue;
                        if (hasDirectCustomerBaseForJobSubtree(jidStr, ck, priceRowInSubtree)) continue;
                        pendingExternalCustomerDirectGap = true;
                    }
                }
            }

            /**
             * Per-customer base rows only (multi-external); same hierarchy as `buildJobPriceTreeNode` but scoped to subtree + customer key.
             * `listHdrForRoot`: list column header for this customer (e.g. "A. Eracleous … (L1)"). When there is no price row yet,
             * `buildSubjobPriceDisplayLabel` would otherwise pick the first `finalCustomers` entry for the same L# — every tree looked like Ahmed.
             */
            const buildJobPriceTreeNodeForCustomer = (jidStr, customerNormKey, listHdrForRoot) => {
                if (!jidStr || !subtreeSet.has(jidStr) || !visibleJobs.has(jidStr)) return null;
                const job = jobMap[jidStr];
                if (!job) return null;
                const kids = (childrenMap[jidStr] || []).slice().sort((a, b) => (jobIdOf(a) || 0) - (jobIdOf(b) || 0));
                const children = [];
                for (const c of kids) {
                    const cid = String(jobIdOf(c));
                    const ch = buildJobPriceTreeNodeForCustomer(cid, customerNormKey, null);
                    if (ch) children.push(ch);
                }
                const { price, updatedAt, customerName, updatedBy, declinedToQuote } = getDivisionPriceForCustomer(
                    jidStr,
                    'Base Price',
                    customerNormKey,
                    { priceRowInSubtree, customerForestRootId: rid }
                );
                /** Match `buildJobPriceTreeNode`: keep every visible EnquiryFor row so subjobs stay in the tree (Not Updated when this customer has no row). */
                const displayCode = jobLeadMap[jidStr] || 'L1';
                const depthHint = (() => {
                    const hit = flatList.find((f) => String(jobIdOf(f)) === String(jidStr));
                    return hit && typeof hit.level === 'number' ? hit.level : 0;
                })();
                const flatJob = { ...job, level: depthHint };
                const displayLineLabel =
                    listHdrForRoot && String(jidStr) === String(rid)
                        ? String(listHdrForRoot).trim()
                        : buildSubjobPriceDisplayLabel(job, flatJob, displayCode, customerName);
                return {
                    jobId: jidStr,
                    label: displayLineLabel,
                    price,
                    hasPrice: price > 0 && !declinedToQuote,
                    declinedToQuote: !!declinedToQuote,
                    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
                    pricedBy: updatedBy || null,
                    children,
                };
            };

            /**
             * "Customer Name & Total Price" must be Ownjob (root) + sum of all its subjobs (entire subtree).
             * Do NOT gate this on "ownjob base price entered" or "all anchors priced" — the list total should
             * reflect the current priced values in the subtree.
             */
            /**
             * Build the same base-price tree shown in the right column.
             * - When the enquiry has multiple external headers for the same lead (customerHeaderEntries > 1),
             *   the UI renders `jobForest` using `buildJobPriceTreeNodeForCustomer(...)`.
             * - When it’s a single header, UI renders using `buildJobPriceTreeNode(...)`.
             *
             * Totals must be computed from the same node source to avoid mismatches (e.g. 36.10 vs 36.00).
             */
            const buildTotalTreeNodeForHeader = (headerLabel) => {
                if (customerHeaderEntries.length > 1) {
                    const ck = normPricingCustomerKey(headerLabel);
                    return buildJobPriceTreeNodeForCustomer(rid, ck, headerLabel);
                }
                return buildJobPriceTreeNode(rid, new Set(), 0);
            };

            const firstHdrLabel = customerHeaderEntries[0] || '';
            const firstTotalTreeNode = buildTotalTreeNodeForHeader(firstHdrLabel);
            const ownJobBasePriceEntered =
                !!(firstTotalTreeNode && firstTotalTreeNode.hasPrice && parsePriceNum(firstTotalTreeNode.price) > 0.01);

            let subtreeSum = 0;
            let subtreeMaxAt = null;
            if (ownJobBasePriceEntered && customerHeaderEntries.length <= 1) {
                const t = sumSubtreeBasesFromTree(firstTotalTreeNode);
                subtreeSum = t.sum;
                subtreeMaxAt = t.maxAt;
            }

            if (customerHeaderEntries.length <= 1) {
                const label = customerHeaderEntries[0] || '';
                pricingListCustomerTotals.push({
                    label,
                    total: ownJobBasePriceEntered ? subtreeSum : 0,
                    updatedAt: ownJobBasePriceEntered && subtreeMaxAt ? new Date(subtreeMaxAt).toISOString() : null,
                });
            } else {
                for (const label of customerHeaderEntries) {
                    const nodeForHdr = buildTotalTreeNodeForHeader(label);
                    const { sum: custSum, maxAt: custMax } = ownJobBasePriceEntered
                        ? sumSubtreeBasesFromTree(nodeForHdr)
                        : { sum: 0, maxAt: null };
                    pricingListCustomerTotals.push({
                        label,
                        total: custSum,
                        updatedAt: custMax ? new Date(custMax).toISOString() : null,
                    });
                }
            }
            if (customerHeaderEntries.length > 1) {
                for (const hdr of customerHeaderEntries) {
                    const ck = normPricingCustomerKey(hdr);
                    const forestKey = `${String(leadCodeR).toUpperCase()}\t${ck || String(hdr).trim()}`;
                    const treeNode = buildJobPriceTreeNodeForCustomer(rid, ck, hdr);
                    if (!treeNode) continue;
                    if (jobForestEmittedLeadCustomer.has(forestKey)) {
                        const prevIdx = jobForestEmittedLeadCustomer.get(forestKey);
                        const prev = pricingJobForest[prevIdx];
                        if (scorePricedTree(treeNode) > scorePricedTree(prev)) {
                            pricingJobForest[prevIdx] = treeNode;
                        }
                        continue;
                    }
                    pricingJobForest.push(treeNode);
                    jobForestEmittedLeadCustomer.set(forestKey, pricingJobForest.length - 1);
                }
            } else {
                const treeNode = buildJobPriceTreeNode(rid, new Set(), 0);
                if (!treeNode) continue;
                const topLab = String(treeNode.label || '').trim();
                const forestKey = `${String(leadCodeR).toUpperCase()}\t${normPricingCustomerKey(topLab) || topLab}`;
                if (jobForestEmittedLeadCustomer.has(forestKey)) {
                    const prevIdx = jobForestEmittedLeadCustomer.get(forestKey);
                    const prev = pricingJobForest[prevIdx];
                    if (scorePricedTree(treeNode) > scorePricedTree(prev)) {
                        pricingJobForest[prevIdx] = treeNode;
                    }
                    continue;
                }
                pricingJobForest.push(treeNode);
                jobForestEmittedLeadCustomer.set(forestKey, pricingJobForest.length - 1);
            }
        }

        /**
         * Collapse duplicate top-level trees that share the same root line (e.g. same customer + L# twice).
         * Must include `jobId`: normPricingCustomerKey strips "(L1)" / "(L2)" so "BMS Project (L1)" and
         * "BMS Project (L2)" collided — one tree was dropped and "Individual & Subjob Base prices" lost L2.
         */
        const rootDisplayDedupeKey = (node) => {
            const jid = String(node?.jobId ?? '').trim();
            const raw = String(node?.label || '').trim();
            const labelKey = raw ? normPricingCustomerKey(raw) || normalize(raw) : '';
            if (jid && jid !== 'undefined') return `${labelKey || 'job'}\t${jid}`;
            if (!raw) return `_empty_`;
            return labelKey || normalize(raw);
        };
        const bestRootByKey = new Map();
        for (const node of pricingJobForest) {
            const k = rootDisplayDedupeKey(node);
            const sc = scorePricedTree(node);
            const prev = bestRootByKey.get(k);
            if (!prev || sc > prev.sc) bestRootByKey.set(k, { node, sc });
        }
        const rootKeyOrder = [];
        const seenRootKeys = new Set();
        for (const node of pricingJobForest) {
            const k = rootDisplayDedupeKey(node);
            if (seenRootKeys.has(k)) continue;
            seenRootKeys.add(k);
            rootKeyOrder.push(k);
        }
        const pricingJobForestDeduped = rootKeyOrder.map((k) => bestRootByKey.get(k).node);
        const pricingJobForestScoped = (() => {
            if (!divisionTrim) return pricingJobForestDeduped;
            const keepNodeByLabel = (label) => {
                const lbl = String(label || '').trim();
                if (!lbl) return false;
                if (departmentMatchesItemName(divisionTrim.trim(), lbl)) return true;
                const ck = normPricingCustomerKey(lbl);
                if (ck && listCustomerKeyIsEnquiryExternal(ck)) return true;
                return false;
            };
            const prune = (node) => {
                if (!node) return null;
                const children = Array.isArray(node.children)
                    ? node.children.map((c) => prune(c)).filter(Boolean)
                    : [];
                // Keep non-division internal subjobs when they already carry a real priced value.
                // This avoids hiding priced subjob lines in "Individual & Subjob Base prices".
                const keepSelf =
                    keepNodeByLabel(node.label) ||
                    (node.hasPrice && parsePriceNum(node.price) > 0.01) ||
                    !!node.declinedToQuote;
                if (!keepSelf && children.length === 0) return null;
                return { ...node, children };
            };
            return pricingJobForestDeduped.map((n) => prune(n)).filter(Boolean);
        })();
        const sumTreeNodeBasesForTotals = (rootNode) => {
            let sumCents = 0;
            let maxAt = null;
            const walk = (n) => {
                if (!n) return;
                if (n.hasPrice && parsePriceNum(n.price) > 0.01) {
                    sumCents += Math.round(parsePriceNum(n.price) * 100);
                }
                const at = n.updatedAt || null;
                if (at && (!maxAt || new Date(at) > new Date(maxAt))) maxAt = at;
                for (const ch of n.children || []) walk(ch);
            };
            walk(rootNode);
            return { sum: sumCents / 100, maxAt };
        };

        /**
         * Pricing list Division dropdown = ownjob. When that ownjob is a subjob (has ParentID), "Customer Name &
         * Total Price" should show the **parent** job name (same pattern as compactMixedAnchorsSummary / subjob-only
         * summary columns), not the subjob ItemName.
         */
        const divAnchorIdsForCustomerTotals = (() => {
            const d = String(divisionTrim || '').trim();
            if (!d) return new Set();
            return new Set(
                getDepartmentPricingAnchors(enqJobs, d)
                    .map((j) => String(jobIdOf(j)))
                    .filter((id) => id && id !== 'undefined')
            );
        })();
        const customerTotalLabelOverrideForDivisionSubjob = (rootNode, currentLabel) => {
            if (!divisionTrim || !rootNode) return null;
            const jid = String(rootNode.jobId ?? '').trim();
            if (!jid || jid === 'undefined' || !divAnchorIdsForCustomerTotals.has(jid)) return null;
            const jobRec = jobMap[jid];
            if (!jobRec || jobRec.ParentID == null || String(jobRec.ParentID) === '0' || jobRec.ParentID === 0) {
                return null;
            }
            const baseLbl = String(currentLabel || '')
                .replace(/\s*\(L\d+\)\s*$/i, '')
                .replace(/\s*\(optional\)\s*$/i, '')
                .trim();
            if (baseLbl && isExternalPricingCustomer(baseLbl)) return null;
            const par = jobMap[String(jobRec.ParentID)];
            if (!par || !par.ItemName) return null;
            const pid = jobIdOf(par);
            const lc =
                (pid != null && jobLeadMap[String(pid)]) || jobLeadMap[jid] || 'L1';
            return withLeadCode(stripLeadName(par.ItemName) || String(par.ItemName).trim(), lc);
        };

        /**
         * Keep left column fully consistent with right column:
         * build "Customer Name & Total Price" strictly from the same deduped job-forest roots.
         * This avoids label drift / duplicates (e.g. HVAC/BMS mismatch while right side shows BEMCO/TEMCO roots).
         */
        const pricingListCustomerTotalsAligned = pricingJobForestScoped.map((rootNode) => {
            let lbl = String(rootNode?.label || '').trim();
            const subLblOverride = customerTotalLabelOverrideForDivisionSubjob(rootNode, lbl);
            if (subLblOverride) lbl = subLblOverride;
            const t = sumTreeNodeBasesForTotals(rootNode);
            const declinedToQuote = !!(rootNode && rootNode.declinedToQuote);
            const ownJobPriced =
                !!(rootNode && rootNode.hasPrice && parsePriceNum(rootNode.price) > 0.01);
            let updatedAt = null;
            if (declinedToQuote && rootNode?.updatedAt) {
                updatedAt = rootNode.updatedAt;
            } else if (ownJobPriced && t.maxAt) {
                updatedAt = new Date(t.maxAt).toISOString();
            }
            return {
                label: lbl,
                // Total appears only after ownjob (root) Base Price is updated.
                total: ownJobPriced && t.sum > 0.01 ? t.sum : 0,
                updatedAt,
                declinedToQuote,
            };
        });

        let pricingListDisplayJson = '';
        try {
            pricingListDisplayJson = JSON.stringify({
                customerTotals: pricingListCustomerTotalsAligned,
                jobForest: pricingJobForestScoped,
            });
        } catch {
            pricingListDisplayJson = '';
        }

        const listForestNodeUnresolved = (n) => {
            if (!n) return false;
            const resolved =
                !!n.declinedToQuote || (n.hasPrice && parsePriceNum(n.price) > 0.01);
            if (!resolved) return true;
            for (const ch of n.children || []) {
                if (listForestNodeUnresolved(ch)) return true;
            }
            return false;
        };
        const pendingFromScopedListForest = pricingJobForestScoped.some((root) =>
            listForestNodeUnresolved(root)
        );
        const forestResolutionStatus = (() => {
            if (!pricingJobForestScoped.length) return null;
            let priced = 0;
            let declined = 0;
            let unpriced = 0;
            const countForestNode = (n) => {
                if (!n) return;
                if (n.declinedToQuote) declined += 1;
                else if (n.hasPrice && parsePriceNum(n.price) > 0.01) priced += 1;
                else unpriced += 1;
                for (const ch of n.children || []) countForestNode(ch);
            };
            for (const root of pricingJobForestScoped) countForestNode(root);
            return ownJobResolutionStatusFromCounts(priced, declined, unpriced);
        })();

        /**
         * Pending list: `hasPendingItems` uses `pendingFromVisibleJobsBase`, `pendingStrictBaseMissing`, and
         * `pendingExternalCustomerDirectGap` (inherited external display amounts without a direct PV row).
         * Option classification uses synthetic rows from
         * `EnquiryPricingValues` only, not `EnquiryPricingOptions`. `pendingFromDisplayLines` is still computed
         * for non-pending search mode / logs; lines ending in `(Optional)` are ignored there.
         */
        const lineShowsNotUpdated = (item) => {
            const parts = String(item).split('|');
            if ((parts[1] || '').trim() !== 'Not Updated') return false;
            const label = String(parts[0] || '');
            if (/\(optional\)\s*$/i.test(label)) return false;
            return true;
        };
        const linesForPendingCheck =
            displayItems.length > 0 ? displayItems : displayItemsRaw;
        const pendingFromDisplayLines = linesForPendingCheck.some(lineShowsNotUpdated);
        /** Division dropdown (own-job): list row label still "Not Updated" for that department on this enquiry. */
        const labelFromDisplayLine = (item) => String(item).split('|')[0] || '';
        /** Same fuzzy match as pending spec / department anchors — raw `includes(division)` missed labels like `L1 - EP - …` vs `Electrical Project`. */
        const displayLineMatchesDivision = (item) =>
            !!divisionTrim && departmentMatchesItemName(divisionTrim.trim(), labelFromDisplayLine(item));
        const divisionScopedLineStillNotUpdated =
            !!divisionTrim &&
            linesForPendingCheck.some((item) => {
                if (!lineShowsNotUpdated(item)) return false;
                return displayLineMatchesDivision(item);
            });
        const parseDisplayLinePriceColumn = (parts1) => {
            const p = String(parts1 ?? '').trim();
            if (!p || p === 'Not Updated') return 0;
            if (p === 'Decline to Quote') return 0;
            const n = parseFloat(String(p).replace(/,/g, ''));
            return Number.isFinite(n) && n > 0.01 ? n : 0;
        };
        const parseDisplayLineResolution = (parts1) => {
            const p = String(parts1 ?? '').trim();
            if (!p || p === 'Not Updated') return 'unpriced';
            if (p === 'Decline to Quote') return 'declined';
            return parseDisplayLinePriceColumn(parts1) > 0 ? 'priced' : 'unpriced';
        };
        /**
         * Per-department / subjob view when Division filter is set: status from display lines whose label
         * contains that division only — independent of other lead jobs / subjobs / departments on the enquiry.
         */
        let divisionScopedPricingStatus = null;
        if (divisionTrim) {
            const div = divisionTrim.trim().toLowerCase();
            if (div) {
                const scoped = linesForPendingCheck.filter((item) => displayLineMatchesDivision(item));
                const nonOptional = scoped.filter(
                    (item) => !/\(optional\)\s*$/i.test(labelFromDisplayLine(item))
                );
                if (nonOptional.length > 0) {
                    let priced = 0;
                    let declined = 0;
                    let unpriced = 0;
                    for (const item of nonOptional) {
                        const parts = String(item).split('|');
                        const r = parseDisplayLineResolution(parts[1]);
                        if (r === 'priced') priced++;
                        else if (r === 'declined') declined++;
                        else unpriced++;
                    }
                    divisionScopedPricingStatus = ownJobResolutionStatusFromCounts(priced, declined, unpriced);
                }
            }
        }
        /**
         * Lead roots (e.g. Civil) often have **no** own `EnquiryPricingValues` row while children (HVAC/BMS)
         * are priced. For **other** divisions we skip requiring a root row so pending clears. For the **logged-in
         * user's department anchors** (e.g. Civil engineer on Civil root), we still require a strict base row
         * on that root so "Civil not updated" stays on Pending Pricing.
         */
        const jobIsRootLeadWithVisibleChildren = (jobRec) => {
            const jid = jobIdOf(jobRec);
            if (jid == null) return false;
            const pid = jobRec.ParentID ?? jobRec.parentID;
            const isRoot = pid == null || String(pid) === '0' || pid === 0 || pid === '0';
            if (!isRoot) return false;
            const kids = childrenMap[String(jid)] || [];
            return kids.some((c) => {
                const cid = jobIdOf(c);
                return cid != null && visibleJobs.has(String(cid));
            });
        };

        const pendingDeptForAnchors = String(divisionTrim || userDepartment || '').trim();
        const deptAnchorsForPending =
            pendingOnly && !isAdmin && pendingDeptForAnchors
                ? getDepartmentPricingAnchors(enqJobs, pendingDeptForAnchors)
                : [];
        const deptAnchorIdSetForPending = new Set(
            deptAnchorsForPending.map((j) => String(jobIdOf(j))).filter((id) => id && id !== 'undefined')
        );

        const skipRootLeadBaseCheckForPending = (jobRec) => {
            if (!jobIsRootLeadWithVisibleChildren(jobRec)) return false;
            const jidStr = String(jobIdOf(jobRec));
            if (deptAnchorIdSetForPending.has(jidStr)) return false;
            return true;
        };

        /**
         * Pending reflects this user's anchors (`userAnchorIdSet` / `jobIsAnchorOrDescendantOfUserAnchor`, declared
         * after `jobMap`) plus external-customer direct rows (`pendingExternalCustomerDirectGap`).
         */
        const pendingFromVisibleJobsBase = flatList.some((job) => {
            if (skipRootLeadBaseCheckForPending(job)) return false;
            const jid = jobIdOf(job);
            if (jid == null || !visibleJobs.has(String(jid))) return false;
            if (scopePendingToUserAnchorsOnly && !jobIsAnchorOrDescendantOfUserAnchor(job)) return false;
            const { price, declinedToQuote } = getDivisionPrice(jid, 'Base Price');
            return price <= 0.01 && !declinedToQuote;
        });
        /**
         * Broad strict job set (admin / CC only): anchor jobs plus department anchors so one division
         * cannot hide missing base rows on another. Normal users use `flatList` + `visibleJobs` instead
         * so Pending Pricing matches rows they are actually responsible for.
         */
        const jobsForStrictPendingCheck = (() => {
            const byId = new Map();
            const add = (arr) => {
                for (const j of arr) {
                    const id = jobIdOf(j);
                    if (id != null) byId.set(String(id), j);
                }
            };
            add(anchorCandidates);
            add(deptAnchorsForPending);
            if (byId.size > 0) return [...byId.values()];
            return enqJobs.filter((j) => visibleJobs.has(String(jobIdOf(j))));
        })();
        /**
         * Strict ID-based base check: for normal engineers, only jobs on their visible tree (`flatList`).
         * `jobsForStrictPendingCheck` unions anchors across divisions; without scoping, a priced BMS branch
         * still showed Pending because an HVAC (or other) anchor had no row — see enquiry with multiple leads.
         * Admins and CC coordinators keep the broader union so cross-division gaps still surface.
         */
        const useBroadStrictPendingCheck = isAdmin || isCcUser;
        const pendingStrictBaseMissing =
            pendingOnly &&
            (useBroadStrictPendingCheck
                ? jobsForStrictPendingCheck.some(
                      (jobRec) =>
                          jobIdOf(jobRec) != null &&
                          !skipRootLeadBaseCheckForPending(jobRec) &&
                          !strictJobBaseResolved(jobRec)
                  )
                : flatList.some((job) => {
                      if (skipRootLeadBaseCheckForPending(job)) return false;
                      const jid = jobIdOf(job);
                      if (jid == null || !visibleJobs.has(String(jid))) return false;
                      if (scopePendingToUserAnchorsOnly && !jobIsAnchorOrDescendantOfUserAnchor(job)) return false;
                      return !strictJobBaseResolved(job);
                  }));

        /**
         * Forest loop can set `pendingExternalCustomerDirectGap` when display inheritance shows a price but
         * `hasDirectCustomerBaseForJobSubtree` misses (label/job-id drift). If every EnquiryCustomer already has a
         * positive EPV Base row keyed to that customer, clear the gap so Concerned SE lists are not stuck on Pending.
         */
        let pendingExternalGapForLegacy = pendingExternalCustomerDirectGap;
        if (pendingExternalGapForLegacy && pendingOnly) {
            const ecs = allEnquiryCustomers.filter((c) => reqNoEq(c.RequestNo, enq.RequestNo));
            if (ecs.length > 0) {
                const everyExternalHasEpvBase = ecs.every((row) => {
                    const nm = String(row.CustomerName ?? row.customerName ?? '').trim();
                    if (!nm) return true;
                    const ck = normPricingCustomerKey(nm);
                    if (!ck) return true;
                    return enqPrices.some((pr) => {
                        if (!reqNoEq(pr.RequestNo, enq.RequestNo)) return false;
                        if (parsePriceNum(pr.Price) <= 0.01 && !isDeclineToQuotePricingRow(pr)) return false;
                        if (!valueRowIsBasePrice(pr)) return false;
                        return pricingCustomerRowMatchesKey(pr.CustomerName ?? pr.customerName, ck);
                    });
                });
                if (everyExternalHasEpvBase) pendingExternalGapForLegacy = false;
            }
        }

        const legacyPending =
            pendingOnly
                ? pendingFromVisibleJobsBase ||
                      pendingStrictBaseMissing ||
                      pendingExternalGapForLegacy
                : pendingFromDisplayLines || pendingFromVisibleJobsBase || pendingStrictBaseMissing;

        const anyVisiblePricingGap =
            pendingFromDisplayLines ||
            pendingFromVisibleJobsBase ||
            pendingStrictBaseMissing ||
            pendingExternalGapForLegacy;

        /**
         * Concerned SE + department: internal / external Base slots (spec). Use list **Division** filter when
         * Master_ConcernedSE.Department is blank — otherwise SE users (e.g. bmseng4) never enter the spec branch
         * and stay on legacy pending heuristics indefinitely.
         */
        let userSpecPricingSummary = null;
        /** Prefer list Division over profile department so CC + SE both treat the dropdown as own-job scope. */
        const deptForSpec = String(divisionTrim || userDepartment || '').trim();
        if (!isAdmin && deptForSpec && (!isCcUser || !!divisionTrim)) {
            userSpecPricingSummary = evaluatePendingPricingSummarySpec({
                requestNo: enq.RequestNo,
                enqJobs,
                enqPrices,
                enquiryCustomers: allEnquiryCustomers.filter((c) => reqNoEq(c.RequestNo, enq.RequestNo)),
                userDepartment: deptForSpec,
                optionMap,
            });
        }

        const specSlotCount =
            userSpecPricingSummary &&
            userSpecPricingSummary.enabled &&
            (userSpecPricingSummary.internalRequired || 0) + (userSpecPricingSummary.externalRequired || 0);

        /**
         * Spec "All Priced" can ignore the division row the user cares about (e.g. Civil priced on L1 while
         * Electrical Project still shows Not Updated). Until the selected Division / own-job line is priced,
         * treat as pending and show Partial — not All Priced.
         */
        const hasDivisionLabelScope = !!divisionTrim && linesForPendingCheck.some((item) => displayLineMatchesDivision(item));
        const contradictsSpecAllPriced =
            !!userSpecPricingSummary?.enabled &&
            userSpecPricingSummary.pricingSummaryStatus === 'All Priced' &&
            (divisionTrim
                ? hasDivisionLabelScope
                    ? divisionScopedLineStillNotUpdated
                    : anyVisiblePricingGap
                : anyVisiblePricingGap);

        /**
         * Concerned SE + department: when user-spec is enabled it must control pending.
         * Do not require `specSlotCount > 0`: if the spec returns `All Priced` with zero slots
         * (`internalRequired`/`externalRequired` both 0), we previously fell through to `legacyPending`
         * and left full enquiries stuck on Pending Pricing.
         */
        if (pendingOnly && divisionTrim) {
            /**
             * Division-filtered Pending Pricing must be an "own-job" view.
             *
             * IMPORTANT:
             * - Status is based strictly on own-job base pricing:
             *   None Priced (0/total), Partial Priced (>0 and <total), All Priced (total/total).
             * - Pending list must show only None/Partial and hide All.
             */
            const divNorm = normalizePricingJobName(String(divisionTrim).trim());
            const divAnchorsRaw = getDepartmentPricingAnchors(enqJobs, String(divisionTrim).trim());
            // Division pending must be evaluated on exact ownjob anchors for the selected division.
            // Fuzzy anchor matching can pull sibling/child jobs and keep an enquiry in Pending incorrectly.
            let divAnchors = (divAnchorsRaw || []).filter((jobRec) => {
                const nm = normalizePricingJobName(jobRec?.ItemName || '');
                return !!divNorm && nm === divNorm;
            });
            if (divAnchors.length === 0) {
                // Backward-safe fallback if exact label differs in legacy data.
                divAnchors = divAnchorsRaw || [];
            }
            if (divAnchors && divAnchors.length > 0) {
                let priced = 0;
                let declined = 0;
                let unpriced = 0;
                for (const jobRec of divAnchors) {
                    if (strictHasPositiveBaseForJob(jobRec)) priced += 1;
                    else if (strictHasDeclinedBaseForJob(jobRec)) declined += 1;
                    else unpriced += 1;
                }
                /**
                 * Pending list must also stay pending when any enquiry customer is missing a direct
                 * Base Price row for any own-job anchor in the selected division.
                 * (Fix: enquiry can look "All Priced for Ownjob" while customer-wise base rows are incomplete.)
                 */
                const enquiryCustomerKeys = Array.from(
                    new Set(
                        allEnquiryCustomers
                            .filter((c) => reqNoEq(c.RequestNo, enq.RequestNo))
                            .map((row) => String(row.CustomerName ?? row.customerName ?? '').trim())
                            .filter(Boolean)
                            .map((name) => normPricingCustomerKey(name))
                            .filter(Boolean)
                    )
                );
                let hasCustomerBaseGap = false;
                // Single-ownjob division scope: pending should clear once that ownjob is priced.
                // Customer-gap enforcement is kept only when multiple anchors are in scope.
                if (unpriced > 0 && divAnchors.length > 1 && enquiryCustomerKeys.length > 0) {
                    for (const customerKey of enquiryCustomerKeys) {
                        let customerCoveredInDivision = false;
                        for (const jobRec of divAnchors) {
                            const jid = jobIdOf(jobRec);
                            if (jid == null || jid === '' || String(jid) === '0') continue;
                            if (hasDirectCustomerBaseForJobSubtree(jid, customerKey, null)) {
                                customerCoveredInDivision = true;
                                break;
                            }
                        }
                        if (!customerCoveredInDivision) {
                            hasCustomerBaseGap = true;
                            break;
                        }
                    }
                }
                // None Priced for Ownjob / Partial Priced for Ownjob => Price Pending
                // All Quoted for Ownjob (priced and/or declined) => Not Pending
                hasPendingItems = hasCustomerBaseGap || !(unpriced === 0 && priced + declined > 0);
            } else if (divisionScopedPricingStatus) {
                // Fallback for unexpected data (no anchors): use the older display-line scoped status.
                hasPendingItems =
                    divisionScopedPricingStatus !== 'All Priced' &&
                    divisionScopedPricingStatus !== 'All Quoted';
            } else {
                // With a division filter, do not use legacyPending (parent lead / other divisions).
                hasPendingItems = false;
            }
            if (divisionScopedPricingStatus === 'All Priced' || divisionScopedPricingStatus === 'All Quoted') {
                hasPendingItems = false;
            }
            if (pricingJobForestScoped.length > 0) {
                hasPendingItems = pendingFromScopedListForest;
            }
        } else if (pendingOnly && userSpecPricingSummary && userSpecPricingSummary.enabled) {
            if (userSpecPricingSummary.pricingSummaryStatus === 'All Priced') {
                hasPendingItems = !!contradictsSpecAllPriced;
            } else if (specSlotCount > 0) {
                hasPendingItems = !!userSpecPricingSummary.showInPending;
            } else {
                hasPendingItems = legacyPending;
            }
        } else {
            hasPendingItems = legacyPending;
        }

        if (hasPendingItems) {
            const specNote =
                userSpecPricingSummary && userSpecPricingSummary.enabled && specSlotCount > 0
                    ? ` [User-spec: ${userSpecPricingSummary.pricingSummaryStatus}]`
                    : '';
            console.log(
                `[Pricing] Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one visible internal/external pricing line is Not Updated.${specNote}`
            );
            logToFile(
                `Enquiry ${enq.RequestNo} - ⚠️ PENDING: At least one visible internal/external pricing line is Not Updated.${specNote}`
            );
        } else {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All visible internal/external pricing lines are updated.`);
            logToFile(`Enquiry ${enq.RequestNo} - ✓ NOT PENDING: All visible internal/external pricing lines are updated.`);
        }

        // Filter for Pending View
        // Show ONLY if there are pending items in user's division
        if (pendingOnly && !hasPendingItems) {
            console.log(`[Pricing] Enquiry ${enq.RequestNo} filtered out — no pending base-price gaps for this user’s scope.`);
            logToFile(`Enquiry ${enq.RequestNo} filtered out — no pending base-price gaps for this user’s scope.`);
            return null;
        }

        /** Most recent non-empty UpdatedBy on EnquiryPricingValues for this enquiry (fallback: latest row) */
        const pricedRows = enqPrices
            .map((pr) => ({
                at: pr.UpdatedAt ?? pr.updatedAt,
                by: String(pr.UpdatedBy ?? pr.updatedBy ?? '').trim(),
            }))
            .filter((r) => r.at)
            .sort((a, b) => new Date(b.at) - new Date(a.at));
        let pricedBy = '';
        for (const r of pricedRows) {
            if (r.by) {
                pricedBy = r.by;
                break;
            }
        }
        if (!pricedBy && pricedRows.length) {
            pricedBy = pricedRows[0].by;
        }

        const subJobPriceLines = displayItems.length > 0 ? displayItems : displayItemsRaw;

        /**
         * List status under Enquiry No. must be based **only on own-job pricing**:
         * - None Priced: none of the own jobs has Base Price
         * - Partial Priced: at least one own job has Base Price
         * - All Priced: all own jobs have Base Price
         *
         * IMPORTANT: Do not consider any subjob pricing for this badge.
         */
        const isRootJobRec = (j) => {
            const pid = j.ParentID ?? j.parentID;
            return pid == null || String(pid) === '0' || pid === 0 || pid === '0';
        };
        const ownJobCandidates = (() => {
            if (divisionTrim) {
                const divNorm = normalizePricingJobName(String(divisionTrim).trim());
                const divAnchorsRaw = getDepartmentPricingAnchors(enqJobs, String(divisionTrim).trim());
                let divAnchors = (divAnchorsRaw || []).filter((jobRec) => {
                    const nm = normalizePricingJobName(jobRec?.ItemName || '');
                    return !!divNorm && nm === divNorm;
                });
                if (divAnchors.length === 0) divAnchors = divAnchorsRaw || [];
                return divAnchors;
            }
            // No division filter: "own jobs" = lead roots on this enquiry.
            return enqJobs.filter(isRootJobRec);
        })();
        let displaySpecStatus = null;
        if (divisionTrim && forestResolutionStatus) {
            displaySpecStatus = forestResolutionStatus;
        } else if (ownJobCandidates.length > 0) {
            let priced = 0;
            let declined = 0;
            let unpriced = 0;
            for (const jobRec of ownJobCandidates) {
                if (strictHasPositiveBaseForJob(jobRec)) priced += 1;
                else if (strictHasDeclinedBaseForJob(jobRec)) declined += 1;
                else unpriced += 1;
            }
            displaySpecStatus = ownJobResolutionStatusFromCounts(priced, declined, unpriced);
        }

        return {
            ...enq,
            CustomerName: fullCustomerName,
            SubJobPrices: subJobPriceLines.join(';;'),
            PricedBy: pricedBy || null,
            PricingListDisplayJson: pricingListDisplayJson || null,
            ...(displaySpecStatus ? { UserSpecPricingSummaryStatus: displaySpecStatus } : {}),
        };
    }).filter(Boolean);
}

// GET /api/pricing/list/pending
router.get('/list/pending', async (req, res) => {
    try {
        const { userEmail, division } = req.query;
        console.log('Pending Pricing (Helper) requested for:', userEmail);
        const result = await getEnquiryPricingList(userEmail, null, true, { division });
        res.json(result);
    } catch (err) {
        console.error('Error fetching pending pricing:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// GET /api/pricing/list/divisions — dropdown options: CC users see distinct Master_EnquiryFor.DepartmentName (CC row); else distinct Master_ConcernedSE.Department for the login email
router.get('/list/divisions', async (req, res) => {
    try {
        const { userEmail } = req.query;
        const email = (userEmail || '').trim();
        if (!email) {
            return res.json({ isCcUser: false, divisions: [] });
        }
        const ctx = await resolvePricingAccessContext(email);
        if (!ctx.user) {
            return res.json({ isCcUser: false, divisions: [] });
        }
        const { isCcUser, isAdmin, isManagementDept, normalizedEmail } = ctx;
        const request = new sql.Request();
        request.input('em', sql.NVarChar, normalizedEmail);
        if (isCcUser && (isAdmin || isManagementDept)) {
            const divisions = await fetchAllMasterDepartmentNames();
            return res.json({ isCcUser: true, divisions });
        }
        if (isCcUser) {
            request.input('ccPat', sql.NVarChar, `%,${normalizedEmail},%`);
            const loc = (normalizedEmail.split('@')[0] || '').trim();
            let dr;
            if (loc.length >= 2) {
                request.input('ccPatLoc', sql.NVarChar, `%,${loc},%`);
                dr = await request.query(`
                    SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) AS DivisionLabel
                    FROM dbo.Master_EnquiryFor mef
                    WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) <> N''
                      AND (
                        N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                          LIKE @ccPat
                        OR N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                          LIKE @ccPatLoc
                      )
                    ORDER BY DivisionLabel
                `);
            } else {
                dr = await request.query(`
                    SELECT DISTINCT LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) AS DivisionLabel
                    FROM dbo.Master_EnquiryFor mef
                    WHERE LTRIM(RTRIM(ISNULL(mef.DepartmentName, N''))) <> N''
                      AND N',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, N''), N' ', N''), N';', N',') + N','
                        LIKE @ccPat
                    ORDER BY DivisionLabel
                `);
            }
            const divisions = [...new Set((dr.recordset || []).map((r) => String(r.DivisionLabel || '').trim()).filter(Boolean))];
            return res.json({ isCcUser: true, divisions });
        }
        const req2 = new sql.Request();
        req2.input('em', sql.NVarChar, ctx.normalizedEmail);
        const dr2 = await req2.query(`
            SELECT DISTINCT LTRIM(RTRIM(ISNULL(Department, N''))) AS DivisionLabel
            FROM dbo.Master_ConcernedSE
            WHERE LTRIM(RTRIM(ISNULL(Department, N''))) <> N''
              AND LOWER(LTRIM(RTRIM(ISNULL(EmailId, N'')))) = LOWER(LTRIM(@em))
            ORDER BY DivisionLabel
        `);
        const divisions = [...new Set((dr2.recordset || []).map((r) => String(r.DivisionLabel || '').trim()).filter(Boolean))];
        return res.json({ isCcUser: false, divisions });
    } catch (err) {
        console.error('Error fetching pricing list divisions:', err);
        res.status(500).json({ error: 'Failed to load divisions' });
    }
});

// GET /api/pricing/list - New Generic List with Search
router.get('/list', async (req, res) => {
    try {
        const { userEmail, search, pendingOnly, dateFrom, dateTo, division } = req.query;
        console.log('Pricing List Search:', { search, userEmail, dateFrom, dateTo, division });
        const isPendingOnly = pendingOnly === 'true';
        const result = await getEnquiryPricingList(userEmail, search || null, isPendingOnly, { dateFrom, dateTo, division });
        res.json(result);
    } catch (err) {
        console.error('Error searching pricing list:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// GET /api/pricing/search-customers?q=term&userEmail=...
// When userEmail is sent, only names from enquiries visible in pricing (same rules as /list) are returned.
router.get('/search-customers', async (req, res) => {
    try {
        const query = req.query.q || '';
        const userEmail = req.query.userEmail || '';
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const term = `%${query}%`;
        const ctx = await resolvePricingAccessContext(userEmail);

        if (userEmail && !ctx.user) {
            return res.json([]);
        }

        if (!userEmail || ctx.isAdmin) {
            const result = await sql.query`
                SELECT TOP 10 CompanyName FROM Master_CustomerName WHERE CompanyName LIKE ${term}
                UNION
                SELECT TOP 10 CompanyName FROM Master_ClientName WHERE CompanyName LIKE ${term}
                UNION
                SELECT TOP 10 CompanyName FROM Master_ConsultantName WHERE CompanyName LIKE ${term}
            `;
            const names = [...new Set(result.recordset.map(r => r.CompanyName))];
            return res.json(names);
        }

        const request = new sql.Request();
        request.input('term', sql.NVarChar, term);
        let scoped = `
            SELECT DISTINCT TOP 10 E.CustomerName AS CompanyName
            FROM EnquiryMaster E
            WHERE E.CustomerName LIKE @term
        `;
        if (ctx.isCcUser) {
            request.input('pricingCcPattern', sql.NVarChar, `%,${ctx.normalizedEmail},%`);
            scoped += `
              AND EXISTS (
                  SELECT 1
                  FROM EnquiryFor ef
                  INNER JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE N'% - ' + mef.ItemName)
                  WHERE ef.RequestNo = E.RequestNo
                    AND ',' + REPLACE(REPLACE(ISNULL(mef.CCMailIds, ''), ' ', ''), ';', ',') + ',' LIKE @pricingCcPattern
              )
            `;
        } else {
            request.input('pricingAssignedName', sql.NVarChar, ctx.userFullName);
            scoped += `
              AND EXISTS (
                  SELECT 1
                  FROM ConcernedSE c
                  WHERE c.RequestNo = E.RequestNo
                    AND UPPER(LTRIM(RTRIM(ISNULL(c.SEName, '')))) = UPPER(LTRIM(RTRIM(@pricingAssignedName)))
              )
            `;
        }
        const scopedRes = await request.query(scoped);
        const names = [...new Set((scopedRes.recordset || []).map(r => r.CompanyName).filter(Boolean))];
        res.json(names);

    } catch (err) {
        console.error('Error searching customers:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * SQL fragment: normalize EnquiryPricingValues text columns (alias v) — trim only, no L-prefix stripping.
 */
function sqlStripPricingName(col) {
    return `LTRIM(RTRIM(ISNULL(v.${col}, N'')))`;
}

/**
 * Quote sidebar: EnquiryPricingValues filtered by own-job vs subjob rules.
 * @param {string|number} requestNo
 * @param {{ pricingScope: 'own'|'sub', leadJobClean: string, firstTab: string, activeTab?: string, customerDropdown?: string, parentJobName?: string, userEmail?: string }} scope
 */
async function fetchQuoteScopedPricingValues(requestNo, scope) {
    await ensureQuotingOrNotColumn();
    const { pricingScope, leadJobClean, firstTab, activeTab, customerDropdown, parentJobName, userEmail } = scope || {};
    if (!leadJobClean || !firstTab) return null;
    if (pricingScope !== 'own' && pricingScope !== 'sub') return null;
    if (pricingScope === 'sub' && !activeTab) return null;

    const leadSql = sqlStripPricingName('LeadJobName');
    const itemSql = sqlStripPricingName('EnquiryForItem');
    const custSql = sqlStripPricingName('CustomerName');

    const reqNoInt = parseInt(String(requestNo), 10);
    if (Number.isNaN(reqNoInt)) return null;

    const request = new sql.Request();
    request.input('requestNo', sql.Int, reqNoInt);
    request.input('leadClean', sql.NVarChar(500), String(leadJobClean));
    request.input('firstTab', sql.NVarChar(500), String(firstTab));

    const selectWithResolvedEf = `
        SELECT
            v.ID,
            v.RequestNo,
            v.OptionID,
            v.EnquiryForItem,
            v.EnquiryForID,
            v.Price,
            v.UpdatedBy,
            v.UpdatedAt,
            v.CustomerName,
            v.LeadJobName,
            v.PriceOption${epvQuotingOrNotSelectSql('v')},
            m.MatchedEnquiryForId,
            m.MatchedItemName,
            m.MatchedParentId
        FROM EnquiryPricingValues v
        OUTER APPLY (
            SELECT TOP 1
                ef.ID AS MatchedEnquiryForId,
                ef.ItemName AS MatchedItemName,
                ef.ParentID AS MatchedParentId
            FROM EnquiryFor ef
            WHERE ef.RequestNo = v.RequestNo
              AND (
                    (v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID)
                 OR (
                        LTRIM(RTRIM(ISNULL(v.EnquiryForItem, N''))) <> N''
                    AND LTRIM(RTRIM(v.EnquiryForItem)) = LTRIM(RTRIM(ef.ItemName))
                    )
                )
            ORDER BY
                CASE WHEN v.EnquiryForID IS NOT NULL AND v.EnquiryForID <> 0 AND v.EnquiryForID = ef.ID THEN 0 ELSE 1 END,
                ef.ID
        ) AS m
    `;

    let whereClause;
    if (pricingScope === 'own') {
        // OWN-JOB RULE (Quote EnquiryPricingValues dimensions):
        // Own-job summary: CustomerName = customer dropdown; EnquiryForItem = first tab (own-job label).
        // Subjobs under first tab: EnquiryForItem = each descendant subjob; CustomerName = that row's parent job (EnquiryFor).
        request.input('customerDropdown', sql.NVarChar(500), String(customerDropdown || ''));

        let subjobPairCondSql = '1=0';
        try {
            const efRes = await sql.query`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = ${requestNo}
            `;
            const efRows = efRes.recordset || [];
            const firstTabStr = String(firstTab || '').trim();

            const ownIds = new Set(
                efRows
                    .filter((r) => String(r.ItemName || '').trim() === firstTabStr)
                    .map((r) => String(r.ID))
            );

            const byId = new Map(efRows.map(r => [String(r.ID), r]));
            const subjobPairs = [];
            const seenPairKeys = new Set();
            const addPair = (itemName, parentName) => {
                const k = `${itemName}\x1e${parentName}`;
                if (seenPairKeys.has(k)) return;
                seenPairKeys.add(k);
                subjobPairs.push({ itemName, parentName });
            };

            const walkFrom = (parentId) => {
                efRows.forEach((r) => {
                    if (String(r.ParentID) !== String(parentId)) return;
                    const rid = String(r.ID);
                    const parentRow = byId.get(String(parentId));
                    if (!parentRow) return;
                    if (!ownIds.has(rid)) {
                        addPair(String(r.ItemName || '').trim(), String(parentRow.ItemName || '').trim());
                    }
                    walkFrom(rid);
                });
            };

            ownIds.forEach((id) => walkFrom(id));

            if (subjobPairs.length > 0) {
                const parts = [];
                subjobPairs.forEach((pair, i) => {
                    const inItem = `sjItem_${i}`;
                    const inParent = `sjParent_${i}`;
                    request.input(inItem, sql.NVarChar(500), pair.itemName);
                    request.input(inParent, sql.NVarChar(500), pair.parentName);
                    parts.push(`(
                        (v.EnquiryForItem = @${inItem} OR ${itemSql} = @${inItem})
                        AND (v.CustomerName = @${inParent} OR ${custSql} = @${inParent})
                    )`);
                });
                subjobPairCondSql = parts.join(' OR ');
            }
        } catch (e) {
            console.error('Pricing API: Failed to compute subjob parent pairs for quoteScopedValues:', e);
            subjobPairCondSql = '1=0';
        }

        whereClause = `
            v.RequestNo = @requestNo
            AND ${leadSql} = @leadClean
            AND (
                (
                    @customerDropdown <> ''
                    AND (
                        v.CustomerName = @customerDropdown
                        OR ${custSql} = @customerDropdown
                    )
                    AND @firstTab <> ''
                    AND (
                        v.EnquiryForItem = @firstTab
                        OR ${itemSql} = @firstTab
                    )
                )
                OR
                (${subjobPairCondSql})
            )
        `;
    } else {
        request.input('customerDropdown', sql.NVarChar(500), String(customerDropdown || ''));
        request.input('parentJobName', sql.NVarChar(500), String(parentJobName || ''));
        request.input('activeTab', sql.NVarChar(500), String(activeTab || ''));

        // Nested rows under the selected subjob tab: EnquiryForItem = child; CustomerName = child's parent
        // (same semantics as own-job branch, but rooted at activeTab instead of first tab).
        let nestedUnderActiveTabCondSql = '1=0';
        try {
            const efResSub = await sql.query`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = ${requestNo}
            `;
            const efRowsSub = efResSub.recordset || [];
            const activeTabStr = String(activeTab || '').trim();
            const byIdSub = new Map(efRowsSub.map((r) => [String(r.ID), r]));
            const activeTabIds = efRowsSub
                .filter((r) => String(r.ItemName || '').trim() === activeTabStr)
                .map((r) => String(r.ID));

            const nestedPairs = [];
            const seenNested = new Set();
            const addNestedPair = (itemName, parentName) => {
                const k = `${itemName}\x1e${parentName}`;
                if (seenNested.has(k)) return;
                seenNested.add(k);
                nestedPairs.push({ itemName, parentName });
            };

            const walkFromActiveTab = (parentId) => {
                efRowsSub.forEach((r) => {
                    if (String(r.ParentID) !== String(parentId)) return;
                    const parentRow = byIdSub.get(String(parentId));
                    if (!parentRow) return;
                    addNestedPair(String(r.ItemName || '').trim(), String(parentRow.ItemName || '').trim());
                    walkFromActiveTab(r.ID);
                });
            };

            activeTabIds.forEach((id) => walkFromActiveTab(id));

            if (nestedPairs.length > 0) {
                const parts = [];
                nestedPairs.forEach((pair, i) => {
                    const inItem = `subNestedItem_${i}`;
                    const inParent = `subNestedParent_${i}`;
                    request.input(inItem, sql.NVarChar(500), pair.itemName);
                    request.input(inParent, sql.NVarChar(500), pair.parentName);
                    parts.push(`(
                        (v.EnquiryForItem = @${inItem} OR ${itemSql} = @${inItem})
                        AND (v.CustomerName = @${inParent} OR ${custSql} = @${inParent})
                    )`);
                });
                nestedUnderActiveTabCondSql = parts.join(' OR ');
            }
        } catch (e) {
            console.error('Pricing API: Failed to compute nested pairs for quoteScopedValues (sub scope):', e);
            nestedUnderActiveTabCondSql = '1=0';
        }

        // SUBJOB RULE (non-first tab):
        // (3) CustomerName = first tab, EnquiryForItem = selected subjob tab.
        // (4) CustomerName = first tab, EnquiryForItem = parent of selected subjob (parentJobName) — legacy.
        // (5) Each descendant under activeTab in EnquiryFor: EnquiryForItem = child; CustomerName = parent row.
        whereClause = `
            v.RequestNo = @requestNo
            AND ${leadSql} = @leadClean
            AND (
                (
                    (v.CustomerName = @firstTab OR ${custSql} = @firstTab)
                    AND (v.EnquiryForItem = @activeTab OR ${itemSql} = @activeTab)
                )
                OR
                (
                    @parentJobName <> N''
                    AND (v.CustomerName = @firstTab OR ${custSql} = @firstTab)
                    AND (v.EnquiryForItem = @parentJobName OR ${itemSql} = @parentJobName)
                )
                OR
                (${nestedUnderActiveTabCondSql})
            )
        `;
    }

    const query = `
        ;WITH RowsFiltered AS (
            ${selectWithResolvedEf}
            WHERE ${whereClause}
        ),
        RowsRanked AS (
            SELECT
                rf.*,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        ISNULL(CONVERT(NVARCHAR(50), rf.OptionID), ''),
                        ISNULL(CONVERT(NVARCHAR(50), rf.EnquiryForID), ''),
                        ISNULL(LTRIM(RTRIM(rf.EnquiryForItem)), '')
                    ORDER BY
                        ISNULL(rf.UpdatedAt, '19000101') DESC,
                        rf.ID DESC
                ) AS rn
            FROM RowsFiltered rf
        )
        SELECT *
        FROM RowsRanked
        WHERE rn = 1;
    `;

    const result = await request.query(query);
    return (result.recordset || []).map(normalizePricingValueRow);
}

// GET /api/pricing/:requestNo - Get pricing grid for an enquiry
router.get('/:requestNo', async (req, res) => {
    try {
        const { requestNo } = req.params;
        const userEmail = req.query.userEmail || '';
        const sessionDivision = (req.query.division || '').toString().trim();

        console.log('Pricing API: Loading pricing for', requestNo, 'user:', userEmail, 'division:', sessionDivision || '(none)');

        // Get enquiry details including CreatedBy
        let enquiry;
        try {
            const enquiryResult = await sql.query`
                SELECT RequestNo, ProjectName, CreatedBy, CustomerName, ClientName, ConsultantName
                FROM EnquiryMaster 
                WHERE RequestNo = ${requestNo}
            `;

            if (enquiryResult.recordset.length === 0) {
                console.log('Pricing API: Enquiry not found:', requestNo);
                return res.status(404).json({ error: 'Enquiry not found' });
            }
            enquiry = enquiryResult.recordset[0];
            console.log('Pricing API: Found enquiry:', enquiry.RequestNo);
        } catch (err) {
            console.error('Error querying EnquiryMaster:', err);
            throw err;
        }

        /** Set while loading jobs — reused when computing edit scope for CC coordinators. */
        let pricingDetailAccessCtx = null;

        // Get EnquiryFor items (jobs/columns)
        let jobs = [];
        try {
            const jobsResult = await sql.query`
                SELECT 
                    ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode, ef.LeadJobName,
                    mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                    mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo,
                    mef.DivisionCode, mef.DepartmentCode
                FROM EnquiryFor ef
                LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
                WHERE ef.RequestNo = ${requestNo}
                ORDER BY ef.ID ASC
            `;

            // Polyfill ParentItemName in JS since it's missing from DB
            const rawJobsAll = jobsResult.recordset;
            // Deduplicate (Fix for Join Cartesian Product)
            const seenJobIds = new Set();
            const rawJobs = [];
            for (const j of rawJobsAll) {
                if (!seenJobIds.has(j.ID)) {
                    seenJobIds.add(j.ID);
                    rawJobs.push(j);
                }
            }

            // Build unique Lead Job code map for ROOTS ONLY (to follow structure)
            const rootsOnly = rawJobs.filter(r => !r.ParentID || r.ParentID == '0' || r.ParentID == 0);
            rootsOnly.sort((a, b) => a.ID - b.ID); // Keep stable order
            const rootCodeMap = {};
            rootsOnly.forEach((r, idx) => {
                rootCodeMap[r.ID] = `L${idx + 1}`;
            });

            jobs = rawJobs.map(job => {
                // Trace back to find parent root
                let currRoot = job;
                let safety = 0;
                let visited = new Set();
                while (currRoot.ParentID && currRoot.ParentID != '0' && safety < 10) {
                    if (visited.has(currRoot.ParentID)) break;
                    visited.add(currRoot.ParentID);
                    const p = rawJobs.find(item => item.ID === currRoot.ParentID);
                    if (p) currRoot = p;
                    else break;
                    safety++;
                }

                const assignedCode = rootCodeMap[currRoot.ID] || 'L1';
                const parent = rawJobs.find(p => p.ID === job.ParentID);

                return {
                    ...job,
                    LeadJobCode: assignedCode, // Use unique code assigned to root ancestor
                    ParentItemName: parent ? parent.ItemName : null
                };
            });

            console.log('Pricing API: Found', jobs.length, 'jobs');

            if (userEmail) {
                pricingDetailAccessCtx = await resolvePricingAccessContext(userEmail);
                if (!pricingDetailAccessCtx.user) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                // Non-admins: always scope by access rules; admins: all jobs unless a Division is selected
                const useDivision = Boolean(sessionDivision);
                const shouldScopeJobs = !pricingDetailAccessCtx.isAdmin || useDivision;
                if (shouldScopeJobs) {
                    if (!pricingDetailAccessCtx.isAdmin) {
                        const allowed = await userHasQuotePricingEnquiryAccess(
                            userEmail,
                            requestNo,
                            sessionDivision
                        );
                        if (!allowed) {
                            return res.status(403).json({ error: 'Forbidden' });
                        }
                    }
                    const allowedByConcernedSe = await userIsConcernedSeOnEnquiry(
                        pricingDetailAccessCtx,
                        requestNo
                    );
                    const anchors = resolvePricingAnchorJobsWithFallbacks(
                        jobs,
                        pricingDetailAccessCtx,
                        userEmail,
                        sessionDivision,
                        allowedByConcernedSe
                    );
                    if (anchors.length === 0) {
                        return res.status(403).json({ error: 'Forbidden' });
                    }
                    const visibleIds = expandVisibleJobIdsWithAncestors(anchors, jobs);
                    const beforeCount = jobs.length;
                    jobs = jobs.filter(j => visibleIds.has(String(jobIdOfPricing(j))));
                    console.log(`Pricing API: Job scope for ${userEmail}: ${jobs.length}/${beforeCount} rows`);
                }
            }
        } catch (err) {
            console.error('Error querying EnquiryFor:', err);
            throw err;
        }

        // Fetch additional customers from EnquiryCustomer table
        let extraCustomers = [];
        try {
            const extraRes = await sql.query`
                SELECT CustomerName 
                FROM EnquiryCustomer 
                WHERE RequestNo = ${requestNo}
            `;
            extraCustomers = extraRes.recordset;
        } catch (err) {
            console.error('Error fetching extra customers:', err);
        }

        /** Detail GET: base option rows from `EnquiryPricingValues`; merged with `EnquiryPricingOptions` so new rows without EPV yet still appear. */
        let values = [];
        try {
            await ensureQuotingOrNotColumn();
            const valuesResult = quotingOrNotColumnAvailable
                ? await sql.query`
                SELECT
                    ID,
                    RequestNo,
                    OptionID,
                    EnquiryForItem,
                    EnquiryForID,
                    Price,
                    UpdatedBy,
                    UpdatedAt,
                    CustomerName,
                    LeadJobName,
                    PriceOption,
                    Quotingornot
                FROM EnquiryPricingValues
                WHERE RequestNo = ${requestNo}
            `
                : await sql.query`
                SELECT
                    ID,
                    RequestNo,
                    OptionID,
                    EnquiryForItem,
                    EnquiryForID,
                    Price,
                    UpdatedBy,
                    UpdatedAt,
                    CustomerName,
                    LeadJobName,
                    PriceOption
                FROM EnquiryPricingValues
                WHERE RequestNo = ${requestNo}
            `;
            values = (valuesResult.recordset || []).map(normalizePricingValueRow);
            console.log('Pricing API: Found', values.length, 'values (total)');
        } catch (err) {
            console.error('Error querying EnquiryPricingValues:', err);
            throw err;
        }

        // Identify Lead Job (First item)
        const leadJobItem = jobs.length > 0 ? jobs[0].ItemName : null;

        // Get active customer for initial selection only
        let activeCustomerName = req.query.customerName;
        if (!activeCustomerName) {
            if (extraCustomers.length > 0 && extraCustomers[0].CustomerName) {
                activeCustomerName = String(extraCustomers[0].CustomerName).trim();
            } else {
                const rawCust = enquiry.CustomerName || '';
                activeCustomerName = rawCust.split(',')[0].trim();
            }
        }

        // Customer tabs: EnquiryCustomer rows when present; otherwise distinct names from EnquiryPricingValues only.
        let customers = [];
        try {
            if (extraCustomers.length > 0) {
                const seen = new Set();
                extraCustomers.forEach((row) => {
                    const n = String(row.CustomerName || '').trim();
                    if (!n) return;
                    const k = n.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        customers.push(n);
                    }
                });
            } else {
                const seen = new Set();
                for (const v of values) {
                    const n = String(v.CustomerName ?? v.customerName ?? '').trim();
                    if (!n) continue;
                    const k = n.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        customers.push(n);
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching customers:', err);
        }

        let excludedNames = new Set();


        // Determine user access (MOVED UP)
        let userHasLeadAccess = false;
        let userJobItems = [];
        let userRole = '';
        let userFullName = '';
        let userDepartment = '';
        let userDepartmentRaw = '';

        if (userEmail) {
            const normalizedUserEmail = String(userEmail || '')
                .trim()
                .toLowerCase()
                .replace(/@almcg\.com/g, '@almoayyedcg.com');
            try {
                const userResult = await sql.query`
                    SELECT FullName, Roles, Department FROM Master_ConcernedSE WHERE EmailId = ${userEmail}
                `;
                let userRows = userResult.recordset || [];
                if (userRows.length === 0 && normalizedUserEmail) {
                    const fuzzyUserResult = await sql.query`
                        SELECT TOP 1 FullName, Roles, Department
                        FROM Master_ConcernedSE
                        WHERE
                            LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedUserEmail}
                            OR LOWER(REPLACE(REPLACE(REPLACE(
                                LEFT(LTRIM(RTRIM(ISNULL(EmailId, ''))), CHARINDEX('@', LTRIM(RTRIM(ISNULL(EmailId, ''))) + '@') - 1),
                                '.', ''), '-', ''), '_', '')) =
                               LOWER(REPLACE(REPLACE(REPLACE(
                                LEFT(${normalizedUserEmail}, CHARINDEX('@', ${normalizedUserEmail} + '@') - 1),
                                '.', ''), '-', ''), '_', ''))
                        ORDER BY CASE
                            WHEN LOWER(LTRIM(RTRIM(ISNULL(EmailId, '')))) = ${normalizedUserEmail} THEN 0
                            ELSE 1
                        END
                    `;
                    userRows = fuzzyUserResult.recordset || [];
                }
                if (userRows.length > 0) {
                    userFullName = userRows[0].FullName || '';
                    userRole = userRows[0].Roles || '';
                    userDepartmentRaw = userRows[0].Department ? userRows[0].Department.toString().trim() : '';
                    userDepartment = userDepartmentRaw ? userDepartmentRaw.toLowerCase().trim() : '';
                }
            } catch (err) {
                console.error('Error getting user name:', err);
            }

            // Prefer Pricing "Division" dropdown (session) for own-job/department name matching vs EnquiryFor.ItemName
            const effectiveDeptForJobMatch = sessionDivision
                ? String(sessionDivision).toLowerCase().trim()
                : userDepartment;

            // Check if user is the creator (Lead Job owner) or Admin
            const isAdmin = userRole === 'Admin';
            if (isAdmin) {
                userHasLeadAccess = true;
                userJobItems = jobs.map(j => j.ItemName);
            }

            // Also check email-based access
            jobs.forEach(job => {
                const commonMails = (job.CommonMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const ccMails = (job.CCMailIds || '').toLowerCase().split(',').map(s => s.trim());
                const allMails = [...commonMails, ...ccMails];

                const userEmailUsername = userEmail.split('@')[0].toLowerCase();
                const jobNameLower = job.ItemName.toLowerCase().trim();

                let isMatch = allMails.includes(userEmail.toLowerCase()) ||
                    allMails.some(e => e.split('@')[0] === userEmailUsername) ||
                    (effectiveDeptForJobMatch && jobNameLower.includes(effectiveDeptForJobMatch)) ||
                    (userFullName && allMails.some(e => e.includes(userFullName.toLowerCase())));

                if (isMatch) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                    // NEW: Detect Lead Access if assigned to ANY root job
                    if (!job.ParentID || job.ParentID === '0' || job.ParentID === 0) {
                        userHasLeadAccess = true;
                    }
                }
            });

            // SMART SCOPE EXPANSION:
            const cleanUserScopes = new Set(
                userJobItems.map((name) => String(name || '').trim().toLowerCase())
            );

            jobs.forEach(job => {
                const cleanName = String(job.ItemName || '').trim().toLowerCase();
                if (cleanUserScopes.has(cleanName)) {
                    if (!userJobItems.includes(job.ItemName)) {
                        userJobItems.push(job.ItemName);
                    }
                }
            });

            /**
             * CC / Management coordinators: same pricing actions as a Concerned SE for the selected Division.
             * Anchor scoping already filtered `jobs`; mail + Master_ConcernedSE matching often leaves `userJobItems`
             * empty for CC-only logins — then Add / Save / branch edit stay disabled on the client.
             */
            if (pricingDetailAccessCtx && pricingDetailAccessCtx.isCcUser) {
                const divForAnchor = (sessionDivision && String(sessionDivision).trim()) || '';
                const anchorJobs = getPricingAnchorJobsForDivision(
                    jobs,
                    pricingDetailAccessCtx,
                    normalizedUserEmail,
                    divForAnchor
                );
                for (const aj of anchorJobs) {
                    const nm = String(aj.ItemName || '').trim();
                    if (!nm) continue;
                    if (!userJobItems.includes(nm)) userJobItems.push(nm);
                    const pid = aj.ParentID;
                    if (pid == null || pid === '' || pid === 0 || pid === '0') {
                        userHasLeadAccess = true;
                    }
                }
                const cleanScopesCc = new Set(
                    userJobItems.map((name) => String(name || '').trim().toLowerCase())
                );
                jobs.forEach((job) => {
                    const cleanName = String(job.ItemName || '').trim().toLowerCase();
                    if (cleanScopesCc.has(cleanName)) {
                        if (!userJobItems.includes(job.ItemName)) {
                            userJobItems.push(job.ItemName);
                        }
                    }
                });
            }
        }

        // FILTER: Scope Customers based on User Role
        if (leadJobItem && jobs.length > 0) {
            const clean = (name) => (name ? String(name).trim() : '');
            const leadJob = jobs.find(j => j.ItemName === leadJobItem);

            if (leadJob) {
                const findDescendants = (parentId, set) => {
                    const children = jobs.filter(j => j.ParentID === parentId);
                    children.forEach(c => {
                        set.add(clean(c.ItemName));
                        set.add(c.ItemName); // Add raw too
                        findDescendants(c.ID, set);
                    });
                };

                if (userHasLeadAccess) {
                    // LEAD / ADMIN: Exclude ALL jobs in branches where user is a Lead
                    // Find roots user has access to
                    const roots = jobs.filter(j => !j.ParentID || j.ParentID === '0' || j.ParentID === 0);
                    roots.forEach(root => {
                        // Check if user is assigned to this root or if they are Admin
                        const isAdmin = userRole === 'Admin';
                        const isAssigned = userJobItems.includes(root.ItemName);

                        if (isAdmin || isAssigned) {
                            excludedNames.add(clean(root.ItemName));
                            excludedNames.add(root.ItemName);
                            findDescendants(root.ID, excludedNames);
                        }
                    });

                    // Fallback: If no specific roots assigned but user has Lead Access (Creator match?), use first lead job
                    if (excludedNames.size === 0) {
                        excludedNames.add(clean(leadJobItem));
                        excludedNames.add(leadJobItem);
                        findDescendants(leadJob.ID, excludedNames);
                    }
                } else {
                    // SUB-JOB USER: Exclude Self (Assigned Jobs) AND Descendants of Assigned Jobs.
                    // Do NOT exclude Lead Job (Parent), as it is a valid internal customer for them.
                    userJobItems.forEach(jobName => {
                        const jobObj = jobs.find(j => j.ItemName === jobName);
                        if (jobObj) {
                            excludedNames.add(clean(jobName));
                            excludedNames.add(jobName);
                            findDescendants(jobObj.ID, excludedNames);
                        }
                    });
                }

                if (excludedNames.size > 0) {
                    const excluded = [...excludedNames];
                    console.log('Pricing API: Filtering out internal/descendant customers:', excluded);
                    customers = customers.filter(c => !excludedNames.has(clean(c)) && !excludedNames.has(c));
                }
            }
        }

        let options = [];
        try {
            options = buildDetailPricingOptionsFromValuesRows(values);
            let epoRows = [];
            try {
                const epoRes = await sql.query`
                    SELECT ID, RequestNo, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
                    FROM EnquiryPricingOptions
                    WHERE RequestNo = ${requestNo}
                `;
                epoRows = epoRes.recordset || [];
            } catch (epoErr) {
                console.error('Error querying EnquiryPricingOptions for detail:', epoErr);
            }
            const fallbackLeadForEpo = leadJobItem || '';
            options = mergeDetailOptionsWithEnquiryPricingOptionsRows(options, epoRows, fallbackLeadForEpo);
            console.log(
                'Pricing API: options after merge EPV + EnquiryPricingOptions =',
                options.length,
                '(epo rows',
                epoRows.length,
                ')'
            );
        } catch (err) {
            console.error('Error building pricing options from values:', err);
            options = [];
        }

        // Quote module: optional scoped rows (own job vs subjob) — same rules as documented SQL
        let quoteScopedValues = null;
        let scopedFromServer = false;
        try {
            const pricingScope = (req.query.pricingScope || '').toLowerCase();
            const leadJobClean = req.query.leadJobClean ? String(req.query.leadJobClean) : '';
            const firstTab = req.query.firstTab ? String(req.query.firstTab) : '';
            const activeTab = req.query.activeTab ? String(req.query.activeTab) : '';
            const parentJobNameScoped = req.query.parentJobName ? String(req.query.parentJobName) : '';
            const customerDropdownScoped = req.query.customerName
                ? String(req.query.customerName)
                : (activeCustomerName || '');

            if ((pricingScope === 'own' || pricingScope === 'sub') && leadJobClean && firstTab) {
                quoteScopedValues = await fetchQuoteScopedPricingValues(requestNo, {
                    pricingScope,
                    leadJobClean,
                    firstTab,
                    activeTab: pricingScope === 'sub' ? activeTab : '',
                    customerDropdown: customerDropdownScoped,
                    parentJobName: pricingScope === 'sub' ? parentJobNameScoped : '',
                    userEmail
                });
                scopedFromServer = Array.isArray(quoteScopedValues) && quoteScopedValues.length > 0;
                console.log('Pricing API: quoteScopedValues', scopedFromServer ? quoteScopedValues.length : 0, 'rows (scope=', pricingScope, ')');
            }
        } catch (scopeErr) {
            console.error('Error fetching quoteScopedValues:', scopeErr);
        }

        // Create value lookup map -> REMOVED (Sending raw array to frontend to handle multi-customer collision)
        // const valueMap = {};
        // values.forEach(v => {
        //     const key = v.EnquiryForID ? `${v.OptionID}_${v.EnquiryForID}` : `${v.OptionID}_${v.EnquiryForItem}`;
        //     valueMap[key] = v;
        // });




        // Determine visible and editable jobs
        // HIERARCHY LOGIC IMPLEMENTATION
        let visibleJobs = [];
        let editableJobs = [];

        // 1. EDIT PERMISSIONS (Strict)
        let visibleJobIds, editableJobIds;
        if (userRole === 'Admin') {
            editableJobs = jobs.map(j => j.ItemName);
        } else {
            // Default: Edit what you are assigned (Email matched)
            editableJobs = [...userJobItems];

            // NOTE: Creators do NOT get implicit edit access to Lead Job anymore.
            // They must be explicitly assigned to the Lead Job (via Email/Master) to edit it.
            // This prevents Generic Creators (e.g. 'BMS') from editing 'Civil' Lead Jobs inadvertently.
        }

        // 2. VIEW PERMISSIONS (Tree / Global)
        const isCreator = (enquiry.CreatedBy && userFullName && enquiry.CreatedBy.toLowerCase().trim() === userFullName.toLowerCase().trim());

        // FIX: Only Admins get global 'View All' access. 
        // Other users (including Leads/Creators) follow the hierarchical View logic below.
        const isGlobalView = userRole === 'Admin';

        if (isGlobalView) {
            console.log('Pricing API: Admin Access -> View All');
            visibleJobs = jobs.map(j => j.ItemName);
            visibleJobIds = new Set(jobs.map((j) => String(j.ID)));
        } else {
            // Standard User: View Assigned + Descendants
            // Fallback: If Creator has NO assignments, should we show everything or nothing?
            // Strict approach: Show nothing (or let them add themselves).
            // But to avoid "Blank Screen" confusion for unassigned Creators, we can grant Lead access IF generic?
            // User Request was explicit: "Access ONLY View BMS". This implies strictness.

            // ID-Based Traversal for Robustness
            const selfJobIds = jobs.filter(j => userJobItems.includes(j.ItemName)).map(j => j.ID);

            const getAllDescendantIds = (parentIds, allJobs) => {
                let descendantIds = [];
                let queue = [...parentIds];
                let processed = new Set();

                while (queue.length > 0) {
                    const currentId = queue.pop();
                    const curKey = String(currentId);
                    if (processed.has(curKey)) continue;
                    processed.add(curKey);

                    const children = allJobs.filter(
                        (j) => j.ParentID != null && String(j.ParentID) === curKey
                    );
                    children.forEach(c => {
                        descendantIds.push(c.ID);
                        queue.push(c.ID);
                    });
                }
                return descendantIds;
            };

            /** Walk up from each assigned job so every lead root on the path is viewable (lead job dropdown). */
            const getAllAncestorIds = (assignedIds, allJobs) => {
                const byId = new Map(allJobs.map(j => [j.ID, j]));
                const out = [];
                const seen = new Set();
                assignedIds.forEach((jid) => {
                    let current = byId.get(jid);
                    let safety = 0;
                    while (current && safety < 40) {
                        const pid = current.ParentID;
                        if (pid == null || pid === '' || pid === 0 || pid === '0') break;
                        const p = byId.get(pid);
                        if (!p) break;
                        if (!seen.has(p.ID)) {
                            seen.add(p.ID);
                            out.push(p.ID);
                        }
                        current = p;
                        safety++;
                    }
                });
                return out;
            };

            const descendantIds = getAllDescendantIds(selfJobIds, jobs);
            const ancestorIds = getAllAncestorIds(selfJobIds, jobs);
            const allVisibleIds = new Set(
                [...selfJobIds, ...descendantIds, ...ancestorIds].map((id) => String(id))
            );

            visibleJobs = jobs.filter((j) => allVisibleIds.has(String(j.ID))).map((j) => j.ItemName);
            visibleJobIds = allVisibleIds; // ID Set (string keys)
            // Default: user edits jobs they are assigned to.
            const allEditableIds = new Set(selfJobIds.map((id) => String(id)));
            // Pricing: if the user is assigned to a lead root (ParentID 0), they may edit every
            // division/subjob under that lead (same branch). Fixes read-only sibling rows (e.g. BMS vs HVAC)
            // where descendants were visible but delete/trash was hidden for non-listed names.
            const jobByIdForEdit = new Map(jobs.map((j) => [j.ID, j]));
            const leadRootIdsAmongAssigned = selfJobIds.filter((jid) => {
                const j = jobByIdForEdit.get(jid);
                return j && (!j.ParentID || j.ParentID === 0 || j.ParentID === '0');
            });
            if (leadRootIdsAmongAssigned.length > 0) {
                const branchDescendantIds = getAllDescendantIds(leadRootIdsAmongAssigned, jobs);
                branchDescendantIds.forEach((id) => allEditableIds.add(String(id)));
            }
            editableJobIds = allEditableIds;
            editableJobs = jobs.filter((j) => allEditableIds.has(String(j.ID))).map((j) => j.ItemName);

        }

        console.log('Final Visible:', visibleJobs);
        console.log('Final Editable:', editableJobs);

        console.log('Pricing API: Sending Response with jobs:', JSON.stringify(jobs.map(j => ({ name: j.ItemName, logo: j.CompanyLogo })), null, 2));

        let existingQuotes = [];
        try {
            const eqRes = await sql.query`
                SELECT LeadJob, OwnJob, ToName, QuoteNumber
                FROM EnquiryQuotes
                WHERE RequestNo = ${requestNo}
            `;
            existingQuotes = mapEnquiryQuoteRowsForDeclineGuard(eqRes.recordset);
        } catch (eqErr) {
            console.warn('Pricing API: failed to load existingQuotes:', eqErr.message);
        }

        res.setHeader('Cache-Control', 'no-store, private, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.json({
            enquiry: {
                requestNo: enquiry.RequestNo,
                projectName: enquiry.ProjectName,
                createdBy: enquiry.CreatedBy,
                customerName: enquiry.CustomerName,
                clientName: enquiry.ClientName,
                consultantName: enquiry.ConsultantName
            },
            extraCustomers: extraCustomers
                .map(c => (c.CustomerName || '').replace(/,+$/g, '').trim()) // Normalize names
                .filter((name) => {
                    const cleanName = String(name || '').trim();
                    return name && !excludedNames.has(name) && !excludedNames.has(cleanName);
                }),
            customers: customers,
            activeCustomer: (activeCustomerName && (excludedNames.has(activeCustomerName) || excludedNames.has(String(activeCustomerName || '').trim())))
                ? (customers.length > 0 ? customers[0] : '')
                : (activeCustomerName || '').replace(/,+$/g, '').trim(),
            leadJob: leadJobItem,
            jobs: jobs.map(j => ({
                id: j.ID,
                parentId: j.ParentID,
                itemName: j.ItemName,
                leadJobCode: j.LeadJobCode,
                companyLogo: j.CompanyLogo ? j.CompanyLogo.replace(/\\/g, '/') : null,
                departmentName: j.DepartmentName,
                companyName: j.CompanyName,
                address: j.Address,
                phone: j.Phone,
                fax: j.FaxNo,
                email: j.CommonMailIds,
                divisionCode: j.DivisionCode,
                departmentCode: j.DepartmentCode,
                isLead: !j.ParentID || j.ParentID === 0 || j.ParentID === "0",
                visible:
                    typeof visibleJobIds !== 'undefined'
                        ? visibleJobIds.has(String(j.ID))
                        : visibleJobs.includes(j.ItemName),
                editable:
                    typeof editableJobIds !== 'undefined'
                        ? editableJobIds.has(String(j.ID))
                        : editableJobs.includes(j.ItemName)
            })),
            options: options.map(o => ({
                id: o.ID,
                name: o.OptionName,
                sortOrder: o.SortOrder,
                itemName: o.ItemName,
                customerName: o.CustomerName, // Expose CustomerName
                leadJobName: o.LeadJobName    // Expose LeadJobName
            })),
            values: values,
            quoteScopedValues: quoteScopedValues,
            scopedFromServer: scopedFromServer,
            existingQuotes,
            currentUserOwnJob: (sessionDivision || userDepartmentRaw || '').trim(),
            access: {
                hasLeadAccess: userHasLeadAccess,
                visibleJobs: visibleJobs,
                editableJobs: editableJobs
            }
        });

    } catch (err) {
        console.error('Error fetching pricing:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to fetch pricing data: ' + err.message });
    }
});

// POST /api/pricing/option - Add a new pricing option (row)
router.post('/option', async (req, res) => {
    try {
        const { requestNo, optionName, itemName, customerName, leadJobName, enquiryForId } = req.body; // Accept leadJobName (Step 1013) & enquiryForId

        if (!requestNo || !optionName) {
            return res.status(400).json({ error: 'RequestNo and optionName are required' });
        }

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        let resolvedItemName = itemName;
        let resolvedCustomerName = customerName;
        /** Canonical root `ItemName` from EnquiryFor walk — must win over client `leadJobName` text. */
        let leadJobNameFromWalk = null;

        try {
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // Use ID if available, otherwise find by Name (Legacy/Manual)
            // If finding by name, try to also match leadJobName if provided to disambiguate branches
            let job = null;
            if (enquiryForId) {
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            if (!job && itemName) {
                // Try to disambiguate by LeadJobName if we have multiple items with same name
                const possibleJobs = jobs.filter(j => j.ItemName === itemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    // Resolve each possible job's root and check if it matches provided leadJobName
                    job = possibleJobs.find(pj => {
                        let root = pj;
                        let visited = new Set();
                        while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                            visited.add(root.ID);
                            root = jobMap[root.ParentID];
                        }
                        return root.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0]; // fallback to first match
            }

            if (job) {
                resolvedItemName = job.ItemName;
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    resolvedCustomerName = customerName; // Keep external customer
                }

                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                leadJobNameFromWalk = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Option Resolution Error:', resolveErr);
        }

        // Atomic Insert with LeadJob scoped uniqueness
        const resolvedOptionName = optionName.trim();
        resolvedItemName = itemName ? itemName.trim() : (resolvedItemName ? resolvedItemName.trim() : null);
        resolvedCustomerName = resolvedCustomerName ? resolvedCustomerName.trim() : null;
        const resolvedLeadJobName =
            (leadJobNameFromWalk && String(leadJobNameFromWalk).trim()) ||
            (leadJobName && String(leadJobName).trim()) ||
            null;

        // DEBUG: capture cases where CustomerName ends up NULL unexpectedly
        if (!resolvedCustomerName) {
            logToFile(
                `POST /api/pricing/option CustomerName NULL. ` +
                `body=${JSON.stringify({ requestNo, optionName, itemName, customerName, leadJobName, enquiryForId })} ` +
                `resolved=${JSON.stringify({ resolvedItemName, resolvedCustomerName, resolvedLeadJobName })}`
            );
        }

        const result = await sql.query`
            BEGIN TRAN;

            IF NOT EXISTS (
                SELECT 1
                FROM EnquiryPricingOptions WITH (UPDLOCK, HOLDLOCK)
                WHERE RequestNo = ${requestNo}
                  AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                  AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                  AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                  AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
            )
            BEGIN
                INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName, LeadJobName)
                VALUES (
                    ${requestNo},
                    ${resolvedOptionName},
                    (SELECT ISNULL(MAX(SortOrder), 0) + 1
                     FROM EnquiryPricingOptions
                     WHERE RequestNo = ${requestNo}
                       AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                       AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                       AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                       AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
                    ),
                    ${resolvedItemName || null},
                    ${resolvedCustomerName || null},
                    ${resolvedLeadJobName || null}
                );
            END
            ELSE
            BEGIN
                -- Backfill/update resolved metadata if the row already exists
                UPDATE EnquiryPricingOptions
                SET
                    ItemName = ${resolvedItemName || null},
                    CustomerName = ${resolvedCustomerName || null},
                    LeadJobName = ${resolvedLeadJobName || null}
                WHERE RequestNo = ${requestNo}
                  AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
                  AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
                  AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
                  AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL));
            END

            SELECT TOP 1
                ID, OptionName, SortOrder, ItemName, CustomerName, LeadJobName
            FROM EnquiryPricingOptions
            WHERE RequestNo = ${requestNo}
              AND LTRIM(RTRIM(OptionName)) = ${resolvedOptionName}
              AND (LTRIM(RTRIM(ItemName)) = ${resolvedItemName || null} OR (ItemName IS NULL AND ${resolvedItemName || null} IS NULL))
              AND (LTRIM(RTRIM(CustomerName)) = ${resolvedCustomerName || null} OR (CustomerName IS NULL AND ${resolvedCustomerName || null} IS NULL))
              AND (LTRIM(RTRIM(LeadJobName)) = ${resolvedLeadJobName || null} OR (LeadJobName IS NULL AND ${resolvedLeadJobName || null} IS NULL))
            ORDER BY ID DESC;

            COMMIT;
        `;

        res.json({
            success: true,
            option: result.recordset[0]
        });

    } catch (err) {
        console.error('Error adding option:', err);
        res.status(500).json({ error: 'Failed to add option' });
    }
});

// PUT /api/pricing/value - Update a pricing cell value
router.put('/value', async (req, res) => {
    try {
        await ensureQuotingOrNotColumn();
        const {
            requestNo,
            optionId,
            enquiryForItem,
            enquiryForId,
            price,
            updatedBy,
            customerName,
            leadJobName,
            priceOption,
            allowOptionalZero,
            quotingOrNot,
            quotingornot,
        } = req.body;

        if (!requestNo || !optionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const debugForEnquiry = String(requestNo) === '25';
        if (debugForEnquiry) {
            logToFile(
                `PUT /api/pricing/value called: ` +
                `requestNo=${requestNo} optionId=${optionId} enquiryForId=${enquiryForId} ` +
                `price=${price} customerName=${customerName} leadJobName=${leadJobName} ` +
                `priceOption=${priceOption}`
            );
        }

        const priceValue = parseFloat(price) || 0;
        const quotingValue = normalizeQuotingOrNotValue(
            quotingOrNot !== undefined ? quotingOrNot : quotingornot
        );
        const quotingProvided =
            quotingOrNot !== undefined || quotingornot !== undefined;

        if (priceValue < 0) {
            return res.status(400).json({ error: 'Price cannot be negative', skipped: true });
        }

        // --- HIERARCHY RESOLUTION (Step 2026-03-09) ---
        // 1. EnquiryForItem - Own Job (Division name)
        // 2. CustomerName - Parent job name (If ownjob is subjob), External customer names (if ownjob is leadjob)
        // 3. LeadJobName - Leadjob name (Division name)
        let resolvedItemName = enquiryForItem;
        let resolvedCustomerName = customerName;
        let resolvedLeadJobName = leadJobName;

        try {
            // Fetch jobs for this request to resolve hierarchy
            const jobsResult = await sql.query`SELECT ID, ParentID, ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
            const jobs = jobsResult.recordset || [];
            const jobMap = {};
            jobs.forEach(j => jobMap[j.ID] = j);

            // --- STRICT RESOLUTION PRIORITY ---
            let job = null;
            if (enquiryForId) {
                // If ID is provided, it MUST match strictly to avoid branch-collisions (e.g. root BMS vs child BMS)
                job = jobs.find(j => String(j.ID) === String(enquiryForId));
            }

            // Fallback to name only if ID wasn't provided or didn't match (Legacy/Manual)
            if (!job && resolvedItemName) {
                // Handle multiple same-named items by checking branch context if LeadJobName was provided
                const possibleJobs = jobs.filter(j => j.ItemName === resolvedItemName);
                if (possibleJobs.length > 1 && leadJobName) {
                    job = possibleJobs.find(pj => {
                        let r = pj;
                        let v = new Set();
                        while (r.ParentID && r.ParentID !== 0 && r.ParentID !== '0' && jobMap[r.ParentID] && !v.has(r.ID)) {
                            v.add(r.ID);
                            r = jobMap[r.ParentID];
                        }
                        return r.ItemName === leadJobName;
                    });
                }
                if (!job) job = possibleJobs[0];
            }

            if (job) {
                // 1. Own Job Name
                resolvedItemName = job.ItemName;

                // 2. Customer Name (Parent job for sub-jobs, External for lead-jobs)
                if (job.ParentID && job.ParentID !== 0 && job.ParentID !== '0' && jobMap[job.ParentID]) {
                    resolvedCustomerName = jobMap[job.ParentID].ItemName;
                } else {
                    // Lead Job: Keep provided name (intended external customer)
                    resolvedCustomerName = customerName;
                }

                // 3. Lead Job Name (Root of the branch)
                let root = job;
                let visited = new Set();
                while (root.ParentID && root.ParentID !== 0 && root.ParentID !== '0' && jobMap[root.ParentID] && !visited.has(root.ID)) {
                    visited.add(root.ID);
                    root = jobMap[root.ParentID];
                }
                resolvedLeadJobName = root.ItemName;
            }
        } catch (resolveErr) {
            console.error('Pricing Metadata Resolution Error:', resolveErr);
            // Fallback to provided values
        }

        if (quotingProvided && quotingValue === 'Yes') {
            const eqRes = await sql.query`
                SELECT LeadJob, OwnJob, ToName, QuoteNumber
                FROM EnquiryQuotes
                WHERE RequestNo = ${requestNo}
            `;
            const existingQuotes = mapEnquiryQuoteRowsForDeclineGuard(eqRes.recordset);
            if (quoteBlocksDeclineToQuote(existingQuotes, resolvedLeadJobName, resolvedCustomerName)) {
                return res.status(409).json({
                    error: 'Cannot decline to quote: a quote already exists for this enquiry, lead job, and customer.',
                    code: 'QUOTE_ALREADY_EXISTS',
                });
            }
        }

        // --- UPSERT LOGIC WITH RESOLVED METADATA ---
        //
        // IMPORTANT: When `EnquiryForID` is set, match ONLY on RequestNo + OptionID + EnquiryForID.
        // Including CustomerName in the lookup caused INSERT-every-time when:
        // - DB had NULL vs resolved text, trimming drift, or legacy rows before hierarchy rules
        // → duplicate EPV rows (same job + option, different CustomerName) and “saved 1 but DB shows 0”.
        // We UPDATE all matching rows so accidental duplicates converge to one price + resolved metadata.

        let existingResult;

        if (enquiryForId) {
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForID = ${enquiryForId}
            `;
        } else {
            // Legacy: name-based cell (no EnquiryForID). Compare trimmed names so NULL/'' align.
            const custTrim =
                resolvedCustomerName != null ? String(resolvedCustomerName).trim() : '';
            existingResult = await sql.query`
                SELECT ID FROM EnquiryPricingValues 
                WHERE RequestNo = ${requestNo} 
                AND OptionID = ${optionId} 
                AND EnquiryForItem = ${resolvedItemName}
                AND LTRIM(RTRIM(ISNULL(CustomerName, N''))) = ${custTrim}
            `;
        }

        const now = new Date();
        // Do not insert brand-new zero-value rows unless declining to quote.
        // But if a row already exists, allow updating it to zero.
        if (
            priceValue <= 0 &&
            existingResult.recordset.length === 0 &&
            !(quotingProvided && quotingValue === 'Yes')
        ) {
            return res.json({ success: true, skipped: true, reason: 'zero-new-row-skipped' });
        }

        if (existingResult.recordset.length > 0) {
            if (enquiryForId) {
                if (quotingProvided && quotingOrNotColumnAvailable) {
                    await sql.query`
                        UPDATE EnquiryPricingValues 
                        SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                            EnquiryForID = ${enquiryForId || null},
                            EnquiryForItem = ${resolvedItemName},
                            LeadJobName = ${resolvedLeadJobName},
                            CustomerName = ${resolvedCustomerName},
                            PriceOption = ${priceOption || null},
                            Quotingornot = ${quotingValue}
                        WHERE RequestNo = ${requestNo} 
                        AND OptionID = ${optionId} 
                        AND EnquiryForID = ${enquiryForId}
                    `;
                } else {
                    await sql.query`
                        UPDATE EnquiryPricingValues 
                        SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                            EnquiryForID = ${enquiryForId || null},
                            EnquiryForItem = ${resolvedItemName},
                            LeadJobName = ${resolvedLeadJobName},
                            CustomerName = ${resolvedCustomerName},
                            PriceOption = ${priceOption || null}
                        WHERE RequestNo = ${requestNo} 
                        AND OptionID = ${optionId} 
                        AND EnquiryForID = ${enquiryForId}
                    `;
                }
            } else {
                const custTrim =
                    resolvedCustomerName != null ? String(resolvedCustomerName).trim() : '';
                if (quotingProvided && quotingOrNotColumnAvailable) {
                    await sql.query`
                        UPDATE EnquiryPricingValues 
                        SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                            EnquiryForID = ${enquiryForId || null},
                            EnquiryForItem = ${resolvedItemName},
                            LeadJobName = ${resolvedLeadJobName},
                            CustomerName = ${resolvedCustomerName},
                            PriceOption = ${priceOption || null},
                            Quotingornot = ${quotingValue}
                        WHERE RequestNo = ${requestNo} 
                        AND OptionID = ${optionId} 
                        AND EnquiryForItem = ${resolvedItemName}
                        AND LTRIM(RTRIM(ISNULL(CustomerName, N''))) = ${custTrim}
                    `;
                } else {
                    await sql.query`
                        UPDATE EnquiryPricingValues 
                        SET Price = ${priceValue}, UpdatedBy = ${updatedBy}, UpdatedAt = ${now},
                            EnquiryForID = ${enquiryForId || null},
                            EnquiryForItem = ${resolvedItemName},
                            LeadJobName = ${resolvedLeadJobName},
                            CustomerName = ${resolvedCustomerName},
                            PriceOption = ${priceOption || null}
                        WHERE RequestNo = ${requestNo} 
                        AND OptionID = ${optionId} 
                        AND EnquiryForItem = ${resolvedItemName}
                        AND LTRIM(RTRIM(ISNULL(CustomerName, N''))) = ${custTrim}
                    `;
                }
            }

            if (debugForEnquiry) {
                logToFile(
                    `PUT /api/pricing/value UPDATE: ` +
                    `rows=${existingResult.recordset.length} price=${priceValue} resolvedItem=${resolvedItemName} resolvedCustomer=${resolvedCustomerName} resolvedLead=${resolvedLeadJobName} priceOption=${priceOption}`
                );
            }
        } else {
            // Insert
            if (quotingOrNotColumnAvailable) {
                await sql.query`
                    INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName, UpdatedAt, PriceOption, Quotingornot)
                    VALUES (${requestNo}, ${optionId}, ${resolvedItemName}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${resolvedCustomerName}, ${resolvedLeadJobName}, ${now}, ${priceOption || null}, ${quotingValue})
                `;
            } else {
                await sql.query`
                    INSERT INTO EnquiryPricingValues (RequestNo, OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, CustomerName, LeadJobName, UpdatedAt, PriceOption)
                    VALUES (${requestNo}, ${optionId}, ${resolvedItemName}, ${enquiryForId || null}, ${priceValue}, ${updatedBy}, ${resolvedCustomerName}, ${resolvedLeadJobName}, ${now}, ${priceOption || null})
                `;
            }

            if (debugForEnquiry) {
                logToFile(
                    `PUT /api/pricing/value INSERT: ` +
                    `optionId=${optionId} enquiryForId=${enquiryForId || null} price=${priceValue} resolvedCustomer=${resolvedCustomerName} resolvedLead=${resolvedLeadJobName} priceOption=${priceOption}`
                );
            }
        }

        await notifyParentJobPricingUpdate({
            requestNo,
            enquiryForId: enquiryForId || null,
            ownJobName: resolvedItemName || enquiryForItem || '',
            updatedBy: updatedBy || '',
            priceValue,
            priceOption: priceOption || 'Base Price',
        });
        res.json({ success: true });

    } catch (err) {
        console.error('Error updating value:', err);
        res.status(500).json({ error: 'Failed to update value' });
    }
});

/**
 * DELETE /api/pricing/value/base-price
 * Delete Base Price(s) for a single grid cell.
 *
 * Used to allow deleting a priced job from Enquiry structure (user must delete prices first).
 * We delete by stable business keys. OptionID may have duplicates; we delete all Base Price rows for this cell.
 */
router.delete('/value/base-price', async (req, res) => {
    try {
        const { requestNo, enquiryForId, customerName } = req.body || {};
        if (!requestNo || enquiryForId == null || enquiryForId === '') {
            return res.status(400).json({ error: 'Missing requestNo or enquiryForId' });
        }
        const cust = customerName != null ? String(customerName).trim() : '';
        await sql.query`
            DELETE FROM EnquiryPricingValues
            WHERE RequestNo = ${requestNo}
              AND EnquiryForID = ${enquiryForId}
              AND LTRIM(RTRIM(ISNULL(PriceOption, N''))) = N'Base Price'
              AND (
                    ${cust} = N'' OR
                    LTRIM(RTRIM(ISNULL(CustomerName, N''))) = ${cust} OR
                    LTRIM(RTRIM(ISNULL(CustomerName, N''))) = N''
                  )
        `;
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting base price:', err);
        res.status(500).json({ error: 'Failed to delete base price' });
    }
});

// DELETE /api/pricing/option/:id - Delete an option row
router.delete('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Pricing API: Deleting option ID ${id}`);

        // Verification Step: Check if it exists
        const checkResult = await sql.query`SELECT ID FROM EnquiryPricingOptions WHERE ID = ${id}`;
        if (checkResult.recordset.length === 0) {
            console.warn(`Pricing API: Option ID ${id} NOT FOUND in database!`);
            return res.json({ success: true, warning: 'Already gone' });
        }

        // Delete associated values first
        await sql.query`DELETE FROM EnquiryPricingValues WHERE OptionID = ${id}`;

        // Delete the option
        await sql.query`DELETE FROM EnquiryPricingOptions WHERE ID = ${id}`;
        console.log(`Pricing API: Option ID ${id} deleted successfully`);

        res.json({ success: true });

    } catch (err) {
        console.error(`Pricing API ERROR deleting option ${req.params.id}:`, err);
        res.status(500).json({ error: 'Failed to delete option' });
    }
});

// PUT /api/pricing/option/:id - Rename an option
router.put('/option/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { optionName } = req.body;

        await sql.query`
            UPDATE EnquiryPricingOptions 
            SET OptionName = ${optionName}
            WHERE ID = ${id}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error renaming option:', err);
        res.status(500).json({ error: 'Failed to rename option' });
    }
});

// DELETE /api/pricing/customer - Delete all pricing data for a specific customer
router.delete('/customer', async (req, res) => {
    try {
        const { requestNo, customerName } = req.body;

        if (!requestNo || !customerName) {
            return res.status(400).json({ error: 'RequestNo and CustomerName are required' });
        }

        console.log(`Pricing API: Deleting customer ${customerName} for enquiry ${requestNo}`);

        // 1. Delete associated values
        await sql.query`
            DELETE FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 2. Delete options
        await sql.query`
            DELETE FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        // 3. Remove from EnquiryCustomer (extra customers)
        await sql.query`
            DELETE FROM EnquiryCustomer 
            WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
        `;

        res.json({ success: true });

    } catch (err) {
        console.error('Error deleting customer pricing:', err);
        res.status(500).json({ error: 'Failed to delete customer pricing' });
    }
});


module.exports = router;

'use strict';

const { resolvePricingAccessContext, normalizePricingJobName } = require('./quotePricingAccess');
const {
    buildEnquiryMasterDepartmentExistsSql,
    buildMefDepartmentNameEqualsSql,
    buildStrictPvOwnJobDivisionSql,
} = require('./quoteListDivisionFilter');
const { buildMultiDeptItemNameLikeSql } = require('./userDepartments');
const { ensurePricingRevisionRequiredColumn } = require('./pricingRevisionRequired');

/**
 * Strip trailing " (L12)" / " (l1)" from customer / ToName so grid labels still match saved quotes.
 */
function sqlTupleCustomerKey(alias, col) {
    const trimmed = `LTRIM(RTRIM(ISNULL(${alias}.${col}, N'')))`;
    const stripped = `(CASE
        WHEN PATINDEX(N'% (L[0-9]%', ${trimmed}) > 0 AND RIGHT(RTRIM(${trimmed}), 1) = N')'
        THEN RTRIM(LEFT(${trimmed}, (LEN(${trimmed}) - CHARINDEX(N'(', REVERSE(${trimmed})) + 1) - 2))
        ELSE ${trimmed}
    END)`;
    return `LOWER(LTRIM(RTRIM(${stripped})))`;
}

/**
 * Step 2 tuple: EnquiryQuotes.OwnJob vs PV.EnquiryForItem.
 * Saved quotes often persist Master_ConcernedSE.Department (short label) while pricing uses full EnquiryFor line text.
 */
function sqlTupleOwnJobMatch(eqAlias, pvAlias = 'PV') {
    const eqO = `LOWER(LTRIM(RTRIM(ISNULL(${eqAlias}.OwnJob, N''))))`;
    const pvO = `LOWER(LTRIM(RTRIM(ISNULL(${pvAlias}.EnquiryForItem, N''))))`;
    return `(
        ${eqO} = ${pvO}
        OR (${pvO} LIKE ${eqO} + N'-%' OR ${pvO} LIKE ${eqO} + N' %')
        OR (${eqO} LIKE ${pvO} + N'-%' OR ${eqO} LIKE ${pvO} + N' %')
        OR (LEN(${eqO}) >= 3 AND LEN(${eqO}) <= 80 AND ${pvO} LIKE N'%' + ${eqO} + N'%')
    )`;
}

/**
 * Step 2 tuple: EnquiryQuotes.LeadJob vs PV.LeadJobName.
 * Quotes persist root **LeadJobName** / display name (QuoteForm); bare L-codes are legacy rows only.
 * EnquiryPricingValues.LeadJobName is usually the full grid label (`L1 - HVAC Project`, `BMS Project (L2)`).
 * Exact equality missed completed quotes and left rows stuck on the pending list.
 */
function sqlTupleLeadJobMatch(eqAlias, pvAlias = 'PV') {
    const eqL = `LOWER(LTRIM(RTRIM(ISNULL(${eqAlias}.LeadJob, N''))))`;
    const pvL = `LOWER(LTRIM(RTRIM(ISNULL(${pvAlias}.LeadJobName, N''))))`;
    return `(
        ${eqL} = ${pvL}
        OR (${pvL} LIKE ${eqL} + N'-%' OR ${pvL} LIKE ${eqL} + N' %')
        OR (${eqL} LIKE ${pvL} + N'-%' OR ${eqL} LIKE ${pvL} + N' %')
        OR (
            LEN(${eqL}) >= 2 AND LEN(${eqL}) <= 14
            AND ${eqL} LIKE N'l[0-9]%'
            AND CHARINDEX(${eqL} + N')', ${pvL}) > 0
        )
    )`;
}

/** Step 2 tuple: EnquiryQuotes.ToName = PV.CustomerName (trim + optional (L#) strip + lower). */
function sqlTupleCustomerMatch(eqAlias, pvAlias = 'PV') {
    return `${sqlTupleCustomerKey(eqAlias, 'ToName')} = ${sqlTupleCustomerKey(pvAlias, 'CustomerName')}`;
}

/**
 * Raw pending-quote enquiries (priced tuples still missing a completed quote), with optional extra WHERE on EnquiryMaster E.
 *
 * Pending quote summary logic:
 * - Step 1: EnquiryPricingValues for the enquiry has Price > 0 on a row keyed by
 *   RequestNo + EnquiryForItem (own job) + LeadJobName + CustomerName (latest row per tuple).
 * - Step 2: No EnquiryQuotes row yet for the same RequestNo + OwnJob + LeadJob + ToName (any revision / draft counts
 *   as “quote created” per business rule), OR own-job RevisionRequired = Yes (stays pending until next quote
 *   clears the flag). LeadJob / OwnJob use tolerant matching vs pricing labels (see sqlTuple*Match).
 */
/** Optional list columns — omitted in slim mode; mapQuoteListingRows loads quotes/prices in bulk instead. */
function buildPendingListHeavySelectColumns(quoteMatchesPvTupleSql, slim) {
    if (slim) {
        return `
                    CAST(NULL AS NVARCHAR(MAX)) AS ListQuoteRef,
                    CAST(NULL AS DATETIME) AS ListQuoteDate,
                    CAST(N'' AS NVARCHAR(255)) AS ListPreparedBy,
                    CAST(N'' AS NVARCHAR(255)) AS ListQuoteOwnJob,
                    CAST(0 AS DECIMAL(18,2)) AS ListQuoteTotalAmount,
                    CAST(NULL AS NVARCHAR(MAX)) AS QuotedCustomers,
                    CAST(NULL AS NVARCHAR(MAX)) AS PricingCustomerDetails,`;
    }
    return `
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtRef.QuoteNumber, N'')))
                        FROM EnquiryQuotes qtRef
                        WHERE qtRef.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtRef')}
                        ORDER BY qtRef.QuoteNo DESC, qtRef.RevisionNo DESC
                    ) AS ListQuoteRef,
                    (
                        SELECT TOP 1 qtDt.QuoteDate
                        FROM EnquiryQuotes qtDt
                        WHERE qtDt.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtDt')}
                        ORDER BY qtDt.QuoteNo DESC, qtDt.RevisionNo DESC
                    ) AS ListQuoteDate,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtPb.PreparedBy, N'')))
                        FROM EnquiryQuotes qtPb
                        WHERE qtPb.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtPb')}
                        ORDER BY qtPb.QuoteNo DESC, qtPb.RevisionNo DESC
                    ) AS ListPreparedBy,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtOj.OwnJob, N'')))
                        FROM EnquiryQuotes qtOj
                        WHERE qtOj.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtOj')}
                        ORDER BY qtOj.QuoteNo DESC, qtOj.RevisionNo DESC
                    ) AS ListQuoteOwnJob,
                    (
                        SELECT TOP 1 ISNULL(qtTa.TotalAmount, 0)
                        FROM EnquiryQuotes qtTa
                        WHERE qtTa.RequestNo = E.RequestNo
                          AND ${quoteMatchesPvTupleSql('qtTa')}
                        ORDER BY qtTa.QuoteNo DESC, qtTa.RevisionNo DESC
                    ) AS ListQuoteTotalAmount,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ';;' + qt.ToName + '|' + FORMAT(ISNULL(qt.TotalAmount, 0), 'N2')
                            FROM EnquiryQuotes qt
                            WHERE qt.RequestNo = E.RequestNo
                            AND ISNULL(qt.TotalAmount, 0) > 0
                            AND qt.RevisionNo = (
                                SELECT MAX(rx.RevisionNo)
                                FROM EnquiryQuotes rx
                                WHERE rx.QuoteNo = qt.QuoteNo
                            )
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) AS QuotedCustomers,
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT
                                    po2.CustomerName,
                                    pv2.Price AS LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem)
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) AS rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) AS PricingCustomerDetails,`;
}

async function runPendingQuoteListQuery(sqlConn, rawUserEmail, extraWhereSql = '', divisionFilter = '', options = {}) {
        const slim = options.slim !== false;
        await ensurePricingRevisionRequiredColumn();
        const divisionClause = buildEnquiryMasterDepartmentExistsSql(divisionFilter);
        const divisionMefDeptSql = buildMefDepartmentNameEqualsSql(divisionFilter, 'MEF');
        const divisionMef2DeptSql = buildMefDepartmentNameEqualsSql(divisionFilter, 'MEF2');
        const strictPvOwnJobDivisionSql = buildStrictPvOwnJobDivisionSql(divisionFilter);
        let userEmail = rawUserEmail;
        if (userEmail) {
            userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        }
        console.log(`[API] Pending quote list query for ${userEmail || 'All'}...`);

        const accessCtx = userEmail ? await resolvePricingAccessContext(userEmail) : null;
        if (userEmail && (!accessCtx || !accessCtx.user)) {
            return { enquiries: [], accessCtx: accessCtx || null, userEmail };
        }

        const isAdmin = !!(accessCtx && accessCtx.isAdmin);
        const userDepartment = accessCtx ? accessCtx.userDepartment : '';
        const isCcUser = !!(accessCtx && accessCtx.isCcUser);
        const isManagementDept = !!(accessCtx && accessCtx.isManagementDept);

        const uEsc = (userEmail || '').replace(/'/g, "''");
        const uLocalEsc = ((userEmail || '').split('@')[0] || '').trim().replace(/'/g, "''");
        // Department scope: normal users use their Master_ConcernedSE.Department (CSV → OR of tokens).
        // Management users are division proxies, so DO NOT scope by Department="Management" (it would hide all real divisions).
        let trimmedDept = (userDepartment || '').trim();
        let hasDeptScope = trimmedDept.length > 0;
        if (isManagementDept) {
            trimmedDept = '';
            hasDeptScope = false;
        }
        // CRITICAL: when a Division filter is selected in the UI, pending list scoping must follow ONLY that division,
        // not fuzzy matches to the user's own Department. Disable department-based LIKE matching in this case.
        if (divisionFilter && divisionFilter.toString().trim()) {
            trimmedDept = '';
            hasDeptScope = false;
        }
        const deptLikeMefEf = hasDeptScope
            ? buildMultiDeptItemNameLikeSql(trimmedDept, 'MEF.ItemName', 'EF.ItemName', normalizePricingJobName)
            : '';
        const deptLikeMef2Ef2 = hasDeptScope
            ? buildMultiDeptItemNameLikeSql(trimmedDept, 'MEF2.ItemName', 'EF2.ItemName', normalizePricingJobName)
            : '';
        /** CC + Division toolbar: same MEF/job row predicates as non-CC (division-only); enquiry gate still requires CC or ConcernedSE (below). */
        const unifyCcWithDivision =
            isCcUser && !isManagementDept && (divisionFilter || '').toString().trim();
        /** CC: must be on CCMailIds AND (when we have a department) see only that department’s jobs/subjobs — same shape as non-CC scope. */
        let mefAccessPredicate = isCcUser
            ? `(
                ${
                    // Management users are division proxies: they may not be listed in CCMailIds.
                    // When a Division is selected, allow access based on the division filter alone.
                    isManagementDept
                        ? '1 = 1'
                        : `(
                    REPLACE(',' + REPLACE(ISNULL(MEF.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uEsc},%'
                    ${uLocalEsc.length >= 2 ? `OR REPLACE(',' + REPLACE(ISNULL(MEF.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uLocalEsc},%'` : ''}
                )`
                }
                ${
                    hasDeptScope
                        ? `AND (
                    ${deptLikeMefEf}
                )`
                        : ''
                }
            )`
            : hasDeptScope
                ? `(
                    ${deptLikeMefEf}
                )`
                : `1 = 1`;

        let scopedJobIdsSubquery = isCcUser
            ? `(
                ${
                    isManagementDept
                        ? '1 = 1'
                        : `(
                    REPLACE(',' + REPLACE(ISNULL(MEF2.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uEsc},%'
                    ${uLocalEsc.length >= 2 ? `OR REPLACE(',' + REPLACE(ISNULL(MEF2.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uLocalEsc},%'` : ''}
                )`
                }
                ${
                    hasDeptScope
                        ? `AND (
                    ${deptLikeMef2Ef2}
                )`
                        : ''
                }
                ${divisionMef2DeptSql}
            )`
            : hasDeptScope
                ? `(
                    ${deptLikeMef2Ef2}
                )${divisionMef2DeptSql}`
                : `1 = 1${divisionMef2DeptSql}`;

        if (unifyCcWithDivision) {
            mefAccessPredicate = '1 = 1';
            scopedJobIdsSubquery = `1 = 1${divisionMef2DeptSql}`;
        }

        // Step 1 + 2: see module doc above; RequestNo is enforced by JOIN (E.RequestNo = PV via PO).
        const pvMatchesEfJobSql = `
            (
                (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = EF.ID)
                OR (
                    (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
                    AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(EF.ItemName, N'')))
                )
            )`;
        const latestPvTupleOnlySql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryPricingValues PVN
                WHERE PVN.RequestNo = PV.RequestNo
                  AND LTRIM(RTRIM(ISNULL(PVN.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.LeadJobName, N''))) = LTRIM(RTRIM(ISNULL(PV.LeadJobName, N'')))
                  AND LTRIM(RTRIM(ISNULL(PVN.CustomerName, N''))) = LTRIM(RTRIM(ISNULL(PV.CustomerName, N'')))
                  AND (
                        ISNULL(PVN.UpdatedAt, '19000101') > ISNULL(PV.UpdatedAt, '19000101')
                        OR (
                            ISNULL(PVN.UpdatedAt, '19000101') = ISNULL(PV.UpdatedAt, '19000101')
                            AND ISNULL(PVN.ID, 0) > ISNULL(PV.ID, 0)
                        )
                  )
            )`;
        // Pending: no quote for tuple yet, OR own-job RevisionRequired=Yes (until next quote clears the flag).
        const noCompletedQuoteForSameTupleSql = `
            NOT EXISTS (
                SELECT 1
                FROM EnquiryQuotes EQ
                WHERE EQ.RequestNo = E.RequestNo
                AND ${sqlTupleOwnJobMatch('EQ', 'PV')}
                AND ${sqlTupleLeadJobMatch('EQ', 'PV')}
                AND ${sqlTupleCustomerMatch('EQ', 'PV')}
            )`;
        const pvRevisionRequiredYesSql = `
            UPPER(LTRIM(RTRIM(ISNULL(PV.RevisionRequired, N'')))) = N'YES'`;
        const pendingTupleOrRevisionSql = `(
            ${noCompletedQuoteForSameTupleSql}
            OR ${pvRevisionRequiredYesSql}
        )`;

        // List columns: same four-key match as Step 2 so Quote ref / date align with the pending PV row.
        const quoteMatchesPvTupleSql = (alias) => `
            ${sqlTupleOwnJobMatch(alias, 'PV')}
            AND ${sqlTupleLeadJobMatch(alias, 'PV')}
            AND ${sqlTupleCustomerMatch(alias, 'PV')}`;
        const heavySelectCols = buildPendingListHeavySelectColumns(quoteMatchesPvTupleSql, slim);

        let query;
        if (userEmail && !isAdmin) {
            const enforceAssignedOnly = !isCcUser;
            // Match ConcernedSE by login email via Master_ConcernedSE (FullName-only match fails when FullName is NULL or mismatched).
            const concernedSeEmailExistsSql = `
                EXISTS (
                    SELECT 1
                    FROM ConcernedSE cs
                    INNER JOIN Master_ConcernedSE m ON UPPER(LTRIM(RTRIM(ISNULL(m.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(cs.SEName, N''))))
                    WHERE LTRIM(RTRIM(ISNULL(cs.RequestNo, N''))) = LTRIM(RTRIM(ISNULL(E.RequestNo, N'')))
                      AND LOWER(LTRIM(RTRIM(m.EmailId))) = LOWER(LTRIM(N'${uEsc}'))
                )
            `;
            const ccCoordinatorEnquiryExistsSql = `
                EXISTS (
                    SELECT 1
                    FROM EnquiryFor efGate
                    INNER JOIN Master_EnquiryFor mefGate ON (
                        efGate.ItemName = mefGate.ItemName OR
                        efGate.ItemName LIKE N'% - ' + mefGate.ItemName
                    )
                    WHERE efGate.RequestNo = E.RequestNo
                      AND (
                        REPLACE(',' + REPLACE(ISNULL(mefGate.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uEsc},%'
                        ${uLocalEsc.length >= 2 ? `OR REPLACE(',' + REPLACE(ISNULL(mefGate.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com') LIKE '%,${uLocalEsc},%'` : ''}
                      )
                )
            `;
            const assignedOnlyClause = unifyCcWithDivision
                ? `
                AND (
                    ${concernedSeEmailExistsSql}
                    OR ${ccCoordinatorEnquiryExistsSql}
                )
                `
                : enforceAssignedOnly
                  ? `
                AND ${concernedSeEmailExistsSql}
                `
                  : '';
            // Refined logic for specific user's division
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
                    LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
                    LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
                    ISNULL(PV.ID, 0) AS ListPendingPvId,
                    LTRIM(RTRIM(ISNULL(PV.RevisionRequired, N''))) AS ListPendingRevisionRequired,
                    ${heavySelectCols}
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(EF2.ID AS VARCHAR)
                            FROM EnquiryFor EF2
                            JOIN Master_EnquiryFor MEF2 ON (
                                EF2.ItemName = MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.ItemName OR 
                                EF2.ItemName LIKE '%- ' + MEF2.DivisionCode OR
                                MEF2.ItemName LIKE '%' + EF2.ItemName + '%'
                            )
                            WHERE EF2.RequestNo = E.RequestNo
                            AND (${scopedJobIdsSubquery})
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor MEF
                    WHERE (
                        EF.ItemName = MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.DivisionCode OR
                        MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
                    )
                    AND (${mefAccessPredicate})
                    ${divisionMefDeptSql}
                )
                ${assignedOnlyClause}
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                ${strictPvOwnJobDivisionSql}
                AND ${latestPvTupleOnlySql}
                AND ${pendingTupleOrRevisionSql}
                ${divisionClause}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        } else {
            // Admin or Fallback (Show all with prices but no quotes)
            query = `
                SELECT DISTINCT 
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) AS ListPendingOwnJobItem,
                    LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) AS ListPendingLeadJobName,
                    LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) AS ListPendingCustomerName,
                    ISNULL(PV.ID, 0) AS ListPendingPvId,
                    LTRIM(RTRIM(ISNULL(PV.RevisionRequired, N''))) AS ListPendingRevisionRequired,
                    ${heavySelectCols}
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName 
                            FROM EnquiryFor 
                            WHERE RequestNo = E.RequestNo 
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions,
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(ID AS VARCHAR)
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo AND (ParentID IS NULL OR ParentID = '0' OR ParentID = 0)
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs
                FROM EnquiryMaster E
                JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
                JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                WHERE PV.Price > 0
                AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.LeadJobName, N''))) <> N''
                AND LTRIM(RTRIM(ISNULL(PV.CustomerName, N''))) <> N''
                AND EXISTS (
                    SELECT 1
                    FROM Master_EnquiryFor MEF
                    WHERE (
                        EF.ItemName = MEF.ItemName OR
                        EF.ItemName LIKE N'%- ' + MEF.ItemName OR
                        MEF.ItemName LIKE N'%' + EF.ItemName + N'%'
                    )
                    ${divisionMefDeptSql}
                )
                AND (
                    EF.ItemName = PO.ItemName OR 
                    EF.ItemName LIKE PO.ItemName + '%' OR 
                    PO.ItemName LIKE EF.ItemName + '%'
                )
                AND ${pvMatchesEfJobSql}
                ${strictPvOwnJobDivisionSql}
                AND ${latestPvTupleOnlySql}
                AND ${pendingTupleOrRevisionSql}
                ${divisionClause}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
        }
    const result = await sqlConn.query(query);
    return { enquiries: result.recordset || [], accessCtx, userEmail };
}

module.exports = runPendingQuoteListQuery;

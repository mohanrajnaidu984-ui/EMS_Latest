'use strict';

/**
 * Quoted-list SQL exposes `ListQuoteOwnJob` from the enquiry's MAX(QuoteNo) quote revision — not per-viewer.
 * Non-admin quote search / rollups should scope by department or pending tuple in `mapQuoteListingRows.js`.
 */
const { resolvePricingAccessContext, normalizePricingJobName } = require('./quotePricingAccess');
const { buildEnquiryMasterDepartmentExistsSql, buildMefDepartmentNameEqualsSql } = require('./quoteListDivisionFilter');

const quotedCustomersSub = `
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
                    ) as QuotedCustomers`;

const divisionsSub = `
                    (
                        SELECT STUFF((
                            SELECT ', ' + ItemName
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo
                            FOR XML PATH('')
                        ), 1, 2, '')
                    ) as Divisions`;

const pricingDetailsSub = `
                    (
                        SELECT STUFF((
                            SELECT ';;' + CustomerName + '|' + CAST(SUM(LatestPrice) AS VARCHAR)
                            FROM (
                                SELECT
                                    po2.CustomerName,
                                    pv2.Price as LatestPrice,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY po2.CustomerName, ISNULL(CAST(pv2.EnquiryForID AS VARCHAR), pv2.EnquiryForItem)
                                        ORDER BY pv2.UpdatedAt DESC
                                    ) as rn
                                FROM EnquiryPricingOptions po2
                                JOIN EnquiryPricingValues pv2 ON po2.ID = pv2.OptionID
                                WHERE po2.RequestNo = E.RequestNo
                            ) t
                            WHERE rn = 1
                            GROUP BY CustomerName
                            HAVING SUM(LatestPrice) > 0
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
                    ) as PricingCustomerDetails`;

const existsLatestPositiveQuoteSql = `
            EXISTS (
                SELECT 1
                FROM EnquiryQuotes qt
                WHERE qt.RequestNo = E.RequestNo
                  AND qt.RevisionNo = (SELECT MAX(rx.RevisionNo) FROM EnquiryQuotes rx WHERE rx.QuoteNo = qt.QuoteNo)
                  AND ISNULL(qt.TotalAmount, 0) > 0
            )`;

/**
 * Enquiries the user can see that already have a completed quote line (latest revision TotalAmount > 0).
 */
async function runQuotedQuoteListQuery(sqlConn, rawUserEmail, extraWhereSql = '', divisionFilter = '', options = {}) {
    const requirePositiveAmount = options.requirePositiveAmount !== false;
    const existsQuoteSql = requirePositiveAmount
        ? existsLatestPositiveQuoteSql
        : `EXISTS (SELECT 1 FROM EnquiryQuotes qt WHERE qt.RequestNo = E.RequestNo)`;
    const divisionClause = buildEnquiryMasterDepartmentExistsSql(divisionFilter);
    const divisionMefDeptSql = buildMefDepartmentNameEqualsSql(divisionFilter, 'MEF');
    const divisionMef2DeptSql = buildMefDepartmentNameEqualsSql(divisionFilter, 'MEF2');
    let userEmail = rawUserEmail;
    if (userEmail) {
        userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
    }
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
    let trimmedDept = (userDepartment || '').trim();
    let deptEsc = trimmedDept.replace(/'/g, "''");
    let deptNormEsc = (normalizePricingJobName(trimmedDept) || '').replace(/'/g, "''");
    let hasDeptScope = deptEsc.length > 0 || deptNormEsc.length > 0;
    if (isManagementDept) {
        trimmedDept = '';
        deptEsc = '';
        deptNormEsc = '';
        hasDeptScope = false;
    }
    // Division dropdown owns own-job scope for quote search; do not also constrain by profile Department.
    if (divisionFilter && divisionFilter.toString().trim()) {
        trimmedDept = '';
        deptEsc = '';
        deptNormEsc = '';
        hasDeptScope = false;
    }
    const unifyCcWithDivision =
        isCcUser && !isManagementDept && (divisionFilter || '').toString().trim();
    let mefAccessPredicate = isCcUser
        ? `(
                ${
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
                    LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                        : ''
                }
            )`
        : hasDeptScope
            ? `(
                    LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
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
                    LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )`
                        : ''
                }
                ${divisionMef2DeptSql}
            )`
        : hasDeptScope
            ? `(
                    LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + LOWER(LTRIM(RTRIM('${deptEsc}'))) + '%'
                    OR (${deptNormEsc ? `LOWER(LTRIM(RTRIM(MEF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'
                    OR LOWER(LTRIM(RTRIM(EF2.ItemName))) LIKE '%' + N'${deptNormEsc}' + '%'` : '1=0'})
                )${divisionMef2DeptSql}`
            : `1 = 1${divisionMef2DeptSql}`;

    if (unifyCcWithDivision) {
        mefAccessPredicate = '1 = 1';
        scopedJobIdsSubquery = `1 = 1${divisionMef2DeptSql}`;
    }

    const scopedJobIdsSelect = `
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
                    ) as ScopedJobIDs`;

    const scopedJobIdsAdmin = `
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(ID AS VARCHAR)
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo AND (ParentID IS NULL OR ParentID = '0' OR ParentID = 0)
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs`;

    let query;
    if (userEmail && !isAdmin) {
        const enforceAssignedOnly = !isCcUser;
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
        query = `
                SELECT DISTINCT
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtRef.QuoteNumber, N'')))
                        FROM EnquiryQuotes qtRef
                        WHERE qtRef.RequestNo = E.RequestNo
                          AND qtRef.QuoteNo = (SELECT MAX(qtMx.QuoteNo) FROM EnquiryQuotes qtMx WHERE qtMx.RequestNo = E.RequestNo)
                        ORDER BY qtRef.RevisionNo DESC
                    ) as ListQuoteRef,
                    (
                        SELECT TOP 1 qtDt.QuoteDate
                        FROM EnquiryQuotes qtDt
                        WHERE qtDt.RequestNo = E.RequestNo
                          AND qtDt.QuoteNo = (SELECT MAX(qtMx2.QuoteNo) FROM EnquiryQuotes qtMx2 WHERE qtMx2.RequestNo = E.RequestNo)
                        ORDER BY qtDt.RevisionNo DESC
                    ) as ListQuoteDate,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtPb.PreparedBy, N'')))
                        FROM EnquiryQuotes qtPb
                        WHERE qtPb.RequestNo = E.RequestNo
                          AND qtPb.QuoteNo = (SELECT MAX(qtMx3.QuoteNo) FROM EnquiryQuotes qtMx3 WHERE qtMx3.RequestNo = E.RequestNo)
                        ORDER BY qtPb.RevisionNo DESC
                    ) as ListPreparedBy,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtOj.OwnJob, N'')))
                        FROM EnquiryQuotes qtOj
                        WHERE qtOj.RequestNo = E.RequestNo
                          AND qtOj.QuoteNo = (SELECT MAX(qtMx4.QuoteNo) FROM EnquiryQuotes qtMx4 WHERE qtMx4.RequestNo = E.RequestNo)
                        ORDER BY qtOj.RevisionNo DESC
                    ) as ListQuoteOwnJob,
                    (
                        SELECT TOP 1 ISNULL(qtTa.TotalAmount, 0)
                        FROM EnquiryQuotes qtTa
                        WHERE qtTa.RequestNo = E.RequestNo
                          AND qtTa.QuoteNo = (SELECT MAX(qtMx5.QuoteNo) FROM EnquiryQuotes qtMx5 WHERE qtMx5.RequestNo = E.RequestNo)
                        ORDER BY qtTa.RevisionNo DESC
                    ) as ListQuoteTotalAmount,
                    ${quotedCustomersSub},
                    ${divisionsSub},
                    ${pricingDetailsSub},
                    ${scopedJobIdsSelect}
                FROM EnquiryMaster E
                JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo
                JOIN Master_EnquiryFor MEF ON (
                    EF.ItemName = MEF.ItemName OR
                    EF.ItemName LIKE '%- ' + MEF.ItemName OR
                    EF.ItemName LIKE '%- ' + MEF.DivisionCode OR
                    MEF.ItemName LIKE '%' + EF.ItemName + '%'
                )
                WHERE (${mefAccessPredicate})${divisionMefDeptSql}
                ${assignedOnlyClause}
                AND ${existsQuoteSql}
                ${divisionClause}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
    } else {
        query = `
                SELECT DISTINCT
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtRef.QuoteNumber, N'')))
                        FROM EnquiryQuotes qtRef
                        WHERE qtRef.RequestNo = E.RequestNo
                          AND qtRef.QuoteNo = (SELECT MAX(qtMx.QuoteNo) FROM EnquiryQuotes qtMx WHERE qtMx.RequestNo = E.RequestNo)
                        ORDER BY qtRef.RevisionNo DESC
                    ) as ListQuoteRef,
                    (
                        SELECT TOP 1 qtDt.QuoteDate
                        FROM EnquiryQuotes qtDt
                        WHERE qtDt.RequestNo = E.RequestNo
                          AND qtDt.QuoteNo = (SELECT MAX(qtMx2.QuoteNo) FROM EnquiryQuotes qtMx2 WHERE qtMx2.RequestNo = E.RequestNo)
                        ORDER BY qtDt.RevisionNo DESC
                    ) as ListQuoteDate,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtPb.PreparedBy, N'')))
                        FROM EnquiryQuotes qtPb
                        WHERE qtPb.RequestNo = E.RequestNo
                          AND qtPb.QuoteNo = (SELECT MAX(qtMx3.QuoteNo) FROM EnquiryQuotes qtMx3 WHERE qtMx3.RequestNo = E.RequestNo)
                        ORDER BY qtPb.RevisionNo DESC
                    ) as ListPreparedBy,
                    (
                        SELECT TOP 1 LTRIM(RTRIM(ISNULL(qtOj.OwnJob, N'')))
                        FROM EnquiryQuotes qtOj
                        WHERE qtOj.RequestNo = E.RequestNo
                          AND qtOj.QuoteNo = (SELECT MAX(qtMx4.QuoteNo) FROM EnquiryQuotes qtMx4 WHERE qtMx4.RequestNo = E.RequestNo)
                        ORDER BY qtOj.RevisionNo DESC
                    ) as ListQuoteOwnJob,
                    (
                        SELECT TOP 1 ISNULL(qtTa.TotalAmount, 0)
                        FROM EnquiryQuotes qtTa
                        WHERE qtTa.RequestNo = E.RequestNo
                          AND qtTa.QuoteNo = (SELECT MAX(qtMx5.QuoteNo) FROM EnquiryQuotes qtMx5 WHERE qtMx5.RequestNo = E.RequestNo)
                        ORDER BY qtTa.RevisionNo DESC
                    ) as ListQuoteTotalAmount,
                    ${quotedCustomersSub},
                    ${divisionsSub},
                    ${pricingDetailsSub},
                    ${scopedJobIdsAdmin}
                FROM EnquiryMaster E
                WHERE ${existsQuoteSql}
                ${divisionClause}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;
    }

    const result = await sqlConn.query(query);
    return { enquiries: result.recordset || [], accessCtx, userEmail };
}

module.exports = runQuotedQuoteListQuery;

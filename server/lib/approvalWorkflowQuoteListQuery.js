'use strict';

const { resolvePricingAccessContext } = require('./quotePricingAccess');

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

const scopedJobIdsAdmin = `
                    (
                        SELECT STUFF((
                            SELECT DISTINCT ',' + CAST(ID AS VARCHAR)
                            FROM EnquiryFor
                            WHERE RequestNo = E.RequestNo AND (ParentID IS NULL OR ParentID = '0' OR ParentID = 0)
                            FOR XML PATH(''), TYPE
                        ).value('.', 'NVARCHAR(MAX)'), 1, 1, '')
                    ) as ScopedJobIDs`;

/** Match approver email against CCMailIds CSV (normalized domains). */
function normalizeApproverEmailSql(columnExpr) {
    return `LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(${columnExpr}, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com'))))`;
}

function approverLocalPartSql(columnExpr) {
    const email = normalizeApproverEmailSql(columnExpr);
    return `LOWER(LTRIM(RTRIM(REPLACE(SUBSTRING(${email}, 1, NULLIF(CHARINDEX('@', ${email}), 0) - 1), N' ', N''))))`;
}

function buildDirectApproverMatchSql(columnExpr, uEsc, uLocalEsc) {
    const email = normalizeApproverEmailSql(columnExpr);
    let sql = `${email} = LOWER(LTRIM(N'${uEsc}'))`;
    if (uLocalEsc.length >= 2) {
        sql += ` OR ${approverLocalPartSql(columnExpr)} = LOWER(LTRIM(N'${uLocalEsc}'))`;
    }
    return sql;
}

function buildCcMailIdsContainsApproverSql(mefAlias, apAlias) {
    const ccCsv = `REPLACE(',' + REPLACE(ISNULL(${mefAlias}.CCMailIds, ''), ' ', '') + ',', '@almcg.com', '@almoayyedcg.com')`;
    const apEmail = normalizeApproverEmailSql(`${apAlias}.ApproverEmail`);
    const apLocal = approverLocalPartSql(`${apAlias}.ApproverEmail`);
    return `(
        ${ccCsv} LIKE '%,' + ${apEmail} + ',%'
        OR (${apLocal} <> N'' AND ${ccCsv} LIKE '%,' + ${apLocal} + ',%')
    )`;
}

function buildApprovalWorkflowQuoteAccessSql(uEsc, uLocalEsc) {
    const directApproverMatch = buildDirectApproverMatchSql('apAw.ApproverEmail', uEsc, uLocalEsc);
    const ccApproverForUserDept = `
        EXISTS (
            SELECT 1
            FROM ConcernedSE csAw
            INNER JOIN Master_ConcernedSE mAw
              ON UPPER(LTRIM(RTRIM(ISNULL(mAw.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(csAw.SEName, N''))))
            INNER JOIN Master_EnquiryFor mefAw
              ON LTRIM(RTRIM(ISNULL(mefAw.DepartmentName, N''))) = LTRIM(RTRIM(ISNULL(mAw.Department, N'')))
            WHERE LTRIM(RTRIM(csAw.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
              AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(mAw.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) = LOWER(LTRIM(N'${uEsc}'))
              AND EXISTS (
                  SELECT 1
                  FROM QuoteApprovalSteps apCc
                  WHERE apCc.QuoteId = qtAw.ID
                    AND apCc.QuoteId > 0
                    AND ${buildCcMailIdsContainsApproverSql('mefAw', 'apCc')}
              )
        )
    `;

    return `
        EXISTS (
            SELECT 1
            FROM EnquiryQuotes qtAw
            INNER JOIN QuoteApprovalSteps apAw ON apAw.QuoteId = qtAw.ID AND apAw.QuoteId > 0
            WHERE LTRIM(RTRIM(qtAw.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
              AND (
                (${directApproverMatch})
                OR (${ccApproverForUserDept})
              )
        )
    `;
}

function buildWorkflowQuotePickSql(uEsc, uLocalEsc, columnExpr, alias) {
    const directApproverMatch = buildDirectApproverMatchSql('apPick.ApproverEmail', uEsc, uLocalEsc);
    return `
                    (
                        SELECT TOP 1 ${columnExpr}
                        FROM EnquiryQuotes qtPick
                        INNER JOIN QuoteApprovalSteps apPick ON apPick.QuoteId = qtPick.ID AND apPick.QuoteId > 0
                        WHERE LTRIM(RTRIM(qtPick.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                          AND (
                            (${directApproverMatch})
                            OR EXISTS (
                                SELECT 1
                                FROM ConcernedSE csPick
                                INNER JOIN Master_ConcernedSE mPick
                                  ON UPPER(LTRIM(RTRIM(ISNULL(mPick.FullName, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(csPick.SEName, N''))))
                                INNER JOIN Master_EnquiryFor mefPick
                                  ON LTRIM(RTRIM(ISNULL(mefPick.DepartmentName, N''))) = LTRIM(RTRIM(ISNULL(mPick.Department, N'')))
                                WHERE LTRIM(RTRIM(csPick.RequestNo)) = LTRIM(RTRIM(E.RequestNo))
                                  AND LOWER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(mPick.EmailId, N''), N' ', N''), '@almcg.com', '@almoayyedcg.com')))) = LOWER(LTRIM(N'${uEsc}'))
                                  AND EXISTS (
                                      SELECT 1
                                      FROM QuoteApprovalSteps apCcPick
                                      WHERE apCcPick.QuoteId = qtPick.ID
                                        AND apCcPick.QuoteId > 0
                                        AND ${buildCcMailIdsContainsApproverSql('mefPick', 'apCcPick')}
                                  )
                            )
                          )
                        ORDER BY qtPick.QuoteDate DESC, qtPick.ID DESC
                    ) as ${alias}`;
}

/**
 * Enquiries with saved quotes visible via approval workflow (cross-division approvers + CC-division stakeholders).
 * Intentionally ignores the Quote UI division dropdown — approvers may belong to another division than the quote author.
 */
async function runApprovalWorkflowQuoteListQuery(sqlConn, rawUserEmail, extraWhereSql = '') {
    let userEmail = rawUserEmail;
    if (userEmail) {
        userEmail = userEmail.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
    }
    const accessCtx = userEmail ? await resolvePricingAccessContext(userEmail) : null;
    if (!userEmail || !accessCtx?.user) {
        return { enquiries: [], accessCtx: accessCtx || null, userEmail };
    }
    if (accessCtx.isAdmin) {
        return { enquiries: [], accessCtx, userEmail };
    }

    const uEsc = (userEmail || '').replace(/'/g, "''");
    const uLocalEsc = ((userEmail || '').split('@')[0] || '').trim().replace(/'/g, "''");
    const accessSql = buildApprovalWorkflowQuoteAccessSql(uEsc, uLocalEsc);

    const query = `
                SELECT DISTINCT
                    E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.EnquiryDate, E.DueDate, E.Status,
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'LTRIM(RTRIM(ISNULL(qtPick.QuoteNumber, N\'\')))', 'ListQuoteRef')},
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'qtPick.QuoteDate', 'ListQuoteDate')},
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'LTRIM(RTRIM(ISNULL(qtPick.PreparedBy, N\'\')))', 'ListPreparedBy')},
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'LTRIM(RTRIM(ISNULL(qtPick.OwnJob, N\'\')))', 'ListQuoteOwnJob')},
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'ISNULL(qtPick.TotalAmount, 0)', 'ListQuoteTotalAmount')},
                    ${buildWorkflowQuotePickSql(uEsc, uLocalEsc, 'qtPick.ID', 'ApprovalWorkflowQuoteId')},
                    CAST(1 AS BIT) as ApprovalWorkflowListAccess,
                    ${quotedCustomersSub},
                    ${divisionsSub},
                    ${pricingDetailsSub},
                    ${scopedJobIdsAdmin}
                FROM EnquiryMaster E
                WHERE ${accessSql}
                ${extraWhereSql}
                ORDER BY E.DueDate DESC, E.RequestNo DESC
            `;

    try {
        const result = await sqlConn.query(query);
        return { enquiries: result.recordset || [], accessCtx, userEmail };
    } catch (err) {
        if (/Invalid object name/i.test(String(err.message || '')) && /QuoteApprovalSteps/i.test(String(err.message || ''))) {
            return { enquiries: [], accessCtx, userEmail };
        }
        throw err;
    }
}

module.exports = {
    runApprovalWorkflowQuoteListQuery,
    buildApprovalWorkflowQuoteAccessSql,
};

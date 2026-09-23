'use strict';

const { parseUserDepartments } = require('./userDepartments');

/**
 * Avoid IBMS ↔ BMS substring false positives in division matching (same rule as dashboard enquiry search).
 */
function textRefersToIbms(text) {
    return /\bibms\b/i.test(String(text || ''));
}

function textRefersToBms(text) {
    const t = String(text || '');
    if (textRefersToIbms(t)) return false;
    return /\bbms\b/i.test(t) || /\bbmp\b/i.test(t);
}

function divisionCompareKeysCompatible(divKey, otherKey) {
    const a = String(divKey || '').trim().toLowerCase();
    const b = String(otherKey || '').trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (textRefersToIbms(a) && (textRefersToBms(b) || /\bbms\b/i.test(b))) return false;
    if (textRefersToBms(a) && textRefersToIbms(b)) return false;
    if (a.length >= 3 && b.includes(a)) return true;
    if (b.length >= 3 && a.includes(b)) return true;
    return false;
}

function sqlEscapeNVarCharLiteral(s) {
    return String(s || '').replace(/'/g, "''");
}

/**
 * Optional AND-clause for EnquiryMaster (alias E) when scoping quote lists by Master_EnquiryFor.DepartmentName.
 * Supports multi-select CSV (any selected division).
 */
function buildEnquiryMasterDepartmentExistsSql(divisionFilter) {
    const tokens = parseUserDepartments(divisionFilter);
    if (!tokens.length) return '';
    const orParts = tokens.map((tok) => {
        const divEsc = sqlEscapeNVarCharLiteral(tok);
        return `(
                        LTRIM(RTRIM(ISNULL(mefDiv.DepartmentName, N''))) = LTRIM(RTRIM(N'${divEsc}'))
                        OR LTRIM(RTRIM(ISNULL(efDiv.ItemName, N''))) = LTRIM(RTRIM(N'${divEsc}'))
                      )`;
    });
    return `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryFor efDiv
                    LEFT JOIN dbo.Master_EnquiryFor mefDiv ON (
                        efDiv.ItemName = mefDiv.ItemName
                        OR efDiv.ItemName LIKE N'% - ' + mefDiv.ItemName
                        OR efDiv.ItemName LIKE N'%- ' + mefDiv.ItemName
                        OR efDiv.ItemName LIKE mefDiv.ItemName + N' %'
                    )
                    WHERE efDiv.RequestNo = E.RequestNo
                      AND (${orParts.join('\n                      OR ')})
                )`;
}

/**
 * Tie list-row joins to the session division(s) (Master_EnquiryFor.DepartmentName).
 * Multi-select CSV → OR of equals.
 */
function buildMefDepartmentNameEqualsSql(divisionFilter, masterAlias = 'MEF') {
    const tokens = parseUserDepartments(divisionFilter);
    if (!tokens.length) return '';
    const orParts = tokens.map((tok) => {
        const divEsc = sqlEscapeNVarCharLiteral(tok);
        return `LTRIM(RTRIM(ISNULL(${masterAlias}.DepartmentName, N''))) = LTRIM(RTRIM(N'${divEsc}'))`;
    });
    return `
                    AND (${orParts.join('\n                    OR ')})`;
}

/**
 * Pending list: PV row must belong to EnquiryFor under any selected division.
 */
function buildStrictPvOwnJobDivisionSql(divisionFilter) {
    const tokens = parseUserDepartments(divisionFilter);
    if (!tokens.length) return '';
    const orParts = tokens.map((tok) => {
        const divEsc = sqlEscapeNVarCharLiteral(tok);
        return `LTRIM(RTRIM(ISNULL(mefOwn.DepartmentName, N''))) = LTRIM(RTRIM(N'${divEsc}'))`;
    });
    return `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryFor efOwn
                    INNER JOIN dbo.Master_EnquiryFor mefOwn
                        ON (efOwn.ItemName = mefOwn.ItemName)
                    WHERE efOwn.RequestNo = E.RequestNo
                      AND (
                            (PV.EnquiryForID IS NOT NULL AND PV.EnquiryForID <> 0 AND PV.EnquiryForID = efOwn.ID)
                         OR (
                                (PV.EnquiryForID IS NULL OR PV.EnquiryForID = 0)
                            AND LTRIM(RTRIM(ISNULL(PV.EnquiryForItem, N''))) = LTRIM(RTRIM(ISNULL(efOwn.ItemName, N'')))
                            )
                      )
                      AND (${orParts.join('\n                      OR ')})
                )`;
}

module.exports = {
    buildEnquiryMasterDepartmentExistsSql,
    buildMefDepartmentNameEqualsSql,
    buildStrictPvOwnJobDivisionSql,
    divisionCompareKeysCompatible,
    textRefersToIbms,
    textRefersToBms,
};

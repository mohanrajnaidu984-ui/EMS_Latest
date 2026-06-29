'use strict';

/**
 * Optional AND-clause for EnquiryMaster (alias E) when scoping quote lists by Master_EnquiryFor.DepartmentName.
 * Matches pricing list division filter shape.
 */
function buildEnquiryMasterDepartmentExistsSql(divisionFilter) {
    const divTrim = (divisionFilter || '').toString().trim();
    if (!divTrim) return '';
    const divEsc = divTrim.replace(/'/g, "''");
    return `
                AND EXISTS (
                    SELECT 1
                    FROM dbo.EnquiryFor efDiv
                    INNER JOIN dbo.Master_EnquiryFor mefDiv
                        ON (efDiv.ItemName = mefDiv.ItemName)
                    WHERE efDiv.RequestNo = E.RequestNo
                      AND LTRIM(RTRIM(ISNULL(mefDiv.DepartmentName, N''))) = LTRIM(RTRIM(N'${divEsc}'))
                )`;
}

/**
 * Tie list-row joins to the session division (Master_EnquiryFor.DepartmentName) so CC users with multiple
 * divisions only see pending/quoted tuples for the selected branch — not every line they appear on CCMailIds for.
 */
function buildMefDepartmentNameEqualsSql(divisionFilter, masterAlias = 'MEF') {
    const divTrim = (divisionFilter || '').toString().trim();
    if (!divTrim) return '';
    const divEsc = divTrim.replace(/'/g, "''");
    return `
                    AND LTRIM(RTRIM(ISNULL(${masterAlias}.DepartmentName, N''))) = LTRIM(RTRIM(N'${divEsc}'))`;
}

module.exports = { buildEnquiryMasterDepartmentExistsSql, buildMefDepartmentNameEqualsSql };

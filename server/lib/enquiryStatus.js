'use strict';

/** True when EnquiryMaster.EnquiryStatus is Inactive (case-insensitive). NULL/blank = Active. */
function isInactiveEnquiryStatus(status) {
    return String(status || '').trim().toLowerCase() === 'inactive';
}

/** SQL fragment: exclude Inactive enquiries. Alias must point at EnquiryMaster. */
function sqlExcludeInactiveEnquiry(alias = 'em') {
    return ` AND (${alias}.EnquiryStatus IS NULL OR LTRIM(RTRIM(${alias}.EnquiryStatus)) = N'' OR LTRIM(RTRIM(${alias}.EnquiryStatus)) <> N'Inactive') `;
}

module.exports = {
    isInactiveEnquiryStatus,
    sqlExcludeInactiveEnquiry,
};

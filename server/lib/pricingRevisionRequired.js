'use strict';

const { sql } = require('../dbConfig');

let revisionRequiredColumnAvailable = null;

async function ensurePricingRevisionRequiredColumn() {
    if (revisionRequiredColumnAvailable === true) return true;
    try {
        const check = await sql.query`
            SELECT 1 AS ok
            FROM sys.columns
            WHERE object_id = OBJECT_ID(N'dbo.EnquiryPricingValues')
              AND name = N'RevisionRequired'
        `;
        if (check.recordset?.length) {
            revisionRequiredColumnAvailable = true;
            return true;
        }
        await sql.query`
            ALTER TABLE dbo.EnquiryPricingValues
            ADD RevisionRequired NVARCHAR(8) NULL
        `;
        revisionRequiredColumnAvailable = true;
        return true;
    } catch (err) {
        console.error('[pricingRevisionRequired] ensure column:', err.message || err);
        revisionRequiredColumnAvailable = false;
        return false;
    }
}

function isPricingRevisionRequiredYes(raw) {
    return String(raw ?? '').trim().toLowerCase() === 'yes';
}

/**
 * Clear RevisionRequired on own-job EPV rows after a quote is created for
 * enquiry + customer + lead/own job (so Quote pending drops).
 */
async function clearPricingRevisionRequiredForQuoteTuple({
    requestNo,
    ownJob,
    leadJob,
    customerName,
}) {
    const ok = await ensurePricingRevisionRequiredColumn();
    if (!ok || !requestNo) return { cleared: false };
    const own = String(ownJob || '').trim();
    const lead = String(leadJob || '').trim();
    const cust = String(customerName || '').trim();
    if (!own || !cust) return { cleared: false };
    const ownStripped = own.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
    const leadStripped = lead.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
    try {
        const result = await sql.query`
            UPDATE EnquiryPricingValues
            SET RevisionRequired = NULL
            WHERE RequestNo = ${String(requestNo)}
              AND UPPER(LTRIM(RTRIM(ISNULL(CustomerName, N'')))) = UPPER(LTRIM(RTRIM(${cust})))
              AND (
                    UPPER(LTRIM(RTRIM(ISNULL(EnquiryForItem, N'')))) = UPPER(LTRIM(RTRIM(${own})))
                 OR (
                        ${ownStripped} <> N''
                    AND UPPER(LTRIM(RTRIM(ISNULL(EnquiryForItem, N'')))) = UPPER(LTRIM(RTRIM(${ownStripped})))
                    )
                  )
              AND (
                    ${lead} = N''
                 OR UPPER(LTRIM(RTRIM(ISNULL(LeadJobName, N'')))) = UPPER(LTRIM(RTRIM(${lead})))
                 OR (
                        ${leadStripped} <> N''
                    AND UPPER(LTRIM(RTRIM(ISNULL(LeadJobName, N'')))) = UPPER(LTRIM(RTRIM(${leadStripped})))
                    )
                  )
              AND UPPER(LTRIM(RTRIM(ISNULL(RevisionRequired, N'')))) = N'YES'
        `;
        return { cleared: true, rowsAffected: result?.rowsAffected?.[0] ?? 0 };
    } catch (err) {
        console.error('[pricingRevisionRequired] clear on quote:', err.message || err);
        return { cleared: false, error: err.message };
    }
}

module.exports = {
    ensurePricingRevisionRequiredColumn,
    isPricingRevisionRequiredYes,
    clearPricingRevisionRequiredForQuoteTuple,
};

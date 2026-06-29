const fs = require('fs');
const path = require('path');

const quotesPath = path.join(__dirname, '..', 'routes', 'quotes.js');
const lines = fs.readFileSync(quotesPath, 'utf8').split(/\n/);
const body = lines.slice(143, 425).join('\n');
let out = body.replace(
    /AND \$\{noCompletedQuoteForSameTupleSql\}\s*\n\s*ORDER BY/g,
    'AND ${noCompletedQuoteForSameTupleSql}\n                ${extraWhereSql}\n                ORDER BY',
);
const header = `'use strict';

const { resolvePricingAccessContext, normalizePricingJobName } = require('./quotePricingAccess');

/**
 * Raw pending-quote enquiries (priced tuples still missing a completed quote), with optional extra WHERE on EnquiryMaster E.
 */
async function runPendingQuoteListQuery(sqlConn, rawUserEmail, extraWhereSql = '') {
`;
const footer = `
    const result = await sqlConn.query(query);
    return { enquiries: result.recordset || [], accessCtx, userEmail };
}

module.exports = runPendingQuoteListQuery;
`;
let inner = out.replace(
    /^        let \{ userEmail \} = req\.query;/m,
    '        let userEmail = rawUserEmail;',
);
inner = inner.replace(/^        console\.log\(\`\[API\] Check Pending Quotes/m, '        console.log(`[API] Pending quote list query');
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'pendingQuoteListQuery.js'), header + inner + footer);

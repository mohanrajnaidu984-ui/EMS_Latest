const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function run() {
    try {
        console.log('Connecting...');
        await sql.connect(dbConfig);

        console.log('Fetching Pending Probability List...');

        const query = `
            SELECT 
                RequestNo, ProjectName, Status, ProbabilityOption, Probability
            FROM EnquiryMaster E
            WHERE 1=1
            AND (
                (E.Status IS NULL OR E.Status = '' OR E.Status IN ('Pending', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted'))
                OR (E.Status IN('FollowUp', 'Follow-up') AND (E.ProbabilityOption IS NULL OR E.ProbabilityOption = ''))
            )
            AND (E.Status NOT IN('Won', 'Lost', 'Cancelled', 'OnHold', 'On Hold', 'Retendered') OR E.Status IS NULL OR E.Status = '')
            AND EXISTS(
                SELECT 1 FROM EnquiryQuotes Q 
                WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo)) 
                AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 0
            )
            ORDER BY EnquiryDate DESC
        `;

        const result = await sql.query(query);
        console.log(`Found ${result.recordset.length} pending items.`);

        const fs = require('fs');
        let out = '';
        out += '--- RECENT ENQUIRIES ---\n';
        if (result.recordset.length > 0) {
            out += JSON.stringify(result.recordset, null, 2);
        } else {
            out += 'No records found.';
        }

        fs.writeFileSync('diagnose_prob_out.txt', out);
        console.log('Output written to diagnose_prob_out.txt');

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();

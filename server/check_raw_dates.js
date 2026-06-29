const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function checkRawDates() {
    try {
        await connectDB();
        const result = await sql.query`SELECT RequestNo, CONVERT(VARCHAR, EnquiryDate, 120) as EnquiryDateRaw, CONVERT(VARCHAR, DueDate, 120) as DueDateRaw, CONVERT(VARCHAR, SiteVisitDate, 120) as SiteVisitDateRaw FROM EnquiryMaster WHERE RequestNo = '52'`;
        fs.writeFileSync('enq_52_raw_dates.txt', JSON.stringify(result.recordset, null, 2));
        console.log('Results written to enq_52_raw_dates.txt');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('enq_52_raw_dates.txt', 'Error: ' + err.message);
        process.exit(1);
    }
}

checkRawDates();

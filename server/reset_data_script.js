
const { sql, connectDB } = require('./dbConfig'); // Relative to server/

(async () => {
    try {
        await connectDB();
        const res = await sql.query("SELECT TOP 3 RequestNo FROM EnquiryMaster");
        if (res.recordset.length > 0) {
            const reqNos = res.recordset.map(r => `'${r.RequestNo}'`).join(',');
            await sql.query(`UPDATE EnquiryMaster SET Status='Enquiry' WHERE RequestNo IN (${reqNos})`);

            const req1 = res.recordset[0].RequestNo;
            await sql.query(`
                IF NOT EXISTS (SELECT * FROM QuoteMaster WHERE RequestNo = '${req1}')
                BEGIN
                    INSERT INTO QuoteMaster (QuoteNumber, RequestNo, QuoteDate, TotalValue, CreatedBy)
                    VALUES ('${req1}-Q1', '${req1}', DATEADD(day, -6, GETDATE()), 1000, 'System')
                END
                ELSE
                BEGIN
                    UPDATE QuoteMaster SET QuoteDate = DATEADD(day, -6, GETDATE()) WHERE RequestNo = '${req1}'
                END
            `);
            console.log(`Reset data for: ${reqNos}. Ensure ${req1} has old quote.`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
})();

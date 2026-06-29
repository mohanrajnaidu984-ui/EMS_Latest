const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT RequestNo, QuoteNumber, QuoteDate, CreatedAt, PreparedByEmail 
            FROM EnquiryQuotes 
            WHERE RequestNo = '13'
        `);
        console.log("Quotes for Req 13:");
        console.log(JSON.stringify(res.recordset, null, 2));

        const user = await new sql.Request().query(`
            SELECT Name, EmailId, Roles FROM Users WHERE EmailId LIKE 'bms.manager%' OR Name LIKE 'BMS Manager%'
        `);
        console.log("\nBMS Manager User:");
        console.log(JSON.stringify(user.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();

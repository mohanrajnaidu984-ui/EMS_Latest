const { sql, connectDB } = require('./dbConfig');

async function checkLoad() {
    await connectDB();
    const request = new sql.Request();

    // exact query from router.get('/enquiries/:id') in index.js possibly
    const query = `
        SELECT 
            RequestNo, EnquiryDate
        FROM EnquiryMaster 
        WHERE RequestNo = '11'
    `;
    const result = await request.query(query);
    console.log("Raw query from node:");
    console.table(result.recordset);
    process.exit(0);
}
checkLoad();

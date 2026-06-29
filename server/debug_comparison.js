
const { connectDB, sql } = require('./dbConfig');
require('dotenv').config();

async function run() {
    try {
        await connectDB();

        console.log('--- Master_EnquiryFor Items ---');
        const masterRes = await sql.query`SELECT ItemName, CommonMailIds FROM Master_EnquiryFor`;
        masterRes.recordset.forEach(r => console.log(`[Master] ${r.ItemName} -> ${r.CommonMailIds ? 'HasEmails' : 'NoEmails'}`));

        console.log('\n--- EnquiryFor Items (Req 42) ---');
        const reqRes = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = '42'`;
        reqRes.recordset.forEach(r => console.log(`[Req42] ${r.ItemName}`));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();

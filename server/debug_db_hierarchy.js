const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function test() {
    try {
        await connectDB();
        const result = await sql.query('SELECT * FROM EnquiryFor WHERE RequestNo = \'45\'');
        const masterRes = await sql.query('SELECT * FROM Master_EnquiryFor');

        const data = {
            enquiryFor: result.recordset,
            master: masterRes.recordset.map(r => ({ ItemName: r.ItemName, Emails: r.CommonMailIds }))
        };

        fs.writeFileSync('db_data.json', JSON.stringify(data, null, 2));
        console.log('Done writing to db_data.json');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

test();

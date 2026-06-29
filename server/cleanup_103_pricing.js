const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const requestNo = '103';

        console.log(`Cleaning up duplicate Base Price options for Request ${requestNo}...`);

        // IDs to delete (keeping the smaller ID for each pair)
        const idsToDelete = [136, 138, 141, 142];

        for (const id of idsToDelete) {
            // First delete values associated with this ID (if any)
            await sql.query`DELETE FROM EnquiryPricingValues WHERE OptionID = ${id}`;
            // Then delete the option
            await sql.query`DELETE FROM EnquiryPricingOptions WHERE ID = ${id}`;
            console.log(`Deleted Option ID ${id}`);
        }

        console.log('Cleanup complete.');

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();

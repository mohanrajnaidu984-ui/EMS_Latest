const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function debugClientData() {
    try {
        await sql.connect(config);
        console.log('Connected to database\n');

        // Check table structure first
        console.log('=== Master_ClientName Table Structure ===');
        const structure = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ClientName'
            ORDER BY ORDINAL_POSITION
        `;
        console.log('Columns:');
        structure.recordset.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });

        // Check Master_ClientName table data
        console.log('\n=== Master_ClientName Table Data ===');
        const clients = await sql.query`SELECT TOP 10 * FROM Master_ClientName`;
        console.log(`Found ${clients.recordset.length} clients:`);
        if (clients.recordset.length > 0) {
            console.log('Sample record:', JSON.stringify(clients.recordset[0], null, 2));
        }

        // Check what the API would return
        console.log('\n=== API Response Simulation ===');
        const clientsAPI = await sql.query`SELECT *, 'Client' as Category FROM Master_ClientName`;

        console.log(`Clients from API: ${clientsAPI.recordset.length}`);
        if (clientsAPI.recordset.length > 0) {
            console.log('Sample API record:', JSON.stringify(clientsAPI.recordset[0], null, 2));
        }

        // Filter clients
        const clientNames = clientsAPI.recordset.map(c => c.CompanyName);
        console.log('\nClient Names:');
        clientNames.forEach(name => console.log(`  - ${name}`));

        // Check a specific enquiry
        console.log('\n=== Sample Enquiry Data ===');
        const enq = await sql.query`SELECT TOP 5 RequestNo, ClientName, ConsultantName FROM EnquiryMaster WHERE ClientName IS NOT NULL`;
        console.log(`Found ${enq.recordset.length} enquiries with ClientName:`);
        enq.recordset.forEach(e => {
            console.log(`  - RequestNo: ${e.RequestNo}, ClientName: ${e.ClientName}, ConsultantName: ${e.ConsultantName}`);
        });

        await sql.close();
        console.log('\nDone!');
    } catch (err) {
        console.error('Error:', err.message);
        console.error('Stack:', err.stack);
    }
}

debugClientData();

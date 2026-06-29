const sql = require('mssql');
require('dotenv').config();

(async () => {
    try {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        };

        const pool = await sql.connect(config);
        console.log('Connected. Searching for "Genpact" in entire DB...');

        console.log('--- Targeted Check for Request 97 ---');

        // Check EnquiryCustomer
        const enqCust = await pool.request().query("SELECT * FROM EnquiryCustomer WHERE RequestNo = 97 OR RequestNo = '97'");
        console.log('EnquiryCustomer entries for 97:');
        console.log(enqCust.recordset);

        // Check EnquiryMaster for context
        const master = await pool.request().query("SELECT RequestNo, CustomerName, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo = '97'");
        console.log('EnquiryMaster Main Customers:');
        console.log(master.recordset);

        // Check if Genpact exists anywhere with 97
        const genpact = await pool.request().query("SELECT * FROM EnquiryCustomer WHERE CustomerName LIKE '%Genpact%'");
        console.log('All Genpact entries in EnquiryCustomer:');
        console.log(genpact.recordset);


        const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");

        for (const t of tables.recordset) {
            const tableName = t.TABLE_NAME;

            // Get text columns
            const cols = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${tableName}' 
                AND DATA_TYPE IN ('varchar', 'nvarchar', 'text', 'char', 'nchar')
            `);

            if (cols.recordset.length === 0) continue;

            const conditions = cols.recordset.map(c => `[${c.COLUMN_NAME}] LIKE '%Genpact%'`).join(' OR ');
            const query = `SELECT * FROM [${tableName}] WHERE ${conditions}`;

            try {
                const res = await pool.request().query(query);
                if (res.recordset.length > 0) {
                    console.log(`\n!!! FOUND IN TABLE: ${tableName} !!!`);
                    console.log(res.recordset);
                }
            } catch (err) {
                // Ignore conversion errors etc
            }
        }
        console.log('\nSearch complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        setTimeout(() => process.exit(), 1000);
    }
})();

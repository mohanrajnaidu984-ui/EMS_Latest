const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function diagnose() {
    try {
        let pool = await sql.connect(config);
        console.log('Connected to DB');

        console.log('--- Checking for triggers on EnquiryMaster ---');
        const triggers = await pool.request().query(`
            SELECT 
                t.name AS TriggerName,
                OBJECT_NAME(t.parent_id) AS TableName,
                m.definition AS TriggerDefinition
            FROM sys.triggers t
            JOIN sys.sql_modules m ON t.object_id = m.object_id
            WHERE OBJECT_NAME(t.parent_id) = 'EnquiryMaster'
        `);

        if (triggers.recordset.length === 0) {
            console.log('No triggers found on EnquiryMaster');
        } else {
            triggers.recordset.forEach(trig => {
                console.log(`Trigger: ${trig.TriggerName}`);
                console.log('Definition:');
                console.log(trig.TriggerDefinition);
                console.log('-----------------------------------');
            });
        }

        process.exit(0);
    } catch (err) {
        console.error('Diagnosis failed:', err);
        process.exit(1);
    }
}

diagnose();

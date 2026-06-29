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

        console.log('--- Checking for triggers on Notifications ---');
        const triggers = await pool.request().query(`
            SELECT 
                t.name AS TriggerName,
                OBJECT_NAME(t.parent_id) AS TableName,
                m.definition AS TriggerDefinition
            FROM sys.triggers t
            JOIN sys.sql_modules m ON t.object_id = m.object_id
            WHERE OBJECT_NAME(t.parent_id) = 'Notifications'
        `);

        if (triggers.recordset.length === 0) {
            console.log('No triggers found on Notifications');
        } else {
            triggers.recordset.forEach(trig => {
                console.log(`Trigger: ${trig.TriggerName}`);
                console.log('Definition:');
                console.log(trig.TriggerDefinition);
                console.log('-----------------------------------');
            });
        }

        console.log('--- Checking if Notifications is a View ---');
        const view = await pool.request().query(`
            SELECT definition 
            FROM sys.sql_modules 
            WHERE object_id = OBJECT_ID('Notifications')
        `);
        if (view.recordset.length > 0) {
            console.log('Notifications is a VIEW/OBJECT with definition:');
            console.log(view.recordset[0].definition);
        } else {
            console.log('Notifications is likely a base table.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Diagnosis failed:', err);
        process.exit(1);
    }
}

diagnose();

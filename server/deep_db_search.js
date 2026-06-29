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

async function run() {
    try {
        await sql.connect(config);
        console.log('Connected to Database.');

        const searches = [
            {
                name: 'SQL Modules (Views, Procedures, Triggers, Functions)',
                query: `SELECT OBJECT_NAME(m.object_id) as ObjectName, m.definition 
                        FROM sys.sql_modules m 
                        WHERE CHARINDEX('TRIM(', REPLACE(REPLACE(m.definition, 'LTRIM(', 'XXXXX'), 'RTRIM(', 'YYYYY')) > 0`
            },
            {
                name: 'Computed Columns',
                query: `SELECT OBJECT_NAME(object_id) as TableName, name as ColumnName, definition 
                        FROM sys.computed_columns 
                        WHERE CHARINDEX('TRIM(', REPLACE(REPLACE(definition, 'LTRIM(', 'XXXXX'), 'RTRIM(', 'YYYYY')) > 0`
            },
            {
                name: 'Check Constraints',
                query: `SELECT OBJECT_NAME(parent_object_id) as TableName, name as ConstraintName, definition 
                        FROM sys.check_constraints 
                        WHERE CHARINDEX('TRIM(', REPLACE(REPLACE(definition, 'LTRIM(', 'XXXXX'), 'RTRIM(', 'YYYYY')) > 0`
            },
            {
                name: 'Default Constraints',
                query: `SELECT OBJECT_NAME(parent_object_id) as TableName, name as ConstraintName, definition 
                        FROM sys.default_constraints 
                        WHERE CHARINDEX('TRIM(', REPLACE(REPLACE(definition, 'LTRIM(', 'XXXXX'), 'RTRIM(', 'YYYYY')) > 0`
            }
        ];

        for (const search of searches) {
            console.log(`\n--- Searching ${search.name} ---`);
            const result = await sql.query(search.query);
            if (result.recordset.length > 0) {
                console.table(result.recordset);
            } else {
                console.log('No matches found.');
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Database search failed:', err);
        process.exit(1);
    }
}

run();

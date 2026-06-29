const { connectDB, sql } = require('./dbConfig');

async function recreateTable() {
    try {
        await connectDB();
        console.log('Connected to database');

        // Drop if exists
        await sql.query`IF OBJECT_ID('dbo.QuoteTemplates', 'U') IS NOT NULL DROP TABLE dbo.QuoteTemplates`;
        console.log('Dropped existing table');

        // Recreate
        const createTableQuery = `
            CREATE TABLE QuoteTemplates (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                TemplateName NVARCHAR(255) NOT NULL,
                ClausesConfig NVARCHAR(MAX) NOT NULL, -- JSON string
                CreatedBy NVARCHAR(255),
                CreatedAt DATETIME DEFAULT GETDATE()
            );
        `;
        await sql.query(createTableQuery);
        console.log('QuoteTemplates table recreated successfully.');

    } catch (err) {
        console.error('Error recreating table:', err);
    } finally {
        await sql.close();
    }
}

recreateTable();

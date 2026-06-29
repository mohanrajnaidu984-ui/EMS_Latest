const { connectDB, sql } = require('./dbConfig');

async function createQuoteTemplatesTable() {
    try {
        await connectDB();
        console.log('Connected to database');

        const createTableQuery = `
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QuoteTemplates' AND xtype='U')
        BEGIN
            CREATE TABLE QuoteTemplates (
                ID INT IDENTITY(1,1) PRIMARY KEY,
                TemplateName NVARCHAR(255) NOT NULL,
                ClausesConfig NVARCHAR(MAX) NOT NULL, -- JSON string
                CreatedBy NVARCHAR(255),
                CreatedAt DATETIME DEFAULT GETDATE()
            );
            PRINT 'QuoteTemplates table created successfully.';
        END
        ELSE
        BEGIN
            PRINT 'QuoteTemplates table already exists.';
        END
        `;

        await sql.query(createTableQuery);

    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        await sql.close();
        console.log('Connection closed');
    }
}

createQuoteTemplatesTable();

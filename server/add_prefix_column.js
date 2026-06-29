const { sql, connectDB } = require('./dbConfig');

async function addPrefixColumn() {
    try {
        await connectDB();
        console.log('Connected to database...');

        // Check if column exists
        const check = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Master_ReceivedFrom' AND COLUMN_NAME = 'Prefix'
        `;

        if (check.recordset.length === 0) {
            console.log('Adding Prefix column to Master_ReceivedFrom...');
            await sql.query`ALTER TABLE Master_ReceivedFrom ADD Prefix NVARCHAR(20)`;
            console.log('Column added successfully.');
        } else {
            console.log('Prefix column already exists.');
        }

    } catch (err) {
        console.error('Error adding column:', err);
    } finally {
        process.exit(0);
    }
}

addPrefixColumn();

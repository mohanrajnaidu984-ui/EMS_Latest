const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        console.log('Connected. Preparing to clear transactional data...');

        const safeTables = [
            'Master_ConcernedSE',
            'Master_EnquiryFor',
            'MasterEnquiryItems',
            'Customers',
            'Contacts',
            'Users', // Check if this is master or legacy
            'Master_AdditionalEmail',
            'Master_CustomerName',
            'Master_ClientName',
            'Master_ConsultantName',
            'sysdiagrams'
        ];

        // Get all tables
        const result = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`;
        const allTables = result.recordset.map(r => r.TABLE_NAME);

        const tablesToDelete = allTables.filter(t => !safeTables.includes(t));

        console.log('--- TABLES TO CLEAR ---');
        tablesToDelete.forEach(t => console.log(t));

        // Delete logic
        for (const table of tablesToDelete) {
            console.log(`Clearing ${table}...`);
            try {
                // Try TRUNCATE first, fallback to DELETE if FK constraints fail
                await sql.query(`DELETE FROM [${table}]`);
                // Using DELETE because TRUNCATE often fails with FKs unless we drop them. 
                // Also DELETE allows DBCC CHECKIDENT reseed if needed.

                // Reseed identity if exists
                try {
                    await sql.query(`DBCC CHECKIDENT ('[${table}]', RESEED, 0)`);
                } catch (e) {
                    // Ignore if no identity column
                }
            } catch (err) {
                console.error(`Error clearing ${table}:`, err.message);
            }
        }

        console.log('--- CLEANUP COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

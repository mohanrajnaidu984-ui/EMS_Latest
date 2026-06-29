const { sql, connectDB } = require('./dbConfig');

const clearData = async () => {
    try {
        await connectDB();
        console.log('Connected to database. Clearing data...');

        const tables = [
            'EnquiryCustomers',
            'EnquiryContacts',
            'EnquiryTypes',
            'EnquirySelectedItems',
            'EnquiryConcernedSEs',
            'EnquiryAttachments',
            'Enquiries',
            'Customers',
            'Contacts',
            'Users',
            'MasterEnquiryItems'
        ];

        for (const table of tables) {
            try {
                // Delete all rows
                await sql.query(`DELETE FROM ${table}`);
                console.log(`Cleared table: ${table}`);

                // Reset Identity (Auto-increment) if applicable
                // Note: Enquiries uses RequestNo (string) as PK, so no reseed needed for it.
                // Others likely use IDENTITY.
                if (table !== 'Enquiries') {
                    try {
                        await sql.query(`DBCC CHECKIDENT ('${table}', RESEED, 0)`);
                        console.log(`Reseeded table: ${table}`);
                    } catch (reseedErr) {
                        // Ignore error if table doesn't have identity column
                        // console.log(`Skipped reseed for ${table} (might not have identity)`);
                    }
                }

            } catch (err) {
                console.error(`Error clearing ${table}:`, err.message);
            }
        }

        console.log('All data cleared successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

clearData();

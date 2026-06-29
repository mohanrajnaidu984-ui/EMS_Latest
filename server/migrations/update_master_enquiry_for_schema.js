const { connectDB, sql } = require('../dbConfig');

const run = async () => {
    try {
        await connectDB();

        // Add columns if they don't exist
        const columnsToAdd = [
            { name: 'DivisionCode', type: 'NVARCHAR(100)' },
            { name: 'DepartmentCode', type: 'NVARCHAR(100)' },
            { name: 'Phone', type: 'NVARCHAR(50)' },
            { name: 'Address', type: 'NVARCHAR(MAX)' },
            { name: 'FaxNo', type: 'NVARCHAR(50)' },
            { name: 'CompanyLogo', type: 'NVARCHAR(MAX)' }
        ];

        for (const col of columnsToAdd) {
            const check = await sql.query`
                SELECT COL_LENGTH('Master_EnquiryFor', ${col.name}) AS ColLength
            `;
            if (check.recordset[0].ColLength === null) {
                console.log(`Adding column ${col.name}...`);
                await sql.query(`ALTER TABLE Master_EnquiryFor ADD ${col.name} ${col.type}`);
            } else {
                console.log(`Column ${col.name} already exists.`);
            }
        }

        console.log('Schema update completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error updating schema:', err);
        process.exit(1);
    }
};

run();

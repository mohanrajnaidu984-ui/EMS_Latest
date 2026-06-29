const { sql, connectDB } = require('./dbConfig');

const verifyTables = async () => {
    try {
        await connectDB();
        const tables = ['EnquiryCustomers', 'EnquiryContacts', 'EnquiryTypes', 'EnquirySelectedItems', 'EnquiryConcernedSEs'];

        for (const table of tables) {
            const result = await sql.query(`SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${table}'`);
            if (result.recordset.length > 0) {
                console.log(`[OK] Table '${table}' exists.`);
            } else {
                console.log(`[MISSING] Table '${table}' does NOT exist.`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyTables();

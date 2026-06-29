const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();

        const tablesToCheck = [
            'EnquiryMaster',
            'EnquiryFor',
            'ConcernedSE', // Transactional
            'Master_ConcernedSE' // Master
        ];

        console.log('--- VERIFICATION ---');
        for (const table of tablesToCheck) {
            try {
                const res = await sql.query(`SELECT COUNT(*) as count FROM [${table}]`);
                console.log(`${table}: ${res.recordset[0].count} records`);
            } catch (e) {
                console.log(`${table}: Error/Not Found`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

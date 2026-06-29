const { sql, connectDB } = require('./dbConfig');

async function debugUser() {
    try {
        await connectDB();
        console.log("Checking user 'BMS'...");

        const user = await sql.query(`
            SELECT * FROM Master_ConcernedSE WHERE FullName = 'BMS'
        `);

        if (user.recordset.length > 0) {
            console.log(user.recordset[0]);
            console.log(`Department: '${user.recordset[0].Department}'`);

            // Check Master_EnquiryFor for this department
            const dept = await sql.query(`
                SELECT * FROM Master_EnquiryFor WHERE DepartmentName = '${user.recordset[0].Department}'
             `);
            console.log(`Division found in Master_EnquiryFor: ${dept.recordset.length}`);

        } else {
            console.log("User 'BMS' not found by FullName. Trying email...");
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

debugUser();

const { connectDB, sql } = require('./server/dbConfig');

async function checkLogic() {
    try {
        await connectDB();
        const userName = "Civil";

        console.log(`Checking logic for user: ${userName}`);

        // 1. Role (is just the name)
        console.log(`1. Role: ${userName}`);

        // 2. Division
        const divisionRes = await sql.query`SELECT Department FROM Master_ConcernedSE WHERE FullName=${userName}`;
        const division = divisionRes.recordset[0]?.Department;
        console.log(`2. Division (from Master_ConcernedSE): ${division}`);

        if (division) {
            // 3. Company
            const companyRes = await sql.query`SELECT TOP 1 CompanyName FROM Master_EnquiryFor WHERE DepartmentName=${division}`;
            const company = companyRes.recordset[0]?.CompanyName;
            console.log(`3. Company (from Master_EnquiryFor): ${company}`);
        } else {
            console.log("Division is null, cannot fetch company.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkLogic();

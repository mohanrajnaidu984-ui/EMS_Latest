const { sql, connectDB } = require('./dbConfig');

async function checkDetails() {
    await connectDB();
    try {
        console.log('--- User Details for "Electrical" ---');
        const userRes = await sql.query`SELECT FullName, EmailId, Roles FROM Master_ConcernedSE WHERE FullName LIKE '%Electrical%'`;
        console.log(userRes.recordset);

        if (userRes.recordset.length > 0) {
            const userEmail = userRes.recordset[0].EmailId;
            console.log(`\n--- Searching Master_EnquiryFor for ItemName 'Electrical' ---`);
            const masterRes = await sql.query`SELECT ItemName, CommonMailIds, CCMailIds FROM Master_EnquiryFor WHERE ItemName = 'Electrical'`;
            console.log(masterRes.recordset);

            console.log(`\n--- Searching EnquiryFor for RequestNo 45 ---`);
            const enqRes = await sql.query`
                SELECT EF.RequestNo, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds
                FROM EnquiryFor EF
                LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
                WHERE EF.RequestNo = '45'
            `;
            console.log(enqRes.recordset);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkDetails();

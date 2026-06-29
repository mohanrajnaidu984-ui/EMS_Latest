const { sql, connectDB } = require('./dbConfig');

async function checkHierarchy() {
    try {
        await connectDB();
        const res = await sql.query`
            SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.DepartmentName 
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '21'
            ORDER BY EF.ID
        `;
        console.log('Hierarchy for Request 21:');
        console.table(res.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkHierarchy();

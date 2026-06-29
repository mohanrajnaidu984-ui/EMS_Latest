const { sql, connectDB } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const res = await new sql.Request().query(`
            SELECT em.RequestNo, em.ProjectName, em.CreatedBy, 
                   STUFF((SELECT ', ' + SEName FROM ConcernedSE WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as ConcernedSE,
                   STUFF((SELECT ', ' + ItemName FROM EnquiryFor WHERE RequestNo = em.RequestNo FOR XML PATH('')), 1, 2, '') as EnquiryFor
            FROM EnquiryMaster em
            WHERE RequestNo IN ('13', '15', '17')
        `);
        console.log(JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
};

run();

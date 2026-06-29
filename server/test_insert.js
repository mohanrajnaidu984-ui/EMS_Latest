const { sql, connectDB } = require('./dbConfig');

async function testInsert() {
    await connectDB();
    const request = new sql.Request();
    request.input('EnqDate', sql.VarChar(10), '2026-07-15');
    const result = await request.query(`
        DECLARE @T TABLE (TestDate DATETIME);
        INSERT INTO @T (TestDate) VALUES (@EnqDate);
        SELECT TestDate as RawDate, CONVERT(VARCHAR, TestDate, 120) as StrDate FROM @T;
    `);
    console.table(result.recordset);
    process.exit(0);
}
testInsert();

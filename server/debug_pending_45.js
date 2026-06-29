const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const config = {
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};
const userEmail = 'electrical@almoayyedcg.com';
sql.connect(config).then(async () => {
    const query = `
        SELECT DISTINCT 
            E.RequestNo, E.ProjectName, E.CustomerName, PO.CustomerName as PO_Customer, MEF.DivisionCode 
        FROM EnquiryMaster E
        JOIN EnquiryPricingOptions PO ON E.RequestNo = PO.RequestNo
        JOIN EnquiryPricingValues PV ON PO.ID = PV.OptionID
        JOIN EnquiryFor EF ON E.RequestNo = EF.RequestNo AND (EF.ItemName = PO.ItemName OR EF.ItemName LIKE PO.ItemName + '%')
        JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
        LEFT JOIN EnquiryQuotes Q ON Q.RequestNo = E.RequestNo AND Q.ToName = PO.CustomerName AND Q.QuoteNumber LIKE '%/' + MEF.DivisionCode + '/%'
        WHERE PV.Price > 0
        AND (MEF.CommonMailIds LIKE '%${userEmail}%' OR MEF.CCMailIds LIKE '%${userEmail}%')
        AND Q.ID IS NULL
        AND E.RequestNo = '45'
    `;
    const res = await sql.query(query);
    console.log('Pending Result for 45:', JSON.stringify(res.recordset, null, 2));
    process.exit(0);
});

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function inspect() {
    try {
        await sql.connect(config);

        const requestNo = '107';

        console.log(`Inspecting Pricing Options for ${requestNo}...`);

        const result = await sql.query`
            SELECT ID, OptionName, ItemName, CustomerName, SortOrder
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
            ORDER BY CustomerName, ItemName, SortOrder
        `;

        console.table(result.recordset);

        console.log('--- Duplicate Check ---');
        // Find duplicates
        const map = new Map();
        result.recordset.forEach(r => {
            const key = `${r.CustomerName}|${r.ItemName}|${r.OptionName}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(r.ID);
        });

        // Check for values usage
        console.log('--- Checking Value Usage ---');
        for (const [key, ids] of map.entries()) {
            if (ids.length > 1) {
                console.log(`Checking duplicates for ${key}: ${ids.join(', ')}`);
                const usage = await sql.query`
                    SELECT OptionID, COUNT(*) as Count 
                    FROM EnquiryPricingValues 
                    WHERE OptionID IN (${ids[0]}, ${ids[1]}, ${ids[2] || 0}, ${ids[3] || 0}) 
                    GROUP BY OptionID
                `;
                console.table(usage.recordset);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

inspect();

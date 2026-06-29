const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'debug_log.txt');

function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

async function debugClientData() {
    try {
        if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

        await connectDB();
        log("Connected DB");

        log("Searching for enquiries for 'Indian School Bahrain'...");

        const enquiries = await sql.query(`
            SELECT RequestNo, WonOrderValue, ClientName, ProjectName
            FROM EnquiryMaster
            WHERE ClientName = 'Indian School Bahrain' AND Status = 'Won'
        `);

        log(`Found ${enquiries.recordset.length} enquiries.`);

        for (const enq of enquiries.recordset) {
            log(`\n--- Enquiry: ${enq.RequestNo} ---`);
            log(`WonOrderValue: ${enq.WonOrderValue}`);

            const items = await sql.query(`
                SELECT ID, ParentID, ItemName
                FROM EnquiryFor
                WHERE RequestNo = '${enq.RequestNo}'
            `);

            log("Items:");
            items.recordset.forEach(item => {
                log(`  ID: ${item.ID}, ParentID: ${item.ParentID} (${typeof item.ParentID}), Name: ${item.ItemName}`);
            });

            // Check prices directly
            const prices = await sql.query(`
                SELECT EF_Inner.ItemName, EPV.Price, EF_Inner.ParentID
                FROM EnquiryFor EF_Inner
                OUTER APPLY (
                    SELECT TOP 1 Price 
                    FROM EnquiryPricingValues 
                    WHERE RequestNo = EF_Inner.RequestNo 
                      AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                    ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = '${enq.RequestNo}'
            `);
            log("Prices for all items:");
            prices.recordset.forEach(p => {
                log(`  Name: ${p.ItemName}, Price: ${p.Price}, ParentID: ${p.ParentID}`);
            });

            // Logic Check: ParentID IS NULL
            const nullQuery = await sql.query(`
                SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                FROM EnquiryFor EF_Inner
                OUTER APPLY (
                    SELECT TOP 1 Price 
                    FROM EnquiryPricingValues 
                    WHERE RequestNo = EF_Inner.RequestNo 
                      AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                    ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = '${enq.RequestNo}'
                  AND EF_Inner.ParentID IS NULL
            `);
            log(`Sum (ParentID IS NULL): ${nullQuery.recordset[0].Total}`);

            // Logic Check: ParentID IS NULL OR 0
            const zeroQuery = await sql.query(`
                SELECT SUM(ISNULL(EPV.Price, 0)) as Total
                FROM EnquiryFor EF_Inner
                OUTER APPLY (
                    SELECT TOP 1 Price 
                    FROM EnquiryPricingValues 
                    WHERE RequestNo = EF_Inner.RequestNo 
                      AND (EnquiryForID = EF_Inner.ID OR EnquiryForItem = EF_Inner.ItemName)
                    ORDER BY OptionID DESC
                ) EPV
                WHERE EF_Inner.RequestNo = '${enq.RequestNo}'
                  AND (EF_Inner.ParentID IS NULL OR EF_Inner.ParentID = 0)
            `);
            log(`Sum (ParentID IS NULL OR 0): ${zeroQuery.recordset[0].Total}`);
        }

    } catch (err) {
        log('Error: ' + err);
    } finally {
        process.exit(0);
    }
}

debugClientData();
